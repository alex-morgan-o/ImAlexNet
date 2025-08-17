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

export type CoTProgressEvent =
  | { phase: "analysis_start"; message?: string }
  | { phase: "analysis_chunk"; chunk: string }
  | { phase: "analysis_done" }
  | { phase: "format_start" }
  | { phase: "format_done" }
  | { phase: "log"; text: string }
  | { phase: "error"; message: string };

export class ChainOfThoughtProcessor {
  // Utility: strip code fences and ANSI/control characters that can break JSON
  private static sanitizeJsonLike(input: string): string {
    let s = input.trim();
    // Strip common Markdown code fences
    if (s.startsWith("```")) {
      s = s.replace(/^```[a-zA-Z0-9_-]*\n/, "").replace(/```\s*$/, "");
    }
    // Remove ANSI escape sequences
    const ANSI_REGEX =
      /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]/g;
    s = s.replace(ANSI_REGEX, "");
    // Remove other non-printable control chars (except tab/newline/carriage return)
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    return s.trim();
  }

  // Utility: if model returned a JSON string literal, unwrap it
  private static maybeUnwrapQuotedJson(input: string): string {
    const t = input.trim();
    if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'"))
    ) {
      try {
        const unwrapped = JSON.parse(t);
        if (typeof unwrapped === "string" && /\{\s*\"/.test(unwrapped)) {
          return unwrapped;
        }
      } catch (_) {}
    }
    return input;
  }

  // Utility: attempt to repair truncated/unbalanced JSON by closing strings/brackets
  private static repairTruncatedJson(jsonLike: string): string {
    let s = this.sanitizeJsonLike(jsonLike);
    // Start from first '{' if present
    const firstCurly = s.indexOf("{");
    if (firstCurly > -1) s = s.slice(firstCurly);

    // Track quote/bracket state and build output
    let out = "";
    const stack: string[] = [];
    let inString = false;
    let escape = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      out += ch;
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === "\\") {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        stack.push("}");
      } else if (ch === "[") {
        stack.push("]");
      } else if ((ch === "}" || ch === "]") && stack.length) {
        // Pop only if it matches expected, otherwise ignore
        const expected = stack[stack.length - 1];
        if (ch === expected) stack.pop();
      }
    }
    // If ended inside a string, close it
    if (inString) out += '"';
    // Close any remaining brackets
    while (stack.length) {
      const closer = stack.pop()!;
      // Avoid trailing comma before closer
      out = out.replace(/,\s*$/, "");
      out += closer;
    }
    return out;
  }
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

