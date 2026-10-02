import { noul, choice } from './primitives';
import { systemOneEngine } from './engine';
import { NoulAnswer, ChoiceAnswer } from './types';

export interface CommandSafetyVerdict {
  isDestructive: boolean;
  destructiveProbability: number;
  severity: 'low' | 'medium' | 'destructive';
  confidence: number;
  requiresUpfrontApproval: boolean;
  rationale?: string;
}

/**
 * TypeSafe Confidence-Gated Safety Routing Pattern:
 * Evaluates whether a proposed command or script poses risk of persistent state destruction.
 * Uses a Noul (probability of destruction) + Choice (severity level) in parallel.
 */
export async function judgeCommandRisk(
  command: string,
  cwd?: string
): Promise<CommandSafetyVerdict> {
  const isDestructiveNoul = noul(
    'Will executing this command alter, overwrite, delete, format, or terminate persistent files, data, or operating system state?',
    [
      'Removes or deletes files or directories (e.g. rm, unlink, del, rmdir)',
      'Rewrites or overwrites file systems or partition tables (e.g. mkfs, dd, format)',
      'Terminates critical system daemons or kills unmanaged processes (e.g. killall, shutdown)',
      'Forces irreversible git mutations (e.g. git reset --hard, git clean -fd)',
      'Performs arbitrary recursive deletions or wipes scratch directories',
    ]
  );

  const severityChoice = choice<'low' | 'medium' | 'destructive'>(
    'What is the operational risk level of executing this command?',
    {
      low: 'Read-only inspection, status query, listing files, echo, or non-mutating check',
      medium: 'Creating new files or harmless read-write operations within current working directory',
      destructive: 'Deleting files, overwriting data, system modifications, or hard reset',
    }
  );

  const evaluation = await systemOneEngine.evaluate({
    state: {
      command,
      cwd: cwd || './',
    },
    questions: {
      isDestructive: isDestructiveNoul,
      severity: severityChoice,
    },
  });

  const noulAns = evaluation.answers.isDestructive as NoulAnswer;
  const choiceAns = evaluation.answers.severity as ChoiceAnswer<'low' | 'medium' | 'destructive'>;

  const isDestructive =
    noulAns.probability >= 0.45 || choiceAns.choice === 'destructive';

  // Confidence-gated routing: if uncertain (confidence < 0.65), fail closed and require approval!
  const requiresUpfrontApproval =
    isDestructive || choiceAns.confidence < 0.65 || choiceAns.choice !== 'low';

  return {
    isDestructive,
    destructiveProbability: noulAns.probability,
    severity: choiceAns.choice,
    confidence: choiceAns.confidence,
    requiresUpfrontApproval,
    rationale: noulAns.rationale || choiceAns.rationale,
  };
}
