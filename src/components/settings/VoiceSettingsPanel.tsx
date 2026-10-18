import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Play,
  Square,
  Check,
  Copy,
  RefreshCw,
} from 'lucide-react';
import {
  globalHumanVoice,
  HumanVoiceProfile,
  HumanVoiceProvider,
  HumanVoiceSettings,
  KOKORO_DEFAULT_VOICES,
} from '../../lib/voice/humanVoiceEngine';
import { hasApiKey, setApiKey, deleteApiKey } from '../../lib/ipc';

export const VoiceSettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<HumanVoiceSettings>(globalHumanVoice.getSettings());
  const [availableVoices, setAvailableVoices] = useState<HumanVoiceProfile[]>(KOKORO_DEFAULT_VOICES);
  const [isVoiceboxOnline, setIsVoiceboxOnline] = useState(false);
  const [isKokoroOnline, setIsKokoroOnline] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [elevenLabsKey, setElevenLabsKey] = useState('');
  const [hasElevenLabsStored, setHasElevenLabsStored] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    refreshStatus();
    checkElevenLabsKey();
  }, []);

  const checkElevenLabsKey = async () => {
    try {
      const stored = await hasApiKey('elevenlabs');
      setHasElevenLabsStored(stored);
    } catch {
      setHasElevenLabsStored(false);
    }
  };

  const refreshStatus = async () => {
    setIsChecking(true);
    setStatusMessage(null);
    try {
      const [vbOnline, kokoroOnline] = await Promise.all([
        globalHumanVoice.probeVoicebox(),
        globalHumanVoice.probeKokoro(),
      ]);
      setIsVoiceboxOnline(vbOnline);
      setIsKokoroOnline(kokoroOnline);

      const voices = await globalHumanVoice.getAvailableVoices();
      setAvailableVoices(voices);

      if (vbOnline && settings.provider !== 'voicebox' && settings.autoDetectLocal) {
        handleProviderChange('voicebox');
        setStatusMessage('Connected to local Voicebox server on port 17493!');
      } else if (kokoroOnline && settings.provider !== 'kokoro' && !vbOnline && settings.autoDetectLocal) {
        handleProviderChange('kokoro');
        setStatusMessage('Connected to local Kokoro server on port 8880!');
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleProviderChange = (provider: HumanVoiceProvider) => {
    const updated = { ...settings, provider };
    setSettings(updated);
    globalHumanVoice.saveSettings(updated);
  };

  const handleVoiceChange = (voiceId: string) => {
    const updated = { ...settings, selectedVoiceId: voiceId };
    setSettings(updated);
    globalHumanVoice.saveSettings(updated);
  };

  const handleSpeedChange = (speed: number) => {
    const updated = { ...settings, speed };
    setSettings(updated);
    globalHumanVoice.saveSettings(updated);
  };

  const handleSaveElevenLabsKey = async () => {
    if (!elevenLabsKey.trim()) return;
    try {
      await setApiKey('elevenlabs', elevenLabsKey.trim());
      setHasElevenLabsStored(true);
      setElevenLabsKey('');
      setStatusMessage('ElevenLabs API key securely stored in OS Keychain.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch {
      setStatusMessage('Failed to store API key in Keychain.');
    }
  };

  const handleDeleteElevenLabsKey = async () => {
    try {
      await deleteApiKey('elevenlabs');
      setHasElevenLabsStored(false);
      setStatusMessage('ElevenLabs API key removed from Keychain.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch {
      setStatusMessage('Failed to remove API key.');
    }
  };

  const handleTestSpeech = async () => {
    if (isPlayingTest) {
      globalHumanVoice.stop();
      setIsPlayingTest(false);
      return;
    }

    setIsPlayingTest(true);
    const testPhrase =
      settings.provider === 'voicebox'
        ? "Hello! I'm Aeio, your local AI desktop assistant powered by Jamie Pine's Voicebox. All voice synthesis runs 100% on your machine."
        : settings.provider === 'kokoro'
        ? "Hello! I'm Aeio, speaking with the open-weight Kokoro neural model. Crisp, expressive, and completely local."
        : settings.provider === 'elevenlabs'
        ? "Hello! I'm Aeio using your ElevenLabs cloud voice profile."
        : "Hello! I'm Aeio, your local desktop assistant speaking with native operating system synthesis.";

    await globalHumanVoice.speak(testPhrase, {
      onStart: () => setIsPlayingTest(true),
      onEnd: () => setIsPlayingTest(false),
      onError: (err) => {
        setIsPlayingTest(false);
        setStatusMessage(`Speech error: ${err}`);
      },
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(label);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="settings-content-wrapper" style={{ paddingBottom: '32px' }}>
      {/* Group: Engine Overview */}
      <div className="settings-group">
        <div className="settings-group-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="settings-group-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} color="var(--primary, #3b82f6)" />
              <span>Human Voice Engine (ElevenLabs Alternative)</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={refreshStatus}
              disabled={isChecking}
            >
              <RefreshCw size={12} className={isChecking ? 'spin' : ''} />
              <span>Refresh Status</span>
            </button>
          </div>
          <div className="settings-group-desc">
            Equip Aeio with expressive, human-like voice synthesis using open-source, local-first ElevenLabs alternatives.
            Runs on your machine with zero cloud subscriptions or token limits.
          </div>
        </div>

        {statusMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              marginBottom: '16px',
            }}
          >
            {statusMessage}
          </div>
        )}

        {/* Provider Cards */}
        <div className="settings-card" role="radiogroup" aria-label="Speech Provider">
          <div className="settings-provider-list">
            {/* 1. Voicebox (Jamie Pine) */}
            <div
              role="radio"
              tabIndex={0}
              aria-checked={settings.provider === 'voicebox'}
              className={`settings-provider-row ${settings.provider === 'voicebox' ? 'selected' : ''}`}
              onClick={() => handleProviderChange('voicebox')}
            >
              <div className="provider-row-left">
                <div className="provider-radio-circle">
                  {settings.provider === 'voicebox' && <div className="provider-radio-dot" />}
                </div>
                <div className="provider-row-text">
                  <div className="provider-row-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>Voicebox (Local Studio — jamiepine/voicebox)</span>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: isVoiceboxOnline ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: isVoiceboxOnline ? '#22c55e' : '#ef4444',
                        fontWeight: 600,
                      }}
                    >
                      {isVoiceboxOnline ? '● Online (Port 17493)' : '○ Not Detected'}
                    </span>
                  </div>
                  <div className="provider-row-desc">
                    Trending open-source ElevenLabs alternative created by Jamie Pine. Supports zero-shot custom voice cloning,
                    multi-engine TTS, and local MCP server integration.
                  </div>
                </div>
              </div>
              <span className="provider-row-badge recommended">Trending Open Source</span>
            </div>

            {/* 2. Kokoro-82M */}
            <div
              role="radio"
              tabIndex={0}
              aria-checked={settings.provider === 'kokoro'}
              className={`settings-provider-row ${settings.provider === 'kokoro' ? 'selected' : ''}`}
              onClick={() => handleProviderChange('kokoro')}
            >
              <div className="provider-row-left">
                <div className="provider-radio-circle">
                  {settings.provider === 'kokoro' && <div className="provider-radio-dot" />}
                </div>
                <div className="provider-row-text">
                  <div className="provider-row-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>Kokoro-82M Neural Model (hexgrad/kokoro)</span>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: isKokoroOnline ? 'rgba(34, 197, 94, 0.15)' : 'rgba(156, 163, 175, 0.15)',
                        color: isKokoroOnline ? '#22c55e' : '#9ca3af',
                        fontWeight: 600,
                      }}
                    >
                      {isKokoroOnline ? '● Server Active (Port 8880)' : '○ Standby Presets'}
                    </span>
                  </div>
                  <div className="provider-row-desc">
                    Lightweight 82M open-weight model with hyper-realistic American & British voices. Runs fast on CPU and Apple Silicon.
                  </div>
                </div>
              </div>
              <span className="provider-row-badge">Open-Weight</span>
            </div>

            {/* 3. ElevenLabs Cloud (BYOK) */}
            <div
              role="radio"
              tabIndex={0}
              aria-checked={settings.provider === 'elevenlabs'}
              className={`settings-provider-row ${settings.provider === 'elevenlabs' ? 'selected' : ''}`}
              onClick={() => handleProviderChange('elevenlabs')}
            >
              <div className="provider-row-left">
                <div className="provider-radio-circle">
                  {settings.provider === 'elevenlabs' && <div className="provider-radio-dot" />}
                </div>
                <div className="provider-row-text">
                  <div className="provider-row-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>ElevenLabs Cloud (BYOK)</span>
                    {hasElevenLabsStored && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(34, 197, 94, 0.15)',
                          color: '#22c55e',
                          fontWeight: 600,
                        }}
                      >
                        ✓ Key Configured
                      </span>
                    )}
                  </div>
                  <div className="provider-row-desc">
                    Official cloud text-to-speech API using your personal API key stored securely in OS Keychain.
                  </div>
                </div>
              </div>
              <span className="provider-row-badge">Cloud BYOK</span>
            </div>

            {/* 4. Native OS Speech */}
            <div
              role="radio"
              tabIndex={0}
              aria-checked={settings.provider === 'system'}
              className={`settings-provider-row ${settings.provider === 'system' ? 'selected' : ''}`}
              onClick={() => handleProviderChange('system')}
            >
              <div className="provider-row-left">
                <div className="provider-radio-circle">
                  {settings.provider === 'system' && <div className="provider-radio-dot" />}
                </div>
                <div className="provider-row-text">
                  <div className="provider-row-title">Native OS Speech (macOS `say` / Windows SAPI)</div>
                  <div className="provider-row-desc">
                    Guaranteed built-in operating system speech output. Works 100% offline with zero setup.
                  </div>
                </div>
              </div>
              <span className="provider-row-badge">Built-in Fallback</span>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Tuning & Interactive Tester */}
      <div className="settings-group">
        <div className="settings-group-header">
          <div className="settings-group-title">Voice Tuning & Preview</div>
          <div className="settings-group-desc">
            Choose your preferred voice persona and speech rate.
          </div>
        </div>

        <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Voice Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Selected Voice Persona
            </label>
            <select
              className="settings-input"
              value={settings.selectedVoiceId}
              onChange={(e) => handleVoiceChange(e.target.value)}
              style={{ width: '100%', padding: '8px 12px' }}
            >
              {availableVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.provider === 'voicebox' ? 'Voicebox Cloned' : 'Kokoro Neural'})
                </option>
              ))}
            </select>
          </div>

          {/* Speed Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
              <span style={{ fontWeight: 600 }}>Speech Rate</span>
              <span style={{ color: 'var(--text-secondary)' }}>{settings.speed}x</span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.5"
              step="0.05"
              value={settings.speed}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '8px' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px' }}
              onClick={handleTestSpeech}
            >
              {isPlayingTest ? (
                <>
                  <Square size={14} />
                  <span>Stop Speaking</span>
                </>
              ) : (
                <>
                  <Play size={14} />
                  <span>Test Human Voice</span>
                </>
              )}
            </button>

            {isPlayingTest && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#3b82f6', fontSize: '13px' }}>
                <span className="live-pulse" />
                <span>Synthesizing and playing speech...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cloud ElevenLabs API Key Configuration */}
      {settings.provider === 'elevenlabs' && (
        <div className="settings-group">
          <div className="settings-group-header">
            <div className="settings-group-title">ElevenLabs API Key Configuration</div>
            <div className="settings-group-desc">
              Your key is stored securely in your operating system Keychain and is never sent to third-party telemetry.
            </div>
          </div>

          <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="password"
                className="settings-input"
                placeholder={hasElevenLabsStored ? '••••••••••••••••••••••••' : 'Enter xi-api-key'}
                value={elevenLabsKey}
                onChange={(e) => setElevenLabsKey(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSaveElevenLabsKey}
                disabled={!elevenLabsKey.trim()}
              >
                Save Key
              </button>
              {hasElevenLabsStored && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleDeleteElevenLabsKey}
                >
                  Remove Key
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Setup Guide for Voicebox */}
      <div className="settings-group">
        <div className="settings-group-header">
          <div className="settings-group-title">How to Run Voicebox Locally (jamiepine/voicebox)</div>
          <div className="settings-group-desc">
            Voicebox runs a local-first studio on port 17493. Run it once, and Aeio immediately hooks into its cloned voice models.
          </div>
        </div>

        <div className="settings-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '13px', lineHeight: '1.6', marginBottom: '12px' }}>
            Voicebox uses <code>just</code> or <code>uv</code> (it does not use a <code>Makefile</code>). Run the backend daemon on port 17493:
          </div>

          <div
            style={{
              background: '#0f172a',
              color: '#f8fafc',
              padding: '12px 14px',
              borderRadius: '6px',
              fontFamily: 'monospace',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <code>cd voicebox && uv run --python 3.12 -m uvicorn backend.main:app --port 17493</code>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ padding: '4px 8px', fontSize: '11px' }}
              onClick={() =>
                copyToClipboard(
                  'cd voicebox && uv run --python 3.12 -m uvicorn backend.main:app --port 17493',
                  'vb-uv'
                )
              }
            >
              {copiedCmd === 'vb-uv' ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
              <span style={{ marginLeft: '4px' }}>{copiedCmd === 'vb-uv' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Alternatively, install <code>just</code> and run:
          </div>

          <div
            style={{
              background: '#0f172a',
              color: '#f8fafc',
              padding: '12px 14px',
              borderRadius: '6px',
              fontFamily: 'monospace',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <code>brew install just && cd voicebox && just setup && just dev-backend</code>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ padding: '4px 8px', fontSize: '11px' }}
              onClick={() =>
                copyToClipboard(
                  'brew install just && cd voicebox && just setup && just dev-backend',
                  'vb-just'
                )
              }
            >
              {copiedCmd === 'vb-just' ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
              <span style={{ marginLeft: '4px' }}>{copiedCmd === 'vb-just' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Once running, Voicebox listens on <code>http://127.0.0.1:17493</code>. Click <strong>Refresh Status</strong> above, and Aeio will automatically detect your custom cloned voices and route all speech through it.
          </div>
        </div>
      </div>
    </div>
  );
};
