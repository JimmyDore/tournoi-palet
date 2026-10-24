import type { ReactNode } from 'react'
import {
  BRACKET_NAMES,
  bracketScreen,
  tvRotation,
  tvViewLabel,
  type BracketKey,
  type BracketMatchView,
  type BracketRoundView,
  type BracketView,
  type FinalRankingRow,
  type PoolMatchView,
  type PoolStanding,
  type PublicView,
  type TvScreen,
} from '../../engine/index.ts'
import { rankingStage } from '../format.ts'

/**
 * Écrans de la télé. Chaque vue de `TV_VIEWS` (moteur) a son écran ici et ses
 * pages (une page tient en 1920×1080, lisible de loin ; au-delà, la vue est
 * découpée en pages qui tournent). Les vues qui tournent seules, selon le
 * moment du tournoi, sont choisies par `tvRotation` (moteur).
 */
interface ScreenDef {
  title: (view: PublicView) => string
  pages: (view: PublicView) => ReactNode[]
}

/** 2 colonnes de 6 matchs. */
const MATCHES_PER_PAGE = 12
/** Une colonne pleine largeur : les noms longs restent entiers. */
const STANDINGS_PER_PAGE = 16
/** Au plus 8 matchs dans la première colonne d'un arbre : au-delà, il est coupé en moitiés (ou en quarts). */
const TREE_FIRST_COLUMN = 8

function bracketScreenDef(key: BracketKey): ScreenDef {
  return {
    title: () => tvViewLabel(bracketScreen(key)),
    pages: (view) => {
      const bracket = view.brackets.brackets.find((b) => b.key === key)
      if (!bracket) return [<TvEmpty key="empty" text={emptyBracketText(view, key)} />]
      return treePages(bracket).map((page, i) => (
        <div key={i} className="tv-page">
          <TvTree bracket={bracket} page={page} />
        </div>
      ))
    },
  }
}

function emptyBracketText(view: PublicView, key: BracketKey): string {
  if (!view.brackets.generated) return 'Les tableaux seront affichés à la fin des poules.'
  if (key === 'CP') return `Le ${BRACKET_NAMES.CP} se forme à la fin du 1er tour du Principal.`
  if (key === 'CC') return `Le ${BRACKET_NAMES.CC} se forme à la fin du 1er tour de la Consolante.`
  return 'Ce tableau n’a pas d’équipe.'
}

