import { bracketLockProblem, decideBrackets, evolveBrackets, settleBrackets, type BracketCommand, type BracketEvent } from './brackets.ts'
import { decideEdition, evolveEdition, type EditionCommand, type EditionEvent } from './edition.ts'
import { decideCheckIn, evolveCheckIn, type CheckInCommand, type CheckInEvent } from './checkin.ts'
import { decideForfeit, evolveForfeit, type ForfeitCommand, type ForfeitEvent } from './forfeit.ts'
import { decidePool, evolvePool, poolLockProblem, type PoolCommand, type PoolEvent } from './pool.ts'
import { decideRehearsal, type RehearsalCommand } from './rehearsal.ts'
import { decideTeams, evolveTeams, type TeamCommand, type TeamEvent } from './teams.ts'
import { decideClock, evolveClock, type ClockCommand, type ClockEvent } from './clock.ts'
import { decidePrizes, evolvePrizes, type PrizeCommand, type PrizeEvent } from './prizes.ts'
import { decideTv, evolveTv, type TvCommand, type TvEvent } from './tv.ts'
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
export type Command = EditionCommand | TeamCommand | CheckInCommand | PoolCommand | ForfeitCommand | BracketCommand | TvCommand | RehearsalCommand | ClockCommand | PrizeCommand
export type Event = EditionEvent | TeamEvent | CheckInEvent | PoolEvent | ForfeitEvent | BracketEvent | TvEvent | ClockEvent | PrizeEvent

export type CommandType = Command['type']
export type EventType = Event['type']

export function decide(state: EditionState, command: Command, ctx: Ctx): Decision<Event> {
  if (!command || typeof command !== 'object') return refuse('Commande illisible.')
  if (command.type !== 'createEdition' && !state.edition) return refuse("Cette édition n'existe pas.")
  const locked = poolLockProblem(state, command) ?? bracketLockProblem(state, command)
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
    case 'removePoolRound':
      return decidePool(state, command, ctx)
    case 'declareForfeit':
    case 'cancelForfeit':
      return decideForfeit(state, command, ctx)
    case 'validateSplit':
    case 'generateBrackets':
    case 'enterBracketScore':
    case 'launchReadyMatches':
      return decideBrackets(state, command, ctx)
    case 'setTvView':
      return decideTv(state, command, ctx)
    case 'startClock':
    case 'stopClock':
      return decideClock(state, command, ctx)
    case 'setPrizes':
      return decidePrizes(state, command, ctx)
    case 'generateFakeTeams':
    case 'fillRandomScores':
      // Produit des événements ordinaires : rien à ajouter dans `evolve`.
      return decideRehearsal(state, command, ctx, { decide, evolve })
    default: {
      // Une commande de l'union sans `case` casse le typecheck ; une commande
      // inconnue venue du réseau est refusée.
      const unknown: never = command
      return refuse(`Commande inconnue : ${String((unknown as { type?: unknown }).type)}.`)
    }
  }
}

export function evolve(state: EditionState, event: Event): EditionState {
  switch (event.type) {
    case 'editionCreated':
      return evolveEdition(state, event)
    case 'editionUpdated': {
      // Passer au fil de l'eau lance aussitôt les matchs prêts.
      const updated = evolveEdition(state, event)
      return event.changes.bracketPace ? settleBrackets(updated) : updated
    }
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
    case 'poolRoundRemoved':
      return evolvePool(state, event)
    case 'forfeitDeclared':
    case 'forfeitCancelled':
      return evolveForfeit(state, event)
    case 'splitValidated':
    case 'bracketsGenerated':
    case 'bracketScoreEntered':
    case 'readyMatchesLaunched':
      return evolveBrackets(state, event)
    case 'tvViewSet':
      return evolveTv(state, event)
    case 'clockStarted':
    case 'clockStopped':
      return evolveClock(state, event)
    case 'prizesSet':
      return evolvePrizes(state, event)
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
