import type { ReactNode } from 'react'
import { TV_VIEWS, type PoolMatchView, type PoolStanding, type PublicView, type TvScreen } from '../../engine/index.ts'

/**
 * Écrans de la télé. Chaque vue de `TV_VIEWS` (moteur) a son écran ici :
 * ce qu'elle a à montrer (`has`) et ses pages (une page tient en 1920×1080,
 * lisible de loin ; au-delà, la vue est découpée en pages qui tournent).
 * Ticket 15 : ajouter tableaux et classement final ici et dans `TV_VIEWS`.
 */
interface ScreenDef {
  title: (view: PublicView) => string
  has: (view: PublicView) => boolean
  pages: (view: PublicView) => ReactNode[]
}

/** 2 colonnes de 6 matchs. */
const MATCHES_PER_PAGE = 12
/** Une colonne pleine largeur : les noms longs restent entiers. */
const STANDINGS_PER_PAGE = 16

export const SCREENS: Record<TvScreen, ScreenDef> = {
  matches: {
    title: (view) => (view.pool.currentRound ? `Partie ${view.pool.currentRound} · matchs en cours` : 'Matchs en cours'),
    has: (view) => view.pool.rounds.length > 0,
    pages: (view) => {
      const round = view.pool.rounds.at(-1)
      if (!round) return [<TvEmpty key="empty" text="Le tirage de la partie 1 n’a pas encore eu lieu." />]
      return chunk(round.matches, MATCHES_PER_PAGE).map((matches, i, all) => (
        <div key={i} className="tv-page">
          <ol className="tv-matches">
            {matches.map((m) => (
              <TvMatch key={m.id} match={m} />
            ))}
          </ol>
          {round.bye && i === all.length - 1 && (
            <p className="tv-bye">
              Exempte : <strong>{round.bye.team.name}</strong> (victoire {round.bye.score.a}-{round.bye.score.b})
            </p>
          )}
        </div>
      ))
    },
  },
  standings: {
    title: () => 'Classement des poules',
    has: (view) => view.pool.standings.length > 0,
    pages: (view) => {
      const rows = view.pool.standings
      if (rows.length === 0) return [<TvEmpty key="empty" text="Le classement s’affichera dès le lancement de la partie 1." />]
      return chunk(rows, STANDINGS_PER_PAGE).map((page, i) => (
        <div key={i} className="tv-page">
          <TvStandings rows={page} />
        </div>
      ))
    },
  },
}

export interface Slide {
  key: string
  title: string
  page: number
  pages: number
  content: ReactNode
}

/** Diapositives de la rotation : toutes les vues qui ont quelque chose à montrer, ou la seule vue bloquée. */
export function slidesOf(view: PublicView): Slide[] {
  const locked = view.tv.view
  const screens = locked === 'auto' ? TV_VIEWS.map((v) => v.key).filter((key) => SCREENS[key].has(view)) : [locked]
  return screens.flatMap((key) => {
    const screen = SCREENS[key]
    const pages = screen.pages(view)
    return pages.map((content, page) => ({ key: `${key}-${page}`, title: screen.title(view), page, pages: pages.length, content }))
  })
}

function TvMatch({ match }: { match: PoolMatchView }) {
  const { score } = match
  const winner = score ? (score.a > score.b ? 'a' : 'b') : null
  return (
    <li className={`tv-match tv-match-${match.status}`}>
      <span className="tv-board">{match.board ?? '–'}</span>
      <span className="tv-teams">
        <span className={winner === 'a' ? 'tv-winner' : undefined}>{match.teamA.name}</span>
        <span className={winner === 'b' ? 'tv-winner' : undefined}>{match.teamB.name}</span>
      </span>
      {score ? (
        <span className="tv-score">
          <span className={winner === 'a' ? 'tv-winner' : undefined}>{score.a}</span>
          <span className={winner === 'b' ? 'tv-winner' : undefined}>{score.b}</span>
        </span>
      ) : match.status === 'waiting-board' ? (
        <span className="tv-state">en attente de planche</span>
      ) : null}
    </li>
  )
}

function TvStandings({ rows }: { rows: PoolStanding[] }) {
  return (
    <table className="tv-table">
      <thead>
        <tr>
          <th className="tv-rank">#</th>
          <th className="tv-name">Équipe</th>
          <th>V</th>
          <th>Pour</th>
          <th>Contre</th>
          <th>Diff</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.team.id}>
            <td className="tv-rank">{s.rank}</td>
            <td className="tv-name">{s.team.name}</td>
            <td className="tv-wins">{s.wins}</td>
            <td>{s.pointsFor}</td>
            <td>{s.pointsAgainst}</td>
            <td>{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function TvEmpty({ text }: { text: string }) {
  return <p className="tv-empty">{text}</p>
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
