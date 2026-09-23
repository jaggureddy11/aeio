# Aeio — Capabilities

This document defines what Aeio can do, organized by maturity tier. Use it as the source of truth when prompting Antigravity's agent for new features — each capability below should map to one build task, and each has a rough acceptance test so you know when it's actually done, not just scaffolded.

---

## Tier 0 — Foundation (must work before anything else matters)

| Capability | Description | Acceptance test |
|---|---|---|
| Global summon | Hotkey shows/hides the app from anywhere in the OS | Works with 5 other apps focused, including full-screen apps |
| Local-first chat | Chat works fully offline via Ollama, zero API key required | Airplane mode, fresh install, first message succeeds |
| BYOK fallback | User can add a Claude/OpenAI key for higher-quality responses | Switching provider mid-conversation doesn't lose context |
| Persistent conversations | Chats survive app restarts | Kill the app mid-conversation, reopen, history intact |

---

## Tier 1 — Memory (the core differentiator)

| Capability | Description | Acceptance test |
|---|---|---|
| Structured memory store | Facts, preferences, projects, people stored as discrete editable records, not raw chat logs | User can open memory panel and read every stored fact in plain English |
| Transparent recall | When a response uses a memory, it's visibly cited/highlighted in the UI | User can hover/click a response and see which memories fed it |
| Manual edit/delete | User can correct or remove any memory directly | Editing a memory changes future responses immediately, no restart needed |
| Auto-capture | Assistant proposes new memories from conversation, user approves before they're saved | Nothing is written to the store without a visible approval step (or an explicit "always allow" toggle the user sets) |
| Scoped recall | Memory search is workspace-aware — a "work project" memory doesn't leak into a "personal" chat unless relevant | Two separate workspaces stay contextually isolated in a blind test |
| Vector + keyword hybrid search | Retrieval isn't purely semantic — exact terms (names, file paths, numbers) are never missed | Searching a memory by its exact wording always finds it, even if semantically generic |

---

## Tier 2 — Tool execution / OS integration

| Capability | Description | Acceptance test |
|---|---|---|
| File read & search | Read file contents, search by name/content in a chosen directory | Assistant can answer "what's in my Downloads folder" accurately |
| Clipboard context | Read/write clipboard on request | "Summarize what I just copied" works without pasting manually |
| Shell/script execution | Run commands or scripts, always behind an approval dialog | Destructive commands (rm, del, format) show an extra explicit warning, not just the standard approval |
| App launching | Open apps, URLs, files with the default handler | "Open my resume" launches the right app |
| Active window awareness | Optionally read the title/content of the frontmost window for context | Off by default; user must opt in per-session or permanently |
| Approval memory | User can mark a specific tool+context combo as "always allow" so it stops asking | Doesn't silently expand to unrelated commands — scoped narrowly |

---

## Tier 3 — Model intelligence

| Capability | Description | Acceptance test |
|---|---|---|
| Multi-provider routing | Automatically picks local vs. cloud model based on task complexity/sensitivity | A quick factual question stays local; a long coding task offers to switch to a cloud model, with user confirmation |
| Sensitive-content routing | Anything touching memory content or file contents defaults to the local model unless user overrides | Verify via network monitor: no outbound calls when only local model is selected |
| Streaming responses | Tokens stream in, not a blocking wait | No UI freeze on long responses |
| Graceful degradation | If Ollama isn't running or a cloud key is invalid, the app explains clearly and offers a fix, never silently fails | Kill Ollama mid-session, send a message, get an actionable error not a spinner forever |

---

## Tier 4 — Workspace structure

| Capability | Description | Acceptance test |
|---|---|---|
| Project-scoped workspaces | Separate chat + memory scope per project, not one infinite thread | Switching workspace changes both visible history and what memory gets recalled |
| Cross-workspace search | Can still search "everything" when explicitly asked | A global search command surfaces results across all workspaces |
| Archiving | Old workspaces can be archived without deletion | Archived workspace disappears from the switcher but data isn't lost |

---

## Tier 5 — Ambient / proactive (build last, ship opt-in only)

| Capability | Description | Acceptance test |
|---|---|---|
| Pattern noticing | Lightweight background check for repeated questions/files across a session | Never runs as a hidden always-on process without a visible indicator that it's active |
| Proactive nudge | Surfaces a suggestion without being asked, dismissible in one click | Nudges never block the UI or reappear after being dismissed once for that context |
| Full opt-out | Entire tier can be disabled with one toggle, permanently | With it off, zero background CPU/network activity from this feature |

---

## Non-negotiable constraints (apply across every tier)

- **No memory write without visibility** — auto-approve is a setting the user turns on, never the default.
- **No outbound network call the user can't account for** — especially for anything routed to a cloud provider; surface which provider handled each response.
- **No destructive tool action without confirmation** — no exceptions, even for "always allow" scopes (those should still show a lightweight one-line receipt of what ran).
- **Everything in the memory store must be exportable** — plain JSON/markdown export, so the user's data is never locked into the app.

---

## What "advanced" means here

Advanced isn't more features bolted on — it's:
1. Memory the user actually trusts because they can see and correct it.
2. Tool access that feels safe because approvals are real, not theater.
3. Model routing that's invisible when it's working and explicit when it matters (cost, privacy, quality).

A version of Aeio that nails Tier 0–2 well is already more advanced than most "AI desktop assistant" products on the market today, which mostly stop at Tier 0.