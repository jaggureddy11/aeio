import React, { useState, useRef, useEffect } from 'react';
import { useSettingsStore, LLMProviderType } from '../../stores/settingsStore';
import { hasApiKey } from '../../lib/ipc';
import { Sparkles, Cpu, ChevronDown, Check, ShieldCheck, Zap, Key } from 'lucide-react';

interface ModelOption {
  id: LLMProviderType;
  name: string;
  badge: string;
  tagline: string;
  isLocal: boolean;
  requiresKey: boolean;
  freeTier: boolean;
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'gemini',
    name: 'Gemini 3.7 Flash',
    badge: 'Google',
    tagline: 'Fast multimodal frontier model with generous free tier',
    isLocal: false,
    requiresKey: true,
    freeTier: true,
  },
  {
    id: 'aeio-free',
    name: 'Claude 3.5 Haiku',
    badge: 'Aeio Free',
    tagline: 'Hosted proxy with 30 free daily messages',
    isLocal: false,
    requiresKey: false,
    freeTier: true,
  },
  {
    id: 'claude',
    name: 'Claude 3.5 Sonnet',
    badge: 'Anthropic BYOK',
    tagline: 'Frontier reasoning and coding via your Anthropic key',
    isLocal: false,
    requiresKey: true,
    freeTier: false,
  },
  {
    id: 'qwen-coder',
    name: 'Qwen 2.5 Coder',
    badge: 'Local Ollama',
    tagline: '100% private and offline on your machine',
    isLocal: true,
    requiresKey: false,
    freeTier: true,
  },
  {
    id: 'openai',
    name: 'GPT-4o',
    badge: 'OpenAI BYOK',
    tagline: 'OpenAI frontier model via your personal API key',
    isLocal: false,
    requiresKey: true,
    freeTier: false,
  },
];

interface Props {
  onOpenSettings?: () => void;
  compact?: boolean;
}

export const ModelSelector: React.FC<Props> = ({ onOpenSettings, compact }) => {
  const { activeProvider, setActiveProvider } = useSettingsStore();
  const [isOpen, setIsOpen] = useState(false);
  const [keysStatus, setKeysStatus] = useState<Record<string, boolean>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOption = MODEL_OPTIONS.find((m) => m.id === activeProvider) || MODEL_OPTIONS[0];

  useEffect(() => {
    const checkKeys = async () => {
      const status: Record<string, boolean> = {};
      for (const opt of MODEL_OPTIONS) {
        if (opt.requiresKey) {
          try {
            status[opt.id] = await hasApiKey(opt.id);
          } catch {
            status[opt.id] = false;
          }
        }
      }
      setKeysStatus(status);
    };
    checkKeys();
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="model-selector-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className={`model-selector-trigger ${compact ? 'compact' : ''} ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="model-trigger-left">
          {currentOption.isLocal ? (
            <Cpu size={14} className="model-icon-local" />
          ) : (
            <Sparkles size={14} className="model-icon-cloud" />
          )}
          <span className="model-trigger-name">{currentOption.name}</span>
          <span className="model-trigger-badge">{currentOption.badge}</span>
        </div>
        <ChevronDown size={13} className={`model-chevron ${isOpen ? 'rotate' : ''}`} />
      </button>

      {isOpen && (
        <div className="model-dropdown-menu" role="listbox">
          <div className="model-dropdown-header">
            <span>Model Provider</span>
            <span className="model-dropdown-sub">Select active AI engine</span>
          </div>

          <div className="model-dropdown-list">
            {MODEL_OPTIONS.map((opt) => {
              const isSelected = opt.id === activeProvider;
              const hasKey = !opt.requiresKey || keysStatus[opt.id];

              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`model-option-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setActiveProvider(opt.id);
                    setIsOpen(false);
                  }}
                >
                  <div className="model-option-top">
                    <div className="model-option-title-row">
                      {opt.isLocal ? (
                        <Cpu size={14} className="opt-icon local" />
                      ) : (
                        <Sparkles size={14} className="opt-icon cloud" />
                      )}
                      <span className="opt-name">{opt.name}</span>
                      <span className="opt-badge">{opt.badge}</span>
                      {opt.freeTier && <span className="opt-free-tag">Free</span>}
                    </div>
                    {isSelected && <Check size={14} className="opt-check" />}
                  </div>

                  <p className="opt-tagline">{opt.tagline}</p>

                  <div className="model-option-footer">
                    {opt.isLocal ? (
                      <span className="opt-key-status offline">
                        <ShieldCheck size={11} />
                        100% Offline
                      </span>
                    ) : opt.requiresKey ? (
                      hasKey ? (
                        <span className="opt-key-status ready">
                          <Key size={11} />
                          Key Configured
                        </span>
                      ) : (
                        <span
                          className="opt-key-status missing"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(false);
                            if (onOpenSettings) onOpenSettings();
                          }}
                        >
                          <Zap size={11} />
                          Configure Key in Settings
                        </span>
                      )
                    ) : (
                      <span className="opt-key-status free">
                        <Zap size={11} />
                        No Key Required
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
