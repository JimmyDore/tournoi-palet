import { decideEdition, evolveEdition, type EditionCommand, type EditionEvent } from './edition.ts'
import { decideCheckIn, evolveCheckIn, type CheckInCommand, type CheckInEvent } from './checkin.ts'
import { decidePool, evolvePool, poolLockProblem, type PoolCommand, type PoolEvent } from './pool.ts'
import { decideTeams, evolveTeams, type TeamCommand, type TeamEvent } from './teams.ts'
import { initialState, type EditionState } from './state.ts'
import { refuse, type Ctx, type Decision } from './types.ts'

/**
 * Point d'entrée du moteur. Pour ajouter une fonctionnalité (ex. inscriptions) :
 *   1. un module `src/engine/<feature>.ts` avec ses types de commandes et
 *      d'événements, `decide<Feature>` et `evolve<Feature>` ;
 *   2. ajouter ses unions à `Command` et `Event` ci-dessous ;
 *   3. ajouter ses `case` dans `decide` et `evolve` (le `never` final force
 *      l'exhaustivité au typecheck) ;
 *   4. sa tranche d'état dans `state.ts`, ses vues dans `views.ts`, ses
 *      libellés de journal dans `describe.ts`.
 */
export type Command = EditionCommand | TeamCommand | CheckInCommand | PoolCommand
export type Event = EditionEvent | TeamEvent | CheckInEvent | PoolEvent

export type CommandType = Command['type']
export type EventType = Event['type']

export function decide(state: EditionState, command: Command, ctx: Ctx): Decision<Event> {
  if (!command || typeof command !== 'object') return refuse('Commande illisible.')
  if (command.type !== 'createEdition' && !state.edition) return refuse("Cette édition n'existe pas.")
  const locked = poolLockProblem(state, command)
  if (locked) return refuse(locked)
  switch (command.type) {
    case 'createEdition':
    case 'updateEdition':
      return decideEdition(state, command, ctx)
    case 'registerTeam':
    case 'updateTeam':
    case 'withdrawTeam':
      return decideTeams(state, command, ctx)
    case 'checkInTeam':
    case 'undoCheckIn':
    case 'replaceAbsentTeam':
      return decideCheckIn(state, command, ctx)
    case 'drawPoolRound':
    case 'enterPoolScore':
      return decidePool(state, command, ctx)
    default:
      return refuse(`Commande inconnue : ${String((command as { type?: unknown }).type)}.`)
  }
}

export function evolve(state: EditionState, event: Event): EditionState {
  switch (event.type) {
    case 'editionCreated':
    case 'editionUpdated':
      return evolveEdition(state, event)
    case 'teamRegistered':
    case 'teamUpdated':
    case 'teamWithdrawn':
      return evolveTeams(state, event)
    case 'teamCheckedIn':
    case 'teamCheckInUndone':
    case 'absentTeamReplaced':
      return evolveCheckIn(state, event)
    case 'poolRoundDrawn':
    case 'poolScoreEntered':
      return evolvePool(state, event)
    default: {
      const unknown: never = event
      throw new Error(`Événement inconnu : ${(unknown as { type: string }).type}`)
    }
  }
}

/** Reconstruit l'état d'une édition en rejouant ses événements. */
export function replay(events: readonly Event[], from: EditionState = initialState()): EditionState {
  return events.reduce(evolve, from)
}
