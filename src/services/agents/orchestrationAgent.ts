import { BaseAgent } from './baseAgent';
import { AgentType, AgentContext, AgentResponse, ExecutionPlan, PlanStep } from './types';
import { AgentRegistry } from './agentRegistry';
import { AnalysisResult } from './analyzerAgent';
import { ExecutionResult } from './executorAgent';

export class OrchestrationAgent extends BaseAgent {
  private agentRegistry: AgentRegistry;
  private activePlans = new Map<string, ExecutionPlan>();

  constructor(registry: AgentRegistry) {
    super(AgentType.ORCHESTRATOR, [
      'planning',
      'coordination',
      'decision-making',
      'execution-management'
    ], 'orchestrator-main');
    
    this.agentRegistry = registry;
  }

  async execute(prompt: string, context: AgentContext): Promise<AgentResponse> {
    this.logThought('Starting orchestration process...');
    this.emitProgress({ phase: 'analysis_start', message: 'Orchestrating response...' }, context);

    try {
      // Step 1: Analyze user intent (fallback is handled internally)
      const analysis = await this.analyzeUserIntent(prompt, context);
      const analysisResult = analysis.result as AnalysisResult;
      this.logThought(`Intent analyzed: ${analysisResult.intentCategory} (${analysisResult.complexity})`);

      // Step 2: Decide on execution strategy
      const strategy = this.decideExecutionStrategy(analysisResult, context);
      this.emitProgress({ 
        phase: 'log', 
        text: `📋 Execution strategy: ${strategy.type}` 
      }, context);

      // Step 3: Execute based on strategy
      const result = await this.executeStrategy(strategy, analysisResult, context);
      
      this.logThought(`Orchestration ${result.success ? 'completed' : 'failed'}`);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logThought(`Orchestration error: ${errorMessage}`);
      this.emitProgress({ phase: 'error', message: errorMessage }, context);
      
      return this.createErrorResponse('Orchestration process failed', `Failed due to: ${errorMessage}`);
    }
  }

  private async analyzeUserIntent(prompt: string, context: AgentContext): Promise<AgentResponse> {
    if (!this.agentRegistry.hasAgent(AgentType.ANALYZER)) {
      // Fallback: create simple analysis
      return this.createFallbackAnalysis(prompt, context);
    }

    try {
      return await this.agentRegistry.executeWithAgent(
        AgentType.ANALYZER,
        prompt,
        context
      );
    } catch (error) {
      this.logThought('Analyzer failed, using fallback analysis');
      return this.createFallbackAnalysis(prompt, context);
    }
  }

  private createFallbackAnalysis(prompt: string, _context: AgentContext): AgentResponse {
    // Simple heuristic-based analysis
    const lowerPrompt = prompt.toLowerCase();
    
    const analysisResult: AnalysisResult = {
      userIntent: prompt,
      intentCategory: this.guessIntentCategory(lowerPrompt),
      requiredCapabilities: this.guessRequiredCapabilities(lowerPrompt),
      complexity: lowerPrompt.length > 100 ? 'medium' : 'simple',
      contextRequirements: {
        needsWorkspace: lowerPrompt.includes('file') || lowerPrompt.includes('directory'),
        needsFileAccess: lowerPrompt.includes('read') || lowerPrompt.includes('write'),
        needsUserInput: false
      },
      confidence: 0.6,
      reasoning: 'Fallback heuristic analysis'
    };

    return this.createSuccessResponse(
      analysisResult,
      'Fallback analysis completed'
    );
  }

  private guessIntentCategory(lowerPrompt: string): AnalysisResult['intentCategory'] {
    if (lowerPrompt.includes('file') || lowerPrompt.includes('read') || lowerPrompt.includes('write')) {
      return 'file_operation';
    }
    if (lowerPrompt.includes('run') || lowerPrompt.includes('execute') || lowerPrompt.includes('command')) {
      return 'command_execution';
    }
    if (lowerPrompt.includes('find') || lowerPrompt.includes('search') || lowerPrompt.includes('analyze')) {
      return 'information_request';
    }
    return 'conversation';
  }

  private guessRequiredCapabilities(lowerPrompt: string): string[] {
    const capabilities = [];
    if (lowerPrompt.includes('file')) capabilities.push('file-operations');
    if (lowerPrompt.includes('command') || lowerPrompt.includes('run')) capabilities.push('command-execution');
    if (lowerPrompt.includes('analyze')) capabilities.push('analysis');
    return capabilities;
  }

