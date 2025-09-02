import { describe, it, expect, beforeEach } from 'vitest'
import { ExecutorAgent, ExecutionResult } from '../executorAgent'
import { AgentContext, PlanStep, AgentType } from '../types'
import { AnalysisResult } from '../analyzerAgent'

describe('ExecutorAgent', () => {
  let agent: ExecutorAgent
  let mockContext: AgentContext
  let mockAnalysis: AnalysisResult

  beforeEach(() => {
    agent = new ExecutorAgent()
    mockContext = global.createMockContext()
    mockAnalysis = {
      userIntent: 'Test user intent',
      intentCategory: 'file_operation',
      requiredCapabilities: ['file-operations'],
      complexity: 'medium',
      contextRequirements: {
        needsWorkspace: true,
        needsFileAccess: true,
        needsUserInput: false
      },
      confidence: 0.9,
      reasoning: 'Test analysis'
    }
  })

  describe('constructor', () => {
    it('should create executor agent with correct properties', () => {
      expect(agent.type).toBe('executor')
      expect(agent.capabilities).toContain('command-execution')
      expect(agent.capabilities).toContain('file-operations')
      expect(agent.capabilities).toContain('conversation')
    })
  })

  describe('execute - direct analysis input', () => {
    it('should handle analysis object input', async () => {
      const mockCommandResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            commands: [
              {
                command: 'touch',
                args: ['test.txt'],
                explanation: 'Create test file'
              }
            ],
            response: 'Test response'
          })
        }
      }

      const mockShellResponse = {
        success: true,
        stdout: 'File created successfully',
        stderr: '',
        exit_code: 0
      }

      global.mockTauriInvoke
        .mockResolvedValueOnce(mockCommandResponse)
        .mockResolvedValueOnce(mockShellResponse)

      const result = await agent.execute(JSON.stringify(mockAnalysis), mockContext)

      expect(result.success).toBe(true)
      const executionResult = result.result as ExecutionResult
      expect(executionResult.finalResponse).toBeTruthy()
    })

    it('should handle direct prompt input', async () => {
      global.mockTauriInvoke.mockResolvedValue({
        success: true,
        data: { message: 'Direct response' }
      })

      const result = await agent.execute('Hello world', mockContext)

      expect(result.success).toBe(true)
      const executionResult = result.result as ExecutionResult
      expect(executionResult.finalResponse).toBe('Direct response')
    })
  })

  describe('executeConversation', () => {
    it('should generate conversational response', async () => {
      const conversationAnalysis = {
        ...mockAnalysis,
        intentCategory: 'conversation' as const
      }

      global.mockTauriInvoke.mockResolvedValue({
        success: true,
        data: { message: 'Hello! How can I help you today?' }
      })

      const result = await agent.execute(JSON.stringify(conversationAnalysis), mockContext)

      expect(result.success).toBe(true)
      const executionResult = result.result as ExecutionResult
      expect(executionResult.success).toBe(true)
      expect(executionResult.finalResponse).toBe('Hello! How can I help you today?')
      expect(executionResult.result.type).toBe('conversation')
    })

    it('should handle LLM failure in conversation', async () => {
      const conversationAnalysis = {
        ...mockAnalysis,
        intentCategory: 'conversation' as const
      }

      global.mockTauriInvoke.mockResolvedValue({
        success: false,
        error: 'LLM failed'
      })

      const result = await agent.execute(JSON.stringify(conversationAnalysis), mockContext)

      expect(result.success).toBe(false)
    })
  })

  describe('executeFileOperation', () => {
    it('should execute file operations with workspace', async () => {
      const mockCommandResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            commands: [
              {
                command: 'touch',
                args: ['test.txt'],
                explanation: 'Create test file',
                working_dir: '/test/workspace'
              }
            ],
            response: 'Creating test file'
          })
        }
      }

      const mockShellResponse = {
        success: true,
        stdout: 'File created successfully',
        stderr: '',
        exit_code: 0
      }

      global.mockTauriInvoke
        .mockResolvedValueOnce(mockCommandResponse) // Command generation
        .mockResolvedValueOnce(mockShellResponse)   // Command execution

      const result = await agent.execute(JSON.stringify(mockAnalysis), mockContext)

      expect(result.success).toBe(true)
      const executionResult = result.result as ExecutionResult
      expect(executionResult.success).toBe(true)
      expect(executionResult.commands).toHaveLength(1)
      expect(executionResult.commands![0].command).toBe('touch')
    })

    it('should request path when workspace missing', async () => {
      const contextWithoutWorkspace = {
        ...mockContext,
        workspaceState: {
          ...mockContext.workspaceState,
          workingDirectory: undefined
        }
      }

      const result = await agent.execute(JSON.stringify(mockAnalysis), contextWithoutWorkspace)

      expect(result.success).toBe(true)
      const executionResult = result.result as ExecutionResult
      expect(executionResult.needsUserPath).toBe(true)
      expect(executionResult.pathRequest?.access).toBe('read_write')
      expect(executionResult.finalResponse).toContain('folder to work with')
    })

    it('should handle command generation failure', async () => {
      global.mockTauriInvoke.mockResolvedValue({
        success: false,
        error: 'Failed to generate commands'
      })

      const result = await agent.execute(JSON.stringify(mockAnalysis), mockContext)

      expect(result.success).toBe(false)
    })
  })

  describe('executeCommandExecution', () => {
    it('should execute shell commands', async () => {
      const commandAnalysis = {
        ...mockAnalysis,
        intentCategory: 'command_execution' as const,
        requiredCapabilities: ['command-execution']
      }

      const mockCommandResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            commands: [
              {
                command: 'ls',
                args: ['-la'],
                explanation: 'List directory contents'
              }
            ],
            response: 'Listing directory contents'
          })
        }
      }

      const mockShellResponse = {
        success: true,
        stdout: 'total 8\ndrwxr-xr-x  3 user  staff   96 Jan  1 12:00 .\ndrwxr-xr-x  4 user  staff  128 Jan  1 12:00 ..',
        stderr: '',
        exit_code: 0
      }

      global.mockTauriInvoke
        .mockResolvedValueOnce(mockCommandResponse)
        .mockResolvedValueOnce(mockShellResponse)

      const result = await agent.execute(JSON.stringify(commandAnalysis), mockContext)

      expect(result.success).toBe(true)
      const executionResult = result.result as ExecutionResult
      expect(executionResult.commands).toHaveLength(1)
      expect(executionResult.commands![0].command).toBe('ls')
    })

    it('should handle command execution failure', async () => {
      const commandAnalysis = {
        ...mockAnalysis,
        intentCategory: 'command_execution' as const
      }

      const mockCommandResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            commands: [
              {
                command: 'nonexistent-command',
                args: [],
                explanation: 'This will fail'
              }
            ],
            response: 'Executing command'
          })
        }
      }

      const mockShellResponse = {
        success: false,
        stdout: '',
        stderr: 'command not found: nonexistent-command',
        exit_code: 127
      }

      global.mockTauriInvoke
        .mockResolvedValueOnce(mockCommandResponse)
        .mockResolvedValueOnce(mockShellResponse)

      const result = await agent.execute(JSON.stringify(commandAnalysis), mockContext)

      expect(result.success).toBe(true) // Execution succeeds even if command fails
      const executionResult = result.result as ExecutionResult
      expect(executionResult.result.commandResults[0].success).toBe(false)
      expect(executionResult.result.commandResults[0].error).toContain('command not found')
    })
  })

  describe('executeInformationRequest', () => {
    it('should handle direct information response', async () => {
      const infoAnalysis = {
        ...mockAnalysis,
        intentCategory: 'information_request' as const
      }

      const mockResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            needsCommands: false,
            response: 'Here is the information you requested.'
          })
        }
      }

      global.mockTauriInvoke.mockResolvedValue(mockResponse)

      const result = await agent.execute(JSON.stringify(infoAnalysis), mockContext)

      expect(result.success).toBe(true)
      const executionResult = result.result as ExecutionResult
      expect(executionResult.result.type).toBe('information_direct')
      expect(executionResult.finalResponse).toBe('Here is the information you requested.')
    })

    it('should handle information request with commands', async () => {
      const infoAnalysis = {
        ...mockAnalysis,
        intentCategory: 'information_request' as const
      }

      const mockInfoResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            needsCommands: true,
            commands: [
              {
                command: 'find',
                args: ['.', '-name', '*.js'],
                explanation: 'Find JavaScript files'
              }
            ],
            response: 'Searching for JavaScript files'
          })
        }
      }

      const mockShellResponse = {
        success: true,
        stdout: './src/main.js\n./src/utils.js',
        stderr: '',
        exit_code: 0
      }

      global.mockTauriInvoke
        .mockResolvedValueOnce(mockInfoResponse)
        .mockResolvedValueOnce(mockShellResponse)

      const result = await agent.execute(JSON.stringify(infoAnalysis), mockContext)

      expect(result.success).toBe(true)
      const executionResult = result.result as ExecutionResult
      expect(executionResult.result.type).toBe('information_with_commands')
      expect(executionResult.commands).toHaveLength(1)
    })

    it('should fallback to direct response on parse error', async () => {
      const infoAnalysis = {
        ...mockAnalysis,
        intentCategory: 'information_request' as const
      }

      global.mockTauriInvoke.mockResolvedValue({
        success: true,
        data: { message: 'Direct response without JSON structure' }
      })

      const result = await agent.execute(JSON.stringify(infoAnalysis), mockContext)

      expect(result.success).toBe(true)
      const executionResult = result.result as ExecutionResult
      expect(executionResult.result.type).toBe('information_direct')
    })
  })

  describe('path input handling', () => {
    it('should handle path input requests', async () => {
      const pathStep: PlanStep = {
        id: 'test-step',
        stepNumber: 1,
        description: 'Request path input',
        agentType: AgentType.EXECUTOR,
        requiredCapabilities: ['user-interaction'],
        inputs: {
          requestType: 'path-input',
          reason: 'Need workspace path',
          accessType: 'read_write'
        },
        status: 'pending'
      }

      const result = await agent.execute(JSON.stringify(pathStep), mockContext)

      expect(result.success).toBe(true)
      const executionResult = result.result as ExecutionResult
      expect(executionResult.needsUserPath).toBe(true)
      expect(executionResult.pathRequest?.access).toBe('read_write')
    })

    it('should handle workspace setup requests', async () => {
      const workspaceStep: PlanStep = {
        id: 'test-step',
        stepNumber: 1,
        description: 'Set up workspace',
        agentType: AgentType.EXECUTOR,
        requiredCapabilities: ['workspace-setup'],
        inputs: {
          requestType: 'workspace-setup'
        },
        status: 'pending'
      }

      const result = await agent.execute(JSON.stringify(workspaceStep), mockContext)

      expect(result.success).toBe(true)
      const executionResult = result.result as ExecutionResult
      expect(executionResult.needsUserPath).toBe(true)
      expect(executionResult.finalResponse).toContain('workspace')
    })
  })

  describe('command execution utilities', () => {
    it('should execute multiple commands', async () => {
      const commands = [
        {
          command: 'echo',
          args: ['hello'],
          explanation: 'Print hello'
        },
        {
          command: 'echo',
          args: ['world'],
          explanation: 'Print world'
        }
      ]

      global.mockTauriInvoke
        .mockResolvedValueOnce({
          success: true,
          stdout: 'hello',
          stderr: '',
          exit_code: 0
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: 'world',
          stderr: '',
          exit_code: 0
        })

      const results = await agent['executeCommands'](commands)

      expect(results).toHaveLength(2)
      expect(results[0].success).toBe(true)
      expect(results[0].output).toBe('hello')
      expect(results[1].success).toBe(true)
      expect(results[1].output).toBe('world')
    })

    it('should handle command execution errors', async () => {
      const commands = [
        {
          command: 'failing-command',
          args: [],
          explanation: 'This will fail'
        }
      ]

      global.mockTauriInvoke.mockRejectedValue(new Error('Command failed'))

      const results = await agent['executeCommands'](commands)

      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBe('Command failed')
    })
  })

  describe('error handling', () => {
    it('should handle step execution errors gracefully', async () => {
      global.mockTauriInvoke.mockRejectedValue(new Error('Execution failed'))

      const result = await agent.execute(JSON.stringify(mockAnalysis), mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to generate commands')
    })

    it('should handle invalid step data', async () => {
      const result = await agent.execute('invalid json', mockContext)

      expect(result.success).toBe(true) // Falls back to direct prompt handling
    })

    it('should handle missing required fields', async () => {
      const incompleteAnalysis = {
        userIntent: 'Test'
        // Missing required fields
      }

      global.mockTauriInvoke.mockResolvedValue({
        success: true,
        data: { message: 'Handled gracefully with defaults' }
      })

      const result = await agent.execute(JSON.stringify(incompleteAnalysis), mockContext)

      expect(result.success).toBe(true) // Should handle gracefully
    })
  })

  describe('context integration', () => {
    it('should use working directory from context', async () => {
      const mockCommandResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            commands: [
              {
                command: 'ls',
                args: [],
                explanation: 'List files',
                working_dir: mockContext.workspaceState?.workingDirectory
              }
            ],
            response: 'Listing files'
          })
        }
      }

      global.mockTauriInvoke
        .mockResolvedValueOnce(mockCommandResponse)
        .mockResolvedValueOnce({
          success: true,
          stdout: 'file1.txt\nfile2.txt',
          stderr: '',
          exit_code: 0
        })

      const result = await agent.execute(JSON.stringify(mockAnalysis), mockContext)

      expect(result.success).toBe(true)
      expect(global.mockTauriInvoke).toHaveBeenCalledWith(
        'execute_shell_command',
        expect.objectContaining({
          workingDir: '/test/workspace'
        })
      )
    })

    it('should include conversation history in context', async () => {
      const contextWithHistory = {
        ...mockContext,
        conversationHistory: [
          { role: 'user', content: 'Previous message' }
        ]
      }

      global.mockTauriInvoke.mockResolvedValue({
        success: true,
        data: { message: 'Response with context' }
      })

      await agent.execute('Hello', contextWithHistory)

      // Verify LLM was called with conversation history
      const lastCall = global.mockTauriInvoke.mock.calls[global.mockTauriInvoke.mock.calls.length - 1]
      const messages = lastCall[1].messages
      
      expect(messages.length).toBeGreaterThan(1)
      expect(messages.some((m: any) => m.content === 'Previous message')).toBe(true)
    })
  })
})