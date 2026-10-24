import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.ts'

const PASSWORD = 'secret-de-test'
let app: FastifyInstance
let dataDir: string
let base: string

async function start(dir = dataDir) {
  app = await buildApp({ dataDir: dir, adminPassword: PASSWORD })
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
}

async function login(): Promise<string> {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  return res.headers.get('set-cookie')!.split(';')[0]
}

async function api(method: string, url: string, cookie?: string, body?: unknown) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) }
}

/** Édition avec quatre équipes pointées et la partie 1 lancée. */
async function tournament(cookie: string) {
  const { body } = await api('POST', '/api/admin/editions', cookie, { settings: { name: 'Concours 2026', date: '2026-12-19' } })
  const id = body.id as string
  const command = (c: object) => api('POST', `/api/admin/editions/${id}/commands`, cookie, { command: c })
  await command({ type: 'registerTeam', team: { name: 'Les Galets', player1: 'Paul', player2: 'Marie', phone: '0611223344' } })
  for (const p of ['Jean', 'Anne', 'Zoé']) await command({ type: 'registerTeam', team: { player1: p, player2: `${p}2` } })
  for (const teamId of ['t1', 't2', 't3', 't4']) await command({ type: 'checkInTeam', teamId })
  const drawn = await command({ type: 'drawPoolRound', round: 1 })
  const matchIds = drawn.body.view.pool.rounds[0].matches.map((m: { id: string }) => m.id) as string[]
  return { id, command, matchIds }
}

const backups = (dir = dataDir) => {
  try {
    return readdirSync(path.join(dir, 'backups'))
  } catch {
    return []
  }
}

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'tournoi-palet-'))
  await start()
})

afterAll(async () => {
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
})

describe('sauvegarde', () => {
  it('retrouve exactement le tournoi en cours après un redémarrage', async () => {
    const cookie = await login()
    const { id, command, matchIds } = await tournament(cookie)
    await command({ type: 'enterPoolScore', matchId: matchIds[0], scoreA: 13, scoreB: 8 })
    const before = await api('GET', `/api/admin/editions/${id}`, cookie)
    const journal = await api('GET', `/api/admin/editions/${id}/journal`, cookie)

    await app.close()
    await start()

    const after = await api('GET', `/api/admin/editions/${id}`, cookie)
    expect(after.body).toEqual(before.body)
    expect(after.body.pool.rounds[0].matches.filter((m: { score: unknown }) => m.score)).toHaveLength(1)
    expect((await api('GET', `/api/admin/editions/${id}/journal`, cookie)).body).toEqual(journal.body)
  })

  it('copie la base à la fin de chaque partie de poule, une seule fois', async () => {
    const cookie = await login()
    const { id, command, matchIds } = await tournament(cookie)
    await command({ type: 'enterPoolScore', matchId: matchIds[0], scoreA: 13, scoreB: 8 })
    expect(backups().filter((f) => f.startsWith(id))).toEqual([])

    await command({ type: 'enterPoolScore', matchId: matchIds[1], scoreA: 5, scoreB: 13 })
    await command({ type: 'enterPoolScore', matchId: matchIds[1], scoreA: 6, scoreB: 13 }) // correction
    const copies = backups().filter((f) => f.startsWith(id))
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatch(new RegExp(`^${id}-poule-partie-1-\\d{8}-\\d{6}\\.db$`))

    // La copie est une base autonome qui contient tout le tournoi jusque-là.
    const copy = new DatabaseSync(path.join(dataDir, 'backups', copies[0]), { readOnly: true })
    const { n } = copy.prepare('SELECT COUNT(*) AS n FROM events WHERE edition_id = ?').get(id) as { n: number }
    copy.close()
    const journal = await api('GET', `/api/admin/editions/${id}/journal`, cookie)
    expect(n).toBe(journal.body.length - 1)
  })

  it("n'empêche jamais une commande si la copie échoue", async () => {
    const broken = mkdtempSync(path.join(tmpdir(), 'tournoi-palet-'))
    writeFileSync(path.join(broken, 'backups'), 'pas un dossier')
    await app.close()
    await start(broken)
    try {
      const cookie = await login()
      const { command, matchIds } = await tournament(cookie)
      for (const matchId of matchIds) expect((await command({ type: 'enterPoolScore', matchId, scoreA: 13, scoreB: 1 })).body.ok).toBe(true)
    } finally {
      await app.close()
      rmSync(broken, { recursive: true, force: true })
      await start()
    }
  })
})

describe('export', () => {
  it("exige le mot de passe et télécharge l'édition complète, lisible", async () => {
    const cookie = await login()
    const { id, command, matchIds } = await tournament(cookie)
    await command({ type: 'enterPoolScore', matchId: matchIds[0], scoreA: 13, scoreB: 8 })

    expect((await api('GET', `/api/admin/editions/${id}/export`)).status).toBe(401)
    expect((await api('GET', `/api/admin/editions/inconnue/export`, cookie)).status).toBe(404)

    const res = await fetch(`${base}/api/admin/editions/${id}/export`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="tournoi-palet-concours-2026-2026-12-19\.json"$/)
    const text = await res.text()
    expect(text).toContain('\n  "settings"')
    const exported = JSON.parse(text)
    expect(exported.settings).toMatchObject({ name: 'Concours 2026' })
    expect(exported.teams[0]).toMatchObject({ name: 'Les Galets', phone: '0611223344' })
    expect(exported.poolStandings).toHaveLength(4)
    expect(exported.events.map((e: { type: string }) => e.type)).toContain('poolScoreEntered')
    expect(exported.events[0].type).toBe('editionCreated')
  })
})
