import { BaseAgent } from './baseAgent';
import { AgentType, AgentContext, AgentResponse, PlanStep, ExecutionPlan } from './types';

interface ValidationResult {
  approved: boolean;
  issues: string[];
  suggestions: string[];
  summary: string;
  assigneeRole?: string;
}

export class ValidatorAgent extends BaseAgent {
  constructor() {
    super(AgentType.VALIDATOR, [
      'validation',
      'review',
      'quality-assurance',
      'approval'
    ]);
  }

  async execute(stepData: string, context: AgentContext): Promise<AgentResponse> {
    this.logThought('Starting validation/review step...');
    
    let step: PlanStep | null = null;
    try {
      const parsed = JSON.parse(stepData);
      if (parsed && typeof parsed === 'object' && typeof parsed.stepNumber === 'number') {
        step = parsed as PlanStep;
      }
    } catch (_) {
      // Ignore parse errors; we'll still attempt a contextual review
    }

    try {
      const reviewContext = this.buildReviewContext(step, context);
      const result = await this.runValidationLLM(reviewContext, context);

      const response: ValidationResult = {
        approved: result.approved,
        issues: result.issues || [],
        suggestions: result.suggestions || [],
        summary: result.summary || (result.approved ? 'Approved.' : 'Changes requested.'),
        assigneeRole: step?.assigneeRole
      };

      const finalResponse = result.approved
        ? `Manager review: Approved. ${result.summary || ''}`.trim()
        : `Manager review: Changes requested. ${result.summary || ''}`.trim();

      return this.createSuccessResponse(
        {
          type: 'validation_result',
          validation: response,
          finalResponse
        },
        result.approved ? 'Validation approved' : 'Validation requires changes'
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Validation failed';
      return this.createErrorResponse(msg, 'Validation error');
    }
  }

  private buildReviewContext(step: PlanStep | null, context: AgentContext): string {
    const plan: ExecutionPlan | undefined = context.executionPlan;
    const recent = this.buildContextSummary(context);
    const workspace = this.getWorkspaceInfo(context);

    let evidence = '';
    if (plan) {
      // Collect outputs of prior steps (up to ~2 recent)
      const completed = plan.steps
        .filter(s => s.status === 'completed' && s.outputs)
        .sort((a, b) => (a.stepNumber - b.stepNumber));
      const tail = completed.slice(-2);
      evidence = tail.map(s => `Step ${s.stepNumber} (${s.description}) outputs:\n${JSON.stringify(s.outputs).slice(0, 1200)}`).join('\n\n');
    }

    return `
User Request: "${context.userPrompt}"
Assignee Role: ${step?.assigneeRole || 'Manager/Reviewer'}
Current Step: ${step ? `${step.stepNumber} - ${step.description}` : 'Unknown'}

Workspace:
${workspace}

Recent Conversation Context:
${recent}

Recent Execution Evidence (if any):
${evidence || 'No prior outputs available.'}
`;
  }

  private async runValidationLLM(reviewContext: string, context: AgentContext): Promise<ValidationResult> {
    const system = `You are a strict manager/reviewer. Review the provided task context and evidence. Decide whether to approve or request changes. Be concise and pragmatic.`;
    const user = `Review the task and return strict JSON with this schema:\n{
  "approved": boolean,
  "issues": string[],
  "suggestions": string[],
  "summary": string
}\n\nContext:\n${reviewContext}`;

    const resp = await this.llm({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.1,
      max_tokens: 1024
    }, context, { label: 'Validation' });

    if (!resp.success || !resp.data?.message) {
      throw new Error(resp.error || 'LLM review failed');
    }

    try {
      const data = this.parseJsonResponse(resp.data.message);
      return {
        approved: Boolean(data.approved),
        issues: Array.isArray(data.issues) ? data.issues : [],
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
        summary: typeof data.summary === 'string' ? data.summary : ''
      };
    } catch (e) {
      // Fallback: approve conservatively with a generic summary
      return {
        approved: false,
        issues: ['Unable to parse validation response'],
        suggestions: ['Re-run validation or provide explicit acceptance criteria'],
        summary: 'Parsing failed; requesting clarification.'
      };
    }
  }
}

