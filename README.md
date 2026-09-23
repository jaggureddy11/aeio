# Aeio — Personal Desktop AI Assistant

<p align="center">
  <img src="public/logo.png" width="96" height="96" alt="Aeio logo" />
</p>

<p align="center">
  <strong>An assistant embedded in your computer that knows you and can act for you.</strong>
</p>

---

## Overview

**Aeio** is a personal AI assistant that lives on your desktop instead of in a browser tab, remembers things about you the way a human assistant would, and can actually act on your machine instead of just talking.

> **In one sentence:** It is the difference between *"a chatbot you visit"* and *"an assistant embedded in your computer that knows you and can act for you."*

---

## Concretely, What Someone Uses It For

1. **Instant access, anywhere on the OS**  
   Hit a hotkey (`Cmd+Shift+Space` on macOS, `Ctrl+Shift+Space` on Windows/Linux) from inside any application—your code editor, a PDF reader, a terminal, or a browser—and ask something immediately, without switching windows or opening a browser tab first.

2. **A second brain that doesn't forget**  
   Instead of re-explaining your context every conversation (like you do with a normal chatbot), Aeio keeps a running, editable memory of your facts, projects, and preferences. Ask it something in March, it still knows it in September—and you can see exactly what it remembers and edit or delete it if it is ever inaccurate.

3. **Actually does things, not just describes them**  
   *"Find that PDF I saved last week,"* *"Summarize what is on my clipboard,"* *"Rename these files,"* *"Run this script"*—Aeio executes operations directly on your machine (with your explicit approval) instead of giving you a numbered tutorial to do it yourself.

4. **Private by default**  
   Runs against a local model (Ollama) with nothing leaving your machine, and only calls out to Claude/GPT when you explicitly choose to for more demanding reasoning tasks. It is fully usable even for confidential data, proprietary code, and personal notes you would never paste into a web chat service.

5. **Free to use, no account required**  
   Because it runs locally by default, there is no login, no subscription, and no per-message cost—download it and it works immediately.

---

## Capabilities Architecture

Aeio is engineered across five structured capability tiers:

### Tier 0 — Foundation
- **Global Summon**: Instant show/hide from anywhere via `Cmd+Shift+Space` (macOS) or `Ctrl+Shift+Space` (Windows/Linux). Works seamlessly over full-screen applications.
- **Offline Local-First Chat**: Connects directly to local Ollama daemon (`llama3.2` default).
- **Encrypted BYOK**: Secure storage of Claude and OpenAI API keys directly in native OS Keychain (macOS Keychain / Windows Credential Manager). Zero plaintext key storage.
- **Persistent SQLite History**: Full chat history and message states persist across application restarts.

### Tier 1 — Structured Memory
- **Memory Categories**: Tagged knowledge base categorized into `fact`, `preference`, `project`, and `person`.
- **Auto-Capture Proposals**: Aeio proposes enduring memories via `<remember>` tags that require explicit user approval.
- **Transparent Recall**: Citations badge on assistant responses allows inspecting exactly which memories were recalled.
- **Data Sovereignty**: Instant export to plain Markdown (`.md`) or JSON (`.json`).

### Tier 2 — Tool Execution & OS Integration
- **Local Host Tools**:
  - `read_file` (with 1MB safe size cap)
  - `search_files` (directory search)
  - `read_clipboard` & `write_clipboard`
  - `run_shell` (system terminal execution)
  - `open_target` (launches default apps, files, or URLs)
- **Destructive Command Gatekeeper**: Destructive operations (`rm`, `del`, `format`, `truncate`, etc.) trigger a prominent red hazard warning requiring explicit authorization.
- **Scoped Approval Memory**: Non-destructive commands can be marked "always allow for this session".
- **Active Window Awareness (Opt-in)**: Queries frontmost application title on summon to provide host context. Strictly opt-in; never reads screen pixels or window contents.

### Tier 3 — Model Intelligence
- **Multi-Provider Routing**: Seamless switching between offline Ollama and cloud BYOK models.
- **Zero-Leak Transparency**: Visual `Zero-leak` badge displayed on responses processed strictly on-device.
- **Streaming Responses**: Real-time token streaming with automatic XML tool tag filtering.
- **Graceful Degradation**: Clear diagnostic banners with 1-click **Retry** when Ollama is offline.

### Tier 4 — Project-Scoped Workspaces
- **Workspace Isolation**: Scoped chat history and memory recall per project.
- **Workspace Switcher**: Intuitive top-bar dropdown with active status indicator and clean SVG icons.
- **Cross-Workspace Global Search**: Search all workspaces simultaneously when needed.
- **Safe Archiving**: Archive inactive workspaces without data loss.

### Tier 5 — Ambient Intelligence (Opt-in)
- **Visible Ambient Indicator**: Pulsing status badge in the header whenever enabled.
- **Pattern Noticing**: Lightweight detection of repeated queries or relevant workspace notes.
- **Proactive Nudges**: 1-click dismissible suggestion cards that never block the UI or reappear after dismissal.
- **Instant Opt-out**: Single toggle in Settings stops all checks with zero background CPU/network usage.

---

## Tech Stack

- **Desktop Runtime**: [Tauri v2](https://v2.tauri.app/)
- **Core Backend**: Rust (safe concurrency, AppleScript/Win32 APIs, native keychain)
- **Database**: SQLite via [rusqlite](https://github.com/rusqlite/rusqlite) (bundled)
- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/)
- **Styling**: Vanilla CSS inspired by Composite (Roobert/Inter grotesque typography, warm obsidian surfaces, hairline borders)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Icons**: [Lucide React](https://lucide.dev/) (100% emoji-free)

---

## Development & Building

### Prerequisites
- Node.js (v18+)
- Rust & Cargo
- [Ollama](https://ollama.com/) (optional for local models): `ollama pull llama3.2`

### Run Locally
```bash
# Install dependencies
npm install

# Start development daemon (Hot-reloading frontend + Rust backend)
npm run tauri dev
```

### Run Tests
```bash
# Backend Rust unit tests
cd src-tauri && cargo test

# Frontend typecheck & bundle
npm run build
```

### Build Standalone Production Bundles
```bash
# Compile optimized native desktop app and macOS DMG / Windows installer
npm run tauri build
```

Production artifacts will be generated in `src-tauri/target/release/bundle/`.

---

## License
MIT License. Built for privacy, speed, and local autonomy.
