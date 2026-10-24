import { describe, expect, it } from 'vitest'
import { adminView, bracketsView, exportView, finalRanking, openMatches, phaseOf, publicView, replay, type BracketKey } from './index.ts'
import { bracketsReady, type Harness } from './testing.ts'

// Classement final de 1 à N : blocs Principal, Challenge Principal,
// Consolante, Challenge Consolante, puis forfaits de poule.

const round = (t: Harness, key: BracketKey, n: number) => bracketsView(t.state).brackets.find((b) => b.key === key)!.rounds[n - 1].matches
/** Répétition générale jusqu'au bout : un remplissage au hasard par tour. */
const playAll = (t: Harness) => {
  while (openMatches(t.state).length > 0) t.apply({ type: 'fillRandomScores' })
  return t
}
const rows = (t: Harness) => finalRanking(t.state).rows
const blocks = (t: Harness) => rows(t).map((r) => r.block)

describe('classement final', () => {
  it('vide avant la génération des tableaux', () => {
    const t = bracketsReady(12)
    expect(finalRanking(replay(t.events.slice(0, -1)))).toEqual({ finished: false, rows: [] })
  })

  it('48 équipes : 1-16 Principal, 17-32 Challenge Principal, 33-40 Consolante, 41-48 Challenge Consolante', () => {
    const t = playAll(bracketsReady(48, { isTest: true }))
    const expected = [...Array(16).fill('P'), ...Array(16).fill('CP'), ...Array(8).fill('C'), ...Array(8).fill('CC')]
    expect(blocks(t)).toEqual(expected)
    expect(rows(t).map((r) => r.place)).toEqual(Array.from({ length: 48 }, (_, i) => i + 1))
    // Le vainqueur du Principal est 1er, le finaliste 2e, les perdants des 1/2 3e et 4e.
    const [final] = round(t, 'P', 5)
    const winner = final.score!.a > final.score!.b ? final.teamA! : final.teamB!
    const finalist = winner === final.teamA ? final.teamB! : final.teamA!
    expect(rows(t)[0]).toMatchObject({ place: 1, team: { id: winner.id }, block: 'P', blockName: 'Principal', eliminatedIn: null, definitive: true })
    expect(rows(t)[1]).toMatchObject({ place: 2, team: { id: finalist.id }, eliminatedIn: 'Finale', definitive: true })
    expect(rows(t).slice(2, 4).map((r) => r.eliminatedIn)).toEqual(['1/2', '1/2'])
    expect(rows(t)[16]).toMatchObject({ place: 17, block: 'CP', blockName: 'Challenge Principal', eliminatedIn: null })
    expect(finalRanking(t.state).finished).toBe(true)
  })

  it('à tour égal : score de la défaite décroissant, puis classement des poules', () => {
    // 48 équipes, têtes de série, l'équipe A (mieux classée) gagne : les perdants des 1/8 du
    // Principal sont les têtes 16, 9, 13, 12, 15, 10, 14, 11 (tête = rang de poule).
    const t = bracketsReady(48)
    for (const m of round(t, 'P', 1)) t.apply({ type: 'enterBracketScore', matchId: m.id, scoreA: 13, scoreB: 4 })
    const losingScores = [12, 3, 3, 8, 0, 3, 12, 5]
    round(t, 'P', 2).forEach((m, i) => t.apply({ type: 'enterBracketScore', matchId: m.id, scoreA: 13, scoreB: losingScores[i] }))
    const ninthToSixteenth = rows(t).slice(8, 16)
    // 12 : têtes 14 et 16 ; 8 : tête 12 ; 5 : tête 11 ; 3 : têtes 9, 10, 13 ; 0 : tête 15.
    expect(ninthToSixteenth.map((r) => r.poolRank)).toEqual([14, 16, 12, 11, 9, 10, 13, 15])
    expect(ninthToSixteenth.every((r) => r.eliminatedIn === '1/8' && r.definitive)).toBe(true)
  })

  it('pendant le tournoi : places provisoires, sans trou ni doublon', () => {
    const t = bracketsReady(48)
    const check = () => {
      const r = rows(t)
      expect(r.map((x) => x.place)).toEqual(Array.from({ length: 48 }, (_, i) => i + 1))
      expect(new Set(r.map((x) => x.team.id)).size).toBe(48)
    }
    check()
    expect(rows(t).some((r) => r.definitive)).toBe(false)
    // Le 1er tour du Principal est à moitié joué.
    for (const m of round(t, 'P', 1).slice(0, 8)) t.apply({ type: 'enterBracketScore', matchId: m.id, scoreA: 13, scoreB: 6 })
    check()
    for (const m of round(t, 'P', 1).slice(8)) t.apply({ type: 'enterBracketScore', matchId: m.id, scoreA: 13, scoreB: 6 })
    for (const m of round(t, 'P', 2)) t.apply({ type: 'enterBracketScore', matchId: m.id, scoreA: 13, scoreB: 6 })
    check()
    // Les 1/8 du Principal joués : les places 9 à 16 sont définitives, pas les 8 premières.
    expect(rows(t).slice(8, 16).every((r) => r.definitive)).toBe(true)
    expect(rows(t).slice(0, 8).some((r) => r.definitive)).toBe(false)
    expect(rows(t).slice(0, 8).every((r) => r.eliminatedIn === null)).toBe(true)
    expect(finalRanking(t.state).finished).toBe(false)
    expect(phaseOf(t.state)).toBe('during')
  })

  it('une place n’est définitive qu’une fois tout son tour joué', () => {
    const t = bracketsReady(48)
    for (const m of round(t, 'P', 1)) t.apply({ type: 'enterBracketScore', matchId: m.id, scoreA: 13, scoreB: 6 })
    const [first] = round(t, 'P', 2)
    t.apply({ type: 'enterBracketScore', matchId: first.id, scoreA: 13, scoreB: 6 })
    const loser = rows(t).find((r) => r.team.id === first.teamB!.id)!
    expect(loser).toMatchObject({ eliminatedIn: '1/8', definitive: false })
  })

  it('les forfaits de poule sont classés tout en bas', () => {
    const t = playAll(bracketsReady(48, { isTest: true }, ['t5', 't9']))
    const r = rows(t)
    expect(r).toHaveLength(48)
    const last = r.slice(46)
    expect(new Set(last.map((x) => x.team.id))).toEqual(new Set(['t5', 't9']))
    expect(last.map((x) => [x.block, x.blockName, x.definitive])).toEqual(Array(2).fill(['forfeit', 'Forfait en poule', true]))
    // Entre elles, dans l'ordre du classement des poules.
    expect(last[0].poolRank).toBeLessThan(last[1].poolRank)
    expect(r.slice(0, 46).every((x) => x.block !== 'forfeit')).toBe(true)
  })

  it.each([16, 33, 40, 48, 52, 64])('%i équipes, tournoi simulé complet : chaque équipe une fois, places 1 à N, toutes définitives', (count) => {
    const t = bracketsReady(count, { isTest: true })
    expect(phaseOf(t.state)).toBe('during')
    playAll(t)
    const r = rows(t)
    expect(r.map((x) => x.place)).toEqual(Array.from({ length: count }, (_, i) => i + 1))
    expect(new Set(r.map((x) => x.team.id)).size).toBe(count)
    expect(r.every((x) => x.definitive)).toBe(true)
    // Blocs dans l'ordre, et un seul vainqueur par bloc.
    const order = ['P', 'CP', 'C', 'CC']
    expect(r.map((x) => order.indexOf(x.block))).toEqual([...r.map((x) => order.indexOf(x.block))].sort((a, b) => a - b))
    expect(r.filter((x) => x.eliminatedIn === null).map((x) => x.block)).toEqual(order)
    expect(finalRanking(t.state).finished).toBe(true)
    expect(phaseOf(t.state)).toBe('after')
  })

  it('dans les vues console, publique et export ; la vue publique ne contient que des noms', () => {
    const t = playAll(bracketsReady(12, { isTest: true }))
    expect(adminView(t.state).ranking).toEqual(finalRanking(t.state))
    expect(exportView(t.state).ranking).toEqual(finalRanking(t.state))
    const row = publicView(t.state).ranking.rows[0]
    expect(Object.keys(row.team).sort()).toEqual(['id', 'name'])
  })
})
