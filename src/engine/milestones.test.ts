import { describe, expect, it } from 'vitest'
import { exportView, milestones, poolView, type Command } from './index.ts'
import { createEdition, run, type Harness } from './testing.ts'

/** Quatre équipes pointées (t1…t4). */
function fourTeams() {
  return run([
    createEdition(),
    ...[1, 2, 3, 4].map((i): Command => ({ type: 'registerTeam', team: { player1: `J${i}a`, player2: `J${i}b` } })),
    ...[1, 2, 3, 4].map((i): Command => ({ type: 'checkInTeam', teamId: `t${i}` })),
  ])
}

const matchIds = (t: Harness) => poolView(t.state).rounds[0].matches.map((m) => m.id)
const score = (matchId: string, scoreA = 13, scoreB = 5): Command => ({ type: 'enterPoolScore', matchId, scoreA, scoreB })

describe('jalons du tournoi', () => {
  it('aucun jalon tant que la partie 1 n’est pas terminée', () => {
    const t = fourTeams()
    expect(milestones(t.state)).toEqual([])
    t.apply({ type: 'drawPoolRound', round: 1 })
    t.apply(score(matchIds(t)[0]))
    expect(milestones(t.state)).toEqual([])
  })

  it('une partie de poule dont tous les scores sont saisis est un jalon', () => {
    const t = fourTeams().apply({ type: 'drawPoolRound', round: 1 })
    for (const id of matchIds(t)) t.apply(score(id))
    expect(milestones(t.state)).toEqual(['poule-partie-1'])
  })

  it('corriger un score d’une partie terminée ne crée pas de nouveau jalon', () => {
    const t = fourTeams().apply({ type: 'drawPoolRound', round: 1 })
    for (const id of matchIds(t)) t.apply(score(id))
    t.apply(score(matchIds(t)[0], 4, 13))
    expect(milestones(t.state)).toEqual(['poule-partie-1'])
  })
})

describe("export de l'édition", () => {
  it('contient les réglages, les fiches complètes et le classement des poules', () => {
    const t = run([
      createEdition({ name: 'Concours 2026' }),
      { type: 'registerTeam', team: { name: 'Les Galets', player1: 'Paul', player2: 'Marie', phone: '0611223344', comment: 'liquide' } },
      { type: 'registerTeam', team: { player1: 'Jean', player2: 'Luc' } },
      { type: 'checkInTeam', teamId: 't1' },
      { type: 'checkInTeam', teamId: 't2' },
      { type: 'drawPoolRound', round: 1 },
    ])
    t.apply(score(matchIds(t)[0], 7, 13))
    const exported = exportView(t.state)
    expect(exported.settings).toMatchObject({ name: 'Concours 2026' })
    expect(exported.teams[0]).toMatchObject({ id: 't1', name: 'Les Galets', phone: '0611223344', comment: 'liquide' })
    expect(exported.teams[0].checkedInAt).not.toBeNull()
    expect(exported.pool.rounds[0].complete).toBe(true)
    expect(exported.poolStandings.map((s) => s.played)).toEqual([1, 1])
    expect(exported.milestones).toEqual(['poule-partie-1'])
  })
})
