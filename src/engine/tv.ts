import type { EditionState } from './state.ts'
import { accept, refuse, type Ctx, type Decision } from './types.ts'

// Télé : la console peut la bloquer sur une vue, sinon elle tourne seule.
// Pour ajouter une vue (tableaux, classement final : ticket 15), une entrée
// dans `TV_VIEWS` et son écran dans `src/client/tele/screens.tsx`.

export const TV_VIEWS = [
  { key: 'matches', label: 'Matchs en cours' },
  { key: 'standings', label: 'Classement des poules' },
] as const

export type TvScreen = (typeof TV_VIEWS)[number]['key']
/** `auto` : rotation entre toutes les vues qui ont quelque chose à montrer. */
export type TvViewChoice = 'auto' | TvScreen

export interface TvState {
  view: TvViewChoice
}

export const initialTv = (): TvState => ({ view: 'auto' })

export function tvViewLabel(view: TvViewChoice): string {
  return TV_VIEWS.find((v) => v.key === view)?.label ?? 'Rotation automatique'
}

// --- Commandes / événements ------------------------------------------------

export interface SetTvView {
  type: 'setTvView'
  view: TvViewChoice
}

export type TvCommand = SetTvView

export interface TvViewSet {
  type: 'tvViewSet'
  at: number
  view: TvViewChoice
}

export type TvEvent = TvViewSet

const isTvView = (view: unknown): view is TvViewChoice => view === 'auto' || TV_VIEWS.some((v) => v.key === view)

export function decideTv(state: EditionState, command: TvCommand, ctx: Ctx): Decision<TvEvent> {
  if (!isTvView(command.view)) return refuse('Cette vue de télé n’existe pas.')
  if (state.tv.view === command.view) return accept()
  return accept({ type: 'tvViewSet', at: ctx.now, view: command.view })
}

export function evolveTv(state: EditionState, event: TvEvent): EditionState {
  return { ...state, tv: { view: event.view } }
}
