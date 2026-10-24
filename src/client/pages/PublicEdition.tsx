import { useEffect, useState } from 'react'
import type { PublicView } from '../../engine/index.ts'
import { getJson, HttpError } from '../api.ts'
import { PublicHeader } from '../components/Brand.tsx'
import { formatDate, formatPrice, formatTime, phoneHref } from '../format.ts'
import { useEditionView } from '../live.ts'

/** `/` : l'édition « en cours » (la plus récente hors test). */
export function PublicHome() {
  const [id, setId] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    getJson<PublicView>('/api/public/current')
      .then((view) => setId(view.id))
      .catch((error) => setId(error instanceof HttpError && error.status === 404 ? null : undefined))
  }, [])

  if (id === null) {
    return (
      <PublicShell>
        <section className="card">
          <h1 className="edition-name">Aucun concours annoncé pour le moment</h1>
          <p>Revenez bientôt : les infos de la prochaine édition seront publiées ici.</p>
        </section>
      </PublicShell>
    )
  }
  return id ? <PublicEdition id={id} /> : <PublicShell><p className="muted center">Chargement…</p></PublicShell>
}

/** `/e/:id` (+ `?k=` pour une édition de test). */
export function PublicEdition({ id, k }: { id: string; k?: string | null }) {
  const { view, status } = useEditionView(id, k)

  if (status === 'not-found') {
    return (
      <PublicShell>
        <section className="card">
          <h1 className="edition-name">Édition introuvable</h1>
          <p>Ce lien ne correspond à aucun concours publié.</p>
        </section>
      </PublicShell>
    )
  }
  if (!view) return <PublicShell><p className="muted center">Chargement…</p></PublicShell>

  return (
    <PublicShell>
      {view.isTest && <p className="test-banner">Édition de test : visible seulement avec ce lien</p>}
      {status === 'offline' && <p className="offline-banner">Connexion perdue, reconnexion…</p>}
      <EditionInfo view={view} />
      {/* Sections suivantes selon view.phase : inscrits (avant), mon équipe /
          poules / tableaux (pendant), classement final et lots (après). */}
    </PublicShell>
  )
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="public">
      <PublicHeader />
      <main className="public-main">{children}</main>
    </div>
  )
}

/** Infos pratiques de l'affiche. */
function EditionInfo({ view }: { view: PublicView }) {
  const tel = view.contact ? phoneHref(view.contact) : null
  const hours = [view.arrivalTime && `Accueil ${formatTime(view.arrivalTime)}`, view.startTime && `début ${formatTime(view.startTime)}`]
    .filter(Boolean)
    .join(', ')
  return (
    <section className="card hero" aria-label="Infos pratiques">
      <h1 className="edition-name">{view.name}</h1>
      <p className="edition-date">{formatDate(view.date)}</p>
      <dl className="infos">
        {hours && <Info label="Horaires" value={hours} />}
        {view.venue && <Info label="Lieu" value={view.venue} />}
        <Info label="Tarif" value={`${formatPrice(view.price)} par doublette`} />
        <Info label="Format" value={`Doublettes, ${view.maxTeams} équipes maximum`} />
        {view.contact && (
          <Info label="Inscriptions" value={tel ? <a href={tel}>{view.contact}</a> : view.contact} />
        )}
      </dl>
    </section>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="info">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
