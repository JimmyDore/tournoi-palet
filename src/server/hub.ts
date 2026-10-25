import { adminView, publicView, type EditionState } from '../engine/index.ts'

/** Ce dont le hub a besoin d'un socket `ws` (pas de @types/ws installé). */
export interface WebSocket {
  readonly readyState: number
  readonly OPEN: number
  send(data: string): void
  close(): void
}

interface Subscription {
  editionId: string
  admin: boolean
  /**
   * Revérifié à chaque diffusion : l'édition est-elle encore visible pour ce
   * public (repassée en test ?), la session console est-elle encore valide ?
   * Sinon, la raison de la coupure.
   */
  check(state: EditionState): 'not_found' | 'unauthorized' | null
}

/**
 * Abonnements WebSocket. Un socket suit une édition à la fois, en public
 * (`publicView`) ou en console (`adminView`). À chaque commande appliquée,
 * `broadcast` pousse la vue recalculée à chacun, après avoir revérifié son
 * droit de la voir ; un abonné qui l'a perdu reçoit une erreur et est coupé.
 */
export class Hub {
  private readonly subscriptions = new Map<WebSocket, Subscription>()

  subscribe(socket: WebSocket, subscription: Subscription, state: EditionState): void {
    this.subscriptions.set(socket, subscription)
    send(socket, viewMessage(subscription.editionId, subscription.admin, state))
  }

  remove(socket: WebSocket): void {
    this.subscriptions.delete(socket)
  }

  /** Édition supprimée : chaque abonné reçoit « introuvable » et est coupé. */
  drop(editionId: string): void {
    for (const [socket, sub] of this.subscriptions) {
      if (sub.editionId !== editionId) continue
      this.subscriptions.delete(socket)
      send(socket, { type: 'error', editionId, reason: 'not_found' })
      socket.close()
    }
  }

  broadcast(editionId: string, state: EditionState): void {
    let publicMessage: string | undefined
    let adminMessage: string | undefined
    for (const [socket, sub] of this.subscriptions) {
      if (sub.editionId !== editionId) continue
      const lost = sub.check(state)
      if (lost) {
        this.subscriptions.delete(socket)
        send(socket, { type: 'error', editionId, reason: lost })
        socket.close()
      } else if (sub.admin) send(socket, (adminMessage ??= viewMessage(editionId, true, state)))
      else send(socket, (publicMessage ??= viewMessage(editionId, false, state)))
    }
  }
}

/** `serverNow` : l'heure du serveur à l'envoi, pour que chaque écran cale son chrono dessus. */
function viewMessage(editionId: string, admin: boolean, state: EditionState): string {
  return JSON.stringify({ type: 'view', editionId, serverNow: Date.now(), view: admin ? adminView(state) : publicView(state) })
}

export function send(socket: WebSocket, message: string | object): void {
  if (socket.readyState === socket.OPEN) socket.send(typeof message === 'string' ? message : JSON.stringify(message))
}
