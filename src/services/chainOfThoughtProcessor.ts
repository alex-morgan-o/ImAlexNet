import { invoke } from "@tauri-apps/api/core";

export interface ChainOfThoughtStep {
  step: number;
  reasoning: string;
  action: "respond" | "execute_command" | "both";
  details?: {
    text_response?: string;
    command?: string;
    command_args?: string[];
    working_dir?: string;
  };
}

export interface ChainOfThoughtResult {
  success: boolean;
  reasoning: string;
  steps: ChainOfThoughtStep[];
  final_response: string;
  commands_to_execute?: Array<{
    command: string;
    args: string[];
    working_dir?: string;
    explanation: string;
  }>;
  error?: string;
}

export class ChainOfThoughtProcessor {
  private static readonly CHAIN_OF_THOUGHT_PROMPT = `You are AlexNet, an AI assistant. Analyze the user's request and determine what to do.

If the request needs shell commands, include them. If it's just conversation, respond without commands.

Available commands: ls, cat, mkdir, rm, mv, cp, touch, echo, head, tail, wc, find, grep, sh

Respond naturally, then I'll format it as JSON. Tell me:
1. What response to give the user
2. Any commands needed (command name, arguments, explanation)

Examples:

User: "Hello"
Response: Just say hi back to the user. No commands needed.

User: "List files in downloads"  
Response: I'll show the files in your downloads folder. Need to run: ls -la ~/Downloads to list all files in downloads folder.

User: "Create a file called test.txt with hello world"
Response: I'll create that file for you. Need to run: sh -c "echo 'hello world' > test.txt" to create file with content.

Be natural and helpful.`

  private static readonly JSON_FORMATTER_PROMPT = `You are a JSON formatter. Convert the natural language response into this exact JSON format:

{
    "final_response": "response to user",
    "commands_to_execute": [
        {
            "command": "command_name",
            "args": ["arg1", "arg2"],
            "explanation": "what this command does"
        }
    ]
}

If no commands mentioned, use empty array: "commands_to_execute": []

Return ONLY valid JSON, nothing else.`;

