import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, LANE_LABELS } from '@shared/defaults'
import { MODEL_CHOICES } from '@shared/pricing'
import type { Effort, Lane, Settings } from '@shared/types'

const ck = window.ck
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export function SettingsPage({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }): React.JSX.Element {
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void ck.hasApiKey().then(setHasKey)
  }, [])

  async function update(patch: Partial<Settings>): Promise<void> {
    onChange(await ck.setSettings(patch))
  }

  async function saveKey(): Promise<void> {
    await ck.setApiKey(key)
    setKey('')
    setHasKey(await ck.hasApiKey())
    setSaved(true)
  }

  return (
    <main className="page">
      <header className="page-header">
        <div className="crumbs">
          <span className="crumb-current">Settings</span>
        </div>
      </header>
      <div className="settings">
        <section>
          <h2>Anthropic API key</h2>
          <p className="muted">
            CyberKitty uses your own key. It is kept in your system keychain, never in the book folder, and only ever sent to
            Anthropic.
          </p>
          <div className="row">
            <input
              type="password"
              placeholder={hasKey ? 'A key is saved. Paste a new one to replace it.' : 'sk-ant-…'}
              value={key}
              onChange={(e) => {
                setKey(e.target.value)
                setSaved(false)
              }}
              aria-label="Anthropic API key"
            />
            <button className="btn btn-primary" disabled={!key.trim()} onClick={() => void saveKey()}>
              Save key
            </button>
          </div>
          {saved && <p className="ok">Saved.</p>}
          {hasKey === false && !saved && <p className="muted">No key yet. Drafting needs one.</p>}
        </section>

        <section>
          <h2>Models</h2>
          <p className="muted">Each kind of work has its own model and effort. These are recommended starting points.</p>
          <table className="lanes">
            <tbody>
              {(Object.keys(LANE_LABELS) as Lane[]).map((lane) => (
                <tr key={lane}>
                  <th>
                    <div>{LANE_LABELS[lane].name}</div>
                    <div className="muted small">{LANE_LABELS[lane].tasks}</div>
                  </th>
                  <td>
                    <select
                      aria-label={`${LANE_LABELS[lane].name} model`}
                      value={settings.lanes[lane].model}
                      onChange={(e) => void update({ lanes: { ...settings.lanes, [lane]: { ...settings.lanes[lane], model: e.target.value } } })}
                    >
                      {MODEL_CHOICES.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`${LANE_LABELS[lane].name} effort`}
                      value={settings.lanes[lane].effort}
                      onChange={(e) => void update({ lanes: { ...settings.lanes, [lane]: { ...settings.lanes[lane], effort: e.target.value as Effort } } })}
                    >
                      {EFFORTS.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn" onClick={() => void update({ lanes: DEFAULT_SETTINGS.lanes })}>
            Reset to recommended
          </button>
        </section>

        <section>
          <h2>Spending</h2>
          <label className="row">
            <span>Daily cap for background work (USD)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={settings.dailyCapUsd}
              onChange={(e) => void update({ dailyCapUsd: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
        </section>

        <section>
          <h2>Pauses</h2>
          <label className="row">
            <span>Seconds without typing before work counts as settled</span>
            <input
              type="number"
              min={5}
              step={5}
              value={settings.settleSeconds}
              onChange={(e) => void update({ settleSeconds: Math.max(5, Number(e.target.value) || 30) })}
            />
          </label>
        </section>
      </div>
    </main>
  )
}
