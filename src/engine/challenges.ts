import type { BracketKey } from './brackets.ts'

// Challenges : rien n'est stocké. Les équipes d'un Challenge sont les
// perdants des vrais matchs du 1er tour de son tableau parent (une équipe
// exemptée n'y va pas), ordonnés par classement des poules ; le tableau les
// place en têtes de série. Le Challenge existe une fois ce 1er tour complet,
// et suit une correction de score du parent (ses scores dont les équipes ne
// correspondent plus sont ignorés, comme ailleurs).

/** Chaque tableau parent et son Challenge, dans l'ordre du classement final. */
export const CHALLENGES: readonly (readonly [parent: BracketKey, challenge: BracketKey])[] = [
  ['P', 'CP'],
  ['C', 'CC'],
]

/** Ce qu'il faut savoir d'un match du 1er tour du parent. */
export interface FirstRoundMatch {
  bye: boolean
  teamA: string | null
  teamB: string | null
  /** `null` tant que le match n'est pas joué. */
  winner: string | null
}

/**
 * Équipes du Challenge, la mieux classée d'abord ; `null` tant que le 1er
 * tour du parent n'est pas complet. `poolOrder` : les équipes dans l'ordre du
 * classement des poules.
 */
export function challengeEntrants(firstRound: readonly FirstRoundMatch[], poolOrder: readonly string[]): string[] | null {
  if (firstRound.length === 0 || firstRound.some((m) => m.winner === null)) return null
  const losers = firstRound.filter((m) => !m.bye).map((m) => (m.winner === m.teamA ? m.teamB! : m.teamA!))
  const rank = new Map(poolOrder.map((id, i) => [id, i]))
  const position = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER
  return losers.sort((x, y) => position(x) - position(y))
}
