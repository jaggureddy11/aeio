# Agent-S: Safety-First Architecture & Safety Model Design

**Document ID**: SPEC-2026-09-AGENT-S-SAFETY  
**Status**: Design Specification Under Review (Zero Execution Code Written)  
**Author**: Aeio Systems Safety & Architecture Group  
**Target Capability**: Agent-S GUI Grounding & Computer Use Integration  
**Date**: September 26, 2026  

---

## 1. Safety Paradigm: Why Coordinate-Based Safety Fails

In traditional developer tool execution (e.g., shell commands or file writes), safety gates rely on deterministic parsing: abstract syntax trees (ASTs), regex filters, path scoping, and destructive command blacklists (e.g., preventing `rm -rf /` or matching `DROP TABLE`).

**GUI automation has no equivalent primitive.**  
A screen coordinate such as `(482, 319)` carries zero intrinsic semantic meaning:
- In Apple TextEdit, clicking `(482, 319)` might press a harmless "Align Left" formatting button.
- In macOS Finder, clicking `(482, 319)` might click "Empty Trash".
- In a web browser, clicking `(482, 319)` might authorize a wire transfer or revoke API tokens.
- Between window resizes or display reconfigurations, the exact same pixel coordinate can instantly map to an entirely different interactive element.

Because pixel coordinates are semantically opaque, safety cannot be established at the coordinate level. It must be established **prior to coordinate grounding**, through **intent-based classification** coupled with **strict application-level isolation**.

---

## 2. The Seven Core Safety Pillars

```
+----------------------------------------------------------------------------------------------------+
|                                    AGENT-S SAFETY MODEL PILLARS                                    |
+----------------------------------------------------------------------------------------------------+
| 1. Intent-Based Classification   | Pre-grounding semantic declaration of intent & target app      |
| 2. Strict Application Allowlist  | Default empty; absolute blacklist for security/financial panes  |
| 3. Active-Control Overlay HUD    | Unmissable top-screen banner + perimeter glow during automation |
| 4. Hardware Instant Kill Switch  | Native OS low-level event tap on ESC (<=300ms hard abort)      |
| 5. Full Visual Audit Trail       | Before/after screenshot receipts with coordinate annotations     |
| 6. BYO Grounding Model Hosting   | BYO Hugging Face/vLLM endpoint default; zero developer exposure  |
| 7. Explicit Opt-In & Quarantine  | Advanced Experimental section; off by default; triple disclaimer|
+----------------------------------------------------------------------------------------------------+
```

---

### Pillar 1: Intent-Based Classification (Pre-Grounding)

Before any screenshot is cropped or submitted to a visual grounding model (UI-TARS / Qwen2-VL), the planner model must emit a structured, typed intent payload.

#### Typed Intent Specification
```typescript
export interface GuiActionIntent {
  action_id: string;
  step_number: number;
  total_steps: number;
  
  // Natural language explanation of the desired effect
  natural_language_intent: string; 
  // Example: "Click the Close Window red traffic light button in TextEdit"
  
  // Target context
  target_app_bundle_id: string; // e.g., "com.apple.TextEdit"
  target_app_name: string;      // e.g., "TextEdit"
  target_window_title: string;  // e.g., "MeetingNotes.txt"
  
  // Semantic operation
  operation_type: 'click' | 'double_click' | 'type' | 'key_combo' | 'drag' | 'scroll';
  semantic_target_element: string; // e.g., "window_close_button"
  
  // Risk assessment metadata
  intended_state_change: 'reversible' | 'state_mutation' | 'destructive' | 'session_exit';
  declared_risk_level: 'low' | 'medium' | 'high';
}
```

#### Risk Classification Rules
1. **Low Risk**: Read-only navigation (scrolling, focusing a text area, switching tabs within an allowlisted editor).
2. **Medium Risk**: Text entry, form filling, selecting dropdown options in allowlisted non-critical apps.
3. **High Risk / Destructive**:
   - Window closing / application termination.
   - Deleting text, files, or objects.
   - Submitting forms or clicking buttons containing words such as `Save`, `Delete`, `Submit`, `Send`, `Authorize`, `Pay`, `Confirm`, `Install`, `Overwrite`.
