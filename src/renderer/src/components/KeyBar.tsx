import { MARK_HELP, MARK_ORDER, type MarkKind } from '@shared/types'

/** The key: every page lists the same marks in the same order, with counts. */
export function KeyBar({ counts, onStep }: { counts?: Record<MarkKind, number>; onStep?: (k: MarkKind) => void }): React.JSX.Element {
  return (
    <footer className="keybar" aria-label="Key to the marks on this page">
      <span className="keybar-title">Key</span>
      {MARK_ORDER.map((k) => (
        <span key={k} className="keybar-item">
          <button type="button" className={`key-swatch ck-${k}`} onClick={() => onStep?.(k)} disabled={!counts?.[k]}>
            {k} {counts ? counts[k] : ''}
          </button>{' '}
          {MARK_HELP[k]}
        </span>
      ))}
      <span className="keybar-item">no shade: yours, or accepted</span>
      <span className="keybar-hint">click a name to step through them</span>
    </footer>
  )
}
