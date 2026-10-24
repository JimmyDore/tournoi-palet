import type { FastifyInstance } from 'fastify'
import { currentEdition, palmares, publicView } from '../engine/index.ts'
import { publiclyVisible, type ServerContext } from './context.ts'

const NOT_FOUND = { error: 'not_found' }

/** Lecture publique : uniquement des `publicView`, jamais d'édition de test sans son jeton. */
export function registerPublicRoutes(app: FastifyInstance, { store }: ServerContext): void {
  app.get('/api/public/current', async (_req, reply) => {
    const current = currentEdition(store.list())
    const state = current && store.get(current.id)
    return state ? publicView(state) : reply.code(404).send(NOT_FOUND)
  })

  /** Palmarès : éditions terminées, la plus récente en tête, jamais une édition de test (jeton ou pas). */
  app.get('/api/public/editions', async () => palmares(store.list()).map(({ id, name, date, winner }) => ({ id, name, date, winner })))

  app.get<{ Params: { id: string }; Querystring: { k?: string } }>('/api/public/editions/:id', async (req, reply) => {
    const state = store.get(req.params.id)
    return publiclyVisible(state, req.query.k) ? publicView(state) : reply.code(404).send(NOT_FOUND)
  })
}
