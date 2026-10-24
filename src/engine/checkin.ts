import type { EditionState } from './state.ts'
import { teamName, teamStatuses } from './teams.ts'
import { accept, refuse, type Ctx, type Decision } from './types.ts'

// Pointage du jour J : une équipe pointée est présente ET a payé (Q24).

// --- Commandes -------------------------------------------------------------

export interface CheckInTeam {
  type: 'checkInTeam'
  teamId: string
}

/** Annule un pointage fait par erreur. */
export interface UndoCheckIn {
  type: 'undoCheckIn'
  teamId: string
}

/**
 * Inscrite absente (non pointée) : on la retire et la tête de la liste
 * d'attente prend sa place.
 */
export interface ReplaceAbsentTeam {
  type: 'replaceAbsentTeam'
  teamId: string
}

export type CheckInCommand = CheckInTeam | UndoCheckIn | ReplaceAbsentTeam

// --- Événements ------------------------------------------------------------

export interface TeamCheckedIn {
  type: 'teamCheckedIn'
  at: number
  teamId: string
}

export interface TeamCheckInUndone {
  type: 'teamCheckInUndone'
  at: number
  teamId: string
}

export interface AbsentTeamReplaced {
  type: 'absentTeamReplaced'
  at: number
  /** L'absente, retirée de l'édition. */
  teamId: string
  /** La tête de la liste d'attente au moment du remplacement (pour le journal). */
  replacementId: string
}

export type CheckInEvent = TeamCheckedIn | TeamCheckInUndone | AbsentTeamReplaced

// --- decide / evolve -------------------------------------------------------

export function decideCheckIn(state: EditionState, command: CheckInCommand, ctx: Ctx): Decision<CheckInEvent> {
  const team = state.teams.find((t) => t.id === command.teamId)
  if (!team) return refuse("Cette équipe n'est pas inscrite.")
  switch (command.type) {
    case 'checkInTeam': {
      if (team.checkedInAt !== null) return refuse(`« ${teamName(team)} » est déjà pointée.`)
      const rank = waitlistRank(state, team.id)
      if (rank !== null)
        return refuse(
          `« ${teamName(team)} » est en liste d’attente (${ordinal(rank)}) : elle ne peut être pointée qu’une fois remontée. Remplacez d’abord une équipe absente.`,
        )
      return accept({ type: 'teamCheckedIn', at: ctx.now, teamId: team.id })
    }
    case 'undoCheckIn':
      if (team.checkedInAt === null) return refuse(`« ${teamName(team)} » n’est pas pointée.`)
      return accept({ type: 'teamCheckInUndone', at: ctx.now, teamId: team.id })
    case 'replaceAbsentTeam': {
      if (team.checkedInAt !== null) return refuse(`« ${teamName(team)} » est pointée : elle est présente, on ne la remplace pas.`)
      if (waitlistRank(state, team.id) !== null)
        return refuse(`« ${teamName(team)} » est en liste d’attente : seule une équipe inscrite peut être remplacée.`)
      const statuses = teamStatuses(state)
      const head = state.teams.find((t) => statuses.get(t.id) === 'waitlist')
      if (!head) return refuse(`La liste d’attente est vide : personne pour remplacer « ${teamName(team)} ».`)
      return accept({ type: 'absentTeamReplaced', at: ctx.now, teamId: team.id, replacementId: head.id })
    }
  }
}

export function evolveCheckIn(state: EditionState, event: CheckInEvent): EditionState {
  switch (event.type) {
    case 'teamCheckedIn':
      return { ...state, teams: state.teams.map((t) => (t.id === event.teamId ? { ...t, checkedInAt: event.at } : t)) }
    case 'teamCheckInUndone':
      return { ...state, teams: state.teams.map((t) => (t.id === event.teamId ? { ...t, checkedInAt: null } : t)) }
    case 'absentTeamReplaced':
      // Comme une désinscription : la tête de la liste d'attente remonte d'elle-même.
      return { ...state, teams: state.teams.filter((t) => t.id !== event.teamId) }
  }
}

/** Rang dans la liste d'attente (1 = tête), ou `null` si l'équipe est inscrite. */
function waitlistRank(state: EditionState, teamId: string): number | null {
  const statuses = teamStatuses(state)
  const waitlist = state.teams.filter((t) => statuses.get(t.id) === 'waitlist')
  const index = waitlist.findIndex((t) => t.id === teamId)
  return index < 0 ? null : index + 1
}

const ordinal = (n: number) => (n === 1 ? '1re' : `${n}e`)

/**
 * Refus si un plafond abaissé à `maxTeams` renvoyait une équipe déjà pointée
 * en liste d'attente (elle est présente et a payé).
 */
export function capProblem(state: EditionState, maxTeams: number): string | null {
  const bumped = state.teams.slice(maxTeams).find((t) => t.checkedInAt !== null)
  if (!bumped) return null
  return `Impossible : « ${teamName(bumped)} » est déjà pointée et repasserait en liste d’attente. Dépointez-la ou désinscrivez une autre équipe d’abord.`
}
