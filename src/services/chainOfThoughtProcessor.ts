import { invoke } from "@tauri-apps/api/core";
import { toolAvailability, refreshToolAvailability } from "./tooling";

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
  intention_analysis?: string;
  step_plan?: string[];
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
  // Optional draft prompt review flow (not yet used by UI, carried via content)
  needs_prompt_review?: boolean;
  selected_tool?: "claude" | "codex" | "gemini";
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
  // === CLI prompt review flow markers ===
  private static readonly DRAFT_PROMPT_START =
    "--- AlexNet Drafted CLI Prompt (Tool:";
  private static readonly DRAFT_PROMPT_END = "--- End Draft ---";

  // Heuristic: does this look like a complex, multi-step request?
  private static isComplexTask(userMessage: string): boolean {
    const text = (userMessage || "").toLowerCase();
    const long = text.length > 220 || text.split(/\s+/).length > 40;
    const keywords = [
      "implement",
      "refactor",
      "architecture",
      "design",
      "multi-step",
      "multi step",
      "plan",
      "roadmap",
      "migrate",
      "build a",
      "end-to-end",
      "end to end",
      "create a project",
      "scaffold",
      "write a spec",
      "add feature",
      "improve performance",
      "benchmark",
      "debug complex",
    ];
    const mentionsFiles =
      /(src\.|src\-|package\.json|Cargo\.toml|\.ts\b|\.rs\b|\.vue\b|tauri)/i.test(
        userMessage,
      );
    const hasKW = keywords.some((k) => text.includes(k));
    return long || hasKW || mentionsFiles;
  }

  private static isApprovalMessage(userMessage: string): boolean {
    const t = (userMessage || "").trim().toLowerCase();
    const approvals = [
      "approve",
      "ship it",
      "looks good",
      "go ahead",
      "yes, run",
      "yes run",
      "run it",
      "proceed",
      "execute",
      "ok run",
      "okay run",
      "confirm",
      "do it",
    ];
    if (approvals.includes(t)) return true;
    // Soft match
    return /\b(approve|looks good|go ahead|proceed|run it|execute)\b/.test(t);
  }

  private static selectAvailableTool(): "claude" | "codex" | "gemini" | null {
    const avail = toolAvailability.value || {
      claude: false,
      codex: false,
      gemini: false,
    };
    if (avail.claude) return "claude";
    if (avail.codex) return "codex";
    if (avail.gemini) return "gemini";
    return null;
  }

  private static buildCliPrompt(
    tool: "claude" | "codex" | "gemini",
    userMessage: string,
    context: Array<{ role: string; content: string }> = [],
  ): string {
    const recent = context
      .slice(-4)
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");
    const contextJson = JSON.stringify(context || [], null, 2);

    const outputRules = `Output expectations:\n- Propose a concise plan first (steps)\n- Provide exact shell commands when needed\n- If editing files, list target paths and diffs\n- Call out any assumptions or required inputs\n- Avoid destructive actions without explicit confirmation`;

    const toolLine = `Selected tool: ${tool}`;

    return [
      `Task: ${userMessage}`,
      toolLine,
      "Context (most recent messages):",
      recent || "(no prior context)",
      "Context (full history JSON):",
      contextJson,
      outputRules,
      "Constraints:\n- Prefer deterministic, reproducible commands\n- Respect user privacy and do not exfiltrate data",
    ].join("\n\n");
  }

  private static extractDraftFromContext(
    context: Array<{ role: string; content: string }>,
  ): { tool: "claude" | "codex" | "gemini"; prompt: string } | null {
    const reversed = [...context].reverse();
    for (const m of reversed) {
      if (m.role !== "assistant" || !m.content) continue;
      const startIdx = m.content.indexOf(this.DRAFT_PROMPT_START);
      const endIdx = m.content.lastIndexOf(this.DRAFT_PROMPT_END);
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        // Extract tool name from header line
        const headerLine = m.content
          .slice(startIdx, Math.min(m.content.length, startIdx + 200))
          .split("\n")[0];
        const toolMatch = headerLine.match(/Tool:\s*(claude|codex|gemini)\)/i);
        const tool = (toolMatch?.[1]?.toLowerCase() || "") as
          | "claude"
          | "codex"
          | "gemini";
        if (!tool) continue;
        const prompt = m.content
          .slice(startIdx)
          .split("\n")
          .slice(1) // drop header
          .join("\n");
        const body = prompt
          .slice(0, prompt.indexOf(this.DRAFT_PROMPT_END))
          .trim();
        if (body) return { tool, prompt: body };
      }
    }
    return null;
  }

  private static buildCliExecutionCommand(
    tool: "claude" | "codex" | "gemini",
    prompt: string,
  ): { command: string; args: string[]; explanation: string } {
    // Call CLI directly with the prompt as a single argument, no shell
    return {
      command: tool,
      args: [prompt],
      explanation: `Run ${tool} locally with the approved prompt`,
    };
  }

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
  private static buildIntentionAnalysisPrompt(workspacePath?: string | null): string {
    console.log('[ChainOfThought] Building intention analysis prompt with workspace:', workspacePath);
    let basePrompt = `You are AlexNet, an AI assistant. First, analyze the user's intention deeply and create a detailed step-by-step plan.

STEP 1: INTENTION ANALYSIS
- What is the user trying to accomplish?
- What is the scope and complexity of their request?
- What resources or access might be needed?
- Are there any assumptions or ambiguities to clarify?

STEP 2: DETAILED PLANNING
Break down the task into specific, actionable steps. For each step, identify:
- What needs to be done
- What resources/access are required
- What commands or actions are needed
- Dependencies between steps

STEP 3: RESOURCE REQUIREMENTS
If file system access is needed:
- Specify exactly what files/folders need to be accessed
- Indicate whether read, write, or both permissions are needed
- Explain why this access is necessary for the task`;

    if (workspacePath) {
      basePrompt += `

IMPORTANT: The user has set their workspace to: ${workspacePath}
You have FULL ACCESS to this workspace. DO NOT ask for paths or folder selection. Use this workspace directly for all file operations. Set working directories to "${workspacePath}" in your commands.`;
    }

    basePrompt += `

Respond with your analysis and plan in natural language. Be thorough but concise.

Examples:

User: "Help me refactor my Vue components"
Analysis: The user wants to improve their Vue.js codebase structure. This requires:
1. Analyzing existing component structure
2. Identifying refactoring opportunities  
3. Planning the refactoring approach
4. Implementing the changes

Plan:
Step 1: I need to examine your Vue components to understand current structure
Step 2: Analyze component dependencies and patterns
Step 3: Propose refactoring strategy
Step 4: Implement the refactoring changes

Resource needs: I have access to the workspace and can examine and modify Vue component files there.

User: "What's the weather like?"
Analysis: The user wants weather information. This is a simple informational request that doesn't require file access or complex planning.

Plan: Provide a direct response about weather information limitations.

Resource needs: None - this is a conversational response.`;
    return basePrompt;
  }

  private static readonly JSON_FORMATTER_PROMPT = `You are a JSON formatter. Convert the intention analysis and plan into this exact JSON format:

{
    "intention_analysis": "detailed analysis of user's intention",
    "step_plan": ["step 1 description", "step 2 description", ...],
    "final_response": "response to user",
    "needs_user_path": false,
    "path_request": { "access": "read" | "write" | "read_write", "prompt": "guidance for folder/file selection" },
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
- Extract intention analysis into "intention_analysis" field
- Break down the plan into discrete steps in "step_plan" array
- IMPORTANT: If the user has a workspace set (indicated in their message with [Workspace: path]), do NOT ask for paths. Set "needs_user_path": false and use the workspace path in commands
- Only set "needs_user_path": true if NO workspace is available AND file system access is needed
- Set "path_request.access" to the required permission level (read/write/read_write) only when needs_user_path is true
- Include all planned commands in "commands_to_execute" with working_dir set to the workspace path when available
- Web search requests should set appropriate final_response and empty commands array

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
- If the user's message contains [Workspace: path], the assistant must NOT ask for paths. It should use the workspace path directly in commands.
- If no workspace is provided and the task requires accessing local files/folders, the assistant must ask for the exact path(s) and required access (read/write). It must not invent paths.
- If the task requires shell operations (e.g., list files, create/edit files, run tools), include concrete shell commands with arguments and a short explanation. Use the workspace path as working_dir when available.
- If the user asks to search the web, the assistant must state: "Web search is not supported yet." and may ask a relevant follow-up. No commands.
- If the request is pure conversation, a simple response without commands is acceptable.

Return ONLY this minified JSON object:
{"verdict":"pass"|"fail","reasons":string[],"required_changes":string[]}`;

  private static readonly REFINER_PROMPT = `You are revising an assistant's reply to satisfy strict requirements. Improve the draft so it fully complies with the validator feedback and rules:
- If the user's message contains [Workspace: path], use that workspace path directly. Do NOT ask for paths.
- Only ask for precise file/folder path(s) and access type when NO workspace is provided and local access is needed.
- Include specific shell commands when appropriate, using workspace path as working_dir when available.
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
    context: Array<{ role: string; content: string }> = [],
    onProgress?: (event: CoTProgressEvent) => void,
    opts?: { workingDir?: string | null; workspacePath?: string | null },
  ): Promise<ChainOfThoughtResult> {
    console.log('[ChainOfThought] Processing user message with options:', opts);
    try {
      // First, make tool availability up-to-date (best-effort)
      try {
        await refreshToolAvailability();
      } catch (_) {}

      // 0) If the user is approving a previously drafted CLI prompt, execute it
      const priorDraft =
        ChainOfThoughtProcessor.extractDraftFromContext(context);
      if (
        priorDraft &&
        ChainOfThoughtProcessor.isApprovalMessage(userMessage)
      ) {
        const cmd = ChainOfThoughtProcessor.buildCliExecutionCommand(
          priorDraft.tool,
          priorDraft.prompt,
        );
        const toolName = priorDraft.tool;
        const msg = `Running ${toolName} with your approved prompt...`;
        return {
          success: true,
          reasoning: "Approved prompt – executing local CLI tool",
          steps: [],
          final_response: msg,
          commands_to_execute: [cmd],
          selected_tool: toolName,
        };
      }

      // 1) For complex tasks, draft a CLI prompt and ask for review
      const tool = ChainOfThoughtProcessor.selectAvailableTool();
      const complex = ChainOfThoughtProcessor.isComplexTask(userMessage);
      if (complex && tool) {
        const draft = ChainOfThoughtProcessor.buildCliPrompt(
          tool,
          userMessage,
          context,
        );
        const reviewMessage = [
          `${ChainOfThoughtProcessor.DRAFT_PROMPT_START} ${tool}) ---`,
          draft,
          ChainOfThoughtProcessor.DRAFT_PROMPT_END,
          "\n",
          "Please review this prompt for the local tool.",
          "Reply with 'approve' to run as-is, or reply with edits.",
        ].join("\n");

        // Stream the draft for a nicer UX
        onProgress?.({
          phase: "analysis_start",
          message: "Drafting local CLI prompt...",
        });
        await ChainOfThoughtProcessor.streamText(reviewMessage, onProgress, {
          chunkSize: 48,
          delayMs: 10,
        });
        onProgress?.({ phase: "analysis_done" });

        return {
          success: true,
          reasoning: "Drafted CLI prompt for complex task; awaiting approval",
          steps: [],
          final_response: reviewMessage,
          needs_prompt_review: true,
          selected_tool: tool,
          commands_to_execute: [],
        };
      }

      // Step 1: Draft + validate + refine loop
      onProgress?.({ phase: "analysis_start", message: "Analyzing..." });
      ChainOfThoughtProcessor.progress(
        onProgress,
        "🔍 Step 1: Drafting and validating response...",
      );

      const contextJsonMsg = {
        role: "system" as const,
        content:
          "Conversation history JSON:\n" +
          JSON.stringify(context || [], null, 2),
      };

      // Try to infer a working directory from opts or context text
      let workingDir = opts?.workingDir || null;
      if (!workingDir && context && context.length) {
        try {
          const joined = context.map((m) => m.content || "").join("\n\n");
          const m1 = joined.match(/Working directory set to:\s*(\S+)/i);
          const m2 = joined.match(/Use this working directory:\s*(\S+)/i);
          workingDir = (m1?.[1] || m2?.[1] || null) as string | null;
        } catch (_) {}
      }

      // Enhance user message with workspace context if available
      let enhancedUserMessage = userMessage;
      if (opts?.workspacePath) {
        enhancedUserMessage = `[Workspace: ${opts.workspacePath}]\n\n${userMessage}`;
        console.log('[ChainOfThought] Enhanced user message with workspace context:', enhancedUserMessage);
      }

      const baseAnalysisMessages = [
        { role: "system", content: this.buildIntentionAnalysisPrompt(opts?.workspacePath) },
        ...(workingDir
          ? [
              {
                role: "system" as const,
                content: `Context: You already have access to the user's working directory: ${workingDir}. Do not ask for the path again; proceed with analysis and include concrete commands when needed. If the task is complex, outline a short TODO plan and start with step 1.`,
              },
            ]
          : []),
        contextJsonMsg,
        ...context, // do not re-truncate here; caller already limits
        { role: "user", content: enhancedUserMessage },
      ];

      // Emit the full context JSON into logs for debugging/visibility
      try {
        ChainOfThoughtProcessor.progress(
          onProgress,
          "Conversation history JSON:\n" +
            JSON.stringify(context || [], null, 2),
        );
      } catch (_) {}

      let naturalResponse = "";
      let attempt = 1;
      const maxAttempts = 5;
      let passed = false;
      let lastValidatorFeedback: {
        reasons: string[];
        required_changes: string[];
      } = {
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
        ...(workingDir
          ? [
              {
                role: "system" as const,
                content: `Additional rule: The working directory is already confirmed (${workingDir}). Do NOT set needs_user_path or ask for path. Proceed with commands if appropriate.`,
              },
            ]
          : []),
        ...(opts?.workspacePath
          ? [
              {
                role: "system" as const,
                content: `CRITICAL: The user has workspace set to ${opts.workspacePath}. DO NOT set needs_user_path to true. DO NOT ask for paths. Use this workspace path directly in your commands with working_dir set to "${opts.workspacePath}".`,
              },
            ]
          : []),
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
        intention_analysis: parsedResult.intention_analysis,
        step_plan: parsedResult.step_plan || [],
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
