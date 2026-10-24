import { BRACKET_NAMES, type BracketKey, type BracketMatchView, type BracketTeamRef } from './brackets.ts'
import { CHALLENGES } from './challenges.ts'
import { POOL_ROUNDS, type PoolStanding, type PoolTeamRef } from './pool.ts'
import type { FinalRankingRow } from './ranking.ts'
import type { PublicTeam, PublicView } from './views.ts'

// « Mon équipe » sur le téléphone. Calculé à partir de la vue publique (le
// téléphone n'a qu'elle), donc sans aucune donnée privée par construction.
// En poule : la partie en cours ; dans les tableaux : le prochain match
// (tableau, tour, planche, adversaire), puis la place finale une fois
// définitive.

/** Le tableau et le tour d'un match de tableau. */
export interface BracketStage {
  bracket: BracketKey
  bracketName: string
  roundName: string
}

/** Ce que l'équipe doit faire maintenant : dans la dernière partie lancée, ou dans les tableaux. */
export type MyNext =
  | { kind: 'not-drawn' }
  | { kind: 'not-in-pool' }
  | { kind: 'forfeit' }
  | { kind: 'board'; round: number; board: number; opponent: PoolTeamRef }
  | { kind: 'waiting-board'; round: number; opponent: PoolTeamRef }
  | { kind: 'bye'; round: number }
  | { kind: 'played'; round: number }
  /** Les 4 parties jouées, tableaux pas encore générés. */
  | { kind: 'pools-done' }
  | ({ kind: 'bracket-board'; board: number; opponent: PoolTeamRef } & BracketStage)
  | ({ kind: 'bracket-waiting-board'; opponent: PoolTeamRef } & BracketStage)
  /** Match pas encore lancé : adversaire pas encore connu (`null`), ou tour précédent pas fini. */
  | ({ kind: 'bracket-pending'; opponent: PoolTeamRef | null } & BracketStage)
  /** Perdante du 1er tour : son Challenge se forme à la fin de ce tour. */
  | { kind: 'challenge-waiting'; bracket: BracketKey; bracketName: string }
  /** Éliminée, place encore provisoire (son tour n'est pas fini). */
  | { kind: 'eliminated'; place: number; blockName: string; eliminatedIn: string | null }
  /** Place finale définitive (`eliminatedIn` `null` : vainqueur du bloc). */
  | { kind: 'final-place'; place: number; teamCount: number; blockName: string; eliminatedIn: string | null }

/** Un résultat vu du côté de l'équipe (`scored` : ses points). */
export interface MyResult {
  round: number
  bye: boolean
  board: number | null
  opponent: PoolTeamRef | null
  scored: number
  conceded: number
  won: boolean
  /** Match gagné ou perdu par forfait (13-0). */
  forfeit: boolean
}

/** Un match de tableau joué, vu du côté de l'équipe. */
export interface MyBracketResult extends BracketStage {
  matchId: string
  board: number | null
  opponent: PoolTeamRef
  scored: number
  conceded: number
  won: boolean
}

export interface MyTeamView {
  team: PublicTeam
  next: MyNext
  /** Matchs joués (score saisi) et exempts, partie par partie. */
  results: MyResult[]
  /** Sa ligne du classement des poules, `null` avant le tirage ou si elle n'est pas tirée. */
  standing: PoolStanding | null
  /** Nombre d'équipes classées. */
  teamCount: number
  /** Matchs de tableau joués, dans l'ordre (Principal ou Consolante, puis son Challenge). */
  bracketResults: MyBracketResult[]
  /** Sa ligne du classement final (provisoire tant que `definitive` est faux), `null` avant les tableaux. */
  ranking: FinalRankingRow | null
}

