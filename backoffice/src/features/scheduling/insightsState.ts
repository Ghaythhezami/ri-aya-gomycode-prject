import type { OptimizationProposal } from '@riaya/shared';

/**
 * The insights panel state machine. One phase is shown at a time:
 *
 * - `idle`            tips and idle doctors, nothing to confirm
 * - `unsaved`         manual drag-and-drop changes not saved yet
 * - `awaiting`        optimisation results awaiting confirmation
 * - `conflicts`       results where some appointments could not be placed
 * - `noAlternatives`  no move found and unresolved appointments remain
 * - `noImprovement`   the heuristic found nothing better
 * - `stale`           the schedule changed after the proposal was made
 * - `success`         the proposal was applied (undo window open)
 */
export type InsightsPhase =
  | 'idle'
  | 'unsaved'
  | 'awaiting'
  | 'conflicts'
  | 'noAlternatives'
  | 'noImprovement'
  | 'stale'
  | 'success';

export interface InsightsState {
  proposal: OptimizationProposal | null;
  applied: boolean;
  stale: boolean;
  pendingCount: number;
  preview: boolean;
}

export type InsightsAction =
  | { type: 'optimized'; proposal: OptimizationProposal }
  | { type: 'applied'; proposal: OptimizationProposal }
  | { type: 'undone' }
  | { type: 'stale' }
  | { type: 'pending'; count: number }
  | { type: 'togglePreview' }
  | { type: 'reset' };

export const initialInsightsState: InsightsState = {
  proposal: null,
  applied: false,
  stale: false,
  pendingCount: 0,
  preview: false,
};

export function insightsReducer(state: InsightsState, action: InsightsAction): InsightsState {
  switch (action.type) {
    case 'optimized':
      return { ...state, proposal: action.proposal, applied: false, stale: false, preview: false };
    case 'applied':
      return { ...state, proposal: action.proposal, applied: true, stale: false, preview: false };
    case 'undone':
    case 'reset':
      return { ...state, proposal: null, applied: false, stale: false, preview: false };
    case 'stale':
      return { ...state, stale: true, applied: false, preview: false };
    case 'pending':
      // A manual change invalidates an unapplied proposal, computed for the saved day.
      return action.count > 0 && !state.applied
        ? { ...state, pendingCount: action.count, proposal: null, stale: false, preview: false }
        : { ...state, pendingCount: action.count };
    case 'togglePreview':
      return { ...state, preview: !state.preview };
    default:
      return state;
  }
}

export function insightsPhase(state: InsightsState): InsightsPhase {
  if (state.stale) return 'stale';
  const proposal = state.proposal;
  if (proposal && state.applied) return 'success';
  if (proposal) {
    if (proposal.status === 'NO_IMPROVEMENT') return 'noImprovement';
    if (proposal.moves.length === 0 && proposal.unresolved.length > 0) return 'noAlternatives';
    if (proposal.moves.length === 0) return 'noImprovement';
    if (proposal.unresolved.length > 0) return 'conflicts';
    return 'awaiting';
  }
  if (state.pendingCount > 0) return 'unsaved';
  return 'idle';
}

/** Minutes of average waiting time the proposal saves (can be 0 or negative). */
export function waitImprovement(proposal: OptimizationProposal): number {
  return Math.round(proposal.before.estimatedWaitMinutes - proposal.after.estimatedWaitMinutes);
}
