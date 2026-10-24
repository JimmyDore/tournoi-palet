import { describe, expect, it } from 'vitest'
import { bracketsView, correctionImpact, describeEvent, finalRanking, replay, type BracketMatchView, type Command } from './index.ts'
import { seededRng, randomInt } from './rng.ts'
import { createEdition, run, type Harness } from './testing.ts'

// Tableaux : corrections en cascade, forfaits et matchs prêts.

/** `count` équipes pointées, les 4 parties de poule jouées, tableaux générés avec la répartition proposée. */
function bracketsReady(count: number, settings = {}): Harness {
  const ids = Array.from({ length: count }, (_, i) => i + 1)
  const t = run([
    createEdition({ maxTeams: Math.max(48, count), ...settings }),
    ...ids.map((i): Command => ({ type: 'registerTeam', team: { player1: `J${i}a`, player2: `J${i}b` } })),
    ...ids.map((i): Command => ({ type: 'checkInTeam', teamId: `t${i}` })),
  ])
  let k = 0
  for (let round = 1; round <= 4; round++) {
    t.apply({ type: 'drawPoolRound', round })
    for (const m of t.state.pool.rounds.at(-1)!.matches) {
      k++
      t.apply({ type: 'enterPoolScore', matchId: m.id, scoreA: 13, scoreB: k % 13 })
    }
  }
  t.apply({ type: 'validateSplit', principalCount: bracketsView(t.state).split.proposedPrincipal })
  return t.apply({ type: 'generateBrackets' })
}

const allMatches = (t: Harness) => bracketsView(t.state).brackets.flatMap((b) => b.rounds.flatMap((r) => r.matches))
const match = (t: Harness, id: string) => allMatches(t).find((m) => m.id === id)!
const round = (t: Harness, key: 'P' | 'C', n: number) => bracketsView(t.state).brackets.find((b) => b.key === key)!.rounds[n - 1].matches
const score = (t: Harness, id: string, scoreA: number, scoreB: number, confirm?: boolean) =>
  t.apply({ type: 'enterBracketScore', matchId: id, scoreA, scoreB, ...(confirm ? { confirm } : {}) })
const has = (m: BracketMatchView, teamId: string) => m.teamA?.id === teamId || m.teamB?.id === teamId
const name = (m: BracketMatchView, side: 'A' | 'B') => (side === 'A' ? m.teamA : m.teamB)!.name

/** Planches des matchs en cours : jamais deux fois la même, et aucun match n'attend tant qu'une planche est libre. */
function expectBoardsCoherent(t: Harness) {
  const live = bracketsView(t.state).live
  const boards = live.filter((m) => m.status === 'playing').map((m) => m.board)
  expect(new Set(boards).size).toBe(boards.length)
  const waiting = live.filter((m) => m.status === 'waiting-board').length
  if (waiting > 0) expect(boards.length).toBe(t.state.edition!.settings.boards)
}

