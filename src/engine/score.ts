import { MAX_SCORE } from './settings.ts'

/** Score d'un match : `a` pour l'équipe A, `b` pour l'équipe B. */
export interface Score {
  a: number
  b: number
}

/**
 * Règle commune poules et tableaux : deux entiers de 0 à 13, différents. Le
 * vainqueur a le plus haut score, éventuellement moins de 13 (temps écoulé).
 * Renvoie la raison du refus, ou `null`.
 */
export function scoreProblem(a: unknown, b: unknown): string | null {
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isInteger(a) || !Number.isInteger(b)) {
    return 'Les deux scores doivent être des nombres entiers.'
  }
  if (a < 0 || b < 0) return 'Un score ne peut pas être négatif.'
  if (a > MAX_SCORE || b > MAX_SCORE) return `Un score ne peut pas dépasser ${MAX_SCORE}.`
  if (a === b) return `Égalité impossible (${a}-${b}) : il faut un vainqueur.`
  return null
}
