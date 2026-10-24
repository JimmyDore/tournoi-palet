import { describe, expect, it } from 'vitest'
import { myTeamView, poolView, publicView, type Command } from './index.ts'
import { createEdition, run, type Harness } from './testing.ts'

const register = (player1: string, player2: string): Command => ({ type: 'registerTeam', team: { player1, player2 } })
const draw: Command = { type: 'drawPoolRound', round: 1 }

/** `count` équipes « J1a & J1b »… (t1, t2…), toutes pointées. */
function checkedIn(count: number, settings = {}) {
  const ids = Array.from({ length: count }, (_, i) => i + 1)
  return run([
    createEdition(settings),
    ...ids.map((i) => register(`J${i}a`, `J${i}b`)),
    ...ids.map((i): Command => ({ type: 'checkInTeam', teamId: `t${i}` })),
  ])
}

const matchOf = (t: Harness, teamId: string) =>
  poolView(t.state).rounds[0].matches.find((m) => m.teamA.id === teamId || m.teamB.id === teamId)!

const mine = (t: Harness, teamId: string) => myTeamView(publicView(t.state), teamId)

describe('mon équipe (téléphone)', () => {
  it('attend le tirage tant que la partie 1 n’est pas lancée', () => {
    const t = checkedIn(4)
    expect(mine(t, 't2')).toMatchObject({ team: { id: 't2', name: 'J2a & J2b' }, next: { kind: 'not-drawn' }, results: [], standing: null })
  })

  it('donne la planche et l’adversaire de la partie en cours', () => {
    const t = checkedIn(4).apply(draw)
    const match = matchOf(t, 't1')
    const opponent = match.teamA.id === 't1' ? match.teamB : match.teamA
    expect(mine(t, 't1')!.next).toEqual({ kind: 'board', round: 1, board: match.board, opponent })
  })

  it('dit « en attente de planche » quand il n’y a plus de planche libre', () => {
    const t = checkedIn(4, { boards: 1 }).apply(draw)
    const waiting = poolView(t.state).rounds[0].matches.find((m) => m.board === null)!
    expect(mine(t, waiting.teamA.id)!.next).toEqual({ kind: 'waiting-board', round: 1, opponent: waiting.teamB })
  })

  it('dit « exempt » à l’équipe exempte, avec sa victoire au score d’exempt', () => {
    const t = checkedIn(3).apply(draw)
    const bye = poolView(t.state).rounds[0].bye!.team.id
    const view = mine(t, bye)!
    expect(view.next).toEqual({ kind: 'bye', round: 1 })
    expect(view.results).toEqual([{ round: 1, bye: true, board: null, opponent: null, scored: 13, conceded: 7, won: true }])
    expect(view.standing).toMatchObject({ rank: 1, wins: 1 })
  })

  it('montre les résultats vus de son côté et sa place, une fois le score saisi', () => {
    const t = checkedIn(4).apply(draw)
    const match = matchOf(t, 't3')
    const isA = match.teamA.id === 't3'
    t.apply({ type: 'enterPoolScore', matchId: match.id, scoreA: isA ? 5 : 13, scoreB: isA ? 13 : 5 })
    const view = mine(t, 't3')!
    const opponent = isA ? match.teamB : match.teamA
    expect(view.next).toEqual({ kind: 'played', round: 1 })
    expect(view.results).toEqual([{ round: 1, bye: false, board: match.board, opponent, scored: 5, conceded: 13, won: false }])
    // Devant les deux équipes qui n'ont pas encore de score (points pour).
    expect(view.standing).toMatchObject({ rank: 2, wins: 0, pointsFor: 5, pointsAgainst: 13 })
    expect(view.teamCount).toBe(4)
    expect(mine(t, opponent.id)!.standing).toMatchObject({ rank: 1, wins: 1 })
  })

  it('signale une équipe inscrite qui n’a pas été tirée (absente)', () => {
    const t = run([createEdition(), register('A', 'A'), register('B', 'B'), register('C', 'C'), { type: 'checkInTeam', teamId: 't1' }, { type: 'checkInTeam', teamId: 't2' }, draw])
    expect(mine(t, 't3')!.next).toEqual({ kind: 'not-in-pool' })
  })

  it('ne connaît pas une équipe disparue', () => {
    expect(mine(checkedIn(2), 't99')).toBeNull()
  })
})
