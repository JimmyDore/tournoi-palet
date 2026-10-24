import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.ts'

const PASSWORD = 'secret-de-test'
let app: FastifyInstance
let dataDir: string
let base: string

async function start() {
  app = await buildApp({ dataDir, adminPassword: PASSWORD })
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`
}

async function login(): Promise<string> {
  const res = await fetch(`http://${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  expect(res.status).toBe(200)
  return res.headers.get('set-cookie')!.split(';')[0]
}

async function api(method: string, url: string, cookie?: string, body?: unknown) {
  const res = await fetch(`http://${base}${url}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

/** Ouvre un WebSocket, envoie `subscribe` et collecte les messages `view`. */
function subscribe(message: object, cookie?: string) {
  const ws = new WebSocket(`ws://${base}/ws`, cookie ? { headers: { cookie } } as never : undefined)
  const views: unknown[] = []
  const waiters: (() => void)[] = []
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data))
    if (msg.type === 'hello') ws.send(JSON.stringify(message))
    if (msg.type === 'view') {
      views.push(msg.view)
      waiters.splice(0).forEach((w) => w())
    }
  }
  const nextView = (count: number) =>
    new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('pas de vue reçue')), 2000)
      const check = () => (views.length >= count ? (clearTimeout(timer), resolve(views[count - 1])) : waiters.push(check))
      check()
    })
  return { ws, nextView }
}

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'tournoi-palet-'))
  await start()
})

afterAll(async () => {
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
})

describe('console', () => {
  it('est inaccessible sans mot de passe', async () => {
    expect((await api('GET', '/api/admin/editions')).status).toBe(401)
    expect((await api('POST', '/api/admin/editions', undefined, { settings: { name: 'X', date: '2026-12-19' } })).status).toBe(401)
    expect((await api('POST', '/api/login', undefined, { password: 'mauvais' })).status).toBe(401)
    expect((await api('GET', '/api/admin/editions', 'session=faux.cookie')).status).toBe(401)
  })

  it('crée et modifie une édition, intacte après un redémarrage', async () => {
    const cookie = await login()
    const created = await api('POST', '/api/admin/editions', cookie, { settings: { name: 'Concours 2026', date: '2026-12-19' } })
    expect(created.status).toBe(200)
    const id = created.body.id as string

    const updated = await api('POST', `/api/admin/editions/${id}/commands`, cookie, {
      command: { type: 'updateEdition', changes: { boards: 20 } },
    })
    expect(updated.body).toMatchObject({ ok: true, view: { settings: { boards: 20 } } })

    await app.close()
    await start()

    const after = await api('GET', `/api/admin/editions/${id}`, cookie)
    expect(after.body.settings).toMatchObject({ name: 'Concours 2026', boards: 20 })
    const journal = await api('GET', `/api/admin/editions/${id}/journal`, cookie)
    expect(journal.body.map((l: { label: string }) => l.label)).toEqual(['Édition « Concours 2026 » créée', 'Réglages modifiés'])
  })

  it('renvoie le refus du moteur tel quel', async () => {
    const cookie = await login()
    const { body } = await api('POST', '/api/admin/editions', cookie, { settings: { name: 'R', date: '2026-12-01' } })
    const refused = await api('POST', `/api/admin/editions/${body.id}/commands`, cookie, {
      command: { type: 'updateEdition', changes: { maxTeams: 99 } },
    })
    expect(refused).toEqual({ status: 400, body: { ok: false, reason: "Le plafond d'équipes ne peut pas dépasser 64." } })
  })

  it('pousse la nouvelle vue aux abonnés WebSocket après une commande', async () => {
    const cookie = await login()
    const { body } = await api('POST', '/api/admin/editions', cookie, { settings: { name: 'Direct', date: '2026-12-02' } })
    const pub = subscribe({ type: 'subscribe', editionId: body.id })
    const admin = subscribe({ type: 'subscribe-admin', editionId: body.id }, cookie)
    expect(await pub.nextView(1)).toMatchObject({ name: 'Direct' })
    expect(await admin.nextView(1)).toMatchObject({ settings: { name: 'Direct' } })

    await api('POST', `/api/admin/editions/${body.id}/commands`, cookie, { command: { type: 'updateEdition', changes: { venue: 'Gymnase' } } })
    expect(await pub.nextView(2)).toMatchObject({ venue: 'Gymnase' })
    expect(await admin.nextView(2)).toMatchObject({ settings: { venue: 'Gymnase' } })
    pub.ws.close()
    admin.ws.close()
  })
})

describe('public', () => {
  it('montre l’édition en cours, jamais une édition de test sans son lien secret', async () => {
    const cookie = await login()
    const real = await api('POST', '/api/admin/editions', cookie, { settings: { name: 'Vraie', date: '2030-12-01' } })
    const test = await api('POST', '/api/admin/editions', cookie, { settings: { name: 'Répétition', date: '2031-01-01', isTest: true } })
    const token = test.body.view.previewToken as string

    const current = await api('GET', '/api/public/current')
    expect(current.body).toMatchObject({ id: real.body.id, name: 'Vraie' })
    expect(JSON.stringify(current.body)).not.toContain(real.body.view.previewToken)

    const list = await api('GET', '/api/public/editions')
    expect(list.body.map((e: { name: string }) => e.name)).not.toContain('Répétition')

    expect((await api('GET', `/api/public/editions/${test.body.id}`)).status).toBe(404)
    expect((await api('GET', `/api/public/editions/${test.body.id}?k=mauvais`)).status).toBe(404)
    const preview = await api('GET', `/api/public/editions/${test.body.id}?k=${token}`)
    expect(preview.body).toMatchObject({ name: 'Répétition', isTest: true })
  })
})
