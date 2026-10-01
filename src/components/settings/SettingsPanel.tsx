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
  ShieldCheck,
  Check,
  Trash2,
  RefreshCw,
  Sliders,
  Activity,
  FileText,
  Brain,
  Download,
  AlertTriangle,
  ShieldAlert,
  Ban,
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
          <h2>Settings</h2>
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

      {/* Logical Section Tabs */}
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
          <div className="settings-content-wrapper">
            {/* Group: Active Model Engine */}
            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">Active Intelligence Engine</div>
                <div className="settings-group-desc">
                  Select which model engine powers your conversation, coding assistants, and desktop execution.
                </div>
              </div>

              <div className="settings-card" role="radiogroup" aria-label="Active Intelligence Engine">
                <div className="settings-provider-list">
                  {/* Qwen3-Coder */}
                  <div
                    role="radio"
                    tabIndex={0}
                    aria-checked={activeProvider === 'qwen-coder'}
                    className={`settings-provider-row ${activeProvider === 'qwen-coder' ? 'selected' : ''}`}
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
                    <div className="provider-row-left">
                      <div className="provider-radio-circle">
                        {activeProvider === 'qwen-coder' && <div className="provider-radio-dot" />}
                      </div>
                      <div className="provider-row-text">
                        <div className="provider-row-title">Qwen 2.5 Coder</div>
                        <div className="provider-row-desc">
                          Primary local model with 32k context, tool calling, and local agent execution.
                        </div>
                      </div>
                    </div>
                    <span className="provider-row-badge">Local</span>
                  </div>

                  {/* Claude 3.5 Sonnet */}
                  <div
                    role="radio"
                    tabIndex={0}
                    aria-checked={activeProvider === 'claude'}
                    className={`settings-provider-row ${activeProvider === 'claude' ? 'selected' : ''}`}
                    onClick={() => setActiveProvider('claude')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveProvider('claude');
                      }
                    }}
                  >
                    <div className="provider-row-left">
                      <div className="provider-radio-circle">
                        {activeProvider === 'claude' && <div className="provider-radio-dot" />}
                      </div>
                      <div className="provider-row-text">
                        <div className="provider-row-title">Claude 3.5 Sonnet</div>
                        <div className="provider-row-desc">
                          Frontier reasoning, deep architecture, and coding via your Anthropic API key.
                        </div>
                      </div>
                    </div>
                    <span className="provider-row-badge">BYOK</span>
                  </div>

                  {/* Google Gemini */}
                  <div
                    role="radio"
                    tabIndex={0}
                    aria-checked={activeProvider === 'gemini'}
                    className={`settings-provider-row ${activeProvider === 'gemini' ? 'selected' : ''}`}
                    onClick={() => setActiveProvider('gemini')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveProvider('gemini');
                      }
                    }}
                  >
                    <div className="provider-row-left">
                      <div className="provider-radio-circle">
                        {activeProvider === 'gemini' && <div className="provider-radio-dot" />}
                      </div>
                      <div className="provider-row-text">
                        <div className="provider-row-title">Gemini 3.7 Flash</div>
                        <div className="provider-row-desc">
                          Ultra-fast multimodal reasoning and 1M+ context window via Google API.
                        </div>
                      </div>
                    </div>
                    <span className="provider-row-badge">BYOK</span>
                  </div>

                  {/* OpenAI */}
                  <div
                    role="radio"
                    tabIndex={0}
                    aria-checked={activeProvider === 'openai'}
                    className={`settings-provider-row ${activeProvider === 'openai' ? 'selected' : ''}`}
                    onClick={() => setActiveProvider('openai')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveProvider('openai');
                      }
                    }}
                  >
                    <div className="provider-row-left">
                      <div className="provider-radio-circle">
                        {activeProvider === 'openai' && <div className="provider-radio-dot" />}
                      </div>
                      <div className="provider-row-text">
                        <div className="provider-row-title">OpenAI GPT-4o / o1</div>
                        <div className="provider-row-desc">
                          High-speed reasoning, deep coding, and knowledge retrieval via OpenAI API.
                        </div>
                      </div>
                    </div>
                    <span className="provider-row-badge">BYOK</span>
                  </div>

                  {/* Aeio Free */}
                  <div
                    role="radio"
                    tabIndex={0}
                    aria-checked={activeProvider === 'aeio-free'}
                    className={`settings-provider-row ${activeProvider === 'aeio-free' ? 'selected' : ''}`}
                    onClick={() => setActiveProvider('aeio-free')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveProvider('aeio-free');
                      }
                    }}
                  >
                    <div className="provider-row-left">
                      <div className="provider-radio-circle">
                        {activeProvider === 'aeio-free' && <div className="provider-radio-dot" />}
                      </div>
                      <div className="provider-row-text">
                        <div className="provider-row-title">Aeio Free (Claude 3.5 Haiku)</div>
                        <div className="provider-row-desc">
                          Hosted zero-configuration proxy with 30 free daily messages. No API key required.
                        </div>
                      </div>
                    </div>
                    <span className="provider-row-badge">30 msgs/day</span>
                  </div>

                  {/* Custom Ollama */}
                  <div
                    role="radio"
                    tabIndex={0}
                    aria-checked={activeProvider === 'ollama'}
                    className={`settings-provider-row ${activeProvider === 'ollama' ? 'selected' : ''}`}
                    onClick={() => setActiveProvider('ollama')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveProvider('ollama');
                      }
                    }}
                  >
                    <div className="provider-row-left">
                      <div className="provider-radio-circle">
                        {activeProvider === 'ollama' && <div className="provider-radio-dot" />}
                      </div>
                      <div className="provider-row-text">
                        <div className="provider-row-title">Custom Ollama Weights</div>
                        <div className="provider-row-desc">
                          Run arbitrary local models (Llama 3.2, Mistral, DeepSeek) on your local daemon.
                        </div>
                      </div>
                    </div>
                    <span className="provider-row-badge">Local</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Group: Local Ollama Configuration */}
            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">Local Ollama Configuration</div>
                <div className="settings-group-desc">
                  Specify the local model tag and verify connectivity to localhost:11434.
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Model Tag / Name</div>
                    <div className="settings-row-desc">
                      Local Ollama model identifier to load for completions.
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <input
                      type="text"
                      className="settings-text-input mono"
                      style={{ width: '220px' }}
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      placeholder="e.g. qwen3-coder"
                      aria-label="Local model name or tag"
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={testOllama}
                      disabled={isCheckingOllama}
                      aria-label="Test local model connection"
                    >
                      <RefreshCw size={12} className={isCheckingOllama ? 'spin-icon' : ''} />
                      <span>{isCheckingOllama ? 'Testing...' : 'Test Connection'}</span>
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Recommended Presets</div>
                    <div className="settings-row-desc">
                      Fast-switch between optimized coding and general-purpose local weights.
                    </div>
                  </div>
                  <div className="settings-row-control" style={{ gap: '6px' }}>
                    {(['qwen3-coder', 'qwen2.5-coder:7b', 'qwen2.5-coder:14b', 'llama3.2'] as const).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`preset-pill ${ollamaModel === tag ? 'active' : ''}`}
                        onClick={() => setOllamaModel(tag)}
                        aria-label={`Select ${tag} preset`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {ollamaStatus && (
                  <div className="settings-row" style={{ background: 'var(--bg-app)' }}>
                    <div
                      className={`settings-notice ${ollamaStatus.startsWith('Online') ? 'success' : 'danger'}`}
                      style={{ width: '100%', margin: 0 }}
                      role="status"
                    >
                      <div className="settings-notice-icon">
                        {ollamaStatus.startsWith('Online') ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
                      </div>
                      <div style={{ flex: 1, fontSize: '12px' }}>
                        <strong>{ollamaStatus.startsWith('Online') ? 'Ollama Daemon Connected' : 'Ollama Daemon Offline'}</strong>
                        <div style={{ marginTop: '2px', opacity: 0.9 }}>{ollamaStatus}</div>
                        {!ollamaStatus.startsWith('Online') && (
                          <div style={{ marginTop: '6px', fontSize: '11px', color: 'inherit' }}>
                            Ensure Ollama is running locally, or pull this model via terminal: <code>ollama pull {ollamaModel || 'qwen3-coder'}</code>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Group: API Keys (OS Keychain) */}
            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">API Keys (OS Keychain)</div>
                <div className="settings-group-desc">
                  Bring your own API keys. Keys are encrypted directly in your native OS credential store and never written to disk.
                </div>
              </div>

              <div className="settings-card">
                {/* Claude Key */}
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Anthropic Claude</div>
                    <div className="settings-row-desc">
                      {hasClaudeStored ? (
                        <span style={{ color: 'var(--status-success)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                          <Check size={12} /> Stored in OS Keychain
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>No key configured</span>
                      )}
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <input
                      type="password"
                      className="settings-text-input mono"
                      style={{ width: '220px' }}
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
                      type="button"
                      className="btn-primary"
                      onClick={handleSaveClaudeKey}
                      disabled={!claudeInput.trim()}
                      aria-label="Save Claude API key"
                    >
                      Save Key
                    </button>
                    {hasClaudeStored && (
                      <button
                        type="button"
                        className="btn-danger-ghost"
                        onClick={handleDeleteClaudeKey}
                        title="Remove Claude key from keychain"
                        aria-label="Delete Claude API key from keychain"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* OpenAI Key */}
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">OpenAI</div>
                    <div className="settings-row-desc">
                      {hasOpenaiStored ? (
                        <span style={{ color: 'var(--status-success)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                          <Check size={12} /> Stored in OS Keychain
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>No key configured</span>
                      )}
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <input
                      type="password"
                      className="settings-text-input mono"
                      style={{ width: '220px' }}
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
                      type="button"
                      className="btn-primary"
                      onClick={handleSaveOpenaiKey}
                      disabled={!openaiInput.trim()}
                      aria-label="Save OpenAI API key"
                    >
                      Save Key
                    </button>
                    {hasOpenaiStored && (
                      <button
                        type="button"
                        className="btn-danger-ghost"
                        onClick={handleDeleteOpenaiKey}
                        title="Remove OpenAI key from keychain"
                        aria-label="Delete OpenAI API key from keychain"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Google Gemini Key */}
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Google Gemini</div>
                    <div className="settings-row-desc">
                      {hasGeminiStored ? (
                        <span style={{ color: 'var(--status-success)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                          <Check size={12} /> Stored in OS Keychain
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>No key configured</span>
                      )}
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <input
                      type="password"
                      className="settings-text-input mono"
                      style={{ width: '220px' }}
                      placeholder={hasGeminiStored ? '••••••••••••••••••••••••' : 'AIzaSy...'}
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
                      type="button"
                      className="btn-primary"
                      onClick={handleSaveGeminiKey}
                      disabled={!geminiInput.trim()}
                      aria-label="Save Google Gemini API key"
                    >
                      Save Key
                    </button>
                    {hasGeminiStored && (
                      <button
                        type="button"
                        className="btn-danger-ghost"
                        onClick={handleDeleteGeminiKey}
                        title="Remove Gemini key from keychain"
                        aria-label="Delete Google Gemini API key from keychain"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Group: Aeio Free Tier Configuration */}
            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">Aeio Free (Hosted Tier)</div>
                <div className="settings-group-desc">
                  Anonymous rate limiting with a client-generated ID. No account or email needed.
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Installation Identifier</div>
                    <div className="settings-row-desc">
                      Random UUID stored locally to track daily quota on the public proxy.
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <input
                      type="text"
                      readOnly
                      className="settings-text-input mono"
                      style={{ width: '240px', background: 'var(--bg-card-hover)', color: 'var(--text-secondary)' }}
                      value={installationId}
                      aria-label="Anonymous Installation ID"
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        navigator.clipboard.writeText(installationId);
                        setCopiedInstallId(true);
                        setTimeout(() => setCopiedInstallId(false), 2000);
                      }}
                      aria-label="Copy Installation ID"
                    >
                      {copiedInstallId ? <Check size={12} /> : null}
                      <span>{copiedInstallId ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Hosted Proxy Endpoint</div>
                    <div className="settings-row-desc">
                      {hostedProxyUrl ? (
                        <span style={{ color: 'var(--status-success)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                          <Check size={12} /> Configured
                        </span>
                      ) : (
                        <span style={{ color: 'var(--status-warning)' }}>Optional custom Cloudflare worker proxy URL</span>
                      )}
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <input
                      type="text"
                      className="settings-text-input mono"
                      style={{ width: '240px' }}
                      value={proxyUrlInput}
                      onChange={(e) => setProxyUrlInput(e.target.value)}
                      placeholder="https://proxy.workers.dev"
                      aria-label="Hosted Proxy Endpoint"
                    />
                    <button
                      type="button"
                      className="btn-secondary"
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
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Memory Section */}
        {activeSection === 'memory' && (
          <div className="settings-content-wrapper">
            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">Memory Store Architecture</div>
                <div className="settings-group-desc">
                  Local SQLite database with WAL crash recovery and hybrid vector embeddings.
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Local SQLite WAL + sqlite-vec Hybrid Index</div>
                    <div className="settings-row-desc">
                      Memories are stored locally at <code>~/.aeio/memory.db</code> with WAL crash recovery. Retrieval combines 384-dimension all-MiniLM-L6-v2 vector embeddings with FTS exact-term ranking so names and paths are never missed.
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <span className="provider-row-badge">Local Offline</span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Zero-Cloud Guarantee</div>
                    <div className="settings-row-desc">
                      Zero memory contents are ever transmitted to third-party logging or cloud vectors.
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <span style={{ color: 'var(--status-success)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 500 }}>
                      <ShieldCheck size={14} /> Enforced
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">Workspace Boundary Enforcement</div>
                <div className="settings-group-desc">
                  Project boundary isolation preventing accidental context leakage.
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Strict Project Boundary Isolation</div>
                    <div className="settings-row-desc">
                      Each workspace maintains an isolated memory scope. Queries in one workspace cannot recall or leak memories from another workspace unless Cross-Workspace Search is explicitly enabled.
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <span style={{ color: 'var(--status-success)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 500 }}>
                      <Check size={14} /> Active
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">Data Portability & Export</div>
                <div className="settings-group-desc">
                  Export all stored memories into open formats. Your knowledge is never locked in.
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Plain JSON & Markdown Export</div>
                    <div className="settings-row-desc">
                      Download complete snapshots of your second brain in Markdown or structured JSON.
                    </div>
                  </div>
                  <div className="settings-row-control">
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
            </div>
          </div>
        )}

        {/* Privacy Section */}
        {activeSection === 'privacy' && (
          <div className="settings-content-wrapper">
            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">Cloud Provider Memory Privacy</div>
                <div className="settings-group-desc">
                  Control whether recalled memories are shared when calling external cloud models.
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Never send memory context to cloud providers</div>
                    <div className="settings-row-desc">
                      When enabled, recalled memories and stored context from your second brain are strictly withheld when querying cloud models (Claude or OpenAI). Cloud requests will contain only your prompt.
                    </div>
                  </div>
                  <div className="settings-row-control">
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
              </div>
            </div>

            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">Operating System Context</div>
                <div className="settings-group-desc">
                  Query the active window title on summon to provide immediate context to prompts.
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Read Frontmost App Title on Summon</div>
                    <div className="settings-row-desc">
                      When summoned, Aeio queries the process name and title of your active window (e.g. <code>VS Code - main.rs</code>) to enrich your queries. Aeio never reads window contents or pixels without request.
                    </div>
                  </div>
                  <div className="settings-row-control">
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
              </div>
            </div>

            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">Observability & Diagnostics</div>
                <div className="settings-group-desc">
                  Anonymous, privacy-sanitized diagnostics. Zero memories, chat logs, or keys are ever collected.
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Anonymous Crash & Error Reporting</div>
                    <div className="settings-row-desc">
                      Helps diagnose bugs and unexpected runtime panics. Strictly opt-in (Default OFF).
                    </div>
                  </div>
                  <div className="settings-row-control">
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
                </div>

                <div className="settings-row vertical">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div className="settings-row-info">
                      <div className="settings-row-title">Local Error Log File</div>
                      <div className="settings-row-desc">
                        Stored at <code>~/.aeio/logs/errors.log</code> (auto-rotated at 2MB). Always active offline.
                      </div>
                    </div>
                    <div className="settings-row-control">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleToggleLogs}
                        aria-label="Inspect local error log"
                      >
                        <FileText size={12} />
                        <span>{isViewingLogs ? 'Hide Log' : 'Inspect Log'}</span>
                      </button>
                      {isViewingLogs && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ color: 'var(--status-danger)' }}
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
                    <div style={{
                      padding: '12px',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      border: '1px solid var(--border-default)',
                      maxHeight: '160px',
                      overflowY: 'auto',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      whiteSpace: 'pre-wrap',
                      color: 'var(--text-secondary)',
                      width: '100%',
                    }}>
                      {localLogs}
                    </div>
                  )}
                </div>

                <div className="settings-row vertical">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div className="settings-row-info">
                      <div className="settings-row-title">Outbound Telemetry Payloads & Rotating ID</div>
                      <div className="settings-row-desc">
                        Client identifier auto-rotates every 30 days. Audit the exact JSON schema before sending.
                      </div>
                    </div>
                    <div className="settings-row-control">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleTriggerTestError}
                        aria-label="Send diagnostic test event"
                        title="Triggers a simulated error to audit the exact payload schema and verify sanitization"
                      >
                        <Activity size={12} />
                        <span>Test Event</span>
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleToggleOutboundLogs}
                        aria-label="Inspect outbound telemetry log"
                      >
                        <FileText size={12} />
                        <span>{isViewingOutboundLogs ? 'Hide Payloads' : 'Inspect Payloads'}</span>
                      </button>
                    </div>
                  </div>

                  {testPayloadPreview && (
                    <div style={{ width: '100%' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--status-success)', marginBottom: '4px' }}>
                        Last Generated Outbound Payload (Verified Schema):
                      </div>
                      <div style={{
                        padding: '12px',
                        borderRadius: '8px',
                        background: '#f8fafc',
                        border: '1px solid var(--border-default)',
                        maxHeight: '160px',
                        overflowY: 'auto',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        whiteSpace: 'pre-wrap',
                        color: 'var(--status-success)',
                      }}>
                        {testPayloadPreview}
                      </div>
                    </div>
                  )}

                  {isViewingOutboundLogs && (
                    <div style={{
                      padding: '12px',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      border: '1px solid var(--border-default)',
                      maxHeight: '160px',
                      overflowY: 'auto',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      whiteSpace: 'pre-wrap',
                      color: 'var(--text-secondary)',
                      width: '100%',
                    }}>
                      {outboundLogs}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Shortcuts & App Info */}
        {activeSection === 'shortcuts' && (
          <div className="settings-content-wrapper">
            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">Global Summon Shortcut</div>
                <div className="settings-group-desc">
                  Summon Aeio centered on your screen from anywhere in the OS, even over full-screen apps and games.
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Active Shortcut</div>
                    <div className="settings-row-desc">
                      Current key combination bound to summon the application overlay.
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <kbd style={{
                      background: 'var(--bg-card-hover)',
                      border: '1px solid var(--border-default)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}>
                      {hotkey}
                    </kbd>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Quick Presets</div>
                    <div className="settings-row-desc">
                      Standard macOS and Windows summon keyboard combinations.
                    </div>
                  </div>
                  <div className="settings-row-control" style={{ gap: '6px' }}>
                    <button
                      type="button"
                      className={`preset-pill ${hotkey === 'CommandOrControl+Shift+Space' ? 'active' : ''}`}
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
                      className={`preset-pill ${hotkey === 'Alt+Space' ? 'active' : ''}`}
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
                      className={`preset-pill ${hotkey === 'CommandOrControl+Space' ? 'active' : ''}`}
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

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Custom Key Combination</div>
                    <div className="settings-row-desc">
                      Define a custom accelerator string (e.g. <code>CommandOrControl+Shift+Space</code>).
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <input
                      type="text"
                      className="settings-text-input mono"
                      style={{ width: '220px' }}
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
                      className="btn-primary"
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
            </div>

            {/* First-Run Onboarding Guide Replay */}
            {onOpenOnboarding && (
              <div className="settings-group">
                <div className="settings-group-header">
                  <div className="settings-group-title">Onboarding & Setup</div>
                  <div className="settings-group-desc">
                    Re-run the initial setup wizard to verify Ollama, rebind hotkeys, or configure models.
                  </div>
                </div>

                <div className="settings-card">
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <div className="settings-row-title">First-Run Setup Wizard</div>
                      <div className="settings-row-desc">
                        Walk through the guided step-by-step introduction and environment checks.
                      </div>
                    </div>
                    <div className="settings-row-control">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={onOpenOnboarding}
                        aria-label="Launch first-run onboarding setup guide"
                      >
                        <span>Launch Guide</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSection === 'computerControl' && (
          <div className="settings-content-wrapper">
            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">Desktop Interaction Engine</div>
                <div className="settings-group-desc">
                  Safety-first, intent-gated desktop interaction engine with native OS accessibility hooks.
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Computer Control Master Switch</div>
                    <div className="settings-row-desc">
                      {computerControlEnabled
                        ? 'Master switch is ON. Actions are strictly gated by the allowlist below and intent verification.'
                        : 'Master switch is OFF (Default). The allowlist below is completely inert, and any action evaluates as High risk.'}
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <label className="switch-toggle" aria-label="Toggle computer control master switch">
                      <input
                        type="checkbox"
                        role="switch"
                        aria-checked={computerControlEnabled}
                        checked={computerControlEnabled}
                        onChange={(e) => setComputerControlEnabled(e.target.checked)}
                      />
                      <span className="slider-round" />
                    </label>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Hardware Emergency Kill Switch</div>
                    <div className="settings-row-desc">
                      Holding the <strong>Escape key for &ge; 300ms</strong> trips the atomic halt flag (<code>EMERGENCY_HALT</code>) and terminates any in-flight action loop immediately.
                      {killSwitchTripped && killSwitchReason && (
                        <div style={{ marginTop: '4px', color: 'var(--status-danger)', fontWeight: 500 }}>
                          Reason: {killSwitchReason}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: killSwitchTripped ? 'var(--status-danger-subtle)' : 'var(--status-success-subtle)',
                      color: killSwitchTripped ? 'var(--status-danger)' : 'var(--status-success)',
                      border: `1px solid ${killSwitchTripped ? 'rgba(220, 38, 38, 0.2)' : 'rgba(5, 150, 105, 0.2)'}`,
                    }}>
                      {killSwitchTripped ? 'STOPPED' : 'ARMED (Hold Esc)'}
                    </span>
                    {killSwitchTripped ? (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={resetKillSwitchAction}
                      >
                        Reset Switch
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={async () => {
                          const { triggerKillSwitch } = await import('../../lib/safety/killSwitch');
                          await triggerKillSwitch('Manual test trigger from settings');
                          setKillSwitchTripped(true, 'Manual test trigger from settings');
                        }}
                      >
                        Test Trigger
                      </button>
                    )}
                  </div>
                </div>

                <div className="settings-row" style={{ background: 'var(--bg-app)' }}>
                  <div className="settings-notice warning" style={{ width: '100%', margin: 0 }}>
                    <div className="settings-notice-icon">
                      <ShieldAlert size={14} />
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      <strong>Zero-Trust GUI Boundary & Absolute Blocklist</strong>
                      <div style={{ marginTop: '2px', opacity: 0.9 }}>
                        System Settings, Password Managers, Terminals, and Code Editors with integrated terminals (VS Code, Cursor, Terminal) are hard-coded blocked at the safety state layer and can never be added.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Application Allowlist */}
            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">Application Allowlist ({computerControlAllowlist.length})</div>
                <div className="settings-group-desc">
                  Specify macOS application bundle identifiers permitted for automated interaction.
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Add Application Bundle ID</div>
                    <div className="settings-row-desc">
                      Enter the reverse-DNS identifier of the application.
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <input
                      type="text"
                      className="settings-text-input mono"
                      style={{ width: '240px' }}
                      value={newAppInput}
                      onChange={(e) => {
                        setNewAppInput(e.target.value);
                        setAllowlistError(null);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddApp(false)}
                      placeholder="e.g. com.apple.calculator"
                      aria-label="Application bundle identifier"
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleAddApp(false)}
                      disabled={!newAppInput.trim()}
                    >
                      Add App
                    </button>
                  </div>
                </div>

                {allowlistError && (
                  <div className="settings-row" style={{ background: 'var(--bg-app)' }}>
                    <div className="settings-notice danger" style={{ width: '100%', margin: 0 }}>
                      <Ban size={14} className="settings-notice-icon" />
                      <span>{allowlistError}</span>
                    </div>
                  </div>
                )}

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Quick Suggestions</div>
                    <div className="settings-row-desc">
                      Common standard system tools safely supported by the desktop engine.
                    </div>
                  </div>
                  <div className="settings-row-control" style={{ gap: '6px' }}>
                    {['com.apple.calculator', 'com.apple.TextEdit', 'com.apple.Notes'].map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        className="preset-pill"
                        onClick={() => {
                          setNewAppInput(sug);
                          setAllowlistError(null);
                        }}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-row vertical">
                  <div className="settings-row-title" style={{ marginBottom: '4px' }}>Permitted Applications</div>
                  {computerControlAllowlist.length === 0 ? (
                    <div style={{
                      padding: '18px',
                      textAlign: 'center',
                      background: 'var(--bg-card-hover)',
                      borderRadius: '8px',
                      border: '1px dashed var(--border-default)',
                      color: 'var(--text-muted)',
                      fontSize: '12px',
                    }}>
                      No applications allowlisted yet. Computer control cannot interact with any application.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                      {computerControlAllowlist.map((app) => (
                        <div
                          key={app}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: 'var(--bg-app)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: computerControlEnabled ? 'var(--status-success)' : 'var(--text-faint)',
                            }} />
                            <code style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{app}</code>
                          </div>
                          <button
                            type="button"
                            className="btn-danger-ghost"
                            onClick={() => removeFromComputerControlAllowlist(app)}
                            title="Remove from allowlist"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Visual Grounding Model Endpoint */}
            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">Visual Grounding Model Endpoint (UI-TARS / Qwen2-VL)</div>
                <div className="settings-group-desc">
                  Connect your self-hosted vLLM or local Ollama vision endpoint for natural language screen coordinate translation.
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Endpoint URL</div>
                    <div className="settings-row-desc">
                      Base HTTP URL for visual grounding completions.
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <input
                      type="text"
                      className="settings-text-input mono"
                      style={{ width: '220px' }}
                      value={groundingEndpointInput}
                      onChange={(e) => setGroundingEndpointInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveGroundingEndpoint()}
                      placeholder="http://localhost:8000/v1"
                      aria-label="Grounding Endpoint URL"
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleSaveGroundingEndpoint}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleTestGroundingEndpoint}
                      disabled={isTestingGrounding}
                    >
                      {isTestingGrounding ? <RefreshCw size={12} className="spin-icon" /> : null}
                      <span>{isTestingGrounding ? 'Testing...' : 'Test'}</span>
                    </button>
                  </div>
                </div>

                {groundingTestStatus && (
                  <div className="settings-row" style={{ background: 'var(--bg-app)' }}>
                    <div
                      className={`settings-notice ${groundingTestStatus.startsWith('Reachable') ? 'success' : 'danger'}`}
                      style={{ width: '100%', margin: 0 }}
                    >
                      <span style={{ fontSize: '12px' }}>{groundingTestStatus}</span>
                    </div>
                  </div>
                )}

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Model Format & Architecture</div>
                    <div className="settings-row-desc">
                      Inference protocol parser format for bounding boxes and click points.
                    </div>
                  </div>
                  <div className="settings-row-control" style={{ gap: '6px' }}>
                    {(['ui-tars', 'qwen2-vl', 'custom'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`preset-pill ${groundingModelType === type ? 'active' : ''}`}
                        onClick={() => setGroundingModelType(type)}
                      >
                        {type === 'ui-tars' ? 'UI-TARS (Recommended)' : type === 'qwen2-vl' ? 'Qwen2-VL' : 'Custom'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Endpoint Bearer Token</div>
                    <div className="settings-row-desc">
                      {hasGroundingStored ? (
                        <span style={{ color: 'var(--status-success)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                          <Check size={12} /> Stored in OS Keychain
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Optional token for remote servers</span>
                      )}
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <input
                      type="password"
                      className="settings-text-input mono"
                      style={{ width: '220px' }}
                      placeholder={hasGroundingStored ? '••••••••••••••••••••••••' : 'Bearer token'}
                      value={groundingKeyInput}
                      onChange={(e) => setGroundingKeyInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveGroundingKey()}
                      aria-label="Grounding Token"
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleSaveGroundingKey}
                      disabled={!groundingKeyInput.trim()}
                    >
                      Save Token
                    </button>
                    {hasGroundingStored && (
                      <button
                        type="button"
                        className="btn-danger-ghost"
                        onClick={handleDeleteGroundingKey}
                        title="Remove token from keychain"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Audit Trail */}
            <div className="settings-group">
              <div className="settings-group-header">
                <div className="settings-group-title">Visual Audit Trail & Receipts</div>
                <div className="settings-group-desc">
                  Inspect immutable cryptographic receipts and before/after screenshots for all GUI actions.
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Action Ledger & Visual Receipts</div>
                    <div className="settings-row-desc">
                      View timestamped perceptual logs and hash records stored in local SQLite database.
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setIsAuditViewerOpen(true)}
                    >
                      <Eye size={13} />
                      <span>View Visual Receipts</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
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
            backgroundColor: 'var(--bg-overlay)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              maxWidth: '440px',
              padding: '24px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: '12px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-warning)', marginBottom: '12px' }}>
              <AlertTriangle size={18} />
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Web Browser Warning</h4>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 20px 0' }}>
              {pendingBrowserWarning}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setPendingBrowserBundle(null);
                  setPendingBrowserWarning(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleAddApp(true)}
              >
                I Understand, Allow Browser
              </button>
            </div>
          </div>
        </div>
      )}
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
