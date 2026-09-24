import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { ollamaProvider } from '../../lib/providers/ollama';
import { openTarget, setApiKey, hasApiKey } from '../../lib/ipc';
import {
  Cpu,
  Command,
  Brain,
  Key,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  RotateCw,
  ArrowRight,
  ArrowLeft,
  X,
} from 'lucide-react';
import logo from '../../assets/logo.png';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const OnboardingModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const {
    ollamaModel,
    hotkey,
    setActiveProvider,
    setHotkey,
    setActiveTab,
    setHasCompletedOnboarding,
  } = useSettingsStore();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Ollama Detection
  const [isCheckingOllama, setIsCheckingOllama] = useState(false);
  const [ollamaHealthy, setOllamaHealthy] = useState<boolean | null>(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [copiedOllamaCmd, setCopiedOllamaCmd] = useState(false);
  const [skippedLocalMode, setSkippedLocalMode] = useState(false);

  // Step 2: Hotkey Rebinding
  const [customHotkey, setCustomHotkey] = useState(hotkey);
  const [hotkeySaved, setHotkeySaved] = useState(false);

  // Step 4: Optional Cloud Keys
  const [claudeKey, setClaudeKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [hasClaudeStored, setHasClaudeStored] = useState(false);
  const [hasOpenaiStored, setHasOpenaiStored] = useState(false);
  const [keySaveMsg, setKeySaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      checkOllamaStatus();
      checkStoredKeys();
    }
  }, [isOpen]);

  const checkOllamaStatus = async () => {
    setIsCheckingOllama(true);
    setOllamaError(null);
    try {
      const res = await ollamaProvider.checkHealth();
      setOllamaHealthy(res.ok);
      if (!res.ok) {
        setOllamaError(res.message || 'Could not connect to Ollama on localhost:11434');
      }
    } catch {
      setOllamaHealthy(false);
      setOllamaError('Could not connect to Ollama on localhost:11434');
    } finally {
      setIsCheckingOllama(false);
    }
  };

  const checkStoredKeys = async () => {
    try {
      const c = await hasApiKey('claude');
      setHasClaudeStored(c);
      const o = await hasApiKey('openai');
      setHasOpenaiStored(o);
    } catch (e) {
      console.warn('Failed checking stored keys in keychain:', e);
    }
  };

  const copyOllamaServe = async () => {
    try {
      await navigator.clipboard.writeText('ollama serve');
      setCopiedOllamaCmd(true);
      setTimeout(() => setCopiedOllamaCmd(false), 2000);
    } catch {}
  };

  const handleSaveHotkey = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setCustomHotkey(trimmed);
    setHotkey(trimmed);
    setHotkeySaved(true);
    setTimeout(() => setHotkeySaved(false), 1800);
  };

  const handleSaveClaudeKey = async () => {
    const trimmed = claudeKey.trim();
    if (!trimmed) return;
    try {
      await setApiKey('claude', trimmed);
      setClaudeKey('');
      setHasClaudeStored(true);
      setKeySaveMsg('Anthropic key securely saved to OS Keychain');
      setTimeout(() => setKeySaveMsg(null), 3000);
    } catch (err) {
      setKeySaveMsg(`Failed to save key: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSaveOpenaiKey = async () => {
    const trimmed = openaiKey.trim();
    if (!trimmed) return;
    try {
      await setApiKey('openai', trimmed);
      setOpenaiKey('');
      setHasOpenaiStored(true);
      setKeySaveMsg('OpenAI key securely saved to OS Keychain');
      setTimeout(() => setKeySaveMsg(null), 3000);
    } catch (err) {
      setKeySaveMsg(`Failed to save key: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleFinish = () => {
    setHasCompletedOnboarding(true);
    onClose();
  };

  const handleOpenMemoryStore = () => {
    setHasCompletedOnboarding(true);
    setActiveTab('memory');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true">
      <div className="onboarding-modal">
        {/* Header with logo, step progress, and skip button */}
        <div className="onboarding-header">
          <div className="onboarding-header-left">
            <div className="brand-logo-frame">
              <img src={logo} alt="Aeio logo" className="brand-logo-img" />
            </div>
            <span className="brand-title">aeio</span>
            <div className="header-divider" />
            <span className="onboarding-step-indicator">
              Step {step} of 4
            </span>
          </div>
          <button
            type="button"
            className="onboarding-skip-btn"
            onClick={handleFinish}
            title="Skip onboarding"
          >
            <span>Skip</span>
            <X size={13} />
          </button>
        </div>

        {/* Step Navigation Dots */}
        <div className="onboarding-steps-bar">
          <div className={`step-bar-item ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`}>
            <span className="step-bar-num">01</span>
            <span className="step-bar-label">Local Engine</span>
          </div>
          <div className={`step-bar-item ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}>
            <span className="step-bar-num">02</span>
            <span className="step-bar-label">Summon Hotkey</span>
          </div>
          <div className={`step-bar-item ${step === 3 ? 'active' : step > 3 ? 'done' : ''}`}>
            <span className="step-bar-num">03</span>
            <span className="step-bar-label">Second Brain</span>
          </div>
          <div className={`step-bar-item ${step === 4 ? 'active' : step > 4 ? 'done' : ''}`}>
            <span className="step-bar-num">04</span>
            <span className="step-bar-label">Providers</span>
          </div>
        </div>

        {/* Step Content */}
        <div className="onboarding-body">
          {/* STEP 1: OLLAMA DETECTION */}
          {step === 1 && (
            <div className="onboarding-step-panel">
              <div className="step-badge-tag">
                <Cpu size={12} />
                <span>Local-First Foundation</span>
              </div>
              <h2 className="step-title">Detecting local Ollama runtime</h2>
              <p className="step-subtitle">
                Aeio is designed to live on your desktop and run models locally without third-party server dependency.
              </p>

              <div className="step-card">
                {isCheckingOllama ? (
                  <div className="ollama-detect-status checking">
                    <RotateCw size={14} className="spin-icon" />
                    <span>Checking localhost:11434...</span>
                  </div>
                ) : ollamaHealthy ? (
                  <div className="ollama-detect-status success">
                    <Check size={14} className="status-icon-check" />
                    <div>
                      <div className="status-headline">Ollama is running locally</div>
                      <div className="status-subline">Active model: {ollamaModel}. Zero data leaves your machine.</div>
                    </div>
                  </div>
                ) : (
                  <div className="ollama-detect-status warning">
                    <div className="status-headline">Ollama daemon is not detected</div>
                    <div className="status-subline">{ollamaError}</div>

                    <div className="ollama-remedy-box">
                      <div className="remedy-instruction">
                        1. Start Ollama from your terminal:
                      </div>
                      <div className="code-snippet-row">
                        <code>ollama serve</code>
                        <button
                          type="button"
                          className="copy-btn"
                          onClick={copyOllamaServe}
                          title="Copy command"
                        >
                          {copiedOllamaCmd ? <Check size={12} /> : <Copy size={12} />}
                          <span>{copiedOllamaCmd ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      <div className="remedy-instruction">
                        2. If Ollama is not installed yet:
                      </div>
                      <button
                        type="button"
                        className="external-link-btn"
                        onClick={() => openTarget('https://ollama.com')}
                      >
                        <ExternalLink size={12} />
                        <span>Download Ollama from ollama.com</span>
                      </button>
                    </div>

                    <div className="ollama-action-row">
                      <button
                        type="button"
                        className="retry-check-btn"
                        onClick={checkOllamaStatus}
                      >
                        <RotateCw size={12} />
                        <span>Re-test Connection</span>
                      </button>
                      <button
                        type="button"
                        className={`skip-local-toggle ${skippedLocalMode ? 'active' : ''}`}
                        onClick={() => {
                          setSkippedLocalMode(true);
                          setActiveProvider('claude');
                        }}
                      >
                        <span>Skip local mode (use cloud key)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {!ollamaHealthy && !skippedLocalMode && (
                <div className="step-block-notice">
                  Local mode requires Ollama. Start Ollama above, or click "Skip local mode" to continue with Claude or OpenAI.
                </div>
              )}
            </div>
          )}

          {/* STEP 2: HOTKEY CONFIGURATION */}
          {step === 2 && (
            <div className="onboarding-step-panel">
              <div className="step-badge-tag">
                <Command size={12} />
                <span>Instant OS Access</span>
              </div>
              <h2 className="step-title">Summon Aeio anywhere on your OS</h2>
              <p className="step-subtitle">
                Hit your global shortcut from inside any app (editor, PDF viewer, browser) to instantly ask questions or execute tasks without window switching.
              </p>

              <div className="step-card">
                <div className="hotkey-display-frame">
                  <div className="hotkey-keys-row">
                    <kbd className="large-kbd">Command</kbd>
                    <span className="kbd-plus">+</span>
                    <kbd className="large-kbd">Shift</kbd>
                    <span className="kbd-plus">+</span>
                    <kbd className="large-kbd">Space</kbd>
                  </div>
                  <span className="hotkey-hint">Default global shortcut (press anytime to toggle window)</span>
                </div>

                <div className="hotkey-preset-section">
                  <span className="field-label">Quick Presets:</span>
                  <div className="preset-buttons-row">
                    <button
                      type="button"
                      className={`preset-btn ${hotkey === 'CommandOrControl+Shift+Space' ? 'active' : ''}`}
                      onClick={() => handleSaveHotkey('CommandOrControl+Shift+Space')}
                    >
                      ⌘ ⇧ Space
                    </button>
                    <button
                      type="button"
                      className={`preset-btn ${hotkey === 'Alt+Space' ? 'active' : ''}`}
                      onClick={() => handleSaveHotkey('Alt+Space')}
                    >
                      ⌥ Space
                    </button>
                    <button
                      type="button"
                      className={`preset-btn ${hotkey === 'CommandOrControl+Space' ? 'active' : ''}`}
                      onClick={() => handleSaveHotkey('CommandOrControl+Space')}
                    >
                      ⌘ Space
                    </button>
                  </div>
                </div>

                <div className="custom-hotkey-input-row">
                  <input
                    type="text"
                    className="custom-hotkey-input"
                    value={customHotkey}
                    onChange={(e) => setCustomHotkey(e.target.value)}
                    placeholder="e.g. CommandOrControl+Shift+Space"
                  />
                  <button
                    type="button"
                    className="save-hotkey-btn"
                    onClick={() => handleSaveHotkey(customHotkey)}
                  >
                    {hotkeySaved ? <Check size={12} /> : null}
                    <span>{hotkeySaved ? 'Saved' : 'Apply'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: MEMORY SYSTEM EXPLANATION */}
          {step === 3 && (
            <div className="onboarding-step-panel">
              <div className="step-badge-tag">
                <Brain size={12} />
                <span>Persistent Second Brain</span>
              </div>
              <h2 className="step-title">A memory that never forgets</h2>
              <p className="step-subtitle">
                Aeio maintains a running, editable memory of your facts, preferences, and projects that persists across conversations in a local SQLite database.
              </p>

              <div className="step-card memory-preview-card">
                <div className="memory-category-grid">
                  <div className="cat-pill-preview">
                    <span className="cat-dot fact" />
                    <div>
                      <div className="cat-name">Facts</div>
                      <div className="cat-desc">Architecture rules, credentials, technical specifications</div>
                    </div>
                  </div>
                  <div className="cat-pill-preview">
                    <span className="cat-dot preference" />
                    <div>
                      <div className="cat-name">Preferences</div>
                      <div className="cat-desc">Coding conventions, theme preferences, CLI habits</div>
                    </div>
                  </div>
                  <div className="cat-pill-preview">
                    <span className="cat-dot project" />
                    <div>
                      <div className="cat-name">Projects</div>
                      <div className="cat-desc">Milestones, active repositories, directory scopes</div>
                    </div>
                  </div>
                  <div className="cat-pill-preview">
                    <span className="cat-dot person" />
                    <div>
                      <div className="cat-name">People</div>
                      <div className="cat-desc">Team roles, points of contact, collaborators</div>
                    </div>
                  </div>
                </div>

                <div className="memory-nav-cta">
                  <button
                    type="button"
                    className="action-btn secondary"
                    onClick={handleOpenMemoryStore}
                  >
                    <Brain size={13} />
                    <span>Open Memory Store Now</span>
                  </button>
                  <span className="memory-cta-hint">You can inspect, search, edit, or export memories anytime.</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: OPTIONAL CLOUD PROVIDER KEYS */}
          {step === 4 && (
            <div className="onboarding-step-panel">
              <div className="step-badge-tag">
                <Key size={12} />
                <span>Optional Cloud Models</span>
              </div>
              <h2 className="step-title">Bring your own cloud key (optional)</h2>
              <p className="step-subtitle">
                Never required. If you want frontier cloud models like Claude 3.5 Sonnet or GPT-4o, your keys are stored strictly in your native macOS Keychain.
              </p>

              <div className="step-card">
                <div className="provider-input-group">
                  <div className="provider-header-row">
                    <span className="provider-title">Anthropic Claude API Key</span>
                    {hasClaudeStored && (
                      <span className="stored-badge">
                        <ShieldCheck size={11} />
                        <span>Stored in Keychain</span>
                      </span>
                    )}
                  </div>
                  <div className="input-btn-row">
                    <input
                      type="password"
                      className="key-input"
                      placeholder={hasClaudeStored ? '••••••••••••••••••••••••' : 'sk-ant-...'}
                      value={claudeKey}
                      onChange={(e) => setClaudeKey(e.target.value)}
                    />
                    <button
                      type="button"
                      className="save-key-btn"
                      onClick={handleSaveClaudeKey}
                      disabled={!claudeKey.trim()}
                    >
                      Save Key
                    </button>
                  </div>
                </div>

                <div className="provider-input-group">
                  <div className="provider-header-row">
                    <span className="provider-title">OpenAI API Key</span>
                    {hasOpenaiStored && (
                      <span className="stored-badge">
                        <ShieldCheck size={11} />
                        <span>Stored in Keychain</span>
                      </span>
                    )}
                  </div>
                  <div className="input-btn-row">
                    <input
                      type="password"
                      className="key-input"
                      placeholder={hasOpenaiStored ? '••••••••••••••••••••••••' : 'sk-...'}
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                    />
                    <button
                      type="button"
                      className="save-key-btn"
                      onClick={handleSaveOpenaiKey}
                      disabled={!openaiKey.trim()}
                    >
                      Save Key
                    </button>
                  </div>
                </div>

                {keySaveMsg && <div className="key-feedback-msg">{keySaveMsg}</div>}

                <div className="privacy-reassurance">
                  <ShieldCheck size={12} />
                  <span>No login, no analytics, no external storage. Zero network requests made without explicit user action.</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="onboarding-footer">
          <div className="footer-nav-left">
            {step > 1 && (
              <button
                type="button"
                className="step-nav-btn secondary"
                onClick={() => setStep((s) => (s - 1) as any)}
              >
                <ArrowLeft size={13} />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="footer-nav-right">
            {step < 4 ? (
              <button
                type="button"
                className="step-nav-btn primary"
                disabled={step === 1 && !ollamaHealthy && !skippedLocalMode}
                onClick={() => setStep((s) => (s + 1) as any)}
              >
                <span>Continue</span>
                <ArrowRight size={13} />
              </button>
            ) : (
              <button
                type="button"
                className="step-nav-btn primary finish"
                onClick={handleFinish}
              >
                <span>Launch Aeio</span>
                <Check size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
