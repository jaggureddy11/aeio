# Aeio — Local-First Desktop AI Assistant

<p align="center">
  <img src="public/logo.png" width="96" height="96" alt="Aeio logo" />
</p>

<p align="center">
  <strong>Fast, private, local-first desktop intelligence with persistent memory, workspace isolation, and native OS superpowers.</strong>
</p>

---

## 🌟 Overview

**Aeio** is an autonomous desktop AI assistant built on Tauri v2, Rust, and React 19. It runs 100% offline out-of-the-box via local Ollama models with zero cloud dependencies, while also supporting Bring-Your-Own-Key (BYOK) for Anthropic Claude and OpenAI with encrypted OS Keychain security.

Unlike generic web-wrapper chatbots, Aeio is built specifically for local desktop workflows:
- **Zero-leaks by default**: Conversations, memory, and tool actions execute locally on your hardware.
- **Transparent memory**: View, edit, tag, search, and export memories anytime.
- **Safety-first execution**: Native OS tools with an explicit gatekeeper and destructive action hazard warnings.
- **Instant summoning**: Global keyboard shortcut summons and centers Aeio from anywhere in the OS.

---

## 🚀 Capabilities

Aeio is engineered across five structured capability tiers:

### Tier 0 — Foundation
- **Global Summon**: Instant show/hide from anywhere via `Cmd+Shift+Space` (macOS) or `Ctrl+Shift+Space` (Windows/Linux). Works seamlessly over full-screen apps.
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
- **Zero-Leak Transparency**: Visual `🔒 Zero-leak` badge displayed on responses processed strictly on-device.
- **Streaming Responses**: Real-time token streaming with automatic XML tool tag filtering.
- **Graceful Degradation**: Clear diagnostic banners with 1-click **Retry** when Ollama is offline.

### Tier 4 — Project-Scoped Workspaces
- **Workspace Isolation**: Scoped chat history and memory recall per project.
- **Workspace Switcher**: Intuitive top-bar dropdown with active status indicator and custom emoji icons.
- **Cross-Workspace Global Search**: Search all workspaces simultaneously when needed.
- **Safe Archiving**: Archive inactive workspaces without data loss.

### Tier 5 — Ambient Intelligence (Opt-in)
- **Visible Ambient Indicator**: Pulsing `✨ Ambient Active` badge in the header whenever enabled.
- **Pattern Noticing**: Lightweight detection of repeated queries or relevant workspace notes.
- **Proactive Nudges**: 1-click dismissible suggestion cards that never block the UI or reappear after dismissal.
- **Instant Opt-out**: Single toggle in Settings stops all checks with zero background CPU/network usage.

---

## 🛠️ Tech Stack

- **Desktop Runtime**: [Tauri v2](https://v2.tauri.app/)
- **Core Backend**: Rust (safe concurrency, AppleScript/Win32 APIs, native keychain)
- **Database**: SQLite via [rusqlite](https://github.com/rusqlite/rusqlite) (bundled)
- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Icons**: [Lucide React](https://lucide.dev/)

---

## 💻 Development & Building

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

---

## 📄 License
MIT License. Built for privacy, speed, and local autonomy.
