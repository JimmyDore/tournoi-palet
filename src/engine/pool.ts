import { initialBoards, launchMatch, releaseMatch, type BoardAllocation } from './boards.ts'
import { participants } from './checkin.ts'
import { shuffle } from './rng.ts'
import { scoreProblem, type Score } from './score.ts'
import type { EditionState } from './state.ts'
import { teamName } from './teams.ts'
import { accept, refuse, type Ctx, type Decision } from './types.ts'

// Poules : parties tirées au hasard, une planche par match, scores par match.
// Tout le reste (planches en cours, file d'attente, classement) est recalculé.

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

export type PoolCommand = DrawPoolRound | EnterPoolScore

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

export type PoolEvent = PoolRoundDrawn | PoolScoreEntered

// --- decide / evolve -------------------------------------------------------

export function decidePool(state: EditionState, command: PoolCommand, ctx: Ctx): Decision<PoolEvent> {
  switch (command.type) {
    case 'drawPoolRound': {
      const next = state.pool.rounds.length + 1
      if (command.round !== next) {
        return refuse(command.round < next ? `La partie ${command.round} est déjà lancée.` : `Lancez d’abord la partie ${next}.`)
      }
      // Ticket 06 : parties suivantes (sans revoir un adversaire), forfaits.
      if (next > 1) return refuse('Seule la partie 1 peut être lancée pour l’instant.')
      const players = participants(state)
      if (players.length < 2) return refuse(`Il faut au moins 2 équipes pointées pour lancer la partie 1 (${players.length} pointée${players.length > 1 ? 's' : ''}).`)
      const drawn = shuffle(ctx.rng, players.map((t) => t.id))
      const bye = drawn.length % 2 === 1 ? drawn.pop()! : null
      const matches: PoolMatch[] = []
      for (let i = 0; i < drawn.length; i += 2) matches.push({ id: `r${next}m${i / 2 + 1}`, teamA: drawn[i], teamB: drawn[i + 1] })
      const boards = Array.from({ length: state.edition!.settings.boards }, (_, i) => i + 1)
      return accept({ type: 'poolRoundDrawn', at: ctx.now, round: next, matches, bye, boardOrder: shuffle(ctx.rng, boards) })
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
  }
}

export function evolvePool(state: EditionState, event: PoolEvent): EditionState {
  const pool = state.pool
  switch (event.type) {
    case 'poolRoundDrawn': {
      const { round, matches, bye, boardOrder, at } = event
      return { ...state, pool: { ...pool, rounds: [...pool.rounds, { round, matches, bye, boardOrder, drawnAt: at }] } }
    }
    case 'poolScoreEntered': {
      const first = !(event.matchId in pool.scores)
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

export interface PoolTeamRef {
  id: string
  name: string
}

/** `playing` : sur sa planche, sans score ; `waiting-board` : pas de planche libre ; `done` : score saisi. */
export type PoolMatchStatus = 'playing' | 'waiting-board' | 'done'

export interface PoolMatchView {
  id: string
  round: number
  /** Planche où le match se joue (ou s'est joué) ; `null` s'il attend une planche. */
  board: number | null
  teamA: PoolTeamRef
  teamB: PoolTeamRef
  score: Score | null
  status: PoolMatchStatus
}

export interface PoolRoundView {
  round: number
  /** Par planche croissante (sur une même planche, le match en cours d'abord), puis les matchs en attente de planche dans l'ordre de la file. */
  matches: PoolMatchView[]
  bye: { team: PoolTeamRef; score: Score } | null
  /** Matchs sans score (« en attente de score »), par planche. */
  awaitingScore: string[]
  /** Matchs en attente de planche, dans l'ordre de la file. */
  awaitingBoard: string[]
  /** Tous les scores sont saisis. */
  complete: boolean
}

export interface PoolStanding {
  rank: number
  team: PoolTeamRef
  played: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  diff: number
}

/** Poules, publiques telles quelles : seulement des noms d'équipe et des scores. */
export interface PoolView {
  /** Dernière partie lancée, `null` avant la partie 1. */
  currentRound: number | null
  rounds: PoolRoundView[]
  standings: PoolStanding[]
}

function teamRef(state: EditionState, teamId: string): PoolTeamRef {
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
    const score = state.pool.scores[m.id]
    const board = boards.boardOf[m.id] ?? null
    return {
      id: m.id,
      round: round.round,
      board,
      teamA: teamRef(state, m.teamA),
      teamB: teamRef(state, m.teamB),
      score: score ? { a: score.a, b: score.b } : null,
      status: score ? 'done' : board === null ? 'waiting-board' : 'playing',
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
 * score d'exempt réglé. Seuls les matchs saisis comptent.
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
      const score = state.pool.scores[m.id]
      if (!score) continue
      add(m.teamA, score.a, score.b)
      add(m.teamB, score.b, score.a)
    }
    if (r.bye) add(r.bye, bye.winner, bye.loser)
  }
  return [...rows.values()]
    .map((row) => ({ ...row, diff: row.pointsFor - row.pointsAgainst }))
    .sort((x, y) => y.wins - x.wins || y.pointsFor - x.pointsFor || y.diff - x.diff || x.pointsAgainst - y.pointsAgainst || x.index - y.index)
    .map(({ index: _index, ...row }, i) => ({ rank: i + 1, ...row }))
}

export function poolView(state: EditionState): PoolView {
  const rounds = state.pool.rounds.map((r) => roundView(state, r))
  return { currentRound: rounds.at(-1)?.round ?? null, rounds, standings: poolStandings(state) }
}

/** Prochain match d'une équipe dans la partie en cours (téléphone « mon équipe », télé). */
export type NextMatch =
  | { kind: 'match'; round: number; matchId: string; board: number | null; opponent: PoolTeamRef }
  | { kind: 'bye'; round: number; score: Score }

/** `null` : pas de match à jouer (pas encore de partie, ou score déjà saisi). */
export function nextMatchOf(state: EditionState, teamId: string): NextMatch | null {
  const last = state.pool.rounds.at(-1)
  if (!last) return null
  const round = roundView(state, last)
  if (round.bye?.team.id === teamId) return { kind: 'bye', round: last.round, score: round.bye.score }
  const match = round.matches.find((m) => m.teamA.id === teamId || m.teamB.id === teamId)
  if (!match || match.score) return null
  const opponent = match.teamA.id === teamId ? match.teamB : match.teamA
  return { kind: 'match', round: last.round, matchId: match.id, board: match.board, opponent }
}
