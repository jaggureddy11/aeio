# Architecture & Engineering Decision Records (`decisions.md`)

This document records the foundational and ongoing technical and architectural decisions for **Aeio** (Desktop & Agent System). Each entry details **what** was implemented or modified, **why** this approach was chosen, and **why** specific libraries or methods were selected over alternatives.

---

## Index of Decisions

1. [ADR-001: Desktop Foundation — Tauri v2 + Rust over Electron](#adr-001-desktop-foundation--tauri-v2--rust-over-electron)
2. [ADR-002: UI Design System — Claude-Inspired Aesthetic & CSS Design Tokens](#adr-002-ui-design-system--claude-inspired-aesthetic--css-design-tokens)
3. [ADR-003: LLM Provider Architecture — AWS Bedrock (`ap-southeast-2`) over Local Models](#adr-003-llm-provider-architecture--aws-bedrock-ap-southeast-2-over-local-models)
4. [ADR-004: Tiered Model Routing Engine](#adr-004-tiered-model-routing-engine)
5. [ADR-005: Cross-Platform Native OS Input & Automation (macOS & Windows)](#adr-005-cross-platform-native-os-input--automation-macos--windows)
6. [ADR-006: Hardware Safety Architecture & Kill Switch](#adr-006-hardware-safety-architecture--kill-switch)
7. [ADR-007: Hands-Free Ambient Voice Engine & Dynamic Island Notch Window](#adr-007-hands-free-ambient-voice-engine--dynamic-island-notch-window)
8. [ADR-008: Local Vector Database & Memory Store — `sqlite-vec`](#adr-008-local-vector-database--memory-store--sqlite-vec)
9. [ADR-009: Autonomous Web Browser Operator — Puppeteer with Dev Bridge](#adr-009-autonomous-web-browser-operator--puppeteer-with-dev-bridge)
10. [ADR-010: Native Credentials & Vault Security — OS Native Keyrings](#adr-010-native-credentials--vault-security--os-native-keyrings)
11. [ADR-011: Multi-Session Chat Explorer & State Management (Zustand)](#adr-011-multi-session-chat-explorer--state-management-zustand)
12. [ADR-012: Explicit Desktop vs. Web Runtime Boundary & Visual Badging](#adr-012-explicit-desktop-vs-web-runtime-boundary--visual-badging)
13. [ADR-013: Native Desktop Automation Expansion (Window Management, Spotlight Indexing & Battery Telemetry)](#adr-013-native-desktop-automation-expansion-window-management-spotlight-indexing--battery-telemetry)

---

### ADR-001: Desktop Foundation — Tauri v2 + Rust over Electron

- **What Was Changed/Decided:**
  Built Aeio as a native desktop application using **Tauri v2** with a Rust backend core and a React 19 + TypeScript frontend.
- **Why This Approach:**
  Desktop assistant applications require direct access to low-level operating system APIs (accessibility APIs, Quartz/Win32 event generation, audio devices, process monitoring). Tauri provides memory safety and concurrency guarantees in Rust with near-instant startup time and a minimal binary footprint (~20MB vs ~180MB for Electron).
- **Why This Tool/Library over Alternatives:**
  - *Tauri v2 over Electron:* Electron bundles a complete Chromium runtime and Node.js instance per app, consuming 300MB+ RAM at idle. Tauri leverages the OS's native webview (WebKit on macOS, WebView2 on Windows) and executes security-critical capabilities in compiled Rust.
  - *Tauri v2 over Native Swift/Win32:* Writing separate native GUI codebases (Swift for macOS and C#/.NET for Windows) would double UI development effort. Tauri allows 100% shared web UI code while keeping native OS platform hooks cleanly organized in Rust `#[cfg(target_os)]` modules.

---

### ADR-002: UI Design System — Claude-Inspired Aesthetic & CSS Design Tokens

- **What Was Changed/Decided:**
  Adopted a minimalist, high-legibility interface using Claude-inspired warm white, cream, and charcoal tones (`#faf9f5`, `#f0ede6`, `#1a1a19`), typography centered around Inter, and custom CSS design tokens rather than a generic UI kit.
- **Why This Approach:**
  Agentic AI software should feel calm, focused, and distraction-free. A clean, editorial design with generous whitespace and clear visual hierarchy ensures users can review complex multi-step tool plans and terminal streams without cognitive fatigue.
- **Why This Tool/Library over Alternatives:**
  - *CSS Tokens + Vanilla Styles over Tailwind utility bloat or Component Libraries (MUI/AntD):* Allows precise control over desktop-specific characteristics (window dragging regions `data-tauri-drag-region`, notch animations, translucency/vibrancy, non-rectangular windows). Avoided bulky component libraries that hinder custom window framing.

---

### ADR-003: LLM Provider Architecture — AWS Bedrock (`ap-southeast-2`) over Local Models

- **What Was Changed/Decided:**
  Standardized primary inference on **AWS Bedrock** utilizing Claude 3.5 Sonnet (`anthropic.claude-3-5-sonnet-20241022-v2:0`) and Claude 3.5 Haiku, routed through Sydney (`ap-southeast-2`) via AWS SigV4 request signing. Local model execution (e.g. Ollama) is gated as secondary or disabled.
- **Why This Approach:**
  Autonomous desktop computer control requires state-of-the-art vision, precise coordinate estimation, and strict tool-calling schema compliance. Local consumer-grade models (8B–14B parameters) frequently hallucinate tool arguments or produce inaccurate bounding box coordinates, risking erroneous clicks on user systems.
- **Why This Tool/Library over Alternatives:**
  - *AWS Bedrock over Direct Anthropic API:* Bedrock provides enterprise-grade IAM credential resolution, predictable quotas, regional data governance, and compatibility with AWS project spend limits.
  - *`ap-southeast-2` Region:* Selected per AWS project constraints and latency profiles for optimal availability of Claude 3.5 Sonnet and Haiku models.

---

### ADR-004: Tiered Model Routing Engine

- **What Was Changed/Decided:**
  Implemented a 3-tier dynamic routing engine in `src/lib/models/router.ts`:
  - **Tier 1 (Fast / Conversational):** Claude 3.5 Haiku / lightweight models for instant response, intent categorization, and wake-word verification.
  - **Tier 2 (Balanced / Reasoning):** Claude 3.5 Sonnet for multi-step workflow planning, code generation, and complex API interactions.
  - **Tier 3 (Heavy / Vision):** Claude 3.5 Sonnet Vision for desktop screenshot analysis, UI element detection, and autonomous browsing.
- **Why This Approach:**
  Executing every keystroke or trivial conversational query against full multimodal Sonnet increases token costs and latency. Tiered routing matches query complexity to model size dynamically.
- **Why This Tool/Library over Alternatives:**
  - *Heuristic + Rule-Based Router over LLM-based Meta-Router:* Avoids making an expensive preliminary LLM call just to decide which LLM to invoke. Pattern checks (e.g. presence of image data, system commands, code blocks) route the request in <1ms.

---

### ADR-005: Cross-Platform Native OS Input & Automation (macOS & Windows)

- **What Was Changed/Decided:**
  Implemented cross-platform desktop automation across two primary operating systems in `src-tauri/src/tools/os_automation.rs` and `src-tauri/src/tools/input_simulator.rs`:
  - **macOS:** AppleScript (`osascript`) for application lifecycle, system volume, dark mode; CoreGraphics (`CGEvent`) for mouse movement and keyboard injection.
  - **Windows:** PowerShell Win32 commands for process control, volume, system notifications; Win32 `SendInput` via the `enigo` Rust crate.
- **Why This Approach:**
  Ensures identical functional agent capabilities regardless of whether the user runs Aeio on a MacBook or a Windows PC, without requiring third-party runtime dependencies like Python or Node on the host OS.
- **Why This Tool/Library over Alternatives:**
  - *Rust `enigo` crate over RobotJS or external CLI tools:* RobotJS relies on legacy native Node.js addons that frequently break across OS updates. `enigo` compiles directly into the native Tauri binary with zero external runtime dependencies.
  - *Native Platform APIs (`osascript` / PowerShell) over custom C drivers:* Maximizes compatibility with modern OS permission models (macOS Accessibility permissions, Windows UAC) without triggering antivirus heuristics.

---

### ADR-006: Hardware Safety Architecture & Kill Switch

- **What Was Changed/Decided:**
  Architected a multi-layered safety barrier:
  1. **Global Emergency Kill Switch (`killSwitch.ts`):** Listens for the `Escape` key via low-level OS event listeners and immediately aborts any executing automation loop.
  2. **Active Control HUD (`ActiveControlHud.tsx`):** Renders a high-contrast pulsating red/amber screen border whenever the AI agent has control of the mouse or keyboard.
  3. **Allowlist / Safe Zone Enforcement (`computerControlAllowlist.ts`):** Enforces a domain and application allowlist preventing automation outside approved scopes.
- **Why This Approach:**
  Autonomous agents with input control can cause runaway actions if an LLM hallucinates or enters a loop. Users must possess instant, hardware-level override authority that immediately terminates agent control.
- **Why This Tool/Library over Alternatives:**
  - *CoreGraphics `CGEventSourceKeyState` (macOS) / `GetAsyncKeyState` (Windows) over JS `window.addEventListener('keydown')`:* A browser window loses keyboard focus when the agent clicks into another application (e.g. Spotify, VS Code). An in-window JS event listener stops receiving events once focus shifts. OS-level polling or global hooks guarantee the kill switch remains active globally.

---

### ADR-007: Hands-Free Ambient Voice Engine & Dynamic Island Notch Window

- **What Was Changed/Decided:**
  Created a hands-free, voice-activated interaction loop:
  - Low-power wake-word detection ("Hey Aeio" / "Jarvis") using Web Audio VAD in `src/lib/speech/ambientWakeWord.ts`.
  - Floating, frameless, transparent notch window (`DynamicIslandNotchWindow.tsx`) pinned to the top of the screen.
  - Spoken audio feedback using system voices (Daniel / British English Jarvis profile) and Web Audio earcons (`earcons.ts`).
- **Why This Approach:**
  The user requested an experience where they can interact with the AI without touching the keyboard ("just talking to an AI, assigning tasks just by speaking"). The floating notch provides visual feedback without obscuring the user's active workspace.
- **Why This Tool/Library over Alternatives:**
  - *Tauri multi-window (`notch`) over third-party overlay tools:* Native Tauri webview windows can be configured with transparency, no window decorations, and `always_on_top`, providing a seamless Dynamic Island experience matching macOS and Windows design conventions.
  - *Web Speech Synthesis with sanitization over heavy local TTS engines (e.g. Piper/Whisper binary bundling):* Avoids bloating the binary by 500MB+ while providing instantaneous, zero-latency spoken responses.

---

### ADR-008: Local Vector Database & Memory Store — `sqlite-vec`

- **What Was Changed/Decided:**
  Embedded `sqlite-vec` directly inside the native Rust SQLite database (`rusqlite`) in `src-tauri/src/db.rs` for semantic document search, memory recall, and contextual retrieval.
- **Why This Approach:**
  Desktop apps require local, offline-capable vector storage that does not leak user context to third-party vector cloud services.
- **Why This Tool/Library over Alternatives:**
  - *`sqlite-vec` over Chromadb or Pinecone:* Pinecone requires internet connectivity and API keys; Chroma requires running a Python server. `sqlite-vec` is a lightweight, zero-dependency C SQLite extension that runs entirely in-process within the Tauri Rust binary.

---

### ADR-009: Autonomous Web Browser Operator — Puppeteer with Dev Bridge

- **What Was Changed/Decided:**
  Equipped Aeio with a dedicated autonomous browser operator (`scripts/puppeteerRunner.mjs` and `src/lib/tools/browserTool.ts`) capable of navigating, typing, clicking, and extracting DOM structures independently from the user's primary desktop browser.
- **Why This Approach:**
  Automating the user's actual daily browser (e.g. personal Chrome/Safari) disrupts their active tabs and presents security risks with personal sessions. A separate, sandboxed browser session enables autonomous research and scraping without interfering with user browsing.
- **Why This Tool/Library over Alternatives:**
  - *Puppeteer over Selenium:* Puppeteer uses the Chrome DevTools Protocol (CDP) directly, offering faster execution, reliable screenshotting, and headless execution with minimal dependencies.

---

### ADR-010: Native Credentials & Vault Security — OS Native Keyrings

- **What Was Changed/Decided:**
  Stored sensitive credentials (AWS access keys, secret keys, session tokens, API keys) in the native OS secure store via the `keyring` crate (`src-tauri/src/keychain.rs`), using macOS Keychain and Windows Credential Manager (DPAPI).
- **Why This Approach:**
  Plaintext `.env` files or unencrypted `localStorage` keys expose sensitive credentials to any script or process running on the host machine.
- **Why This Tool/Library over Alternatives:**
  - *`keyring` crate with `apple-native` and `windows-native` flags over custom encryption:* Leverages OS-level hardware security modules (Apple Secure Enclave, Windows TPM) with zero maintenance overhead.

---

### ADR-011: Multi-Session Chat Explorer & State Management (Zustand)

- **What Was Changed/Decided:**
  Implemented a persistent multi-session chat system with date grouping (Today, Previous 7 Days, Older), title auto-generation, conversation search, and user profile management in `src/stores/chatStore.ts` and `src/components/chat/MultiSessionExplorer.tsx`.
- **Why This Approach:**
  As users assign diverse tasks (coding, system automation, web research), mixing conversations in a single thread degrades agent context quality. Separate sessions isolate prompt histories and vector memory scopes.
- **Why This Tool/Library over Alternatives:**
  - *Zustand with `persist` middleware over Redux Toolkit or Context API:* Zustand provides a minimal boilerplate store with fine-grained selector subscriptions, preventing re-renders of the active chat canvas when background session metadata updates.

---

### ADR-012: Explicit Desktop vs. Web Runtime Boundary & Visual Badging

- **What Was Changed/Decided:**
  Introduced explicit runtime detection via `isTauri()` in `src/lib/ipc.ts`, surfaced live visual indicators (`🖥️ Desktop App (Native OS Control)` vs. `🌐 Web Mode`) in `src/components/layout/ClaudeTopBar.tsx`, and provided graceful fallback mocks when running inside a browser sandbox.
- **Why This Approach:**
  The capabilities of the desktop application (full OS input automation, local application launching, global hotkeys) differ fundamentally from a browser tab (sandboxed, restricted to DOM). Clear visual badging and runtime branching eliminate user confusion regarding why certain OS-level actions only execute when running the native binary.
- **Why This Tool/Library over Alternatives:**
  - *Dynamic `@tauri-apps/api/core` detection (`window.__TAURI_INTERNALS__`) over build-time environment flags:* Allows the exact same compiled frontend bundle to run in Vite development mode, web testing environments, and inside the native Tauri container without separate builds.

---

### ADR-013: Native Desktop Automation Expansion (Window Management, Spotlight Indexing & Battery Telemetry)

- **What Was Changed/Decided:**
  Expanded Aeio's native desktop automation toolkit across three core system capabilities:
  1. **Window Management (`manage_active_window`):** Supported `maximize`, `minimize`, `tile_left`, `tile_right`, and `center` on the frontmost application window via macOS AppleScript window bounds and Windows Win32 / WScript `SendKeys` (`#{LEFT}`, `#{RIGHT}`, `#{UP}`, `#{DOWN}`).
  2. **Fast Local File Discovery (`search_local_files`):** Integrated native operating system metadata indexes (macOS Spotlight `mdfind` and Windows PowerShell `Get-ChildItem`) with configurable match limits.
  3. **Battery & Power Telemetry (`get_power_status`):** Extracted real-time power metrics (percentage, charging state, power source, estimated time remaining) using macOS `pmset -g batt` and Windows CIM `Win32_Battery`.
  Integrated all three tools into System One sub-30ms instant action regexes (`src/lib/systemOne/instantActions.ts`), Claude 3.5 Sonnet agent tool definitions (`src/lib/agent/toolRegistry.ts`), and planner normalization (`src/lib/agent/plan.ts`).
- **Why This Approach:**
  Users commanding a desktop assistant expect immediate operating system ergonomics—arranging workspace windows, locating local project files, and monitoring laptop battery health—without incurring expensive multi-second LLM planning cycles when issuing simple voice or typed commands (e.g. "maximize window", "find file package.json", "check battery").
- **Why This Tool/Library over Alternatives:**
  - *macOS Spotlight `mdfind` over recursive directory traversal (`walkdir` crate):* Full-disk filesystem walking can take 30+ seconds and heavily impact CPU/disk I/O. `mdfind` queries the pre-computed macOS Spotlight metadata index, returning ranked file paths in <50ms.
  - *AppleScript & Win32 Bounds over external window tiling daemons (e.g. Yabai, Rectangle, Komorebi):* Calling OS native automation primitives requires no third-party daemons or disabled System Integrity Protection (SIP), working out-of-the-box on standard macOS and Windows installations.
  - *`pmset -g batt` & `Win32_Battery` over third-party sysinfo dependencies:* Built-in OS commands execute without linking external C/native libraries or bundling platform-specific kernel extensions, ensuring cross-platform build stability and small binary footprint.
