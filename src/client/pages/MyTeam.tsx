import { useMemo, useState } from 'react'
import { myTeamView, type MyNext, type MyTeamView, type PublicView } from '../../engine/index.ts'

const storageKey = (editionId: string) => `tournoi-palet:equipe:${editionId}`

/** Équipe choisie sur ce téléphone, mémorisée par édition (sans stockage : simplement pas mémorisée). */
export function useChosenTeam(editionId: string): [string | null, (teamId: string | null) => void] {
  const [teamId, setTeamId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey(editionId))
    } catch {
      return null
    }
  })
  const choose = (next: string | null) => {
    setTeamId(next)
    try {
      if (next) localStorage.setItem(storageKey(editionId), next)
      else localStorage.removeItem(storageKey(editionId))
    } catch {
      // Navigation privée ou stockage bloqué : le choix vaut pour cette visite.
    }
  }
  return [teamId, choose]
}

/** En haut de la page publique : prochaine planche, adversaire, résultats et place de « mon équipe ». */
export function MyTeam({ view, teamId, choose }: { view: PublicView; teamId: string | null; choose: (teamId: string | null) => void }) {
  const mine = teamId ? myTeamView(view, teamId) : null
  if (!mine) return <TeamPicker view={view} onChoose={choose} />
  return <MyTeamCard mine={mine} onChange={() => choose(null)} />
}

function MyTeamCard({ mine, onChange }: { mine: MyTeamView; onChange: () => void }) {
  const { standing } = mine
  return (
    <section className="card my-team" aria-label="Mon équipe">
      <div className="my-team-head">
        <p className="my-team-label">Mon équipe</p>
        <button type="button" className="link-button" onClick={onChange}>
          Changer d’équipe
        </button>
      </div>
      <h2 className="my-team-name">{mine.team.name}</h2>
      <NextBox next={mine.next} />
      {standing && standing.played > 0 && (
        <p className="my-place">
          <strong>{ordinal(standing.rank)}</strong> sur {mine.teamCount} · {standing.wins} victoire{standing.wins > 1 ? 's' : ''} ·{' '}
          {standing.diff > 0 ? `+${standing.diff}` : standing.diff} de différence
        </p>
      )}
      {mine.results.length > 0 && (
        <ul className="my-results">
          {mine.results.map((r) => (
            <li key={r.round} className={r.won ? 'won' : 'lost'}>
              <span className="my-result-round">Partie {r.round}</span>
              <span className="my-result-text">
                {r.bye ? 'Exempte' : <>contre {r.opponent?.name}</>}
              </span>
              <span className="my-result-score">
                {r.won ? 'Gagné' : 'Perdu'} {r.scored}-{r.conceded}
                {r.forfeit && ' (forfait)'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function NextBox({ next }: { next: MyNext }) {
  switch (next.kind) {
    case 'board':
      return (
        <div className="my-next my-next-board">
          <p className="my-next-where">
            Partie {next.round}
            <span>Planche {next.board}</span>
          </p>
          <p className="my-next-against">contre {next.opponent.name}</p>
        </div>
      )
    case 'waiting-board':
      return (
        <div className="my-next my-next-wait">
          <p className="my-next-where">Partie {next.round} · en attente de planche</p>
          <p className="my-next-against">contre {next.opponent.name}</p>
          <p className="my-next-hint">Une planche vous sera attribuée dès qu’un match se termine.</p>
        </div>
      )
    case 'bye':
      return (
        <div className="my-next my-next-wait">
          <p className="my-next-where">Partie {next.round} · exempte</p>
          <p className="my-next-hint">Votre équipe ne joue pas cette partie et compte une victoire.</p>
        </div>
      )
    case 'played':
      return (
        <div className="my-next my-next-wait">
          <p className="my-next-where">Partie {next.round} jouée</p>
          <p className="my-next-hint">Attendez le lancement de la partie suivante.</p>
        </div>
      )
    case 'not-drawn':
      return (
        <div className="my-next my-next-wait">
          <p className="my-next-hint">Le tirage de la partie 1 n’a pas encore eu lieu.</p>
        </div>
      )
    case 'forfeit':
      return (
        <div className="my-next my-next-wait">
          <p className="my-next-where">Forfait</p>
          <p className="my-next-hint">Votre équipe a été déclarée forfait : elle n’est plus tirée.</p>
        </div>
      )
    case 'not-in-pool':
      return (
        <div className="my-next my-next-wait">
          <p className="my-next-hint">Cette équipe n’a pas été tirée en poule. Une erreur ? Passez à la table de marque.</p>
        </div>
      )
  }
}

/** Choix de l'équipe (une fois par téléphone). */
function TeamPicker({ view, onChoose }: { view: PublicView; onChoose: (teamId: string) => void }) {
  const [query, setQuery] = useState('')
  const teams = useMemo(() => {
    // Pendant le tournoi, seules les équipes tirées comptent.
    const source = view.pool.standings.length > 0 ? view.pool.standings.map((s) => s.team) : view.teams
    return [...source].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
  }, [view])
  const needle = normalize(query)
  const shown = needle ? teams.filter((t) => normalize(t.name).includes(needle)) : teams

  return (
    <section className="card my-team" aria-label="Choisir mon équipe">
      <h2 className="card-title">Quelle est votre équipe ?</h2>
      <p className="muted small">Choisissez-la une fois : ce téléphone s’en souviendra et affichera votre planche en haut de page.</p>
      <input
        type="search"
        className="picker-search"
        placeholder="Rechercher un nom…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Rechercher une équipe"
      />
      <ul className="picker-list">
        {shown.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => onChoose(t.id)}>
              {t.name}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="muted">Aucune équipe ne correspond.</li>}
      </ul>
    </section>
  )
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function ordinal(rank: number): string {
  return rank === 1 ? '1re' : `${rank}e`
}
