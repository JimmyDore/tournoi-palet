import { numberedBoards, launchMatch, releaseMatch, type BoardAllocation } from './boards.ts'
import { POOL_ROUNDS, poolStandings, poolView, type PoolTeamRef } from './pool.ts'
import { shuffle } from './rng.ts'
import { scoreProblem, type Score } from './score.ts'
import type { EditionState } from './state.ts'
import { teamName } from './teams.ts'
import { accept, refuse, type Ctx, type Decision } from './types.ts'

// Tableaux : répartition Principal / Consolante, grille du premier tour
// (têtes de série ou tirage au sort), scores. Seuls les faits sont stockés
// (répartition validée, grilles tirées, scores avec les équipes au moment de
// la saisie) ; les équipes de chaque match, les planches et la suite des
// tableaux sont recalculées.
//
// Identifiant de match stable : `${tableau}:${tour}:${index}`, tour 1 = premier
// tour, index à partir de 0. Le match `i` du tour `k` réunit les positions
// `2i` et `2i+1` (tour 1 : de la grille ; tour k+1 : vainqueurs des matchs
// `2i` et `2i+1` du tour k).

/** Principal, Challenge Principal, Consolante, Challenge Consolante. */
export type BracketKey = 'P' | 'CP' | 'C' | 'CC'

export const BRACKET_NAMES: Record<BracketKey, string> = {
  P: 'Principal',
  CP: 'Challenge Principal',
  C: 'Consolante',
  CC: 'Challenge Consolante',
}

/** Une position de la grille du 1er tour : une équipe, ou `null` (exempt). */
export type Slot = string | null

// --- Faits -----------------------------------------------------------------

export interface BracketScore extends Score {
  /** Équipes du match au moment de la saisie : si elles ne sont plus celles dérivées, le score ne compte plus. */
  teamA: string
  teamB: string
  at: number
}

/** Tranche d'état des tableaux. */
export interface BracketsState {
  /** Nombre d'équipes en Principal, validé par l'organisateur ; `null` avant. */
  principalCount: number | null
  /** Grilles du 1er tour, tirées à la génération ; `null` avant. */
  grids: { P: Slot[]; C: Slot[] } | null
  generatedAt: number | null
  /** Dernier score saisi de chaque match (saisir = corriger). */
  scores: Record<string, BracketScore>
  /**
   * Lancements et fins de match, dans l'ordre des événements : l'allocateur
   * de planches des tableaux les rejoue. Ce n'est qu'une trace de l'ordre des
   * faits (rien de calculé).
   */
  boardLog: BoardLogEntry[]
}

export type BoardLogEntry = { kind: 'launch' | 'release'; matchId: string }

export function initialBrackets(): BracketsState {
  return { principalCount: null, grids: null, generatedAt: null, scores: {}, boardLog: [] }
}

// --- Commandes -------------------------------------------------------------

/** Valide (ou revalide) la répartition, tant que les tableaux ne sont pas générés. */
export interface ValidateSplit {
  type: 'validateSplit'
  principalCount: number
}

/** Génère les deux tableaux d'après la répartition validée et la méthode réglée. */
export interface GenerateBrackets {
  type: 'generateBrackets'
}

/** Saisit ou corrige le score d'un match de tableau. */
export interface EnterBracketScore {
  type: 'enterBracketScore'
  matchId: string
  scoreA: number
  scoreB: number
}

export type BracketCommand = ValidateSplit | GenerateBrackets | EnterBracketScore

// --- Événements ------------------------------------------------------------

export interface SplitValidated {
  type: 'splitValidated'
  at: number
  principalCount: number
}

export interface BracketsGenerated {
  type: 'bracketsGenerated'
  at: number
  /** Positions 0..S-1 du 1er tour (S = puissance de 2 ≥ effectif), `null` = exempt. */
  principal: Slot[]
  consolante: Slot[]
}

