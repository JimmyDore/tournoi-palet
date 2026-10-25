import { initialBoards, launchMatch, releaseMatch, type BoardAllocation } from './boards.ts'
import { participants } from './checkin.ts'
import { pairWithoutRematch } from './pairing.ts'
import { shuffle } from './rng.ts'
import { scoreProblem, type Score } from './score.ts'
import { MAX_SCORE } from './settings.ts'
import type { EditionState } from './state.ts'
import { teamName } from './teams.ts'
import { accept, playsIn, refuse, type Ctx, type Decision, type TeamRef } from './types.ts'

// Poules : parties tirées au hasard, une planche par match, scores par match.
// Tout le reste (planches en cours, file d'attente, classement) est recalculé.

/** Nombre de parties de poule. */
export const POOL_ROUNDS = 4

// --- Faits -----------------------------------------------------------------

/** Un match tiré. `id` est stable (`r1m3` : partie 1, 3e match du tirage). */
export interface PoolMatch {
  id: string
  teamA: string
  teamB: string
}

/** Une partie tirée, telle qu'écrite dans l'événement. */
export interface PoolRound {
  round: number
  matches: PoolMatch[]
  /** Équipe exempte (nombre impair), `null` sinon. */
  bye: string | null
  /** Planches 1..N dans l'ordre tiré : le k-ième match lancé prend la k-ième planche libre. */
  boardOrder: number[]
  drawnAt: number
}

export interface PoolScore extends Score {
  at: number
}

/** Tranche d'état des poules. */
export interface PoolState {
  rounds: PoolRound[]
  /** Dernier score saisi de chaque match (saisir = corriger : le dernier gagne). */
  scores: Record<string, PoolScore>
  /** Matchs dans l'ordre de leur première saisie : c'est ce qui libère les planches. */
  finishOrder: string[]
}

// --- Commandes -------------------------------------------------------------

/**
 * Lance (tire) une partie. `round` est le numéro attendu : deux clics sur deux
 * PC ne lancent pas deux parties.
 */
export interface DrawPoolRound {
  type: 'drawPoolRound'
  round: number
}

/** Saisit ou corrige le score d'un match. */
export interface EnterPoolScore {
  type: 'enterPoolScore'
  matchId: string
  scoreA: number
  scoreB: number
}

/**
 * Retire la dernière partie lancée : son tirage et tous ses scores sont
 * effacés. Sans `confirm: true`, le moteur refuse en disant ce qui sera effacé.
 */
export interface RemovePoolRound {
  type: 'removePoolRound'
  round: number
  confirm?: boolean
}

export type PoolCommand = DrawPoolRound | EnterPoolScore | RemovePoolRound

// --- Événements ------------------------------------------------------------

export interface PoolRoundDrawn {
  type: 'poolRoundDrawn'
  at: number
  round: number
  matches: PoolMatch[]
  bye: string | null
  boardOrder: number[]
}

export interface PoolScoreEntered {
  type: 'poolScoreEntered'
  at: number
  matchId: string
  scoreA: number
  scoreB: number
}

export interface PoolRoundRemoved {
  type: 'poolRoundRemoved'
  at: number
  round: number
}

export type PoolEvent = PoolRoundDrawn | PoolScoreEntered | PoolRoundRemoved

// --- decide / evolve -------------------------------------------------------

