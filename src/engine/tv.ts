import { BRACKET_NAMES, type BracketKey } from './brackets.ts'
import type { EditionState } from './state.ts'
import { accept, refuse, type Ctx, type Decision } from './types.ts'
import type { PublicView } from './views.ts'

// Télé : la console peut la bloquer sur une vue, sinon elle tourne seule.
// Pour ajouter une vue, une entrée dans `TV_VIEWS` (et dans `tvRotation` si
// elle tourne seule) et son écran dans `src/client/tele/screens.tsx`.

export const TV_VIEWS = [
  { key: 'matches', label: 'Matchs en cours' },
  { key: 'standings', label: 'Classement des poules' },
  { key: 'bracket-P', label: `Tableau ${BRACKET_NAMES.P}` },
  { key: 'bracket-CP', label: BRACKET_NAMES.CP },
  { key: 'bracket-C', label: BRACKET_NAMES.C },
  { key: 'bracket-CC', label: BRACKET_NAMES.CC },
  { key: 'ranking', label: 'Classement final' },
] as const

export type TvScreen = (typeof TV_VIEWS)[number]['key']
/** `auto` : rotation entre toutes les vues qui ont quelque chose à montrer. */
export type TvViewChoice = 'auto' | TvScreen

/** Vue télé d'un tableau. */
export const bracketScreen = (key: BracketKey) => `bracket-${key}` as const satisfies TvScreen

/**
 * Vues qui défilent : la vue bloquée seule, sinon celles qui comptent à ce
 * moment du tournoi. Poules : matchs et classement des poules. Tableaux :
 * matchs en cours, classement des poules (US 52), tableaux formés,
 * classement provisoire. Après les
 * finales : classement final, puis les tableaux. Rien avant le tirage.
 */
export function tvRotation(view: PublicView): TvScreen[] {
  if (view.tv.view !== 'auto') return [view.tv.view]
  if (view.pool.rounds.length === 0) return []
  const { brackets } = view
  if (!brackets.generated) return ['matches', 'standings']
  const trees = brackets.brackets.map((b) => bracketScreen(b.key))
  if (view.phase === 'after') return ['ranking', ...trees]
  return [...(brackets.live.length > 0 ? (['matches'] as const) : []), 'standings', ...trees, 'ranking']
}

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