describe('correction qui change le vainqueur', () => {
  /** 12 équipes : Principal de 8 (1/4, 1/2, finale). Le 1/4 joué (A gagne), les deux 1/2 aussi : la finale est sur la planche 1. */
  function finalLaunched(): Harness {
    const t = bracketsReady(12, { boards: 6 })
    for (const m of round(t, 'P', 1)) score(t, m.id, 13, 5)
    score(t, 'P:2:0', 13, 9)
    score(t, 'P:2:1', 13, 7)
    expect(match(t, 'P:3:0')).toMatchObject({ status: 'playing', board: 1 })
    return t
  }

  it('annonce l’impact sur deux niveaux, puis l’applique en cascade une fois confirmée', () => {
    const t = finalLaunched()
    const q0 = match(t, 'P:1:0')
    const semi = match(t, 'P:2:0')
    const impact = correctionImpact(t.state, 'P:1:0', 4, 13)
    expect(impact.winnerChanged).toBe(true)
    // Les deux lignes du Principal ; les suivantes concernent le Challenge Principal (voir plus bas).
    expect(impact.changes.slice(0, 2)).toEqual([
      `« ${name(q0, 'B')} » remplace « ${name(q0, 'A')} » en 1/2 du Principal, planche ${semi.board} ; le score 13-9 déjà saisi sera effacé`,
      `« ${name(q0, 'A')} » n’est plus qualifiée en finale du Principal, planche 1`,
    ])
    // Sans confirmation : refusé, la raison est l'impact.
    const reason = t.refusal({ type: 'enterBracketScore', matchId: 'P:1:0', scoreA: 4, scoreB: 13 })
    expect(reason).toContain(`Le vainqueur change : « ${name(q0, 'B')} » au lieu de « ${name(q0, 'A')} ».`)
    expect(reason).toContain(impact.changes[0])
    expect(reason).toContain(impact.changes[1])

    score(t, 'P:1:0', 4, 13, true)
    // 1/2 rejouée avec la nouvelle équipe, son ancien score effacé pour de bon.
    expect(match(t, 'P:2:0')).toMatchObject({ teamA: { id: q0.teamB!.id }, teamB: { id: semi.teamB!.id }, score: null, status: 'playing' })
    expect(t.state.brackets.scores['P:2:0']).toBeUndefined()
    // Finale : une équipe à déterminer, plus lancée, sa planche rendue.
    expect(match(t, 'P:3:0')).toMatchObject({ teamA: null, status: 'pending', board: null })
    expectBoardsCoherent(t)
    // Le tableau repart : la 1/2 rejouée relance la finale.
    score(t, 'P:2:0', 13, 2)
    expect(match(t, 'P:3:0')).toMatchObject({ teamA: { id: q0.teamB!.id }, status: 'playing' })
    expectBoardsCoherent(t)
  })

  it('même vainqueur : pas de confirmation, la suite du tableau ne bouge pas', () => {
    const t = finalLaunched()
    expect(correctionImpact(t.state, 'P:1:0', 13, 11)).toEqual({ winnerChanged: false, changes: [] })
    score(t, 'P:1:0', 13, 11)
    expect(match(t, 'P:2:0').score).toEqual({ a: 13, b: 9 })
    expect(match(t, 'P:3:0')).toMatchObject({ status: 'playing', board: 1 })
  })

  it('un vainqueur de finale qui change demande aussi confirmation, sans autre match touché', () => {
    const t = finalLaunched()
    score(t, 'P:3:0', 13, 10)
    const final = match(t, 'P:3:0')
    expect(t.refusal({ type: 'enterBracketScore', matchId: 'P:3:0', scoreA: 10, scoreB: 13 })).toBe(
      `Le vainqueur change : « ${name(final, 'B')} » au lieu de « ${name(final, 'A')} ».\nAucun autre match n’est touché.\nConfirmez pour corriger.`,
    )
    score(t, 'P:3:0', 10, 13, true)
    expect(bracketsView(t.state).brackets[0].winner!.id).toBe(final.teamB!.id)
  })

  it('les planches restent cohérentes au fil de corrections au hasard', () => {
    const t = bracketsReady(24, { boards: 5 })
    const rng = seededRng(7)
    for (let step = 0; step < 120; step++) {
      const done = allMatches(t).filter((m) => m.status === 'done' && !m.forfeit)
      const live = bracketsView(t.state).live
      if (live.length === 0 && done.length === 0) break
      if (done.length > 0 && (live.length === 0 || randomInt(rng, 4) === 0)) {
        const m = done[randomInt(rng, done.length)]
        const flip = m.score!.a > m.score!.b
        score(t, m.id, flip ? 6 : 13, flip ? 13 : 6, true)
      } else {
        const m = live[randomInt(rng, live.length)]
        score(t, m.id, 13, randomInt(rng, 13))
      }
      expectBoardsCoherent(t)
    }
  })
})

describe('cascade vers le Challenge', () => {
  it('un vainqueur du 1er tour du Principal qui change refait le Challenge Principal et efface ses scores devenus faux', () => {
    const t = bracketsReady(12, { boards: 8 })
    const q0 = match(t, 'P:1:0')
    for (const m of round(t, 'P', 1)) score(t, m.id, 13, 5)
    const cp = () => bracketsView(t.state).brackets.find((b) => b.key === 'CP')!.rounds[0].matches
    const cpTeams = () => cp().flatMap((m) => [m.teamA!.id, m.teamB!.id])
    expect(cpTeams()).toContain(q0.teamB!.id)
    const played = cp()[0]
    score(t, played.id, 13, 9)
    const impact = correctionImpact(t.state, 'P:1:0', 4, 13)
    expect(impact.changes.some((c) => c.includes('du Challenge Principal'))).toBe(true)
    score(t, 'P:1:0', 4, 13, true)
    expect(cpTeams()).toContain(q0.teamA!.id)
    expect(cpTeams()).not.toContain(q0.teamB!.id)
    // Plus aucun score mémorisé avec d'autres équipes que celles du match.
    const derived = new Map(allMatches(t).map((m) => [m.id, m]))
    for (const [id, s] of Object.entries(t.state.brackets.scores)) {
      expect([s.teamA, s.teamB]).toEqual([derived.get(id)!.teamA!.id, derived.get(id)!.teamB!.id])
    }
    expect(cp().every((m) => m.status === 'playing' || (m.status === 'done' && m.teamA!.id === played.teamA!.id && m.teamB!.id === played.teamB!.id))).toBe(true)
    expectBoardsCoherent(t)
  })
})

