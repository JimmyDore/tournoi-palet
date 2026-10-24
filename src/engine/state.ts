import type { EditionSettings } from './settings.ts'

export interface EditionInfo {
  id: string
  settings: EditionSettings
  /** Jeton secret des liens publics d'une édition de test (`?k=`). */
  previewToken: string
  createdAt: number
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
}

export function initialState(): EditionState {
  return { edition: null }
}

/** Pour les vues et les commandes qui exigent une édition créée. */
export function requireEdition(state: EditionState): EditionInfo {
  if (!state.edition) throw new Error("Cette édition n'existe pas.")
  return state.edition
}