4. **Automatic Block / Rejection**:
   - Any action where `target_app_bundle_id` does not match an active window verified on screen.
   - Any action targeting an application outside the User Allowlist.

---

### Pillar 2: Strict Per-Application Allowlist (Default Empty)

By default, the allowlist is completely empty (`allowlisted_bundle_ids: []`). The system will refuse to interact with any GUI element on the machine until the user has explicitly selected and enabled that specific application.

#### Absolute Blacklist (Non-Overridable)
Even if a user attempts to add these to the allowlist, the system rejects them with an architectural hard-block:

| Blacklisted Category | Bundle IDs / Targets | Threat Rationale |
| :--- | :--- | :--- |
| **OS Preferences & Security** | `com.apple.systempreferences`, `com.apple.systemsettings`, `SecurityAgent` | Prevents AI from tampering with OS security, granting permissions, or altering firewall rules. |
| **Password & Credential Managers** | `com.1password.1password`, `com.bitwarden.desktop`, `com.apple.keychainaccess`, `org.keepassxc.keepassxc` | Prevents automated scraping of master vaults, secret keys, or authentication credentials. |
| **Financial / Banking Pages** | Web browsers when the URL matches banking, payment gateways (Stripe checkout, PayPal, banking domains) | Prevents unauthorized financial transactions or credential exfiltration. |
| **Low-Level Disk & Partition Utilities** | `com.apple.DiskUtility`, `Terminal.app` (when unmanaged) | Prevents raw disk alterations or uninspected shell execution bypassing the AST tool gate. |

#### Settings UI Layout (ASCII Mockup)

```
+----------------------------------------------------------------------------------------------------+
| SETTINGS > ADVANCED: COMPUTER CONTROL (EXPERIMENTAL)                                               |
+----------------------------------------------------------------------------------------------------+
|  [!] EXPERIMENTAL CAPABILITY: Disabled by default. Requires explicit hardware opt-in.              |
|                                                                                                    |
|  [x] Enable Computer Use Engine (Agent-S)                                    [ Status: ACTIVE ]    |
|                                                                                                    |
|  ------------------------------------------------------------------------------------------------  |
|  PERMITTED APPLICATION ALLOWLIST                                                                   |
|  Aeio will ONLY interact with applications explicitly added to this list.                          |
|                                                                                                    |
|  +----------------------------------------------------------------------------------------------+  |
|  | [Search installed applications...]                           [ + Add Application ]          |  |
|  +----------------------------------------------------------------------------------------------+  |
|                                                                                                    |
|  Currently Permitted Applications (2 allowed):                                                     |
|                                                                                                    |
|  [ App Icon ]  TextEdit (`com.apple.TextEdit`)                                                     |
|                Permissions: Mouse Click, Keyboard Type, Window Focus                               |
|                Approval Mode: [ High-Risk Only v ]                          [ Remove ]             |
|                                                                                                    |
|  [ App Icon ]  Visual Studio Code (`com.microsoft.VSCode`)                                          |
|                Permissions: Mouse Click, Keyboard Type, Scroll                                      |
|                Approval Mode: [ Always Require Approval v ]                 [ Remove ]             |
|                                                                                                    |
|  ------------------------------------------------------------------------------------------------  |
|  PROTECTED APPLICATIONS (SYSTEM ENFORCED BLACKLIST)                                                |
|  The following are permanently blocked from GUI automation regardless of settings:                |
|  - System Settings / Preferences (Security & Privacy panes)                                        |
|  - 1Password / Bitwarden / Apple Keychain Access                                                   |
|  - Active Browser Tabs on Financial & Banking Domains                                              |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

---

### Pillar 3: Visible Active-Control Indicator (Overlay HUD)

When Agent-S is executing an action sequence, the user must never be in doubt about whether the mouse or keyboard is under autonomous control. A subtle tray icon is insufficient.

#### Specifications for Active Control Overlay:
1. **Full-Width Top Header Bar**: A 36px persistent banner rendered via a dedicated transparent, click-through, always-on-top Tauri overlay window (`NSWindowLevel = floating + 10`).
2. **Screen Perimeter Glow**: A 2px high-contrast pulsing emerald (`#0FA958`) border around the active display.
3. **Target Bounding Crosshair**: When an element is being targeted, an animated reticle highlights the target before the physical mouse event fires.

