import { invoke } from "@tauri-apps/api/core";
import { getAgentManager } from './agents/agentManager';
import { AgentResponse } from './agents/types';

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
  needs_user_path?: boolean;
  path_request?: {
    access?: "read" | "write" | "read_write";
    prompt?: string;
  };
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
  private static readonly CHAIN_OF_THOUGHT_PROMPT = `You are AlexNet, an AI assistant. Analyze the user's request and choose ONE primary action:

1) Simple response: If a natural reply suffices, respond conversationally. No commands.
2) Execute shell: If shell is needed, include clear commands with args and brief explanations. Use safe defaults. Include working_dir when helpful.
3) Ask for path: If you need to access files/folders and the exact path or permission isn't provided, ask the user for the precise path(s) and required access (read or write). Do NOT invent paths. No commands until path is confirmed.
4) Search the web: Not supported yet. Inform the user with a concise placeholder and optionally ask a follow-up.

Respond naturally first; a separate step will convert it to JSON. In your response, clearly state what you'll do next and, if executing, list the exact commands.

Tell me:
- What to say to the user
- Any commands needed (command name, arguments, optional working_dir, and a short explanation)

Examples:

User: "Hello"
Response: Hi! How can I help today? No commands needed.

User: "List files in my Downloads"
Response: I'll list your Downloads folder. Need to run: ls -la ~/Downloads to show detailed file listing.

User: "Find all TODOs in my project"
Response: To help with that, please provide the exact folder path to your project (read access), e.g., /Users/you/path/to/project.

User: "Search the web for the latest Vue 3 docs"
Response: Web search is not supported yet. Would you like me to help using any local docs or previously saved notes instead?

User: "Create a file called test.txt with hello world"
Response: I'll create that file. Need to run: sh -c "echo 'hello world' > test.txt" to create the file with the content.

Be natural, concise, and never fabricate file paths.`;

  private static readonly JSON_FORMATTER_PROMPT = `You are a JSON formatter. Convert the natural language response into this exact JSON format:

{
    "final_response": "response to user",
    "needs_user_path": false,
    "path_request": { "access": "read" | "write" | "read_write", "prompt": "optional guidance to user" },
    "commands_to_execute": [
        {
            "command": "command_name",
            "args": ["arg1", "arg2"],
            "explanation": "what this command does",
            "working_dir": "/optional/working/directory"
        }
    ]
}

Rules:
- If the analysis asks the user for a file/folder path or permission, set "needs_user_path": true, include a concise guidance string in "path_request.prompt" and the requested access level in "path_request.access" (read/write/read_write). Also set "commands_to_execute" to [] and put the question in "final_response". Do not invent paths.
- If the analysis indicates a web search, set "final_response" to a concise notice like "Web search is not supported yet." (optionally include a follow-up question). Set "commands_to_execute" to [].
- If there are commands, include exact command and args. Use an empty array when there are none.

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

  // Validation prompts to ensure response quality and adherence to rules
  private static readonly VALIDATOR_PROMPT = `You are a strict validator for an AI assistant's draft reply.

Decide if the draft correctly addresses the user's request under these rules:
- If the task requires accessing local files/folders (e.g., analyze codebase/project, read/modify local files), the assistant must ask for the exact path(s) and required access (read/write) unless already provided. It must not invent paths.
- If the task requires shell operations (e.g., list files, create/edit files, run tools), include concrete shell commands with arguments and a short explanation. Use an optional working_dir when helpful.
- If the user asks to search the web, the assistant must state: "Web search is not supported yet." and may ask a relevant follow-up. No commands.
- If the request is pure conversation, a simple response without commands is acceptable.

Return ONLY this minified JSON object:
{"verdict":"pass"|"fail","reasons":string[],"required_changes":string[]}`;

  private static readonly REFINER_PROMPT = `You are revising an assistant's reply to satisfy strict requirements. Improve the draft so it fully complies with the validator feedback and rules:
- Ask for precise file/folder path(s) and access type when local access is implied but not provided.
- Include specific shell commands when appropriate.
- For web search requests, say "Web search is not supported yet." and optionally ask a follow-up.
- Keep the reply natural and concise. Do not fabricate file paths.