Be natural and helpful.`;

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

  // Utility: progressively emit text chunks for a streaming-like UX
  private static async streamText(
    text: string,
    onProgress?: (event: CoTProgressEvent) => void,
    {
      chunkSize = 16,
      delayMs = 15,
    }: { chunkSize?: number; delayMs?: number } = {},
  ) {
    if (!onProgress) return;
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.slice(i, i + chunkSize);
      onProgress({ phase: "analysis_chunk", chunk });
      // tiny delay to simulate token streaming without feeling sluggish
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  private static progress(
    onProgress: ((event: CoTProgressEvent) => void) | undefined,
    text: string,
  ) {
    try {
      console.log(text);
    } finally {
      onProgress?.({ phase: "log", text });
    }
  }

  static async processUserMessage(
    userMessage: string,
    context: Array<{ role: string; content: string }> = [],
    onProgress?: (event: CoTProgressEvent) => void,
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
      ChainOfThoughtProcessor.progress(
        onProgress,
        "🔍 Step 1: Getting natural language analysis...",
      );
      console.log(
        "📤 Analysis messages:",
        JSON.stringify(analysisMessages, null, 2),
      );

      onProgress?.({ phase: "analysis_start", message: "Analyzing..." });

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
        max_tokens: 65536,
        temperature: 0.1,
        stream: false,
      });

      console.log(
        "📥 Raw analysis response object:",
        JSON.stringify(analysisResponse, null, 2),
      );

      if (!analysisResponse.success || !analysisResponse.data?.message) {
        console.error("❌ Analysis response failed:", analysisResponse);
        throw new Error(
          analysisResponse.error || "Failed to get analysis from AI",
        );
      }

      const naturalResponse = analysisResponse.data.message.trim();
      console.log("✅ Natural language analysis:", naturalResponse);
      ChainOfThoughtProcessor.progress(onProgress, "✅ Received analysis");
      console.log("📏 Response length:", naturalResponse.length);
      console.log(
        "🔤 Response char codes (first 50):",
        naturalResponse
          .slice(0, 50)
          .split("")
          .map((c) => c.charCodeAt(0)),
      );

      // Stream the chain-of-thought analysis to the UI
      await ChainOfThoughtProcessor.streamText(naturalResponse, onProgress);
      onProgress?.({ phase: "analysis_done" });

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
      ChainOfThoughtProcessor.progress(
        onProgress,
        "🔧 Step 2: Converting to JSON format...",
      );
      onProgress?.({ phase: "format_start" });
      console.log(
        "📤 JSON formatting messages:",
        JSON.stringify(jsonMessages, null, 2),
      );

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
        max_tokens: 65536,
        temperature: 0.0, // Deterministic for structured output
        stream: false,
      });

      console.log(
        "📥 Raw JSON response object:",
        JSON.stringify(jsonResponse, null, 2),
      );

      if (!jsonResponse.success || !jsonResponse.data?.message) {
        console.error("❌ JSON response failed:", jsonResponse);
        throw new Error(jsonResponse.error || "Failed to get JSON formatting");
      }

      // Clean and normalize potential JSON text
      let jsonString = jsonResponse.data.message.trim();
      jsonString = ChainOfThoughtProcessor.sanitizeJsonLike(jsonString);
      jsonString = ChainOfThoughtProcessor.maybeUnwrapQuotedJson(jsonString);
      console.log("✅ Formatted JSON response:", jsonString);
      ChainOfThoughtProcessor.progress(onProgress, "✅ JSON formatted");
      console.log("📏 JSON response length:", jsonString.length);
      console.log(
        "🔤 JSON response char codes (first 50):",
        jsonString
          .slice(0, 50)
          .split("")
          .map((c) => c.charCodeAt(0)),
      );
      console.log(
        "🎯 First 100 characters:",
        JSON.stringify(jsonString.slice(0, 100)),
      );
      console.log(
        "🎯 Last 100 characters:",
        JSON.stringify(jsonString.slice(-100)),
      );

      // Parse the JSON response with extensive error handling
      let parsedResult: any;
      try {
        console.log("🔄 Attempting direct JSON.parse...");
        ChainOfThoughtProcessor.progress(onProgress, "🔄 Parsing JSON...");
        parsedResult = JSON.parse(jsonString);
        console.log("✅ Direct JSON parsing succeeded!");
        ChainOfThoughtProcessor.progress(onProgress, "✅ JSON parsed");
      } catch (directError) {
        console.warn("⚠️ Direct parsing failed:", directError);
        ChainOfThoughtProcessor.progress(
          onProgress,
          "⚠️ JSON parse failed, attempting repair...",
        );
        // Attempt a targeted repair for truncated/unbalanced JSON
        console.log("🔧 Attempting to repair truncated/unbalanced JSON...");
        const repaired =
          ChainOfThoughtProcessor.repairTruncatedJson(jsonString);
        try {
          parsedResult = JSON.parse(repaired);
          console.log("✅ Repair + parsing succeeded!");
          ChainOfThoughtProcessor.progress(onProgress, "✅ Repair succeeded");
        } catch (repairError) {
          console.warn("⚠️ Repair parsing failed:", repairError);
          console.log("🔄 Attempting to extract JSON with regex...");
          ChainOfThoughtProcessor.progress(
            onProgress,
            "🔄 Extracting JSON with regex...",
          );
          // Extract JSON from response if it contains extra text
          const jsonMatch = repaired.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            console.error("❌ No JSON pattern found in response");
            console.error(
              "💣 Raw response bytes:",
              Array.from(new TextEncoder().encode(jsonString)),
            );
            throw new Error(
              "No valid JSON found in response: " + JSON.stringify(jsonString),
            );
          }
          console.log("🎯 Extracted JSON candidate:", jsonMatch[0]);
          try {
            parsedResult = JSON.parse(jsonMatch[0]);
            console.log("✅ Regex extraction + parsing succeeded!");
            ChainOfThoughtProcessor.progress(
              onProgress,
              "✅ Regex extraction succeeded",
            );
          } catch (extractError) {
            console.error(
              "❌ Extracted JSON parsing also failed:",
              extractError,
            );
            console.error(
              "💣 Extracted bytes:",
              Array.from(new TextEncoder().encode(jsonMatch[0])),
            );
            // As last resort, ask model to repair JSON deterministically
            console.log("🛠️ Invoking model to repair JSON as last resort...");
            ChainOfThoughtProcessor.progress(
              onProgress,
              "🛠️ Invoking model to repair JSON...",
            );
            const repairMessages = [
              {
                role: "system",
                content:
                  'You are a JSON repair tool. Fix invalid or truncated JSON to match this exact schema: {\n  "final_response": string,\n  "commands_to_execute": Array<{ command: string, args: string[], explanation: string, working_dir?: string }>\n}.\nRules:\n- Return ONLY valid minified JSON.\n- If trailing fields are truncated, drop them rather than hallucinating.\n- Ensure "commands_to_execute" exists as an array (can be empty).',
              },
              {
                role: "user",
                content: `Fix this JSON:\n\n${jsonString}`,
              },
            ];
            const fixResponse = await invoke<{
              success: boolean;
              data?: { message: string };
              error?: string;
            }>("cerebras_chat", {
              messages: repairMessages,
              model: "qwen-3-coder-480b",
              max_tokens: 65536,
              temperature: 0,
              stream: false,
            });
            if (!fixResponse.success || !fixResponse.data?.message) {
              throw new Error(fixResponse.error || "Failed to repair JSON");
            }
            const fixed = ChainOfThoughtProcessor.sanitizeJsonLike(
              ChainOfThoughtProcessor.maybeUnwrapQuotedJson(
                fixResponse.data.message.trim(),
              ),
            );
            parsedResult = JSON.parse(fixed);
            console.log("✅ Model-based repair succeeded!");
            ChainOfThoughtProcessor.progress(
              onProgress,
              "✅ Model-based repair succeeded",
            );
          }
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

      onProgress?.({ phase: "format_done" });
      ChainOfThoughtProcessor.progress(onProgress, "✨ Done");

      return {
        success: true,
        reasoning: "Two-step processing completed",
        steps: [],
        final_response: parsedResult.final_response,
        commands_to_execute: parsedResult.commands_to_execute || [],
      };
    } catch (error) {
      console.error("Chain of thought processing failed:", error);
      onProgress?.({
        phase: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unknown chain-of-thought error",
      });
      ChainOfThoughtProcessor.progress(
        onProgress,
        `❌ Chain-of-thought failed: ${error instanceof Error ? error.message : String(error)}`,
      );

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
      explanation?: string;
    }>,
  ): Promise<
    Array<{
      success: boolean;
      output: string;
      error?: string;
      explanation?: string;
      command?: string;
      args?: string[];
      working_dir?: string;
      exit_code?: number;
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
          command: cmd.command,
          args: cmd.args,
          working_dir: cmd.working_dir,
          exit_code: result.exit_code,
        });
      } catch (error) {
        const errMsg =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Command execution failed";
        results.push({
          success: false,
          output: "",
          error: errMsg,
          explanation: cmd.explanation,
          command: cmd.command,
          args: cmd.args,
          working_dir: cmd.working_dir,
        });
      }
    }

    return results;
  }
}
