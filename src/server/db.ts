import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const DB_FILE = 'tournoi-palet.db'

export function openDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(path.join(dataDir, DB_FILE))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('created_at', ?)").run(new Date().toISOString())
  return db
}

/** Une vraie requête, pas seulement « le fichier existe ». */
export function checkDatabase(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined
  return row?.ok === 1
}