#### Active Overlay Visual Mockup (Display Top Edge)

```
+----------------------------------------------------------------------------------------------------+
| (o) AI ACTIVE SCREEN CONTROL: Targeting TextEdit  |  Action 2/3: Click 'Save'  |  [ HOLD ESC TO STOP ] |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|                                                                                                    |
|                                                                                                    |
|                       +-----------------------------------+                                        |
|                       | TextEdit - MeetingNotes.txt       |                                        |
|                       |-----------------------------------|                                        |
|                       | Meeting summary for Q3...         |                                        |
|                       |                                   |                                        |
|                       |             [  Save  ]            |                                        |
|                       |                ^                  |                                        |
|                       |             [--+--] <-- (Target Reticle: 482, 319)                         |
|                       +-----------------------------------+                                        |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

---

### Pillar 4: Instant Hardware Kill Switch

Any human operating near autonomous robotics requires an immediate physical kill switch. Software buttons on screen are useless if the AI is already monopolizing the mouse cursor.

#### Technical Implementation:
1. **Low-Level Native Event Hook**:
   - On macOS: Implemented using a native `CGEventTapCreate` or `rdev` background listener thread in Rust (`src-tauri`).
   - Runs with direct OS input priority, intercepting keystrokes before they reach window managers or user applications.
2. **Activation Key**:
   - **Emergency Hold**: Holding the `Escape` key for >= 300 milliseconds.
   - **Instant Hotkey**: Pressing `Cmd + Shift + Esc` (or `Ctrl + Shift + Esc` on Windows).
3. **Execution Behavior**:
   - **Zero Confirmation**: Does not prompt "Are you sure you want to stop?".
   - **Atomic Flag Trip**: Sets `EMERGENCY_HALT.store(true, Ordering::SeqCst)`.
   - **Process Termination**: Sends `SIGKILL` (`kill -9`) to any child automation driver / grounding subprocess.
   - **Hardware Input Release**: Sends hardware mouse-up and modifier-key-release events to prevent sticky modifier keys (`Shift`, `Cmd`, `Alt`).
   - **Overlay Status**: The top banner instantly flashes red: `AUTOMATION EMERGENCY HALT ACTIVATED — ALL ACTIONS ABORTED`.

---

### Pillar 5: Full Visual Audit Trail

Because GUI actions leave no natural command-line history, post-incident forensic accountability requires visual verification.

#### Screenshot Pair Logging:
For every discrete GUI action, the system captures and stores:
1. **Pre-Action Screenshot**: The exact display state right before the action is executed, with metadata indicating the planned target coordinate.
2. **Post-Action Screenshot**: The display state 300ms after input injection to record the visible outcome (dialog appeared, button clicked, window closed).

#### Audit Receipt Schema
```json
{
  "audit_id": "gui-act-8f492b1a",
  "session_id": "sess-2026-09-26-01",
  "timestamp": "2026-09-26T03:15:22.418Z",
  "action_type": "gui_click",
  "intent": {
    "natural_language": "Close TextEdit document window",
    "target_app": "TextEdit",
    "bundle_id": "com.apple.TextEdit",
    "window_title": "MeetingNotes.txt",
    "element": "close_window_button"
  },
  "grounding": {
    "model_endpoint": "https://custom-uitars.endpoints.huggingface.cloud",
    "predicted_coordinate": { "x": 482, "y": 319 },
    "bounding_box": [474, 311, 490, 327],
    "confidence": 0.94
  },
  "safety_verdict": {
    "allowlisted": true,
    "blacklisted": false,
    "approval_required": true,
    "user_approval_timestamp": "2026-09-26T03:15:21.902Z"
  },
  "execution": {
    "duration_ms": 142,
    "status": "COMPLETED",
    "kill_switch_triggered": false
  },
  "artifacts": {
    "pre_screenshot_path": "audit/screenshots/gui-act-8f492b1a_before.png",
    "post_screenshot_path": "audit/screenshots/gui-act-8f492b1a_after.png",
    "pre_screenshot_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "post_screenshot_sha256": "8f2b740562e1a967f6738f654f5ef43f65fe7cff5b6c3f3a1f8e219747a16f91"
  }
}
```

---

### Pillar 6: Grounding Model Hosting Decision & Cost Analysis

Visual grounding models capable of reliable GUI parsing (such as `UI-TARS-1.5-7B` or `Qwen2-VL-7B`) cannot run efficiently on typical consumer CPU or low-end Ollama setups. They require heavy FP16/INT4 tensor math and 16GB+ VRAM.

#### The Cost Dilemma:

| Option | Architecture | Developer Cost | User Cost | Availability / Reliability | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Option (a): BYO Grounding Endpoint (BYO-GE)** | User provisions their own Hugging Face Dedicated Inference Endpoint, RunPod, or local high-VRAM vLLM node. | **$0.00 / month** (Zero liability) | ~$0.60–$1.00 / hr (billed by HF to user; scales to zero when idle) | High; isolated per user; zero noisy-neighbor degradation. | **RECOMMENDED DEFAULT** |
| **Option (b): Managed Hosted Endpoint** | Aeio team deploys a pooled cluster of NVIDIA A10G/L4 instances on AWS/GCP. | **$750–$3,000+ / mo** minimum fixed baseline | Free or subsidized subscription | Severe risk of free-tier exhaustion; runaway costs from loops. | **REJECTED FOR INITIAL BUILD** |

#### Why Option (a) BYO Must Be the Default:
In computer use, an autonomous task frequently consumes 10 to 30 sequential screenshots and grounding inferences per session.
If 100 users run three multi-step GUI automations a day:
- Total inferences: $100 \times 3 \times 20 = 6,000$ calls/day.
- Hosted GPU infrastructure cost: ~$40–$70/day ($1,200–$2,100/mo).
- Under a free or freemium model without strict credit card paywalls, this creates catastrophic financial exposure.

**Decision**: Implement **Option (a) BYO Grounding Endpoint** as the standard configuration (identical to BYOK for LLM providers). The user provides their endpoint URL and API bearer token.

---

### Pillar 7: Explicitly Separate, Experimental, and Off-by-Default

Computer Control will not be mixed into standard tool menus or automatically suggested during regular chat interactions.

#### Quarantine Rules:
1. **Off by Default**: The configuration key `settings.computer_control.enabled` defaults to `false`.
2. **Dedicated Settings Tab**: Located under `Settings > Advanced > Computer Control (Experimental)`.
3. **Mandatory Explicit Consent Modal**:
   When toggling the switch to `true`, the user is presented with a non-dismissible confirmation modal requiring three discrete checkboxes:
   - `[ ]` *I understand that Aeio will be permitted to synthesize real mouse and keyboard inputs on this computer.*
   - `[ ]` *I acknowledge that automation will only operate on applications I explicitly add to the Application Allowlist.*
   - `[ ]` *I know that holding the Escape key for 300ms acts as an immediate emergency kill switch.*

---

## 3. End-to-End Data Flow: Walkthrough of "Close this window"

The following trace shows the exact progression of the example action: **"Close this window"** (targeting an allowlisted TextEdit window).

```
+----------------------------------------------------------------------------------------------------+
|                              DATA FLOW: "CLOSE THIS WINDOW" IN TEXTEDIT                            |
+----------------------------------------------------------------------------------------------------+

