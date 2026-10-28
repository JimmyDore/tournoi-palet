import { describe, expect, it } from 'vitest'
import { adminView, describeEvent, initialState, participants, replay, type Command } from './index.ts'
import { createEdition, run, TEST_NOW } from './testing.ts'

const register = (player1: string, player2: string): Command => ({ type: 'registerTeam', team: { player1, player2 } })
const checkIn = (teamId: string): Command => ({ type: 'checkInTeam', teamId })

/** Une édition à `max` places et les équipes « A1 & A2 », « B1 & B2 »… (t1, t2…). */
function edition(max: number, count: number) {
  const letters = 'ABCDEFGHIJ'.slice(0, count).split('')
  return run([createEdition({ maxTeams: max }), ...letters.map((l) => register(`${l}1`, `${l}2`))])
}

describe('pointage', () => {
  it('marque une équipe inscrite présente et payée, à l’heure du serveur', () => {
    const t = edition(48, 2)
    t.apply(checkIn('t2'))
    const view = adminView(t.state)
    expect(view.teams.map((x) => [x.id, x.checkedInAt])).toEqual([
      ['t1', null],
      ['t2', TEST_NOW + 3 * 60_000],
    ])
    expect(view.checkedInCount).toBe(1)
  })

  it('se dépointe en un clic (erreur de pointage)', () => {
    const t = edition(48, 2)
    t.apply(checkIn('t1'))
    t.apply({ type: 'undoCheckIn', teamId: 't1' })
    expect(adminView(t.state).teams[0].checkedInAt).toBeNull()
    expect(adminView(t.state).checkedInCount).toBe(0)
    t.apply(checkIn('t1'))
    expect(adminView(t.state).checkedInCount).toBe(1)
  })

  it.each([
    [checkIn('t9'), "Cette équipe n'est pas inscrite."],
    [{ type: 'undoCheckIn', teamId: 't2' } as Command, '« B1 & B2 » n’est pas pointée.'],
    [checkIn('t1'), '« A1 & A2 » est déjà pointée.'],
  ])('refuse %j avec une raison lisible', (command, reason) => {
    const t = edition(48, 2)
    t.apply(checkIn('t1'))
    expect(t.refusal(command)).toBe(reason)
  })

  it('refuse une équipe en liste d’attente', () => {
    const t = edition(2, 4)
    expect(t.refusal(checkIn('t4'))).toBe(
      '« D1 & D2 » est en liste d’attente (2e) : elle ne peut être pointée qu’une fois remontée. Remplacez d’abord une équipe absente.',
    )
  })
})

describe('participants', () => {
  it('sont les équipes inscrites et pointées, dans l’ordre d’inscription', () => {
    const t = edition(3, 5)
    t.apply(checkIn('t3')).apply(checkIn('t1'))
    expect(participants(t.state).map((x) => x.id)).toEqual(['t1', 't3'])
  })

  it('n’incluent ni les dépointées ni les désinscrites', () => {
    const t = edition(48, 3)
    t.apply(checkIn('t1')).apply(checkIn('t2')).apply(checkIn('t3'))
    t.apply({ type: 'undoCheckIn', teamId: 't2' }).apply({ type: 'withdrawTeam', teamId: 't3' })
    expect(participants(t.state).map((x) => x.id)).toEqual(['t1'])
  })
})

describe('remplacement d’un absent par la tête de la liste d’attente', () => {
  const replace = (teamId: string): Command => ({ type: 'replaceAbsentTeam', teamId })

  it('retire l’absente et fait remonter la tête de la liste d’attente, qui peut alors être pointée', () => {
    const t = edition(2, 4)
    t.apply(checkIn('t1')).apply(replace('t2'))
    expect(adminView(t.state).teams.map((x) => [x.id, x.status])).toEqual([
      ['t1', 'registered'],
      ['t3', 'registered'],
      ['t4', 'waitlist'],
    ])
    t.apply(checkIn('t3'))
    expect(participants(t.state).map((x) => x.id)).toEqual(['t1', 't3'])
  })

  it.each([
    ['t1', '« A1 & A2 » est pointée : elle est présente, on ne la remplace pas.'],
    ['t3', '« C1 & C2 » est en liste d’attente : seule une équipe inscrite peut être remplacée.'],
    ['t9', "Cette équipe n'est pas inscrite."],
  ])('refuse de remplacer %s', (teamId, reason) => {
    const t = edition(2, 3)
    t.apply(checkIn('t1'))
    expect(t.refusal(replace(teamId))).toBe(reason)
  })

  it('refuse quand la liste d’attente est vide', () => {
    expect(edition(2, 2).refusal(replace('t1'))).toBe('La liste d’attente est vide : personne pour remplacer « A1 & A2 ».')
  })
})

describe('plafond et pointage', () => {
  it('refuse d’abaisser le plafond si une équipe pointée repassait en liste d’attente', () => {
    const t = edition(3, 3)
    t.apply(checkIn('t3'))
    expect(t.refusal({ type: 'updateEdition', changes: { maxTeams: 2 } })).toBe(
      'Impossible : « C1 & C2 » est déjà pointée et repasserait en liste d’attente. Dépointez-la ou désinscrivez une autre équipe d’abord.',
    )
    t.apply({ type: 'undoCheckIn', teamId: 't3' }).apply({ type: 'updateEdition', changes: { maxTeams: 2 } })
  })
})

describe('journal et rejouage du pointage', () => {
  it('décrit pointage, dépointage et remplacement', () => {
    const t = edition(2, 3)
    t.apply(checkIn('t1')).apply({ type: 'undoCheckIn', teamId: 't1' }).apply({ type: 'replaceAbsentTeam', teamId: 't2' })
    const states = [initialState(), ...t.events.map((_, i) => replay(t.events.slice(0, i + 1)))]
    const lines = t.events.map((e, i) => describeEvent(states[i], states[i + 1], e)).slice(4)
    expect(lines).toEqual([
      { label: 'Équipe « A1 & A2 » pointée (arrivée)' },
      { label: 'Pointage de « A1 & A2 » annulé' },
      { label: 'Équipe « B1 & B2 » absente, remplacée par « C1 & C2 » (tête de la liste d’attente)' },
    ])
    expect(replay(t.events)).toEqual(t.state)
  })
})
