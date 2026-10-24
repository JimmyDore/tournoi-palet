import { describe, expect, it } from 'vitest'
import { bracketsView, myTeamView, openMatches, publicView, replay, type BracketKey, type BracketMatchView } from './index.ts'
import { bracketsReady, type Harness } from './testing.ts'

// « Mon équipe » dans les tableaux : prochaine planche, adversaire, tour et
// tableau, puis la place finale une fois définitive.

const mine = (t: Harness, teamId: string) => myTeamView(publicView(t.state), teamId)!
const round = (t: Harness, key: BracketKey, n: number) => bracketsView(t.state).brackets.find((b) => b.key === key)!.rounds[n - 1].matches
const named = (team: BracketMatchView['teamA']) => ({ id: team!.id, name: team!.name })
/** L'équipe A gagne, sur le score de défaite donné. */
const winA = (t: Harness, m: BracketMatchView, losing = 5) => t.apply({ type: 'enterBracketScore', matchId: m.id, scoreA: 13, scoreB: losing })

// 12 équipes : Principal de 8 (1/4, 1/2, finale), Consolante de 4, 24 planches.

describe('mon équipe dans les tableaux', () => {
  it('attend les tableaux une fois les 4 parties de poule jouées', () => {
    const t = bracketsReady(12)
    const pools = replay(t.events.slice(0, -2))
    expect(myTeamView(publicView(pools), 't1')!.next).toEqual({ kind: 'pools-done' })
  })

  it('donne la planche, l’adversaire, le tour et le tableau', () => {
    const t = bracketsReady(12)
    const [m] = round(t, 'P', 1)
    expect(mine(t, m.teamA!.id).next).toEqual({
      kind: 'bracket-board',
      bracket: 'P',
      bracketName: 'Principal',
      roundName: '1/4',
      board: m.board,
      opponent: named(m.teamB),
    })
  })

  it('dit « en attente de planche » quand toutes les planches sont prises', () => {
    const t = bracketsReady(12, { boards: 2 })
    const [m] = round(t, 'C', 1)
    expect(m.status).toBe('waiting-board')
    expect(mine(t, m.teamB!.id).next).toEqual({ kind: 'bracket-waiting-board', bracket: 'C', bracketName: 'Consolante', roundName: '1/2', opponent: named(m.teamA) })
  })

  it('qualifiée : attend son adversaire, puis le lancement du tour', () => {
    const t = bracketsReady(12)
    const [m0, m1] = round(t, 'P', 1)
    winA(t, m0)
    expect(mine(t, m0.teamA!.id).next).toEqual({ kind: 'bracket-pending', bracket: 'P', bracketName: 'Principal', roundName: '1/2', opponent: null })
    winA(t, m1)
    expect(mine(t, m0.teamA!.id).next).toMatchObject({ kind: 'bracket-pending', roundName: '1/2', opponent: named(m1.teamA) })
  })

  it('perdante du 1er tour : attend son Challenge, puis y reçoit sa planche', () => {
    const t = bracketsReady(12)
    const first = round(t, 'P', 1)
    winA(t, first[0])
    const loser = first[0].teamB!.id
    expect(mine(t, loser).next).toEqual({ kind: 'challenge-waiting', bracket: 'CP', bracketName: 'Challenge Principal' })
    for (const m of first.slice(1)) winA(t, m)
    expect(mine(t, loser).next).toMatchObject({ kind: 'bracket-board', bracket: 'CP', bracketName: 'Challenge Principal', roundName: '1/2' })
  })

  it('éliminée : place provisoire tant que son tour n’est pas fini, puis place finale', () => {
    const t = bracketsReady(12)
    for (const m of round(t, 'P', 1)) winA(t, m)
    const [c0, c1] = round(t, 'CP', 1)
    winA(t, c0, 5)
    // Challenge Principal = places 5 à 8 ; l'autre demi-finale n'est pas jouée.
    expect(mine(t, c0.teamB!.id).next).toEqual({ kind: 'eliminated', place: 8, blockName: 'Challenge Principal', eliminatedIn: '1/2' })
    winA(t, c1, 4)
    expect(mine(t, c0.teamB!.id).next).toEqual({ kind: 'final-place', place: 7, teamCount: 12, blockName: 'Challenge Principal', eliminatedIn: '1/2' })
    expect(mine(t, c1.teamB!.id).next).toMatchObject({ kind: 'final-place', place: 8 })
  })

  it('vainqueur du Principal : 1re, avec son parcours', () => {
    const t = bracketsReady(12, { isTest: true })
    while (openMatches(t.state).length > 0) t.apply({ type: 'fillRandomScores' })
    const winner = bracketsView(t.state).brackets.find((b) => b.key === 'P')!.winner!
    const view = mine(t, winner.id)
    expect(view.next).toEqual({ kind: 'final-place', place: 1, teamCount: 12, blockName: 'Principal', eliminatedIn: null })
    expect(view.bracketResults.map((r) => [r.bracketName, r.roundName, r.won])).toEqual([
      ['Principal', '1/4', true],
      ['Principal', '1/2', true],
      ['Principal', 'Finale', true],
    ])
    expect(view.ranking).toMatchObject({ place: 1, definitive: true })
  })

  it('exemptée au 1er tour : attend directement le tour suivant', () => {
    // 10 équipes : Principal de 7 dans une grille de 8, la 1re des poules est exemptée.
    const t = bracketsReady(10)
    const bye = round(t, 'P', 1).find((m) => m.status === 'bye')!
    const team = (bye.teamA ?? bye.teamB)!.id
    expect(mine(t, team).next).toMatchObject({ kind: 'bracket-pending', bracket: 'P', roundName: '1/2', opponent: null })
    expect(mine(t, team).bracketResults).toEqual([])
  })
})
