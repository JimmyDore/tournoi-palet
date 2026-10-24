import type { PoolStanding, PoolTeamRef } from './pool.ts'
import type { PublicTeam, PublicView } from './views.ts'

// « Mon équipe » sur le téléphone. Calculé à partir de la vue publique (le
// téléphone n'a qu'elle), donc sans aucune donnée privée par construction.
// Ticket 15 : suivre l'équipe dans les tableaux, puis sa place finale.

/** Ce que l'équipe doit faire maintenant, dans la dernière partie lancée. */
export type MyNext =
  | { kind: 'not-drawn' }
  | { kind: 'not-in-pool' }
  | { kind: 'forfeit' }
  | { kind: 'board'; round: number; board: number; opponent: PoolTeamRef }
  | { kind: 'waiting-board'; round: number; opponent: PoolTeamRef }
  | { kind: 'bye'; round: number }
  | { kind: 'played'; round: number }

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

export interface MyTeamView {
  team: PublicTeam
  next: MyNext
  /** Matchs joués (score saisi) et exempts, partie par partie. */
  results: MyResult[]
  /** Sa ligne du classement des poules, `null` avant le tirage ou si elle n'est pas tirée. */
  standing: PoolStanding | null
  /** Nombre d'équipes classées. */
  teamCount: number
  /** « Ton lot » : seulement une fois sa place finale définitive, `null` sinon ou sans lot. */
  prize: string | null
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

  const next: MyNext = standing?.forfeit ? { kind: 'forfeit' } : nextOf(view, teamId, standing !== null)
  const place = view.ranking.rows.find((r) => r.team.id === teamId)
  const prize = place?.definitive ? place.prize : null
  return { team, next, results, standing, teamCount: pool.standings.length, prize }
}

function nextOf(view: PublicView, teamId: string, drawn: boolean): MyNext {
  const last = view.pool.rounds.at(-1)
  if (!last) return { kind: 'not-drawn' }
  if (!drawn) return { kind: 'not-in-pool' }
  if (last.bye?.team.id === teamId) return { kind: 'bye', round: last.round }
  const match = last.matches.find((m) => m.teamA.id === teamId || m.teamB.id === teamId)
  if (!match || match.score) return { kind: 'played', round: last.round }
  const opponent = match.teamA.id === teamId ? match.teamB : match.teamA
  if (match.board === null) return { kind: 'waiting-board', round: last.round, opponent }
  return { kind: 'board', round: last.round, board: match.board, opponent }
}
