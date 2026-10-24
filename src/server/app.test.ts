import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.ts'
import { DB_FILE } from './db.ts'

let app: FastifyInstance
let dataDir: string
let base: string

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'tournoi-palet-'))
  app = await buildApp({ dataDir })
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
})

describe('serveur', () => {
  it('confirme sur /health que la base et le WebSocket répondent', async () => {
    const res = await fetch(`http://${base}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', database: 'ok', websocket: 'ok' })
  })

  it('répond aussi en HEAD sur /health', async () => {
    const res = await fetch(`http://${base}/health`, { method: 'HEAD' })
    expect(res.status).toBe(200)
  })

  it('crée la base SQLite dans le dossier de données', () => {
    expect(existsSync(path.join(dataDir, DB_FILE))).toBe(true)
  })

  it('salue chaque client WebSocket', async () => {
    const ws = new WebSocket(`ws://${base}/ws`)
    const message = await new Promise<string>((resolve, reject) => {
      ws.onmessage = (event) => resolve(String(event.data))
      ws.onerror = () => reject(new Error('WebSocket en erreur'))
    })
    ws.close()
    expect(JSON.parse(message)).toEqual({ type: 'hello' })
  })
})
