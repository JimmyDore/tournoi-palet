import type { EditionSettings } from './settings.ts'
import { participants } from './checkin.ts'
import { poolView, type PoolView } from './pool.ts'
import { requireEdition, type EditionState } from './state.ts'
import type { TvState } from './tv.ts'
import { teamName, teamStatuses, teamWarnings, type TeamFields, type TeamStatus } from './teams.ts'

export { participants }

/** Avant le jour J, tournoi en cours, tournoi terminé. */
export type Phase = 'before' | 'during' | 'after'

/** Pendant dès la partie 1 lancée. À compléter par les tableaux (finale jouée → après). */
export function phaseOf(state: EditionState): Phase {
  return state.pool.rounds.length > 0 ? 'during' : 'before'
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
  /** Équipes inscrites, dans l'ordre d'inscription : nom seulement. */
  teams: PublicTeam[]
  /** Liste d'attente, dans l'ordre : nom seulement. */
  waitlist: PublicTeam[]
  placesLeft: number
  /** Parties, planches, scores et classement des poules (noms d'équipe seulement). */
  pool: PoolView
  /** Vue imposée à la télé (`auto` : rotation). */
  tv: TvState
}

export interface PublicTeam {
  id: string
  name: string
}

/** Inscrits et liste d'attente, dans l'ordre d'inscription. */
function lineup(state: EditionState) {
  const statuses = teamStatuses(state)
  const registered = state.teams.filter((t) => statuses.get(t.id) === 'registered')
  const waitlist = state.teams.filter((t) => statuses.get(t.id) === 'waitlist')
  const placesLeft = Math.max(0, requireEdition(state).settings.maxTeams - registered.length)
  return { statuses, registered, waitlist, placesLeft }
}

export function publicView(state: EditionState): PublicView {
  const { id, settings: s } = requireEdition(state)
  const { registered, waitlist, placesLeft } = lineup(state)
  const named = (t: TeamFields & { id: string }): PublicTeam => ({ id: t.id, name: teamName(t) })
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
    teams: registered.map(named),
    waitlist: waitlist.map(named),
    placesLeft,
    pool: poolView(state),
    tv: state.tv,
  }
}

/** Fiche équipe complète, pour la console. */
export interface AdminTeam extends Omit<TeamFields, 'name'> {
  id: string
  /** Nom affiché (le nom saisi, sinon « Joueur1 & Joueur2 »). */
  name: string
  /** Nom saisi ; vide si l'équipe garde le nom par défaut. */
  customName: string
  status: TeamStatus
  /** Rang dans la liste d'attente (1 = la prochaine à remonter), sinon `null`. */
  waitlistPosition: number | null
  registeredAt: number
  checkedInAt: number | null
  /** Alertes non bloquantes (ex. deux licenciés). */
  warnings: string[]
}

/** Vue console : tout, y compris les données privées. */
export interface AdminView {
  id: string
  settings: EditionSettings
  previewToken: string
  createdAt: number
  phase: Phase
  /** Inscrites puis liste d'attente, chacune dans l'ordre d'inscription. */
  teams: AdminTeam[]
  registeredCount: number
  /** Inscrites pointées (présentes et payées). */
  checkedInCount: number
  waitlistCount: number
  placesLeft: number
  pool: PoolView
  tv: TvState
}

export function adminView(state: EditionState): AdminView {
  const { id, settings, previewToken, createdAt } = requireEdition(state)
  const { statuses, registered, waitlist, placesLeft } = lineup(state)
  const teams = [...registered, ...waitlist].map(({ name, ...team }): AdminTeam => {
    const status = statuses.get(team.id)!
    return {
      ...team,
      name: teamName({ ...team, name }),
      customName: name,
      status,
      waitlistPosition: status === 'waitlist' ? waitlist.findIndex((w) => w.id === team.id) + 1 : null,
      warnings: teamWarnings(team),
    }
  })
  return {
    id,
    settings,
    previewToken,
    createdAt,
    phase: phaseOf(state),
    teams,
    registeredCount: registered.length,
    checkedInCount: participants(state).length,
    waitlistCount: waitlist.length,
    placesLeft,
    pool: poolView(state),
    tv: state.tv,
  }
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
