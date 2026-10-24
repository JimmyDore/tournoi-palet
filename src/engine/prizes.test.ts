import { describe, expect, it } from 'vitest'
import { adminView, describeEvent, finalRanking, initialState, myTeamView, openMatches, prizesView, publicView, replay, type Command } from './index.ts'
import { bracketsReady, createEdition, run, type Harness } from './testing.ts'

// Lots : tranches de places (« 1 », « 5-16 ») associées à un lot.

const setPrizes = (...prizes: [string, string][]): Command => ({ type: 'setPrizes', prizes: prizes.map(([range, label]) => ({ range, label })) })

/** Répétition générale jusqu'au bout. */
function playAll(t: Harness) {
  while (openMatches(t.state).length > 0) t.apply({ type: 'fillRandomScores' })
  return t
}

describe('lots', () => {
  it('aucune tranche à la création', () => {
    const t = run([createEdition()])
    expect(prizesView(t.state).ranges).toEqual([])
  })

  it('enregistre les tranches, triées par place, dans la vue console', () => {
    const t = run([createEdition(), setPrizes(['3-4', 'Deux bouteilles'], ['1', 'Un jambon'], [' 5 – 16 ', 'Un saucisson'])])
    expect(prizesView(t.state).ranges).toEqual([
      { range: '1', from: 1, to: 1, label: 'Un jambon' },
      { range: '3-4', from: 3, to: 4, label: 'Deux bouteilles' },
      { range: '5-16', from: 5, to: 16, label: 'Un saucisson' },
    ])
    expect(adminView(t.state).prizes).toEqual(prizesView(t.state))
  })

  it.each<[[string, string], string]>([
    [['un', 'X'], '« un » n’est pas une tranche de places lisible (ex. « 1 » ou « 5-16 »).'],
    [['5-', 'X'], '« 5- » n’est pas une tranche de places lisible (ex. « 1 » ou « 5-16 »).'],
    [['0', 'X'], '« 0 » : les places commencent à 1.'],
    [['8-5', 'X'], '« 8-5 » : la première place doit être avant la dernière.'],
    [['3', ' '], 'La tranche « 3 » n’a pas de lot.'],
    [['', 'Un jambon'], 'Le lot « Un jambon » n’a pas de places (ex. « 1 » ou « 5-16 »).'],
  ])('refuse une tranche illisible : %j', (prize, reason) => {
    const t = run([createEdition()])
    expect(t.refusal(setPrizes(prize))).toBe(reason)
  })

  it('refuse des tranches qui se chevauchent, en nommant les places en commun', () => {
    const t = run([createEdition()])
    expect(t.refusal(setPrizes(['1', 'A'], ['5-16', 'B'], ['3-6', 'C']))).toBe('Les tranches « 3-6 » et « 5-16 » se chevauchent (les places 5-6).')
    expect(t.refusal(setPrizes(['4', 'A'], ['1-4', 'B']))).toBe('Les tranches « 1-4 » et « 4 » se chevauchent (la place 4).')
  })

  it('remplace la liste entière ; une liste vide retire tous les lots', () => {
    const t = run([createEdition(), setPrizes(['1', 'A'], ['2', 'B']), setPrizes(['1-2', 'C'])])
    expect(prizesView(t.state).ranges.map((r) => r.label)).toEqual(['C'])
    t.apply(setPrizes())
    expect(prizesView(t.state).ranges).toEqual([])
  })

  it('signale les places non couvertes par rapport aux équipes inscrites, sans bloquer', () => {
    const register = (i: number): Command => ({ type: 'registerTeam', team: { player1: `J${i}a`, player2: `J${i}b` } })
    const t = run([createEdition(), ...Array.from({ length: 20 }, (_, i) => register(i + 1)), setPrizes(['1', 'A'], ['3-4', 'B'], ['9-12', 'C'])])
    expect(prizesView(t.state)).toMatchObject({ places: 20, uncovered: ['2', '5-8', '13-20'] })
    t.apply(setPrizes(['1-20', 'Tout le monde']))
    expect(prizesView(t.state).uncovered).toEqual([])
  })

  it('une fois le pointage commencé, compte les équipes pointées', () => {
    const t = bracketsReady(12)
    t.apply(setPrizes(['1-10', 'A']))
    expect(prizesView(t.state)).toMatchObject({ places: 12, uncovered: ['11-12'] })
  })

  it('le classement final porte le lot de chaque place, rien pour une place non couverte', () => {
    const t = playAll(bracketsReady(12, { isTest: true }))
    t.apply(setPrizes(['1', 'Un jambon'], ['2-3', 'Deux bouteilles'], ['5-12', 'Un saucisson']))
    const rows = finalRanking(t.state).rows
    expect(rows.map((r) => r.prize)).toEqual(['Un jambon', 'Deux bouteilles', 'Deux bouteilles', null, ...Array(8).fill('Un saucisson')])
    expect(publicView(t.state).ranking.rows[0].prize).toBe('Un jambon')
  })

  it('reste modifiable une fois le tournoi terminé', () => {
    const t = playAll(bracketsReady(12, { isTest: true }))
    t.apply(setPrizes(['1', 'Un jambon']))
    expect(finalRanking(t.state).rows[0].prize).toBe('Un jambon')
  })

  it('« ton lot » sur le téléphone seulement quand la place est définitive', () => {
    const t = bracketsReady(12, { isTest: true })
    t.apply(setPrizes(['1-12', 'Un saucisson']))
    const team = finalRanking(t.state).rows[0].team.id
    expect(myTeamView(publicView(t.state), team)!.prize).toBeNull()
    playAll(t)
    for (const row of finalRanking(t.state).rows) expect(myTeamView(publicView(t.state), row.team.id)!.prize).toBe('Un saucisson')
  })

  it('note le changement au journal, avec avant et après', () => {
    const t = run([createEdition(), setPrizes(['1', 'Un jambon']), setPrizes(['1', 'Un jambon'], ['2-4', 'Une bouteille'])])
    const at = (n: number) => replay(t.events.slice(0, n), initialState())
    expect(describeEvent(at(2), at(3), t.events[2])).toEqual({ label: 'Lots modifiés', before: '1 : Un jambon', after: '1 : Un jambon ; 2-4 : Une bouteille' })
  })
})
