import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { triggerKillSwitch } from '../../lib/safety/killSwitch';

interface Props {
  isStandalone?: boolean;
}

export const ActiveControlHud: React.FC<Props> = ({ isStandalone = false }) => {
  const {
    killSwitchTripped,
    killSwitchReason,
    resetKillSwitchAction,
    overlayState,
  } = useSettingsStore();

  const isHalted = killSwitchTripped || overlayState?.killSwitchTriggered;
  const isActive = overlayState?.isActive && !isHalted;

  if (!isActive && !isHalted) {
    return null;
  }

  const handleManualAbort = () => {
    triggerKillSwitch('Manual abort clicked on Active Control HUD');
  };

  return (
    <>
      {/* Screen Perimeter Glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 99998,
          border: isHalted ? '3px solid #ef4444' : '2px solid #0FA958',
          boxShadow: isHalted
            ? 'inset 0 0 28px rgba(239, 68, 68, 0.45), 0 0 20px rgba(239, 68, 68, 0.45)'
            : 'inset 0 0 20px rgba(15, 169, 88, 0.35), 0 0 16px rgba(15, 169, 88, 0.35)',
          transition: 'all 0.2s ease-in-out',
        }}
      />

      {/* Full-Width Top Header Bar */}
      <aside
        role="alert"
        aria-live="assertive"
        data-testid="active-control-hud"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '42px',
          zIndex: 99999,
          backgroundColor: isHalted ? '#991b1b' : '#0c1b13',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: isHalted ? '1px solid #ef4444' : '1px solid #0FA958',
          boxShadow: isHalted
            ? '0 4px 20px rgba(185, 28, 28, 0.6)'
            : '0 4px 20px rgba(15, 169, 88, 0.4)',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.02em',
          userSelect: 'none',
          pointerEvents: isStandalone ? 'none' : 'auto',
          transition: 'background-color 0.15s ease',
        }}
      >
        {/* Left Side: Status Indicator Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: isHalted ? '#ef4444' : '#0FA958',
              boxShadow: isHalted
                ? '0 0 8px #ef4444'
                : '0 0 8px #0FA958',
              animation: 'pulse 1.4s infinite ease-in-out',
            }}
          />
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: isHalted ? '#ef4444' : '#0FA958',
              color: isHalted ? '#ffffff' : '#072414',
              fontWeight: 800,
              fontSize: '11px',
              letterSpacing: '0.04em',
            }}
          >
            {isHalted ? 'EMERGENCY STOPPED' : 'AI ACTIVE SCREEN CONTROL'}
          </span>

          {/* Target App & Bundle ID */}
          {!isHalted && overlayState?.targetAppName && (
            <span
              style={{
                color: '#d1fae5',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              Targeting: <strong style={{ color: '#ffffff' }}>{overlayState.targetAppName}</strong>
              {overlayState.targetAppBundleId && (
                <span style={{ opacity: 0.65, fontSize: '11px' }}>
                  ({overlayState.targetAppBundleId})
                </span>
              )}
            </span>
          )}
        </div>

        {/* Center: Action Intent & Step Count */}
        <div
          style={{
            flex: 1,
            margin: '0 24px',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: isHalted ? '#fee2e2' : '#ecfdf5',
          }}
        >
          {isHalted ? (
            <span>
              <strong>AUTOMATION EMERGENCY HALT ACTIVATED — ALL ACTIONS ABORTED</strong>
              {' '}&bull;{' '}
              <span style={{ opacity: 0.9 }}>
                {overlayState?.killSwitchReason || killSwitchReason || 'Escape key held for >= 300ms'}
              </span>
            </span>
          ) : (
            <span>
              {overlayState?.totalSteps && overlayState.totalSteps > 0 ? (
                <span
                  style={{
                    backgroundColor: 'rgba(15, 169, 88, 0.25)',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    marginRight: '8px',
                    fontSize: '11px',
                    color: '#6ee7b7',
                  }}
                >
                  Step {overlayState.currentStep || 1} / {overlayState.totalSteps}
                </span>
              ) : null}
              <span>{overlayState?.declaredIntent || 'Executing planned GUI action...'}</span>
            </span>
          )}
        </div>

        {/* Right Side: Emergency Abort Instruction / Reset Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isHalted ? (
            <button
              type="button"
              onClick={resetKillSwitchAction}
              data-testid="reset-kill-switch-btn"
              style={{
                pointerEvents: 'auto',
                padding: '5px 14px',
                backgroundColor: '#ffffff',
                color: '#991b1b',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 800,
                fontSize: '11px',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
              }}
            >
              Reset Kill Switch
            </button>
          ) : (
            <button
              type="button"
              onClick={handleManualAbort}
              data-testid="hold-esc-abort-badge"
              title="Hold physical Escape key for 300ms or click to abort immediately"
              style={{
                pointerEvents: 'auto',
                backgroundColor: 'rgba(239, 68, 68, 0.18)',
                color: '#fca5a5',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <kbd
                style={{
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontSize: '10px',
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                ESC
              </kbd>
              <span>HOLD ESC TO STOP</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