export interface BracketScoreEntered {
  type: 'bracketScoreEntered'
  at: number
  matchId: string
  scoreA: number
  scoreB: number
  teamA: string
  teamB: string
}

export type BracketEvent = SplitValidated | BracketsGenerated | BracketScoreEntered

// --- Répartition -----------------------------------------------------------

/** Les 4 parties de poule sont jouées (tous les scores saisis). */
function poolsComplete(state: EditionState): boolean {
  const rounds = poolView(state).rounds
  return rounds.length === POOL_ROUNDS && rounds.every((r) => r.complete)
}

/** Équipes qui entrent dans les tableaux, dans l'ordre du classement des poules (forfaits exclus). */
function bracketEntrants(state: EditionState): string[] {
  return poolStandings(state)
    .filter((s) => !s.forfeit)
    .map((s) => s.team.id)
}

/** Proposition par défaut : 2/3 des équipes en Principal, arrondi. */
export function proposedPrincipal(participants: number): number {
  return Math.round((participants * 2) / 3)
}

function splitProblem(participants: number, principalCount: unknown): string | null {
  if (typeof principalCount !== 'number' || !Number.isInteger(principalCount)) return 'Le nombre d’équipes en Principal doit être un nombre entier.'
  if (participants < 4) return `Il faut au moins 4 équipes pour faire deux tableaux (${participants} en jeu).`
  if (principalCount < 2 || participants - principalCount < 2) {
    return `Chaque tableau doit compter au moins 2 équipes : entre 2 et ${participants - 2} en Principal (${participants} équipes en jeu).`
  }
  return null
}

// --- Grille du premier tour ------------------------------------------------

/** Puissance de 2 supérieure ou égale. */
export function bracketSize(count: number): number {
  let size = 1
  while (size < count) size *= 2
  return size
}

/**
 * Placement standard des têtes de série : position → numéro de tête (1 = la
 * mieux classée). 1 contre S, et 1 et 2 dans des moitiés opposées, si bien
 * qu'elles ne peuvent se croiser qu'en finale. Taille 8 : 1 8 4 5 2 7 3 6.
 */
export function seedOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const n = order.length * 2
    order = order.flatMap((seed) => [seed, n + 1 - seed])
  }
  return order
}

/**
 * Grille d'un tableau. `ranked` : ses équipes, la mieux classée d'abord. Les
 * S-n exempts vont aux mieux classés (les têtes 1..S-n affrontent `null`).
 * En tirage au sort, les exemptées gardent leur place de tête de série et
 * les autres équipes sont réparties au hasard sur les positions restantes.
 */
function drawGrid(ranked: readonly string[], method: 'seeded' | 'random', ctx: Ctx): Slot[] {
  const size = bracketSize(ranked.length)
  const seeded = seedOrder(size).map((seed): Slot => ranked[seed - 1] ?? null)
  if (method === 'seeded') return seeded
  const byes = size - ranked.length
  const exempted = new Set(ranked.slice(0, byes))
  const drawn = shuffle(ctx.rng, ranked.slice(byes))
  return seeded.map((slot) => {
    if (slot === null || exempted.has(slot)) return slot
    return drawn.shift()!
  })
}

// --- decide / evolve -------------------------------------------------------

