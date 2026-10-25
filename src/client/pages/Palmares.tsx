import { useEffect, useState } from 'react'
import type { TeamRef } from '../../engine/index.ts'
import { getJson } from '../api.ts'
import { formatDate } from '../format.ts'
import { Link } from '../router.tsx'
import { PublicShell } from './PublicEdition.tsx'

/** Ligne de `/api/public/editions` : une édition terminée (jamais une édition de test). */
interface PalmaresEntry {
  id: string
  name: string
  date: string
  winner: TeamRef | null
}

/** `/palmares` : éditions terminées, la plus récente en tête ; chacune mène à sa page. */
export function PalmaresPage() {
  const [entries, setEntries] = useState<PalmaresEntry[] | null | 'error'>(null)
  useEffect(() => {
    getJson<PalmaresEntry[]>('/api/public/editions')
      .then(setEntries)
      .catch(() => setEntries('error'))
  }, [])

  return (
    <PublicShell>
      <section className="card">
        <h1 className="edition-name">Palmarès</h1>
        <p className="muted">Les éditions passées du concours : classement final et tableaux de chacune.</p>
      </section>
      {entries === null ? (
        <p className="muted center">Chargement…</p>
      ) : entries === 'error' ? (
        <p className="muted center">Le palmarès est momentanément indisponible. Réessayez dans un instant.</p>
      ) : entries.length === 0 ? (
        <section className="card">
          <p>Aucune édition terminée pour l’instant.</p>
        </section>
      ) : (
        <ol className="palmares-list">
          {entries.map((e) => (
            <li key={e.id}>
              <Link href={`/e/${encodeURIComponent(e.id)}`} className="card palmares-entry">
                <span className="palmares-name">{e.name}</span>
                <span className="palmares-date">{formatDate(e.date)}</span>
                {e.winner && (
                  <span className="palmares-winner">
                    Vainqueur : <strong>{e.winner.name}</strong>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ol>
      )}
      <p className="center">
        <Link href="/">Retour à l’accueil</Link>
      </p>
    </PublicShell>
  )
}
