import { CHALLENGES, challengeEntrants } from './challenges.ts'
import { cancelMatch, numberedBoards, launchMatch, releaseMatch, type BoardAllocation } from './boards.ts'
import { POOL_ROUNDS, poolStandings, poolView, type PoolTeamRef } from './pool.ts'
import { shuffle } from './rng.ts'
import { MAX_SCORE } from './settings.ts'
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

/** `reset` : le match redevient « pas lancé » (ses équipes ont changé après une correction, ou il n'en a plus deux). */
export type BoardLogEntry = { kind: 'launch' | 'release' | 'reset'; matchId: string }

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

/**
 * Saisit ou corrige le score d'un match de tableau. Une correction qui change
 * le vainqueur est refusée sans `confirm: true`, la raison disant son impact
 * sur la suite (voir `correctionImpact`).
 */
export interface EnterBracketScore {
  type: 'enterBracketScore'
  matchId: string
  scoreA: number
  scoreB: number
  confirm?: boolean
}

/** Lance tout match dont les deux équipes sont connues, sans attendre la fin de son tour. */
export interface LaunchReadyMatches {
  type: 'launchReadyMatches'
}

export type BracketCommand = ValidateSplit | GenerateBrackets | EnterBracketScore | LaunchReadyMatches

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

/** Les matchs prêts à ce moment-là sont lancés (dérivé dans `evolve`). */
export interface ReadyMatchesLaunched {
  type: 'readyMatchesLaunched'
  at: number
}

export type BracketEvent = SplitValidated | BracketsGenerated | BracketScoreEntered | ReadyMatchesLaunched

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
  const seeded = seededGrid(ranked)
  if (method === 'seeded') return seeded
  const byes = seeded.length - ranked.length
  const exempted = new Set(ranked.slice(0, byes))
  const drawn = shuffle(ctx.rng, ranked.slice(byes))
  return seeded.map((slot) => {
    if (slot === null || exempted.has(slot)) return slot
    return drawn.shift()!
  })
}

/** Grille en têtes de série (les Challenges sont toujours placés ainsi). */
function seededGrid(ranked: readonly string[]): Slot[] {
  return seedOrder(bracketSize(ranked.length)).map((seed): Slot => ranked[seed - 1] ?? null)
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
      if (match.forfeit) {
        const winner = match.forfeit === match.teamA ? match.teamB : match.teamA
        return refuse(`« ${nameOf(state, match.forfeit)} » est forfait : « ${nameOf(state, winner)} » gagne ce match ${MAX_SCORE}-0.`)
      }
      if (!match.launched) return refuse('Ce match n’est pas encore lancé.')
      const problem = scoreProblem(command.scoreA, command.scoreB)
      if (problem) return refuse(problem)
      const current = brackets.scores[match.id]
      if (current && current.a === command.scoreA && current.b === command.scoreB && current.teamA === match.teamA && current.teamB === match.teamB) {
        return accept()
      }
      if (command.confirm !== true) {
        const warning = impactWarning(state, match, command.scoreA, command.scoreB)
        if (warning) return refuse(warning)
      }
      return accept(scoreEvent(match, command.scoreA, command.scoreB, ctx.now))
    }
    case 'launchReadyMatches': {
      if (!brackets.grids) return refuse('Les tableaux ne sont pas encore générés.')
      if (readyMatches(state).length === 0) return refuse('Aucun match prêt : pas de match non lancé dont les deux équipes sont connues.')
      return accept({ type: 'readyMatchesLaunched', at: ctx.now })
    }
  }
}

export function evolveBrackets(state: EditionState, event: BracketEvent): EditionState {
  const brackets = state.brackets
  switch (event.type) {
    case 'splitValidated':
      return { ...state, brackets: { ...brackets, principalCount: event.principalCount } }
    case 'bracketsGenerated': {
      // Tous les vrais matchs du 1er tour sont lancés : Principal puis Consolante, dans l'ordre de la grille.
      const generated = { ...state, brackets: { ...brackets, grids: { P: event.principal, C: event.consolante }, generatedAt: event.at } }
      return launch(generated, synchronizedLaunches(generated))
    }
    case 'bracketScoreEntered': {
      const { matchId, scoreA, scoreB, teamA, teamB, at } = event
      const released = launchStatus(state).get(matchId) === 'release'
      const scored = {
        ...state,
        brackets: {
          ...brackets,
          scores: { ...brackets.scores, [matchId]: { a: scoreA, b: scoreB, teamA, teamB, at } },
          boardLog: released ? brackets.boardLog : [...brackets.boardLog, { kind: 'release' as const, matchId }],
        },
      }
      // La planche libérée d'abord : le tour suivant, s'il devient complet, la récupère.
      return settleBrackets(scored)
    }
    case 'readyMatchesLaunched':
      return launch(state, readyMatches(state))
  }
}