  static async processUserMessage(
    userMessage: string,
    context: Array<{ role: string; content: string }> = [],
  ): Promise<ChainOfThoughtResult> {
    try {
      // Step 1: Get natural language analysis
      const analysisMessages = [
        {
          role: "system",
          content: this.CHAIN_OF_THOUGHT_PROMPT,
        },
        ...context.slice(-3),
        {
          role: "user",
          content: userMessage,
        },
      ];

      console.log("🔍 Step 1: Getting natural language analysis...");
      console.log("📤 Analysis messages:", JSON.stringify(analysisMessages, null, 2));

      const analysisResponse = await invoke<{
        success: boolean;
        data?: {
          message: string;
          model: string;
          usage: any;
        };
        error?: string;
      }>("cerebras_chat", {
        messages: analysisMessages,
        model: "qwen-3-coder-480b",
        max_tokens: 300,
        temperature: 0.1,
        stream: false,
      });

      console.log("📥 Raw analysis response object:", JSON.stringify(analysisResponse, null, 2));

      if (!analysisResponse.success || !analysisResponse.data?.message) {
        console.error("❌ Analysis response failed:", analysisResponse);
        throw new Error(analysisResponse.error || "Failed to get analysis from AI");
      }

      const naturalResponse = analysisResponse.data.message.trim();
      console.log("✅ Natural language analysis:", naturalResponse);
      console.log("📏 Response length:", naturalResponse.length);
      console.log("🔤 Response char codes (first 50):", naturalResponse.slice(0, 50).split('').map(c => c.charCodeAt(0)));

      // Step 2: Convert to structured JSON using a different model
      const jsonMessages = [
        {
          role: "system",
          content: this.JSON_FORMATTER_PROMPT,
        },
        {
          role: "user",
          content: `Convert this analysis to JSON:\n\n${naturalResponse}`,
        },
      ];

      console.log("🔧 Step 2: Converting to JSON format...");
      console.log("📤 JSON formatting messages:", JSON.stringify(jsonMessages, null, 2));

      const jsonResponse = await invoke<{
        success: boolean;
        data?: {
          message: string;
          model: string;
          usage: any;
        };
        error?: string;
      }>("cerebras_chat", {
        messages: jsonMessages,
        model: "qwen-3-coder-480b", // Use qwen-3-coder-480b for JSON formatting
        max_tokens: 500,
        temperature: 0.05, // Very low temperature for structured output
        stream: false,
      });

      console.log("📥 Raw JSON response object:", JSON.stringify(jsonResponse, null, 2));

      if (!jsonResponse.success || !jsonResponse.data?.message) {
        console.error("❌ JSON response failed:", jsonResponse);
        throw new Error(jsonResponse.error || "Failed to get JSON formatting");
      }

      const jsonString = jsonResponse.data.message.trim();
      console.log("✅ Formatted JSON response:", jsonString);
      console.log("📏 JSON response length:", jsonString.length);
      console.log("🔤 JSON response char codes (first 50):", jsonString.slice(0, 50).split('').map(c => c.charCodeAt(0)));
      console.log("🎯 First 100 characters:", JSON.stringify(jsonString.slice(0, 100)));
      console.log("🎯 Last 100 characters:", JSON.stringify(jsonString.slice(-100)));

      // Parse the JSON response with extensive error handling
      let parsedResult;
      try {
        console.log("🔄 Attempting direct JSON.parse...");
        parsedResult = JSON.parse(jsonString);
        console.log("✅ Direct JSON parsing succeeded!");
      } catch (directError) {
        console.warn("⚠️ Direct parsing failed:", directError);
        console.log("🔄 Attempting to extract JSON with regex...");
        
        // Extract JSON from response if it contains extra text
        const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error("❌ No JSON pattern found in response");
          console.error("💣 Raw response bytes:", Array.from(new TextEncoder().encode(jsonString)));
          throw new Error("No valid JSON found in response: " + JSON.stringify(jsonString));
        }
        
        console.log("🎯 Extracted JSON candidate:", jsonMatch[0]);
        console.log("🔤 Extracted char codes (first 50):", jsonMatch[0].slice(0, 50).split('').map(c => c.charCodeAt(0)));
        
        try {
          parsedResult = JSON.parse(jsonMatch[0]);
          console.log("✅ Regex extraction + parsing succeeded!");
        } catch (extractError) {
          console.error("❌ Extracted JSON parsing also failed:", extractError);
          console.error("💣 Extracted bytes:", Array.from(new TextEncoder().encode(jsonMatch[0])));
          throw new Error(`JSON parsing failed on extracted content: ${extractError}. Content: ${JSON.stringify(jsonMatch[0])}`);
        }
      }

      console.log("Final parsed result:", parsedResult);

      // Validate the response structure
      if (!parsedResult.final_response) {
        throw new Error("Missing final_response field in JSON");
      }

      console.log("🎉 Final parsed result:", parsedResult);
      console.log("🔍 Commands to execute:", parsedResult.commands_to_execute);
      console.log("📝 Final response:", parsedResult.final_response);

      return {
        success: true,
        reasoning: "Two-step processing completed",
        steps: [],
        final_response: parsedResult.final_response,
        commands_to_execute: parsedResult.commands_to_execute || [],
      };
    } catch (error) {
      console.error("Chain of thought processing failed:", error);

      // For debugging: log the full error details
      if (error instanceof Error) {
        console.error("Error details:", {
          message: error.message,
          stack: error.stack,
          userMessage: userMessage,
        });
      }

      // Fallback to simple conversational response
      return {
        success: false,
        reasoning: "Failed to process request with chain of thought",
        steps: [],
        final_response: `I'd be happy to help you with "${userMessage}", but I'm having trouble processing your request right now. Let me know if you'd like me to try a different approach.`,
        commands_to_execute: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  static async executeCommands(
    commands: Array<{
      command: string;
      args: string[];
      working_dir?: string;
      explanation: string;
    }>,
  ): Promise<
    Array<{
      success: boolean;
      output: string;
      error?: string;
      explanation: string;
    }>
  > {
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
          args: cmd.args,
          workingDir: cmd.working_dir,
        });

        results.push({
          success: result.success,
          output: result.success ? result.stdout : result.stderr,
          error: result.success ? undefined : result.stderr,
          explanation: cmd.explanation,
        });
      } catch (error) {
        results.push({
          success: false,
          output: "",
          error:
            error instanceof Error ? error.message : "Command execution failed",
          explanation: cmd.explanation,
        });
      }
    }

    return results;
  }
}
