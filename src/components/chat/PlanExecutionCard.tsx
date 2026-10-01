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
        backgroundColor: 'var(--bg-card, #ffffff)',
        border: plan.hasDestructiveSteps && isPendingApproval
          ? '1px solid var(--status-error, #ef4444)'
          : isCompleted
          ? '1px solid var(--status-success, #10b981)'
          : isFailed
          ? '1px solid var(--status-warning, #f59e0b)'
          : '1px solid var(--border-default, #e5e5e5)',
        borderRadius: '0.5rem',
        color: 'var(--text-primary, inherit)',
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
            <ShieldAlert size={16} color="var(--status-error, #ef4444)" />
          ) : (
            <Terminal size={16} color="var(--status-success, #0FA958)" />
          )}
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary, inherit)' }}>
            {plan.title}
          </span>
          <span
            style={{
              fontSize: '0.7rem',
              padding: '0.15rem 0.4rem',
              borderRadius: '0.25rem',
              backgroundColor: isPendingApproval
                ? 'var(--status-error-subtle, rgba(239, 68, 68, 0.15))'
                : isRunning
                ? 'var(--status-info-subtle, rgba(59, 130, 246, 0.15))'
                : isCompleted
                ? 'var(--status-success-subtle, rgba(16, 185, 129, 0.15))'
                : isFailed
                ? 'var(--status-warning-subtle, rgba(245, 158, 11, 0.15))'
                : 'var(--bg-surface, #f5f5f4)',
              color: isPendingApproval
                ? 'var(--status-error, #dc2626)'
                : isRunning
                ? '#2563eb'
                : isCompleted
                ? '#059669'
                : isFailed
                ? '#b45309'
                : 'var(--text-secondary, #6b7280)',
              fontWeight: 600,
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
            backgroundColor: 'var(--status-error-subtle, rgba(239, 68, 68, 0.1))',
            border: '1px solid var(--status-error, #ef4444)',
            borderRadius: '0.375rem',
            fontSize: '0.78rem',
            color: 'var(--status-error, #dc2626)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertTriangle size={15} color="var(--status-error, #ef4444)" />
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
            backgroundColor: 'var(--status-warning-subtle, rgba(245, 158, 11, 0.1))',
            border: '1px solid var(--status-warning, #f59e0b)',
            borderRadius: '0.375rem',
            fontSize: '0.78rem',
            color: 'var(--text-primary, #b45309)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertTriangle size={15} color="var(--status-warning, #f59e0b)" />
          <span>{plan.stoppedReason}</span>
        </div>
      )}

      {/* Success summary */}
      {isCompleted && (
        <div
          style={{
            padding: '0.45rem 0.65rem',
            marginBottom: '0.6rem',
            backgroundColor: 'var(--status-success-subtle, rgba(16, 185, 129, 0.1))',
            border: '1px solid var(--status-success, #10b981)',
            borderRadius: '0.375rem',
            fontSize: '0.78rem',
            color: 'var(--status-success, #059669)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Check size={14} color="var(--status-success, #10b981)" />
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
                  ? 'var(--status-info-subtle, rgba(59, 130, 246, 0.08))'
                  : isStepCompleted
                  ? 'var(--status-success-subtle, rgba(16, 185, 129, 0.06))'
                  : isStepFailed
                  ? 'var(--status-error-subtle, rgba(239, 68, 68, 0.08))'
                  : 'var(--bg-surface, #fcfcfb)',
                border: isCurrentRunning
                  ? '1px solid #3b82f6'
                  : step.isDestructive
                  ? '1px solid var(--status-error, rgba(239, 68, 68, 0.6))'
                  : '1px solid var(--border-subtle, rgba(0, 0, 0, 0.06))',
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
                    <Check size={13} color="var(--status-success, #10b981)" />
                  ) : isStepFailed ? (
                    <AlertTriangle size={13} color="var(--status-error, #ef4444)" />
                  ) : isStepCancelled ? (
                    <X size={13} color="var(--text-muted, #9ca3af)" />
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #9ca3af)', width: '13px', textAlign: 'center' }}>
                      {step.stepNumber}
                    </span>
                  )}

                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: isCurrentRunning ? 600 : 400,
                      color: isStepCancelled ? 'var(--text-muted, #6b7280)' : 'var(--text-primary, inherit)',
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
                        backgroundColor: 'var(--status-error-subtle, #fee2e2)',
                        color: 'var(--status-error, #b91c1c)',
                        border: '1px solid rgba(185, 28, 28, 0.2)',
                        fontWeight: 600,
                      }}
                    >
                      Destructive
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                  <code style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #52504b)', padding: '0.15rem 0.35rem', background: 'var(--bg-input, #f5f5f4)', borderRadius: '0.25rem', border: '1px solid var(--border-subtle, #e5e5e3)' }}>
                    {step.toolName === 'run_shell' ? (
                      step.args.command
                    ) : step.toolName === 'write_file' ? (
                      `write ${step.args.path}`
                    ) : step.toolName === 'read_file' ? (
                      `read ${step.args.path}`
                    ) : step.toolName === 'list_directory' ? (
                      `list ${step.args.dir || '.'}`
                    ) : step.toolName === 'fetch_url' ? (
                      `fetch ${step.args.url}`
                    ) : step.toolName === 'search_memory' ? (
                      `recall "${step.args.query}"`
                    ) : step.toolName === 'gui_action' ? (
                      step.args.intent?.targetAppBundleId || step.args.targetAppBundleId || 'gui_action'
                    ) : (
                      step.toolName
                    )}
                  </code>

                  {step.result && (
                    <button
                      type="button"
                      onClick={() => toggleOutput(step.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted, #9ca3af)',
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
                    padding: '0.45rem',
                    backgroundColor: 'var(--bg-input, #f5f5f4)',
                    border: '1px solid var(--border-subtle, #e5e5e3)',
                    borderRadius: '0.25rem',
                    fontSize: '0.7rem',
                    fontFamily: 'monospace',
                    maxHeight: '120px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    color: 'var(--text-primary, #181715)',
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
              backgroundColor: plan.hasDestructiveSteps ? '#dc2626' : '#0FA958',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            onClick={() => onApprove(messageId)}
          >
            <Play size={12} fill="#ffffff" />
            <span>Approve & Execute Entire Plan</span>
          </button>
          <button
            type="button"
            className="btn-decline-plan"
            style={{
              padding: '0.45rem 0.75rem',
              fontSize: '0.8rem',
              backgroundColor: 'var(--bg-surface, #ffffff)',
              color: 'var(--text-secondary, #52504b)',
              border: '1px solid var(--border-default, #d6d5d2)',
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
