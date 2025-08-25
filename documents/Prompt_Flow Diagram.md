**Overview**
- Purpose: Map how a user prompt travels from the Vue UI to the LLM, how results are structured, and how commands run safely on the OS.
- Key paths: `src/views/ChatView.vue`, `src/services/chainOfThoughtProcessor.ts`, `src/services/agents/*`, `src-tauri/src/lib.rs`, `scripts/cerebras/cerebras-client.cjs`.

**Sequence Diagram (Compact)**
```
User
  |
  v
ChatView.vue --processUserMessage--> ChainOfThoughtProcessor
  |                                         |
  |                                         v
  |                                 AgentManager / Orchestrator
  |                                         |
  |                      +------------------+------------------+
  |                      |                                     |
  |                      v                                     v
  |               AnalyzerAgent (LLM)                 Fallback CoT Loop
  |                 |        |                       (Draft→Validate→Refine
  |                 |        |                        →JSON→Parse/Repair)
  |                 |        v                                    |
  |                 |  Rust invoke('cerebras_chat')               |
  |                 |        |                                    |
  |                 v        v                                    v
  |               Node Cerebras Client  -> Cerebras API    JSON result + commands
  |                 ^        ^                                    |
  |                 |        |                                    v
  |                 +--------+----------------------------- execute_shell_command?
  |                                         |
  |                             PlannerAgent (optional, LLM)
  |                                         |
  |                                   ExecutorAgent
  |                           (LLM reply or LLM→commands)
  |                                         |
  |                         Rust execute_shell_command (safe)
  |                                         |
  |<--------------------- final_response (+ outputs) ---------|
```

**Entry Points**
- UI Submit: `src/views/ChatView.vue` calls `ChainOfThoughtProcessor.processUserMessage(userText, context, onProgress)`.
- Context: Last ~10 messages are passed with timestamps and any prior command results.
- Streaming UX: `onProgress` updates the in-flight assistant bubble with analysis/log lines and then final response text.

**Primary Path (Multi‑Agent)**
- Orchestration: `processUserMessage()` → `processWithAgentSystem()` → `AgentManager` → `OrchestrationAgent.execute()`.
- Analyze: `AnalyzerAgent` calls LLM with a structured “intent analysis” system prompt to produce JSON (intent, complexity, capabilities, requirements).
- Strategy: `OrchestrationAgent` picks one of: direct‑execution (simple conversation), template‑execution (medium tasks), or full‑planning (complex tasks).
- Plan: `PlannerAgent` creates an `ExecutionPlan` (for complex tasks it may call the LLM to expand steps; otherwise uses templates).
- Execute: `ExecutorAgent` executes a step:
  - Conversation: Calls LLM to write the reply.
  - File/Command tasks: Calls LLM to generate a small set of safe, specific shell commands (with args + explanations), then runs them via Tauri.
- Result Shaping: The orchestrator converts results into the legacy format with `final_response`, optional `commands_to_execute`, and optional `needs_user_path`.

**Fallback Path (CoT Loop)**
- Draft: LLM generates a natural response with `CHAIN_OF_THOUGHT_PROMPT`.
- Validate: LLM validates that draft against strict rules (ask for path when needed, include concrete commands, no web search). Returns minified JSON verdict.
- Refine: If validation fails, LLM revises the draft using validator feedback (up to 5 attempts).
- Format: LLM converts the accepted draft to JSON with `JSON_FORMATTER_PROMPT` (includes `final_response`, `commands_to_execute`, and path needs).
- Parse + Repair: The processor sanitizes, repairs, or re-asks the LLM to repair JSON deterministically if needed.
- Execute: Any `commands_to_execute` are run via Tauri and appended to the visible message with outputs.

**LLM Call Chain**
- Frontend: Agents and CoT call `invoke('cerebras_chat', { messages, model, ... })`.
- Rust bridge: `src-tauri/src/lib.rs` `cerebras_chat`/`cerebras_completion` spawn `node scripts/cerebras/cerebras-client.cjs`.
- Node client: `scripts/cerebras/cerebras-client.cjs` uses `@cerebras/cerebras_cloud_sdk` with `process.env.CEREBRAS_API_KEY` from `.env`.
- Models: Defaults vary by call site (see Model Selection) and can be overridden per request.

**Command Execution & Safety**
- Where: `invoke('execute_shell_command', { command, args, workingDir })` → Rust `execute_shell_command`.
- Validation: Blocks dangerous characters (`;`, `|`, `&`, backticks, `$(`), restricts to safe directories (user home/documents/downloads/desktop), and special‑cases safe `sh -c "echo ... > file"` writes.
- PATH: Restricted PATH and shell env removed to avoid ambient shell behaviors.

**Model Selection**
- Agent system default: `src/services/agents/baseAgent.ts` sets `model: 'qwen-3-coder-480b'`, `max_tokens: 65536`, `temperature: 0.3` unless overridden.
- CoT pipeline: `src/services/chainOfThoughtProcessor.ts` uses `qwen-3-coder-480b` for draft/validator/formatter and high token limits; can be tuned per call.
- Generic Cerebras service: `src/services/cerebras.ts` defaults to `llama3.1-8b` if used directly.

**Progress & UI**
- Phases: `analysis_start`, `analysis_chunk`, `analysis_done`, `format_start`, `format_done`, `log`, `error`.
- Path Requests: If `needs_user_path` is true, the UI opens a folder picker or manual path input; the chosen path is persisted per session and re‑tried automatically.

**End‑to‑End (TL;DR)**
- User types → `ChatView.vue` → ChainOfThought.
- Prefer multi‑agent: Analyzer → (Planner) → Executor (LLM for reply or LLM→commands→Tauri exec).
- Or fallback CoT: Draft → Validate→Refine → Format→Parse→Exec.
- Rust→Node→Cerebras for all LLM calls; Rust validates/sandboxes all shell.

**Change Default Model**
- Global agent default (affects Analyzer/Planner/Executor):
  - File: `src/services/agents/baseAgent.ts`
  - Change in `callLLM(...)` the `model` default, e.g.:
    - From: `model: request.model || "qwen-3-coder-480b"`
    - To:   `model: request.model || "llama-3.3-70b"`
- Chain‑of‑Thought fallback pipeline (draft/validate/format/repair):
  - File: `src/services/chainOfThoughtProcessor.ts`
  - Update `model: "qwen-3-coder-480b"` in these invocations of `invoke("cerebras_chat", ...)`:
    - Drafting, Validator, JSON Formatter, JSON Repair.
  - Example change:
    - `model: "llama-3.3-70b", max_tokens: 65536, temperature: 0.3`
- Generic CerebrasService defaults (if used directly):
  - File: `src/services/cerebras.ts`
  - Defaults to `llama3.1-8b` — change to another in `completion()`/`chat()` if desired.
- Node client fallback defaults (rarely used directly):
  - File: `scripts/cerebras/cerebras-client.cjs`
  - The `chatCompletion()`/`completion()` methods default to `llama3.1-8b` if the Rust bridge doesn’t pass a model.
- Verify available models:
  - See `src/services/cerebras.ts` `CEREBRAS_MODELS` list or call the `cerebras_models` Tauri command.
- Credentials:
  - Ensure `.env` has `CEREBRAS_API_KEY` for the Node client.

Quick test after changes
- Run: `npm run tauri dev`
- Send a prompt and check console for model names in LLM calls or instrument logs if needed.
