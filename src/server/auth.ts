import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'session'
const SESSION_DAYS = 30

/**
 * Session console sans état côté serveur : cookie `expiration.signature`
 * signé HMAC avec un secret dérivé du mot de passe. Plusieurs PC peuvent être
 * connectés en même temps, la session survit à un redémarrage, et changer le
 * mot de passe déconnecte tout le monde.
 */
export function createAuth(password: string) {
  const secret = createHmac('sha256', password).update('tournoi-palet/session').digest()
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url')

  return {
    checkPassword(candidate: unknown): boolean {
      return typeof candidate === 'string' && safeEqual(candidate, password)
    },

    /** Valeur du cookie d'une nouvelle session. */
    issue(now = Date.now()): string {
      const expires = String(now + SESSION_DAYS * 24 * 3600 * 1000)
      return `${expires}.${sign(expires)}`
    },

    verify(token: string | undefined, now = Date.now()): boolean {
      if (!token) return false
      const [expires, signature] = token.split('.')
      if (!expires || !signature || !safeEqual(signature, sign(expires))) return false
      return Number(expires) > now
    },

    /** Session valide dans l'en-tête `cookie` d'une requête ? */
    fromCookieHeader(header: string | undefined, now = Date.now()): boolean {
      return this.verify(readCookie(header, SESSION_COOKIE), now)
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
