import { describe, expect, it } from 'vitest'
import { bracketsView, milestones, openMatches, type BracketKey, type BracketMatchView } from './index.ts'
import { bracketsReady, type Harness } from './testing.ts'

// Challenges : les perdants des vrais matchs du 1er tour du Principal (resp.
// de la Consolante) jouent le Challenge Principal (resp. Consolante).

const bracket = (t: Harness, key: BracketKey) => bracketsView(t.state).brackets.find((b) => b.key === key)
const round = (t: Harness, key: BracketKey, n: number) => bracket(t, key)!.rounds[n - 1].matches
const open = (m: BracketMatchView) => m.status === 'playing' || m.status === 'waiting-board'
/** Fait gagner l'équipe A (13-5) ou B (4-13). */
const win = (t: Harness, m: BracketMatchView, side: 'A' | 'B' = 'A') =>
  t.apply({ type: 'enterBracketScore', matchId: m.id, scoreA: side === 'A' ? 13 : 4, scoreB: side === 'A' ? 5 : 13 })
const loserOf = (m: BracketMatchView) => (m.score!.a > m.score!.b ? m.teamB! : m.teamA!)

describe('Challenges', () => {
  it('n’existent pas tant que le 1er tour du tableau parent n’est pas complet', () => {
    const t = bracketsReady(48)
    const first = round(t, 'P', 1)
    for (const m of first.slice(0, 15)) win(t, m)
    expect(bracket(t, 'CP')).toBeUndefined()
    expect(bracketsView(t.state).brackets.map((b) => b.key)).toEqual(['P', 'C'])
  })

  it('48 équipes : les 16 perdants du 1er tour du Principal jouent le Challenge Principal, en têtes de série', () => {
    const t = bracketsReady(48)
    const first = round(t, 'P', 1)
    first.forEach((m, i) => win(t, m, i % 2 ? 'B' : 'A'))
    const played = round(t, 'P', 1)
    const cp = bracket(t, 'CP')!
    expect(bracketsView(t.state).brackets.map((b) => b.key)).toEqual(['P', 'CP', 'C'])
    expect(cp).toMatchObject({ name: 'Challenge Principal', teams: 16, size: 16, byes: 0 })
    expect(cp.rounds.map((r) => r.name)).toEqual(['1/8', '1/4', '1/2', 'Finale'])
    // Les perdants, triés par classement des poules : la 1re tête affronte la 16e, la 2e est dans l'autre moitié.
    const losers = played.map(loserOf).sort((x, y) => x.poolRank - y.poolRank)
    const cp1 = round(t, 'CP', 1)
    expect([cp1[0].teamA!.id, cp1[0].teamB!.id]).toEqual([losers[0].id, losers[15].id])
    expect(cp1[4].teamA!.id).toBe(losers[1].id)
    // Lancés d'emblée, comme les 1/8 du Principal.
    expect(cp1.every(open)).toBe(true)
    expect(round(t, 'P', 2).every(open)).toBe(true)
  })

  it('une équipe exemptée au 1er tour ne va pas au Challenge ; les exempts du Challenge vont aux mieux classés', () => {
    // 40 équipes : Principal 27 (5 exempts, 11 vrais matchs), Consolante 13 (3 exempts, 5 vrais matchs).
    const t = bracketsReady(40)
    for (const m of round(t, 'P', 1).filter(open)) win(t, m, 'B')
    const cp = bracket(t, 'CP')!
    expect(cp).toMatchObject({ teams: 11, size: 16, byes: 5 })
    const exempted = new Set(round(t, 'P', 1).filter((m) => m.status === 'bye').map((m) => (m.teamA ?? m.teamB)!.id))
    const cpTeams = round(t, 'CP', 1).flatMap((m) => [m.teamA, m.teamB]).filter((x) => x !== null)
    expect(cpTeams.some((x) => exempted.has(x.id))).toBe(false)
    const ranked = [...cpTeams].sort((x, y) => x.poolRank - y.poolRank)
    const byes = round(t, 'CP', 1).filter((m) => m.status === 'bye').map((m) => (m.teamA ?? m.teamB)!.id)
    expect(new Set(byes)).toEqual(new Set(ranked.slice(0, 5).map((x) => x.id)))

    for (const m of round(t, 'C', 1).filter(open)) win(t, m)
    expect(bracket(t, 'CC')).toMatchObject({ name: 'Challenge Consolante', teams: 5, size: 8, byes: 3 })
    expect(bracketsView(t.state).brackets.map((b) => b.key)).toEqual(['P', 'CP', 'C', 'CC'])
  })

  it('se jouent jusqu’à leur finale, tours synchronisés et répétition générale comprise', () => {
    const t = bracketsReady(48, { isTest: true })
    while (openMatches(t.state).length > 0) t.apply({ type: 'fillRandomScores' })
    const view = bracketsView(t.state)
    expect(view.brackets.map((b) => b.key)).toEqual(['P', 'CP', 'C', 'CC'])
    for (const b of view.brackets) expect(b.winner).not.toBeNull()
    expect(view.live).toEqual([])
    expect(milestones(t.state)).toContain('tableau-CP-tour-4')
    expect(milestones(t.state)).toContain('tableau-CC-tour-3')
  })

  it('un Challenge d’une seule équipe n’a pas de match : elle le gagne d’office', () => {
    // 6 équipes : Principal 4 (2 matchs), Consolante 2 (1 match) → Challenge Consolante d'une équipe.
    const t = bracketsReady(6)
    win(t, round(t, 'C', 1)[0])
    const cc = bracket(t, 'CC')!
    expect(cc).toMatchObject({ teams: 1, rounds: [] })
    expect(cc.winner!.id).toBe(loserOf(round(t, 'C', 1)[0]).id)
  })
})
