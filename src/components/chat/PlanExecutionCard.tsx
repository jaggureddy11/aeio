import React from 'react';
import { ExecutionPlan, PlanStep } from '../../lib/agent/plan';
import {
  Check,
  AlertTriangle,
  X,
  Loader2,
  Square,
  Play,
  Terminal,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Props {
  plan: ExecutionPlan;
  messageId: string;
  onApprove: (messageId: string) => void;
  onCancel: (messageId: string) => void;
}

export const PlanExecutionCard: React.FC<Props> = ({
  plan,
  messageId,
  onApprove,
  onCancel,
}) => {
  const [expandedOutputStepId, setExpandedOutputStepId] = React.useState<string | null>(null);

  const isPendingApproval = plan.status === 'pending_approval';
  const isRunning = plan.status === 'running';
  const isCompleted = plan.status === 'completed';
  const isFailed = plan.status === 'failed';

  const toggleOutput = (stepId: string) => {
    setExpandedOutputStepId(expandedOutputStepId === stepId ? null : stepId);
  };

  return (
    <div
      className={`plan-card ${plan.hasDestructiveSteps ? 'has-destructive' : ''} status-${plan.status}`}
      style={{
        marginTop: '0.75rem',
        marginBottom: '0.75rem',
        padding: '0.85rem',
        backgroundColor: 'var(--aeio-bg-card, #1e1e1e)',
        border: plan.hasDestructiveSteps && isPendingApproval
          ? '1px solid #ef4444'
          : isCompleted
          ? '1px solid #10b981'
          : isFailed
          ? '1px solid #f59e0b'
          : '1px solid var(--aeio-border, #333)',
        borderRadius: '0.5rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.6rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {plan.hasDestructiveSteps ? (
            <ShieldAlert size={16} color="#ef4444" />
          ) : (
            <Terminal size={16} color="var(--aeio-accent, #3b82f6)" />
          )}
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{plan.title}</span>
          <span
            style={{
              fontSize: '0.7rem',
              padding: '0.15rem 0.4rem',
              borderRadius: '0.25rem',
              backgroundColor: isPendingApproval
                ? '#7f1d1d'
                : isRunning
                ? '#1e3a8a'
                : isCompleted
                ? '#064e3b'
                : isFailed
                ? '#78350f'
                : '#374151',
              color: '#ffffff',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {isPendingApproval ? 'Approval Required' : plan.status}
          </span>
        </div>

        {isRunning && (
          <button
            type="button"
            className="btn-cancel-plan"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.3rem 0.6rem',
              fontSize: '0.75rem',
              fontWeight: 500,
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
            }}
            onClick={() => onCancel(messageId)}
            title="Stop running plan immediately"
          >
            <Square size={11} />
            <span>Stop Execution</span>
          </button>
        )}
      </div>

      {/* Upfront warning banner for destructive plans */}
      {isPendingApproval && plan.hasDestructiveSteps && (
        <div
          style={{
            padding: '0.5rem 0.65rem',
            marginBottom: '0.6rem',
            backgroundColor: '#450a0a',
            border: '1px solid #b91c1c',
            borderRadius: '0.375rem',
            fontSize: '0.78rem',
            color: '#fecaca',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertTriangle size={15} color="#ef4444" />
          <span>
            This plan contains destructive actions. Review all steps below. One approval covers the entire plan.
          </span>
        </div>
      )}

      {/* Stopped / Failed Banner */}
      {isFailed && plan.stoppedReason && (
        <div
          style={{
            padding: '0.5rem 0.65rem',
            marginBottom: '0.6rem',
            backgroundColor: '#451a03',
            border: '1px solid #b45309',
            borderRadius: '0.375rem',
            fontSize: '0.78rem',
            color: '#fde68a',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertTriangle size={15} color="#f59e0b" />
          <span>{plan.stoppedReason}</span>
        </div>
      )}

      {/* Success summary */}
      {isCompleted && (
        <div
          style={{
            padding: '0.45rem 0.65rem',
            marginBottom: '0.6rem',
            backgroundColor: '#064e3b',
            border: '1px solid #059669',
            borderRadius: '0.375rem',
            fontSize: '0.78rem',
            color: '#a7f3d0',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Check size={14} color="#10b981" />
          <span>{plan.summary || `Plan completed successfully: all ${plan.steps.length} steps executed.`}</span>
        </div>
      )}

      {/* Steps List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {plan.steps.map((step: PlanStep, idx: number) => {
          const isCurrentRunning = isRunning && plan.currentStepIndex === idx;
          const isStepCompleted = step.status === 'completed';
          const isStepFailed = step.status === 'failed';
          const isStepCancelled = step.status === 'cancelled';

          return (
            <div
              key={step.id || idx}
              style={{
                padding: '0.45rem 0.6rem',
                backgroundColor: isCurrentRunning
                  ? 'rgba(59, 130, 246, 0.15)'
                  : isStepCompleted
                  ? 'rgba(16, 185, 129, 0.08)'
                  : isStepFailed
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'rgba(255, 255, 255, 0.03)',
                border: isCurrentRunning
                  ? '1px solid #3b82f6'
                  : step.isDestructive
                  ? '1px solid rgba(239, 68, 68, 0.5)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '0.375rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                  {/* Step status icon */}
                  {isCurrentRunning ? (
                    <Loader2 size={13} className="spin-icon" color="#3b82f6" />
                  ) : isStepCompleted ? (
                    <Check size={13} color="#10b981" />
                  ) : isStepFailed ? (
                    <AlertTriangle size={13} color="#ef4444" />
                  ) : isStepCancelled ? (
                    <X size={13} color="#9ca3af" />
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', width: '13px', textAlign: 'center' }}>
                      {step.stepNumber}
                    </span>
                  )}

                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: isCurrentRunning ? 600 : 400,
                      color: isStepCancelled ? '#6b7280' : 'inherit',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {step.description}
                  </span>

                  {step.isDestructive && (
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '0.1rem 0.35rem',
                        borderRadius: '0.2rem',
                        backgroundColor: '#7f1d1d',
                        color: '#fecaca',
                        fontWeight: 600,
                      }}
                    >
                      Destructive
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                  <code style={{ fontSize: '0.7rem', color: '#9ca3af', padding: '0.1rem 0.3rem', background: 'rgba(0,0,0,0.3)', borderRadius: '0.2rem' }}>
                    {step.toolName === 'run_shell' ? step.args.command : step.toolName}
                  </code>

                  {step.result && (
                    <button
                      type="button"
                      onClick={() => toggleOutput(step.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#9ca3af',
                        cursor: 'pointer',
                        padding: '0.1rem',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title="Toggle output"
                    >
                      {expandedOutputStepId === step.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Output drawer */}
              {expandedOutputStepId === step.id && step.result && (
                <div
                  style={{
                    marginTop: '0.4rem',
                    padding: '0.4rem',
                    backgroundColor: '#000000',
                    borderRadius: '0.25rem',
                    fontSize: '0.7rem',
                    fontFamily: 'monospace',
                    maxHeight: '120px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    color: '#d1d5db',
                  }}
                >
                  {typeof step.result === 'object'
                    ? step.result.stdout || step.result.stderr || JSON.stringify(step.result, null, 2)
                    : String(step.result)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Upfront Single Approval Action Button */}
      {isPendingApproval && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn-approve-plan"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.85rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              backgroundColor: plan.hasDestructiveSteps ? '#dc2626' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
            onClick={() => onApprove(messageId)}
          >
            <Play size={12} />
            <span>Approve & Execute Entire Plan</span>
          </button>
          <button
            type="button"
            className="btn-decline-plan"
            style={{
              padding: '0.45rem 0.75rem',
              fontSize: '0.8rem',
              backgroundColor: 'transparent',
              color: '#9ca3af',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
            onClick={() => onCancel(messageId)}
          >
            Decline Plan
          </button>
        </div>
      )}
    </div>
  );
};
