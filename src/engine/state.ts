import { initialBrackets, type BracketsState } from './brackets.ts'
import type { EditionSettings } from './settings.ts'
import type { Forfeit } from './forfeit.ts'
import type { PoolState } from './pool.ts'
import type { TeamFields } from './teams.ts'

export interface EditionInfo {
  id: string
  settings: EditionSettings
  /** Jeton secret des liens publics d'une édition de test (`?k=`). */
  previewToken: string
  createdAt: number
}

/** Une équipe, dans l'ordre d'inscription. Le nom n'est qu'un affichage : on la désigne par `id`. */
export interface Team extends TeamFields {
  /** Identifiant interne stable (`t1`, `t2`…), jamais réutilisé dans l'édition. */
  id: string
  registeredAt: number
  /** Pointage du jour J (présente et payée), posé par le ticket 04. `null` : pas pointée. */
  checkedInAt: number | null
}

/**
 * État d'une édition = `events.reduce(evolve, initialState())`.
 * Chaque fonctionnalité ajoute sa tranche ici (équipes, poules, tableaux…),
 * initialisée dans `initialState`. Rien de calculé n'y est stocké : les
 * classements, tableaux et places sont des vues.
 */
export interface EditionState {
  /** `null` tant que l'édition n'est pas créée. */
  edition: EditionInfo | null
  /** Équipes inscrites ou en liste d'attente, dans l'ordre d'inscription. Les désinscrites en sont retirées. */
  teams: Team[]
  /** Numéro du prochain identifiant d'équipe. */
  nextTeamNumber: number
  /** Parties de poule tirées et scores saisis. */
  pool: PoolState
  /** Équipes déclarées forfait (poule ou tableau), par id. */
  forfeits: Record<string, Forfeit>
  /** Répartition validée, grilles du 1er tour et scores des tableaux. */
  brackets: BracketsState
}

export function initialState(): EditionState {
  return { edition: null, teams: [], nextTeamNumber: 1, pool: { rounds: [], scores: {}, finishOrder: [] }, forfeits: {}, brackets: initialBrackets() }
}

/** Pour les vues et les commandes qui exigent une édition créée. */
export function requireEdition(state: EditionState): EditionInfo {
  if (!state.edition) throw new Error("Cette édition n'existe pas.")
  return state.edition
}
