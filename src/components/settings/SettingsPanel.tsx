import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  setApiKey,
  deleteApiKey,
  hasApiKey,
  getLocalLogs,
  getTelemetryLogs,
  clearLocalLogs,
  recordError,
  exportMemories,
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
  Activity,
  FileText,
  Brain,
  Download,
  Database,
  AlertTriangle,
  ShieldAlert,
  Ban,
  PowerOff,
  Eye,
} from 'lucide-react';
import { VisualAuditLogViewer } from '../safety/VisualAuditLogViewer';

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
    hotkey,
    telemetryOptIn,
    neverSendMemoriesToCloud,
    installationId,
    hostedProxyUrl,
    setActiveProvider,
    setOllamaModel,
    setActiveWindowAwareness,
    setHotkey,
    setTelemetryOptIn,
    setNeverSendMemoriesToCloud,
    setHostedProxyUrl,
    computerControlEnabled,
    computerControlAllowlist,
    setComputerControlEnabled,
    addToComputerControlAllowlist,
    removeFromComputerControlAllowlist,
    killSwitchTripped,
    killSwitchReason,
    resetKillSwitchAction,
    setKillSwitchTripped,
    groundingEndpointUrl,
    groundingModelType,
    setGroundingEndpointUrl,
    setGroundingModelType,
  } = useSettingsStore();

  const [activeSection, setActiveSection] = useState<'providers' | 'memory' | 'privacy' | 'shortcuts' | 'computerControl'>('providers');
  const [newAppInput, setNewAppInput] = useState('');
  const [allowlistError, setAllowlistError] = useState<string | null>(null);
  const [pendingBrowserBundle, setPendingBrowserBundle] = useState<string | null>(null);
  const [pendingBrowserWarning, setPendingBrowserWarning] = useState<string | null>(null);
  const [hotkeyInput, setHotkeyInput] = useState(hotkey);
  const [hotkeySaved, setHotkeySaved] = useState(false);
  const [copiedInstallId, setCopiedInstallId] = useState(false);
  const [proxyUrlInput, setProxyUrlInput] = useState(hostedProxyUrl);

  const [claudeInput, setClaudeInput] = useState('');
  const [openaiInput, setOpenaiInput] = useState('');
  const [geminiInput, setGeminiInput] = useState('');
  const [hasClaudeStored, setHasClaudeStored] = useState(false);
  const [hasOpenaiStored, setHasOpenaiStored] = useState(false);
  const [hasGeminiStored, setHasGeminiStored] = useState(false);

  const [groundingEndpointInput, setGroundingEndpointInput] = useState(groundingEndpointUrl);
  const [groundingKeyInput, setGroundingKeyInput] = useState('');
  const [hasGroundingStored, setHasGroundingStored] = useState(false);
  const [isTestingGrounding, setIsTestingGrounding] = useState(false);
  const [groundingTestStatus, setGroundingTestStatus] = useState<string | null>(null);

  const [ollamaStatus, setOllamaStatus] = useState<string | null>(null);
  const [isCheckingOllama, setIsCheckingOllama] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const [localLogs, setLocalLogs] = useState<string | null>(null);
  const [isViewingLogs, setIsViewingLogs] = useState(false);
  const [isAuditViewerOpen, setIsAuditViewerOpen] = useState(false);

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
      const geminiExists = await hasApiKey('gemini');
      setHasGeminiStored(geminiExists);
      const groundingExists = await hasApiKey('grounding');
      setHasGroundingStored(groundingExists);
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

  const handleSaveGeminiKey = async () => {
    const trimmed = geminiInput.trim();
    if (!trimmed) return;
    try {
      await setApiKey('gemini', trimmed);
      setGeminiInput('');
      setHasGeminiStored(true);
      showSuccess('Google Gemini API key secured in OS Keychain');
    } catch (err: unknown) {
      alert(`Failed to save to Keychain: ${err}`);
    }
  };

  const handleDeleteGeminiKey = async () => {
    try {
      await deleteApiKey('gemini');
      setHasGeminiStored(false);
      showSuccess('Google Gemini API key removed from OS Keychain');
    } catch (err: unknown) {
      alert(`Failed to remove key: ${err}`);
    }
  };

  const handleSaveGroundingKey = async () => {
    const trimmed = groundingKeyInput.trim();
    if (!trimmed) return;
    try {
      await setApiKey('grounding', trimmed);
      setGroundingKeyInput('');
      setHasGroundingStored(true);
      showSuccess('Grounding API key secured in OS Keychain');
    } catch (err: unknown) {
      alert(`Failed to save to Keychain: ${err}`);
    }
  };

  const handleDeleteGroundingKey = async () => {
    try {
      await deleteApiKey('grounding');
      setHasGroundingStored(false);
      showSuccess('Grounding API key removed from OS Keychain');
    } catch (err: unknown) {
      alert(`Failed to remove key: ${err}`);
    }
  };

  const handleSaveGroundingEndpoint = () => {
    const clean = groundingEndpointInput.trim();
    setGroundingEndpointUrl(clean);
    showSuccess('Grounding endpoint URL updated');
  };

  const handleTestGroundingEndpoint = async () => {
    const url = groundingEndpointInput.trim();
    if (!url) {
      setGroundingTestStatus('Error: Please enter an endpoint URL first.');
      return;
    }
    setIsTestingGrounding(true);
    setGroundingTestStatus(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ping: true }),
      }).catch(async () => {
        return await fetch(url, { method: 'GET' });
      });

      if (response && response.status < 500) {
        setGroundingTestStatus(`Reachable (HTTP ${response.status}) — Endpoint online`);
      } else {
        setGroundingTestStatus(`Offline or unreachable (${response ? 'HTTP ' + response.status : 'Network error'})`);
      }
    } catch (err: unknown) {
      setGroundingTestStatus(`Connection error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsTestingGrounding(false);
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

  const [outboundLogs, setOutboundLogs] = useState<string | null>(null);
  const [isViewingOutboundLogs, setIsViewingOutboundLogs] = useState(false);
  const [testPayloadPreview, setTestPayloadPreview] = useState<string | null>(null);

  const handleToggleOutboundLogs = async () => {
    if (!isViewingOutboundLogs) {
      try {
        const logs = await getTelemetryLogs();
        setOutboundLogs(logs);
        setIsViewingOutboundLogs(true);
      } catch (err) {
        setOutboundLogs(`Failed to read outbound logs: ${err}`);
        setIsViewingOutboundLogs(true);
      }
    } else {
      setIsViewingOutboundLogs(false);
    }
  };

  const handleTriggerTestError = async () => {
    try {
      // Trigger a synthetic diagnostic error containing sensitive path and key to verify sanitization
      const payload = await recordError(
        'DiagnosticVerificationError',
        'Manual verification trigger with path /Users/apple/secret/prompt.txt and key sk-ant-api03-1234567890abcdef',
        'Error: Verification\n    at handleTriggerTestError (/Users/apple/Desktop/PROJECTS/aeio/src/SettingsPanel.tsx:170:15)',
        telemetryOptIn,
        ollamaModel || 'qwen2.5-coder:7b'
      );
      if (payload) {
        setTestPayloadPreview(JSON.stringify(payload, null, 2));
        showSuccess('Diagnostic event recorded & payload validated');
      } else {
        setTestPayloadPreview(null);
        showSuccess('Local error recorded (outbound disabled while opt-in is OFF)');
      }
      // Refresh visible logs if open
      if (isViewingLogs) {
        const logs = await getLocalLogs();
        setLocalLogs(logs);
      }
      if (isViewingOutboundLogs) {
        const outLogs = await getTelemetryLogs();
        setOutboundLogs(outLogs);
      }
    } catch (err) {
      alert(`Diagnostic trigger failed: ${err}`);
    }
  };

  const handleClearLogs = async () => {
    try {
      await clearLocalLogs();
      setLocalLogs('No local error logs found.');
      setOutboundLogs('No outbound telemetry payloads logged.');
      setTestPayloadPreview(null);
      showSuccess('Local and outbound error logs cleared');
    } catch (err) {
      alert(`Failed to clear logs: ${err}`);
    }
  };

  const showSuccess = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleAddApp = (confirmBrowser = false) => {
    const target = confirmBrowser ? pendingBrowserBundle : newAppInput.trim();
    if (!target) return;
    setAllowlistError(null);

    const res = addToComputerControlAllowlist(target, confirmBrowser);
    if (!res.success) {
      if (res.requiresBrowserConfirm) {
        setPendingBrowserBundle(target);
        setPendingBrowserWarning(res.warning || null);
      } else if (res.error) {
        setAllowlistError(res.error);
      }
    } else {
      setNewAppInput('');
      setPendingBrowserBundle(null);
      setPendingBrowserWarning(null);
      showSuccess(`Added '${target}' to allowlist`);
    }
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

      {/* Logical Section Tabs: Providers, Memory, Privacy, Shortcuts */}
      <div className="settings-nav-tabs" role="tablist" aria-label="Settings sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'providers'}
          className={`settings-nav-tab ${activeSection === 'providers' ? 'active' : ''}`}
          onClick={() => setActiveSection('providers')}
        >
          <Cpu size={13} aria-hidden="true" />
          <span>Providers</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'memory'}
          className={`settings-nav-tab ${activeSection === 'memory' ? 'active' : ''}`}
          onClick={() => setActiveSection('memory')}
        >
          <Brain size={13} aria-hidden="true" />
          <span>Memory</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'privacy'}
          className={`settings-nav-tab ${activeSection === 'privacy' ? 'active' : ''}`}
          onClick={() => setActiveSection('privacy')}
        >
          <ShieldCheck size={13} aria-hidden="true" />
          <span>Privacy</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'shortcuts'}
          className={`settings-nav-tab ${activeSection === 'shortcuts' ? 'active' : ''}`}
          onClick={() => setActiveSection('shortcuts')}
        >
          <Sliders size={13} aria-hidden="true" />
          <span>Shortcuts</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'computerControl'}
          className={`settings-nav-tab ${activeSection === 'computerControl' ? 'active' : ''}`}
          onClick={() => setActiveSection('computerControl')}
        >
          <ShieldAlert size={13} aria-hidden="true" />
          <span>Computer Control</span>
        </button>
      </div>

      <div className="settings-scroll-body">
        {activeSection === 'providers' && (
          <>
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

              {/* Aeio Free Card */}
              <div
                role="radio"
                tabIndex={0}
                aria-checked={activeProvider === 'aeio-free'}
                className={`provider-option-card ${
                  activeProvider === 'aeio-free' ? 'selected' : ''
                }`}
                onClick={() => setActiveProvider('aeio-free')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveProvider('aeio-free');
                  }
                }}
              >
                <div className="provider-option-header">
                  <div className="provider-option-title">
                    <Sparkles size={15} />
                    <span>Aeio Free</span>
                  </div>
                  <span className="badge-cloud">30 msg/day</span>
                </div>
                <p className="provider-option-desc">
                  Zero-config hosted proxy with Claude 3.5 Haiku. No local runtime or API key required.
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

              {/* Google Gemini Card */}
              <div
                role="radio"
                tabIndex={0}
                aria-checked={activeProvider === 'gemini'}
                className={`provider-option-card ${
                  activeProvider === 'gemini' ? 'selected' : ''
                }`}
                onClick={() => setActiveProvider('gemini')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveProvider('gemini');
                  }
                }}
              >
                <div className="provider-option-header">
                  <div className="provider-option-title">
                    <Sparkles size={15} />
                    <span>Gemini</span>
                  </div>
                  <span className="badge-cloud">BYOK</span>
                </div>
                <p className="provider-option-desc">
                  Gemini 3.7 Flash ultra-fast reasoning & 1M+ context.
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

            {/* Google Gemini Key */}
            <div className="key-config-row">
              <div className="key-info">
                <span className="key-name">Google Gemini API Key</span>
                {hasGeminiStored ? (
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
                  placeholder={hasGeminiStored ? '••••••••••••••••••••••••' : 'AIzaSy... / AQ...'}
                  value={geminiInput}
                  onChange={(e) => setGeminiInput(e.target.value)}
                  aria-label="Google Gemini API Key"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveGeminiKey();
                    }
                  }}
                />
                <button
                  className="key-save-btn"
                  onClick={handleSaveGeminiKey}
                  disabled={!geminiInput.trim()}
                  aria-label="Save Google Gemini API key"
                >
                  Save Key
                </button>
                {hasGeminiStored && (
                  <button
                    className="key-delete-btn"
                    onClick={handleDeleteGeminiKey}
                    title="Remove key from keychain"
                    aria-label="Delete Google Gemini API key from keychain"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Aeio Free Tier Configuration */}
          <div className="settings-section">
            <h3 className="section-label">
              <div className="label-with-icon">
                <Sparkles size={14} />
                <span>Aeio Free (Hosted Tier)</span>
              </div>
            </h3>

            <div className="security-notice-box">
              <ShieldCheck size={16} className="security-icon" />
              <div className="security-text">
                <strong>Anonymous Rate Limiting</strong>
                <p>
                  Aeio Free provides 30 daily free messages via a privacy-preserving hosted proxy backed by Claude 3.5 Haiku. Requests are metered anonymously using a client-generated installation ID without any personal accounts or tracking.
                </p>
              </div>
            </div>

            <div className="key-config-row">
              <div className="key-info">
                <span className="key-name">Anonymous Installation ID</span>
                <span className="key-status-saved">
                  <ShieldCheck size={12} /> Stored Locally
                </span>
              </div>
              <div className="key-input-row">
                <input
                  type="text"
                  readOnly
                  value={installationId}
                  style={{ fontFamily: 'monospace', fontSize: '11px', opacity: 0.9 }}
                  aria-label="Anonymous Installation ID"
                />
                <button
                  type="button"
                  className="key-save-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(installationId);
                    setCopiedInstallId(true);
                    setTimeout(() => setCopiedInstallId(false), 2000);
                  }}
                  aria-label="Copy Installation ID"
                >
                  {copiedInstallId ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="key-config-row">
              <div className="key-info">
                <span className="key-name">Hosted Proxy Endpoint</span>
                {hostedProxyUrl ? (
                  <span className="key-status-saved">
                    <Check size={12} /> Configured
                  </span>
                ) : (
                  <span className="key-status-missing" style={{ color: 'var(--aeio-warning, #f59e0b)' }}>
                    <AlertTriangle size={12} /> Not Configured
                  </span>
                )}
              </div>
              <div className="key-input-row">
                <input
                  type="text"
                  value={proxyUrlInput}
                  onChange={(e) => setProxyUrlInput(e.target.value)}
                  placeholder="https://aeio-free-proxy.<subdomain>.workers.dev"
                  aria-label="Hosted Proxy Endpoint"
                />
                <button
                  type="button"
                  className="key-save-btn"
                  onClick={() => {
                    setHostedProxyUrl(proxyUrlInput.trim());
                    showSuccess('Hosted proxy endpoint updated');
                  }}
                  disabled={!proxyUrlInput.trim()}
                  aria-label="Save Proxy URL"
                >
                  Save URL
                </button>
              </div>
              {!hostedProxyUrl && (
                <span className="input-hint" style={{ marginTop: '4px', fontSize: '11px', color: 'var(--aeio-text-muted, #888)' }}>
                  Deploy the worker with <code>npx wrangler deploy</code> in <code>server/</code> and paste your printed URL here.
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Memory Section */}
      {activeSection === 'memory' && (
        <>
          <div className="settings-section">
            <h3 className="section-label">
              <div className="label-with-icon">
                <Database size={14} />
                <span>Memory Store Architecture (Tier 1)</span>
              </div>
            </h3>
            <div className="toggle-setting-card">
              <div className="toggle-text-block">
                <strong>Local SQLite WAL + sqlite-vec Hybrid Index</strong>
                <p>
                  Memories are stored locally at <code>~/.aeio/memory.db</code> with WAL crash recovery. Retrieval combines 384-dimension all-MiniLM-L6-v2 vector embeddings with FTS exact-term ranking so names and paths are never missed.
                </p>
                <div className="privacy-callout">
                  <ShieldCheck size={12} />
                  <span>Zero memory contents are ever transmitted to third-party logging or cloud vectors.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="section-label">
              <div className="label-with-icon">
                <Brain size={14} />
                <span>Workspace Isolation & Scoping (Tier 4)</span>
              </div>
            </h3>
            <div className="toggle-setting-card">
              <div className="toggle-text-block">
                <strong>Strict Project Boundary Enforcement</strong>
                <p>
                  Each workspace maintains an isolated memory scope. Queries performed in one workspace cannot recall or leak memories from another workspace unless Cross-Workspace Search is explicitly toggled in the memory panel.
                </p>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="section-label">
              <div className="label-with-icon">
                <Download size={14} />
                <span>Data Portability & Export (Non-Negotiable Constraint)</span>
              </div>
            </h3>
            <div className="shortcut-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--aeio-text-primary)' }}>
                  Plain JSON & Markdown Export
                </div>
                <div style={{ fontSize: '11px', color: 'var(--aeio-text-muted)', marginTop: '2px' }}>
                  Export all stored memories into portable formats. Your knowledge is never locked in.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={async () => {
                    try {
                      const data = await exportMemories('markdown');
                      const blob = new Blob([data], { type: 'text/markdown' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `aeio_all_memories_${new Date().toISOString().slice(0, 10)}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                      showSuccess('Exported memories to Markdown');
                    } catch (err) {
                      alert(`Export failed: ${err}`);
                    }
                  }}
                  aria-label="Export all memories to Markdown"
                >
                  <Download size={12} />
                  <span>Export .md</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={async () => {
                    try {
                      const data = await exportMemories('json');
                      const blob = new Blob([data], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `aeio_all_memories_${new Date().toISOString().slice(0, 10)}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      showSuccess('Exported memories to JSON');
                    } catch (err) {
                      alert(`Export failed: ${err}`);
                    }
                  }}
                  aria-label="Export all memories to JSON"
                >
                  <Download size={12} />
                  <span>Export .json</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Privacy Section */}
      {activeSection === 'privacy' && (
        <>
          {/* Cloud Provider Memory Privacy (Tier 3.2 Gate) */}
          <div className="settings-section">
            <h3 className="section-label">
              <div className="label-with-icon">
                <ShieldCheck size={14} />
                <span>Cloud Provider Memory Privacy</span>
              </div>
            </h3>
            <div className="toggle-setting-card">
              <div className="toggle-text-block">
                <strong>Never send memory context to cloud providers</strong>
                <p>
                  When enabled, recalled memories and stored context from your second brain are strictly withheld whenever querying external cloud models (Claude or OpenAI). Cloud requests will contain only your prompt, preserving privacy.
                </p>
                <div className="privacy-callout">
                  <ShieldCheck size={12} />
                  <span>With toggle ON, memory contents are stripped before reaching the network, and an in-chat notice informs you that context was withheld for privacy.</span>
                </div>
              </div>
              <label className="switch-toggle" aria-label="Never send memory context to cloud providers">
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={neverSendMemoriesToCloud}
                  checked={neverSendMemoriesToCloud}
                  onChange={(e) => setNeverSendMemoriesToCloud(e.target.checked)}
                />
                <span className="slider-round" />
              </label>
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

            {/* Outbound Telemetry Audit Box */}
            <div className="shortcut-box" style={{ marginTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--aeio-text-primary)' }}>
                    Outbound Telemetry Payloads & 30-Day Rotating ID
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--aeio-text-muted)', marginTop: '2px' }}>
                    Client identifier auto-rotates every 30 days. No persistent user ID.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="action-btn secondary"
                    style={{ padding: '5px 10px', fontSize: '11px', width: 'auto' }}
                    onClick={handleTriggerTestError}
                    aria-label="Send diagnostic test event"
                    title="Triggers a simulated error to audit the exact payload schema and verify sanitization"
                  >
                    <Activity size={12} />
                    <span>Test Event</span>
                  </button>
                  <button
                    type="button"
                    className="action-btn secondary"
                    style={{ padding: '5px 10px', fontSize: '11px', width: 'auto' }}
                    onClick={handleToggleOutboundLogs}
                    aria-label="Inspect outbound telemetry log"
                  >
                    <FileText size={12} />
                    <span>{isViewingOutboundLogs ? 'Hide Payloads' : 'Inspect Payloads'}</span>
                  </button>
                </div>
              </div>

              {testPayloadPreview && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--aeio-accent)' }}>
                    Last Generated Outbound Payload (Verified Schema):
                  </div>
                  <div className="local-logs-viewer" style={{
                    marginTop: '4px',
                    padding: '10px',
                    borderRadius: '6px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid var(--aeio-border-subtle)',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    whiteSpace: 'pre-wrap',
                    color: '#7ee787',
                  }}>
                    {testPayloadPreview}
                  </div>
                </div>
              )}

              {isViewingOutboundLogs && (
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
                  {outboundLogs}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Shortcuts & App Info */}
      {activeSection === 'shortcuts' && (
        <>
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
        </>
      )}

      {activeSection === 'computerControl' && (
        <>
          <div className="settings-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div>
                <h3 className="section-label" style={{ margin: 0 }}>Advanced: Computer Control (Experimental)</h3>
                <div style={{ fontSize: '11px', color: 'var(--aeio-text-muted)', marginTop: '2px' }}>
                  Safety-first, intent-gated desktop interaction engine.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={computerControlEnabled}
                onClick={() => setComputerControlEnabled(!computerControlEnabled)}
                className={`model-badge ${computerControlEnabled ? 'online' : 'offline'}`}
                style={{
                  cursor: 'pointer',
                  padding: '6px 14px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: computerControlEnabled ? '1px solid #0FA958' : '1px solid rgba(255,255,255,0.15)',
                  background: computerControlEnabled ? 'rgba(15, 169, 88, 0.18)' : 'rgba(255,255,255,0.05)',
                  color: computerControlEnabled ? '#34d399' : '#9ca3af',
                  transition: 'all 0.15s ease',
                }}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: computerControlEnabled ? '#0FA958' : '#6b7280',
                  }}
                />
                <span>{computerControlEnabled ? 'ENABLED' : 'DISABLED (Default)'}</span>
              </button>
            </div>

            {/* Status callout */}
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: computerControlEnabled ? 'rgba(15, 169, 88, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                border: `1px solid ${computerControlEnabled ? 'rgba(15, 169, 88, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                marginBottom: '16px',
                fontSize: '12px',
                color: computerControlEnabled ? '#34d399' : '#9ca3af',
                lineHeight: 1.4,
              }}
            >
              {computerControlEnabled
                ? 'Computer Control master switch is ON. Actions are strictly gated by the allowlist below, intent verification, and kill switch.'
                : 'Master switch is OFF (Default). The allowlist below is completely inert, and any action classification evaluates as High risk.'}
            </div>

            {/* Hard Security Notice */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                marginBottom: '18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontWeight: 600, fontSize: '12px' }}>
                <ShieldAlert size={14} />
                <span>Zero-Trust GUI Boundary & Absolute Blocklist</span>
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--aeio-text-muted)', lineHeight: 1.45 }}>
                Only applications explicitly added to your per-application allowlist below can ever be targeted.
                {' '}<strong>System Settings, Password Managers, Terminals, and Code Editors with integrated terminals (VS Code, Cursor, Terminal, etc.) are hard-coded blocked</strong> at the safety state layer and can never be added under any circumstance.
              </p>
            </div>

            {/* Hardware Kill Switch Status (Pillar 4) */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: killSwitchTripped ? 'rgba(185, 28, 28, 0.12)' : 'rgba(15, 169, 88, 0.08)',
                border: `1px solid ${killSwitchTripped ? 'rgba(185, 28, 28, 0.35)' : 'rgba(15, 169, 88, 0.25)'}`,
                marginBottom: '18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: killSwitchTripped ? '#f87171' : '#34d399' }}>
                  <PowerOff size={14} />
                  <span>Hardware Emergency Kill Switch (Pillar 4)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      backgroundColor: killSwitchTripped ? '#dc2626' : 'rgba(15, 169, 88, 0.2)',
                      color: killSwitchTripped ? '#ffffff' : '#34d399',
                    }}
                  >
                    {killSwitchTripped ? 'EMERGENCY STOPPED' : 'ARMED (Hold Esc >= 300ms)'}
                  </span>
                  {killSwitchTripped ? (
                    <button
                      type="button"
                      onClick={resetKillSwitchAction}
                      style={{
                        padding: '4px 10px',
                        fontSize: '10px',
                        fontWeight: 600,
                        backgroundColor: '#ffffff',
                        color: '#dc2626',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Reset Switch
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        const { triggerKillSwitch } = await import('../../lib/safety/killSwitch');
                        await triggerKillSwitch('Manual test trigger from settings');
                        setKillSwitchTripped(true, 'Manual test trigger from settings');
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '4px',
                        color: 'var(--aeio-text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      Test Trigger
                    </button>
                  )}
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--aeio-text-muted)', lineHeight: 1.45 }}>
                A native low-level OS event hook runs on a dedicated thread independent of UI rendering. Holding the <strong>Escape key for &ge; 300ms</strong> trips the atomic halt flag (<code>EMERGENCY_HALT</code>) and terminates any in-flight computer control action loop immediately before the next step can execute.
              </p>
              {killSwitchTripped && killSwitchReason && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#f87171', fontWeight: 500 }}>
                  Reason: {killSwitchReason}
                </div>
              )}
            </div>

            {/* Allowlist Manager */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--aeio-text-primary)', marginBottom: '4px' }}>
                Per-Application Allowlist ({computerControlAllowlist.length})
              </div>
              <div style={{ fontSize: '11px', color: 'var(--aeio-text-muted)', marginBottom: '10px' }}>
                Specify application bundle identifiers allowed for automated interaction.
              </div>

              {/* Input Row */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  value={newAppInput}
                  onChange={(e) => {
                    setNewAppInput(e.target.value);
                    setAllowlistError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddApp(false)}
                  placeholder="e.g. com.apple.calculator or com.apple.TextEdit"
                  className="shortcut-input"
                  style={{ flex: 1, margin: 0, padding: '8px 12px', fontSize: '12px' }}
                />
                <button
                  type="button"
                  className="action-btn primary"
                  onClick={() => handleAddApp(false)}
                  disabled={!newAppInput.trim()}
                  style={{
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    width: 'auto',
                    backgroundColor: '#0FA958',
                    color: '#ffffff',
                    opacity: newAppInput.trim() ? 1 : 0.5,
                    cursor: newAppInput.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Add App
                </button>
              </div>

              {/* Error banner if rejected by blocklist */}
              {allowlistError && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#f87171',
                    fontSize: '11px',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Ban size={14} />
                  <span>{allowlistError}</span>
                </div>
              )}

              {/* Bundle suggestions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <span style={{ fontSize: '10px', color: 'var(--aeio-text-muted)' }}>Suggestions:</span>
                {['com.apple.calculator', 'com.apple.TextEdit', 'com.apple.Notes'].map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => {
                      setNewAppInput(sug);
                      setAllowlistError(null);
                    }}
                    style={{
                      padding: '3px 8px',
                      fontSize: '10px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '4px',
                      color: 'var(--aeio-text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    {sug}
                  </button>
                ))}
              </div>

              {/* Active list */}
              {computerControlAllowlist.length === 0 ? (
                <div
                  style={{
                    padding: '20px',
                    textAlign: 'center',
                    backgroundColor: 'rgba(0,0,0,0.15)',
                    border: '1px dashed rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: 'var(--aeio-text-muted)',
                    fontSize: '11px',
                  }}
                >
                  No applications allowlisted yet. Computer control cannot interact with any application.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {computerControlAllowlist.map((app) => (
                    <div
                      key={app}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: computerControlEnabled ? '#0FA958' : '#6b7280',
                          }}
                        />
                        <code style={{ fontSize: '11px', color: 'var(--aeio-text-primary)' }}>{app}</code>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromComputerControlAllowlist(app)}
                        title="Remove from allowlist"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--aeio-text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: '4px',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* BYO Grounding Model Endpoint (UI-TARS / Qwen2-VL) */}
            <div
              style={{
                marginTop: '24px',
                padding: '16px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={15} style={{ color: '#0FA958' }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--aeio-text-primary)' }}>
                    BYO Visual Grounding Endpoint (UI-TARS / Qwen2-VL)
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    backgroundColor: groundingEndpointUrl ? 'rgba(15, 169, 88, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                    color: groundingEndpointUrl ? '#34d399' : 'var(--aeio-text-muted)',
                    border: `1px solid ${groundingEndpointUrl ? 'rgba(15, 169, 88, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                  }}
                >
                  {groundingEndpointUrl ? 'Configured' : 'Unconfigured'}
                </span>
              </div>

              <p style={{ margin: '0 0 14px', fontSize: '11px', color: 'var(--aeio-text-muted)', lineHeight: 1.45 }}>
                Visual grounding models translate natural language into screen coordinates. To prevent financial liability from multi-gigabyte GPU instances, Aeio connects to your self-hosted vLLM, RunPod, or local Ollama multimodal endpoint.
              </p>

              {/* Endpoint URL Input */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--aeio-text-secondary)', marginBottom: '4px' }}>
                  Endpoint URL
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={groundingEndpointInput}
                    onChange={(e) => setGroundingEndpointInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveGroundingEndpoint()}
                    placeholder="e.g. http://localhost:8000/v1 or https://api.runpod.ai/v2/..."
                    className="shortcut-input"
                    style={{ flex: 1, margin: 0, padding: '8px 12px', fontSize: '12px' }}
                  />
                  <button
                    type="button"
                    className="action-btn primary"
                    onClick={handleSaveGroundingEndpoint}
                    style={{ margin: 0, padding: '8px 14px', fontSize: '12px', minWidth: '70px' }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={handleTestGroundingEndpoint}
                    disabled={isTestingGrounding}
                    style={{
                      padding: '8px 12px',
                      fontSize: '12px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: 'var(--aeio-text-primary)',
                      cursor: isTestingGrounding ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {isTestingGrounding ? <RefreshCw size={12} className="spinning" /> : null}
                    <span>{isTestingGrounding ? 'Testing...' : 'Test'}</span>
                  </button>
                </div>
                {groundingTestStatus && (
                  <div
                    style={{
                      marginTop: '6px',
                      fontSize: '11px',
                      color: groundingTestStatus.startsWith('Reachable') ? '#34d399' : '#f87171',
                    }}
                  >
                    {groundingTestStatus}
                  </div>
                )}
              </div>

              {/* Model Type Selector */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--aeio-text-secondary)', marginBottom: '4px' }}>
                  Model Format & Architecture
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['ui-tars', 'qwen2-vl', 'custom'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setGroundingModelType(type)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '11px',
                        fontWeight: 500,
                        borderRadius: '6px',
                        border: groundingModelType === type ? '1px solid #0FA958' : '1px solid rgba(255, 255, 255, 0.1)',
                        backgroundColor: groundingModelType === type ? 'rgba(15, 169, 88, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                        color: groundingModelType === type ? '#34d399' : 'var(--aeio-text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      {type === 'ui-tars' ? 'UI-TARS (Recommended)' : type === 'qwen2-vl' ? 'Qwen2-VL' : 'Custom / JSON'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grounding API Token (OS Keychain) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--aeio-text-secondary)' }}>
                    Endpoint Bearer Token (Optional)
                  </label>
                  {hasGroundingStored ? (
                    <span style={{ fontSize: '10px', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ShieldCheck size={11} /> Stored in OS Keychain
                    </span>
                  ) : (
                    <span style={{ fontSize: '10px', color: 'var(--aeio-text-muted)' }}>No token saved</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="password"
                    placeholder={hasGroundingStored ? '••••••••••••••••••••••••' : 'Bearer token (if required)'}
                    value={groundingKeyInput}
                    onChange={(e) => setGroundingKeyInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveGroundingKey()}
                    className="shortcut-input"
                    style={{ flex: 1, margin: 0, padding: '8px 12px', fontSize: '12px' }}
                  />
                  <button
                    type="button"
                    className="action-btn primary"
                    onClick={handleSaveGroundingKey}
                    disabled={!groundingKeyInput.trim()}
                    style={{ margin: 0, padding: '8px 14px', fontSize: '12px' }}
                  >
                    Save Token
                  </button>
                  {hasGroundingStored && (
                    <button
                      type="button"
                      onClick={handleDeleteGroundingKey}
                      title="Remove token from keychain"
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#f87171',
                        borderRadius: '6px',
                        padding: '0 10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Visual Audit Trail Section */}
            <div
              style={{
                marginTop: '24px',
                paddingTop: '16px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#e5e7eb' }}>
                  Visual Audit Trail & Receipts
                </h4>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#9ca3af' }}>
                  Inspect immutable cryptographic receipts and before/after screenshots for all GUI actions.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAuditViewerOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(15, 169, 88, 0.15)',
                  border: '1px solid rgba(15, 169, 88, 0.4)',
                  borderRadius: '6px',
                  color: '#34d399',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Eye size={14} />
                <span>View Visual Receipts</span>
              </button>
            </div>
          </div>

          {/* Visual Audit Log Viewer Modal */}
          <VisualAuditLogViewer
            isOpen={isAuditViewerOpen}
            onClose={() => setIsAuditViewerOpen(false)}
          />

          {/* Browser Warning Confirmation Modal */}
          {pendingBrowserBundle && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
              }}
            >
              <div
                style={{
                  maxWidth: '420px',
                  padding: '20px',
                  backgroundColor: '#18181b',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  borderRadius: '10px',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', marginBottom: '10px' }}>
                  <AlertTriangle size={20} />
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Web Browser Warning</h4>
                </div>
                <p style={{ fontSize: '12px', color: '#d1d5db', lineHeight: 1.45, margin: '0 0 16px 0' }}>
                  {pendingBrowserWarning}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="action-btn secondary"
                    onClick={() => {
                      setPendingBrowserBundle(null);
                      setPendingBrowserWarning(null);
                    }}
                    style={{ padding: '6px 12px', fontSize: '11px', width: 'auto' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="action-btn primary"
                    onClick={() => handleAddApp(true)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '11px',
                      width: 'auto',
                      backgroundColor: '#f59e0b',
                      color: '#000000',
                      fontWeight: 600,
                    }}
                  >
                    I Understand, Allow Browser
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
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
