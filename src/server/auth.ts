import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'session'
const SESSION_DAYS = 30

/** Longueur maximale du prénom donné à la connexion. */
export const MAX_ACTOR_LENGTH = 40

/**
 * Session console sans état côté serveur : cookie `expiration.prénom.signature`
 * (prénom facultatif, en base64url) signé HMAC avec un secret dérivé du mot
 * de passe. Plusieurs PC peuvent être connectés en même temps, la session
 * survit à un redémarrage, et changer le mot de passe déconnecte tout le
 * monde. Le prénom sert au journal (« qui ») ; ce n'est pas une identité
 * vérifiée (mot de passe partagé). Les cookies d'avant le prénom
 * (`expiration.signature`) restent valides, sans prénom.
 */
export function createAuth(password: string) {
  const secret = createHmac('sha256', password).update('tournoi-palet/session').digest()
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url')

  return {
    checkPassword(candidate: unknown): boolean {
      return typeof candidate === 'string' && safeEqual(candidate, password)
    },

    /** Valeur du cookie d'une nouvelle session ; `name` : prénom facultatif, pour le journal. */
    issue(now = Date.now(), name: unknown = ''): string {
      const expires = String(now + SESSION_DAYS * 24 * 3600 * 1000)
      const actor = Buffer.from(cleanActor(name) ?? '').toString('base64url')
      const payload = `${expires}.${actor}`
      return `${payload}.${sign(payload)}`
    },

    /** La session si le jeton est valide et pas expiré, sinon `null`. */
    session(token: string | undefined, now = Date.now()): { actor: string | null } | null {
      if (!token) return null
      const parts = token.split('.')
      const signature = parts.pop()
      const payload = parts.join('.')
      const [expires, actor = ''] = parts
      if (!expires || !signature || parts.length > 2 || !safeEqual(signature, sign(payload))) return null
      if (!(Number(expires) > now)) return null
      return { actor: cleanActor(Buffer.from(actor, 'base64url').toString()) }
    },

    verify(token: string | undefined, now = Date.now()): boolean {
      return this.session(token, now) !== null
    },

    /** Session valide dans l'en-tête `cookie` d'une requête ? */
    fromCookieHeader(header: string | undefined, now = Date.now()): boolean {
      return this.verify(readCookie(header, SESSION_COOKIE), now)
    },

    /** Prénom donné à la connexion (`null` si aucun, ou pas de session). */
    actorFromCookieHeader(header: string | undefined, now = Date.now()): string | null {
      return this.session(readCookie(header, SESSION_COOKIE), now)?.actor ?? null
    },

    setCookie(value: string, secure: boolean): string {
      return [
        `${SESSION_COOKIE}=${value}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${SESSION_DAYS * 24 * 3600}`,
        ...(secure ? ['Secure'] : []),
      ].join('; ')
    },

    clearCookie(): string {
      return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    },
  }
}

export type Auth = ReturnType<typeof createAuth>

/** Prénom propre (espaces resserrés, longueur bornée), ou `null` s'il est vide. */
function cleanActor(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_ACTOR_LENGTH)
  return clean || null
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return undefined
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
