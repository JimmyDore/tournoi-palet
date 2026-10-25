import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { adminView, evolve, seededRng, type Event } from '../engine/index.ts'
import { openDatabase } from './db.ts'
import { EditionStore } from './editions.ts'

// Le magasin d'éditions : une commande n'est persistée que si le moteur sait
// l'appliquer, sinon le rejeu au démarrage planterait.

const ctx = () => ({ rng: seededRng(1), now: Date.UTC(2026, 11, 19, 13, 0) })
let dataDir: string | undefined

afterEach(() => {
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  dataDir = undefined
})

describe('EditionStore', () => {
  it('ne persiste rien si evolve lève : le redémarrage rejoue sans erreur', () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'palet-store-'))
    const db = openDatabase(dataDir)
    const broken = (state: Parameters<typeof evolve>[0], event: Event) => {
      if (event.type === 'teamRegistered') throw new Error('evolve cassé')
      return evolve(state, event)
    }
    const store = new EditionStore(db, { evolve: broken })
    const created = store.create({ name: 'Test', date: '2026-12-19' }, ctx())
    expect(created.ok).toBe(true)
    const id = created.ok ? created.editionId : ''
    expect(() => store.apply(id, { type: 'registerTeam', team: { player1: 'A', player2: 'B' } }, ctx())).toThrow('evolve cassé')
    expect(store.events(id)).toHaveLength(1)

    const restarted = new EditionStore(db)
    expect(restarted.events(id)).toHaveLength(1)
    expect(adminView(restarted.get(id)!).teams).toEqual([])
    // Et la commande suivante reprend à la bonne position.
    expect(restarted.apply(id, { type: 'registerTeam', team: { player1: 'A', player2: 'B' } }, ctx()).ok).toBe(true)
    expect(new EditionStore(db).events(id)).toHaveLength(2)
    db.close()
  })
})