export function decideBrackets(state: EditionState, command: BracketCommand, ctx: Ctx): Decision<BracketEvent> {
  const brackets = state.brackets
  switch (command.type) {
    case 'validateSplit': {
      if (brackets.grids) return refuse('Les tableaux sont déjà générés : la répartition ne peut plus changer.')
      if (!poolsComplete(state)) return refuse(`La répartition se valide une fois les ${POOL_ROUNDS} parties de poule terminées.`)
      const problem = splitProblem(bracketEntrants(state).length, command.principalCount)
      if (problem) return refuse(problem)
      if (brackets.principalCount === command.principalCount) return accept()
      return accept({ type: 'splitValidated', at: ctx.now, principalCount: command.principalCount })
    }
    case 'generateBrackets': {
      if (brackets.grids) return refuse('Les tableaux sont déjà générés.')
      if (!poolsComplete(state)) return refuse(`Les tableaux se génèrent une fois les ${POOL_ROUNDS} parties de poule terminées.`)
      if (brackets.principalCount === null) return refuse('Validez d’abord la répartition Principal / Consolante.')
      const entrants = bracketEntrants(state)
      // Un forfait déclaré depuis la validation peut la rendre impossible.
      const problem = splitProblem(entrants.length, brackets.principalCount)
      if (problem) return refuse(`${problem} Revalidez la répartition.`)
      const method = state.edition!.settings.bracketFirstRound
      return accept({
        type: 'bracketsGenerated',
        at: ctx.now,
        principal: drawGrid(entrants.slice(0, brackets.principalCount), method, ctx),
        consolante: drawGrid(entrants.slice(brackets.principalCount), method, ctx),
      })
    }
    case 'enterBracketScore': {
      const match = bracketMatches(state).find((m) => m.id === command.matchId)
      if (!match) return refuse("Ce match de tableau n'existe pas.")
      if (!match.teamA || !match.teamB) return refuse('Ce match n’a pas encore ses deux équipes.')
      if (!match.launched) return refuse('Ce match n’est pas encore lancé.')
      const problem = scoreProblem(command.scoreA, command.scoreB)
      if (problem) return refuse(problem)
      const current = brackets.scores[match.id]
      if (current && current.a === command.scoreA && current.b === command.scoreB && current.teamA === match.teamA && current.teamB === match.teamB) {
        return accept()
      }
      return accept({
        type: 'bracketScoreEntered',
        at: ctx.now,
        matchId: match.id,
        scoreA: command.scoreA,
        scoreB: command.scoreB,
        teamA: match.teamA,
        teamB: match.teamB,
      })
    }
  }
}

export function evolveBrackets(state: EditionState, event: BracketEvent): EditionState {
  const brackets = state.brackets
  switch (event.type) {
    case 'splitValidated':
      return { ...state, brackets: { ...brackets, principalCount: event.principalCount } }
    case 'bracketsGenerated': {
      const grids = { P: event.principal, C: event.consolante }
      // Tous les vrais matchs du 1er tour sont lancés : Principal puis Consolante, dans l'ordre de la grille.
      const launches = (['P', 'C'] as const).flatMap((key) => firstRound(key, grids[key]).filter((m) => m.teamA && m.teamB))
      return {
        ...state,
        brackets: {
          ...brackets,
          grids,
          generatedAt: event.at,
          boardLog: [...brackets.boardLog, ...launches.map((m): BoardLogEntry => ({ kind: 'launch', matchId: m.id }))],
        },
      }
    }
    case 'bracketScoreEntered': {
      const { matchId, scoreA, scoreB, teamA, teamB, at } = event
      const released = brackets.boardLog.some((e) => e.kind === 'release' && e.matchId === matchId)
      return {
        ...state,
        brackets: {
          ...brackets,
          scores: { ...brackets.scores, [matchId]: { a: scoreA, b: scoreB, teamA, teamB, at } },
          boardLog: released ? brackets.boardLog : [...brackets.boardLog, { kind: 'release', matchId }],
        },
      }
    }
  }
}

/**
 * Une fois les tableaux générés, les poules sont figées : plus de tirage,
 * de score ni de retrait de partie, ni de changement du score d'exempt
 * (le classement des poules sert aux Challenges et au classement final).
 */