describe('forfait en tableau et classement final', () => {
  it('le forfaité est classé à sa place d’élimination, avec une défaite 13-0', () => {
    const t = bracketsReady(12, { boards: 8 })
    const q0 = match(t, 'P:1:0')
    const quitter = q0.teamA!
    t.apply({ type: 'declareForfeit', teamId: quitter.id })
    for (const m of bracketsView(t.state).live.filter((m) => m.bracket === 'P')) score(t, m.id, 13, 5)
    // Perdant du 1er tour du Principal : il va au Challenge Principal, où il perd aussi 13-0.
    const cpMatch = bracketsView(t.state).brackets.find((b) => b.key === 'CP')!.rounds[0].matches.find((m) => has(m, quitter.id))!
    expect(cpMatch).toMatchObject({ status: 'done', forfeit: quitter.id })
    for (const m of bracketsView(t.state).live.filter((m) => m.bracket === 'CP')) score(t, m.id, 13, 5)
    const row = finalRanking(t.state).rows.find((r) => r.team.id === quitter.id)!
    expect(row).toMatchObject({ block: 'CP', eliminatedIn: '1/2', poolRank: quitter.poolRank })
    // Challenge Principal de 4 (places 5 à 8) : à tour égal, sa défaite 13-0 le met derrière l'autre perdant (13-5).
    expect(row.place).toBe(8)
  })
})

describe('forfait en tableau', () => {
  it('pendant son match : l’adversaire gagne 13-0 et avance, la planche passe au match en attente', () => {
    const t = bracketsReady(12, { boards: 4 })
    const q0 = match(t, 'P:1:0')
    expect(match(t, 'C:1:0').status).toBe('waiting-board')
    t.apply({ type: 'declareForfeit', teamId: q0.teamA!.id })
    expect(match(t, 'P:1:0')).toMatchObject({ score: { a: 0, b: 13 }, forfeit: q0.teamA!.id, status: 'done' })
    expect(match(t, 'C:1:0')).toMatchObject({ status: 'playing', board: 1 })
    expect(match(t, 'P:2:0').teamA!.id).toBe(q0.teamB!.id)
    expect(t.refusal({ type: 'enterBracketScore', matchId: 'P:1:0', scoreA: 13, scoreB: 4 })).toBe(
      `« ${name(q0, 'A')} » est forfait : « ${name(q0, 'B')} » gagne ce match 13-0.`,
    )
    expectBoardsCoherent(t)
  })

  it('qualifiée pour le tour suivant : elle le perd 13-0 dès que l’adversaire est connu, sans planche', () => {
    const t = bracketsReady(12, { boards: 6 })
    const q0 = match(t, 'P:1:0')
    const q1 = match(t, 'P:1:1')
    score(t, 'P:1:0', 13, 5)
    t.apply({ type: 'declareForfeit', teamId: q0.teamA!.id })
    expect(match(t, 'P:2:0')).toMatchObject({ teamB: null, score: null, status: 'pending' })
    score(t, 'P:1:1', 2, 13)
    expect(match(t, 'P:2:0')).toMatchObject({ teamB: { id: q1.teamB!.id }, score: { a: 0, b: 13 }, status: 'done', board: null })
    // Le reste du tour : la 1/2 restante est lancée, la finale attend son second finaliste.
    score(t, 'P:1:2', 13, 1)
    score(t, 'P:1:3', 13, 1)
    expect(match(t, 'P:2:1').status).toBe('playing')
    expect(match(t, 'P:3:0')).toMatchObject({ teamA: { id: q1.teamB!.id }, teamB: null })
    expectBoardsCoherent(t)
  })

  it('exempte au premier tour : elle perd son premier vrai match, et son classement des poules ne bouge pas', () => {
    const t = bracketsReady(10)
    const bye = round(t, 'P', 1).find((m) => m.status === 'bye')!
    const exempt = (bye.teamA ?? bye.teamB)!
    t.apply({ type: 'declareForfeit', teamId: exempt.id })
    expect(t.refusal({ type: 'cancelForfeit', teamId: exempt.id })).toBe('Les tableaux sont générés : un forfait de poule ne peut plus être annulé.')
    const next = round(t, 'P', 2).find((m) => m.teamA?.id === exempt.id || m.teamB?.id === exempt.id)!
    expect(next).toMatchObject({ score: null, status: 'pending' })
    for (const m of bracketsView(t.state).live.filter((m) => m.bracket === 'P')) score(t, m.id, 13, 4)
    const lost = match(t, next.id)
    expect(lost).toMatchObject({ status: 'done', forfeit: exempt.id })
    const [mine, theirs] = lost.teamA!.id === exempt.id ? [lost.score!.a, lost.score!.b] : [lost.score!.b, lost.score!.a]
    expect([mine, theirs]).toEqual([0, 13])
    // Forfait de tableau : elle garde son rang des poules (il sert aux Challenges et au classement final).
    expect([lost.teamA, lost.teamB].find((x) => x!.id === exempt.id)!.poolRank).toBe(exempt.poolRank)
    expectBoardsCoherent(t)
  })
})

