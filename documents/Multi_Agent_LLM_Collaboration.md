**Overview**
- AlexNet uses a lightweight multi‑agent pattern to break down non‑trivial requests and delegate to specialized roles. Each agent can make focused LLM calls with role‑specific system prompts.
- Key paths: `src/services/agents/*` and `src/services/chainOfThoughtProcessor.ts` (entry), plus `src-tauri/src/lib.rs` and `scripts/cerebras/cerebras-client.cjs` for the LLM bridge.

**Agents**
- Orchestrator: Decides strategy, coordinates agents, tracks plan state, converts results to legacy shape.
- Analyzer: Infers user intent, complexity, required capabilities, and context needs; outputs normalized JSON.
- Planner: Creates `ExecutionPlan` with `PlanStep`s; uses templates for medium tasks and LLM expansion for complex tasks.
- Executor: Runs a step. For conversation, calls LLM for the reply. For actions, asks LLM to generate safe commands, then executes via Tauri and returns outputs.

**Sequence (Compact)**
```
User Prompt
   |
   v
Orchestrator
   |
   +--> Analyzer (LLM) -----> Analysis JSON
   |
   +--> Planner (LLM/template) -> ExecutionPlan (steps)
   |
   +--> Executor
           |-- Conversation -> LLM reply
           |-- Actions -> LLM generates commands -> Tauri executes
   |
   v
Final result to UI (final_response, optional commands, path requests)

Fallback: If agent system errors, legacy CoT pipeline handles draft → validate/refine → JSON → parse/repair → exec.
```

**Information Hand‑Off**
- Input Context: All agents receive `AgentContext` with `userPrompt`, recent `conversationHistory`, optional `workspaceState`, and a progress callback.
- Analyzer Output: `AnalysisResult` JSON (intentCategory, complexity, capabilities, context requirements, reasoning).
- Planner Output: `ExecutionPlan` with ordered `PlanStep`s (agent type per step, inputs, status).
- Executor Output: `ExecutionResult` with `finalResponse`, optional `commands`, and optional `needsUserPath` + `pathRequest`.
- Orchestrator Output: Legacy‑shape result `{ final_response, commands_to_execute, needs_user_path, path_request }` for the UI.

**Decision Logic**
- Strategy Selection (Orchestrator):
  - Direct‑execution: Simple conversation → send to Executor to respond.
  - Template‑execution: Medium tasks → Planner creates minimal plan → Executor runs.
  - Full‑planning: Complex tasks → Planner asks LLM for detailed steps → Executor runs.

**LLMs Working Together (by Role)**
- Same LLM endpoint, different “roles”: Each agent uses a focused system prompt for its responsibility:
  - Analyzer: Classify intent and requirements; return strict JSON only.
  - Planner: Expand tasks into steps; return JSON plan schema.
  - Executor: Either write a conversational reply or produce executable, well‑explained commands in JSON.
- Benefits: Smaller prompts, clearer contracts, easier validation per stage, and natural fallbacks when one role fails.

**Error Handling & Fallbacks**
- Health Checks: Agents implement `healthCheck()` that pings the LLM to verify connectivity.
- Analyzer Fallback: If parsing/LLM fails, Analyzer returns a heuristic analysis.
- Planner Fallback: If LLM plan parse fails or unavailable, Planner creates a template plan.
- Orchestrator Fallback: If agent system fails entirely, Chain‑of‑Thought legacy pipeline takes over (draft → validate/refine → format → parse/repair → exec).

**Command Execution Safety**
- Generation: Executor asks the LLM for JSON commands with `command`, `args[]`, `explanation`, optional `working_dir`.
- Validation: Rust `execute_shell_command` blocks dangerous characters, restricts to safe directories, and constrains env.
- Path Queries: If a task implies file access and no working directory is set, the Executor returns `needsUserPath` with an explicit `pathRequest`; the UI prompts the user.

**Where To Adjust Behavior**
- Prompts: See each agent’s system prompt in its file (e.g., Analyzer’s `getAnalysisSystemPrompt()`, Planner’s detailed planning prompt, Executor’s command generation prompt).
- Default Model: `src/services/agents/baseAgent.ts` (change `model`, `max_tokens`, `temperature` for all agents) and specific overrides in `chainOfThoughtProcessor.ts` for the CoT fallback.
- Safety: `src-tauri/src/lib.rs` for command validation and allowed directories.

**Minimal Sequence Example**
- User asks: “Find all TODOs in my project.”
- Analyzer: Intent=file_operation, needsWorkspace=true → outputs JSON.
- Orchestrator: Strategy=template‑execution.
- Planner: Template plan with path check + file scan step.
- Executor: Sees no working directory → returns `needsUserPath` and guidance.
- UI: Prompts for folder → user selects path → request retried with WD.
- Executor: Calls LLM to generate `grep`/`ripgrep` commands → Tauri executes → outputs included in `final_response`.

Additional Implementation Details
- Workspace & Sessions:
  - Default workspace is `~/AlexNet`; status via `get_workspace_status`, creation via `create_workspace` (both in `src-tauri/src/lib.rs`).
  - Current path stored in `~/.alexnet/settings.json`. Sessions persist in `~/.alexnet/<session-id>/chat.json` through `create_chat_session`, `save_chat_message`, `load_chat_session`, etc.
- Tooling Detection:
  - On startup, backend emits `tools:availability` with `{ claude, codex, gemini }` and persists a full `tools.json` snapshot to `~/.alexnet`.
  - Frontend uses `src/services/tooling.ts` to listen and refresh via `get_tool_availability` / `get_tools_snapshot`.
- Delegation to Local CLIs:
  - Chain‑of‑Thought processor prefers Codex CLI if present, otherwise Claude CLI. It returns `commands_to_execute` shaped for the selected tool and defers execution to the backend for safety.
  - Backend resolves binaries conservatively (including NVM/homebrew paths) and narrows `PATH` during execution.