export function bracketLockProblem(state: EditionState, command: { type: string; changes?: unknown }): string | null {
  if (!state.brackets.grids) return null
  switch (command.type) {
    case 'drawPoolRound':
    case 'enterPoolScore':
    case 'removePoolRound':
      return 'Les tableaux sont générés : les poules sont closes.'
    case 'cancelForfeit':
      return 'Les tableaux sont générés : un forfait de poule ne peut plus être annulé.'
    case 'declareForfeit':
      // Ticket 14 : forfait en tableau.
      return 'Le forfait en tableau n’est pas encore pris en charge.'
    case 'updateEdition':
      if (command.changes && typeof command.changes === 'object' && 'byeScore' in command.changes) {
        return 'Les tableaux sont générés : le score d’exempt des poules ne peut plus changer.'
      }
      return null
    default:
      return null
  }
}

// --- Matchs dérivés --------------------------------------------------------

/** Un match de tableau, équipes dérivées. */
interface DerivedMatch {
  id: string
  bracket: BracketKey
  round: number
  index: number
  teamA: string | null
  teamB: string | null
  /** Un des deux côtés est un exempt : pas de match, l'autre équipe avance. */
  bye: boolean
  launched: boolean
}

function firstRound(bracket: BracketKey, grid: readonly Slot[]): Omit<DerivedMatch, 'launched'>[] {
  return Array.from({ length: grid.length / 2 }, (_, index) => {
    const teamA = grid[2 * index]
    const teamB = grid[2 * index + 1]
    return { id: `${bracket}:1:${index}`, bracket, round: 1, index, teamA, teamB, bye: teamA === null || teamB === null }
  })
}

/** Matchs connus des tableaux. Ticket 12 : ajouter les tours suivants (vainqueurs des matchs 2i et 2i+1). */
function bracketMatches(state: EditionState): DerivedMatch[] {
  const grids = state.brackets.grids
  if (!grids) return []
  const launched = new Set(state.brackets.boardLog.filter((e) => e.kind === 'launch').map((e) => e.matchId))
  return (['P', 'C'] as const).flatMap((key) => firstRound(key, grids[key]).map((m) => ({ ...m, launched: launched.has(m.id) })))
}

/** Score qui compte : celui saisi, s'il a été saisi avec les équipes actuelles du match. */
function validScore(state: EditionState, m: DerivedMatch): Score | null {
  const s = state.brackets.scores[m.id]
  if (!s || s.teamA !== m.teamA || s.teamB !== m.teamB) return null
  return { a: s.a, b: s.b }
}

/** Planches des tableaux, rejouées : la plus petite libre, sinon la file d'attente. */
function bracketBoards(state: EditionState): BoardAllocation {
  let boards = numberedBoards(state.edition!.settings.boards)
  for (const e of state.brackets.boardLog) boards = e.kind === 'launch' ? launchMatch(boards, e.matchId) : releaseMatch(boards, e.matchId)
  return boards
}

// --- Vues ------------------------------------------------------------------

/** Nom d'un tour d'après le nombre de matchs qu'il compte : finale, 1/2, 1/4… */
export function roundName(matches: number): string {
  return matches === 1 ? 'Finale' : `1/${matches}`
}

/** `playing` : sur sa planche ; `waiting-board` : lancé, pas de planche libre ; `done` : score saisi ; `pending` : pas encore lancé ; `bye` : exempt. */
export type BracketMatchStatus = 'playing' | 'waiting-board' | 'done' | 'pending' | 'bye'

export interface BracketTeamRef extends PoolTeamRef {
  /** Rang au classement des poules. */
  poolRank: number
}

export interface BracketMatchView {
  id: string
  bracket: BracketKey
  bracketName: string
  round: number
  roundName: string
  index: number
  /** Planche où le match se joue (ou s'est joué) ; `null` s'il n'en a pas (encore). */
  board: number | null
  /** `null` : exempt, ou équipe pas encore connue. */
  teamA: BracketTeamRef | null
  teamB: BracketTeamRef | null
  score: Score | null
  status: BracketMatchStatus
}

export interface BracketRoundView {
  round: number
  name: string
  matches: BracketMatchView[]
}

