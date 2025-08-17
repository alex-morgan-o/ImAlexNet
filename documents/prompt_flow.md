# AlexNet Data Flow

## Overview
A concise walkthrough of how a user prompt travels through AlexNet (Vue + Tauri/Rust) from input to rendered output and persistence.

## High-Level Steps
1. User enters a prompt in the chat input and submits.
2. Frontend validates, renders an optimistic message, and persists to session.
3. Frontend invokes a Tauri command for processing (model/tooling/filesystem as needed).
4. Backend executes the request (LLM call/tooling/OS ops) and streams or returns results.
5. Frontend renders assistant output and updates session state.

## Sequence (Prompt → Processing → Output)
- Input: User types prompt in the chat box (`src/components/ChatView.vue` or equivalent) and clicks send.
- Pre‑process (FE):
  - Trim/validate text; attach current model, session id, and optional context (files, code blocks, system message).
  - Persist user message via session manager (creates session on first message if needed).
- Dispatch (FE → BE):
  - Call Tauri using `invoke()` with a command such as `process_prompt` (placeholder; similar to existing `greet`).
  - Payload includes: `session_id`, `model`, `messages` context window, and any tool/OS intents.
- Execute (BE/Rust):
  - Validate payload; load session context if necessary.
  - Route to capability: local LLM, remote API, or a tool (filesystem, opener, etc.).
  - Stream or compute a result; transform to normalized assistant message.
  - Optionally persist assistant message server‑side (or return to FE for unified persistence).
- Return (BE → FE):
  - Respond with `assistant` message chunks (stream) or a full message (non‑stream).
  - Include metadata (tokens, timing, tool results, errors if any).
- Render (FE):
  - Append assistant message to chat; progressively update if streaming.
  - Persist assistant message via session manager; update last modified/indices.
  - Trigger UI side effects (scroll, unread markers, copy buttons).

## Data Contracts (Minimal Shape)
- User message (FE):
  ```json
  {
    "id": "string",
    "role": "user",
    "content": "string",
    "files": ["optional string"],
    "timestamp": "ISO 8601"
  }
  ```
- Request to BE (invoke):
  ```json
  {
    "session_id": "string",
    "model": "string",
    "messages": [ { "role": "user|assistant|system", "content": "string" } ],
    "tools": ["optional"],
    "options": { "stream": true }
  }
  ```
- Assistant message (BE → FE):
  ```json
  {
    "id": "string",
    "role": "assistant",
    "content": "string",
    "timestamp": "ISO 8601",
    "metadata": { "tokens": 0, "finish_reason": "stop|length|tool" }
  }
  ```

## Persistence
- Storage: File‑based sessions under `~/.alexnet/<session-id>/chat.json`.
- Write path: FE persists both user and assistant messages using the Session Manager (see `documents/session_management.md`).
- Indexing: FE updates list entries (name, preview, timestamps) on message save.

## Error Handling
- FE validation errors: inline prompts, disabled send, retry.
- Invoke errors: show toast/banner; keep user message; allow resend.
- Tool/OS errors: structured error messages returned from BE; surface actionable detail.

## Privacy & Security
- All session data saved locally; no network transmission unless an external model/plugin is configured.
- File/dir permissions are user‑only; avoid sensitive data in IDs/names.

## Example Flow (Concise)
- User: “Summarize notes from today’s meeting.”
- FE: saves message → `invoke('process_prompt', payload)`.
- BE: runs model/tooling → returns summary text.
- FE: renders assistant message → saves to session → scrolls to bottom.

## Notes for Implementers
- Current Tauri example command is `greet`; add `process_prompt`/similar in `src-tauri/src/lib.rs` for real processing.
- Prefer streaming for responsiveness; buffer in FE for smooth UX.
- Keep message schema backward compatible; migrate sessions if fields change.

# Prompt Execution Flow (Backend Mapping)

This maps each step of the Execute (BE/Rust) flow to concrete files/functions.

- Validate payload; load session context
  - `src-tauri/src/lib.rs`: `validate_shell_command(...)` — validates allowed commands/args and path safety.
  - `src-tauri/src/lib.rs`: `load_chat_session(...)` — loads session from `~/.alexnet/<session>/chat.json` (used by save/export).
  - `src-tauri/src/lib.rs`: `cerebras_chat(...)`, `cerebras_completion(...)` — JSON serialization/parsing acts as basic input validation (no explicit schema).

- Route to capability (LLM / tools / OS)
  - Remote LLM: `src-tauri/src/lib.rs` → `cerebras_chat(...)`, `cerebras_completion(...)` (calls `scripts/cerebras/cerebras-client.cjs`).
  - Tools/OS: `src-tauri/src/lib.rs` → `execute_shell_command(...)` (runs whitelisted commands with safety checks).
  - App opener plugin: `src-tauri/src/lib.rs` → initialized in `run()` via `tauri_plugin_opener::init()`.

- Compute/transform result (return assistant message payload)
  - `src-tauri/src/lib.rs`: `cerebras_chat(...)`, `cerebras_completion(...)` — execute Node script, capture stdout, extract JSON, parse to `CerebrasResponse`, return to FE. (No server-side streaming; FE handles progressive UI updates.)

- Persist assistant message (server vs. frontend)
  - Frontend persistence (current path): `src/services/sessionManager.ts` → `saveMessage(...)` calls Tauri `save_chat_message`.
  - Backend write API: `src-tauri/src/lib.rs` → `save_chat_message(...)` updates session `chat.json`; companions: `load_chat_session(...)`, `export_chat_session(...)`.

- Entrypoints/registration
  - `src-tauri/src/lib.rs`: `run()` registers Tauri commands via `invoke_handler!(...)`.
  - `src-tauri/src/main.rs`: `alexnet_lib::run()` — application entry.

Notes
- Streaming flags are plumbed through to the Node client, but Rust currently returns the full result after completion.
- Assistant message persistence is unified in the frontend; switching to backend-side persistence would route through `save_chat_message(...)` after LLM completion.
