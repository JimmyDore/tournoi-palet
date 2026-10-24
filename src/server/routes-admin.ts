import type { FastifyInstance, FastifyReply } from 'fastify'
import { adminView, type Command, type EditionSettings } from '../engine/index.ts'
import type { Applied } from './editions.ts'
import type { ServerContext } from './context.ts'

const NOT_FOUND = { ok: false, reason: "Cette édition n'existe pas." }

/** Connexion et API de la console. Tout `/api/admin/*` exige une session. */
export function registerAdminRoutes(app: FastifyInstance, ctx: ServerContext): void {
  const { auth, store } = ctx

  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/admin/') && !auth.fromCookieHeader(req.headers.cookie)) {
      return reply.code(401).send({ ok: false, reason: 'Connexion requise.' })
    }
  })

  app.post<{ Body: { password?: unknown } }>('/api/login', async (req, reply) => {
    if (!auth.checkPassword(req.body?.password)) return reply.code(401).send({ ok: false, reason: 'Mot de passe incorrect.' })
    const secure = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https'
    reply.header('set-cookie', auth.setCookie(auth.issue(), secure))
    return { ok: true }
  })

  app.post('/api/logout', async (_req, reply) => {
    reply.header('set-cookie', auth.clearCookie())
    return { ok: true }
  })

  app.get('/api/session', async (req) => ({ admin: auth.fromCookieHeader(req.headers.cookie) }))

  app.get('/api/admin/editions', async () => store.list())

  app.post<{ Body: { settings?: Partial<EditionSettings> } }>('/api/admin/editions', async (req, reply) =>
    answer(reply, ctx.create(req.body?.settings ?? {})),
  )

  app.get<{ Params: { id: string } }>('/api/admin/editions/:id', async (req, reply) => {
    const state = store.get(req.params.id)
    return state ? adminView(state) : reply.code(404).send(NOT_FOUND)
  })

  app.post<{ Params: { id: string }; Body: { command?: Command } }>('/api/admin/editions/:id/commands', async (req, reply) => {
    const command = req.body?.command
    if (!command || typeof command !== 'object') return reply.code(400).send({ ok: false, reason: 'Commande illisible.' })
    return answer(reply, ctx.execute(req.params.id, command))
  })

  app.get<{ Params: { id: string } }>('/api/admin/editions/:id/journal', async (req, reply) => {
    return store.journal(req.params.id) ?? reply.code(404).send(NOT_FOUND)
  })
}

function answer(reply: FastifyReply, result: Applied) {
  if (!result.ok) return reply.code(result.notFound ? 404 : 400).send({ ok: false, reason: result.reason })
  return { ok: true, id: result.editionId, view: adminView(result.state) }
}
