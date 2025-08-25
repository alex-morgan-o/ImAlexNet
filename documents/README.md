AlexNet Documentation Index

- Prompt Flow: See `Prompt_Flow Diagram.md` for the end-to-end path from user input in the UI to LLM calls, JSON planning, and command execution via Tauri.
- Multi‑Agent LLM Collaboration: See `Multi_Agent_LLM_Collaboration.md` for how the Analyzer, Planner, Executor, and Orchestrator delegate work and exchange data.

Notes
- File paths in this repo use Vue 3 on the frontend and Tauri (Rust) on the backend. All LLM traffic routes through the Rust bridge to a Node client that calls the Cerebras SDK.
- Models and prompts are centralized where noted so you can adjust behavior in one place.
