import { describe, it, expect, beforeEach } from 'vitest'
import { PlannerAgent } from '../plannerAgent'
import { ExecutionPlan, AgentType, AgentContext } from '../types'
import { AnalysisResult } from '../analyzerAgent'

describe('PlannerAgent', () => {
  let agent: PlannerAgent
  let mockContext: AgentContext
  let mockAnalysis: AnalysisResult

  beforeEach(() => {
    agent = new PlannerAgent()
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
    it('should create planner agent with correct properties', () => {
      expect(agent.type).toBe('planner')
      expect(agent.capabilities).toContain('task-decomposition')
      expect(agent.capabilities).toContain('step-sequencing')
      expect(agent.capabilities).toContain('resource-allocation')
    })
  })

  describe('execute - simple conversation plan', () => {
    it('should create simple response plan for conversation', async () => {
      const conversationAnalysis = {
        ...mockAnalysis,
        intentCategory: 'conversation' as const,
        complexity: 'simple' as const,
        contextRequirements: {
          needsWorkspace: false,
          needsFileAccess: false,
          needsUserInput: false
        }
      }

      const result = await agent.execute(JSON.stringify(conversationAnalysis), mockContext)

      expect(result.success).toBe(true)
      const plan = result.result as ExecutionPlan
      expect(plan.steps).toHaveLength(1)
      expect(plan.steps[0].description).toBe('Provide conversational response')
      expect(plan.steps[0].agentType).toBe(AgentType.EXECUTOR)
      expect(plan.complexity).toBe('simple')
    })
  })

  describe('execute - template-based planning', () => {
    it('should create file operation plan', async () => {
      const result = await agent.execute(JSON.stringify(mockAnalysis), mockContext)

      expect(result.success).toBe(true)
      const plan = result.result as ExecutionPlan
      expect(plan.userIntent).toBe(mockAnalysis.userIntent)
      expect(plan.complexity).toBe(mockAnalysis.complexity)
      expect(plan.steps.length).toBeGreaterThan(0)
      
      const executionStep = plan.steps.find(step => 
        step.description === 'Execute file operation'
      )
      expect(executionStep).toBeDefined()
      expect(executionStep?.agentType).toBe(AgentType.EXECUTOR)
      expect(executionStep?.requiredCapabilities).toContain('file-operations')
    })

    it('should include user input step when needed', async () => {
      const analysisNeedingInput = {
        ...mockAnalysis,
        contextRequirements: {
          ...mockAnalysis.contextRequirements,
          needsUserInput: true
        }
      }

      const result = await agent.execute(JSON.stringify(analysisNeedingInput), mockContext)

      expect(result.success).toBe(true)
      const plan = result.result as ExecutionPlan
      
      const inputStep = plan.steps.find(step => 
        step.description === 'Request missing information from user'
      )
      expect(inputStep).toBeDefined()
      expect(inputStep?.requiredCapabilities).toContain('user-interaction')
    })

    it('should create command execution plan', async () => {
      const commandAnalysis = {
        ...mockAnalysis,
        intentCategory: 'command_execution' as const,
        requiredCapabilities: ['command-execution']
      }

      const result = await agent.execute(JSON.stringify(commandAnalysis), mockContext)

      expect(result.success).toBe(true)
      const plan = result.result as ExecutionPlan
      
      const commandStep = plan.steps.find(step => 
        step.description === 'Execute command'
      )
      expect(commandStep).toBeDefined()
      expect(commandStep?.requiredCapabilities).toContain('command-execution')
    })

    it('should create information request plan', async () => {
      const infoAnalysis = {
        ...mockAnalysis,
        intentCategory: 'information_request' as const,
        requiredCapabilities: ['information-processing']
      }

      const result = await agent.execute(JSON.stringify(infoAnalysis), mockContext)

      expect(result.success).toBe(true)
      const plan = result.result as ExecutionPlan
      
      const infoStep = plan.steps.find(step => 
        step.description === 'Process information request'
      )
      expect(infoStep).toBeDefined()
      expect(infoStep?.requiredCapabilities).toContain('information-processing')
    })
  })

  describe('execute - complex planning with LLM', () => {
    it('should use LLM for complex task planning', async () => {
      const complexAnalysis = {
        ...mockAnalysis,
        complexity: 'complex' as const,
        intentCategory: 'complex_task' as const
      }

      const mockLLMPlan = {
        success: true,
        data: {
          message: JSON.stringify({
            description: 'Complex task execution',
            estimatedSteps: 3,
            steps: [
              {
                stepNumber: 1,
                description: 'Analyze requirements',
                agentType: 'analyzer',
                requiredCapabilities: ['analysis'],
                inputs: { type: 'requirements' }
              },
              {
                stepNumber: 2,
                description: 'Execute primary task',
                agentType: 'executor',
                requiredCapabilities: ['execution'],
                inputs: { type: 'primary' }
              },
              {
                stepNumber: 3,
                description: 'Validate results',
                agentType: 'validator',
                requiredCapabilities: ['validation'],
                inputs: { type: 'validation' }
              }
            ]
          })
        }
      }

      global.mockTauriInvoke.mockResolvedValue(mockLLMPlan)

      const result = await agent.execute(JSON.stringify(complexAnalysis), mockContext)

      expect(result.success).toBe(true)
      const plan = result.result as ExecutionPlan
      expect(plan.steps).toHaveLength(3)
      expect(plan.steps[0].description).toBe('Analyze requirements')
      expect(plan.steps[1].description).toBe('Execute primary task')
      expect(plan.steps[2].description).toBe('Validate results')
    })

    it('should fallback to template when LLM planning fails', async () => {
      const complexAnalysis = {
        ...mockAnalysis,
        complexity: 'complex' as const,
        intentCategory: 'complex_task' as const
      }

      global.mockTauriInvoke.mockRejectedValue(new Error('LLM failed'))

      const result = await agent.execute(JSON.stringify(complexAnalysis), mockContext)

      expect(result.success).toBe(true)
      const plan = result.result as ExecutionPlan
      expect(plan.steps.length).toBeGreaterThan(0)
      // Should fallback to template planning
    })

    it('should fallback when LLM returns unparseable response', async () => {
      const complexAnalysis = {
        ...mockAnalysis,
        complexity: 'complex' as const,
        intentCategory: 'complex_task' as const
      }

      global.mockTauriInvoke.mockResolvedValue({
        success: true,
        data: { message: 'invalid json' }
      })

      const result = await agent.execute(JSON.stringify(complexAnalysis), mockContext)

      expect(result.success).toBe(true)
      const plan = result.result as ExecutionPlan
      expect(plan.steps.length).toBeGreaterThan(0)
    })
  })

  describe('workspace handling', () => {
    it('should add workspace setup step when needed', async () => {
      const contextWithoutWorkspace = {
        ...mockContext,
        workspaceState: {
          ...mockContext.workspaceState,
          workingDirectory: undefined
        }
      }

      const commandAnalysis = {
        ...mockAnalysis,
        intentCategory: 'command_execution' as const,
        contextRequirements: {
          ...mockAnalysis.contextRequirements,
          needsWorkspace: true
        }
      }

      const result = await agent.execute(JSON.stringify(commandAnalysis), contextWithoutWorkspace)

      expect(result.success).toBe(true)
      const plan = result.result as ExecutionPlan
      
      const workspaceStep = plan.steps.find(step => 
        step.description === 'Set up workspace'
      )
      expect(workspaceStep).toBeDefined()
      expect(workspaceStep?.requiredCapabilities).toContain('workspace-setup')
    })

    it('should include working directory in execution steps', async () => {
      const result = await agent.execute(JSON.stringify(mockAnalysis), mockContext)

      expect(result.success).toBe(true)
      const plan = result.result as ExecutionPlan
      
      const executionStep = plan.steps.find(step => 
        step.description === 'Execute file operation'
      )
      expect(executionStep?.inputs.workingDirectory).toBe('/test/workspace')
    })
  })

  describe('plan structure validation', () => {
    it('should create valid execution plan structure', async () => {
      const result = await agent.execute(JSON.stringify(mockAnalysis), mockContext)

      expect(result.success).toBe(true)
      const plan = result.result as ExecutionPlan
      
      // Validate plan structure
      expect(plan.id).toMatch(/^plan-\d+$/)
      expect(plan.userIntent).toBe(mockAnalysis.userIntent)
      expect(plan.complexity).toBe(mockAnalysis.complexity)
      expect(plan.status).toBe('created')
      expect(plan.currentStep).toBe(0)
      expect(typeof plan.createdAt).toBe('number')
      expect(typeof plan.updatedAt).toBe('number')

      // Validate steps structure
      plan.steps.forEach((step, index) => {
        expect(step.id).toMatch(/^plan-\d+-step-\d+$/)
        expect(step.stepNumber).toBe(index + 1)
        expect(step.description).toBeTruthy()
        expect(Object.values(AgentType)).toContain(step.agentType)
        expect(Array.isArray(step.requiredCapabilities)).toBe(true)
        expect(step.status).toBe('pending')
        expect(typeof step.inputs).toBe('object')
      })
    })

    it('should handle invalid analysis input', async () => {
      const result = await agent.execute('invalid json', mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Planning failed')
    })

    it('should handle missing analysis fields', async () => {
      const incompleteAnalysis = {
        userIntent: 'Test',
        // Missing required fields
      }

      const result = await agent.execute(JSON.stringify(incompleteAnalysis), mockContext)

      expect(result.success).toBe(true) // Should still work with defaults
      const plan = result.result as ExecutionPlan
      expect(plan.steps.length).toBeGreaterThan(0)
    })
  })

  describe('step sequencing', () => {
    it('should create properly numbered sequential steps', async () => {
      const result = await agent.execute(JSON.stringify(mockAnalysis), mockContext)

      expect(result.success).toBe(true)
      const plan = result.result as ExecutionPlan
      
      plan.steps.forEach((step, index) => {
        expect(step.stepNumber).toBe(index + 1)
      })
    })

    it('should include user prompt in step inputs', async () => {
      const result = await agent.execute(JSON.stringify(mockAnalysis), mockContext)

      expect(result.success).toBe(true)
      const plan = result.result as ExecutionPlan
      
      const executionStep = plan.steps.find(step => 
        step.agentType === AgentType.EXECUTOR
      )
      expect(executionStep?.inputs.userPrompt).toBe(mockContext.userPrompt)
      expect(executionStep?.inputs.analysis).toEqual(mockAnalysis)
    })
  })
})