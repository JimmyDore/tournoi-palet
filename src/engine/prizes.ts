import { participants } from './checkin.ts'
import { MAX_TEAMS_LIMIT } from './settings.ts'
import type { EditionState } from './state.ts'
import { teamStatuses } from './teams.ts'
import { accept, refuse, type Ctx, type Decision } from './types.ts'

// Lots : des tranches de places (« 1 », « 3-4 », « 17-48 ») associées à un
// lot. La liste entière est remplacée à chaque saisie, à tout moment (même
// tournoi terminé). Le lot d'une équipe est une lecture de sa place finale.

/** Une tranche de places, bornes comprises. */
export interface PrizeRange {
  from: number
  to: number
  label: string
}

export const MAX_PRIZE_LABEL = 80

// --- Commandes / événements ------------------------------------------------

export interface SetPrizes {
  type: 'setPrizes'
  /** `range` : « 1 » ou « 5-16 ». Remplace toutes les tranches. */
  prizes: { range: string; label: string }[]
}

export type PrizeCommand = SetPrizes

export interface PrizesSet {
  type: 'prizesSet'
  at: number
  /** Triées par place. */
  prizes: PrizeRange[]
}

export type PrizeEvent = PrizesSet

/** « 5-16 » pour 5 à 16, « 1 » pour une seule place. */
export const formatRange = (r: { from: number; to: number }) => (r.from === r.to ? `${r.from}` : `${r.from}-${r.to}`)

const RANGE_RE = /^(\d+)(?:\s*[-–—à]\s*(\d+))?$/

function parseRange(text: string): { from: number; to: number } | null {
  const match = RANGE_RE.exec(text.trim())
  if (!match) return null
  const from = Number(match[1])
  const to = match[2] === undefined ? from : Number(match[2])
  return { from, to }
}

export function decidePrizes(state: EditionState, command: PrizeCommand, ctx: Ctx): Decision<PrizeEvent> {
  if (!Array.isArray(command.prizes)) return refuse('Liste de lots illisible.')
  const prizes: PrizeRange[] = []
  for (const entry of command.prizes) {
    const text = typeof entry?.range === 'string' ? entry.range.trim() : ''
    const label = typeof entry?.label === 'string' ? entry.label.trim() : ''
    if (!text) return refuse(`Le lot « ${label || '?'} » n’a pas de places (ex. « 1 » ou « 5-16 »).`)
    const range = parseRange(text)
    if (!range) return refuse(`« ${text} » n’est pas une tranche de places lisible (ex. « 1 » ou « 5-16 »).`)
    if (range.from < 1) return refuse(`« ${text} » : les places commencent à 1.`)
    if (range.to < range.from) return refuse(`« ${text} » : la première place doit être avant la dernière.`)
    if (range.to > MAX_TEAMS_LIMIT) return refuse(`« ${text} » : il n’y a pas plus de ${MAX_TEAMS_LIMIT} places.`)
    if (!label) return refuse(`La tranche « ${formatRange(range)} » n’a pas de lot.`)
    if (label.length > MAX_PRIZE_LABEL) return refuse(`Le lot de la tranche « ${formatRange(range)} » dépasse ${MAX_PRIZE_LABEL} caractères.`)
    prizes.push({ ...range, label })
  }
  prizes.sort((a, b) => a.from - b.from)
  for (let i = 1; i < prizes.length; i++) {
    const [a, b] = [prizes[i - 1], prizes[i]]
    if (b.from <= a.to) {
      const shared = b.from === Math.min(a.to, b.to) ? `la place ${b.from}` : `les places ${formatRange({ from: b.from, to: Math.min(a.to, b.to) })}`
      return refuse(`Les tranches « ${formatRange(a)} » et « ${formatRange(b)} » se chevauchent (${shared}).`)
    }
  }
  if (samePrizes(state.prizes, prizes)) return accept()
  return accept({ type: 'prizesSet', at: ctx.now, prizes })
}

function samePrizes(a: PrizeRange[], b: PrizeRange[]): boolean {
  return a.length === b.length && a.every((p, i) => p.from === b[i].from && p.to === b[i].to && p.label === b[i].label)
}

export function evolvePrizes(state: EditionState, event: PrizeEvent): EditionState {
  return { ...state, prizes: event.prizes }
}

// --- Vues ------------------------------------------------------------------

/** Lot d'une place, `null` si aucune tranche ne la couvre. */
export function prizeOf(prizes: readonly PrizeRange[], place: number): string | null {
  return prizes.find((p) => p.from <= place && place <= p.to)?.label ?? null
}

export interface PrizesView {
  /** Triées par place ; `range` : « 1 », « 5-16 ». */
  ranges: (PrizeRange & { range: string })[]
  /** Nombre de places à couvrir : équipes du classement final, sinon pointées, sinon inscrites. */
  places: number
  /** Places de 1 à `places` sans lot, en tranches (« 2 », « 17-48 »). Ne bloque rien. */
  uncovered: string[]
}

/** Nombre de places du classement final : connu une fois le tournoi lancé, estimé avant. */
function placeCount(state: EditionState): number {
  const drawn = state.pool.rounds.length > 0
  if (drawn || participants(state).length > 0) return participants(state).length
  const statuses = teamStatuses(state)
  return state.teams.filter((t) => statuses.get(t.id) === 'registered').length
}

export function prizesView(state: EditionState): PrizesView {
  const places = placeCount(state)
  const uncovered: string[] = []
  let start: number | null = null
  for (let place = 1; place <= places + 1; place++) {
    const free = place <= places && prizeOf(state.prizes, place) === null
    if (free && start === null) start = place
    if (!free && start !== null) {
      uncovered.push(formatRange({ from: start, to: place - 1 }))
      start = null
    }
  }
  return { ranges: state.prizes.map((p) => ({ range: formatRange(p), ...p })), places, uncovered }
}
