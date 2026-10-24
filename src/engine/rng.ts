/**
 * Source de hasard injectée dans `decide` (via `ctx.rng`). Le moteur ne tire
 * jamais au hasard ailleurs : le résultat d'un tirage est écrit dans
 * l'événement, donc `evolve` et le rejouage restent déterministes.
 */
export interface Rng {
  /** Flottant uniforme dans [0, 1). */
  next(): number
}

/** Générateur à graine (mulberry32) : tests et répétitions reproductibles. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

/** Entier uniforme dans [0, n). */
export function randomInt(rng: Rng, n: number): number {
  return Math.floor(rng.next() * n)
}

/** Copie mélangée (Fisher-Yates), l'entrée n'est pas modifiée. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Jeton aléatoire (ex. lien secret d'une édition de test). */
export function randomToken(rng: Rng, length = 24): string {
  let token = ''
  for (let i = 0; i < length; i++) token += TOKEN_ALPHABET[randomInt(rng, TOKEN_ALPHABET.length)]
  return token
}
