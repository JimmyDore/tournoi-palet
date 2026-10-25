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
    actor TEXT,
    PRIMARY KEY (edition_id, seq)
  )`)
  // Base d'avant le journal « qui » : la colonne est ajoutée, les anciens événements restent sans auteur.
  const columns = db.prepare('PRAGMA table_info(events)').all() as { name: string }[]
  if (!columns.some((c) => c.name === 'actor')) db.exec('ALTER TABLE events ADD COLUMN actor TEXT')
  return db
}

/** Une vraie requête, pas seulement « le fichier existe ». */
export function checkDatabase(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined
  return row?.ok === 1
}

/**
 * Ajoute les événements d'une commande, tous ou aucun (une transaction).
 * `actor` : le prénom donné à la connexion (journal « qui »), hors moteur.
 */
export function appendEvents(db: DatabaseSync, editionId: string, firstSeq: number, events: readonly Event[], actor: string | null = null): void {
  if (events.length === 0) return
  const insert = db.prepare('INSERT INTO events (edition_id, seq, type, payload, at, actor) VALUES (?, ?, ?, ?, ?, ?)')
  db.exec('BEGIN IMMEDIATE')
  try {
    events.forEach((event, i) => insert.run(editionId, firstSeq + i, event.type, JSON.stringify(event), event.at, actor))
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/**
 * Efface tous les événements d'une édition. Seule entorse à « on n'efface
 * jamais un fait » : réservée aux éditions de test (voir `EditionStore.remove`).
 */
export function deleteEvents(db: DatabaseSync, editionId: string): void {
  db.prepare('DELETE FROM events WHERE edition_id = ?').run(editionId)
}

/** Les événements d'une édition, dans l'ordre, et l'auteur de chacun (`null` : inconnu). */
export interface StoredEvents {
  events: Event[]
  actors: (string | null)[]
}

/** Tous les événements, groupés par édition et dans l'ordre. */
export function loadEvents(db: DatabaseSync): Map<string, StoredEvents> {
  const rows = db.prepare('SELECT edition_id, payload, actor FROM events ORDER BY edition_id, seq').all() as {
    edition_id: string
    payload: string
    actor: string | null
  }[]
  const byEdition = new Map<string, StoredEvents>()
  for (const row of rows) {
    const stored = byEdition.get(row.edition_id) ?? { events: [], actors: [] }
    stored.events.push(JSON.parse(row.payload) as Event)
    stored.actors.push(row.actor ?? null)
    byEdition.set(row.edition_id, stored)
  }
  return byEdition
}
