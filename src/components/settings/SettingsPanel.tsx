import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  setApiKey,
  deleteApiKey,
  hasApiKey,
} from '../../lib/ipc';
import { ollamaProvider } from '../../lib/providers/ollama';
import {
  X,
  Cpu,
  Sparkles,
  Key,
  ShieldCheck,
  Check,
  Trash2,
  RefreshCw,
  Sliders,
  AppWindow,
  Compass,
} from 'lucide-react';

interface Props {
  isOpen?: boolean;
  onClose?: () => void;
  onOpenOnboarding?: () => void;
}

export const SettingsPanel: React.FC<Props> = ({ isOpen, onClose, onOpenOnboarding }) => {
  const {
    activeProvider,
    ollamaModel,
    activeWindowAwareness,
    ambientProactive,
    hotkey,
    setActiveProvider,
    setOllamaModel,
    setActiveWindowAwareness,
    setAmbientProactive,
    setHotkey,
  } = useSettingsStore();

  const [hotkeyInput, setHotkeyInput] = useState(hotkey);
  const [hotkeySaved, setHotkeySaved] = useState(false);

  const [claudeInput, setClaudeInput] = useState('');
  const [openaiInput, setOpenaiInput] = useState('');
  const [hasClaudeStored, setHasClaudeStored] = useState(false);
  const [hasOpenaiStored, setHasOpenaiStored] = useState(false);

  const [ollamaStatus, setOllamaStatus] = useState<string | null>(null);
  const [isCheckingOllama, setIsCheckingOllama] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen === undefined || isOpen === true) {
      checkKeychains();
      testOllama();
    }
  }, [isOpen]);

  const checkKeychains = async () => {
    try {
      const claudeExists = await hasApiKey('claude');
      setHasClaudeStored(claudeExists);
      const openaiExists = await hasApiKey('openai');
      setHasOpenaiStored(openaiExists);
    } catch (err) {
      console.warn('Keychain check failed:', err);
    }
  };

  const testOllama = async () => {
    setIsCheckingOllama(true);
    setOllamaStatus(null);
    try {
      const res = await ollamaProvider.checkHealth();
      if (res.ok) {
        setOllamaStatus('Online — Ollama daemon running and accessible');
      } else {
        setOllamaStatus(res.message || 'Offline — Could not reach localhost:11434');
      }
    } catch {
      setOllamaStatus('Offline — Could not reach localhost:11434');
    } finally {
      setIsCheckingOllama(false);
    }
  };

  const handleSaveClaudeKey = async () => {
    const trimmed = claudeInput.trim();
    if (!trimmed) return;
    try {
      await setApiKey('claude', trimmed);
      setClaudeInput('');
      setHasClaudeStored(true);
      showSuccess('Claude API key secured in OS Keychain');
    } catch (err: unknown) {
      alert(`Failed to save to Keychain: ${err}`);
    }
  };

  const handleDeleteClaudeKey = async () => {
    try {
      await deleteApiKey('claude');
      setHasClaudeStored(false);
      showSuccess('Claude API key removed from OS Keychain');
    } catch (err: unknown) {
      alert(`Failed to remove key: ${err}`);
    }
  };

  const handleSaveOpenaiKey = async () => {
    const trimmed = openaiInput.trim();
    if (!trimmed) return;
    try {
      await setApiKey('openai', trimmed);
      setOpenaiInput('');
      setHasOpenaiStored(true);
      showSuccess('OpenAI API key secured in OS Keychain');
    } catch (err: unknown) {
      alert(`Failed to save to Keychain: ${err}`);
    }
  };

  const handleDeleteOpenaiKey = async () => {
    try {
      await deleteApiKey('openai');
      setHasOpenaiStored(false);
      showSuccess('OpenAI API key removed from OS Keychain');
    } catch (err: unknown) {
      alert(`Failed to remove key: ${err}`);
    }
  };

  const showSuccess = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  if (isOpen === false) return null;

  const cardContent = (
    <div
      className={isOpen !== undefined ? 'settings-modal-card' : 'settings-panel-view'}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Modal Header */}
      <div className="settings-header">
        <div className="settings-header-title">
          <Sliders size={16} className="settings-title-icon" />
          <h2>Settings & Providers</h2>
        </div>
        {onClose && (
          <button className="settings-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        )}
      </div>

      {saveSuccessMsg && (
        <div className="settings-banner success">
          <Check size={13} />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

        <div className="settings-scroll-body">
          {/* Active Model Provider Selector */}
          <div className="settings-section">
            <h3 className="section-label">Active Provider</h3>
            <div className="provider-card-grid">
              {/* Ollama Card */}
              <div
                className={`provider-option-card ${
                  activeProvider === 'ollama' ? 'selected' : ''
                }`}
                onClick={() => setActiveProvider('ollama')}
              >
                <div className="provider-option-header">
                  <div className="provider-option-title">
                    <Cpu size={15} />
                    <span>Ollama</span>
                  </div>
                  <span className="badge-offline">Local First</span>
                </div>
                <p className="provider-option-desc">
                  100% offline, zero data leaves your machine. Default.
                </p>
              </div>

              {/* Claude Card */}
              <div
                className={`provider-option-card ${
                  activeProvider === 'claude' ? 'selected' : ''
                }`}
                onClick={() => setActiveProvider('claude')}
              >
                <div className="provider-option-header">
                  <div className="provider-option-title">
                    <Sparkles size={15} />
                    <span>Claude</span>
                  </div>
                  <span className="badge-cloud">BYOK</span>
                </div>
                <p className="provider-option-desc">
                  Anthropic Claude 3.5 Sonnet for deep reasoning & coding.
                </p>
              </div>

              {/* OpenAI Card */}
              <div
                className={`provider-option-card ${
                  activeProvider === 'openai' ? 'selected' : ''
                }`}
                onClick={() => setActiveProvider('openai')}
              >
                <div className="provider-option-header">
                  <div className="provider-option-title">
                    <Sparkles size={15} />
                    <span>OpenAI</span>
                  </div>
                  <span className="badge-cloud">BYOK</span>
                </div>
                <p className="provider-option-desc">
                  GPT-4o / o1 high-speed reasoning API.
                </p>
              </div>
            </div>
          </div>

          {/* Local Ollama Settings */}
          <div className="settings-section">
            <div className="section-header-flex">
              <h3 className="section-label">Ollama Configuration</h3>
              <button
                className="ollama-refresh-btn"
                onClick={testOllama}
                disabled={isCheckingOllama}
              >
                <RefreshCw
                  size={12}
                  className={isCheckingOllama ? 'spin-icon' : ''}
                />
                <span>Test Connection</span>
              </button>
            </div>

            <div className="settings-input-group">
              <label>Default Model Name</label>
              <div className="input-with-action">
                <input
                  type="text"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="e.g. llama3.2, llama3.1, mistral, qwen2.5"
                />
              </div>
              <span className="input-hint">
                Installed models can be pulled anytime via <code>ollama pull &lt;model&gt;</code>
              </span>
            </div>

            {ollamaStatus && (
              <div
                className={`ollama-status-badge ${
                  ollamaStatus.startsWith('Online') ? 'online' : 'offline'
                }`}
              >
                <div className="status-dot" />
                <span>{ollamaStatus}</span>
              </div>
            )}
          </div>

          {/* BYOK Secure Key Storage */}
          <div className="settings-section">
            <h3 className="section-label">
              <div className="label-with-icon">
                <Key size={14} />
                <span>Bring Your Own Key (BYOK) — OS Keychain</span>
              </div>
            </h3>

            <div className="security-notice-box">
              <ShieldCheck size={16} className="security-icon" />
              <div className="security-text">
                <strong>Zero-Plaintext Guarantee</strong>
                <p>
                  Keys are stored exclusively in your operating system's native encrypted credential store (macOS Keychain or Windows Credential Manager). They are never saved to plaintext configuration files or browser storage.
                </p>
              </div>
            </div>

            {/* Claude Key */}
            <div className="key-config-row">
              <div className="key-info">
                <span className="key-name">Anthropic Claude API Key</span>
                {hasClaudeStored ? (
                  <span className="key-status-saved">
                    <ShieldCheck size={12} /> Stored in OS Keychain
                  </span>
                ) : (
                  <span className="key-status-missing">No key configured</span>
                )}
              </div>

              <div className="key-input-row">
                <input
                  type="password"
                  placeholder={hasClaudeStored ? '••••••••••••••••••••••••' : 'sk-ant-...'}
                  value={claudeInput}
                  onChange={(e) => setClaudeInput(e.target.value)}
                />
                <button
                  className="key-save-btn"
                  onClick={handleSaveClaudeKey}
                  disabled={!claudeInput.trim()}
                >
                  Save Key
                </button>
                {hasClaudeStored && (
                  <button
                    className="key-delete-btn"
                    onClick={handleDeleteClaudeKey}
                    title="Remove key from keychain"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* OpenAI Key */}
            <div className="key-config-row">
              <div className="key-info">
                <span className="key-name">OpenAI API Key</span>
                {hasOpenaiStored ? (
                  <span className="key-status-saved">
                    <ShieldCheck size={12} /> Stored in OS Keychain
                  </span>
                ) : (
                  <span className="key-status-missing">No key configured</span>
                )}
              </div>

              <div className="key-input-row">
                <input
                  type="password"
                  placeholder={hasOpenaiStored ? '••••••••••••••••••••••••' : 'sk-...'}
                  value={openaiInput}
                  onChange={(e) => setOpenaiInput(e.target.value)}
                />
                <button
                  className="key-save-btn"
                  onClick={handleSaveOpenaiKey}
                  disabled={!openaiInput.trim()}
                >
                  Save Key
                </button>
                {hasOpenaiStored && (
                  <button
                    className="key-delete-btn"
                    onClick={handleDeleteOpenaiKey}
                    title="Remove key from keychain"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* OS Integration & Active Window Context (Tier 2 Opt-in) */}
          <div className="settings-section">
            <h3 className="section-label">
              <div className="label-with-icon">
                <AppWindow size={14} />
                <span>Active Window Context (Tier 2 Opt-in)</span>
              </div>
            </h3>
            <div className="toggle-setting-card">
              <div className="toggle-text-block">
                <strong>Read Frontmost App Title on Summon</strong>
                <p>
                  When summoned, Aeio queries the process name and title of your active window (e.g. <code>VS Code - main.rs</code> or <code>Arc - Github</code>) to provide immediate context to your prompts.
                </p>
                <div className="privacy-callout">
                  <ShieldCheck size={12} />
                  <span>Strictly opt-in. Aeio never reads window contents or screen pixels without your explicit request.</span>
                </div>
              </div>
              <label className="switch-toggle">
                <input
                  type="checkbox"
                  checked={activeWindowAwareness}
                  onChange={(e) => setActiveWindowAwareness(e.target.checked)}
                />
                <span className="slider-round" />
              </label>
            </div>
          </div>

          {/* Ambient & Proactive Intelligence (Tier 5 Opt-in) */}
          <div className="settings-section">
            <h3 className="section-label">
              <div className="label-with-icon">
                <Compass size={14} />
                <span>Ambient Intelligence & Proactive Nudges (Tier 5 Opt-in)</span>
              </div>
            </h3>
            <div className="toggle-setting-card">
              <div className="toggle-text-block">
                <strong>Pattern Noticing & Workspace Suggestions</strong>
                <p>
                  Lightweight checks for repeated queries and relevant workspace notes to suggest helpful actions without waiting to be asked.
                </p>
                <div className="privacy-callout">
                  <ShieldCheck size={12} />
                  <span>Never runs secretly — a glowing indicator appears in the header. Nudges are 1-click dismissible and never reappear. With toggle off, zero background checks run.</span>
                </div>
              </div>
              <label className="switch-toggle">
                <input
                  type="checkbox"
                  checked={ambientProactive}
                  onChange={(e) => setAmbientProactive(e.target.checked)}
                />
                <span className="slider-round" />
              </label>
            </div>
          </div>

          {/* Shortcuts & App Info */}
          <div className="settings-section">
            <h3 className="section-label">Global Summon Shortcut</h3>
            <div className="shortcut-box">
              <div className="shortcut-keys">
                <kbd>{hotkey}</kbd>
              </div>
              <p className="shortcut-desc">
                Summons Aeio centered on your screen from anywhere in the OS, even over full-screen apps and games. Press again or hit Esc to hide.
              </p>

              <div className="hotkey-preset-section" style={{ marginTop: '12px' }}>
                <span className="field-label" style={{ fontSize: '11px', color: 'var(--aeio-text-muted)' }}>Quick Presets:</span>
                <div className="preset-buttons-row" style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button
                    type="button"
                    className={`preset-btn ${hotkey === 'CommandOrControl+Shift+Space' ? 'active' : ''}`}
                    onClick={() => {
                      setHotkeyInput('CommandOrControl+Shift+Space');
                      setHotkey('CommandOrControl+Shift+Space');
                      setHotkeySaved(true);
                      setTimeout(() => setHotkeySaved(false), 1500);
                    }}
                  >
                    ⌘ ⇧ Space
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${hotkey === 'Alt+Space' ? 'active' : ''}`}
                    onClick={() => {
                      setHotkeyInput('Alt+Space');
                      setHotkey('Alt+Space');
                      setHotkeySaved(true);
                      setTimeout(() => setHotkeySaved(false), 1500);
                    }}
                  >
                    ⌥ Space
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${hotkey === 'CommandOrControl+Space' ? 'active' : ''}`}
                    onClick={() => {
                      setHotkeyInput('CommandOrControl+Space');
                      setHotkey('CommandOrControl+Space');
                      setHotkeySaved(true);
                      setTimeout(() => setHotkeySaved(false), 1500);
                    }}
                  >
                    ⌘ Space
                  </button>
                </div>
              </div>

              <div className="custom-hotkey-input-row" style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <input
                  type="text"
                  className="custom-hotkey-input"
                  value={hotkeyInput}
                  onChange={(e) => setHotkeyInput(e.target.value)}
                  placeholder="e.g. CommandOrControl+Shift+Space"
                />
                <button
                  type="button"
                  className="save-hotkey-btn"
                  onClick={() => {
                    const clean = hotkeyInput.trim();
                    if (clean) {
                      setHotkey(clean);
                      setHotkeySaved(true);
                      setTimeout(() => setHotkeySaved(false), 1500);
                    }
                  }}
                >
                  {hotkeySaved ? <Check size={12} /> : null}
                  <span>{hotkeySaved ? 'Saved' : 'Apply'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* First-Run Onboarding Guide Replay */}
          {onOpenOnboarding && (
            <div className="settings-section">
              <h3 className="section-label">Onboarding & First-Run</h3>
              <div className="shortcut-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--aeio-text-primary)' }}>First-Run Setup Guide</div>
                  <div style={{ fontSize: '11px', color: 'var(--aeio-text-muted)' }}>Re-run the initial setup wizard to verify Ollama, rebind hotkeys, or configure models.</div>
                </div>
                <button
                  type="button"
                  className="action-btn secondary"
                  style={{ padding: '6px 12px', fontSize: '11px', width: 'auto' }}
                  onClick={onOpenOnboarding}
                >
                  <Sparkles size={12} />
                  <span>Launch Guide</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );

  if (isOpen !== undefined) {
    return (
      <div className="settings-modal-overlay" onClick={onClose}>
        {cardContent}
      </div>
    );
  }

  return cardContent;
};