export const SCREENS: Record<TvScreen, ScreenDef> = {
  matches: {
    title: (view) => {
      if (view.brackets.generated) return 'Tableaux · matchs en cours'
      return view.pool.currentRound ? `Partie ${view.pool.currentRound} · matchs en cours` : 'Matchs en cours'
    },
    pages: (view) => {
      if (view.brackets.generated) {
        const live = view.brackets.live
        if (live.length === 0) return [<TvEmpty key="empty" text="Aucun match de tableau en cours." />]
        return chunk(live, MATCHES_PER_PAGE).map((matches, i) => (
          <div key={i} className="tv-page">
            <ol className="tv-matches">
              {matches.map((m) => (
                <TvBracketMatch key={m.id} match={m} />
              ))}
            </ol>
          </div>
        ))
      }
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
  'bracket-P': bracketScreenDef('P'),
  'bracket-CP': bracketScreenDef('CP'),
  'bracket-C': bracketScreenDef('C'),
  'bracket-CC': bracketScreenDef('CC'),
  ranking: {
    title: (view) => (view.ranking.finished || view.ranking.rows.length === 0 ? 'Classement final' : 'Classement provisoire'),
    pages: (view) => {
      const rows = view.ranking.rows
      if (rows.length === 0) return [<TvEmpty key="empty" text="Le classement final s’affichera dès la génération des tableaux." />]
      return chunk(rows, STANDINGS_PER_PAGE).map((page, i) => (
        <div key={i} className="tv-page">
          <TvRanking rows={page} />
        </div>
      ))
    },
  },
}

export interface Slide {
  key: string
  title: string
  /** Sous-titre de la page (ex. « haut du tableau »). */
  page: number
  pages: number
  content: ReactNode
}

/** Diapositives de la rotation : les vues du moment (`tvRotation`), ou la seule vue bloquée. */
export function slidesOf(view: PublicView): Slide[] {
  return tvRotation(view).flatMap((key) => {
    const screen = SCREENS[key]
    const pages = screen.pages(view)
    return pages.map((content, page) => ({ key: `${key}-${page}`, title: screen.title(view), page, pages: pages.length, content }))
  })
}

// --- Arbre d'un tableau ------------------------------------------------------

interface TreePage {
  /** « haut du tableau », « bas du tableau », « quart 1 »… ; `null` si l'arbre tient sur une page. */
  part: string | null
  columns: { round: BracketRoundView; matches: BracketMatchView[] }[]
}

/**
 * Pages d'un arbre. Il commence au tour qui précède le premier tour pas
 * fini (les tours plus anciens ne servent plus sur la télé ; le téléphone
 * les garde), et une fois tout joué, aux 4 derniers tours. Si la première
 * colonne dépasse 8 matchs (tableau de 32 au 1er tour), l'arbre est coupé
 * en moitiés (ou en quarts) ; les tours qui réunissent les parties (finale)
 * sont montrés en entier sur chaque page.
 */
function treePages(bracket: BracketView): TreePage[] {
  const { rounds } = bracket
  if (rounds.length === 0) return [{ part: null, columns: [] }]
  const open = rounds.findIndex((r) => r.matches.some((m) => m.status !== 'done' && m.status !== 'bye'))
  const start = open === -1 ? Math.max(0, rounds.length - 4) : Math.max(0, open - 1)
  const shown = rounds.slice(start)
  const parts = Math.max(1, shown[0].matches.length / TREE_FIRST_COLUMN)
  return Array.from({ length: parts }, (_, p) => ({
    part: parts === 1 ? null : parts === 2 ? (p === 0 ? 'haut du tableau' : 'bas du tableau') : `partie ${p + 1} sur ${parts}`,
    columns: shown.map((round) => {
      const per = round.matches.length / parts
      return { round, matches: per >= 1 ? round.matches.slice(p * per, (p + 1) * per) : round.matches }
    }),
  }))
}

function TvTree({ bracket, page }: { bracket: BracketView; page: TreePage }) {
  return (
    <>
      {(bracket.winner || page.part) && (
        <p className="tv-tree-caption">
          {bracket.winner ? (
            <>
              Vainqueur : <strong>{bracket.winner.name}</strong>
            </>
          ) : (
            page.part
          )}
        </p>
      )}
      {page.columns.length === 0 ? (
        <TvEmpty text={bracket.winner ? 'Une seule équipe : elle remporte le tableau.' : 'Pas de match dans ce tableau.'} />
      ) : (
        <div className={`tv-tree tv-tree-${Math.min(page.columns.length, 5)}`}>
          {page.columns.map(({ round, matches }) => (
            <section key={round.round} className="tv-tree-col" aria-label={round.name}>
              <h2 className="tv-tree-round">{round.name}</h2>
              <ol className="tv-tree-matches">
                {matches.map((m) => (
                  <TvTreeMatch key={m.id} match={m} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

function TvTreeMatch({ match }: { match: BracketMatchView }) {
  const { score } = match
  const winner = score ? (score.a > score.b ? 'a' : 'b') : match.status === 'bye' ? (match.teamA ? 'a' : 'b') : null
  const side = (team: BracketMatchView['teamA'], key: 'a' | 'b', points: number | undefined) => (
    <span className={`tv-tree-team${winner === key ? ' tv-winner' : winner ? ' tv-loser' : ''}`}>
      <span className="tv-tree-name">{team ? team.name : match.status === 'bye' ? 'exempt' : '…'}</span>
      {points !== undefined && <span className="tv-tree-score">{points}</span>}
    </span>
  )
  return (
    <li className={`tv-tree-match tv-tree-${match.status}`}>
      {(match.status === 'playing' || match.status === 'waiting-board') && (
        <span className="tv-tree-board">{match.board !== null ? `Planche ${match.board}` : 'attente de planche'}</span>
      )}
      {side(match.teamA, 'a', score?.a)}
      {side(match.teamB, 'b', score?.b)}
    </li>
  )
}

// --- Matchs, classements -----------------------------------------------------

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
          {match.forfeit && <span className="tv-forfeit">forfait</span>}
        </span>
      ) : match.status === 'waiting-board' ? (
        <span className="tv-state">en attente de planche</span>
      ) : null}
    </li>
  )
}

/** Un match de tableau en cours : planche, tableau et tour, équipes. */
function TvBracketMatch({ match }: { match: BracketMatchView }) {
  return (
    <li className={`tv-match tv-match-${match.status}`}>
      <span className="tv-board">{match.board ?? '–'}</span>
      <span className="tv-teams">
        <span className="tv-stage">
          {match.bracketName} · {match.roundName}
        </span>
        <span>{match.teamA?.name}</span>
        <span>{match.teamB?.name}</span>
      </span>
      {match.status === 'waiting-board' && <span className="tv-state">en attente de planche</span>}
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
            <td className="tv-name">
              {s.team.name}
              {s.forfeit && <span className="tv-forfeit"> forfait</span>}
            </td>
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

/** Classement final : place, équipe, tableau, parcours ; une place provisoire est grisée. */
function TvRanking({ rows }: { rows: FinalRankingRow[] }) {
  return (
    <table className="tv-table tv-ranking">
      <thead>
        <tr>
          <th className="tv-rank">#</th>
          <th className="tv-name">Équipe</th>
          <th className="tv-block">Tableau</th>
          <th className="tv-stage-col">Parcours</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.team.id} className={r.definitive ? undefined : 'tv-provisional'}>
            <td className="tv-rank">{r.place}</td>
            <td className="tv-name">{r.team.name}</td>
            <td className="tv-block">{r.blockName}</td>
            <td className="tv-stage-col">{rankingStage(r)}</td>
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
