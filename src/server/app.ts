import { existsSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import { checkDatabase, openDatabase } from './db.ts'

export interface AppOptions {
  dataDir: string
  /** Build Vite (dist/) ; absent en test et en dev, où Vite sert le client. */
  staticDir?: string
  logger?: boolean
}

const HEALTH_WS_TIMEOUT_MS = 2000

export async function buildApp({ dataDir, staticDir, logger = false }: AppOptions): Promise<FastifyInstance> {
  const db = openDatabase(dataDir)
  const app = Fastify({ logger })
  app.addHook('onClose', async () => db.close())

  await app.register(fastifyWebsocket)

  app.get('/ws', { websocket: true }, (socket) => {
    socket.send(JSON.stringify({ type: 'hello' }))
  })

  // GET et HEAD (Fastify expose HEAD sur chaque route GET). La sonde WebSocket
  // ouvre une vraie connexion vers le serveur lui-même : elle prouve que
  // l'upgrade fonctionne, pas seulement que le process tourne.
  app.get('/health', async (_req, reply) => {
    const database = safely(() => checkDatabase(db))
    const websocket = await probeWebSocket(app)
    const ok = database && websocket
    reply.code(ok ? 200 : 503).header('cache-control', 'no-store')
    return { status: ok ? 'ok' : 'error', database: database ? 'ok' : 'error', websocket: websocket ? 'ok' : 'error' }
  })

  if (staticDir && existsSync(staticDir)) {
    // Les fichiers de /assets/ sont hashés par Vite : cache permanent. Tout le
    // reste (index.html surtout) est revalidé, sinon les téléphones gardent
    // l'ancien client après un déploiement.
    await app.register(fastifyStatic, {
      root: staticDir,
      cacheControl: false,
      setHeaders(res, filePath) {
        res.header(
          'cache-control',
          path.relative(staticDir, filePath).startsWith(`assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        )
      },
    })
    // Routage côté client : toute page inconnue renvoie l'application.
    app.setNotFoundHandler((req, reply) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not_found' })
      }
      return reply.header('cache-control', 'no-cache').sendFile('index.html')
    })
  }

  return app
}

function safely(check: () => boolean): boolean {
  try {
    return check()
  } catch {
    return false
  }
}

function probeWebSocket(app: FastifyInstance): Promise<boolean> {
  const { port } = app.server.address() as AddressInfo
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    const done = (ok: boolean) => {
      clearTimeout(timer)
      ws.close()
      resolve(ok)
    }
    const timer = setTimeout(() => done(false), HEALTH_WS_TIMEOUT_MS)
    ws.onmessage = (event) => done(isHello(event.data))
    ws.onerror = () => done(false)
  })
}

function isHello(data: unknown): boolean {
  try {
    return JSON.parse(String(data)).type === 'hello'
  } catch {
    return false
  }
}
