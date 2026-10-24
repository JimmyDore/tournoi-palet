import type { EditionState } from './state.ts'
import { accept, refuse, type Ctx, type Decision } from './types.ts'

// Chrono d'une partie ou d'un tour : un compte à rebours indicatif. L'heure de
// départ est celle du serveur (`ctx.now`), écrite dans l'événement ; chaque
// écran calcule le temps restant avec `clockReading`. Il ne bloque rien.

/** Chrono tel que l'affichent télé et téléphones. `null` : jamais lancé. */
export interface ClockState {
  startedAt: number
  durationMs: number
  /** Heure de l'arrêt, sinon `null` (il tourne). */
  stoppedAt: number | null
}

const MINUTE = 60_000
/** Sous ce temps restant, le chrono passe en alerte. */
export const CLOCK_ALERT_MS = 5 * MINUTE

// --- Commandes / événements ------------------------------------------------

/** Lance le chrono, ou le relance de zéro s'il tourne déjà ou a été arrêté. */
export interface StartClock {
  type: 'startClock'
  /** Par défaut : la durée d'une partie réglée dans l'édition. */
  durationMin?: number
}

export interface StopClock {
  type: 'stopClock'
}

export type ClockCommand = StartClock | StopClock

export interface ClockStarted {
  type: 'clockStarted'
  at: number
  durationMs: number
}

export interface ClockStopped {
  type: 'clockStopped'
  at: number
}

export type ClockEvent = ClockStarted | ClockStopped

export function decideClock(state: EditionState, command: ClockCommand, ctx: Ctx): Decision<ClockEvent> {
  switch (command.type) {
    case 'startClock': {
      const minutes = command.durationMin ?? state.edition!.settings.gameMinutes
      if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
        return refuse('La durée du chrono doit être un nombre de minutes entre 1 et 180.')
      }
      return accept({ type: 'clockStarted', at: ctx.now, durationMs: minutes * MINUTE })
    }
    case 'stopClock':
      if (!state.clock || state.clock.stoppedAt !== null) return refuse('Le chrono n’est pas lancé.')
      return accept({ type: 'clockStopped', at: ctx.now })
  }
}

export function evolveClock(state: EditionState, event: ClockEvent): EditionState {
  switch (event.type) {
    case 'clockStarted':
      return { ...state, clock: { startedAt: event.at, durationMs: event.durationMs, stoppedAt: null } }
    case 'clockStopped':
      return state.clock ? { ...state, clock: { ...state.clock, stoppedAt: event.at } } : state
  }
}

// --- Lecture ---------------------------------------------------------------

/** `alert` : 5 dernières minutes ; `overtime` : au-delà de zéro. */
export type ClockTone = 'running' | 'alert' | 'overtime'

export interface ClockReading {
  /** « 12:34 », ou « +2:13 » en dépassement. */
  text: string
  state: ClockTone
  /** `false` une fois arrêté (l'affichage est figé). */
  running: boolean
}

/** Ce qu'affiche le chrono à l'heure `now` (heure du serveur, en ms). */
export function clockReading(clock: ClockState, now: number): ClockReading {
  const at = clock.stoppedAt ?? now
  const remaining = Math.min(clock.durationMs, clock.durationMs - (at - clock.startedAt))
  const running = clock.stoppedAt === null
  if (remaining < 0) {
    return { text: `+${minSec(Math.floor(-remaining / 1000))}`, state: 'overtime', running }
  }
  return { text: minSec(Math.ceil(remaining / 1000)), state: remaining <= CLOCK_ALERT_MS ? 'alert' : 'running', running }
}

function minSec(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function clockLabel(event: ClockEvent, before: EditionState): string {
  if (event.type === 'clockStopped') return 'Chrono arrêté'
  return `Chrono ${before.clock ? 'relancé' : 'lancé'} : ${event.durationMs / MINUTE} min`
}
