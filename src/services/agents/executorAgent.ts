import { BaseAgent } from './baseAgent';
import { AgentType, AgentContext, AgentResponse, PlanStep } from './types';
import { AnalysisResult } from './analyzerAgent';
import { invoke } from "@tauri-apps/api/core";

export interface ExecutionResult {
  success: boolean;
  result: any;
  commands?: Array<{
    command: string;
    args: string[];
    working_dir?: string;
    explanation: string;
  }>;
  needsUserPath?: boolean;
  pathRequest?: {
    access?: "read" | "write" | "read_write";
    prompt?: string;
  };
  finalResponse: string;
}

export class ExecutorAgent extends BaseAgent {
  constructor() {
    super(AgentType.EXECUTOR, [
      'command-execution',
      'file-operations',
      'conversation',
      'user-interaction',
      'workspace-setup',
      'information-processing'
    ]);
  }

  async execute(stepData: string, context: AgentContext): Promise<AgentResponse> {
    this.logThought('Starting step execution...');
    
    try {
      let step: PlanStep;
      let analysis: AnalysisResult | null = null;

      // Parse input - could be step data or direct analysis
      try {
        const parsed = JSON.parse(stepData);
        if (parsed.stepNumber !== undefined) {
          step = parsed as PlanStep;
          analysis = parsed.inputs?.analysis;
        } else {
          // This is direct analysis data, create a synthetic step
          analysis = parsed as AnalysisResult;
          step = this.createSyntheticStep(analysis, context);
        }
      } catch (parseError) {
        // Treat as direct user prompt
        return await this.handleDirectPrompt(stepData, context);
      }

      this.emitProgress({ 
        phase: 'log', 
        text: `🔧 Executing step: ${step.description}` 
      }, context);

      const executionResult = await this.executeStep(step, analysis, context);
      
      this.logThought(`Step execution ${executionResult.success ? 'succeeded' : 'failed'}`);
      this.emitProgress({ 
        phase: 'log', 
        text: `✅ Step ${executionResult.success ? 'completed' : 'failed'}: ${step.description}` 
      }, context);

      return this.createSuccessResponse(
        executionResult,
        `Executed: ${step.description}`,
        executionResult.success ? ['continue'] : ['retry', 'adjust-plan']
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Execution failed';
      this.logThought(`Execution error: ${errorMessage}`);
      this.emitProgress({ phase: 'error', message: errorMessage }, context);
      
      return this.createErrorResponse(errorMessage, 'Step execution failed');
    }
  }

  private createSyntheticStep(analysis: AnalysisResult, context: AgentContext): PlanStep {
    const intentCategory = analysis.intentCategory || 'conversation';
    const requiredCapabilities = analysis.requiredCapabilities || [];
    
    return {
      id: `synthetic-${Date.now()}`,
      stepNumber: 1,
      description: `Handle ${intentCategory}`,
      agentType: AgentType.EXECUTOR,
      requiredCapabilities,
      inputs: {
        analysis,
        userPrompt: context.userPrompt,
        executionType: intentCategory
      },
      status: 'executing'
    };
  }

  private async executeStep(step: PlanStep, analysis: AnalysisResult | null, context: AgentContext): Promise<ExecutionResult> {
    const executionType = step.inputs?.executionType || step.inputs?.requestType || (analysis?.intentCategory);
    
    switch (executionType) {
      case 'conversation':
        return this.executeConversation(step, analysis, context);
      case 'file_operation':
        return this.executeFileOperation(step, analysis, context);
      case 'command_execution':
        return this.executeCommandExecution(step, analysis, context);
      case 'information_request':
        return this.executeInformationRequest(step, analysis, context);
      case 'path-input':
        return this.executePathInput(step, analysis, context);
      case 'workspace-setup':
        return this.executeWorkspaceSetup(step, analysis, context);
      default:
        return this.executeGeneric(step, analysis, context);
    }
  }

  private async executeConversation(_step: PlanStep, _analysis: AnalysisResult | null, context: AgentContext): Promise<ExecutionResult> {
    // Generate conversational response
    const response = await this.callLLM({
      messages: [
        { 
          role: 'system', 
          content: 'You are AlexNet, a helpful AI assistant. Provide natural, conversational responses.' 
        },
        ...context.conversationHistory.slice(-3).map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: context.userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2048
    });

    if (!response.success || !response.data?.message) {
      throw new Error('Failed to generate conversational response');
    }

    return {
      success: true,
      result: { type: 'conversation' },
      finalResponse: response.data.message
    };
  }

  private async executeFileOperation(step: PlanStep, analysis: AnalysisResult | null, context: AgentContext): Promise<ExecutionResult> {
    // Check if we need user path input
    const needsPath = !context.workspaceState?.workingDirectory && 
                     analysis?.contextRequirements.needsWorkspace;

    if (needsPath) {
      return {
        success: true,
        result: { type: 'path-request' },
        needsUserPath: true,
        pathRequest: {
          access: analysis?.contextRequirements.accessType || 'read_write',
          prompt: 'Please provide the folder path where you want to perform file operations.'
        },
        finalResponse: 'I need to know which folder to work with. Please provide the path to your project or working directory.'
      };
    }

    // Generate and execute file commands
    return this.generateAndExecuteCommands('file_operation', step, analysis, context);
  }

  private async executeCommandExecution(step: PlanStep, analysis: AnalysisResult | null, context: AgentContext): Promise<ExecutionResult> {
    // Check workspace requirements
    if (!context.workspaceState?.workingDirectory && analysis?.contextRequirements.needsWorkspace) {
      return {
        success: false,
        result: { type: 'workspace-required' },
        needsUserPath: true,
        pathRequest: {
          access: 'read_write',
          prompt: 'Please provide the working directory for command execution.'
        },
        finalResponse: 'I need a working directory to execute commands. Please provide the path where you want me to run the commands.'
      };
    }

    return this.generateAndExecuteCommands('command_execution', step, analysis, context);
  }

  private async executeInformationRequest(_step: PlanStep, _analysis: AnalysisResult | null, context: AgentContext): Promise<ExecutionResult> {
    // Generate informational response or commands if needed
    const response = await this.callLLM({
      messages: [
        { 
          role: 'system', 
          content: `You are AlexNet. The user has an information request. Analyze their request and either:
1. Provide a direct informational response if you can answer without external tools
2. Generate shell commands if you need to search files, analyze code, or gather system information

Current working directory: ${context.workspaceState?.workingDirectory || 'Not set'}

If you need to run commands, respond with JSON in this format:
{
  "needsCommands": true,
  "commands": [
    {
      "command": "command_name",
      "args": ["arg1", "arg2"],
      "explanation": "what this command does",
      "working_dir": "optional_directory"
    }
  ],
  "response": "Explanation of what you're doing"
}

If you can answer directly, respond with JSON in this format:
{
  "needsCommands": false,
  "response": "Your informational response"
}` 
        },
        { role: 'user', content: context.userPrompt }
      ],
      temperature: 0.4,
      max_tokens: 2048
    });

    if (!response.success || !response.data?.message) {
      throw new Error('Failed to process information request');
    }

    try {
      const responseData = this.parseJsonResponse(response.data.message);
      
      if (responseData.needsCommands) {
        // Execute the commands
        const commands = responseData.commands || [];
        const commandResults = await this.executeCommands(commands);
        
        return {
          success: true,
          result: { 
            type: 'information_with_commands',
            commandResults 
          },
          commands,
          finalResponse: responseData.response || 'Information request processed with commands.'
        };
      } else {
        return {
          success: true,
          result: { type: 'information_direct' },
          finalResponse: responseData.response
        };
      }
    } catch (parseError) {
      // Fallback to direct response
      return {
        success: true,
        result: { type: 'information_direct' },
        finalResponse: response.data.message
      };
    }
  }

  private async executePathInput(step: PlanStep, _analysis: AnalysisResult | null, _context: AgentContext): Promise<ExecutionResult> {
    return {
      success: true,
      result: { type: 'path-request' },
      needsUserPath: true,
      pathRequest: {
        access: step.inputs?.accessType || 'read_write',
        prompt: step.inputs?.reason || 'Please provide the required path.'
      },
      finalResponse: step.inputs?.reason || 'I need additional path information to continue.'
    };
  }

  private async executeWorkspaceSetup(_step: PlanStep, _analysis: AnalysisResult | null, _context: AgentContext): Promise<ExecutionResult> {
    return {
      success: true,
      result: { type: 'workspace-setup' },
      needsUserPath: true,
      pathRequest: {
        access: 'read_write',
        prompt: 'Please set up a working directory for this task.'
      },
      finalResponse: 'I need to set up a workspace. Please provide the directory path where you want me to work.'
    };
  }

  private async executeGeneric(step: PlanStep, analysis: AnalysisResult | null, context: AgentContext): Promise<ExecutionResult> {
    // Try to determine the best execution approach
    if (analysis?.contextRequirements.needsUserInput) {
      return this.executePathInput(step, analysis, context);
    }

    // Default to generating and executing commands
    return this.generateAndExecuteCommands('generic', step, analysis, context);
  }

  private async generateAndExecuteCommands(type: string, _step: PlanStep, _analysis: AnalysisResult | null, context: AgentContext): Promise<ExecutionResult> {
    const commandGenerationPrompt = `
User Request: "${context.userPrompt}"
Task Type: ${type}
Working Directory: ${context.workspaceState?.workingDirectory || 'Not set'}

Generate shell commands to fulfill this request. Respond with JSON:
{
  "commands": [
    {
      "command": "command_name",
      "args": ["arg1", "arg2"], 
      "explanation": "what this does",
      "working_dir": "${context.workspaceState?.workingDirectory || ''}"
    }
  ],
  "response": "Explanation of what you're doing"
}

Only generate safe, necessary commands. Be specific with file paths.`;

    const response = await this.callLLM({
      messages: [
        { 
          role: 'system', 
          content: 'You are AlexNet. Generate appropriate shell commands to fulfill user requests. Be safe and specific. Only include working_dir if different from the provided default.' 
        },
        { role: 'user', content: commandGenerationPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2048
    });

    if (!response.success || !response.data?.message) {
      throw new Error('Failed to generate commands');
    }

    try {
      const commandData = this.parseJsonResponse(response.data.message);
      const commands = commandData.commands || [];
      
      if (commands.length === 0) {
        return {
          success: true,
          result: { type: 'no-commands' },
          finalResponse: commandData.response || 'No commands needed for this request.'
        };
      }

      // Execute the commands
      const commandResults = await this.executeCommands(commands);
      
      return {
        success: true,
        result: { 
          type: 'commands_executed',
          commandResults 
        },
        commands,
        finalResponse: commandData.response || 'Commands executed successfully.'
      };
    } catch (parseError) {
      throw new Error(`Failed to parse command generation response: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
    }
  }

  private async executeCommands(commands: any[]): Promise<any[]> {
    const results = [];

    for (const cmd of commands) {
      try {
        const result = await invoke<{
          success: boolean;
          stdout: string;
          stderr: string;
          exit_code?: number;
        }>("execute_shell_command", {
          command: cmd.command,
          args: cmd.args || [],
          workingDir: cmd.working_dir,
        });

        results.push({
          success: result.success,
          output: result.success ? result.stdout : result.stderr,
          error: result.success ? undefined : result.stderr,
          explanation: cmd.explanation,
          command: cmd.command,
          args: cmd.args || [],
          working_dir: cmd.working_dir,
          exit_code: result.exit_code,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Command execution failed';
        results.push({
          success: false,
          output: "",
          error: errMsg,
          explanation: cmd.explanation,
          command: cmd.command,
          args: cmd.args || [],
          working_dir: cmd.working_dir,
        });
      }
    }

    return results;
  }

  private async handleDirectPrompt(prompt: string, context: AgentContext): Promise<AgentResponse> {
    // Handle direct prompt execution (fallback case)
    this.logThought('Handling direct prompt execution');
    
    try {
      const response = await this.callLLM({
        messages: [
          { 
            role: 'system', 
            content: 'You are AlexNet, a helpful AI assistant. Respond naturally to the user.' 
          },
          ...context.conversationHistory.slice(-2).map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          { role: 'user', content: prompt }
        ],
        temperature: 0.6,
        max_tokens: 2048
      });

      if (response.success && response.data?.message) {
        const executionResult: ExecutionResult = {
          success: true,
          result: { type: 'direct-response' },
          finalResponse: response.data.message
        };

        return this.createSuccessResponse(
          executionResult,
          'Direct prompt handled successfully'
        );
      }
    } catch (error) {
      // Fallback to simple response when LLM fails
      this.logThought('LLM call failed, using fallback response');
    }

    // Fallback response when LLM fails
    const executionResult: ExecutionResult = {
      success: true,
      result: { type: 'fallback-response' },
      finalResponse: `I received your message: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}" but I'm having trouble processing it right now. Could you please try rephrasing your request?`
    };

    return this.createSuccessResponse(
      executionResult,
      'Fallback response provided'
    );
  }
}