function scoreEvent(match: DerivedMatch, scoreA: number, scoreB: number, at: number): BracketScoreEntered {
  return { type: 'bracketScoreEntered', at, matchId: match.id, scoreA, scoreB, teamA: match.teamA!, teamB: match.teamB! }
}

/**
 * Remet les tableaux d'aplomb après un fait qui change des équipes ou des
 * résultats (score saisi ou corrigé, forfait) :
 *   - un score saisi avec d'autres équipes que celles du match est effacé ;
 *   - un match lancé qui n'a plus ses deux équipes est annulé (planche rendue) ;
 *   - un match déjà joué dont les équipes ont changé est annulé puis relancé ;
 *   - un match en cours gagné par forfait libère sa planche ;
 * puis les tours devenus complets sont lancés. Générique sur tous les matchs
 * de tous les tableaux : équipes dérivées contre équipes mémorisées.
 */
export function settleBrackets(state: EditionState): EditionState {
  if (!state.brackets.grids) return state
  const status = launchStatus(state)
  const scores = { ...state.brackets.scores }
  const resets: BoardLogEntry[] = []
  const releases: BoardLogEntry[] = []
  const relaunch: string[] = []
  for (const m of bracketMatches(state)) {
    const stored = scores[m.id]
    const stale = stored !== undefined && (stored.teamA !== m.teamA || stored.teamB !== m.teamB)
    if (stale) delete scores[m.id]
    const launched = status.get(m.id)
    if (!launched) continue
    if (m.bye || !m.teamA || !m.teamB) {
      resets.push({ kind: 'reset', matchId: m.id })
    } else if (launched === 'release' && (stale || !m.score)) {
      // Joué avec d'autres équipes (score effacé, ou forfait d'une équipe qui n'y est plus) : à rejouer.
      resets.push({ kind: 'reset', matchId: m.id })
      if (!m.score) relaunch.push(m.id)
    } else if (launched === 'launch' && m.score) {
      releases.push({ kind: 'release', matchId: m.id })
    }
  }
  const settled = { ...state, brackets: { ...state.brackets, scores, boardLog: [...state.brackets.boardLog, ...resets, ...releases] } }
  const relaunched = launch(settled, relaunch)
  return launch(relaunched, synchronizedLaunches(relaunched))
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
  /** Nombre de matchs du tour (1 = finale). */
  roundSize: number
  /** `null` : exempt (tour 1) ou équipe pas encore connue (vainqueur d'un match pas joué). */
  teamA: string | null
  teamB: string | null
  /** Un des deux côtés est un exempt : pas de match, l'autre équipe avance. */
  bye: boolean
  launched: boolean
  /** Score qui compte : saisi avec les équipes actuelles du match, ou 13-0 par forfait. */
  score: Score | null
  /** Équipe forfait qui perd ce match sans le jouer ; `null` sinon. */
  forfeit: string | null
  /** Équipe qualifiée pour le tour suivant : celle de l'exempt, ou le vainqueur ; `null` tant que pas joué. */
  winner: string | null
}

/**
 * Grilles du 1er tour de chaque tableau, dans l'ordre d'affichage (celui du
 * classement final) : P, CP, C, CC. Un Challenge n'apparaît qu'une fois le
 * 1er tour de son parent complet (voir challenges.ts).
 */
function bracketGrids(state: EditionState): [BracketKey, readonly Slot[]][] {
  const grids = state.brackets.grids
  if (!grids) return []
  const poolOrder = poolStandings(state).map((s) => s.team.id)
  return CHALLENGES.flatMap(([parent, challenge]): [BracketKey, readonly Slot[]][] => {
    const grid = grids[parent as 'P' | 'C']
    const firstRound = deriveBracket(state, parent, grid, new Set()).filter((m) => m.round === 1)
    const entrants = challengeEntrants(firstRound, poolOrder)
    return entrants ? [[parent, grid], [challenge, seededGrid(entrants)]] : [[parent, grid]]
  })
}

/** Dernier état de lancement de chaque match lancé : `launch` (en cours ou en attente) ou `release` (terminé). */
function launchStatus(state: EditionState): Map<string, 'launch' | 'release'> {
  const status = new Map<string, 'launch' | 'release'>()
  for (const e of state.brackets.boardLog) {
    if (e.kind === 'reset') status.delete(e.matchId)
    else status.set(e.matchId, e.kind)
  }
  return status
}