export interface BracketView {
  key: BracketKey
  name: string
  /** Nombre d'équipes. */
  teams: number
  /** Taille de la grille (puissance de 2). */
  size: number
  byes: number
  rounds: BracketRoundView[]
}

export interface SplitView {
  /** Les 4 parties de poule sont terminées : la répartition peut être validée. */
  ready: boolean
  /** Équipes qui entrent dans les tableaux (forfaits de poule exclus). */
  participants: number
  proposedPrincipal: number
  validatedPrincipal: number | null
  /** Répartition en vigueur (validée, sinon proposée) : équipes dans l'ordre du classement des poules. */
  principal: BracketTeamRef[]
  consolante: BracketTeamRef[]
}

/** Tableaux, publics tels quels : seulement des noms d'équipe, des planches et des scores. */
export interface BracketsView {
  split: SplitView
  generated: boolean
  /** Principal et Consolante (puis les Challenges, ticket 13), vides avant la génération. */
  brackets: BracketView[]
  /** Matchs lancés sans score : sur leur planche (par planche croissante), puis en attente dans l'ordre de la file. */
  live: BracketMatchView[]
}

export function bracketsView(state: EditionState): BracketsView {
  const standings = poolStandings(state)
  const rank = new Map(standings.map((s) => [s.team.id, s.rank]))
  const ref = (teamId: string | null): BracketTeamRef | null => {
    if (teamId === null) return null
    const team = state.teams.find((t) => t.id === teamId)
    return { id: teamId, name: team ? teamName(team) : teamId, poolRank: rank.get(teamId) ?? 0 }
  }

  const entrants = bracketEntrants(state)
  const proposed = proposedPrincipal(entrants.length)
  const validated = state.brackets.principalCount
  const cut = validated ?? proposed
  const split: SplitView = {
    ready: poolsComplete(state),
    participants: entrants.length,
    proposedPrincipal: proposed,
    validatedPrincipal: validated,
    principal: entrants.slice(0, cut).map((id) => ref(id)!),
    consolante: entrants.slice(cut).map((id) => ref(id)!),
  }

  const grids = state.brackets.grids
  if (!grids) return { split, generated: false, brackets: [], live: [] }

  const boards = bracketBoards(state)
  const views = bracketMatches(state).map((m): BracketMatchView => {
    const score = m.bye ? null : validScore(state, m)
    const board = boards.boardOf[m.id] ?? null
    const matchesInRound = grids[m.bracket as 'P' | 'C'].length / 2 ** m.round
    return {
      id: m.id,
      bracket: m.bracket,
      bracketName: BRACKET_NAMES[m.bracket],
      round: m.round,
      roundName: roundName(matchesInRound),
      index: m.index,
      board: m.bye ? null : board,
      teamA: ref(m.teamA),
      teamB: ref(m.teamB),
      score,
      status: m.bye ? 'bye' : score ? 'done' : !m.launched ? 'pending' : board === null ? 'waiting-board' : 'playing',
    }
  })

  const brackets = (['P', 'C'] as const).map((key): BracketView => {
    const grid = grids[key]
    const teams = grid.filter((s) => s !== null).length
    const rounds: BracketRoundView[] = []
    for (const m of views.filter((v) => v.bracket === key)) {
      let round = rounds.find((r) => r.round === m.round)
      if (!round) rounds.push((round = { round: m.round, name: m.roundName, matches: [] }))
      round.matches.push(m)
    }
    return { key, name: BRACKET_NAMES[key], teams, size: grid.length, byes: grid.length - teams, rounds }
  })

  const queue = (id: string) => boards.waiting.indexOf(id)
  const live = views
    .filter((m) => m.status === 'playing' || m.status === 'waiting-board')
    .sort((x, y) => (x.board ?? Infinity) - (y.board ?? Infinity) || queue(x.id) - queue(y.id))

  return { split, generated: true, brackets, live }
}
