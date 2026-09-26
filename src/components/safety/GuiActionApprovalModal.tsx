import React, { useEffect, useState } from 'react';
import { GuiActionApprovalRequest } from '../../lib/types/actionIntent';
import {
  subscribeToApprovalRequests,
  resolveApprovalRequest,
} from '../../lib/safety/approvalGate';

export const GuiActionApprovalModal: React.FC = () => {
  const [request, setRequest] = useState<GuiActionApprovalRequest | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToApprovalRequests((req) => {
      setRequest(req);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!request) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        resolveApprovalRequest(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        resolveApprovalRequest(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [request]);

  if (!request) {
    return null;
  }

  const { intent, targetAppName, riskLevel } = request;
  const isHighRisk = riskLevel === 'High';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-modal-title"
      data-testid="gui-action-approval-modal"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100000,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: '#16191f',
          color: '#f3f4f6',
          borderRadius: '12px',
          border: isHighRisk ? '1px solid #dc2626' : '1px solid #d97706',
          boxShadow: isHighRisk
            ? '0 20px 45px rgba(220, 38, 38, 0.35)'
            : '0 20px 45px rgba(217, 119, 6, 0.3)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: isHighRisk ? 'rgba(220, 38, 38, 0.15)' : 'rgba(217, 119, 6, 0.15)',
            borderBottom: isHighRisk ? '1px solid rgba(220, 38, 38, 0.3)' : '1px solid rgba(217, 119, 6, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                backgroundColor: isHighRisk ? '#dc2626' : '#d97706',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: '13px',
              }}
            >
              !
            </span>
            <h2
              id="approval-modal-title"
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '0.02em',
                color: '#ffffff',
              }}
            >
              GUI Action Approval Required
            </h2>
          </div>

          <span
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.04em',
              backgroundColor: isHighRisk ? '#dc2626' : '#d97706',
              color: '#ffffff',
            }}
          >
            {riskLevel.toUpperCase()} RISK
          </span>
        </div>

        {/* Body content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Target App */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '4px' }}>
              TARGET APPLICATION
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <strong style={{ color: '#ffffff', fontSize: '13px' }}>
                {targetAppName || intent.targetAppBundleId}
              </strong>
              <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                ({intent.targetAppBundleId})
              </span>
            </div>
          </div>

          {/* Declared Intent */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '4px' }}>
              DECLARED INTENT
            </div>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '13px',
                lineHeight: 1.5,
                color: '#f9fafb',
              }}
            >
              {intent.naturalLanguageIntent}
            </div>
          </div>

          {/* Target Element & State Change Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '4px' }}>
                TARGET UI ELEMENT
              </div>
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: '12px',
                  color: '#e5e7eb',
                }}
              >
                {intent.targetElementDescription || 'General view area'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '4px' }}>
                STATE CHANGE CATEGORY
              </div>
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: '12px',
                  color: isHighRisk ? '#f87171' : '#fbbf24',
                  fontWeight: 600,
                }}
              >
                {intent.intendedStateChange}
              </div>
            </div>
          </div>

          {/* Destructive Warning Box */}
          {isHighRisk && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(220, 38, 38, 0.12)',
                border: '1px solid rgba(220, 38, 38, 0.35)',
                fontSize: '12px',
                color: '#fca5a5',
                lineHeight: 1.4,
              }}
            >
              <strong>Security Precaution:</strong> This action has been evaluated as High Risk. Executing it may alter external files, close active windows, or submit state changes to the target application.
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            onClick={() => resolveApprovalRequest(false)}
            data-testid="approval-reject-btn"
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              color: '#d1d5db',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>Reject / Cancel</span>
            <kbd style={{ fontSize: '10px', opacity: 0.65 }}>(Esc)</kbd>
          </button>

          <button
            type="button"
            onClick={() => resolveApprovalRequest(true)}
            data-testid="approval-approve-btn"
            style={{
              padding: '8px 20px',
              backgroundColor: '#0FA958',
              color: '#042211',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(15, 169, 88, 0.35)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>Approve & Execute</span>
            <kbd style={{ fontSize: '10px', opacity: 0.85 }}>(Enter)</kbd>
          </button>
        </div>
      </div>
    </div>
  );
};
