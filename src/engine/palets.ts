import type { EditionState } from './state.ts'
import { teamName, teamStatuses } from './teams.ts'
import { accept, refuse, type Ctx, type Decision } from './types.ts'

// Caution des palets (ticket 19) : une équipe sans palets en emprunte un jeu
// contre une caution, rendue avec les palets en fin de journée. Facultatif,
// indépendant du pointage, possible à tout moment. Console seulement.

// --- Commandes -------------------------------------------------------------

export interface LendPalets {
  type: 'lendPalets'
  teamId: string
}

/** Annule un prêt coché par erreur. */
export interface CancelPaletsLoan {
  type: 'cancelPaletsLoan'
  teamId: string
}

export interface ReturnPalets {
  type: 'returnPalets'
  teamId: string
}

/** Annule un rendu noté par erreur. */
export interface CancelPaletsReturn {
  type: 'cancelPaletsReturn'
  teamId: string
}

export type PaletsCommand = LendPalets | CancelPaletsLoan | ReturnPalets | CancelPaletsReturn

// --- Événements ------------------------------------------------------------

export interface PaletsLent {
  type: 'paletsLent'
  at: number
  teamId: string
}

export interface PaletsLoanCancelled {
  type: 'paletsLoanCancelled'
  at: number
  teamId: string
}

export interface PaletsReturned {
  type: 'paletsReturned'
  at: number
  teamId: string
}

export interface PaletsReturnCancelled {
  type: 'paletsReturnCancelled'
  at: number
  teamId: string
}

export type PaletsEvent = PaletsLent | PaletsLoanCancelled | PaletsReturned | PaletsReturnCancelled

// --- État ------------------------------------------------------------------

/** Un jeu prêté ; `returnedAt` : `null` tant qu'il n'est pas rendu. */
export interface PaletsLoan {
  lentAt: number
  returnedAt: number | null
}

/** Prêts en cours ou rendus, par id d'équipe. */
export type PaletsState = Record<string, PaletsLoan>

// --- decide / evolve -------------------------------------------------------

export function decidePalets(state: EditionState, command: PaletsCommand, ctx: Ctx): Decision<PaletsEvent> {
  const team = state.teams.find((t) => t.id === command.teamId)
  if (!team) return refuse("Cette équipe n'est pas inscrite.")
  const name = teamName(team)
  const loan = state.palets[team.id]
  switch (command.type) {
    case 'lendPalets':
      if (teamStatuses(state).get(team.id) === 'waitlist') return refuse(`« ${name} » est en liste d’attente : on ne lui prête pas de palets.`)
      if (loan) return refuse(`« ${name} » a déjà des palets prêtés.`)
      return accept({ type: 'paletsLent', at: ctx.now, teamId: team.id })
    case 'cancelPaletsLoan':
      if (!loan) return refuse(`« ${name} » n’a pas de palets prêtés.`)
      if (loan.returnedAt !== null) return refuse(`« ${name} » a déjà rendu ses palets : annulez d’abord le rendu.`)
      return accept({ type: 'paletsLoanCancelled', at: ctx.now, teamId: team.id })
    case 'returnPalets':
      if (!loan) return refuse(`« ${name} » n’a pas de palets prêtés.`)
      if (loan.returnedAt !== null) return refuse(`« ${name} » a déjà rendu ses palets.`)
      return accept({ type: 'paletsReturned', at: ctx.now, teamId: team.id })
    case 'cancelPaletsReturn':
      if (!loan || loan.returnedAt === null) return refuse(`« ${name} » n’a pas rendu ses palets.`)
      return accept({ type: 'paletsReturnCancelled', at: ctx.now, teamId: team.id })
  }
}

export function evolvePalets(state: EditionState, event: PaletsEvent): EditionState {
  const palets = { ...state.palets }
  switch (event.type) {
    case 'paletsLent':
      palets[event.teamId] = { lentAt: event.at, returnedAt: null }
      break
    case 'paletsLoanCancelled':
      delete palets[event.teamId]
      break
    case 'paletsReturned':
      palets[event.teamId] = { ...palets[event.teamId], returnedAt: event.at }
      break
    case 'paletsReturnCancelled':
      palets[event.teamId] = { ...palets[event.teamId], returnedAt: null }
      break
  }
  return { ...state, palets }
}

// --- Vue -------------------------------------------------------------------

/** Compteur de la console : jeux prêtés, rendus, et encore dehors. */
export interface PaletsView {
  lent: number
  returned: number
  out: number
}

/** Seules comptent les équipes encore dans l'édition. */
export function paletsView(state: EditionState): PaletsView {
  const loans = state.teams.map((t) => state.palets[t.id]).filter((l) => l !== undefined)
  const returned = loans.filter((l) => l.returnedAt !== null).length
  return { lent: loans.length, returned, out: loans.length - returned }
}