1. USER PROMPT: "Close this window"
   |
   v
2. REASONING & INTENT CLASSIFICATION (Main LLM)
   - Emits structured intent:
     {
       "action": "gui_action",
       "natural_language_intent": "Close the active TextEdit document window",
       "target_app_name": "TextEdit",
       "target_app_bundle_id": "com.apple.TextEdit",
       "element": "window_close_button",
       "intended_state_change": "destructive"
     }
   |
   v
3. SAFETY GATE: APPLICATION ALLOWLIST & BLACKLIST CHECK
   - Check 1: Is "com.apple.TextEdit" in Protected Blacklist? -> NO (Passed)
   - Check 2: Is "com.apple.TextEdit" in User Permitted Allowlist? -> YES (Passed)
   - Check 3: Is target window currently visible and focused? -> YES (Verified via OS AX tree)
   |
   v
4. PRE-EXECUTION CAPTURE
   - Captures silent primary display screenshot: `audit/temp_before.png`
   - Records window bounds: `{x: 200, y: 150, width: 800, height: 600}`
   |
   v
5. GROUNDING INFERENCE (UI-TARS / Grounding Endpoint)
   - Payload sent: `{ image: <base64>, instruction: "red close window button in top-left of TextEdit window" }`
   - Response received: `{ coordinate: [214, 164], bbox: [208, 158, 220, 170], confidence: 0.96 }`
   - Sanity Check: Is coordinate (214, 164) inside the TextEdit window bounds? -> YES.
   |
   v
