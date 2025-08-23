import { BaseAgent } from './baseAgent';
import { AgentType, AgentContext, AgentResponse } from './types';

export interface AnalysisResult {
  userIntent: string;
  intentCategory: 'conversation' | 'file_operation' | 'command_execution' | 'information_request' | 'complex_task';
  requiredCapabilities: string[];
  complexity: 'simple' | 'medium' | 'complex';
  contextRequirements: {
    needsWorkspace: boolean;
    needsFileAccess: boolean;
    needsUserInput: boolean;
    specificPaths?: string[];
    accessType?: 'read' | 'write' | 'read_write';
  };
  confidence: number;
  reasoning: string;
}

export class AnalyzerAgent extends BaseAgent {
  constructor() {
    super(AgentType.ANALYZER, [
      'intent-analysis',
      'context-understanding', 
      'requirement-extraction',
      'complexity-assessment'
    ]);
  }

  async execute(prompt: string, context: AgentContext): Promise<AgentResponse> {
    this.logThought('Starting user intent analysis...');
    this.emitProgress({ phase: 'analysis_start', message: 'Analyzing user request...' }, context);

    try {
      const analysis = await this.analyzeUserIntent(prompt, context);
      
      this.logThought(`Analysis complete. Intent: ${analysis.userIntent}, Complexity: ${analysis.complexity}`);
      this.emitProgress({ phase: 'log', text: `✅ Analysis complete - Intent: ${analysis.intentCategory}` }, context);

      return this.createSuccessResponse(
        analysis,
        `Analyzed user request: ${analysis.intentCategory} with ${analysis.complexity} complexity`,
        this.generateNextActions(analysis)
      );
    } catch (error) {
      // Use fallback analysis when LLM fails
      const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
      this.logThought(`LLM analysis failed: ${errorMessage}, using fallback analysis`);
      this.emitProgress({ phase: 'log', text: '⚠️ Using fallback analysis due to LLM error' }, context);
      
      const fallbackAnalysis = this.createFallbackAnalysis(prompt, context);
      
      return this.createSuccessResponse(
        fallbackAnalysis,
        `Used fallback analysis: ${fallbackAnalysis.intentCategory} with ${fallbackAnalysis.complexity} complexity`,
        this.generateNextActions(fallbackAnalysis)
      );
    }
  }

