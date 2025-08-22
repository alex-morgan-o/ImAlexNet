import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChainOfThoughtProcessor } from '../chainOfThoughtProcessor'
import { toolAvailability } from '../tooling'
import * as tooling from '../tooling'

// Mock Tauri invoke to avoid real backend calls
vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async (cmd: string, args?: any) => {
      if (cmd === 'get_tool_availability') {
        // Default: nothing available unless tests set toolAvailability directly
        return { claude: false, codex: false, gemini: false }
      }
      if (cmd === 'execute_shell_command') {
        return { success: true, stdout: 'ok', stderr: '', exit_code: 0 }
      }
      if (cmd === 'cerebras_chat') {
        const messages = args?.messages || []
        const first = messages[0]?.content || ''
        // Validator path
        if (typeof first === 'string' && first.includes('You are a strict validator')) {
          return {
            success: true,
            data: { message: '{"verdict":"pass","reasons":[],"required_changes":[]}', model: 'mock', usage: {} },
          }
        }
        // JSON formatter path
        if (typeof first === 'string' && first.includes('You are a JSON formatter')) {
          const json = {
            intention_analysis: 'Test analysis',
            step_plan: ['step 1', 'step 2'],
            final_response: 'All set!',
            needs_user_path: false,
            path_request: undefined,
            commands_to_execute: [
              { command: 'echo', args: ['hello'], explanation: 'say hello' },
            ],
          }
          return {
            success: true,
            data: { message: JSON.stringify(json), model: 'mock', usage: {} },
          }
        }
        // Drafting path
        return {
          success: true,
          data: { message: 'Here is a helpful draft response.', model: 'mock', usage: {} },
        }
      }
      throw new Error(`Unknown invoke command: ${cmd}`)
    }),
  }
})

describe('ChainOfThoughtProcessor', () => {
  beforeEach(() => {
    // Reset tool availability before each test
    toolAvailability.value = { claude: false, codex: false, gemini: false }
  })

  it('returns a draft prompt for complex tasks when a tool is available', async () => {
    toolAvailability.value = { claude: false, codex: true, gemini: false }
    // Prevent refresh from overriding our manual availability
    vi.spyOn(tooling, 'refreshToolAvailability').mockResolvedValue(undefined as any)
    const events: string[] = []
    const res = await ChainOfThoughtProcessor.processUserMessage(
      'Please implement a multi-step refactor of my Vue components and generate a roadmap for the migration. Also consider architecture.',
      [],
      (e) => events.push(e.phase),
    )

    expect(res.success).toBe(true)
    expect(res.needs_prompt_review).toBe(true)
    expect(res.selected_tool).toBe('codex')
    expect(res.final_response).toContain('AlexNet Drafted CLI Prompt')
    expect(res.commands_to_execute).toEqual([])
    // Progress events should include streaming markers
    expect(events).toContain('analysis_start')
    expect(events).toContain('analysis_done')
  })

  it('detects approval and builds execution command for prior draft', async () => {
    const draftBody = [
      '--- AlexNet Drafted CLI Prompt (Tool: claude) ---',
      'Task: Do complex things',
      'Context (most recent messages):',
      '(no prior context)',
      '--- End Draft ---',
    ].join('\n')
    const context = [
      { role: 'assistant', content: draftBody },
    ]

    const res = await ChainOfThoughtProcessor.processUserMessage('approve', context)

    expect(res.success).toBe(true)
    expect(res.selected_tool).toBe('claude')
    expect(res.commands_to_execute?.length).toBe(1)
    const cmd = res.commands_to_execute![0]
    expect(cmd.command).toBe('claude')
    expect(Array.isArray(cmd.args)).toBe(true)
    expect(cmd.args[0]).toContain('Task: Do complex things')
  })

  it('runs the simple pipeline for non-complex tasks and returns structured output', async () => {
    // With no tools available, a simple request should go through draft->validate->format pipeline
    const res = await ChainOfThoughtProcessor.processUserMessage('Say hello to the user.')

    expect(res.success).toBe(true)
    expect(res.final_response).toBe('All set!')
    expect(res.commands_to_execute?.[0]).toMatchObject({ command: 'echo', args: ['hello'] })
  })

  it('sanitizes, unwraps, and repairs JSON-like strings', () => {
    const ansi = '\u001b[31m{"a":1}\u001b[0m'
    const fenced = '```json\n{"a":1}\n```'
    const quoted = '"{\\"a\\":1}"'
    const truncated = '{"a": [1, 2, 3' // missing closers

    expect((ChainOfThoughtProcessor as any).sanitizeJsonLike(ansi)).toBe('{"a":1}')
    expect((ChainOfThoughtProcessor as any).sanitizeJsonLike(fenced)).toBe('{"a":1}')
    expect((ChainOfThoughtProcessor as any).maybeUnwrapQuotedJson(quoted)).toBe('{"a":1}')
    const repaired = (ChainOfThoughtProcessor as any).repairTruncatedJson(truncated)
    expect(() => JSON.parse(repaired)).not.toThrow()
  })

  it('executes shell commands via backend invoke wrapper', async () => {
    const results = await ChainOfThoughtProcessor.executeCommands([
      { command: 'echo', args: ['hello'], explanation: 'test' },
    ])
    expect(results[0].success).toBe(true)
    expect(results[0].output).toBe('ok')
  })
})
