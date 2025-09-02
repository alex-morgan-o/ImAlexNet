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
      // First, propose an ideal team composition
      const team = this.createTeamComposition(analysis, context);
      // Then, create a detailed plan that leverages this team
      return this.createDetailedPlanWithLLM(analysis, context, team);
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

  private async createDetailedPlanWithLLM(analysis: AnalysisResult, context: AgentContext, team?: ReturnType<PlannerAgent['createTeamComposition']>): Promise<ExecutionPlan> {
    const planningPrompt = this.buildDetailedPlanningPrompt(analysis, context, team);
    
    const response = await this.llm({
      messages: [
        { role: 'system', content: this.getDetailedPlanningSystemPrompt() },
        { role: 'user', content: planningPrompt }
      ],
      temperature: 0.4,
      max_tokens: 4096
    }, context, { label: 'Planning' });

    if (!response.success || !response.data?.message) {
      throw new Error(response.error || 'Failed to create detailed plan');
    }

    try {
      const planData = this.parseJsonResponse(response.data.message);
      return this.convertLLMPlanToExecutionPlan(planData, analysis, context, team);
    } catch (parseError) {
      // Fallback to template plan
      this.logThought('LLM plan parsing failed, using template fallback');
      const fallback = this.createTemplatePlan(analysis, context);
      if (team) fallback.team = team;
      return fallback;
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

    const plan: ExecutionPlan = {
      id: planId,
      userIntent: analysis.userIntent,
      complexity: analysis.complexity,
      steps,
      currentStep: 0,
      status: 'created',
      createdAt: now,
      updatedAt: now
    };

    // If task is complex_task, attach a default team composition
    if (analysis.intentCategory === 'complex_task' || analysis.complexity === 'complex') {
      plan.team = this.createTeamComposition(analysis, context);
      // Also append a final validation step
      const reviewer = plan.team.reviewerRole || 'Manager / Reviewer';
      steps.push({
        id: `${planId}-step-${steps.length + 1}`,
        stepNumber: steps.length + 1,
        description: 'Final review and approval',
        agentType: AgentType.VALIDATOR,
        requiredCapabilities: ['validation', 'review'],
        inputs: {
          userPrompt: context.userPrompt,
          analysis: analysis,
          executionType: 'validation',
          referenceStep: steps.length // prior step index
        },
        status: 'pending',
        assigneeRole: reviewer
      });
    }

    return plan;
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

  private buildDetailedPlanningPrompt(analysis: AnalysisResult, context: AgentContext, team?: ReturnType<PlannerAgent['createTeamComposition']>): string {
    const contextSummary = this.buildContextSummary(context);
    const workspaceInfo = this.getWorkspaceInfo(context);
    const teamSection = team ? `\nProposed Team Composition (use these roles when assigning steps):\n${JSON.stringify(team, null, 2)}\n` : '';
    
    return `
Create a detailed execution plan for this complex task:

User Request: "${context.userPrompt}"
Analysis: ${JSON.stringify(analysis, null, 2)}

Context:
${contextSummary}

Workspace:
${workspaceInfo}
${teamSection}

Create a step-by-step execution plan in this JSON format:
{
  "description": "Overall plan description",
  "estimatedSteps": 3,
  "team": ${team ? 'Use the provided team as-is' : 'Optional: include a proposed team composition with roles and responsibilities' },
  "steps": [
    {
      "stepNumber": 1,
      "description": "What this step accomplishes",
      "agentType": "executor|analyzer|validator", 
      "requiredCapabilities": ["capability1", "capability2"],
      "assigneeRole": "Which role from team leads this step",
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
6. If a team composition is provided, assign each step an "assigneeRole" from that team. If not provided, propose a sensible team and assign roles accordingly.

Return ONLY valid JSON, nothing else.`;
  }

  private convertLLMPlanToExecutionPlan(planData: any, analysis: AnalysisResult, _context: AgentContext, fallbackTeam?: ReturnType<PlannerAgent['createTeamComposition']>): ExecutionPlan {
    const planId = `plan-${Date.now()}`;
    const now = Date.now();

    const steps: PlanStep[] = (planData.steps || []).map((step: any, index: number) => ({
      id: `${planId}-step-${step.stepNumber || index + 1}`,
      stepNumber: step.stepNumber || index + 1,
      description: step.description || `Step ${index + 1}`,
      agentType: this.normalizeAgentType(step.agentType),
      requiredCapabilities: Array.isArray(step.requiredCapabilities) ? step.requiredCapabilities : [],
      inputs: step.inputs || {},
      status: 'pending' as const,
      assigneeRole: typeof step.assigneeRole === 'string' ? step.assigneeRole : undefined,
      dependencies: Array.isArray(step.dependencies) ? step.dependencies.map((d: any) => Number(d)).filter((n: any) => Number.isFinite(n) && n > 0) : undefined
    }));

    return {
      id: planId,
      userIntent: analysis.userIntent,
      complexity: analysis.complexity,
      steps,
      currentStep: 0,
      status: 'created',
      createdAt: now,
      updatedAt: now,
      team: planData.team || fallbackTeam
    };
  }

  private normalizeAgentType(agentType: any): AgentType {
    const validTypes = Object.values(AgentType);
    return validTypes.includes(agentType) ? agentType : AgentType.EXECUTOR;
  }

  // Determine an ideal team composition for complex tasks
  private createTeamComposition(analysis: AnalysisResult, context: AgentContext) {
    const domain = this.inferDomain(analysis, context);
    const goal = analysis.userIntent || context.userPrompt;

    const teamByDomain: Record<string, { leadRole: string; reviewerRole: string; roles: Array<{ role: string; description: string; responsibilities: string[]; successCriteria?: string[]; suggestedTools?: string[]; }> }> = {
      app_development: {
        leadRole: 'Tech Lead / Architect',
        reviewerRole: 'Engineering Manager / Reviewer',
        roles: [
          {
            role: 'Project Manager',
            description: 'Clarifies scope and milestones; coordinates delivery.',
            responsibilities: ['Define scope', 'Prioritize features', 'Track progress', 'Stakeholder updates'],
            successCriteria: ['Clear milestones', 'On-time delivery']
          },
          {
            role: 'Tech Lead / Architect',
            description: 'Owns system design and technical decisions.',
            responsibilities: ['Architecture', 'Tech stack decisions', 'Code review standards'],
            suggestedTools: ['Architecture diagrams', 'ADR templates']
          },
          {
            role: 'Frontend Engineer (Vue)',
            description: 'Implements UI with Vue 3 + TypeScript per project guidelines.',
            responsibilities: ['Build components', 'State management', 'Accessibility', 'Unit tests'],
            suggestedTools: ['Vue 3', 'Vite', 'Vitest']
          },
          {
            role: 'Backend Engineer',
            description: 'Implements APIs and persistence.',
            responsibilities: ['Design endpoints', 'Data models', 'Auth', 'Testing'],
            suggestedTools: ['Rust/Tauri commands', 'SQL/ORM']
          },
          {
            role: 'Full-Stack Engineer',
            description: 'Bridges FE/BE, integrates end-to-end.',
            responsibilities: ['Integration', 'Glue code', 'Cross-cutting concerns']
          },
          {
            role: 'QA Engineer',
            description: 'Validates features and prevents regressions.',
            responsibilities: ['Test plans', 'Automation', 'Bug triage']
          },
          {
            role: 'DevOps / Release',
            description: 'Builds pipelines and packages app.',
            responsibilities: ['CI/CD', 'Release packaging', 'Monitoring'],
            suggestedTools: ['CI', 'Tauri build']
          },
          {
            role: 'Engineering Manager / Reviewer',
            description: 'Final approval and feedback loop.',
            responsibilities: ['Review outputs', 'Gate releases', 'Coach team']
          }
        ]
      },
      data_engineering: {
        leadRole: 'Data Architect',
        reviewerRole: 'Data Engineering Manager',
        roles: [
          { role: 'Project Manager', description: 'Coordinates data project delivery.', responsibilities: ['Milestones', 'Stakeholder sync'] },
          { role: 'Data Architect', description: 'Owns data modeling and platform.', responsibilities: ['Schema design', 'SLAs', 'Governance'] },
          { role: 'Data Engineer', description: 'Builds pipelines and jobs.', responsibilities: ['ETL/ELT', 'Orchestration', 'Testing'] },
          { role: 'Analytics Engineer', description: 'Transforms data for consumption.', responsibilities: ['Modeling', 'Docs', 'Data tests'] },
          { role: 'QA / Data Quality', description: 'Ensures data correctness.', responsibilities: ['Validation', 'Monitoring'] },
          { role: 'Data Engineering Manager', description: 'Reviews and approves.', responsibilities: ['Standards', 'Reviews'] }
        ]
      },
      devops: {
        leadRole: 'DevOps Lead',
        reviewerRole: 'SRE Manager',
        roles: [
          { role: 'Project Manager', description: 'Manages delivery timeline.', responsibilities: ['Scope', 'Milestones'] },
          { role: 'DevOps Lead', description: 'Designs infra and pipelines.', responsibilities: ['CI/CD', 'Observability', 'Security'] },
          { role: 'SRE', description: 'Reliability and performance.', responsibilities: ['SLIs/SLOs', 'Incident response'] },
          { role: 'Security Engineer', description: 'Security posture.', responsibilities: ['Threat model', 'Hardening'] },
          { role: 'SRE Manager', description: 'Final review.', responsibilities: ['Standards', 'Approval'] }
        ]
      },
      ai_agent: {
        leadRole: 'AI Tech Lead',
        reviewerRole: 'Product/Eng Manager',
        roles: [
          { role: 'Product Manager', description: 'Defines user journeys.', responsibilities: ['Personas', 'Acceptance criteria'] },
          { role: 'AI Tech Lead', description: 'Model and architecture choices.', responsibilities: ['Model selection', 'Safety', 'Eval design'] },
          { role: 'Prompt/Agent Engineer', description: 'Prompting and tools.', responsibilities: ['Prompts', 'Tools', 'Memory'] },
          { role: 'Frontend Engineer (Vue)', description: 'UI flows.', responsibilities: ['Components', 'State', 'Handoff'] },
          { role: 'Backend Engineer', description: 'APIs and orchestration.', responsibilities: ['Endpoints', 'Queueing', 'Observability'] },
          { role: 'QA / Red Team', description: 'Safety and correctness.', responsibilities: ['Hallucination tests', 'Guardrails'] },
          { role: 'Product/Eng Manager', description: 'Final review.', responsibilities: ['Sign-off', 'Iteration plan'] }
        ]
      },
      documentation: {
        leadRole: 'Docs Lead',
        reviewerRole: 'Docs Manager',
        roles: [
          { role: 'Docs Lead', description: 'Information architecture.', responsibilities: ['Outline', 'Style guide'] },
          { role: 'Tech Writer', description: 'Author content.', responsibilities: ['Draft', 'Review', 'Publish'] },
          { role: 'Reviewer', description: 'Approves docs.', responsibilities: ['Accuracy', 'Clarity'] }
        ]
      },
      generic: {
        leadRole: 'Project Lead',
        reviewerRole: 'Manager / Reviewer',
        roles: [
          { role: 'Project Lead', description: 'Coordinates work and decisions.', responsibilities: ['Plan', 'Coordinate', 'Review'] },
          { role: 'Implementer', description: 'Executes tasks.', responsibilities: ['Build', 'Test'] },
          { role: 'QA', description: 'Validates output.', responsibilities: ['Test', 'Verify'] },
          { role: 'Manager / Reviewer', description: 'Final approval.', responsibilities: ['Approve', 'Feedback'] }
        ]
      }
    };

    const selected = teamByDomain[domain];
    const orgChart = selected.roles.map(r => ({ role: r.role, reportsTo: selected.leadRole === r.role ? undefined : selected.leadRole }));

    return {
      goal,
      domain: domain as any,
      leadRole: selected.leadRole,
      reviewerRole: selected.reviewerRole,
      roles: selected.roles,
      orgChart
    };
  }

  private inferDomain(analysis: AnalysisResult, context: AgentContext): 'app_development' | 'web_app' | 'mobile_app' | 'data_engineering' | 'data_science' | 'devops' | 'ai_agent' | 'documentation' | 'research' | 'generic' {
    const text = `${analysis.userIntent} ${context.userPrompt}`.toLowerCase();
    const has = (s: string) => text.includes(s);

    if (has('vue') || has('frontend') || has('ui') || has('web app') || has('create an app') || has('build an app')) return 'app_development';
    if (has('mobile') || has('ios') || has('android')) return 'mobile_app';
    if (has('pipeline') || has('etl') || has('warehouse') || has('dbt') || has('airflow')) return 'data_engineering';
    if (has('notebook') || has('modeling') || has('analysis') || has('regression') || has('classification')) return 'data_science';
    if (has('deploy') || has('kubernetes') || has('docker') || has('cicd') || has('ci/cd')) return 'devops';
    if (has('llm') || has('agent') || has('prompt') || has('ai')) return 'ai_agent';
    if (has('docs') || has('documentation') || has('guide') || has('readme')) return 'documentation';
    if (has('research') || has('paper') || has('study')) return 'research';
    return 'generic';
  }
}
