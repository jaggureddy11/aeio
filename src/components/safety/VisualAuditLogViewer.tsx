import React, { useState, useEffect } from 'react';
import {
  AuditReceipt,
  listAuditReceipts,
} from '../../lib/safety/auditLog';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  Eye,
  FileText,
  RefreshCw,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const VisualAuditLogViewer: React.FC<Props> = ({ isOpen, onClose }) => {
  const [receipts, setReceipts] = useState<AuditReceipt[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<AuditReceipt | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedJson, setExpandedJson] = useState(false);

  const fetchReceipts = async () => {
    setIsLoading(true);
    try {
      const data = await listAuditReceipts(50);
      setReceipts(data);
      if (data.length > 0 && !selectedReceipt) {
        setSelectedReceipt(data[0]);
      }
    } catch (err) {
      console.error('Failed to load audit receipts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchReceipts();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-log-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '940px',
          maxWidth: '95vw',
          height: '680px',
          maxHeight: '90vh',
          backgroundColor: '#0d1117',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden',
          color: '#f3f4f6',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#161b22',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(15, 169, 88, 0.15)',
                border: '1px solid rgba(15, 169, 88, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#34d399',
              }}
            >
              <Eye size={18} />
            </div>
            <div>
              <h2
                id="audit-log-title"
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                }}
              >
                Visual Audit Trail & Receipts
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#9ca3af',
                  marginTop: '2px',
                }}
              >
                Append-only forensic record of discrete GUI actions with SHA-256 screenshot verification
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={fetchReceipts}
              disabled={isLoading}
              title="Refresh receipts"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '6px 12px',
                color: '#d1d5db',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
              }}
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body: Left List, Right Inspector */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left Column: Receipts List */}
          <div
            style={{
              width: '320px',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              overflowY: 'auto',
              backgroundColor: '#0d1117',
            }}
          >
            {receipts.length === 0 ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: '#6b7280',
                  fontSize: '13px',
                }}
              >
                <FileText size={28} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <p style={{ margin: 0, fontWeight: 500 }}>No audit receipts recorded yet.</p>
                <p style={{ margin: '6px 0 0', fontSize: '11px' }}>
                  Receipts are automatically generated when Computer Control executes discrete GUI actions.
                </p>
              </div>
            ) : (
              <div>
                {receipts.map((r) => {
                  const isSelected = selectedReceipt?.audit_id === r.audit_id;
                  const isSuccess = r.execution.status.includes('SUCCESS') || r.execution.status.includes('COMPLETED');
                  return (
                    <div
                      key={r.audit_id}
                      onClick={() => setSelectedReceipt(r)}
                      style={{
                        padding: '12px 14px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        backgroundColor: isSelected ? 'rgba(15, 169, 88, 0.12)' : 'transparent',
                        borderLeft: isSelected ? '3px solid #0FA958' : '3px solid transparent',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: isSelected ? '#34d399' : '#e5e7eb',
                          }}
                        >
                          {r.audit_id}
                        </span>
                        <span
                          style={{
                            fontSize: '9px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: 600,
                            backgroundColor: isSuccess ? 'rgba(15, 169, 88, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            color: isSuccess ? '#34d399' : '#f87171',
                          }}
                        >
                          {r.action_type.toUpperCase()}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#d1d5db',
                          marginTop: '4px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {r.intent.natural_language}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          marginTop: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <Clock size={11} />
                        <span>{new Date(r.timestamp).toLocaleTimeString()}</span>
                        <span>•</span>
                        <span>{r.intent.bundle_id}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Receipt Inspector */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              backgroundColor: '#161b22',
            }}
          >
            {selectedReceipt ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Receipt Title Card */}
                <div
                  style={{
                    backgroundColor: '#0d1117',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, fontFamily: 'monospace' }}>
                          {selectedReceipt.audit_id}
                        </h3>
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#9ca3af',
                            backgroundColor: 'rgba(255, 255, 255, 0.06)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                          }}
                        >
                          Session: {selectedReceipt.session_id}
                        </span>
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#e5e7eb' }}>
                        {selectedReceipt.intent.natural_language}
                      </p>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>Timestamp</div>
                      <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#d1d5db' }}>
                        {new Date(selectedReceipt.timestamp).toISOString()}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: '10px',
                      marginTop: '14px',
                      paddingTop: '12px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' }}>Target App</div>
                      <div style={{ fontSize: '12px', fontWeight: 500, marginTop: '2px' }}>
                        {selectedReceipt.intent.target_app}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' }}>Bundle ID</div>
                      <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#93c5fd', marginTop: '2px' }}>
                        {selectedReceipt.intent.bundle_id}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' }}>Latency</div>
                      <div style={{ fontSize: '12px', fontWeight: 500, marginTop: '2px' }}>
                        {selectedReceipt.execution.duration_ms} ms
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' }}>Status</div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: selectedReceipt.execution.status.includes('REFUSED') ? '#f87171' : '#34d399',
                          marginTop: '2px',
                        }}
                      >
                        {selectedReceipt.execution.status}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Safety Verdict Box */}
                <div
                  style={{
                    backgroundColor: '#0d1117',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                  }}
                >
                  <h4 style={{ margin: '0 0 10px', fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase' }}>
                    Safety Policy & Approval Verdict
                  </h4>
                  <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                      <ShieldCheck size={14} color={selectedReceipt.safety_verdict.allowlisted ? '#34d399' : '#f87171'} />
                      <span>Allowlist: <strong>{selectedReceipt.safety_verdict.allowlisted ? 'Permitted' : 'Rejected'}</strong></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                      <ShieldAlert size={14} color={selectedReceipt.safety_verdict.blacklisted ? '#f87171' : '#34d399'} />
                      <span>Hard Blocklist: <strong>{selectedReceipt.safety_verdict.blacklisted ? 'BLOCKED' : 'Clean'}</strong></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                      <span>Human Approval Required: <strong>{selectedReceipt.safety_verdict.approval_required ? 'Yes' : 'No'}</strong></span>
                    </div>
                    {selectedReceipt.safety_verdict.user_approval_timestamp && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#34d399' }}>
                        <span>Approved At: <strong>{new Date(selectedReceipt.safety_verdict.user_approval_timestamp).toLocaleTimeString()}</strong></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Artifacts & Cryptographic Signatures */}
                <div
                  style={{
                    backgroundColor: '#0d1117',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                  }}
                >
                  <h4 style={{ margin: '0 0 12px', fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase' }}>
                    Cryptographic Visual Artifacts
                  </h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Pre-screenshot */}
                    <div
                      style={{
                        padding: '10px 12px',
                        backgroundColor: '#161b22',
                        borderRadius: '6px',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, color: '#e5e7eb' }}>Pre-Action Screenshot</span>
                        <span style={{ color: '#9ca3af' }}>State immediately before synthetic event</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        Path: {selectedReceipt.artifacts.pre_screenshot_path}
                      </div>
                      <div style={{ fontSize: '11px', color: '#34d399', fontFamily: 'monospace', marginTop: '3px', wordBreak: 'break-all' }}>
                        SHA-256: {selectedReceipt.artifacts.pre_screenshot_sha256}
                      </div>
                    </div>

                    {/* Post-screenshot */}
                    <div
                      style={{
                        padding: '10px 12px',
                        backgroundColor: '#161b22',
                        borderRadius: '6px',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, color: '#e5e7eb' }}>Post-Action Screenshot (+300ms)</span>
                        <span style={{ color: '#9ca3af' }}>State after OS window settle delay</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        Path: {selectedReceipt.artifacts.post_screenshot_path}
                      </div>
                      <div style={{ fontSize: '11px', color: '#34d399', fontFamily: 'monospace', marginTop: '3px', wordBreak: 'break-all' }}>
                        SHA-256: {selectedReceipt.artifacts.post_screenshot_sha256}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Raw Immutable JSON Receipt Collapsible */}
                <div
                  style={{
                    backgroundColor: '#0d1117',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedJson(!expandedJson)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'transparent',
                      border: 'none',
                      color: '#d1d5db',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Raw Immutable Receipt JSON</span>
                    {expandedJson ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  {expandedJson && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                        backgroundColor: '#090d13',
                        maxHeight: '220px',
                        overflowY: 'auto',
                      }}
                    >
                      <pre
                        style={{
                          margin: 0,
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: '#a7f3d0',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}
                      >
                        {JSON.stringify(selectedReceipt, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  fontSize: '13px',
                }}
              >
                Select an audit receipt from the list to inspect forensic verification.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
