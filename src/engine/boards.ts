/**
 * Allocateur de planches, commun aux poules et aux tableaux. Il ne stocke
 * rien : on le rejoue à partir des faits, dans l'ordre où ils sont arrivés.
 *
 *   - un match lancé prend la première planche libre (dans l'ordre de
 *     priorité donné), sinon il part dans la file « en attente » ;
 *   - quand son score est saisi, sa planche se libère et va au premier match
 *     en attente, sinon elle redevient libre.
 *
 * Poules : priorité = ordre des planches tiré au hasard (dans l'événement de
 * tirage). Tableaux : priorité = numéro de planche (la plus petite libre).
 *
 *   let b = initialBoards([3, 1, 2])
 *   b = launchMatch(b, 'm1')   // planche 3
 *   b = releaseMatch(b, 'm1')  // match joué : la 3 est de nouveau libre
 */
export interface BoardAllocation {
  /** Planches dans l'ordre de priorité. */
  readonly order: readonly number[]
  /** Planches libres, dans l'ordre de priorité. */
  readonly free: readonly number[]
  /** Planche de chaque match qui en a reçu une (y compris les matchs terminés). */
  readonly boardOf: Readonly<Record<string, number>>
  /** Matchs lancés sans planche, dans l'ordre d'arrivée. */
  readonly waiting: readonly string[]
  /** Matchs terminés (score saisi). */
  readonly finished: Readonly<Record<string, true>>
}

export function initialBoards(order: readonly number[]): BoardAllocation {
  return { order, free: [...order], boardOf: {}, waiting: [], finished: {} }
}

/** Planches 1..count, la plus petite d'abord (tableaux). */
export function numberedBoards(count: number): BoardAllocation {
  return initialBoards(Array.from({ length: count }, (_, i) => i + 1))
}

/** Lance un match : planche libre ou file d'attente. Sans effet s'il est déjà lancé. */
export function launchMatch(state: BoardAllocation, matchId: string): BoardAllocation {
  if (matchId in state.boardOf || state.waiting.includes(matchId) || state.finished[matchId]) return state
  const [board, ...free] = state.free
  if (board === undefined) return { ...state, waiting: [...state.waiting, matchId] }
  return { ...state, free, boardOf: { ...state.boardOf, [matchId]: board } }
}

/**
 * Match terminé : sa planche passe au premier en attente, ou redevient libre.
 * Sans effet pour un match déjà terminé (correction de score). Un match
 * terminé alors qu'il attendait encore une planche sort de la file.
 */
export function releaseMatch(state: BoardAllocation, matchId: string): BoardAllocation {
  if (state.finished[matchId]) return state
  const finished = { ...state.finished, [matchId]: true as const }
  const board = state.boardOf[matchId]
  if (board === undefined) return { ...state, finished, waiting: state.waiting.filter((id) => id !== matchId) }
  const [next, ...waiting] = state.waiting
  if (next !== undefined) return { ...state, finished, waiting, boardOf: { ...state.boardOf, [next]: board } }
  const rank = (b: number) => state.order.indexOf(b)
  const free = [...state.free, board].sort((a, b) => rank(a) - rank(b))
  return { ...state, finished, free }
}

/** Planche actuelle d'un match en cours, ou celle où il a été joué ; `null` s'il attend. */
export function boardOf(state: BoardAllocation, matchId: string): number | null {
  return state.boardOf[matchId] ?? null
}
