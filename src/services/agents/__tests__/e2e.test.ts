import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getAgentManager } from '../agentManager'
import { AgentManager } from '../agentManager'
import type { AgentResponse } from '../types'

describe('End-to-End Agent System Tests', () => {
  let agentManager: AgentManager
  
  beforeEach(async () => {
    vi.clearAllMocks()
    agentManager = getAgentManager()
    await agentManager.initialize()
    // Clear any leftover plans
    const orchestrator = agentManager['orchestrator']
    orchestrator.clearCompletedPlans()
  })

  describe('Simple Conversation Flow', () => {
    it('should handle greeting with direct response', async () => {
      global.mockTauriInvoke.mockResolvedValue({
        success: true,
        data: { message: 'Hello! How can I help you today?' }
      })

      const result = await agentManager.processUserInput(
        'Hello!',
        [],
        { workingDirectory: '/test/workspace', availableTools: ['file-operations', 'command-execution'] }
      )

      expect(result.success).toBe(true)
      expect(result.result.final_response).toBeTruthy()
    })

    it('should handle follow-up questions with conversation history', async () => {
      const conversationHistory = [
        { role: 'user' as const, content: 'Hello!' },
        { role: 'assistant' as const, content: 'Hi! How can I help you?' }
      ]

      global.mockTauriInvoke.mockResolvedValue({
        success: true,
        data: { message: 'I can help with various tasks. What would you like to do?' }
      })

      const result = await agentManager.processUserInput(
        'What can you help me with?',
        conversationHistory,
        { workingDirectory: '/test/workspace', availableTools: ['file-operations'] }
      )

      expect(result.success).toBe(true)
      expect(result.result.final_response).toBeTruthy()
    })
  })

  describe('File Operation Flow', () => {
    it('should create file when workspace is available', async () => {
      const mockAnalysisResponse = {
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
              needsUserInput: false
            },
            confidence: 0.9,
            reasoning: 'File creation task'
          })
        }
      }

      const mockCommandResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            commands: [{
              command: 'touch',
              args: ['test.txt'],
              explanation: 'Create test file',
              working_dir: '/test/workspace'
            }],
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
        .mockResolvedValueOnce(mockAnalysisResponse) // Analysis
        .mockResolvedValueOnce(mockCommandResponse)  // Command generation
        .mockResolvedValueOnce(mockShellResponse)    // Command execution

      const result = await agentManager.processUserInput(
        'Create a file called test.txt',
        [],
        { workingDirectory: '/test/workspace', availableTools: ['file-operations'] }
      )

      expect(result.success).toBe(true)
      expect(result.result.commands_to_execute).toHaveLength(1)
      expect(result.result.commands_to_execute[0].command).toBe('touch')
      expect(result.result.final_response).toContain('Creating test file')
    })

    it('should request path when workspace is missing', async () => {
      const mockAnalysisResponse = {
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
              needsUserInput: false
            },
            confidence: 0.9,
            reasoning: 'File creation needs workspace'
          })
        }
      }

      global.mockTauriInvoke.mockResolvedValue(mockAnalysisResponse)

      const result = await agentManager.processUserInput(
        'Create a file called test.txt',
        [],
        { workingDirectory: undefined, availableTools: ['file-operations'] }
      )

      expect(result.success).toBe(true)
      expect(result.result.needs_user_path).toBe(true)
      expect(result.result.path_request?.access).toBe('read_write')
      expect(result.result.final_response).toContain('workspace')
    })
  })

  describe('Command Execution Flow', () => {
    it('should execute shell commands successfully', async () => {
      const mockAnalysisResponse = {
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
            reasoning: 'Simple directory listing'
          })
        }
      }

      const mockCommandResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            commands: [{
              command: 'ls',
              args: ['-la'],
              explanation: 'List directory contents with details'
            }],
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
        .mockResolvedValueOnce(mockAnalysisResponse)
        .mockResolvedValueOnce(mockCommandResponse)
        .mockResolvedValueOnce(mockShellResponse)

      const result = await agentManager.processUserInput(
        'ls -la',
        [],
        { workingDirectory: '/test/workspace', availableTools: ['command-execution'] }
      )

      expect(result.success).toBe(true)
      expect(result.result.commands_to_execute).toHaveLength(1)
      expect(result.result.commands_to_execute[0].command).toBe('ls')
      expect(result.result.final_response).toBe('Listing directory contents')
    })

    it('should handle command execution failures gracefully', async () => {
      const mockAnalysisResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            userIntent: 'Run failing command',
            intentCategory: 'command_execution',
            requiredCapabilities: ['command-execution'],
            complexity: 'simple',
            contextRequirements: {
              needsWorkspace: true,
              needsFileAccess: false,
              needsUserInput: false
            },
            confidence: 0.8,
            reasoning: 'Command execution'
          })
        }
      }

      const mockCommandResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            commands: [{
              command: 'nonexistent-command',
              args: [],
              explanation: 'This command does not exist'
            }],
            response: 'Attempting to run command'
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
        .mockResolvedValueOnce(mockAnalysisResponse)
        .mockResolvedValueOnce(mockCommandResponse)
        .mockResolvedValueOnce(mockShellResponse)

      const result = await agentManager.processUserInput(
        'nonexistent-command',
        [],
        { workingDirectory: '/test/workspace', availableTools: ['command-execution'] }
      )

      expect(result.success).toBe(true)
      expect(result.result.commands_to_execute).toHaveLength(1)
      expect(result.result.final_response).toBe('Attempting to run command')
    })
  })

  describe('Information Request Flow', () => {
    it('should handle direct information requests', async () => {
      const mockAnalysisResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            userIntent: 'Get system information',
            intentCategory: 'information_request',
            requiredCapabilities: ['information-processing'],
            complexity: 'simple',
            contextRequirements: {
              needsWorkspace: false,
              needsFileAccess: false,
              needsUserInput: false
            },
            confidence: 0.9,
            reasoning: 'Direct information request'
          })
        }
      }

      const mockInfoResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            needsCommands: false,
            response: 'Here is the system information you requested.'
          })
        }
      }

      global.mockTauriInvoke
        .mockResolvedValueOnce(mockAnalysisResponse)
        .mockResolvedValueOnce(mockInfoResponse)

      const result = await agentManager.processUserInput(
        'What is the system information?',
        [],
        { workingDirectory: '/test/workspace', availableTools: ['information-processing'] }
      )

      expect(result.success).toBe(true)
      expect(result.result.final_response).toBe('Here is the system information you requested.')
    })

    it('should handle information requests requiring commands', async () => {
      const mockAnalysisResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            userIntent: 'Find JavaScript files',
            intentCategory: 'information_request',
            requiredCapabilities: ['information-processing', 'command-execution'],
            complexity: 'medium',
            contextRequirements: {
              needsWorkspace: true,
              needsFileAccess: true,
              needsUserInput: false
            },
            confidence: 0.85,
            reasoning: 'Information request requiring file search'
          })
        }
      }

      const mockInfoResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            needsCommands: true,
            commands: [{
              command: 'find',
              args: ['.', '-name', '*.js'],
              explanation: 'Find all JavaScript files'
            }],
            response: 'Searching for JavaScript files'
          })
        }
      }

      const mockShellResponse = {
        success: true,
        stdout: './src/main.js\n./src/utils.js\n./test/helper.js',
        stderr: '',
        exit_code: 0
      }

      global.mockTauriInvoke
        .mockResolvedValueOnce(mockAnalysisResponse)
        .mockResolvedValueOnce(mockInfoResponse)
        .mockResolvedValueOnce(mockShellResponse)

      const result = await agentManager.processUserInput(
        'Find all JavaScript files in the project',
        [],
        { workingDirectory: '/test/workspace', availableTools: ['information-processing', 'command-execution'] }
      )

      expect(result.success).toBe(true)
      expect(result.result.commands_to_execute).toHaveLength(1)
      expect(result.result.commands_to_execute[0].command).toBe('find')
      expect(result.result.final_response).toBe('Searching for JavaScript files')
    })
  })

  describe('Complex Multi-Step Task Flow', () => {
    it('should handle complex tasks with multiple agents', async () => {
      const mockAnalysisResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            userIntent: 'Set up a new project',
            intentCategory: 'complex_task',
            requiredCapabilities: ['file-operations', 'command-execution'],
            complexity: 'complex',
            contextRequirements: {
              needsWorkspace: true,
              needsFileAccess: true,
              needsUserInput: false
            },
            confidence: 0.8,
            reasoning: 'Multi-step project setup'
          })
        }
      }

      const mockPlanResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            description: 'Project setup plan',
            estimatedSteps: 3,
            steps: [
              {
                stepNumber: 1,
                description: 'Create project directory',
                agentType: 'executor',
                requiredCapabilities: ['file-operations'],
                inputs: { executionType: 'file_operation' }
              },
              {
                stepNumber: 2,
                description: 'Initialize package.json',
                agentType: 'executor',
                requiredCapabilities: ['command-execution'],
                inputs: { executionType: 'command_execution' }
              },
              {
                stepNumber: 3,
                description: 'Install dependencies',
                agentType: 'executor',
                requiredCapabilities: ['command-execution'],
                inputs: { executionType: 'command_execution' }
              }
            ]
          })
        }
      }

      const mockExecutionResponses = [
        {
          success: true,
          result: {
            success: true,
            finalResponse: 'Created project directory',
            result: { type: 'file_operation' }
          }
        },
        {
          success: true,
          result: {
            success: true,
            finalResponse: 'Initialized package.json',
            result: { type: 'command_execution' }
          }
        },
        {
          success: true,
          result: {
            success: true,
            finalResponse: 'Installed dependencies',
            result: { type: 'command_execution' }
          }
        }
      ]

      let executionCallCount = 0
      global.mockTauriInvoke
        .mockImplementation(async (command) => {
          if (command === 'cerebras_chat') {
            if (executionCallCount === 0) {
              return mockAnalysisResponse
            } else if (executionCallCount === 1) {
              return mockPlanResponse
            } else {
              return mockExecutionResponses[executionCallCount - 2]
            }
          }
          executionCallCount++
          return { success: true }
        })

      const result = await agentManager.processUserInput(
        'Set up a new React project with TypeScript',
        [],
        { workingDirectory: '/test/workspace', availableTools: ['file-operations', 'command-execution'] }
      )

      expect(result.success).toBe(true)
      expect(result.result.final_response).toBeTruthy()
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should fallback to legacy system when agent system fails', async () => {
      global.mockTauriInvoke.mockRejectedValue(new Error('Complete system failure'))

      const result = await agentManager.processUserInput(
        'Test prompt',
        [],
        { workingDirectory: '/test/workspace', availableTools: ['file-operations'] }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Complete system failure')
    })

    it('should handle partial failures gracefully', async () => {
      const mockAnalysisResponse = {
        success: true,
        data: {
          message: JSON.stringify({
            userIntent: 'Test task',
            intentCategory: 'file_operation',
            requiredCapabilities: ['file-operations'],
            complexity: 'medium',
            contextRequirements: {
              needsWorkspace: true,
              needsFileAccess: true,
              needsUserInput: false
            },
            confidence: 0.9,
            reasoning: 'Test task'
          })
        }
      }

      global.mockTauriInvoke
        .mockResolvedValueOnce(mockAnalysisResponse)
        .mockRejectedValue(new Error('Execution failed'))

      const result = await agentManager.processUserInput(
        'Create a test file',
        [],
        { workingDirectory: '/test/workspace', availableTools: ['file-operations'] }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('failed')
    })
  })

  describe('System Health and Status', () => {
    it('should report system health correctly', async () => {
      global.mockTauriInvoke.mockResolvedValue({
        success: true,
        data: { message: 'Health check passed' }
      })

      const health = await agentManager.getSystemHealth()

      expect(health.healthy).toBe(true)
      expect(health.details.agentCount).toBeGreaterThan(0)
      expect(health.details.orchestrationAgent.healthy).toBe(true)
    })

    it('should report unhealthy status when LLM is unavailable', async () => {
      global.mockTauriInvoke.mockRejectedValue(new Error('LLM unavailable'))

      const health = await agentManager.getSystemHealth()

      expect(health.healthy).toBe(false)
      expect(health.details.orchestrationAgent.healthy).toBe(false)
      expect(health.details.orchestrationAgent.error).toBe('LLM unavailable')
    })

    it('should provide system status information', () => {
      const status = agentManager.getSystemStatus()

      expect(status.initialized).toBe(true)
      expect(status.registeredAgents).toHaveLength(4) // analyzer, planner, executor, orchestration
      expect(status.activeAgents).toHaveLength(4)
      expect(status.activePlans).toHaveLength(0)
    })
  })

  describe('Performance and Resource Management', () => {
    it('should handle concurrent requests without conflicts', async () => {
      global.mockTauriInvoke.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return {
          success: true,
          data: { message: 'Concurrent response' }
        }
      })

      const promises = [
        agentManager.processUserInput('Request 1', [], { workingDirectory: '/test', availableTools: [] }),
        agentManager.processUserInput('Request 2', [], { workingDirectory: '/test', availableTools: [] }),
        agentManager.processUserInput('Request 3', [], { workingDirectory: '/test', availableTools: [] })
      ]

      const results = await Promise.all(promises)

      results.forEach(result => {
        expect(result.success).toBe(true)
      })
    })

    it('should clean up resources after task completion', async () => {
      const initialStatus = agentManager.getSystemStatus()
      const initialPlanCount = initialStatus.activePlans

      global.mockTauriInvoke.mockResolvedValue({
        success: true,
        data: { message: 'Task completed' }
      })

      await agentManager.processUserInput(
        'Simple task',
        [],
        { workingDirectory: '/test', availableTools: [] }
      )

      const finalStatus = agentManager.getSystemStatus()
      expect(finalStatus.activePlans.length).toBe(initialPlanCount.length)
    })
  })

  describe('Integration with Chat Interface', () => {
    it('should maintain conversation context across multiple interactions', async () => {
      let conversationHistory = []

      global.mockTauriInvoke.mockResolvedValue({
        success: true,
        data: { message: 'Context-aware response' }
      })

      // First interaction
      const result1 = await agentManager.processUserInput(
        'Hello, I need help with a project',
        conversationHistory
      )

      expect(result1.success).toBe(true)
      conversationHistory.push({ role: 'user', content: 'Hello, I need help with a project' })
      conversationHistory.push({ role: 'assistant', content: result1.result.final_response })

      // Second interaction with context
      const result2 = await agentManager.processUserInput(
        'What kind of help can you provide?',
        conversationHistory
      )

      expect(result2.success).toBe(true)
      expect(global.mockTauriInvoke).toHaveBeenCalledWith(
        'cerebras_chat',
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ content: 'Hello, I need help with a project' })
          ])
        })
      )
    })
  })
})