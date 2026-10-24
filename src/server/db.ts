import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Event } from '../engine/index.ts'

export const DB_FILE = 'tournoi-palet.db'

export function openDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(path.join(dataDir, DB_FILE))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('created_at', ?)").run(new Date().toISOString())
  // Les seuls faits stockés : les événements de chaque édition, dans l'ordre.
  // Tout le reste (état, vues, journal) se recalcule en les rejouant.
  db.exec(`CREATE TABLE IF NOT EXISTS events (
    edition_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (edition_id, seq)
  )`)
  return db
}

/** Une vraie requête, pas seulement « le fichier existe ». */
export function checkDatabase(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined
  return row?.ok === 1
}

/** Ajoute les événements d'une commande, tous ou aucun (une transaction). */
export function appendEvents(db: DatabaseSync, editionId: string, firstSeq: number, events: readonly Event[]): void {
  if (events.length === 0) return
  const insert = db.prepare('INSERT INTO events (edition_id, seq, type, payload, at) VALUES (?, ?, ?, ?, ?)')
  db.exec('BEGIN IMMEDIATE')
  try {
    events.forEach((event, i) => insert.run(editionId, firstSeq + i, event.type, JSON.stringify(event), event.at))
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/** Tous les événements, groupés par édition et dans l'ordre. */
export function loadEvents(db: DatabaseSync): Map<string, Event[]> {
  const rows = db.prepare('SELECT edition_id, payload FROM events ORDER BY edition_id, seq').all() as {
    edition_id: string
    payload: string
  }[]
  const byEdition = new Map<string, Event[]>()
  for (const row of rows) {
    const list = byEdition.get(row.edition_id) ?? []
    list.push(JSON.parse(row.payload) as Event)
    byEdition.set(row.edition_id, list)
  }
  return byEdition
}
