import { describe, expect, it } from 'vitest'
import { adminView, describeEvent, initialState, publicView, replay, type Command } from './index.ts'
import { createEdition, run, TEST_NOW } from './testing.ts'

const register = (player1: string, player2: string): Command => ({ type: 'registerTeam', team: { player1, player2 } })
const lend = (teamId: string): Command => ({ type: 'lendPalets', teamId })
const giveBack = (teamId: string): Command => ({ type: 'returnPalets', teamId })

/** Trois équipes inscrites (t1 à t3), une en liste d'attente (t4). */
function edition() {
  return run([createEdition({ maxTeams: 3 }), register('A1', 'A2'), register('B1', 'B2'), register('C1', 'C2'), register('D1', 'D2')])
}

describe('caution des palets', () => {
  it('note le prêt et le rendu, à l’heure du serveur, sans toucher au pointage', () => {
    const t = edition()
    t.apply(lend('t2'))
    let team = adminView(t.state).teams.find((x) => x.id === 't2')!
    expect([team.paletsLentAt, team.paletsReturnedAt, team.checkedInAt]).toEqual([TEST_NOW + 5 * 60_000, null, null])
    t.apply(giveBack('t2'))
    team = adminView(t.state).teams.find((x) => x.id === 't2')!
    expect(team.paletsReturnedAt).toBe(TEST_NOW + 6 * 60_000)
  })

  it('compte les jeux prêtés, rendus et à rendre', () => {
    const t = edition()
    expect(adminView(t.state).palets).toEqual({ lent: 0, returned: 0, out: 0 })
    t.apply(lend('t1')).apply(lend('t2')).apply(lend('t3')).apply(giveBack('t2'))
    expect(adminView(t.state).palets).toEqual({ lent: 3, returned: 1, out: 2 })
  })

  it('s’annule : prêt coché par erreur, rendu noté par erreur', () => {
    const t = edition()
    t.apply(lend('t1')).apply(giveBack('t1')).apply({ type: 'cancelPaletsReturn', teamId: 't1' })
    expect(adminView(t.state).palets).toEqual({ lent: 1, returned: 0, out: 1 })
    t.apply({ type: 'cancelPaletsLoan', teamId: 't1' })
    expect(adminView(t.state).teams[0].paletsLentAt).toBeNull()
    expect(adminView(t.state).palets).toEqual({ lent: 0, returned: 0, out: 0 })
  })

  it('reste possible pendant le tournoi (rendu en fin de journée)', () => {
    const t = run([createEdition(), register('A1', 'A2'), register('B1', 'B2')])
    t.apply(lend('t1')).apply({ type: 'checkInTeam', teamId: 't1' }).apply({ type: 'checkInTeam', teamId: 't2' })
    t.apply({ type: 'drawPoolRound', round: 1 })
    t.apply(lend('t2')).apply(giveBack('t1'))
    expect(adminView(t.state).palets).toEqual({ lent: 2, returned: 1, out: 1 })
  })

  it.each([
    [lend('t9'), "Cette équipe n'est pas inscrite."],
    [lend('t4'), '« D1 & D2 » est en liste d’attente : on ne lui prête pas de palets.'],
    [lend('t1'), '« A1 & A2 » a déjà des palets prêtés.'],
    [giveBack('t2'), '« B1 & B2 » n’a pas de palets prêtés.'],
    [giveBack('t3'), '« C1 & C2 » a déjà rendu ses palets.'],
    [{ type: 'cancelPaletsLoan', teamId: 't2' } as Command, '« B1 & B2 » n’a pas de palets prêtés.'],
    [{ type: 'cancelPaletsLoan', teamId: 't3' } as Command, '« C1 & C2 » a déjà rendu ses palets : annulez d’abord le rendu.'],
    [{ type: 'cancelPaletsReturn', teamId: 't1' } as Command, '« A1 & A2 » n’a pas rendu ses palets.'],
  ])('refuse %j avec une raison lisible', (command, reason) => {
    const t = edition()
    t.apply(lend('t1')).apply(lend('t3')).apply(giveBack('t3'))
    expect(t.refusal(command)).toBe(reason)
  })

  it('ne sort jamais dans la vue publique', () => {
    const t = edition()
    t.apply(lend('t1'))
    expect(JSON.stringify(publicView(t.state))).not.toMatch(/palets|caution|deposit/i)
  })

  it('a un montant réglable, 2 € par défaut', () => {
    const t = edition()
    expect(adminView(t.state).settings.deposit).toBe(2)
    expect(t.refusal({ type: 'updateEdition', changes: { deposit: -1 } })).toBe('La caution des palets doit être un montant positif ou nul.')
    t.apply({ type: 'updateEdition', changes: { deposit: 5 } })
    expect(adminView(t.state).settings.deposit).toBe(5)
  })

  it('se décrit dans le journal et se rejoue', () => {
    const t = edition()
    t.apply(lend('t1')).apply(giveBack('t1')).apply({ type: 'cancelPaletsReturn', teamId: 't1' }).apply({ type: 'cancelPaletsLoan', teamId: 't1' })
    const states = [initialState(), ...t.events.map((_, i) => replay(t.events.slice(0, i + 1)))]
    const lines = t.events.map((e, i) => describeEvent(states[i], states[i + 1], e)).slice(5)
    expect(lines).toEqual([
      { label: 'Palets prêtés à « A1 & A2 » (caution de 2 €)' },
      { label: 'Palets rendus par « A1 & A2 » (caution de 2 € remboursée)' },
      { label: 'Rendu des palets de « A1 & A2 » annulé' },
      { label: 'Prêt de palets à « A1 & A2 » annulé' },
    ])
    expect(replay(t.events)).toEqual(t.state)
  })
})
