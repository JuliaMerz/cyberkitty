import type { Settings } from './types'

// Recommended defaults, from the spec's "Model choices". Judgment calls, not
// measurements; the style eval will replace them.
export const DEFAULT_SETTINGS: Settings = {
  lanes: {
    planner: { model: 'claude-opus-5-5', effort: 'medium' },
    writer: { model: 'claude-sonnet-5-5', effort: 'medium' },
    writerQuick: { model: 'claude-sonnet-5-5', effort: 'low' },
    quick: { model: 'claude-haiku-5-5', effort: 'low' },
    background: { model: 'claude-opus-5-5', effort: 'high' }
  },
  dailyCapUsd: 5,
  lastBook: null,
  sceneView: 'both',
  settleSeconds: 30
}

export const LANE_LABELS: Record<keyof Settings['lanes'], { name: string; tasks: string }> = {
  planner: { name: 'Planner', tasks: 'Chat, outline, blocking help, change specs, settling' },
  writer: { name: 'Writer', tasks: 'Scene drafts, texture, rewrites' },
  writerQuick: { name: 'Writer, quick tools', tasks: 'Sentence alternatives, humanize tools' },
  quick: { name: 'Quick tools', tasks: 'Tell detector, ghost text' },
  background: { name: 'Background', tasks: 'Whole-book consistency scan' }
}