  private async analyzeUserIntent(prompt: string, context: AgentContext): Promise<AnalysisResult> {
    const analysisPrompt = this.buildAnalysisPrompt(prompt, context);
    
    const response = await this.callLLM({
      messages: [
        { role: 'system', content: this.getAnalysisSystemPrompt() },
        { role: 'user', content: analysisPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2048
    });

    if (!response.success || !response.data?.message) {
      throw new Error(response.error || 'Failed to get analysis from LLM');
    }

    try {
      const analysisData = this.parseJsonResponse(response.data.message);
      return this.validateAndNormalizeAnalysis(analysisData);
    } catch (parseError) {
      // Throw error to trigger fallback in main execute method
      const errorMessage = parseError instanceof Error ? parseError.message : 'JSON parsing failed';
      throw new Error(`Failed to parse LLM response: ${errorMessage}`);
    }
  }

  private buildAnalysisPrompt(prompt: string, context: AgentContext): string {
    const contextSummary = this.buildContextSummary(context);
    const workspaceInfo = this.getWorkspaceInfo(context);
    
    return `
Analyze this user request and provide structured analysis:

User Request: "${prompt}"

Recent Conversation Context:
${contextSummary}

Current Workspace:
${workspaceInfo}

Provide analysis in this JSON format:
{
  "userIntent": "Clear description of what user wants to accomplish",
  "intentCategory": "conversation|file_operation|command_execution|information_request|complex_task",
  "requiredCapabilities": ["list", "of", "required", "capabilities"],
  "complexity": "simple|medium|complex",
  "contextRequirements": {
    "needsWorkspace": boolean,
    "needsFileAccess": boolean,
    "needsUserInput": boolean,
    "specificPaths": ["optional", "array", "of", "paths"],
    "accessType": "read|write|read_write"
  },
  "confidence": 0.95,
  "reasoning": "Explanation of the analysis"
}`;
  }

  private getAnalysisSystemPrompt(): string {
    return `You are an expert user intent analyzer. Your job is to understand what users want to accomplish and categorize their requests.

Intent Categories:
- conversation: Simple chat, greetings, questions that don't require actions
- file_operation: Reading, writing, creating, or modifying files/folders  
- command_execution: Running shell commands, system operations
- information_request: Asking for information that requires search or analysis
- complex_task: Multi-step tasks requiring planning and coordination

Complexity Levels:
- simple: Can be done in 1-2 straightforward steps
- medium: Requires 3-5 steps or some reasoning
- complex: Multi-step process with dependencies, planning needed

Required Capabilities Examples:
- file-reading, file-writing, directory-listing
- command-execution, shell-operations
- text-analysis, code-analysis, search
- planning, coordination, validation

Be precise and practical in your analysis. Focus on what's actually needed to fulfill the user's request.

Return ONLY valid JSON, nothing else.`;
  }

  private validateAndNormalizeAnalysis(data: any): AnalysisResult {
    // Ensure all required fields exist with defaults
    return {
      userIntent: data.userIntent || 'User request analysis',
      intentCategory: this.normalizeIntentCategory(data.intentCategory),
      requiredCapabilities: Array.isArray(data.requiredCapabilities) ? data.requiredCapabilities : [],
      complexity: this.normalizeComplexity(data.complexity),
      contextRequirements: {
        needsWorkspace: Boolean(data.contextRequirements?.needsWorkspace),
        needsFileAccess: Boolean(data.contextRequirements?.needsFileAccess),
        needsUserInput: Boolean(data.contextRequirements?.needsUserInput),
        specificPaths: data.contextRequirements?.specificPaths || undefined,
        accessType: data.contextRequirements?.accessType || undefined
      },
      confidence: typeof data.confidence === 'number' ? Math.max(0, Math.min(1, data.confidence)) : 0.8,
      reasoning: data.reasoning || 'Analysis completed successfully'
    };
  }

  private normalizeIntentCategory(category: any): AnalysisResult['intentCategory'] {
    const validCategories: AnalysisResult['intentCategory'][] = [
      'conversation', 'file_operation', 'command_execution', 'information_request', 'complex_task'
    ];
    return validCategories.includes(category) ? category : 'information_request';
  }

  private normalizeComplexity(complexity: any): AnalysisResult['complexity'] {
    const validComplexities: AnalysisResult['complexity'][] = ['simple', 'medium', 'complex'];
    return validComplexities.includes(complexity) ? complexity : 'medium';
  }

  private createFallbackAnalysis(prompt: string, _context: AgentContext): AnalysisResult {
    // Simple heuristic-based analysis as fallback
    const lowerPrompt = prompt.toLowerCase();
    
    let intentCategory: AnalysisResult['intentCategory'] = 'conversation';
    let complexity: AnalysisResult['complexity'] = 'simple';
    let requiredCapabilities: string[] = [];
    let needsFileAccess = false;
    let needsWorkspace = false;

    // Basic pattern matching
    if (lowerPrompt.includes('file') || lowerPrompt.includes('read') || lowerPrompt.includes('write') || lowerPrompt.includes('create')) {
      intentCategory = 'file_operation';
      requiredCapabilities.push('file-operations');
      needsFileAccess = true;
      needsWorkspace = true;
    } else if (lowerPrompt.includes('run') || lowerPrompt.includes('execute') || lowerPrompt.includes('command')) {
      intentCategory = 'command_execution';
      requiredCapabilities.push('command-execution');
      needsWorkspace = true;
    } else if (lowerPrompt.includes('analyze') || lowerPrompt.includes('find') || lowerPrompt.includes('search')) {
      intentCategory = 'information_request';
      requiredCapabilities.push('analysis', 'search');
      complexity = 'medium';
    }

    // Check for complexity indicators
    if (lowerPrompt.includes('and') || lowerPrompt.includes('then') || lowerPrompt.length > 100) {
      complexity = complexity === 'simple' ? 'medium' : 'complex';
    }

    return {
      userIntent: prompt,
      intentCategory,
      requiredCapabilities,
      complexity,
      contextRequirements: {
        needsWorkspace,
        needsFileAccess,
        needsUserInput: false
      },
      confidence: 0.6, // Lower confidence for fallback
      reasoning: 'Fallback analysis using pattern matching'
    };
  }

  private generateNextActions(analysis: AnalysisResult): string[] {
    const actions: string[] = [];
    
    switch (analysis.intentCategory) {
      case 'conversation':
        actions.push('respond-directly');
        break;
      case 'file_operation':
        if (analysis.contextRequirements.needsUserInput) {
          actions.push('request-user-input');
        } else {
          actions.push('create-execution-plan');
        }
        break;
      case 'command_execution':
        actions.push('create-execution-plan');
        break;
      case 'information_request':
        if (analysis.complexity === 'simple') {
          actions.push('respond-directly');
        } else {
          actions.push('create-execution-plan');
        }
        break;
      case 'complex_task':
        actions.push('create-detailed-plan');
        break;
    }

    return actions;
  }
}