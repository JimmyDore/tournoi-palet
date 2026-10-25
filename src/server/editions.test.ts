import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AdminView } from '../engine/index.ts'
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
    // Même réponse qu'une édition inconnue, en public comme en console.
    const hidden = await api('GET', `/api/public/editions/${test.body.id}`)
    expect(hidden.body).toEqual({ ok: false, reason: "Cette édition n'existe pas." })
    expect((await api('GET', '/api/public/editions/inconnue')).body).toEqual(hidden.body)
    expect((await api('GET', '/api/admin/editions/inconnue', cookie)).body).toEqual(hidden.body)
    const preview = await api('GET', `/api/public/editions/${test.body.id}?k=${token}`)
    expect(preview.body).toMatchObject({ name: 'Répétition', isTest: true })
  })

  it('liste les équipes inscrites et les places restantes, sans aucune donnée privée', async () => {
    const cookie = await login()
    const { body } = await api('POST', '/api/admin/editions', cookie, { settings: { name: 'Inscrits', date: '2032-12-18', maxTeams: 2 } })
    const register = (team: object) => api('POST', `/api/admin/editions/${body.id}/commands`, cookie, { command: { type: 'registerTeam', team } })
    await register({ name: 'Les Galets', player1: 'Paul', player2: 'Marie', phone: '0611223344', comment: 'paiera en liquide', player1Licensed: true, player2Licensed: true })
    await register({ player1: 'Jean', player2: 'Luc' })
    const third = await register({ player1: 'Anne', player2: 'Zoé', phone: '0699887766' })
    expect(third.body.view.teams.map((t: { status: string }) => t.status)).toEqual(['registered', 'registered', 'waitlist'])

    const pub = subscribe({ type: 'subscribe', editionId: body.id })
    for (const view of [(await api('GET', `/api/public/editions/${body.id}`)).body, (await api('GET', '/api/public/current')).body, await pub.nextView(1)]) {
      expect(view).toMatchObject({
        teams: [{ name: 'Les Galets' }, { name: 'Jean & Luc' }],
        waitlist: [{ name: 'Anne & Zoé' }],
        placesLeft: 0,
      })
      const json = JSON.stringify(view)
      for (const secret of ['0611223344', '0699887766', 'paiera', 'Licensed', 'phone', 'comment', 'checkedIn', 'Paul', 'Marie']) {
        expect(json).not.toContain(secret)
      }
    }
    pub.ws.close()
  })

  it('palmarès : une vraie édition terminée y figure avec son vainqueur, une édition de test jamais', async () => {
    const cookie = await login()
    const real = await finishedEdition(cookie, { name: 'Concours 2020', date: '2020-12-19' })
    const test = await finishedEdition(cookie, { name: 'Répétition finie', date: '2021-01-09', isTest: true })
    const token = test.view.previewToken as string
    expect(real.view.phase).toBe('after')
    expect(test.view.phase).toBe('after')

    // Même avec le jeton de l'édition de test, la liste ne la contient pas.
    for (const url of ['/api/public/editions', `/api/public/editions?k=${token}`]) {
      const list = await api('GET', url)
      expect(list.body).toContainEqual({ id: real.id, name: 'Concours 2020', date: '2020-12-19', winner: { id: real.view.ranking.rows[0].team.id, name: real.view.ranking.rows[0].team.name } })
      expect(list.body.map((e: { id: string }) => e.id)).not.toContain(test.id)
      expect(JSON.stringify(list.body)).not.toContain('Répétition')
    }

    const page = await api('GET', `/api/public/editions/${real.id}`)
    expect(page.body).toMatchObject({ phase: 'after', ranking: { finished: true } })
    expect(page.body.ranking.rows).toHaveLength(12)

    expect((await api('GET', '/api/public/current')).body.id).not.toBe(test.id)
    expect((await api('GET', `/api/public/editions/${test.id}`)).status).toBe(404)
    expect(await subscribeError({ type: 'subscribe', editionId: test.id })).toBe('not_found')
    expect(await subscribeError({ type: 'subscribe', editionId: test.id, k: 'mauvais' })).toBe('not_found')
  })
})

/** Crée une édition et la joue jusqu'aux quatre finales par l'API de la console (12 équipes, l'équipe A gagne). */
async function finishedEdition(cookie: string, settings: object) {
  const created = await api('POST', '/api/admin/editions', cookie, { settings: { maxTeams: 12, ...settings } })
  const id = created.body.id as string
  let view: AdminView = created.body.view
  const command = async (command: object) => {
    const res = await api('POST', `/api/admin/editions/${id}/commands`, cookie, { command })
    expect(res.body).toMatchObject({ ok: true })
    view = res.body.view
  }
  for (let i = 1; i <= 12; i++) await command({ type: 'registerTeam', team: { player1: `J${i}a`, player2: `J${i}b` } })
  for (const team of view.teams) await command({ type: 'checkInTeam', teamId: team.id })
  let k = 0
  for (let round = 1; round <= 4; round++) {
    await command({ type: 'drawPoolRound', round })
    for (const m of view.pool.rounds.at(-1)!.matches.filter((m) => !m.score)) {
      await command({ type: 'enterPoolScore', matchId: m.id, scoreA: 13, scoreB: ++k % 13 })
    }
  }
  await command({ type: 'validateSplit', principalCount: view.brackets.split.proposedPrincipal })
  await command({ type: 'generateBrackets' })
  while (view.brackets.live.length > 0) await command({ type: 'enterBracketScore', matchId: view.brackets.live[0].id, scoreA: 13, scoreB: 6 })
  return { id, view }
}

/** Abonnement public refusé : la raison renvoyée par le serveur. */
function subscribeError(message: object): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}/ws`)
    const timer = setTimeout(() => reject(new Error('pas de réponse')), 2000)
    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data))
      if (msg.type === 'hello') ws.send(JSON.stringify(message))
      else {
        clearTimeout(timer)
        ws.close()
        resolve(msg.type === 'error' ? msg.reason : msg.type)
      }
    }
  })
}
