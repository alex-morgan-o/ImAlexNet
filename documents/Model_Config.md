**Overview**
- This note summarizes where AlexNet sets default LLM models, tokens, and temperatures, and how to change them safely.

**Defaults (Where They Live)**
- Agents (Analyzer/Planner/Executor): `src/services/agents/baseAgent.ts`
  - In `callLLM(...)`, defaults: `model: 'qwen-3-coder-480b'`, `max_tokens: 65536`, `temperature: 0.3` unless the caller overrides.
- Chain‑of‑Thought fallback: `src/services/chainOfThoughtProcessor.ts`
  - Draft, Validator, JSON Formatter, JSON Repair each set `model: 'qwen-3-coder-480b'` with high token limits.
- Generic Cerebras service helpers: `src/services/cerebras.ts`
  - Defaults to `llama3.1-8b` for direct `completion()`/`chat()` usage.
- Node client (Rust bridge target): `scripts/cerebras/cerebras-client.cjs`
  - Falls back to `llama3.1-8b` if the Rust side doesn’t pass a model.

**Change Steps**
- Global agent default (affects Analyzer/Planner/Executor):
  - Edit `src/services/agents/baseAgent.ts` in `callLLM(...)`:
    - `model: request.model || 'llama-3.3-70b'`
    - Optionally adjust `max_tokens` and `temperature`.
- CoT fallback models:
  - Edit `src/services/chainOfThoughtProcessor.ts` where `invoke('cerebras_chat', ...)` is used for:
    - Drafting, Validator, JSON Formatter, JSON Repair.
  - Example: `model: 'llama-3.3-70b', max_tokens: 65536, temperature: 0.3`.
- Cerebras service defaults:
  - Edit `src/services/cerebras.ts` to change the default model for `completion()` and `chat()`.
- Verify available models:
  - Check `CEREBRAS_MODELS` in `src/services/cerebras.ts` or call the `cerebras_models` command from the frontend.

**Credentials**
- Ensure `.env` contains `CEREBRAS_API_KEY` (the Node client loads it from `scripts/cerebras/cerebras-client.cjs`).

**Quick Test**
- Run: `npm run tauri dev`
- Send a prompt and observe devtools/console logs for model names in LLM calls, or temporarily log the `model` in agent calls.

**Notes**
- Higher `max_tokens` may increase latency and cost.
- Keep `temperature` low (0.2–0.4) for analysis/planning; raise slightly for conversational tone (0.6–0.8) as needed.
