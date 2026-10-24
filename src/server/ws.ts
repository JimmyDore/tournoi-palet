import type { FastifyInstance } from 'fastify'
import { publiclyVisible, type ServerContext } from './context.ts'
import { send } from './hub.ts'

/**
 * WebSocket `/ws`. Protocole :
 *   serveur → `{type:'hello'}` à la connexion (la sonde /health en dépend) ;
 *   client  → `{type:'subscribe', editionId, k?}` (public) ou
 *             `{type:'subscribe-admin', editionId}` (session vérifiée à l'upgrade) ;
 *   serveur → `{type:'view', editionId, serverNow, view}` à l'abonnement puis après chaque
 *             commande appliquée, ou `{type:'error', reason}` ; `serverNow`
 *             (ms) sert à caler le chrono des écrans sur l'heure du serveur.
 */
export function registerWebSocket(app: FastifyInstance, { store, hub, auth }: ServerContext): void {
  app.get('/ws', { websocket: true }, (socket, req) => {
    const admin = auth.fromCookieHeader(req.headers.cookie)
    send(socket, { type: 'hello' })

    socket.on('message', (raw: Buffer) => {
      let msg: { type?: unknown; editionId?: unknown; k?: unknown }
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      const editionId = typeof msg.editionId === 'string' ? msg.editionId : ''
      const state = store.get(editionId)
      if (msg.type === 'subscribe') {
        if (!publiclyVisible(state, msg.k)) return send(socket, { type: 'error', editionId, reason: 'not_found' })
        hub.subscribe(socket, editionId, false, state)
      } else if (msg.type === 'subscribe-admin') {
        if (!admin) return send(socket, { type: 'error', editionId, reason: 'unauthorized' })
        if (!state?.edition) return send(socket, { type: 'error', editionId, reason: 'not_found' })
        hub.subscribe(socket, editionId, true, state)
      }
    })
    socket.on('close', () => hub.remove(socket))
  })
}
