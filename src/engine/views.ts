import type { EditionSettings } from './settings.ts'
import { requireEdition, type EditionState } from './state.ts'

/** Avant le jour J, tournoi en cours, tournoi terminé. */
export type Phase = 'before' | 'during' | 'after'

/** À enrichir par les tickets poules / tableaux (1re partie lancée, finale jouée…). */
export function phaseOf(_state: EditionState): Phase {
  return 'before'
}

/**
 * Vue publique (téléphone, télé). Ne contient JAMAIS : téléphone, paiement,
 * pointage, licence, commentaire, ni le jeton de prévisualisation.
 */
export interface PublicView {
  id: string
  name: string
  date: string
  arrivalTime: string
  startTime: string
  venue: string
  price: number
  contact: string
  boards: number
  maxTeams: number
  gameMinutes: number
  isTest: boolean
  phase: Phase
}

export function publicView(state: EditionState): PublicView {
  const { id, settings: s } = requireEdition(state)
  return {
    id,
    name: s.name,
    date: s.date,
    arrivalTime: s.arrivalTime,
    startTime: s.startTime,
    venue: s.venue,
    price: s.price,
    contact: s.contact,
    boards: s.boards,
    maxTeams: s.maxTeams,
    gameMinutes: s.gameMinutes,
    isTest: s.isTest,
    phase: phaseOf(state),
  }
}

/** Vue console : tout, y compris les données privées. */
export interface AdminView {
  id: string
  settings: EditionSettings
  previewToken: string
  createdAt: number
  phase: Phase
}

export function adminView(state: EditionState): AdminView {
  const { id, settings, previewToken, createdAt } = requireEdition(state)
  return { id, settings, previewToken, createdAt, phase: phaseOf(state) }
}

/** Ligne de la liste des éditions (console, choix de l'édition en cours). */
export interface EditionSummary {
  id: string
  name: string
  date: string
  isTest: boolean
  createdAt: number
  phase: Phase
}

export function editionSummary(state: EditionState): EditionSummary {
  const { id, settings, createdAt } = requireEdition(state)
  return { id, name: settings.name, date: settings.date, isTest: settings.isTest, createdAt, phase: phaseOf(state) }
}

/** L'édition « en cours » du site public : la plus récente par date, hors test. */
export function currentEdition(summaries: readonly EditionSummary[]): EditionSummary | null {
  const real = summaries.filter((e) => !e.isTest)
  real.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  return real[0] ?? null
}
