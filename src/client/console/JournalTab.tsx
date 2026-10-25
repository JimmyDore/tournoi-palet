import { useEffect, useState } from 'react'
import { getJson } from '../api.ts'
import { formatTimestamp } from '../format.ts'
import type { TabProps } from './tabs.tsx'

interface JournalLine {
  seq: number
  at: number
  /** Prénom donné à la connexion, `null` s'il n'a pas été donné. */
  actor: string | null
  label: string
  before?: string
  after?: string
}

/** Journal des modifications, du plus récent au plus ancien. */
export function JournalTab({ view }: TabProps) {
  const [lines, setLines] = useState<JournalLine[] | null>(null)

  // La vue change à chaque commande appliquée : on recharge le journal.
  useEffect(() => {
    getJson<JournalLine[]>(`/api/admin/editions/${encodeURIComponent(view.id)}/journal`)
      .then((l) => setLines([...l].reverse()))
      .catch(() => setLines([]))
  }, [view])

  return (
    <section className="panel">
      <h2>Journal</h2>
      {!lines ? (
        <p className="muted">Chargement…</p>
      ) : (
        <ol className="journal">
          {lines.map((l) => (
            <li key={l.seq}>
              <span className="muted">
                {formatTimestamp(l.at)}
                {l.actor && ` · ${l.actor}`}
              </span>
              <strong>{l.label}</strong>
              {(l.before || l.after) && (
                <span className="journal-diff">
                  <span>avant : {l.before}</span>
                  <span>après : {l.after}</span>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
