import type { FastifyInstance } from 'fastify'
import { currentEdition, publicView } from '../engine/index.ts'
import { publiclyVisible, type ServerContext } from './context.ts'

const NOT_FOUND = { error: 'not_found' }

/** Lecture publique : uniquement des `publicView`, jamais d'édition de test sans son jeton. */
export function registerPublicRoutes(app: FastifyInstance, { store }: ServerContext): void {
  app.get('/api/public/current', async (_req, reply) => {
    const current = currentEdition(store.list())
    const state = current && store.get(current.id)
    return state ? publicView(state) : reply.code(404).send(NOT_FOUND)
  })

  /** Éditions publiques (palmarès), la plus récente en tête. */
  app.get('/api/public/editions', async () =>
    store.list().filter((e) => !e.isTest).map(({ id, name, date, phase }) => ({ id, name, date, phase })),
  )

  app.get<{ Params: { id: string }; Querystring: { k?: string } }>('/api/public/editions/:id', async (req, reply) => {
    const state = store.get(req.params.id)
    return publiclyVisible(state, req.query.k) ? publicView(state) : reply.code(404).send(NOT_FOUND)
  })
}