  private decideExecutionStrategy(analysis: AnalysisResult, _context: AgentContext): ExecutionStrategy {
    // Simple conversation - direct execution
    if (analysis.intentCategory === 'conversation' && analysis.complexity === 'simple') {
      return {
        type: 'direct-execution',
        reason: 'Simple conversational response'
      };
    }

    // Complex tasks - full planning
    if (analysis.complexity === 'complex' || analysis.intentCategory === 'complex_task') {
      return {
        type: 'full-planning',
        reason: 'Complex task requires detailed planning'
      };
    }

    // Medium complexity - template planning
    return {
      type: 'template-execution',
      reason: 'Medium complexity task with standard approach'
    };
  }

  private async executeStrategy(
    strategy: ExecutionStrategy,
    analysis: AnalysisResult,
    context: AgentContext
  ): Promise<AgentResponse> {
    switch (strategy.type) {
      case 'direct-execution':
        return this.executeDirectly(analysis, context);
      case 'template-execution':
        return this.executeWithTemplate(analysis, context);
      case 'full-planning':
        return this.executeWithFullPlanning(analysis, context);
      default:
        return this.executeDirectly(analysis, context);
    }
  }

  private async executeDirectly(analysis: AnalysisResult, context: AgentContext): Promise<AgentResponse> {
    this.emitProgress({ phase: 'log', text: '⚡ Direct execution...' }, context);

    const executorResponse = await this.agentRegistry.executeWithAgent(
      AgentType.EXECUTOR,
      JSON.stringify(analysis),
      context
    );

    if (executorResponse.success) {
      const executionResult = executorResponse.result as ExecutionResult;
      return this.createSuccessResponse(
        this.formatFinalResult(executionResult),
        'Direct execution completed'
      );
    }

    return executorResponse;
  }

  private async executeWithTemplate(analysis: AnalysisResult, context: AgentContext): Promise<AgentResponse> {
    this.emitProgress({ phase: 'log', text: '📋 Creating execution plan...' }, context);

    // Create a simple plan using the planner
    let planResponse: AgentResponse;
    
    if (this.agentRegistry.hasAgent(AgentType.PLANNER)) {
      planResponse = await this.agentRegistry.executeWithAgent(
        AgentType.PLANNER,
        JSON.stringify(analysis),
        context
      );
    } else {
      // Fallback: create simple plan
      planResponse = this.createSimplePlan(analysis, context);
    }

    if (!planResponse.success) {
      return planResponse;
    }

    const plan = planResponse.result as ExecutionPlan;
    return this.executePlan(plan, context);
  }

  private async executeWithFullPlanning(analysis: AnalysisResult, context: AgentContext): Promise<AgentResponse> {
    this.emitProgress({ phase: 'log', text: '🎯 Creating detailed plan...' }, context);

    if (!this.agentRegistry.hasAgent(AgentType.PLANNER)) {
      // Fallback to direct execution if no planner
      return this.executeDirectly(analysis, context);
    }

    const planResponse = await this.agentRegistry.executeWithAgent(
      AgentType.PLANNER,
      JSON.stringify(analysis),
      context
    );

    if (!planResponse.success) {
      return planResponse;
    }

    const plan = planResponse.result as ExecutionPlan;
    this.activePlans.set(plan.id, plan);
    
    return this.executePlan(plan, context);
  }

  private createSimplePlan(analysis: AnalysisResult, context: AgentContext): AgentResponse {
    const planId = `simple-plan-${Date.now()}`;
    const now = Date.now();

    const plan: ExecutionPlan = {
      id: planId,
      userIntent: analysis.userIntent,
      complexity: analysis.complexity,
      steps: [
        {
          id: `${planId}-step-1`,
          stepNumber: 1,
          description: 'Execute user request',
          agentType: AgentType.EXECUTOR,
          requiredCapabilities: analysis.requiredCapabilities,
          inputs: {
            analysis,
            userPrompt: context.userPrompt,
            executionType: analysis.intentCategory
          },
          status: 'pending'
        }
      ],
      currentStep: 0,
      status: 'created',
      createdAt: now,
      updatedAt: now
    };

    return this.createSuccessResponse(plan, 'Simple plan created');
  }