export function myTeamView(view: PublicView, teamId: string): MyTeamView | null {
  const { pool } = view
  const standing = pool.standings.find((s) => s.team.id === teamId) ?? null
  const team = view.teams.find((t) => t.id === teamId) ?? standing?.team
  if (!team) return null

  const results: MyResult[] = []
  for (const round of pool.rounds) {
    if (round.bye?.team.id === teamId) {
      const { a, b } = round.bye.score
      results.push({ round: round.round, bye: true, board: null, opponent: null, scored: a, conceded: b, won: true, forfeit: false })
    }
    for (const m of round.matches) {
      if (!m.score || (m.teamA.id !== teamId && m.teamB.id !== teamId)) continue
      const isA = m.teamA.id === teamId
      const [scored, conceded] = isA ? [m.score.a, m.score.b] : [m.score.b, m.score.a]
      results.push({ round: round.round, bye: false, board: m.board, opponent: isA ? m.teamB : m.teamA, scored, conceded, won: scored > conceded, forfeit: m.forfeit !== null })
    }
  }

  const ranking = view.ranking.rows.find((r) => r.team.id === teamId) ?? null
  const matches = bracketMatchesOf(view, teamId)
  const next: MyNext = standing?.forfeit
    ? { kind: 'forfeit' }
    : view.brackets.generated && ranking
      ? bracketNext(view, teamId, matches, ranking)
      : nextOf(view, teamId, standing !== null)
  const bracketResults = matches.filter((m) => m.score).map((m) => resultOf(m, teamId))
  return { team, next, results, standing, teamCount: pool.standings.length, bracketResults, ranking }
}

const ref = (team: BracketTeamRef): PoolTeamRef => ({ id: team.id, name: team.name })
const stageOf = (m: BracketMatchView): BracketStage => ({ bracket: m.bracket, bracketName: m.bracketName, roundName: m.roundName })
const sideOf = (m: BracketMatchView, teamId: string) => (m.teamA?.id === teamId ? 'A' : m.teamB?.id === teamId ? 'B' : null)

/** Vrais matchs de tableau de l'équipe (exempts exclus), dans l'ordre P, CP, C, CC puis par tour. */
function bracketMatchesOf(view: PublicView, teamId: string): BracketMatchView[] {
  return view.brackets.brackets
    .flatMap((b) => b.rounds.flatMap((r) => r.matches))
    .filter((m) => m.status !== 'bye' && sideOf(m, teamId) !== null)
}

function resultOf(m: BracketMatchView, teamId: string): MyBracketResult {
  const isA = sideOf(m, teamId) === 'A'
  const [scored, conceded] = isA ? [m.score!.a, m.score!.b] : [m.score!.b, m.score!.a]
  return { ...stageOf(m), matchId: m.id, board: m.board, opponent: ref((isA ? m.teamB : m.teamA)!), scored, conceded, won: scored > conceded }
}

function bracketNext(view: PublicView, teamId: string, matches: BracketMatchView[], row: FinalRankingRow): MyNext {
  const upcoming = matches.find((m) => !m.score)
  if (upcoming) {
    const other = sideOf(upcoming, teamId) === 'A' ? upcoming.teamB : upcoming.teamA
    const stage = stageOf(upcoming)
    if (other && upcoming.status === 'playing' && upcoming.board !== null) return { kind: 'bracket-board', ...stage, board: upcoming.board, opponent: ref(other) }
    if (other && upcoming.status === 'waiting-board') return { kind: 'bracket-waiting-board', ...stage, opponent: ref(other) }
    return { kind: 'bracket-pending', ...stage, opponent: other ? ref(other) : null }
  }
  // Perdante d'un vrai match du 1er tour, son Challenge pas encore formé.
  const [first] = matches
  const challenge = CHALLENGES.find(([parent]) => parent === first?.bracket)?.[1]
  if (first?.round === 1 && challenge && !resultOf(first, teamId).won && !view.brackets.brackets.some((b) => b.key === challenge)) {
    return { kind: 'challenge-waiting', bracket: challenge, bracketName: BRACKET_NAMES[challenge] }
  }
  const { place, blockName, eliminatedIn } = row
  if (row.definitive) return { kind: 'final-place', place, teamCount: view.ranking.rows.length, blockName, eliminatedIn }
  return { kind: 'eliminated', place, blockName, eliminatedIn }
}

function nextOf(view: PublicView, teamId: string, drawn: boolean): MyNext {
  const last = view.pool.rounds.at(-1)
  if (!last) return { kind: 'not-drawn' }
  if (!drawn) return { kind: 'not-in-pool' }
  if (last.bye?.team.id === teamId) return { kind: 'bye', round: last.round }
  const match = last.matches.find((m) => m.teamA.id === teamId || m.teamB.id === teamId)
  if (!match || match.score) return last.round >= POOL_ROUNDS && last.complete ? { kind: 'pools-done' } : { kind: 'played', round: last.round }
  const opponent = match.teamA.id === teamId ? match.teamB : match.teamA
  if (match.board === null) return { kind: 'waiting-board', round: last.round, opponent }
  return { kind: 'board', round: last.round, board: match.board, opponent }
}