/** Tous les matchs d'un tableau, tour par tour : tour k+1, match i = vainqueurs des matchs 2i et 2i+1 du tour k. */
function deriveBracket(state: EditionState, bracket: BracketKey, grid: readonly Slot[], launched: { has(matchId: string): boolean }): DerivedMatch[] {
  const matches: DerivedMatch[] = []
  let sides: (string | null)[] = [...grid]
  for (let round = 1; sides.length >= 2; round++) {
    const roundSize = sides.length / 2
    const current = Array.from({ length: roundSize }, (_, index): DerivedMatch => {
      const teamA = sides[2 * index]
      const teamB = sides[2 * index + 1]
      const id = `${bracket}:${round}:${index}`
      // Seul le 1er tour a des exempts ; ensuite un côté vide est une équipe pas encore connue.
      const bye = round === 1 && (teamA === null || teamB === null)
      const entered = !bye && teamA && teamB ? validScore(state, id, teamA, teamB) : null
      // Un match pas joué d'une équipe forfait est gagné 13-0 par l'adversaire, dès qu'il est connu.
      const forfeit = !bye && teamA && teamB && !entered ? forfeitLoser(state, teamA, teamB) : null
      const score = entered ?? (forfeit === null ? null : forfeit === teamA ? { a: 0, b: MAX_SCORE } : { a: MAX_SCORE, b: 0 })
      const winner = bye ? (teamA ?? teamB) : score ? (score.a > score.b ? teamA : teamB) : null
      return { id, bracket, round, index, roundSize, teamA, teamB, bye, launched: launched.has(id), score, forfeit, winner }
    })
    matches.push(...current)
    sides = current.map((m) => m.winner)
  }
  return matches
}

/** Matchs des tableaux, tous les tours. */
function bracketMatches(state: EditionState): DerivedMatch[] {
  const launched = launchStatus(state)
  return bracketGrids(state).flatMap(([key, grid]) => deriveBracket(state, key, grid, launched))
}

/** Score qui compte : celui saisi, s'il a été saisi avec les équipes actuelles du match. */
function validScore(state: EditionState, matchId: string, teamA: string, teamB: string): Score | null {
  const s = state.brackets.scores[matchId]
  if (!s || s.teamA !== teamA || s.teamB !== teamB) return null
  return { a: s.a, b: s.b }
}

/** Équipe forfait d'un match (la première déclarée si les deux le sont), ou `null`. */
function forfeitLoser(state: EditionState, teamA: string, teamB: string): string | null {
  const a = state.forfeits[teamA]
  const b = state.forfeits[teamB]
  if (a && b) return a.at <= b.at ? teamA : teamB
  return a ? teamA : b ? teamB : null
}

/** Un tour est complet quand chacun de ses matchs a un qualifié (exempt ou score saisi). */
const roundComplete = (matches: readonly DerivedMatch[]) => matches.every((m) => m.winner !== null)

/** Les matchs regroupés par tableau puis par tour, dans l'ordre. */
function byRound(matches: readonly DerivedMatch[]): DerivedMatch[][] {
  const rounds = new Map<string, DerivedMatch[]>()
  for (const m of matches) {
    const key = `${m.bracket}:${m.round}`
    rounds.set(key, [...(rounds.get(key) ?? []), m])
  }
  return [...rounds.values()]
}

/** Tours complets de chaque tableau, dans l'ordre (jalons de copie automatique). */
export function completedBracketRounds(state: EditionState): { bracket: BracketKey; round: number }[] {
  return byRound(bracketMatches(state))
    .filter(roundComplete)
    .map(([m]) => ({ bracket: m.bracket, round: m.round }))
}

/**
 * Lance des matchs, dans l'ordre donné : chacun prendra la plus petite planche
 * libre, sinon la file d'attente. Un match déjà lancé, exempt ou sans ses deux
 * équipes est ignoré. Sert aux tours synchronisés (et, ticket 14, à « Lancer
 * les matchs prêts »).
 */
function launch(state: EditionState, matchIds: readonly string[]): EditionState {
  const matches = new Map(bracketMatches(state).map((m) => [m.id, m]))
  const entries = matchIds
    .filter((id) => {
      const m = matches.get(id)
      return m !== undefined && !m.bye && m.teamA !== null && m.teamB !== null && !m.launched && m.score === null
    })
    .map((matchId): BoardLogEntry => ({ kind: 'launch', matchId }))
  if (entries.length === 0) return state
  return { ...state, brackets: { ...state.brackets, boardLog: [...state.brackets.boardLog, ...entries] } }
}

