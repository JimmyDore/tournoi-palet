import type { Rng } from './rng.ts'

/** Ce que le serveur fournit à `decide` : le hasard et l'heure (ms epoch). */
export interface Ctx {
  rng: Rng
  now: number
}

/** Résultat de `decide` : des événements à persister, ou un refus lisible. */
export type Decision<E> = { ok: true; events: E[] } | { ok: false; reason: string }

export function accept<E>(...events: E[]): Decision<E> {
  return { ok: true, events }
}

/** `reason` est en français et affichée telle quelle par la console. */
export function refuse(reason: string): { ok: false; reason: string } {
  return { ok: false, reason }
}

/** Une équipe telle que les vues la montrent : son id et son nom affiché. */
export interface TeamRef {
  id: string
  name: string
}

/** L'équipe joue-t-elle ce match (poule ou tableau, côté inconnu = `null`) ? */
export function playsIn(match: { teamA: TeamRef | null; teamB: TeamRef | null }, teamId: string | null): boolean {
  return teamId !== null && (match.teamA?.id === teamId || match.teamB?.id === teamId)
}

/** Tout événement porte son type et son horodatage serveur (`ctx.now`). */
export interface BaseEvent {
  type: string
  at: number
}
