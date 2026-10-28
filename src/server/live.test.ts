import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
  const serverNows: number[] = []
  let waiter: (() => void) | null = null
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data))
    if (msg.type === 'hello') ws.send(JSON.stringify({ type: 'subscribe', editionId, ...(k ? { k } : {}) }))
    if (msg.type === 'view') {
      views.push(msg.view)
      serverNows.push(msg.serverNow)
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
  return { ws, raw, serverNows, until }
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
    expect((await tele.until((v) => v.tv.view === 'standings')).tv).toEqual({ view: 'standings', hidden: [], skips: 0 })

    for (const message of tele.raw) {
      for (const secret of ['0611223344', '0699887766', 'paiera', 'Licensed', 'phone', 'comment', 'checkedIn', k]) {
        expect(message).not.toContain(secret)
      }
    }
    tele.ws.close()
    phone.ws.close()
  })

  it('le chrono part à l’heure du serveur, que chaque écran reçoit pour se caler', async () => {
    const created = await api('/api/admin/editions', { settings: { name: 'Chrono', date: '2026-12-19', gameMinutes: 25 } })
    const id = created.body.id as string
    const tele = subscribePublic(id)
    await tele.until((v) => v.clock === null)
    const before = Date.now()
    const started = await api(`/api/admin/editions/${id}/commands`, { command: { type: 'startClock' } })
    expect(started.status).toBe(200)
    const view = await tele.until((v) => v.clock !== null)
    expect(view.clock).toMatchObject({ durationMs: 25 * 60_000, stoppedAt: null })
    expect(view.clock!.startedAt).toBeGreaterThanOrEqual(before)
    expect(view.clock!.startedAt).toBeLessThanOrEqual(Date.now())
    const serverNow = tele.serverNows.at(-1)!
    expect(serverNow).toBeGreaterThanOrEqual(view.clock!.startedAt)
    expect(serverNow).toBeLessThanOrEqual(Date.now())
    tele.ws.close()
  })
})

/** Socket quelconque : collecte tous les messages (vues et erreurs) et sa fermeture. */
function listen(message: object, withCookie?: string) {
  const ws = new WebSocket(`ws://${base}/ws`, withCookie ? ({ headers: { cookie: withCookie } } as never) : undefined)
  const messages: { type: string; reason?: string; view?: PublicView }[] = []
  let closed = false
  let waiter: (() => void) | null = null
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data))
    if (msg.type === 'hello') ws.send(JSON.stringify(message))
    else messages.push(msg)
    waiter?.()
  }
  ws.onclose = () => {
    closed = true
    waiter?.()
  }
  const until = (test: () => boolean, what: string) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`jamais : ${what}`)), 2000)
      const check = () => {
        if (test()) {
          clearTimeout(timer)
          waiter = null
          resolve()
        }
      }
      waiter = check
      check()
    })
  return { ws, messages, until, isClosed: () => closed }
}

describe('visibilité et session vérifiées à chaque diffusion', () => {
  it('une édition repassée en test ne parle plus aux abonnés publics sans jeton', async () => {
    const created = await api('/api/admin/editions', { settings: { name: 'Bientôt cachée', date: '2026-12-19' } })
    const id = created.body.id as string
    const k = created.body.view.previewToken as string
    const command = (c: object) => api(`/api/admin/editions/${id}/commands`, { command: c })
    const anonymous = listen({ type: 'subscribe', editionId: id })
    const withToken = listen({ type: 'subscribe', editionId: id, k })
    await anonymous.until(() => anonymous.messages.some((m) => m.type === 'view'), 'première vue')
    await withToken.until(() => withToken.messages.some((m) => m.type === 'view'), 'première vue')

    expect((await command({ type: 'updateEdition', changes: { isTest: true } })).status).toBe(200)
    await command({ type: 'registerTeam', team: { player1: 'Paul', player2: 'Marie' } })
    await withToken.until(() => withToken.messages.some((m) => m.view?.teams.length === 1), 'vue avec l’équipe')

    const views = anonymous.messages.filter((m) => m.type === 'view')
    expect(views).toHaveLength(1)
    expect(views[0].view!.isTest).toBe(false)
    expect(anonymous.messages.at(-1)).toMatchObject({ type: 'error', reason: 'not_found' })
    anonymous.ws.close()
    withToken.ws.close()
  })

  it('une console dont la session a expiré est coupée à la diffusion suivante', async () => {
    const created = await api('/api/admin/editions', { settings: { name: 'Session', date: '2026-12-19' } })
    const id = created.body.id as string
    const consoleSocket = listen({ type: 'subscribe-admin', editionId: id }, cookie)
    await consoleSocket.until(() => consoleSocket.messages.some((m) => m.type === 'view'), 'vue console')

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 31 * 24 * 3600 * 1000)
      const login = await fetch(`http://${base}/api/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: PASSWORD }),
      })
      const fresh = login.headers.get('set-cookie')!.split(';')[0]
      const res = await fetch(`http://${base}/api/admin/editions/${id}/commands`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: fresh },
        body: JSON.stringify({ command: { type: 'registerTeam', team: { player1: 'Paul', player2: 'Marie' } } }),
      })
      expect(res.status).toBe(200)
      await consoleSocket.until(() => consoleSocket.isClosed(), 'socket fermé')
    } finally {
      vi.useRealTimers()
    }
    expect(consoleSocket.messages.filter((m) => m.type === 'view')).toHaveLength(1)
    expect(consoleSocket.messages.at(-1)).toMatchObject({ type: 'error', reason: 'unauthorized' })
  })

  it('une édition de test supprimée coupe la console et la télé abonnées', async () => {
    const created = await api('/api/admin/editions', { settings: { name: 'À supprimer', date: '2026-12-19', isTest: true } })
    const id = created.body.id as string
    const tv = listen({ type: 'subscribe', editionId: id, k: created.body.view.previewToken })
    const consoleSocket = listen({ type: 'subscribe-admin', editionId: id }, cookie)
    await tv.until(() => tv.messages.some((m) => m.type === 'view'), 'première vue')
    await consoleSocket.until(() => consoleSocket.messages.some((m) => m.type === 'view'), 'première vue')

    expect((await api(`/api/admin/editions/${id}/delete`, {})).status).toBe(200)
    for (const socket of [tv, consoleSocket]) {
      await socket.until(socket.isClosed, 'coupé')
      expect(socket.messages.at(-1)).toMatchObject({ type: 'error', reason: 'not_found' })
    }
  })
})
