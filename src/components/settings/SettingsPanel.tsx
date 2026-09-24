import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  setApiKey,
  deleteApiKey,
  hasApiKey,
  getLocalLogs,
  clearLocalLogs,
} from '../../lib/ipc';
import { ollamaProvider } from '../../lib/providers/ollama';
import { qwenCoderProvider } from '../../lib/providers/qwenCoder';
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
  Activity,
  FileText,
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
    telemetryOptIn,
    setActiveProvider,
    setOllamaModel,
    setActiveWindowAwareness,
    setAmbientProactive,
    setHotkey,
    setTelemetryOptIn,
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

  const [localLogs, setLocalLogs] = useState<string | null>(null);
  const [isViewingLogs, setIsViewingLogs] = useState(false);

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
      const provider = activeProvider === 'qwen-coder' ? qwenCoderProvider : ollamaProvider;
      const res = await provider.checkHealth();
      if (res.ok) {
        setOllamaStatus(res.message || 'Online — Local inference daemon running and accessible');
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

  const handleToggleLogs = async () => {
    if (!isViewingLogs) {
      try {
        const logs = await getLocalLogs();
        setLocalLogs(logs);
        setIsViewingLogs(true);
      } catch (err) {
        setLocalLogs(`Failed to read logs: ${err}`);
        setIsViewingLogs(true);
      }
    } else {
      setIsViewingLogs(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await clearLocalLogs();
      setLocalLogs('No local error logs found.');
      showSuccess('Local error log file cleared');
    } catch (err) {
      alert(`Failed to clear logs: ${err}`);
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
          <button className="settings-close-btn" onClick={onClose} aria-label="Close settings" title="Close settings">
            <X size={16} />
          </button>
        )}
      </div>

      {saveSuccessMsg && (
        <div className="settings-banner success" role="status" aria-live="polite">
          <Check size={13} />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

        <div className="settings-scroll-body">
          {/* Active Model Provider Selector */}
          <div className="settings-section">
            <h3 className="section-label" id="provider-group-label">Active Provider</h3>
            <div className="provider-card-grid" role="radiogroup" aria-labelledby="provider-group-label">
              {/* Qwen3-Coder Card (Primary) */}
              <div
                role="radio"
                tabIndex={0}
                aria-checked={activeProvider === 'qwen-coder'}
                className={`provider-option-card ${
                  activeProvider === 'qwen-coder' ? 'selected' : ''
                }`}
                onClick={() => {
                  setActiveProvider('qwen-coder');
                  if (!ollamaModel || ollamaModel === 'llama3.2') {
                    setOllamaModel('qwen3-coder');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveProvider('qwen-coder');
                    if (!ollamaModel || ollamaModel === 'llama3.2') {
                      setOllamaModel('qwen3-coder');
                    }
                  }
                }}
              >
                <div className="provider-option-header">
                  <div className="provider-option-title">
                    <Cpu size={15} />
                    <span>Qwen3-Coder</span>
                  </div>
                  <span className="badge-offline">Primary Local</span>
                </div>
                <p className="provider-option-desc">
                  Optimized for code generation, 32k context, tool calling, and agentic desktop execution.
                </p>
              </div>

              {/* Ollama Generic Card */}
              <div
                role="radio"
                tabIndex={0}
                aria-checked={activeProvider === 'ollama'}
                className={`provider-option-card ${
                  activeProvider === 'ollama' ? 'selected' : ''
                }`}
                onClick={() => setActiveProvider('ollama')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveProvider('ollama');
                  }
                }}
              >
                <div className="provider-option-header">
                  <div className="provider-option-title">
                    <Cpu size={15} />
                    <span>Ollama</span>
                  </div>
                  <span className="badge-offline">Local First</span>
                </div>
                <p className="provider-option-desc">
                  Run custom local weights (Llama 3.2, Mistral, DeepSeek) via Ollama.
                </p>
              </div>

              {/* Claude Card */}
              <div
                role="radio"
                tabIndex={0}
                aria-checked={activeProvider === 'claude'}
                className={`provider-option-card ${
                  activeProvider === 'claude' ? 'selected' : ''
                }`}
                onClick={() => setActiveProvider('claude')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveProvider('claude');
                  }
                }}
              >
                <div className="provider-option-header">
                  <div className="provider-option-title">
                    <Sparkles size={15} />
                    <span>Claude</span>
                  </div>
                  <span className="badge-cloud">BYOK</span>
                </div>
                <p className="provider-option-desc">
                  Anthropic Claude 3.5 Sonnet for frontier reasoning & coding.
                </p>
              </div>

              {/* OpenAI Card */}
              <div
                role="radio"
                tabIndex={0}
                aria-checked={activeProvider === 'openai'}
                className={`provider-option-card ${
                  activeProvider === 'openai' ? 'selected' : ''
                }`}
                onClick={() => setActiveProvider('openai')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveProvider('openai');
                  }
                }}
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

          {/* Local Model Configuration */}
          <div className="settings-section">
            <div className="section-header-flex">
              <h3 className="section-label">Local Model Configuration</h3>
              <button
                className="ollama-refresh-btn"
                onClick={testOllama}
                disabled={isCheckingOllama}
                aria-label="Test local model connection"
              >
                <RefreshCw
                  size={12}
                  className={isCheckingOllama ? 'spin-icon' : ''}
                />
                <span>Test Connection</span>
              </button>
            </div>

            <div className="settings-input-group">
              <label>Model Tag / Name</label>
              <div className="input-with-action">
                <input
                  type="text"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="e.g. qwen3-coder, qwen2.5-coder:7b, llama3.2"
                  aria-label="Local model name or tag"
                />
              </div>

              {/* Quick Model Presets */}
              <div className="hotkey-preset-section" style={{ marginTop: '8px' }}>
                <span className="field-label" style={{ fontSize: '11px', color: 'var(--aeio-text-muted)' }}>Quick Presets:</span>
                <div className="preset-buttons-row" style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }} role="group" aria-label="Model presets">
                  <button
                    type="button"
                    className={`preset-btn ${ollamaModel === 'qwen3-coder' ? 'active' : ''}`}
                    onClick={() => setOllamaModel('qwen3-coder')}
                    aria-label="Select qwen3-coder preset"
                  >
                    qwen3-coder
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${ollamaModel === 'qwen2.5-coder:7b' ? 'active' : ''}`}
                    onClick={() => setOllamaModel('qwen2.5-coder:7b')}
                    aria-label="Select qwen2.5-coder:7b preset"
                  >
                    qwen2.5-coder:7b
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${ollamaModel === 'qwen2.5-coder:14b' ? 'active' : ''}`}
                    onClick={() => setOllamaModel('qwen2.5-coder:14b')}
                    aria-label="Select qwen2.5-coder:14b preset"
                  >
                    qwen2.5-coder:14b
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${ollamaModel === 'llama3.2' ? 'active' : ''}`}
                    onClick={() => setOllamaModel('llama3.2')}
                    aria-label="Select llama3.2 preset"
                  >
                    llama3.2
                  </button>
                </div>
              </div>

              <span className="input-hint" style={{ marginTop: '6px' }}>
                Weights are stored locally. Pull with <code>ollama pull {ollamaModel || 'qwen3-coder'}</code>
              </span>
            </div>

            {ollamaStatus && (
              <div
                className={`ollama-status-badge ${
                  ollamaStatus.startsWith('Online') ? 'online' : 'offline'
                }`}
                role="status"
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
                  aria-label="Claude API Key"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveClaudeKey();
                    }
                  }}
                />
                <button
                  className="key-save-btn"
                  onClick={handleSaveClaudeKey}
                  disabled={!claudeInput.trim()}
                  aria-label="Save Claude API key"
                >
                  Save Key
                </button>
                {hasClaudeStored && (
                  <button
                    className="key-delete-btn"
                    onClick={handleDeleteClaudeKey}
                    title="Remove key from keychain"
                    aria-label="Delete Claude API key from keychain"
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
                  aria-label="OpenAI API Key"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveOpenaiKey();
                    }
                  }}
                />
                <button
                  className="key-save-btn"
                  onClick={handleSaveOpenaiKey}
                  disabled={!openaiInput.trim()}
                  aria-label="Save OpenAI API key"
                >
                  Save Key
                </button>
                {hasOpenaiStored && (
                  <button
                    className="key-delete-btn"
                    onClick={handleDeleteOpenaiKey}
                    title="Remove key from keychain"
                    aria-label="Delete OpenAI API key from keychain"
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
              <label className="switch-toggle" aria-label="Toggle active window context">
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={activeWindowAwareness}
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
              <label className="switch-toggle" aria-label="Toggle ambient intelligence and proactive nudges">
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={ambientProactive}
                  checked={ambientProactive}
                  onChange={(e) => setAmbientProactive(e.target.checked)}
                />
                <span className="slider-round" />
              </label>
            </div>
          </div>

          {/* Privacy-Safe Observability & Diagnostics (Phase 4 Opt-in) */}
          <div className="settings-section">
            <h3 className="section-label">
              <div className="label-with-icon">
                <Activity size={14} />
                <span>Privacy-Safe Observability & Diagnostics (Opt-in)</span>
              </div>
            </h3>
            <div className="toggle-setting-card">
              <div className="toggle-text-block">
                <strong>Anonymous Crash & Error Reporting</strong>
                <p>
                  Helps diagnose bugs and unexpected runtime panics. When enabled, reports only sanitized error codes, OS architecture, and sanitized stack traces.
                </p>
                <div className="privacy-callout">
                  <ShieldCheck size={12} />
                  <span>Strictly opt-in (Default OFF). ZERO memories, ZERO chat messages, ZERO API keys, and ZERO usernames are ever collected or sent.</span>
                </div>
              </div>
              <label className="switch-toggle" aria-label="Toggle anonymous crash and error reporting">
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={telemetryOptIn}
                  checked={telemetryOptIn}
                  onChange={(e) => setTelemetryOptIn(e.target.checked)}
                />
                <span className="slider-round" />
              </label>
            </div>

            {/* Local Disk Log Transparency Box */}
            <div className="shortcut-box" style={{ marginTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--aeio-text-primary)' }}>
                    Local Error Log File
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--aeio-text-muted)', marginTop: '2px' }}>
                    Stored locally at <code>~/.aeio/logs/errors.log</code> (auto-rotated at 2MB). Always active offline even when telemetry is disabled.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="action-btn secondary"
                    style={{ padding: '5px 10px', fontSize: '11px', width: 'auto' }}
                    onClick={handleToggleLogs}
                    aria-label="Inspect local error log"
                  >
                    <FileText size={12} />
                    <span>{isViewingLogs ? 'Hide Log' : 'Inspect Log'}</span>
                  </button>
                  {isViewingLogs && (
                    <button
                      type="button"
                      className="action-btn secondary"
                      style={{ padding: '5px 10px', fontSize: '11px', width: 'auto', color: '#ff6b6b' }}
                      onClick={handleClearLogs}
                      aria-label="Clear local error log"
                    >
                      <Trash2 size={12} />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>

              {isViewingLogs && (
                <div className="local-logs-viewer" style={{
                  marginTop: '10px',
                  padding: '10px',
                  borderRadius: '6px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid var(--aeio-border-subtle)',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  whiteSpace: 'pre-wrap',
                  color: 'var(--aeio-text-secondary)',
                }}>
                  {localLogs}
                </div>
              )}
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
                <div className="preset-buttons-row" style={{ display: 'flex', gap: '8px', marginTop: '6px' }} role="group" aria-label="Shortcut presets">
                  <button
                    type="button"
                    className={`preset-btn ${hotkey === 'CommandOrControl+Shift+Space' ? 'active' : ''}`}
                    onClick={() => {
                      setHotkeyInput('CommandOrControl+Shift+Space');
                      setHotkey('CommandOrControl+Shift+Space');
                      setHotkeySaved(true);
                      setTimeout(() => setHotkeySaved(false), 1500);
                    }}
                    aria-label="Set shortcut to Command Shift Space"
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
                    aria-label="Set shortcut to Option Space"
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
                    aria-label="Set shortcut to Command Space"
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const clean = hotkeyInput.trim();
                      if (clean) {
                        setHotkey(clean);
                        setHotkeySaved(true);
                        setTimeout(() => setHotkeySaved(false), 1500);
                      }
                    }
                  }}
                  placeholder="e.g. CommandOrControl+Shift+Space"
                  aria-label="Custom global shortcut"
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
                  aria-label="Apply custom shortcut"
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
                  aria-label="Launch first-run onboarding setup guide"
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
