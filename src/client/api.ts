import type { AdminView, Command } from '../engine/index.ts'

/** Réponse d'une commande : la nouvelle vue console, ou le refus du moteur. */
export type CommandResult = { ok: true; id: string; view: AdminView } | { ok: false; reason: string }

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new HttpError(res.status, `${res.status}`)
  return (await res.json()) as T
}

/** POST JSON ; renvoie toujours `{ ok, reason? }` (jamais d'exception pour un refus). */
export async function postJson<T extends { ok: boolean }>(url: string, body: unknown): Promise<T | { ok: false; reason: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    const data = (await res.json().catch(() => null)) as (T & { reason?: string }) | null
    if (res.status === 401 && url.startsWith('/api/admin/')) window.dispatchEvent(new Event('app:unauthorized'))
    if (!data) return { ok: false, reason: `Erreur du serveur (${res.status}).` }
    return data
  } catch {
    return { ok: false, reason: 'Serveur injoignable. Vérifiez la connexion et réessayez.' }
  }
}

export function sendCommand(editionId: string, command: Command): Promise<CommandResult> {
  return postJson<CommandResult>(`/api/admin/editions/${encodeURIComponent(editionId)}/commands`, { command })
}

/** Lien public d'une édition (avec le jeton secret pour une édition de test). */
export function publicLink(kind: 'e' | 'tele', view: Pick<AdminView, 'id' | 'previewToken' | 'settings'>, absolute = false): string {
  const path = `/${kind}/${encodeURIComponent(view.id)}${view.settings.isTest ? `?k=${view.previewToken}` : ''}`
  return absolute ? `${location.origin}${path}` : path
}

/** Adresse complète de la page publique (téléphones), vue depuis la télé : `k` passe tel quel. */
export function publicPageUrl(editionId: string, k?: string | null): string {
  return `${location.origin}/e/${encodeURIComponent(editionId)}${k ? `?k=${encodeURIComponent(k)}` : ''}`
}