/** Matchs prêts : pas lancés, sans résultat, leurs deux équipes connues (« Lancer les matchs prêts »). */
function readyMatches(state: EditionState): string[] {
  return bracketMatches(state)
    .filter((m) => !m.bye && m.teamA !== null && m.teamB !== null && !m.launched && m.score === null)
    .map((m) => m.id)
}

/** Tours synchronisés : les matchs pas encore lancés d'un tour dont le tour précédent est complet (le 1er tour d'emblée). */
function synchronizedLaunches(state: EditionState): string[] {
  const rounds = byRound(bracketMatches(state))
  return rounds.flatMap((matches, i) => {
    const [first] = matches
    const previous = rounds[i - 1]
    const ready = first.round === 1 || (previous !== undefined && previous[0].bracket === first.bracket && roundComplete(previous))
    return ready ? matches.map((m) => m.id) : []
  })
}

/** Planches des tableaux, rejouées : la plus petite libre, sinon la file d'attente. */
function bracketBoards(state: EditionState): BoardAllocation {
  let boards = numberedBoards(state.edition!.settings.boards)
  for (const e of state.brackets.boardLog) {
    boards = e.kind === 'launch' ? launchMatch(boards, e.matchId) : e.kind === 'release' ? releaseMatch(boards, e.matchId) : cancelMatch(boards, e.matchId)
  }
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
  /** Équipe forfait qui perd ce match (13-0) sans le jouer ; `null` sinon. */
  forfeit: string | null
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
  /** Vainqueur de la finale ; `null` tant qu’elle n’est pas jouée. */
  winner: BracketTeamRef | null
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
  /** Principal, Challenge Principal, Consolante, Challenge Consolante (un Challenge dès le 1er tour de son parent complet), vides avant la génération. */
  brackets: BracketView[]
  /** Matchs lancés sans score : sur leur planche (par planche croissante), puis en attente dans l'ordre de la file. */
  live: BracketMatchView[]
  /** Matchs pas encore lancés dont les deux équipes sont connues (« Lancer les matchs prêts »). */
  ready: number
  /** Équipes déclarées forfait une fois les tableaux générés. */
  forfeits: BracketTeamRef[]
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
  if (!grids) return { split, generated: false, brackets: [], live: [], ready: 0, forfeits: [] }

  const boards = bracketBoards(state)
  const matches = bracketMatches(state)
  const views = matches.map((m): BracketMatchView => {
    const { score } = m
    const board = m.launched ? (boards.boardOf[m.id] ?? null) : null
    return {
      id: m.id,
      bracket: m.bracket,
      bracketName: BRACKET_NAMES[m.bracket],
      round: m.round,
      roundName: roundName(m.roundSize),
      index: m.index,
      board: m.bye ? null : board,
      teamA: ref(m.teamA),
      teamB: ref(m.teamB),
      score,
      forfeit: m.forfeit,
      status: m.bye ? 'bye' : score ? 'done' : !m.launched ? 'pending' : board === null ? 'waiting-board' : 'playing',
    }
  })

  const final = new Map(matches.filter((m) => m.roundSize === 1).map((m) => [m.bracket, m]))
  const brackets = bracketGrids(state).map(([key, grid]): BracketView => {
    const teams = grid.filter((s) => s !== null).length
    const rounds: BracketRoundView[] = []
    for (const m of views.filter((v) => v.bracket === key)) {
      let round = rounds.find((r) => r.round === m.round)
      if (!round) rounds.push((round = { round: m.round, name: m.roundName, matches: [] }))
      round.matches.push(m)
    }
    // Un tableau d'une seule équipe (petit Challenge) n'a pas de match : elle le gagne.
    const winner = final.get(key)?.winner ?? (grid.length === 1 ? grid[0] : null)
    return { key, name: BRACKET_NAMES[key], teams, size: grid.length, byes: grid.length - teams, rounds, winner: ref(winner) }
  })

  const queue = (id: string) => boards.waiting.indexOf(id)
  const live = views
    .filter((m) => m.status === 'playing' || m.status === 'waiting-board')
    .sort((x, y) => (x.board ?? Infinity) - (y.board ?? Infinity) || queue(x.id) - queue(y.id))

  const forfeits = Object.entries(state.forfeits)
    .filter(([, f]) => f.inBrackets)
    .map(([teamId]) => ref(teamId)!)
  return { split, generated: true, brackets, live, ready: readyMatches(state).length, forfeits }
}

