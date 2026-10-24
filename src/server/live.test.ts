import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PublicView } from '../engine/index.ts'
import { buildApp } from './app.ts'

// Bout en bout : une saisie de la console arrive en direct à la télé et aux
// téléphones (abonnés publics), sans aucune donnée privée.

const PASSWORD = 'secret-de-test'
let app: FastifyInstance
let dataDir: string
let base: string
let cookie: string

async function api(url: string, body: unknown) {
  const res = await fetch(`http://${base}${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

/** Abonné public : collecte chaque vue poussée par le serveur. */
function subscribePublic(editionId: string, k?: string) {
  const ws = new WebSocket(`ws://${base}/ws`)
  const views: PublicView[] = []
  const raw: string[] = []
  let waiter: (() => void) | null = null
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data))
    if (msg.type === 'hello') ws.send(JSON.stringify({ type: 'subscribe', editionId, ...(k ? { k } : {}) }))
    if (msg.type === 'view') {
      views.push(msg.view)
      raw.push(String(event.data))
      waiter?.()
    }
  }
  /** Attend une vue qui vérifie `test`. */
  const until = (test: (view: PublicView) => boolean) =>
    new Promise<PublicView>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('vue attendue jamais reçue')), 2000)
      const check = () => {
        const found = views.find(test)
        if (found) {
          clearTimeout(timer)
          waiter = null
          resolve(found)
        }
      }
      waiter = check
      check()
    })
  return { ws, raw, until }
}

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'tournoi-palet-live-'))
  app = await buildApp({ dataDir, adminPassword: PASSWORD })
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`
  const login = await fetch(`http://${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  cookie = login.headers.get('set-cookie')!.split(';')[0]
})

afterAll(async () => {
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
})

describe('direct télé et téléphone', () => {
  it('un score saisi en console arrive aux abonnés publics, sans donnée privée', async () => {
    const created = await api('/api/admin/editions', { settings: { name: 'Répétition', date: '2026-12-19', isTest: true } })
    const id = created.body.id as string
    const k = created.body.view.previewToken as string
    const command = (c: object) => api(`/api/admin/editions/${id}/commands`, { command: c })
    const teams = [
      { player1: 'Paul', player2: 'Marie', phone: '0611223344', comment: 'paiera en liquide', player1Licensed: true },
      { player1: 'Jean', player2: 'Luc', phone: '0699887766' },
    ]
    for (const team of teams) await command({ type: 'registerTeam', team })
    for (const teamId of ['t1', 't2']) await command({ type: 'checkInTeam', teamId })
    await command({ type: 'drawPoolRound', round: 1 })

    const tele = subscribePublic(id, k)
    const phone = subscribePublic(id, k)
    const [match] = (await tele.until((v) => v.pool.currentRound === 1)).pool.rounds[0].matches
    expect(match.score).toBeNull()

    const entered = await command({ type: 'enterPoolScore', matchId: match.id, scoreA: 13, scoreB: 9 })
    expect(entered.status).toBe(200)
    for (const client of [tele, phone]) {
      const view = await client.until((v) => v.pool.rounds[0]?.matches[0].score !== null)
      expect(view.pool.rounds[0].matches[0]).toMatchObject({ score: { a: 13, b: 9 }, status: 'done' })
      expect(view.pool.standings[0]).toMatchObject({ team: match.teamA, wins: 1 })
    }

    await command({ type: 'setTvView', view: 'standings' })
    expect((await tele.until((v) => v.tv.view === 'standings')).tv).toEqual({ view: 'standings' })

    for (const message of tele.raw) {
      for (const secret of ['0611223344', '0699887766', 'paiera', 'Licensed', 'phone', 'comment', 'checkedIn', k]) {
        expect(message).not.toContain(secret)
      }
    }
    tele.ws.close()
    phone.ws.close()
  })
})
