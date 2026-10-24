import { adminView, publicView, type EditionState } from '../engine/index.ts'

/** Ce dont le hub a besoin d'un socket `ws` (pas de @types/ws installé). */
export interface WebSocket {
  readonly readyState: number
  readonly OPEN: number
  send(data: string): void
}

interface Subscription {
  editionId: string
  admin: boolean
}

/**
 * Abonnements WebSocket. Un socket suit une édition à la fois, en public
 * (`publicView`) ou en console (`adminView`). À chaque commande appliquée,
 * `broadcast` pousse la vue recalculée à chacun.
 */
export class Hub {
  private readonly subscriptions = new Map<WebSocket, Subscription>()

  subscribe(socket: WebSocket, editionId: string, admin: boolean, state: EditionState): void {
    this.subscriptions.set(socket, { editionId, admin })
    send(socket, viewMessage(editionId, admin, state))
  }

  remove(socket: WebSocket): void {
    this.subscriptions.delete(socket)
  }

  broadcast(editionId: string, state: EditionState): void {
    let publicMessage: string | undefined
    let adminMessage: string | undefined
    for (const [socket, sub] of this.subscriptions) {
      if (sub.editionId !== editionId) continue
      if (sub.admin) send(socket, (adminMessage ??= viewMessage(editionId, true, state)))
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
