import { settleBrackets } from './brackets.ts'
import { forfeitInPool, isPoolTeam, unforfeitInPool } from './pool.ts'
import type { EditionState } from './state.ts'
import { teamName } from './teams.ts'
import { accept, refuse, type Ctx, type Decision } from './types.ts'

// Forfait d'une équipe : un seul fait, valable en poule comme en tableau.
// En poule, ses matchs sans score sont gagnés 13-0 par l'adversaire et elle
// n'est plus tirée. En tableau, son prochain match pas joué est gagné 13-0 par
// l'adversaire (dès qu'il est connu), et ainsi de suite (Challenge compris) :
// elle est classée à sa place d'élimination, et garde son rang des poules.

export interface Forfeit {
  at: number
  /** Nombre de parties de poule tirées au moment du forfait. */
  afterRound: number
  /** Déclaré une fois les tableaux générés : le classement des poules n'en tient pas compte. */
  inBrackets: boolean
}

// --- Commandes -------------------------------------------------------------

export interface DeclareForfeit {
  type: 'declareForfeit'
  teamId: string
}

/** Annule un forfait déclaré par erreur, tant qu'aucune partie n'a été tirée sans l'équipe. */
export interface CancelForfeit {
  type: 'cancelForfeit'
  teamId: string
}

export type ForfeitCommand = DeclareForfeit | CancelForfeit

// --- Événements ------------------------------------------------------------

export interface ForfeitDeclared {
  type: 'forfeitDeclared'
  at: number
  teamId: string
}

export interface ForfeitCancelled {
  type: 'forfeitCancelled'
  at: number
  teamId: string
}

export type ForfeitEvent = ForfeitDeclared | ForfeitCancelled

// --- decide / evolve -------------------------------------------------------

export function decideForfeit(state: EditionState, command: ForfeitCommand, ctx: Ctx): Decision<ForfeitEvent> {
  const team = state.teams.find((t) => t.id === command.teamId)
  if (!team) return refuse("Cette équipe n'existe pas.")
  const name = `« ${teamName(team)} »`
  const forfeit = state.forfeits[team.id]
  switch (command.type) {
    case 'declareForfeit':
      if (state.pool.rounds.length === 0) return refuse('Le tournoi n’a pas commencé : désinscrivez l’équipe plutôt que de la déclarer forfait.')
      if (!isPoolTeam(state, team.id)) return refuse(`${name} n’a pas été tirée en poule : désinscrivez-la plutôt.`)
      if (forfeit) return refuse(`${name} est déjà déclarée forfait.`)
      return accept({ type: 'forfeitDeclared', at: ctx.now, teamId: team.id })
    case 'cancelForfeit':
      if (!forfeit) return refuse(`${name} n’est pas déclarée forfait.`)
      if (state.pool.rounds.length > forfeit.afterRound) {
        return refuse(`La partie ${forfeit.afterRound + 1} a été tirée sans ${name} : son forfait ne peut plus être annulé.`)
      }
      return accept({ type: 'forfeitCancelled', at: ctx.now, teamId: team.id })
  }
}

export function evolveForfeit(state: EditionState, event: ForfeitEvent): EditionState {
  switch (event.type) {
    case 'forfeitDeclared': {
      const forfeits = { ...state.forfeits, [event.teamId]: { at: event.at, afterRound: state.pool.rounds.length, inBrackets: state.brackets.grids !== null } }
      return settleBrackets(forfeitInPool({ ...state, forfeits }, event.teamId))
    }
    case 'forfeitCancelled': {
      const { [event.teamId]: _cancelled, ...forfeits } = state.forfeits
      return unforfeitInPool({ ...state, forfeits }, event.teamId)
    }
  }
}