  private async executePlan(plan: ExecutionPlan, context: AgentContext): Promise<AgentResponse> {
    this.logThought(`Executing plan with ${plan.steps.length} steps`);
    plan.status = 'active';
    plan.updatedAt = Date.now();

    let finalResult: any = null;
    let allStepsSuccessful = true;

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      plan.currentStep = i;
      
      this.emitProgress({ 
        phase: 'log', 
        text: `🔧 Step ${step.stepNumber}/${plan.steps.length}: ${step.description}` 
      }, context);

      step.status = 'executing';
      step.startedAt = Date.now();

      try {
        const stepResponse = await this.agentRegistry.executeWithAgent(
          step.agentType,
          JSON.stringify(step),
          context
        );

        step.completedAt = Date.now();

        if (stepResponse.success) {
          step.status = 'completed';
          step.outputs = stepResponse.result;
          finalResult = stepResponse.result;

          // Check if this step requires user input
          const executionResult = stepResponse.result as ExecutionResult;
          if (executionResult?.needsUserPath) {
            // Plan needs to be paused for user input
            plan.status = 'paused';
            return this.createSuccessResponse(
              this.formatFinalResult(executionResult),
              `Plan paused at step ${step.stepNumber} - user input required`
            );
          }
        } else {
          step.status = 'failed';
          step.error = stepResponse.error;
          allStepsSuccessful = false;
          
          this.logThought(`Step ${step.stepNumber} failed: ${stepResponse.error}`);
          
          // Decide whether to continue or abort
          if (this.shouldAbortOnStepFailure(step, plan)) {
            plan.status = 'failed';
            return this.createErrorResponse(
              `Plan failed at step ${step.stepNumber}: ${stepResponse.error}`,
              `Step execution failed: ${step.description}`
            );
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Step execution error';
        step.status = 'failed';
        step.error = errorMessage;
        step.completedAt = Date.now();
        allStepsSuccessful = false;
        
        this.logThought(`Step ${step.stepNumber} error: ${errorMessage}`);
        
        if (this.shouldAbortOnStepFailure(step, plan)) {
          plan.status = 'failed';
          return this.createErrorResponse(
            `Plan failed at step ${step.stepNumber}: ${errorMessage}`,
            `Step execution error: ${step.description}`
          );
        }
      }
    }

    plan.status = allStepsSuccessful ? 'completed' : 'failed';
    plan.updatedAt = Date.now();

    if (allStepsSuccessful) {
      this.logThought('Plan execution completed successfully');
      return this.createSuccessResponse(
        this.formatFinalResult(finalResult),
        `Plan completed successfully with ${plan.steps.length} steps`
      );
    } else {
      return this.createErrorResponse(
        'Some steps in the plan failed',
        'Plan execution completed with errors'
      );
    }
  }

  private shouldAbortOnStepFailure(_step: PlanStep, _plan: ExecutionPlan): boolean {
    // For now, abort on any step failure
    // Could be made more sophisticated based on step criticality
    return true;
  }

  private formatFinalResult(executionResult: ExecutionResult | any): any {
    if (!executionResult) return null;

    // If it's an ExecutionResult, format it for the legacy interface
    if (typeof executionResult === 'object' && executionResult.finalResponse) {
      return {
        success: executionResult.success,
        final_response: executionResult.finalResponse,
        commands_to_execute: executionResult.commands || [],
        needs_user_path: executionResult.needsUserPath || false,
        path_request: executionResult.pathRequest,
        reasoning: 'Multi-agent processing completed'
      };
    }

    return executionResult;
  }

  // Plan management methods
  async resumePlan(planId: string, context: AgentContext): Promise<AgentResponse> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      return this.createErrorResponse('Plan not found', `No active plan with ID: ${planId}`);
    }

    if (plan.status !== 'paused') {
      return this.createErrorResponse('Plan not paused', `Plan ${planId} is not in paused state`);
    }

    return this.executePlan(plan, context);
  }

  async adjustPlan(planId: string, adjustments: Partial<ExecutionPlan>, _context: AgentContext): Promise<AgentResponse> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      return this.createErrorResponse('Plan not found', `No active plan with ID: ${planId}`);
    }

    // Apply adjustments
    Object.assign(plan, adjustments);
    plan.updatedAt = Date.now();
    
    this.logThought(`Plan ${planId} adjusted`);
    return this.createSuccessResponse(plan, 'Plan adjusted successfully');
  }

  getActivePlans(): ExecutionPlan[] {
    return Array.from(this.activePlans.values());
  }

  getPlan(planId: string): ExecutionPlan | null {
    return this.activePlans.get(planId) || null;
  }

  clearCompletedPlans(): void {
    for (const [id, plan] of this.activePlans.entries()) {
      if (plan.status === 'completed' || plan.status === 'failed') {
        this.activePlans.delete(id);
      }
    }
  }
}

interface ExecutionStrategy {
  type: 'direct-execution' | 'template-execution' | 'full-planning';
  reason: string;
}