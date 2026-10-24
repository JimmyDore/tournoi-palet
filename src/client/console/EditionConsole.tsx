import { useEffect } from 'react'
import { useAdminView } from '../live.ts'
import { formatDate } from '../format.ts'
import { Link } from '../router.tsx'
import { EDITION_TABS } from './tabs.tsx'

/** `/console/:id/:tab?` : une édition, avec ses onglets. */
export function EditionConsole({ id, tab }: { id: string; tab?: string }) {
  const { view, status } = useAdminView(id)
  const current = EDITION_TABS.find((t) => t.key === tab) ?? EDITION_TABS[0]

  useEffect(() => {
    if (status === 'unauthorized') window.dispatchEvent(new Event('app:unauthorized'))
  }, [status])

  if (status === 'unauthorized') return null
  if (status === 'not-found') {
    return (
      <section className="panel">
        <h1>Édition introuvable</h1>
        <Link href="/console">Retour aux éditions</Link>
      </section>
    )
  }
  if (!view) return <p className="muted">Chargement…</p>

  return (
    <div className="stack">
      <div className="edition-head">
        <Link href="/console" className="back">
          ← Éditions
        </Link>
        <h1>
          {view.settings.name} {view.settings.isTest && <span className="badge badge-test">test</span>}
        </h1>
        <p className="muted">{formatDate(view.settings.date)}</p>
        {status === 'offline' && <p className="offline-banner">Connexion perdue, reconnexion…</p>}
      </div>
      <nav className="tabs" aria-label="Onglets de l'édition">
        {EDITION_TABS.map((t) => (
          <Link key={t.key} href={`/console/${id}/${t.key}`} className={t.key === current.key ? 'tab active' : 'tab'} aria-current={t.key === current.key ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      <current.Component view={view} />
    </div>
  )
}
