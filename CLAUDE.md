# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AlexNet is a Tauri-based desktop application that combines a Rust backend with a Vue.js + TypeScript frontend. The app is designed as a consumer-grade AI interface with a beautiful, simple UI that can interact with the user's OS, modify files, handle autonomous tasks, and serve as an AI thought partner. The project follows the PRD specifications for creating an intuitive graphical interface emphasizing ease over CLI complexity.

## Development Commands

### Frontend Development
- `npm run dev` - Start Vite development server (runs on port 1420)
- `npm run build` - Type-check with vue-tsc and build for production
- `npm run preview` - Preview production build locally

### Tauri Development
- `npm run tauri dev` - Start Tauri development mode (launches desktop app with hot reload)
- `npm run tauri build` - Build the Tauri application for production
- `npm run tauri` - Access Tauri CLI commands

### Type Checking
- `vue-tsc --noEmit` - Run TypeScript compiler for type checking (included in build)

## Architecture

### Frontend (Vue.js + TypeScript)
- **Entry Point**: `src/main.ts` - Creates Vue app and mounts to DOM
- **Main Component**: `src/App.vue` - Currently contains basic Tauri + Vue template
- **Build Tool**: Vite with Vue plugin and TypeScript support
- **UI Framework**: Vue 3 with Composition API (`<script setup>`)
- **Styling**: Scoped CSS with dark/light theme support via `prefers-color-scheme`

### Backend (Rust + Tauri)
- **Main Entry**: `src-tauri/src/main.rs` - Application entry point
- **Core Logic**: `src-tauri/src/lib.rs` - Contains Tauri commands and app initialization
- **Commands**: Currently implements `greet` command as example
- **Plugins**: Uses `tauri-plugin-opener` for opening external resources
- **Configuration**: `src-tauri/tauri.conf.json` - Tauri app configuration

### Key Integrations
- **Frontend-Backend Communication**: Uses `@tauri-apps/api/core` `invoke()` function to call Rust commands
- **Build Process**: Vite builds frontend, Tauri packages it with Rust backend
- **Development Server**: Vite dev server on port 1420, HMR on port 1421

## Project Structure
```
src/                  # Vue.js frontend source
├── App.vue          # Main Vue component
├── main.ts          # Application entry point
└── assets/          # Static assets

src-tauri/           # Rust backend source
├── src/
│   ├── main.rs      # Rust application entry
│   └── lib.rs       # Core Tauri application logic
├── Cargo.toml       # Rust dependencies
└── tauri.conf.json  # Tauri configuration

public/              # Static public assets
dist/                # Built frontend (generated)
```

## Design System
The PRD specifies using One Dark Pro theme colors:
- Background: `#282c34`
- Foreground: `#abb2bf`
- Primary accent: `#61afef` (blue)
- Success: `#98c379` (green)
- Warning: `#d19a66` (orange)
- Error: `#e06c75` (red)

Current implementation includes responsive dark/light theme support via CSS media queries.

## Development Notes

### Tauri-Specific Considerations
- Frontend runs on fixed port 1420 for Tauri integration
- Vite is configured to ignore `src-tauri` directory for file watching
- CSP is disabled in development (`"csp": null`)
- Window size defaults to 800x600

### TypeScript Configuration
- Strict mode enabled with additional linting rules
- Configured for ES2020 with DOM types
- Uses bundler module resolution for modern build tools

### Adding New Features
When implementing the AI interface per PRD requirements:
1. Add new Tauri commands in `src-tauri/src/lib.rs`
2. Create corresponding frontend components in `src/`
3. Use Vue 3 Composition API with TypeScript
4. Follow the established patterns for Tauri API integration
5. Implement the chat-like interface with model selection capabilities

## Framework Guidelines

**IMPORTANT**: This project uses Vue.js exclusively for the frontend. NEVER use React, React components, or React patterns. Always use:
- Vue 3 with Composition API and `<script setup>` syntax
- Vue-specific directives (`v-if`, `v-for`, `v-model`, etc.)
- Vue component lifecycle hooks (`onMounted`, `onUnmounted`, etc.)
- Vue reactive primitives (`ref`, `reactive`, `computed`, etc.)
- Vue router for navigation (if routing is needed)
- Vue-compatible UI libraries only