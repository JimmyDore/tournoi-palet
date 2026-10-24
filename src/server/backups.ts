import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { milestones, type EditionState } from '../engine/index.ts'

/** Copies gardées par édition : de quoi couvrir toutes les parties et tous les tours. */
export const BACKUPS_KEPT_PER_EDITION = 40

export interface Backups {
  /** Après une commande appliquée : copie la base si un nouveau jalon est atteint. Ne lève jamais. */
  afterCommand(editionId: string, before: EditionState | undefined, after: EditionState): void
}

/**
 * Copie automatique pendant le tournoi : à chaque nouveau jalon (partie de
 * poule terminée, tour de tableau terminé), un snapshot SQLite cohérent dans
 * `<dataDir>/backups/<édition>-<jalon>-<AAAAMMJJ-HHMMSS>.db`. Complète la
 * sauvegarde nocturne (`scripts/backup.mjs`). Une copie ratée est journalisée,
 * la commande reste acceptée.
 */
export function createBackups(db: DatabaseSync, dataDir: string, log: (error: unknown, message: string) => void): Backups {
  const dir = path.join(dataDir, 'backups')
  return {
    afterCommand(editionId, before, after) {
      try {
        const reached = new Set(before ? milestones(before) : [])
        for (const milestone of milestones(after)) {
          if (reached.has(milestone)) continue
          snapshot(db, dir, `${editionId}-${milestone}-${stamp(new Date())}.db`)
          prune(dir, editionId)
        }
      } catch (error) {
        log(error, `Copie automatique de l'édition ${editionId} impossible`)
      }
    },
  }
}

/** `VACUUM INTO` : une copie cohérente et autonome, écrite à côté puis renommée. */
function snapshot(db: DatabaseSync, dir: string, file: string): void {
  mkdirSync(dir, { recursive: true })
  const target = path.join(dir, file)
  const tmp = `${target}.tmp-${process.pid}`
  try {
    db.prepare('VACUUM INTO ?').run(tmp)
    renameSync(tmp, target)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
}

/** Ne garde que les copies les plus récentes de l'édition. */
function prune(dir: string, editionId: string): void {
  const copies = readdirSync(dir)
    .filter((f) => f.startsWith(`${editionId}-`) && f.endsWith('.db'))
    .sort((a, b) => a.slice(-18).localeCompare(b.slice(-18)))
  for (const old of copies.slice(0, -BACKUPS_KEPT_PER_EDITION)) rmSync(path.join(dir, old), { force: true })
}

/** `AAAAMMJJ-HHMMSS` en UTC (18 caractères avec `.db`, pour le tri). */
function stamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
}
