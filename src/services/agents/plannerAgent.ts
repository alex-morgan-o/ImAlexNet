import { BaseAgent } from './baseAgent';
import { AgentType, AgentContext, AgentResponse, ExecutionPlan, PlanStep } from './types';
import { AnalysisResult } from './analyzerAgent';

export class PlannerAgent extends BaseAgent {
  constructor() {
    super(AgentType.PLANNER, [
      'task-decomposition',
      'step-sequencing', 
      'resource-allocation',
      'dependency-analysis'
    ]);
  }

  async execute(analysisData: string, context: AgentContext): Promise<AgentResponse> {
    this.logThought('Starting execution plan creation...');
    this.emitProgress({ phase: 'log', text: '📋 Creating execution plan...' }, context);

    try {
      let analysis: AnalysisResult;
      try {
        analysis = JSON.parse(analysisData);
      } catch (parseError) {
        throw new Error('Planning failed - invalid analysis data format');
      }
      
      const executionPlan = await this.createExecutionPlan(analysis, context);
      
      this.logThought(`Plan created with ${executionPlan.steps.length} steps`);
      this.emitProgress({ 
        phase: 'log', 
        text: `✅ Execution plan created - ${executionPlan.steps.length} steps, ${executionPlan.complexity} complexity` 
      }, context);

      return this.createSuccessResponse(
        executionPlan,
        `Created execution plan with ${executionPlan.steps.length} steps`,
        ['execute-plan']
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Planning failed';
      this.logThought(`Planning failed: ${errorMessage}`);
      this.emitProgress({ phase: 'error', message: errorMessage }, context);
      
      return this.createErrorResponse(errorMessage, 'Failed to create execution plan');
    }
  }

  private async createExecutionPlan(analysis: AnalysisResult, context: AgentContext): Promise<ExecutionPlan> {
    // For simple conversations, create a direct response plan
    if (analysis.intentCategory === 'conversation' && analysis.complexity === 'simple') {
      return this.createSimpleResponsePlan(analysis, context);
    }

    // For complex tasks, use LLM to create detailed plan
    if (analysis.complexity === 'complex' || analysis.intentCategory === 'complex_task') {
      return this.createDetailedPlanWithLLM(analysis, context);
    }

    // For medium complexity, use template-based planning
    return this.createTemplatePlan(analysis, context);
  }

  private createSimpleResponsePlan(analysis: AnalysisResult, context: AgentContext): ExecutionPlan {
    const planId = `plan-${Date.now()}`;
    const now = Date.now();

    return {
      id: planId,
      userIntent: analysis.userIntent,
      complexity: analysis.complexity,
      steps: [
        {
          id: `${planId}-step-1`,
          stepNumber: 1,
          description: 'Provide conversational response',
          agentType: AgentType.EXECUTOR,
          requiredCapabilities: ['conversation'],
          inputs: {
            responseType: 'conversational',
            userPrompt: context.userPrompt,
            analysis: analysis
          },
          status: 'pending'
        }
      ],
      currentStep: 0,
      status: 'created',
      createdAt: now,
      updatedAt: now
    };
  }

  private async createDetailedPlanWithLLM(analysis: AnalysisResult, context: AgentContext): Promise<ExecutionPlan> {
    const planningPrompt = this.buildDetailedPlanningPrompt(analysis, context);
    
    const response = await this.callLLM({
      messages: [
        { role: 'system', content: this.getDetailedPlanningSystemPrompt() },
        { role: 'user', content: planningPrompt }
      ],
      temperature: 0.4,
      max_tokens: 4096
    });

    if (!response.success || !response.data?.message) {
      throw new Error(response.error || 'Failed to create detailed plan');
    }

    try {
      const planData = this.parseJsonResponse(response.data.message);
      return this.convertLLMPlanToExecutionPlan(planData, analysis, context);
    } catch (parseError) {
      // Fallback to template plan
      this.logThought('LLM plan parsing failed, using template fallback');
      return this.createTemplatePlan(analysis, context);
    }
  }

  private createTemplatePlan(analysis: AnalysisResult, context: AgentContext): ExecutionPlan {
    const planId = `plan-${Date.now()}`;
    const now = Date.now();
    const steps: PlanStep[] = [];

    let stepCounter = 1;

    // Handle different intent categories
    switch (analysis.intentCategory) {
      case 'file_operation':
        steps.push(...this.createFileOperationSteps(planId, stepCounter, analysis, context));
        break;
      case 'command_execution':
        steps.push(...this.createCommandExecutionSteps(planId, stepCounter, analysis, context));
        break;
      case 'information_request':
        steps.push(...this.createInformationRequestSteps(planId, stepCounter, analysis, context));
        break;
      default:
        // Generic execution step
        steps.push({
          id: `${planId}-step-${stepCounter}`,
          stepNumber: stepCounter,
          description: 'Execute user request',
          agentType: AgentType.EXECUTOR,
          requiredCapabilities: analysis.requiredCapabilities,
          inputs: {
            userPrompt: context.userPrompt,
            analysis: analysis,
            executionType: 'generic'
          },
          status: 'pending'
        });
    }

    return {
      id: planId,
      userIntent: analysis.userIntent,
      complexity: analysis.complexity,
      steps,
      currentStep: 0,
      status: 'created',
      createdAt: now,
      updatedAt: now
    };
  }

  private createFileOperationSteps(planId: string, startStep: number, analysis: AnalysisResult, context: AgentContext): PlanStep[] {
    const steps: PlanStep[] = [];
    let stepNumber = startStep;

    // Check if user input is needed
    if (analysis.contextRequirements.needsUserInput || (!context.workspaceState?.workingDirectory && analysis.contextRequirements.needsWorkspace)) {
      steps.push({
        id: `${planId}-step-${stepNumber++}`,
        stepNumber: stepNumber - 1,
        description: 'Request missing information from user',
        agentType: AgentType.EXECUTOR,
        requiredCapabilities: ['user-interaction'],
        inputs: {
          requestType: 'path-input',
          reason: 'File operations require workspace path',
          analysis: analysis
        },
        status: 'pending'
      });
    }

    // Main file operation step
    steps.push({
      id: `${planId}-step-${stepNumber++}`,
      stepNumber: stepNumber - 1,
      description: 'Execute file operation',
      agentType: AgentType.EXECUTOR,
      requiredCapabilities: ['file-operations', ...(analysis.requiredCapabilities || [])],
      inputs: {
        userPrompt: context.userPrompt,
        analysis: analysis,
        executionType: 'file-operation',
        workingDirectory: context.workspaceState?.workingDirectory
      },
      status: 'pending'
    });

    return steps;
  }

  private createCommandExecutionSteps(planId: string, startStep: number, analysis: AnalysisResult, context: AgentContext): PlanStep[] {
    const steps: PlanStep[] = [];
    let stepNumber = startStep;

    // Check workspace requirements
    if (!context.workspaceState?.workingDirectory && analysis.contextRequirements.needsWorkspace) {
      steps.push({
        id: `${planId}-step-${stepNumber++}`,
        stepNumber: stepNumber - 1,
        description: 'Set up workspace',
        agentType: AgentType.EXECUTOR,
        requiredCapabilities: ['workspace-setup'],
        inputs: {
          requestType: 'workspace-setup',
          reason: 'Command execution requires workspace',
          analysis: analysis
        },
        status: 'pending'
      });
    }

    // Command execution step
    steps.push({
      id: `${planId}-step-${stepNumber++}`,
      stepNumber: stepNumber - 1,
      description: 'Execute command',
      agentType: AgentType.EXECUTOR,
      requiredCapabilities: ['command-execution', ...(analysis.requiredCapabilities || [])],
      inputs: {
        userPrompt: context.userPrompt,
        analysis: analysis,
        executionType: 'command-execution',
        workingDirectory: context.workspaceState?.workingDirectory
      },
      status: 'pending'
    });

    return steps;
  }

  private createInformationRequestSteps(planId: string, startStep: number, analysis: AnalysisResult, context: AgentContext): PlanStep[] {
    const steps: PlanStep[] = [];
    let stepNumber = startStep;

    // Information gathering/analysis step
    steps.push({
      id: `${planId}-step-${stepNumber++}`,
      stepNumber: stepNumber - 1,
      description: 'Process information request',
      agentType: AgentType.EXECUTOR,
      requiredCapabilities: ['information-processing', ...(analysis.requiredCapabilities || [])],
      inputs: {
        userPrompt: context.userPrompt,
        analysis: analysis,
        executionType: 'information-request',
        workingDirectory: context.workspaceState?.workingDirectory
      },
      status: 'pending'
    });

    return steps;
  }

  private buildDetailedPlanningPrompt(analysis: AnalysisResult, context: AgentContext): string {
    const contextSummary = this.buildContextSummary(context);
    const workspaceInfo = this.getWorkspaceInfo(context);
    
    return `
Create a detailed execution plan for this complex task:

User Request: "${context.userPrompt}"
Analysis: ${JSON.stringify(analysis, null, 2)}

Context:
${contextSummary}

Workspace:
${workspaceInfo}

Create a step-by-step execution plan in this JSON format:
{
  "description": "Overall plan description",
  "estimatedSteps": 3,
  "steps": [
    {
      "stepNumber": 1,
      "description": "What this step accomplishes",
      "agentType": "executor|analyzer|validator", 
      "requiredCapabilities": ["capability1", "capability2"],
      "inputs": {
        "key": "value pairs for step inputs"
      },
      "dependencies": ["optional array of step numbers this depends on"]
    }
  ],
  "riskAssessment": "Any potential issues or requirements",
  "successCriteria": "How to know the plan succeeded"
}`;
  }

  private getDetailedPlanningSystemPrompt(): string {
    return `You are an expert task planner. Break down complex user requests into actionable steps.

Available Agent Types:
- executor: Performs actions, runs commands, handles files
- analyzer: Analyzes data, processes information  
- validator: Checks results, validates outputs

Common Capabilities:
- file-operations: read, write, create files/directories
- command-execution: run shell commands
- information-processing: analyze, search, summarize
- user-interaction: request input, confirm actions
- workspace-setup: configure working environment

Planning Principles:
1. Break complex tasks into simple, actionable steps
2. Identify dependencies between steps
3. Consider error conditions and fallbacks
4. Ensure each step has clear inputs and expected outputs
5. Be specific about what capabilities each step needs

Return ONLY valid JSON, nothing else.`;
  }

  private convertLLMPlanToExecutionPlan(planData: any, analysis: AnalysisResult, _context: AgentContext): ExecutionPlan {
    const planId = `plan-${Date.now()}`;
    const now = Date.now();

    const steps: PlanStep[] = (planData.steps || []).map((step: any, index: number) => ({
      id: `${planId}-step-${step.stepNumber || index + 1}`,
      stepNumber: step.stepNumber || index + 1,
      description: step.description || `Step ${index + 1}`,
      agentType: this.normalizeAgentType(step.agentType),
      requiredCapabilities: Array.isArray(step.requiredCapabilities) ? step.requiredCapabilities : [],
      inputs: step.inputs || {},
      status: 'pending' as const
    }));

    return {
      id: planId,
      userIntent: analysis.userIntent,
      complexity: analysis.complexity,
      steps,
      currentStep: 0,
      status: 'created',
      createdAt: now,
      updatedAt: now
    };
  }

  private normalizeAgentType(agentType: any): AgentType {
    const validTypes = Object.values(AgentType);
    return validTypes.includes(agentType) ? agentType : AgentType.EXECUTOR;
  }
}