import { getRandomValues } from 'node:crypto'
import type { Command, Ctx, EditionInfo, EditionSettings, EditionState, Rng } from '../engine/index.ts'
import type { Auth } from './auth.ts'
import type { Backups } from './backups.ts'
import type { Applied, EditionStore } from './editions.ts'
import type { Hub } from './hub.ts'

/** Hasard du serveur : cryptographique (les tirages sont écrits dans les événements). */
export const cryptoRng: Rng = {
  next: () => getRandomValues(new Uint32Array(1))[0] / 4294967296,
}

export function serverCtx(): Ctx {
  return { rng: cryptoRng, now: Date.now() }
}

/** Dépendances partagées par les fichiers de routes. */
export interface ServerContext {
  store: EditionStore
  hub: Hub
  auth: Auth
  /** Applique une commande (persistée, avec son auteur) puis diffuse les vues aux abonnés. */
  execute(editionId: string, command: Command, actor?: string | null): Applied
  create(settings: Partial<EditionSettings>, actor?: string | null): Applied
}

export function createServerContext(store: EditionStore, hub: Hub, auth: Auth, backups?: Backups): ServerContext {
  const after = (result: Applied, before?: EditionState) => {
    if (result.ok && result.events.length > 0) {
      hub.broadcast(result.editionId, result.state)
      backups?.afterCommand(result.editionId, before, result.state)
    }
    return result
  }
  return {
    store,
    hub,
    auth,
    execute: (editionId, command, actor = null) => {
      const before = store.get(editionId)
      return after(store.apply(editionId, command, serverCtx(), actor), before)
    },
    create: (settings, actor = null) => after(store.create(settings, serverCtx(), actor)),
  }
}

/** Réponse 404 de toutes les routes : une édition inconnue ou cachée (test sans jeton) se ressemblent. */
export const NOT_FOUND = { ok: false, reason: "Cette édition n'existe pas." } as const

/**
 * Une édition est-elle visible côté public avec ce jeton ? Une édition de
 * test ne l'est qu'avec son `previewToken` (`?k=`), sinon on fait comme si
 * elle n'existait pas.
 */
export function publiclyVisible(state: EditionState | undefined, k: unknown): state is EditionState & { edition: EditionInfo } {
  const edition = state?.edition
  if (!edition) return false
  return !edition.settings.isTest || (typeof k === 'string' && k === edition.previewToken)
}
