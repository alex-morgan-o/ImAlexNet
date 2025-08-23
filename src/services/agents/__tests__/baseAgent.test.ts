import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BaseAgent } from '../baseAgent'
import { AgentType, AgentContext, AgentResponse } from '../types'

// Create a concrete implementation for testing
class TestAgent extends BaseAgent {
  constructor() {
    super(AgentType.EXECUTOR, ['test-capability'])
  }

  async execute(prompt: string, context: AgentContext): Promise<AgentResponse> {
    return this.createSuccessResponse({ test: 'result' }, 'Test execution')
  }
}

describe('BaseAgent', () => {
  let agent: TestAgent
  let mockContext: AgentContext

  beforeEach(() => {
    agent = new TestAgent()
    mockContext = global.createMockContext()
  })

  describe('constructor', () => {
    it('should create agent with correct properties', () => {
      expect(agent.type).toBe(AgentType.EXECUTOR)
      expect(agent.capabilities).toEqual(['test-capability'])
      expect(agent.id).toMatch(/executor-\d+-\w+/)
    })

    it('should accept custom id', () => {
      const customAgent = new (class extends BaseAgent {
        constructor() {
          super(AgentType.ANALYZER, ['test'], 'custom-id')
        }
        async execute(): Promise<AgentResponse> {
          return this.createSuccessResponse({})
        }
      })()
      
      expect(customAgent.id).toBe('custom-id')
    })
  })

  describe('callLLM', () => {
    it('should call LLM with correct parameters', async () => {
      const mockResponse = global.createMockLLMResponse(true, 'test response')
      global.mockTauriInvoke.mockResolvedValue(mockResponse)

      const result = await agent['callLLM']({
        messages: [{ role: 'user', content: 'test' }]
      })

      expect(global.mockTauriInvoke).toHaveBeenCalledWith('cerebras_chat', {
        messages: [{ role: 'user', content: 'test' }],
        model: 'qwen-3-coder-480b',
        max_tokens: 65536,
        temperature: 0.3,
        stream: false
      })

      expect(result).toEqual(mockResponse)
    })

    it('should handle LLM call failures', async () => {
      global.mockTauriInvoke.mockRejectedValue(new Error('Network error'))

      const result = await agent['callLLM']({
        messages: [{ role: 'user', content: 'test' }]
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
    })
  })

  describe('emitProgress', () => {
    it('should call onProgress callback when provided', () => {
      const mockOnProgress = vi.fn()
      const contextWithProgress = { ...mockContext, onProgress: mockOnProgress }
      
      agent['emitProgress']({ phase: 'log', text: 'test' }, contextWithProgress)
      
      expect(mockOnProgress).toHaveBeenCalledWith({ phase: 'log', text: 'test' })
    })

    it('should not fail when onProgress is not provided', () => {
      const contextWithoutProgress = { ...mockContext, onProgress: undefined }
      
      expect(() => {
        agent['emitProgress']({ phase: 'log', text: 'test' }, contextWithoutProgress)
      }).not.toThrow()
    })
  })

  describe('createSuccessResponse', () => {
    it('should create valid success response', () => {
      const result = { test: 'data' }
      const thoughts = 'test thoughts'
      const nextActions = ['action1', 'action2']

      const response = agent['createSuccessResponse'](result, thoughts, nextActions)

      expect(response.success).toBe(true)
      expect(response.result).toEqual(result)
      expect(response.thoughts).toBe(thoughts)
      expect(response.nextActions).toEqual(nextActions)
      expect(response.agentId).toBe(agent.id)
      expect(response.agentType).toBe(agent.type)
      expect(response.metadata?.capabilities).toEqual(agent.capabilities)
    })
  })

  describe('createErrorResponse', () => {
    it('should create valid error response', () => {
      const error = 'test error'
      const thoughts = 'error thoughts'

      const response = agent['createErrorResponse'](error, thoughts)

      expect(response.success).toBe(false)
      expect(response.result).toBeNull()
      expect(response.error).toBe(error)
      expect(response.thoughts).toBe(thoughts)
      expect(response.agentId).toBe(agent.id)
    })
  })

  describe('parseJsonResponse', () => {
    it('should parse valid JSON', () => {
      const jsonString = '{"test": "value"}'
      const result = agent['parseJsonResponse'](jsonString)
      
      expect(result).toEqual({ test: 'value' })
    })

    it('should handle JSON with markdown fences', () => {
      const jsonString = '```json\n{"test": "value"}\n```'
      const result = agent['parseJsonResponse'](jsonString)
      
      expect(result).toEqual({ test: 'value' })
    })

    it('should extract JSON from mixed content', () => {
      const jsonString = 'Some text before {"test": "value"} some text after'
      const result = agent['parseJsonResponse'](jsonString)
      
      expect(result).toEqual({ test: 'value' })
    })

    it('should throw error for invalid JSON', () => {
      const jsonString = 'not json at all'
      
      expect(() => {
        agent['parseJsonResponse'](jsonString)
      }).toThrow(/No valid JSON found/)
    })
  })

  describe('buildContextSummary', () => {
    it('should build context summary from conversation history', () => {
      const context = {
        ...mockContext,
        conversationHistory: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' }
        ]
      }

      const summary = agent['buildContextSummary'](context)
      
      expect(summary).toBe('user: Hello\nassistant: Hi there!\nuser: How are you?')
    })

    it('should handle empty conversation history', () => {
      const summary = agent['buildContextSummary'](mockContext)
      expect(summary).toBe('')
    })
  })

  describe('getWorkspaceInfo', () => {
    it('should format workspace information', () => {
      const info = agent['getWorkspaceInfo'](mockContext)
      
      expect(info).toContain('Working Directory: /test/workspace')
      expect(info).toContain('Available Tools: file-operations, command-execution')
    })

    it('should handle missing workspace state', () => {
      const contextWithoutWorkspace = { ...mockContext, workspaceState: undefined }
      const info = agent['getWorkspaceInfo'](contextWithoutWorkspace)
      
      expect(info).toBe('No workspace information available.')
    })
  })

  describe('healthCheck', () => {
    it('should return healthy status when LLM is accessible', async () => {
      global.mockTauriInvoke.mockResolvedValue(global.createMockLLMResponse())

      const health = await agent.healthCheck()

      expect(health.healthy).toBe(true)
      expect(health.details.agentId).toBe(agent.id)
      expect(health.details.agentType).toBe(agent.type)
      expect(health.details.llmConnectivity).toBe(true)
    })

    it('should return unhealthy status when LLM is not accessible', async () => {
      global.mockTauriInvoke.mockRejectedValue(new Error('Connection failed'))

      const health = await agent.healthCheck()

      expect(health.healthy).toBe(false)
      expect(health.details.error).toBe('Connection failed')
    })
  })
})