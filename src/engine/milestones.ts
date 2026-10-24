import { completedBracketRounds } from './brackets.ts'
import { poolView } from './pool.ts'
import type { EditionState } from './state.ts'

/**
 * Jalons atteints du tournoi, dans l'ordre : une partie de poule dont tous
 * les scores sont saisis (`poule-partie-N`), puis les tours de tableau
 * terminés (`tableau-P-tour-2`). Le serveur fait une copie de la base à
 * chaque nouveau jalon : un identifiant ne doit donc jamais changer, et sert
 * dans un nom de fichier (lettres, chiffres, tirets).
 */
export function milestones(state: EditionState): string[] {
  if (!state.edition) return []
  const pool = poolView(state)
    .rounds.filter((r) => r.complete)
    .map((r) => `poule-partie-${r.round}`)
  const brackets = completedBracketRounds(state).map((r) => `tableau-${r.bracket}-tour-${r.round}`)
  return [...pool, ...brackets]
}