Return ONLY the improved natural language reply.`;

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
    context: Array<{ role: string; content: string; timestamp?: string; files?: any[]; commandResult?: any; }> = [],
    onProgress?: (event: CoTProgressEvent) => void,
  ): Promise<ChainOfThoughtResult> {
    // Use new agent system by default, fall back to legacy if needed
    try {
      return await ChainOfThoughtProcessor.processWithAgentSystem(userMessage, context, onProgress);
    } catch (agentError) {
      console.warn('[ChainOfThoughtProcessor] Agent system failed, falling back to legacy processor:', agentError);
      onProgress?.({ phase: "log", text: "⚠️ Using fallback processing..." });
      return await ChainOfThoughtProcessor.processWithLegacySystem(userMessage, context, onProgress);
    }
  }

  static async processWithAgentSystem(
    userMessage: string,
    context: Array<{ role: string; content: string; timestamp?: string; files?: any[]; commandResult?: any; }> = [],
    onProgress?: (event: CoTProgressEvent) => void,
  ): Promise<ChainOfThoughtResult> {
    try {
      onProgress?.({ phase: "analysis_start", message: "Initializing agent system..." });
      
      const agentManager = getAgentManager();
      await agentManager.initialize();
      
      onProgress?.({ phase: "log", text: "🤖 Using multi-agent orchestration..." });

      // Extract workspace information from context if available
      const workspaceState = {
        workingDirectory: undefined as string | undefined,
        availableTools: ['file-operations', 'command-execution', 'analysis'],
        currentSession: undefined as any
      };

      const agentResponse: AgentResponse = await agentManager.processUserInput(
        userMessage,
        context,
        workspaceState,
        onProgress
      );

      onProgress?.({ phase: "format_done" });

      if (!agentResponse.success) {
        throw new Error(agentResponse.error || 'Agent processing failed');
      }

      // Convert agent response to legacy format
      return ChainOfThoughtProcessor.convertAgentResponseToLegacyFormat(agentResponse, userMessage);

    } catch (error) {
      console.error('[ChainOfThoughtProcessor] Agent system processing failed:', error);
      throw error; // Re-throw to trigger fallback
    }
  }

  static async processWithLegacySystem(
    userMessage: string,
    context: Array<{ role: string; content: string; timestamp?: string; files?: any[]; commandResult?: any; }> = [],
    onProgress?: (event: CoTProgressEvent) => void,
  ): Promise<ChainOfThoughtResult> {
    try {
      // Step 1: Draft + validate + refine loop
      onProgress?.({ phase: "analysis_start", message: "Analyzing..." });
      ChainOfThoughtProcessor.progress(
        onProgress,
        "🔍 Step 1: Drafting and validating response...",
      );

      const baseAnalysisMessages = [
        { role: "system", content: this.CHAIN_OF_THOUGHT_PROMPT },
        ...context.slice(-3),
        { role: "user", content: userMessage },
      ];

      let naturalResponse = "";
      let attempt = 1;
      const maxAttempts = 5;
      let passed = false;
      let lastValidatorFeedback: { reasons: string[]; required_changes: string[] } = {
        reasons: [],
        required_changes: [],
      };

      while (attempt <= maxAttempts && !passed) {
        const isFirst = attempt === 1;
        ChainOfThoughtProcessor.progress(
          onProgress,
          `🧪 Attempt ${attempt}/${maxAttempts} ${isFirst ? "(draft)" : "(refine)"}`,
        );

        let draftMessages = baseAnalysisMessages;
        if (!isFirst) {
          draftMessages = [
            { role: "system", content: this.REFINER_PROMPT },
            {
              role: "user",
              content: `User request:\n${userMessage}\n\nPrevious draft:\n${naturalResponse}\n\nValidator feedback:\n${JSON.stringify(lastValidatorFeedback)}`,
            },
          ];
        }

        const draftResponse = await invoke<{
          success: boolean;
          data?: { message: string; model: string; usage: any };
          error?: string;
        }>("cerebras_chat", {
          messages: draftMessages,
          model: "qwen-3-coder-480b",
          max_tokens: 65536,
          temperature: 0.3,
          stream: false,
        });

        if (!draftResponse.success || !draftResponse.data?.message) {
          console.error("❌ Drafting failed:", draftResponse);
          throw new Error(draftResponse.error || "Failed to get draft from AI");
        }

        naturalResponse = draftResponse.data.message.trim();
        ChainOfThoughtProcessor.progress(onProgress, "✅ Draft produced");

        // Validate the draft
        const validatorMessages = [
          { role: "system", content: this.VALIDATOR_PROMPT },
          {
            role: "user",
            content: `User request: ${userMessage}\n\nAssistant draft:\n${naturalResponse}`,
          },
        ];

        const validatorResponse = await invoke<{
          success: boolean;
          data?: { message: string };
          error?: string;
        }>("cerebras_chat", {
          messages: validatorMessages,
          model: "qwen-3-coder-480b",
          max_tokens: 4096,
          temperature: 0.0,
          stream: false,
        });

        if (!validatorResponse.success || !validatorResponse.data?.message) {
          console.error("❌ Validation failed:", validatorResponse);
          throw new Error(
            validatorResponse.error || "Failed to validate assistant draft",
          );
        }

        // Parse validator JSON
        let verdict = "fail";
        try {
          const raw = ChainOfThoughtProcessor.sanitizeJsonLike(
            ChainOfThoughtProcessor.maybeUnwrapQuotedJson(
              validatorResponse.data.message.trim(),
            ),
          );
          const maybeObjMatch = raw.match(/\{[\s\S]*\}/);
          const text = maybeObjMatch ? maybeObjMatch[0] : raw;
          const v = JSON.parse(text);
          verdict = v.verdict || "fail";
          lastValidatorFeedback = {
            reasons: Array.isArray(v.reasons) ? v.reasons : [],
            required_changes: Array.isArray(v.required_changes)
              ? v.required_changes
              : [],
          };
        } catch (e) {
          console.warn("⚠️ Could not parse validator JSON, assuming fail.", e);
          lastValidatorFeedback = {
            reasons: [
              "Validator returned non-JSON or unparsable output; proceed to refine.",
            ],
            required_changes: [],
          };
          verdict = "fail";
        }

        if (verdict === "pass") {
          passed = true;
          ChainOfThoughtProcessor.progress(onProgress, "✅ Validation passed");
        } else {
          ChainOfThoughtProcessor.progress(
            onProgress,
            `❌ Validation failed: ${lastValidatorFeedback.reasons.join("; ")}`,
          );
          attempt += 1;
        }
      }

      // Stream only the final accepted/last draft
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
        needs_user_path: parsedResult.needs_user_path || false,
        path_request: parsedResult.path_request || undefined,
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

  static convertAgentResponseToLegacyFormat(agentResponse: AgentResponse, _userMessage: string): ChainOfThoughtResult {
    const result = agentResponse.result;
    
    // If result is already in the expected format, use it directly
    if (result && typeof result === 'object' && result.final_response) {
      return {
        success: agentResponse.success,
        reasoning: agentResponse.thoughts || 'Multi-agent processing completed',
        steps: [], // Legacy steps not used in agent system
        final_response: result.final_response,
        needs_user_path: result.needs_user_path || false,
        path_request: result.path_request,
        commands_to_execute: result.commands_to_execute || [],
        error: agentResponse.error
      };
    }

    // If result has execution result format, convert it
    if (result && result.finalResponse) {
      return {
        success: agentResponse.success,
        reasoning: agentResponse.thoughts || 'Multi-agent processing completed',
        steps: [],
        final_response: result.finalResponse,
        needs_user_path: result.needsUserPath || false,
        path_request: result.pathRequest,
        commands_to_execute: result.commands || [],
        error: agentResponse.error
      };
    }

    // Fallback: create basic response
    return {
      success: agentResponse.success,
      reasoning: agentResponse.thoughts || 'Multi-agent processing completed',
      steps: [],
      final_response: agentResponse.success 
        ? (typeof result === 'string' ? result : JSON.stringify(result))
        : `I encountered an issue processing your request: ${agentResponse.error || 'Unknown error'}`,
      needs_user_path: false,
      commands_to_execute: [],
      error: agentResponse.error
    };
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
