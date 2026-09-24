# Aeio

Aeio is a local-first personal AI assistant that lives on your desktop instead of inside a browser tab. It combines persistent, transparently editable long-term memory with real OS-level tool execution—allowing you to search local files, read or write clipboards, execute shell scripts with explicit approval gates, and maintain contextual knowledge across months of work. Powered natively by local open-weight models (such as Qwen3-Coder via Ollama) with zero data leakage, Aeio also provides optional Bring-Your-Own-Key (BYOK) cloud provider support (Anthropic Claude, OpenAI) stored securely in your OS keychain.

---

## Key Features

- **Global Hotkey Access**: Summon Aeio from any application (`Cmd+Shift+Space` on macOS, `Ctrl+Shift+Space` on Windows/Linux) without switching contexts or opening browser tabs.
- **Transparent, Editable Memory**: Auto-proposes and persists facts, preferences, projects, and contacts with BM25 keyword search, FTS5 full-text indexing, and cosine similarity vector retrieval.
- **Agentic OS Execution**: Inspects frontmost application context, executes terminal commands, reads/searches files, and manipulates clipboard with strict human-in-the-loop confirmation for destructive actions.
- **Local-First & Offline**: Powered primarily by Qwen3-Coder running on local Ollama inference, ensuring private files, prompt history, and system interactions never leave your machine.
- **Workspace Scoping**: Organize memories, conversations, and context into isolated project workspaces with zero cross-project leakage.
- **Composite Design Aesthetic**: Dark obsidian palette (`#090a0c`, `#0f1115`), hairline borders, terracotta `#f05623` accents, and zero distracting emojis.

---

## Building from Source

### Prerequisites

1. **Node.js**: v20 or higher ([Download](https://nodejs.org/))
2. **Rust**: Latest stable toolchain via rustup ([Install Rust](https://rustup.rs/))
3. **Local AI Engine**: [Ollama](https://ollama.com/) with Qwen3-Coder model pulled:
   ```bash
   ollama pull qwen2.5-coder:7b
   ```
4. **Platform Dependencies**:
   - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
   - **Linux**: `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libxdo-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`
   - **Windows**: Microsoft Visual Studio C++ Build Tools and WebView2 Runtime

### Setup & Development

1. Clone the repository:
   ```bash
   git clone https://github.com/jaggureddy11/aeio.git
   cd aeio
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Fetch and verify semantic embedding model weights:
   - **macOS / Linux**:
     ```bash
     bash scripts/fetch-models.sh
     ```
   - **Windows (PowerShell)**:
     ```powershell
     .\scripts\fetch-models.ps1
     ```

4. Run in local development mode:
   ```bash
   npm run tauri dev
   ```

5. Build production bundle:
   ```bash
   npm run tauri build
   ```

---

## Verification & Testing

Aeio maintains automated test suites across both frontend and backend layers:

- **Frontend Tests (Vitest)**:
  ```bash
  npm test
  ```
- **Backend Tests (Cargo)**:
  ```bash
  cargo test --manifest-path src-tauri/Cargo.toml
  ```
- **5,000-Memory Scale Benchmark**:
  ```bash
  cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture test_synthetic_5000_memories_search_benchmark
  ```

---

## Your Data & Privacy

Aeio is built from the ground up as a local-first system. You have absolute ownership and control over your memories, conversations, and keys:

### 1. Where Data Lives on Disk
All persistent memories, conversation records, and workspace configurations are stored in an encrypted/local SQLite database:
- **macOS**: `~/Library/Application Support/com.aeio.desktop/aeio_memories.db`
- **Windows**: `%APPDATA%\com.aeio.desktop\aeio_memories.db`
- **Linux**: `~/.local/share/com.aeio.desktop/aeio_memories.db`

API keys are **never** written to this database or any plaintext file on disk—they are stored exclusively in your operating system's native secure credential manager (macOS Keychain, Windows Credential Manager, or Linux Secret Service via FreeDesktop DBus).

### 2. Exporting Your Data
You can export your entire memory store at any time with one click from the **Memory Panel**:
- **JSON**: Machine-readable format containing full timestamps, IDs, categories, and contents (`exports/aeio-memories.json`).
- **Markdown**: Formatted, human-readable document organized into distinct category sections (`exports/aeio-memories.md`).

### 3. Complete Data Removal & Uninstallation
To completely remove Aeio and purge all traces of your data:
1. Delete the application bundle from `/Applications` (macOS) or Windows Add/Remove Programs.
2. Delete the application data directory:
   - **macOS**: `rm -rf "$HOME/Library/Application Support/com.aeio.desktop"`
   - **Windows**: Remove `%APPDATA%\com.aeio.desktop`
   - **Linux**: `rm -rf "$HOME/.local/share/com.aeio.desktop"`
3. Remove stored API keys from OS keychain (e.g. search for `aeio` in macOS Keychain Access or Windows Credential Manager).

---

## License

Proprietary. All Rights Reserved.  
Copyright © 2026 Aeio.