6. PLAN CARD APPROVAL PRESENTATION (Human-In-The-Loop)
   - Renders Plan Card in Aeio Spotlight HUD:
     +------------------------------------------------------------------------+
     | [!] GUI ACTION APPROVAL REQUIRED                                       |
     | Intent: Close active TextEdit window ('MeetingNotes.txt')              |
     | Target: Close Button at (214, 164) in com.apple.TextEdit               |
     | Risk: Window close may discard unsaved changes                         |
     |                                                                        |
     |   [ Reject / Cancel ]                        [ Approve & Execute (Enter) ]
     +------------------------------------------------------------------------+
   - Execution halts until user explicitly clicks [ Approve ] or presses Enter.
   |
   v
7. ACTIVE-CONTROL HUD ACTIVATION
   - Top-edge overlay mounts: "AI ACTIVE SCREEN CONTROL: Closing TextEdit Window | [ESC TO STOP]"
   - Screen perimeter pulses emerald.
   - Low-level native event hook arms `Escape` kill switch listener.
   |
   v
8. INPUT INJECTION (Native OS Driver)
   - (Check: Kill switch triggered? -> NO)
   - Smooth mouse glide to (214, 164).
   - Left Mouse Click (Down -> 40ms hold -> Up).
   |
   v
9. POST-EXECUTION CAPTURE & VERIFICATION
   - Sleeps 300ms for OS window animation.
   - Captures post-screenshot: `audit/temp_after.png`.
   - Checks active window list: TextEdit window closed -> SUCCESS.
   |
   v
10. HUD DISMISSAL & AUDIT LOGGING
    - Top-edge overlay unmounts.
    - Low-level event hook disarms.
    - Immutable receipt saved to `audit/receipts/gui-act-8f492b1a.json`.
    - Both before/after screenshots committed to disk.
    - Final completion status delivered to chat UI.
```

---

## 4. Summary & Go-Ahead Gate

This safety specification strictly decouples intent classification from coordinate calculation, enforces an empty-by-default allowlist, provides instantaneous hardware-level emergency intervention, and insulates the project from unsustainable cloud hosting liabilities.

**Explicit Gate**: No screenshot capture, grounding model integration, or input synthesis code will be authored until this design is formally reviewed and approved.