export function decidePool(state: EditionState, command: PoolCommand, ctx: Ctx): Decision<PoolEvent> {
  switch (command.type) {
    case 'drawPoolRound': {
      const next = state.pool.rounds.length + 1
      if (command.round !== next) {
        return refuse(command.round < next ? `La partie ${command.round} est déjà lancée.` : `Lancez d’abord la partie ${next}.`)
      }
      if (next > POOL_ROUNDS) return refuse(`Les ${POOL_ROUNDS} parties de poule sont déjà lancées.`)
      const previous = state.pool.rounds.at(-1)
      if (previous) {
        const missing = roundView(state, previous).awaitingScore.length
        if (missing) return refuse(`La partie ${previous.round} n’est pas terminée : ${missing} match${missing > 1 ? 's' : ''} sans score.`)
      }
      // Un forfait déclaré pendant une partie retirée reste valable.
      const players = previous ? poolPlayers(state) : participants(state).map((t) => t.id).filter((id) => !(id in state.forfeits))
      if (players.length < 2) {
        if (previous) return refuse(`Il faut au moins 2 équipes encore en jeu pour lancer la partie ${next}.`)
        return refuse(`Il faut au moins 2 équipes pointées pour lancer la partie 1 (${players.length} pointée${players.length > 1 ? 's' : ''}).`)
      }
      const met = new Set(state.pool.rounds.flatMap((r) => r.matches.map((m) => pairKey(m.teamA, m.teamB))))
      const byes = new Set(state.pool.rounds.map((r) => r.bye))
      const pairing = pairWithoutRematch(ctx.rng, players, (a, b) => met.has(pairKey(a, b)), (t) => byes.has(t))
      if (!pairing) return refuse(`Impossible de tirer la partie ${next} sans faire rejouer deux équipes qui se sont déjà affrontées.`)
      const matches = pairing.pairs.map(([teamA, teamB], i): PoolMatch => ({ id: `r${next}m${i + 1}`, teamA, teamB }))
      const boards = Array.from({ length: state.edition!.settings.boards }, (_, i) => i + 1)
      return accept({ type: 'poolRoundDrawn', at: ctx.now, round: next, matches, bye: pairing.bye, boardOrder: shuffle(ctx.rng, boards) })
    }
    case 'enterPoolScore': {
      const match = findMatch(state, command.matchId)
      if (!match) return refuse("Ce match n'existe pas.")
      const problem = scoreProblem(command.scoreA, command.scoreB)
      if (problem) return refuse(problem)
      const current = state.pool.scores[match.id]
      if (current && current.a === command.scoreA && current.b === command.scoreB) return accept()
      return accept({ type: 'poolScoreEntered', at: ctx.now, matchId: match.id, scoreA: command.scoreA, scoreB: command.scoreB })
    }
    case 'removePoolRound': {
      const last = state.pool.rounds.at(-1)
      if (!last) return refuse('Aucune partie n’est lancée.')
      if (command.round !== last.round) return refuse(`Seule la dernière partie lancée (la partie ${last.round}) peut être retirée.`)
      if (command.confirm !== true) return refuse(removalWarning(state, last))
      return accept({ type: 'poolRoundRemoved', at: ctx.now, round: last.round })
    }
  }
}

/** Ce que le retrait d'une partie efface, dit avant de confirmer. */
export function removalWarning(state: EditionState, round: PoolRound): string {
  const entered = round.matches.filter((m) => m.id in state.pool.scores).length
  const scores = entered === 0 ? ' ; aucun score n’a encore été saisi' : ` et ${entered} score${entered > 1 ? 's' : ''} saisi${entered > 1 ? 's' : ''}`
  const count = round.matches.length
  return `Retirer la partie ${round.round} efface son tirage (${count} match${count > 1 ? 's' : ''}${round.bye ? ' et l’exempt' : ''})${scores}. Confirmez pour la retirer.`
}

export function evolvePool(state: EditionState, event: PoolEvent): EditionState {
  const pool = state.pool
  switch (event.type) {
    case 'poolRoundDrawn': {
      const { round, matches, bye, boardOrder, at } = event
      return { ...state, pool: { ...pool, rounds: [...pool.rounds, { round, matches, bye, boardOrder, drawnAt: at }] } }
    }
    case 'poolRoundRemoved': {
      const removed = pool.rounds.find((r) => r.round === event.round)
      if (!removed) return state
      const ids = new Set(removed.matches.map((m) => m.id))
      return {
        ...state,
        pool: {
          rounds: pool.rounds.filter((r) => r !== removed),
          scores: Object.fromEntries(Object.entries(pool.scores).filter(([id]) => !ids.has(id))),
          finishOrder: pool.finishOrder.filter((id) => !ids.has(id)),
        },
      }
    }
    case 'poolScoreEntered': {
      // Un match gagné par forfait est déjà terminé : sa planche est déjà libérée.
      const first = !pool.finishOrder.includes(event.matchId)
      return {
        ...state,
        pool: {
          ...pool,
          scores: { ...pool.scores, [event.matchId]: { a: event.scoreA, b: event.scoreB, at: event.at } },
          finishOrder: first ? [...pool.finishOrder, event.matchId] : pool.finishOrder,
        },
      }
    }
  }
}

