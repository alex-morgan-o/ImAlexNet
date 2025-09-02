import { describe, it, expect, beforeEach } from 'vitest'
import { AnalyzerAgent, AnalysisResult } from '../analyzerAgent'
import { AgentContext } from '../types'

describe('AnalyzerAgent', () => {
  let agent: AnalyzerAgent
  let mockContext: AgentContext

  beforeEach(() => {
    agent = new AnalyzerAgent()
    mockContext = global.createMockContext()
  })

  describe('constructor', () => {
    it('should create analyzer agent with correct properties', () => {
      expect(agent.type).toBe('analyzer')
      expect(agent.capabilities).toContain('intent-analysis')
      expect(agent.capabilities).toContain('context-understanding')
      expect(agent.capabilities).toContain('requirement-extraction')
    })
  })

  describe('execute - successful analysis', () => {
    it('should analyze simple conversation intent', async () => {
      const mockLLMResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            userIntent: 'User wants to greet',
            intentCategory: 'conversation',
            requiredCapabilities: [],
            complexity: 'simple',
            contextRequirements: {
              needsWorkspace: false,
              needsFileAccess: false,
              needsUserInput: false
            },
            confidence: 0.95,
            reasoning: 'Simple greeting'
          })
        }
      }
      
      global.mockTauriInvoke.mockResolvedValue(mockLLMResponse)

      const result = await agent.execute('Hello!', mockContext)

      expect(result.success).toBe(true)
      const analysis = result.result as AnalysisResult
      expect(analysis.intentCategory).toBe('conversation')
      expect(analysis.complexity).toBe('simple')
      expect(analysis.contextRequirements.needsWorkspace).toBe(false)
    })

    it('should analyze file operation intent', async () => {
      const mockLLMResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            userIntent: 'Create a file',
            intentCategory: 'file_operation',
            requiredCapabilities: ['file-operations'],
            complexity: 'medium',
            contextRequirements: {
              needsWorkspace: true,
              needsFileAccess: true,
              needsUserInput: false,
              accessType: 'write'
            },
            confidence: 0.9,
            reasoning: 'File creation requires workspace access'
          })
        }
      }
      
      global.mockTauriInvoke.mockResolvedValue(mockLLMResponse)

      const result = await agent.execute('Create a file called test.txt', mockContext)

      expect(result.success).toBe(true)
      const analysis = result.result as AnalysisResult
      expect(analysis.intentCategory).toBe('file_operation')
      expect(analysis.requiredCapabilities).toContain('file-operations')
      expect(analysis.contextRequirements.needsWorkspace).toBe(true)
      expect(analysis.contextRequirements.accessType).toBe('write')
    })

    it('should analyze command execution intent', async () => {
      const mockLLMResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            userIntent: 'List directory contents',
            intentCategory: 'command_execution',
            requiredCapabilities: ['command-execution'],
            complexity: 'simple',
            contextRequirements: {
              needsWorkspace: true,
              needsFileAccess: false,
              needsUserInput: false
            },
            confidence: 0.95,
            reasoning: 'Simple directory listing command'
          })
        }
      }
      
      global.mockTauriInvoke.mockResolvedValue(mockLLMResponse)

      const result = await agent.execute('ls -la', mockContext)

      expect(result.success).toBe(true)
      const analysis = result.result as AnalysisResult
      expect(analysis.intentCategory).toBe('command_execution')
      expect(analysis.requiredCapabilities).toContain('command-execution')
    })
  })

  describe('execute - fallback analysis', () => {
    it('should use fallback analysis when LLM fails', async () => {
      global.mockTauriInvoke.mockRejectedValue(new Error('LLM failed'))

      const result = await agent.execute('Create a file test.txt', mockContext)

      expect(result.success).toBe(true)
      const analysis = result.result as AnalysisResult
      expect(analysis.intentCategory).toBe('file_operation')
      expect(analysis.confidence).toBe(0.6) // Lower confidence for fallback
      expect(analysis.reasoning).toBe('Fallback analysis using pattern matching')
    })

    it('should use fallback for unparseable LLM response', async () => {
      global.mockTauriInvoke.mockResolvedValue({
        success: true,
        data: { message: 'invalid json response' }
      })

      const result = await agent.execute('run command', mockContext)

      expect(result.success).toBe(true)
      const analysis = result.result as AnalysisResult
      expect(analysis.intentCategory).toBe('command_execution')
      expect(analysis.reasoning).toBe('Fallback analysis using pattern matching')
    })
  })

  describe('fallback analysis patterns', () => {
    beforeEach(() => {
      // Force fallback by making LLM fail
      global.mockTauriInvoke.mockRejectedValue(new Error('Force fallback'))
    })

    it('should detect file operations', async () => {
      const testCases = [
        'create a file',
        'read the directory',
        'write to file.txt'
      ]

      for (const prompt of testCases) {
        const result = await agent.execute(prompt, mockContext)
        const analysis = result.result as AnalysisResult
        expect(analysis.intentCategory).toBe('file_operation')
        expect(analysis.contextRequirements.needsWorkspace).toBe(true)
        expect(analysis.contextRequirements.needsFileAccess).toBe(true)
      }
    })

    it('should detect command execution', async () => {
      const testCases = [
        'run ls command',
        'execute npm install',
        'please run this command'
      ]

      for (const prompt of testCases) {
        const result = await agent.execute(prompt, mockContext)
        const analysis = result.result as AnalysisResult
        expect(analysis.intentCategory).toBe('command_execution')
        expect(analysis.requiredCapabilities).toContain('command-execution')
      }
    })

    it('should detect information requests', async () => {
      const testCases = [
        'analyze this code',
        'find all functions',
        'search for TODO comments'
      ]

      for (const prompt of testCases) {
        const result = await agent.execute(prompt, mockContext)
        const analysis = result.result as AnalysisResult
        expect(analysis.intentCategory).toBe('information_request')
        expect(analysis.requiredCapabilities).toContain('analysis')
      }
    })

    it('should default to conversation for simple prompts', async () => {
      const result = await agent.execute('hello', mockContext)
      const analysis = result.result as AnalysisResult
      
      expect(analysis.intentCategory).toBe('conversation')
      expect(analysis.complexity).toBe('simple')
      expect(analysis.contextRequirements.needsWorkspace).toBe(false)
    })

    it('should detect complexity based on prompt length', async () => {
      const longPrompt = 'a'.repeat(150) // > 100 characters
      const result = await agent.execute(longPrompt, mockContext)
      const analysis = result.result as AnalysisResult
      
      expect(analysis.complexity).toBe('medium')
    })
  })

  describe('generateNextActions', () => {
    beforeEach(() => {
      global.mockTauriInvoke.mockRejectedValue(new Error('Force fallback'))
    })

    it('should suggest direct response for simple conversation', async () => {
      const result = await agent.execute('hello', mockContext)
      
      expect(result.nextActions).toContain('respond-directly')
    })

    it('should suggest execution plan for file operations', async () => {
      const result = await agent.execute('create a file', mockContext)
      
      expect(result.nextActions).toContain('create-execution-plan')
    })

    it('should suggest detailed plan for complex tasks', async () => {
      // Force complex categorization
      const mockLLMResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            userIntent: 'Complex multi-step task',
            intentCategory: 'complex_task',
            requiredCapabilities: ['multiple'],
            complexity: 'complex',
            contextRequirements: { needsWorkspace: true, needsFileAccess: true, needsUserInput: false },
            confidence: 0.9,
            reasoning: 'Complex task'
          })
        }
      }
      global.mockTauriInvoke.mockResolvedValue(mockLLMResponse)

      const result = await agent.execute('Complex task', mockContext)
      
      expect(result.nextActions).toContain('create-detailed-plan')
    })
  })

  describe('context integration', () => {
    it('should include conversation history in analysis', async () => {
      const contextWithHistory = {
        ...mockContext,
        conversationHistory: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi! How can I help?' }
        ]
      }

      global.mockTauriInvoke.mockResolvedValue({
        success: true,
        data: {
          message: JSON.stringify({
            userIntent: 'Follow-up question',
            intentCategory: 'conversation',
            requiredCapabilities: [],
            complexity: 'simple',
            contextRequirements: { needsWorkspace: false, needsFileAccess: false, needsUserInput: false },
            confidence: 0.9,
            reasoning: 'Context-aware response'
          })
        }
      })

      const result = await agent.execute('What did we discuss?', contextWithHistory)

      expect(result.success).toBe(true)
      // Verify that the LLM was called with context
      expect(global.mockTauriInvoke).toHaveBeenCalled()
    })

    it('should include workspace information in analysis', async () => {
      global.mockTauriInvoke.mockResolvedValue({
        success: true,
        data: {
          message: JSON.stringify({
            userIntent: 'File operation with workspace context',
            intentCategory: 'file_operation',
            requiredCapabilities: ['file-operations'],
            complexity: 'simple',
            contextRequirements: { needsWorkspace: false, needsFileAccess: true, needsUserInput: false },
            confidence: 0.95,
            reasoning: 'Has workspace context'
          })
        }
      })

      await agent.execute('List files', mockContext)

      // Check that workspace info was included in the prompt
      const lastCall = global.mockTauriInvoke.mock.calls[global.mockTauriInvoke.mock.calls.length - 1]
      const messages = lastCall[1].messages
      const userMessage = messages.find((m: any) => m.role === 'user')
      
      expect(userMessage.content).toContain('Working Directory: /test/workspace')
    })
  })
})