describe('journal', () => {
  const lastLine = (t: Harness) => describeEvent(replay(t.events.slice(0, -1)), t.state, t.events.at(-1)!).label

  it('dit la cascade d’une correction, le forfait en tableau et les matchs prêts lancés', () => {
    const t = bracketsReady(12, { boards: 6 })
    for (const m of round(t, 'P', 1)) score(t, m.id, 13, 5)
    score(t, 'P:2:0', 13, 9)
    score(t, 'P:1:0', 4, 13, true)
    expect(lastLine(t)).toBe('Score corrigé (Principal, 1/4, planche 1) ; vainqueur changé, 4 matchs suivants modifiés, 1 score effacé')
    const semi = match(t, 'P:2:1')
    t.apply({ type: 'declareForfeit', teamId: semi.teamA!.id })
    expect(lastLine(t)).toBe(`Équipe « ${name(semi, 'A')} » déclarée forfait ; « ${name(semi, 'B')} » gagne 13-0 (Principal, 1/2) et avance`)
    const c = round(t, 'C', 1)
    score(t, c[0].id, 13, 5)
    // Consolante de 4 : la finale attend le second 1/2 ; rien n'est prêt.
    expect(t.refusal({ type: 'launchReadyMatches' })).not.toBeNull()
  })

  it('les matchs prêts lancés', () => {
    const t = bracketsReady(48, { boards: 26 })
    for (const m of round(t, 'P', 1).slice(0, 4)) score(t, m.id, 13, 5)
    t.apply({ type: 'launchReadyMatches' })
    expect(lastLine(t)).toBe('2 matchs prêts lancés (2 en 1/8 du Principal)')
  })
})

describe('lancer les matchs prêts', () => {
  it('lance les matchs du tour suivant dont les deux équipes sont connues, sur les plus petites planches libres', () => {
    const t = bracketsReady(48)
    const first = round(t, 'P', 1)
    for (const m of first.slice(0, 15)) score(t, m.id, 13, 5)
    expect(bracketsView(t.state).ready).toBe(7)
    t.apply({ type: 'launchReadyMatches' })
    expect(round(t, 'P', 2).map((m) => [m.status, m.board])).toEqual([...[1, 2, 3, 4, 5, 6, 7].map((b) => ['playing', b]), ['pending', null]])
    expect(bracketsView(t.state).ready).toBe(0)
    expect(t.refusal({ type: 'launchReadyMatches' })).toBe('Aucun match prêt : pas de match non lancé dont les deux équipes sont connues.')
    // Le dernier 1/16 joué : le 1/8 restant part par la règle des tours synchronisés.
    score(t, first[15].id, 13, 5)
    expect(round(t, 'P', 2)[7]).toMatchObject({ status: 'playing', board: 8 })
    expectBoardsCoherent(t)
  })

  it('sans planche libre, les matchs prêts vont dans la file', () => {
    const t = bracketsReady(12, { boards: 4 })
    // 4 planches : le Principal (4 matchs) les occupe, la Consolante attend.
    score(t, 'P:1:0', 13, 5)
    score(t, 'P:1:1', 13, 5)
    t.apply({ type: 'launchReadyMatches' })
    expect(bracketsView(t.state).live.map((m) => [m.id, m.status, m.board])).toEqual([
      ['C:1:0', 'playing', 1],
      ['C:1:1', 'playing', 2],
      ['P:1:2', 'playing', 3],
      ['P:1:3', 'playing', 4],
      ['P:2:0', 'waiting-board', null],
    ])
    // Une planche libérée va au premier de la file.
    score(t, 'P:1:2', 13, 5)
    expect(match(t, 'P:2:0')).toMatchObject({ status: 'playing', board: 3 })
  })
})