function findMatch(state: EditionState, matchId: unknown): (PoolMatch & { round: number }) | null {
  for (const r of state.pool.rounds) {
    const match = r.matches.find((m) => m.id === matchId)
    if (match) return { ...match, round: r.round }
  }
  return null
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Équipes encore tirées : celles de la poule, moins les forfaits, dans l'ordre d'inscription. */
function poolPlayers(state: EditionState): string[] {
  const ids = poolTeamIds(state)
  return state.teams.filter((t) => ids.has(t.id) && !(t.id in state.forfeits)).map((t) => t.id)
}

export function isPoolTeam(state: EditionState, teamId: string): boolean {
  return poolTeamIds(state).has(teamId)
}

const plays = (m: PoolMatch, teamId: string) => m.teamA === teamId || m.teamB === teamId

/** Forfait : ses matchs sans score sont terminés (gagnés 13-0 par l'adversaire), leur planche se libère. */
export function forfeitInPool(state: EditionState, teamId: string): EditionState {
  const pool = state.pool
  const done = new Set(pool.finishOrder)
  const ended = pool.rounds.flatMap((r) => r.matches).filter((m) => plays(m, teamId) && !done.has(m.id)).map((m) => m.id)
  return ended.length ? { ...state, pool: { ...pool, finishOrder: [...pool.finishOrder, ...ended] } } : state
}

/** Forfait annulé : ses matchs sans score redeviennent à jouer (sauf si l'adversaire est lui aussi forfait). */
export function unforfeitInPool(state: EditionState, teamId: string): EditionState {
  const pool = state.pool
  const reopened = new Set(
    pool.rounds
      .flatMap((r) => r.matches)
      .filter((m) => plays(m, teamId) && !(m.id in pool.scores) && !forfeitedIn(state, m))
      .map((m) => m.id),
  )
  return { ...state, pool: { ...pool, finishOrder: pool.finishOrder.filter((id) => !reopened.has(id)) } }
}

/** Équipe forfait d'un match (la première déclarée si les deux le sont), ou `null`. */
function forfeitedIn(state: EditionState, m: PoolMatch): string | null {
  const a = state.forfeits[m.teamA]
  const b = state.forfeits[m.teamB]
  if (a && b) return a.at <= b.at ? m.teamA : m.teamB
  return a ? m.teamA : b ? m.teamB : null
}

/** Score qui compte : celui saisi, sinon 13-0 contre l'équipe forfait, sinon `null`. */
function effectiveScore(state: EditionState, m: PoolMatch): { score: Score; forfeit: string | null } | null {
  const entered = state.pool.scores[m.id]
  if (entered) return { score: { a: entered.a, b: entered.b }, forfeit: null }
  const loser = forfeitedIn(state, m)
  if (!loser) return null
  return { score: loser === m.teamA ? { a: 0, b: MAX_SCORE } : { a: MAX_SCORE, b: 0 }, forfeit: loser }
}

/** Équipes tirées en poule (matchs et exempts). */
function poolTeamIds(state: EditionState): Set<string> {
  const ids = new Set<string>()
  for (const r of state.pool.rounds) {
    for (const m of r.matches) ids.add(m.teamA).add(m.teamB)
    if (r.bye) ids.add(r.bye)
  }
  return ids
}

/**
 * Une fois la partie 1 lancée, la liste des équipes est figée : plus
 * d'inscription, de pointage ni de remplacement, et une équipe tirée ne se
 * désinscrit plus (on la déclare forfait). Renvoie la raison, ou `null`.
 */
export function poolLockProblem(state: EditionState, command: { type: string; teamId?: unknown }): string | null {
  if (state.pool.rounds.length === 0) return null
  switch (command.type) {
    case 'registerTeam':
      return 'Le tournoi a commencé : les inscriptions sont closes.'
    case 'checkInTeam':
    case 'undoCheckIn':
    case 'replaceAbsentTeam':
      return 'Le tournoi a commencé : le pointage est clos.'
    case 'withdrawTeam':
      if (typeof command.teamId === 'string' && poolTeamIds(state).has(command.teamId)) {
        return 'Cette équipe a déjà été tirée en poule : on ne la désinscrit plus, déclarez-la forfait.'
      }
      return null
    default:
      return null
  }
}

// --- Vues ------------------------------------------------------------------

/** `playing` : sur sa planche, sans score ; `waiting-board` : pas de planche libre ; `done` : score saisi. */
export type PoolMatchStatus = 'playing' | 'waiting-board' | 'done'

export interface PoolMatchView {
  id: string
  round: number
  /** Planche où le match se joue (ou s'est joué) ; `null` s'il attend une planche. */
  board: number | null
  teamA: TeamRef
  teamB: TeamRef
  score: Score | null
  /** Équipe déclarée forfait si le match est gagné 13-0 par forfait, sinon `null`. */
  forfeit: string | null
  status: PoolMatchStatus
}

export interface PoolRoundView {
  round: number
  /** Par planche croissante (sur une même planche, le match en cours d'abord), puis les matchs en attente de planche dans l'ordre de la file. */
  matches: PoolMatchView[]
  bye: { team: TeamRef; score: Score } | null
  /** Matchs sans score (« en attente de score »), par planche. */
  awaitingScore: string[]
  /** Matchs en attente de planche, dans l'ordre de la file. */
  awaitingBoard: string[]
  /** Tous les scores sont saisis. */
  complete: boolean
}

export interface PoolStanding {
  rank: number
  team: TeamRef
  played: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  diff: number
  /** Déclarée forfait : classée après toutes les autres. */
  forfeit: boolean
  /** Forfait encore annulable : aucune partie tirée sans elle, tableaux pas générés. */
  forfeitCancellable: boolean
}

/** Poules, publiques telles quelles : seulement des noms d'équipe et des scores. */
export interface PoolView {
  /** Dernière partie lancée, `null` avant la partie 1. */
  currentRound: number | null
  rounds: PoolRoundView[]
  standings: PoolStanding[]
}

function teamRef(state: EditionState, teamId: string): TeamRef {
  const team = state.teams.find((t) => t.id === teamId)
  return { id: teamId, name: team ? teamName(team) : teamId }
}

/** Planches d'une partie, rejouées : matchs lancés dans l'ordre du tirage, libérés dans l'ordre des saisies. */
function roundBoards(state: EditionState, round: PoolRound): BoardAllocation {
  let boards = round.matches.reduce((b, m) => launchMatch(b, m.id), initialBoards(round.boardOrder))
  const ids = new Set(round.matches.map((m) => m.id))
  for (const id of state.pool.finishOrder) if (ids.has(id)) boards = releaseMatch(boards, id)
  return boards
}

function roundView(state: EditionState, round: PoolRound): PoolRoundView {
  const boards = roundBoards(state, round)
  const matches = round.matches.map((m): PoolMatchView => {
    const result = effectiveScore(state, m)
    const board = boards.boardOf[m.id] ?? null
    return {
      id: m.id,
      round: round.round,
      board,
      teamA: teamRef(state, m.teamA),
      teamB: teamRef(state, m.teamB),
      score: result?.score ?? null,
      forfeit: result?.forfeit ?? null,
      status: result ? 'done' : board === null ? 'waiting-board' : 'playing',
    }
  })
  const queue = (id: string) => boards.waiting.indexOf(id)
  // Sur une même planche, le match en cours avant celui déjà joué.
  const done = (m: PoolMatchView) => (m.score ? 1 : 0)
  matches.sort((x, y) => (x.board ?? Infinity) - (y.board ?? Infinity) || done(x) - done(y) || queue(x.id) - queue(y.id))
  const byeScore = state.edition!.settings.byeScore
  return {
    round: round.round,
    matches,
    bye: round.bye ? { team: teamRef(state, round.bye), score: { a: byeScore.winner, b: byeScore.loser } } : null,
    awaitingScore: matches.filter((m) => !m.score).map((m) => m.id),
    awaitingBoard: [...boards.waiting],
    complete: matches.every((m) => m.score),
  }
}

/**
 * Classement des poules : victoires ↓, points pour ↓, différence ↓, points
 * contre ↑, puis ordre d'inscription. Un exempt compte comme une victoire au
 * score d'exempt réglé. Seuls les matchs saisis comptent, et ceux gagnés
 * 13-0 par forfait. Les équipes forfait sont classées après toutes les autres.
 */
export function poolStandings(state: EditionState): PoolStanding[] {
  const ids = poolTeamIds(state)
  const order = state.teams.filter((t) => ids.has(t.id))
  const rows = new Map(order.map((t, i) => [t.id, { index: i, team: teamRef(state, t.id), played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }]))
  const add = (teamId: string, scored: number, conceded: number) => {
    const row = rows.get(teamId)
    if (!row) return
    row.played++
    row.pointsFor += scored
    row.pointsAgainst += conceded
    if (scored > conceded) row.wins++
    else row.losses++
  }
  const bye = state.edition!.settings.byeScore
  for (const r of state.pool.rounds) {
    for (const m of r.matches) {
      const score = effectiveScore(state, m)?.score
      if (!score) continue
      add(m.teamA, score.a, score.b)
      add(m.teamB, score.b, score.a)
    }
    if (r.bye) add(r.bye, bye.winner, bye.loser)
  }
  return [...rows.values()]
    .map((row) => {
      const f = state.forfeits[row.team.id]
      const forfeit = f?.inBrackets === false
      const forfeitCancellable = forfeit && !state.brackets.grids && state.pool.rounds.length <= f.afterRound
      return { ...row, diff: row.pointsFor - row.pointsAgainst, forfeit, forfeitCancellable }
    })
    .sort((x, y) => Number(x.forfeit) - Number(y.forfeit) || y.wins - x.wins || y.pointsFor - x.pointsFor || y.diff - x.diff || x.pointsAgainst - y.pointsAgainst || x.index - y.index)
    .map(({ index: _index, ...row }, i) => ({ rank: i + 1, ...row }))
}

export function poolView(state: EditionState): PoolView {
  const rounds = state.pool.rounds.map((r) => roundView(state, r))
  return { currentRound: rounds.at(-1)?.round ?? null, rounds, standings: poolStandings(state) }
}

/** Prochain match d'une équipe dans la partie en cours (téléphone « mon équipe », télé). */
export type NextMatch =
  | { kind: 'match'; round: number; matchId: string; board: number | null; opponent: TeamRef }
  | { kind: 'bye'; round: number; score: Score }

/** `null` : pas de match à jouer (pas encore de partie, ou score déjà saisi). */
export function nextMatchOf(state: EditionState, teamId: string): NextMatch | null {
  const last = state.pool.rounds.at(-1)
  if (!last || teamId in state.forfeits) return null
  const round = roundView(state, last)
  if (round.bye?.team.id === teamId) return { kind: 'bye', round: last.round, score: round.bye.score }
  const match = round.matches.find((m) => playsIn(m, teamId))
  if (!match || match.score) return null
  const opponent = match.teamA.id === teamId ? match.teamB : match.teamA
  return { kind: 'match', round: last.round, matchId: match.id, board: match.board, opponent }
}
