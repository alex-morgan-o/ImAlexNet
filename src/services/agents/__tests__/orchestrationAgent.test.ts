import { describe, it, expect, beforeEach } from 'vitest'
import { OrchestrationAgent } from '../orchestrationAgent'
import { AgentRegistry } from '../agentRegistry'
import { AnalyzerAgent } from '../analyzerAgent'
import { PlannerAgent } from '../plannerAgent'
import { ExecutorAgent } from '../executorAgent'
import { AgentContext, ExecutionPlan } from '../types'

describe('OrchestrationAgent', () => {
  let orchestrator: OrchestrationAgent
  let registry: AgentRegistry
  let mockContext: AgentContext

  beforeEach(() => {
    registry = new AgentRegistry()
    orchestrator = new OrchestrationAgent(registry)
    mockContext = global.createMockContext()

    // Register all agents
    registry.registerAgent(new AnalyzerAgent())
    registry.registerAgent(new PlannerAgent())
    registry.registerAgent(new ExecutorAgent())
  })

  describe('constructor', () => {
    it('should create orchestrator with correct properties', () => {
      expect(orchestrator.type).toBe('orchestrator')
      expect(orchestrator.capabilities).toContain('planning')
      expect(orchestrator.capabilities).toContain('coordination')
      expect(orchestrator.capabilities).toContain('decision-making')
    })
  })

  describe('execute - simple conversation', () => {
    it('should handle simple conversations with direct execution', async () => {
      // Mock successful analysis for conversation
      const mockAnalysisResponse = {
        success: true,
        result: {
          userIntent: 'Simple greeting',
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
        }
      }

      // Mock successful execution
      const mockExecutionResponse = {
        success: true,
        result: {
          success: true,
          finalResponse: 'Hello! How can I help you today?',
          result: { type: 'conversation' }
        }
      }

      // Mock the registry calls
      registry.executeWithAgent = async (agentType, input, context) => {
        if (agentType === 'analyzer') {
          return mockAnalysisResponse
        }
        if (agentType === 'executor') {
          return mockExecutionResponse
        }
        throw new Error(`Unexpected agent type: ${agentType}`)
      }

      const result = await orchestrator.execute('Hello!', mockContext)

      expect(result.success).toBe(true)
      expect(result.result.final_response).toBe('Hello! How can I help you today?')
    })
  })

  describe('execute - medium complexity with template planning', () => {
    it('should handle file operations with template planning', async () => {
      const mockAnalysisResponse = {
        success: true,
        result: {
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
        }
      }

      const mockPlanResponse = {
        success: true,
        result: {
          id: 'plan-123',
          userIntent: 'Create a file',
          complexity: 'medium',
          steps: [
            {
              id: 'step-1',
              stepNumber: 1,
              description: 'Execute file operation',
              agentType: 'executor',
              requiredCapabilities: ['file-operations'],
              inputs: { executionType: 'file_operation' },
              status: 'pending'
            }
          ],
          currentStep: 0,
          status: 'created',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      }

      const mockExecutionResponse = {
        success: true,
        result: {
          success: true,
          finalResponse: 'File created successfully',
          commands: [{
            command: 'touch',
            args: ['test.txt'],
            explanation: 'Create test file'
          }],
          result: { type: 'commands_executed' }
        }
      }

      registry.executeWithAgent = async (agentType, input, context) => {
        if (agentType === 'analyzer') {
          return mockAnalysisResponse
        }
        if (agentType === 'planner') {
          return mockPlanResponse
        }
        if (agentType === 'executor') {
          return mockExecutionResponse
        }
        throw new Error(`Unexpected agent type: ${agentType}`)
      }

      const result = await orchestrator.execute('Create a file called test.txt', mockContext)

      expect(result.success).toBe(true)
      expect(result.result.final_response).toBe('File created successfully')
      expect(result.result.commands_to_execute).toHaveLength(1)
      expect(result.result.commands_to_execute[0].command).toBe('touch')
    })
  })

  describe('execute - complex task with full planning', () => {
    it('should handle complex tasks with detailed planning', async () => {
      const mockAnalysisResponse = {
        success: true,
        result: {
          userIntent: 'Set up project structure',
          intentCategory: 'complex_task',
          requiredCapabilities: ['file-operations', 'command-execution'],
          complexity: 'complex',
          contextRequirements: {
            needsWorkspace: true,
            needsFileAccess: true,
            needsUserInput: false
          },
          confidence: 0.85,
          reasoning: 'Multi-step project setup'
        }
      }

      const mockPlanResponse = {
        success: true,
        result: {
          id: 'plan-456',
          userIntent: 'Set up project structure',
          complexity: 'complex',
          steps: [
            {
              id: 'step-1',
              stepNumber: 1,
              description: 'Create directories',
              agentType: 'executor',
              requiredCapabilities: ['file-operations'],
              inputs: { executionType: 'file_operation' },
              status: 'pending'
            },
            {
              id: 'step-2',
              stepNumber: 2,
              description: 'Initialize project',
              agentType: 'executor',
              requiredCapabilities: ['command-execution'],
              inputs: { executionType: 'command_execution' },
              status: 'pending'
            }
          ],
          currentStep: 0,
          status: 'created',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      }

      const mockExecutionResponses = [
        {
          success: true,
          result: {
            success: true,
            finalResponse: 'Directories created',
            result: { type: 'file_operation' }
          }
        },
        {
          success: true,
          result: {
            success: true,
            finalResponse: 'Project initialized',
            result: { type: 'command_execution' }
          }
        }
      ]

      let executionCallCount = 0
      registry.executeWithAgent = async (agentType, input, context) => {
        if (agentType === 'analyzer') {
          return mockAnalysisResponse
        }
        if (agentType === 'planner') {
          return mockPlanResponse
        }
        if (agentType === 'executor') {
          return mockExecutionResponses[executionCallCount++]
        }
        throw new Error(`Unexpected agent type: ${agentType}`)
      }

      const result = await orchestrator.execute('Set up a new React project', mockContext)

      expect(result.success).toBe(true)
      expect(executionCallCount).toBe(2) // Both steps executed
    })
  })

  describe('execute - path request handling', () => {
    it('should pause plan execution when user path is needed', async () => {
      const mockAnalysisResponse = {
        success: true,
        result: {
          userIntent: 'List files',
          intentCategory: 'file_operation',
          requiredCapabilities: ['file-operations'],
          complexity: 'medium',
          contextRequirements: {
            needsWorkspace: true,
            needsFileAccess: true,
            needsUserInput: true
          },
          confidence: 0.9,
          reasoning: 'Needs workspace path'
        }
      }

      const mockPlanResponse = {
        success: true,
        result: {
          id: 'plan-789',
          userIntent: 'List files',
          complexity: 'medium',
          steps: [
            {
              id: 'step-1',
              stepNumber: 1,
              description: 'Request path input',
              agentType: 'executor',
              requiredCapabilities: ['user-interaction'],
              inputs: { requestType: 'path-input' },
              status: 'pending'
            }
          ],
          currentStep: 0,
          status: 'created',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      }

      const mockExecutionResponse = {
        success: true,
        result: {
          success: false,
          needsUserPath: true,
          pathRequest: {
            access: 'read',
            prompt: 'Please provide the directory path'
          },
          finalResponse: 'I need to know which directory to list',
          result: { type: 'path-request' }
        }
      }

      registry.executeWithAgent = async (agentType, input, context) => {
        if (agentType === 'analyzer') {
          return mockAnalysisResponse
        }
        if (agentType === 'planner') {
          return mockPlanResponse
        }
        if (agentType === 'executor') {
          return mockExecutionResponse
        }
        throw new Error(`Unexpected agent type: ${agentType}`)
      }

      const result = await orchestrator.execute('List files in directory', mockContext)

      expect(result.success).toBe(true)
      expect(result.result.needs_user_path).toBe(true)
      expect(result.result.path_request?.access).toBe('read')
    })
  })

  describe('execute - error handling', () => {
    it.skip('should handle analysis failures with fallback', async () => {
      // Mock analyzer failure
      registry.executeWithAgent = async (agentType, input, context) => {
        if (agentType === 'analyzer') {
          throw new Error('Analysis failed')
        }
        throw new Error(`Unexpected call after analysis failure: ${agentType}`)
      }

      const result = await orchestrator.execute('Test prompt', mockContext)

      expect(result.success).toBe(true) // Should use fallback analysis
      expect(result.result.reasoning).toBe('Multi-agent processing completed')
    })

    it('should handle step execution failures', async () => {
      const mockAnalysisResponse = {
        success: true,
        result: {
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
        }
      }

      const mockPlanResponse = {
        success: true,
        result: {
          id: 'plan-fail',
          userIntent: 'Test task',
          complexity: 'medium',
          steps: [
            {
              id: 'step-fail',
              stepNumber: 1,
              description: 'Failing step',
              agentType: 'executor',
              requiredCapabilities: ['file-operations'],
              inputs: { executionType: 'file_operation' },
              status: 'pending'
            }
          ],
          currentStep: 0,
          status: 'created',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      }

      const mockExecutionFailure = {
        success: false,
        error: 'Step execution failed',
        result: null
      }

      registry.executeWithAgent = async (agentType, input, context) => {
        if (agentType === 'analyzer') {
          return mockAnalysisResponse
        }
        if (agentType === 'planner') {
          return mockPlanResponse
        }
        if (agentType === 'executor') {
          return mockExecutionFailure
        }
        throw new Error(`Unexpected agent type: ${agentType}`)
      }

      const result = await orchestrator.execute('Test failing task', mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('failed at step 1')
    })

    it('should handle complete orchestration failure', async () => {
      // Mock all agents failing
      registry.executeWithAgent = async () => {
        throw new Error('All agents failed')
      }

      const result = await orchestrator.execute('Test prompt', mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Orchestration process failed')
    })
  })

  describe('plan management', () => {
    it('should track active plans', async () => {
      expect(orchestrator.getActivePlans()).toHaveLength(0)

      // Execute a complex task that creates a plan
      const mockAnalysisResponse = {
        success: true,
        result: {
          userIntent: 'Complex task',
          intentCategory: 'complex_task',
          requiredCapabilities: ['file-operations'],
          complexity: 'complex',
          contextRequirements: {
            needsWorkspace: true,
            needsFileAccess: true,
            needsUserInput: false
          },
          confidence: 0.9,
          reasoning: 'Complex task'
        }
      }

      const mockPlanResponse = {
        success: true,
        result: {
          id: 'plan-track',
          userIntent: 'Complex task',
          complexity: 'complex',
          steps: [
            {
              id: 'step-1',
              stepNumber: 1,
              description: 'Test step',
              agentType: 'executor',
              requiredCapabilities: ['file-operations'],
              inputs: {},
              status: 'pending'
            }
          ],
          currentStep: 0,
          status: 'created',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      }

      const mockExecutionResponse = {
        success: true,
        result: {
          success: true,
          finalResponse: 'Task completed',
          result: { type: 'execution' }
        }
      }

      registry.executeWithAgent = async (agentType, input, context) => {
        if (agentType === 'analyzer') {
          return mockAnalysisResponse
        }
        if (agentType === 'planner') {
          return mockPlanResponse
        }
        if (agentType === 'executor') {
          return mockExecutionResponse
        }
        throw new Error(`Unexpected agent type: ${agentType}`)
      }

      await orchestrator.execute('Complex task', mockContext)

      const activePlans = orchestrator.getActivePlans()
      expect(activePlans).toHaveLength(1)
      expect(activePlans[0].id).toBe('plan-track')
      expect(activePlans[0].status).toBe('completed')
    })

    it('should retrieve specific plans by ID', async () => {
      expect(orchestrator.getPlan('nonexistent')).toBeNull()
    })

    it('should clear completed plans', async () => {
      orchestrator.clearCompletedPlans()
      expect(orchestrator.getActivePlans()).toHaveLength(0)
    })
  })

  describe('strategy decision', () => {
    beforeEach(() => {
      // Mock successful analysis responses
      registry.executeWithAgent = async (agentType) => {
        if (agentType === 'analyzer') {
          return { success: true, result: { intentCategory: 'conversation', complexity: 'simple' } }
        }
        if (agentType === 'executor') {
          return { success: true, result: { success: true, finalResponse: 'Test response' } }
        }
        throw new Error(`Unexpected agent type: ${agentType}`)
      }
    })

    it('should choose direct execution for simple conversations', async () => {
      const result = await orchestrator.execute('Hello!', mockContext)
      expect(result.success).toBe(true)
      // Direct execution should not involve planner
    })

    it('should choose template execution for medium complexity', async () => {
      registry.executeWithAgent = async (agentType) => {
        if (agentType === 'analyzer') {
          return { 
            success: true, 
            result: { 
              intentCategory: 'file_operation', 
              complexity: 'medium',
              contextRequirements: { needsWorkspace: true, needsFileAccess: true, needsUserInput: false }
            } 
          }
        }
        if (agentType === 'planner') {
          return { 
            success: true, 
            result: { 
              id: 'plan-template',
              steps: [{ id: 'step-1', stepNumber: 1, description: 'Test', agentType: 'executor', requiredCapabilities: [], inputs: {}, status: 'pending' }],
              currentStep: 0,
              status: 'created',
              createdAt: Date.now(),
              updatedAt: Date.now()
            } 
          }
        }
        if (agentType === 'executor') {
          return { success: true, result: { success: true, finalResponse: 'Executed', result: { type: 'template' } } }
        }
        throw new Error(`Unexpected agent type: ${agentType}`)
      }

      const result = await orchestrator.execute('Create a file', mockContext)
      expect(result.success).toBe(true)
    })
  })
})