// --- Impact d'une correction -----------------------------------------------

/** « du Principal », « de la Consolante ». */
export function ofBracket(key: BracketKey): string {
  return `${key === 'C' ? 'de la' : 'du'} ${BRACKET_NAMES[key]}`
}

/** « en 1/2 du Principal », « en finale de la Consolante ». */
function inRound(m: BracketMatchView): string {
  return `en ${m.roundName === 'Finale' ? 'finale' : m.roundName} ${ofBracket(m.bracket)}`
}

const viewMatches = (state: EditionState) => bracketsView(state).brackets.flatMap((b) => b.rounds.flatMap((r) => r.matches))

export interface CorrectionImpact {
  /** Le vainqueur du match change : la correction demande confirmation. */
  winnerChanged: boolean
  /** Ce qui change dans la suite des tableaux, en phrases (« X remplace Y en 1/8 du Principal, planche 4 ; le score 13-9 déjà saisi sera effacé »). */
  changes: string[]
}

/**
 * Ce que changerait la correction du score d'un match déjà joué : les matchs
 * suivants (de tous les tableaux) dont une équipe change, et les scores déjà
 * saisis qui seraient effacés. Rien si le vainqueur reste le même.
 */
export function correctionImpact(state: EditionState, matchId: string, scoreA: number, scoreB: number): CorrectionImpact {
  const none: CorrectionImpact = { winnerChanged: false, changes: [] }
  const match = bracketMatches(state).find((m) => m.id === matchId)
  if (!match?.score || match.forfeit || scoreA === scoreB) return none
  if (scoreA > scoreB === match.score.a > match.score.b) return none
  const before = new Map(viewMatches(state).map((m) => [m.id, m]))
  const after = evolveBrackets(state, scoreEvent(match, scoreA, scoreB, 0))
  const changes = viewMatches(after).flatMap((m) => {
    const was = before.get(m.id)
    if (!was || m.id === matchId) return []
    const sides: [BracketTeamRef | null, BracketTeamRef | null][] = [
      [was.teamA, m.teamA],
      [was.teamB, m.teamB],
    ]
    const changed = sides.filter(([x, y]) => x?.id !== y?.id)
    if (changed.length === 0) return []
    // Les deux équipes changent (Challenge refait) : l'affiche entière.
    const versus = (a: BracketTeamRef | null, b: BracketTeamRef | null) => `« ${a?.name ?? 'à déterminer'} » contre « ${b?.name ?? 'à déterminer'} »`
    const moves =
      changed.length === 2 && m.teamA && m.teamB && was.teamA && was.teamB
        ? [`${versus(m.teamA, m.teamB)} au lieu de ${versus(was.teamA, was.teamB)}`]
        : changed.map(([x, y]) => {
            if (x && y) return `« ${y.name} » remplace « ${x.name} »`
            return x ? `« ${x.name} » n’est plus qualifiée` : `« ${y!.name} » est qualifiée`
          })
    const board = was.board ? `, planche ${was.board}` : ''
    const erased = was.score && !was.forfeit ? ` ; le score ${was.score.a}-${was.score.b} déjà saisi sera effacé` : ''
    return [`${moves.join(' et ')} ${inRound(was)}${board}${erased}`]
  })
  return { winnerChanged: true, changes }
}

/**
 * Raison du refus d'une correction qui change le vainqueur sans confirmation ;
 * `null` si le vainqueur ne change pas. Une phrase par ligne : la console en
 * fait une liste.
 */
function impactWarning(state: EditionState, match: DerivedMatch, scoreA: number, scoreB: number): string | null {
  const impact = correctionImpact(state, match.id, scoreA, scoreB)
  if (!impact.winnerChanged) return null
  const [winner, loser] = scoreA > scoreB ? [match.teamA!, match.teamB!] : [match.teamB!, match.teamA!]
  const what = impact.changes.length ? impact.changes.map((c) => `${c}.`) : ['Aucun autre match n’est touché.']
  return [`Le vainqueur change : « ${nameOf(state, winner)} » au lieu de « ${nameOf(state, loser)} ».`, ...what, IMPACT_END].join('\n')
}

/** Dernière ligne de la raison d'un refus de correction. */
export const IMPACT_END = 'Confirmez pour corriger.'

function nameOf(state: EditionState, teamId: string): string {
  const team = state.teams.find((t) => t.id === teamId)
  return team ? teamName(team) : teamId
}
