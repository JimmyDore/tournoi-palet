import { shuffle, type Rng } from './rng.ts'

/**
 * Tirage d'une partie de poule : des paires d'équipes qui ne se sont jamais
 * rencontrées, et un exempt si le nombre est impair (en priorité une équipe
 * qui n'a encore jamais été exempte).
 *
 * Recherche aléatoire avec retour arrière : on prend toujours l'équipe qui a
 * le moins d'adversaires possibles, et on essaie ses adversaires dans un
 * ordre tiré au hasard. Avec 4 parties, chaque équipe n'a que 3 adversaires
 * interdits : dès 8 équipes un tirage existe toujours et se trouve
 * immédiatement ; en dessous, la recherche est exhaustive (et minuscule).
 */
export interface Pairing {
  pairs: [string, string][]
  bye: string | null
}

/** Garde-fou : au-delà, on considère qu'il n'y a pas de tirage. */
const MAX_STEPS = 200_000

export function pairWithoutRematch(
  rng: Rng,
  teams: readonly string[],
  haveMet: (a: string, b: string) => boolean,
  hadBye: (team: string) => boolean,
): Pairing | null {
  let steps = 0
  const match = (free: string[]): [string, string][] | null => {
    if (free.length === 0) return []
    if (++steps > MAX_STEPS) return null
    const options = (team: string) => free.filter((other) => other !== team && !haveMet(team, other))
    let team = free[0]
    let best = options(team)
    for (const other of free.slice(1)) {
      if (best.length <= 1) break
      const o = options(other)
      if (o.length < best.length) [team, best] = [other, o]
    }
    for (const partner of shuffle(rng, best)) {
      const rest = match(free.filter((t) => t !== team && t !== partner))
      if (rest) return [[team, partner], ...rest]
    }
    return null
  }

  const drawn = shuffle(rng, teams)
  const finish = (pairs: [string, string][], bye: string | null): Pairing => ({
    pairs: shuffle(rng, pairs).map(([a, b]) => (rng.next() < 0.5 ? [a, b] : [b, a])),
    bye,
  })
  if (drawn.length % 2 === 0) {
    const pairs = match(drawn)
    return pairs && finish(pairs, null)
  }
  const byes = [...drawn.filter((t) => !hadBye(t)), ...drawn.filter(hadBye)]
  for (const bye of byes) {
    const pairs = match(drawn.filter((t) => t !== bye))
    if (pairs) return finish(pairs, bye)
    if (steps > MAX_STEPS) return null
  }
  return null
}
