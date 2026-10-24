import { describe, expect, it } from 'vitest'
import { adminView, describeEvent, initialState, publicView, replay, type Command } from './index.ts'
import { createEdition, run } from './testing.ts'

const register = (player1: string, player2: string, more: object = {}): Command => ({ type: 'registerTeam', team: { player1, player2, ...more } })

/** Une édition à `max` places et les équipes « A1 & A2 », « B1 & B2 »… */
function edition(max: number, count: number) {
  const letters = 'ABCDEFGHIJ'.slice(0, count).split('')
  return run([createEdition({ maxTeams: max }), ...letters.map((l) => register(`${l}1`, `${l}2`))])
}

const names = (teams: { name: string }[]) => teams.map((t) => t.name)

describe('inscription', () => {
  it('prend par défaut le nom « Joueur1 & Joueur2 »', () => {
    const t = run([createEdition(), register('Paul', 'Marie')])
    expect(adminView(t.state).teams).toMatchObject([{ id: 't1', name: 'Paul & Marie', player1: 'Paul', player2: 'Marie', status: 'registered' }])
    expect(publicView(t.state).teams).toEqual([{ id: 't1', name: 'Paul & Marie' }])
  })

  it('garde le nom saisi, le téléphone, le commentaire et les licences', () => {
    const t = run([
      createEdition(),
      register('Paul', 'Marie', { name: '  Les   Galets ', phone: '06 12 34 56 78', comment: 'paiera sur place', player1Licensed: true }),
    ])
    expect(adminView(t.state).teams[0]).toMatchObject({
      name: 'Les Galets',
      customName: 'Les Galets',
      phone: '06 12 34 56 78',
      comment: 'paiera sur place',
      player1Licensed: true,
      player2Licensed: false,
      checkedInAt: null,
      warnings: [],
    })
  })

  it('alerte sans bloquer quand les deux joueurs sont licenciés', () => {
    const t = run([createEdition(), register('Paul', 'Marie', { player1Licensed: true, player2Licensed: true })])
    expect(adminView(t.state).teams[0].warnings).toEqual(['Les deux joueurs sont licenciés : la règle est d’un licencié maximum par doublette.'])
    expect(publicView(t.state).teams).toHaveLength(1)
  })

  it.each([
    [{ player1: '', player2: 'Marie' }, 'Le nom du joueur 1 est obligatoire.'],
    [{ player1: 'Paul', player2: '  ' }, 'Le nom du joueur 2 est obligatoire.'],
    [{ player1: 'paul', player2: 'marie' }, "Une équipe s'appelle déjà « Paul & Marie »."],
  ])('refuse %j avec une raison lisible', (team, reason) => {
    const t = run([createEdition(), register('Paul', 'Marie')])
    expect(t.refusal({ type: 'registerTeam', team })).toBe(reason)
  })
})

describe('modification', () => {
  it('modifie et renomme sans changer d’identifiant ni de place', () => {
    const t = edition(48, 3)
    t.apply({ type: 'updateTeam', teamId: 't2', changes: { player2: 'Bernard', phone: '0600000000' } })
    expect(adminView(t.state).teams[1]).toMatchObject({ id: 't2', name: 'B1 & Bernard', player2: 'Bernard', phone: '0600000000' })
    t.apply({ type: 'updateTeam', teamId: 't2', changes: { name: 'Les Rois du palet' } })
    expect(publicView(t.state).teams).toEqual([
      { id: 't1', name: 'A1 & A2' },
      { id: 't2', name: 'Les Rois du palet' },
      { id: 't3', name: 'C1 & C2' },
    ])
    t.apply({ type: 'updateTeam', teamId: 't2', changes: { name: '' } })
    expect(adminView(t.state).teams[1].name).toBe('B1 & Bernard')
  })

  it('refuse une équipe inconnue ou le nom d’une autre équipe', () => {
    const t = edition(48, 2)
    expect(t.refusal({ type: 'updateTeam', teamId: 't9', changes: { name: 'X' } })).toBe("Cette équipe n'est pas inscrite.")
    expect(t.refusal({ type: 'updateTeam', teamId: 't2', changes: { name: 'a1 & a2' } })).toBe("Une équipe s'appelle déjà « A1 & A2 ».")
  })
})

describe('liste d’attente', () => {
  it('reçoit les équipes au-delà du plafond, dans l’ordre d’inscription', () => {
    const t = edition(2, 4)
    const view = publicView(t.state)
    expect(names(view.teams)).toEqual(['A1 & A2', 'B1 & B2'])
    expect(names(view.waitlist)).toEqual(['C1 & C2', 'D1 & D2'])
    expect(view.placesLeft).toBe(0)
    expect(adminView(t.state).teams.map((x) => [x.id, x.status, x.waitlistPosition])).toEqual([
      ['t1', 'registered', null],
      ['t2', 'registered', null],
      ['t3', 'waitlist', 1],
      ['t4', 'waitlist', 2],
    ])
  })

  it('fait remonter sa tête quand une inscrite se désiste', () => {
    const t = edition(2, 4)
    t.apply({ type: 'withdrawTeam', teamId: 't1' })
    expect(names(publicView(t.state).teams)).toEqual(['B1 & B2', 'C1 & C2'])
    expect(names(publicView(t.state).waitlist)).toEqual(['D1 & D2'])
  })

  it('ne bouge pas quand c’est une équipe en attente qui se désiste', () => {
    const t = edition(2, 4)
    t.apply({ type: 'withdrawTeam', teamId: 't3' })
    expect(names(publicView(t.state).teams)).toEqual(['A1 & A2', 'B1 & B2'])
    expect(names(publicView(t.state).waitlist)).toEqual(['D1 & D2'])
  })

  it('suit le plafond : relevé, la tête remonte ; abaissé, les dernières inscrites repassent en attente', () => {
    const t = edition(2, 4)
    t.apply({ type: 'updateEdition', changes: { maxTeams: 3 } })
    expect(names(publicView(t.state).teams)).toEqual(['A1 & A2', 'B1 & B2', 'C1 & C2'])
    t.apply({ type: 'updateEdition', changes: { maxTeams: 2 } })
    expect(names(publicView(t.state).waitlist)).toEqual(['C1 & C2', 'D1 & D2'])
  })

  it('compte les places restantes', () => {
    const view = publicView(edition(5, 3).state)
    expect(view.placesLeft).toBe(2)
    expect(view.waitlist).toEqual([])
  })

  it('refuse de désinscrire une équipe inconnue ou déjà désinscrite', () => {
    const t = edition(2, 2)
    t.apply({ type: 'withdrawTeam', teamId: 't1' })
    expect(t.refusal({ type: 'withdrawTeam', teamId: 't1' })).toBe("Cette équipe n'est pas inscrite.")
  })

  it('ne réutilise jamais l’identifiant d’une équipe désinscrite', () => {
    const t = edition(48, 2)
    t.apply({ type: 'withdrawTeam', teamId: 't2' })
    t.apply(register('Z1', 'Z2'))
    expect(adminView(t.state).teams.map((x) => x.id)).toEqual(['t1', 't3'])
  })
})

describe('vue publique des inscrits', () => {
  it('ne contient ni téléphone, ni licence, ni commentaire, ni pointage, ni joueurs', () => {
    const t = run([createEdition(), register('Paul', 'Marie', { name: 'Les Galets', phone: '0611223344', comment: 'secret', player1Licensed: true })])
    const json = JSON.stringify(publicView(t.state))
    for (const leak of ['0611223344', 'secret', 'Licensed', 'phone', 'comment', 'checkedIn', 'Paul', 'Marie']) expect(json).not.toContain(leak)
  })
})

describe('journal et rejouage', () => {
  it('décrit inscription, modification, désinscription et remontée de la liste d’attente', () => {
    const t = edition(2, 3)
    t.apply({ type: 'updateTeam', teamId: 't1', changes: { name: 'Les Galets', phone: '06' } })
    t.apply({ type: 'withdrawTeam', teamId: 't1' })
    const states = [initialState(), ...t.events.map((_, i) => replay(t.events.slice(0, i + 1)))]
    const lines = t.events.map((e, i) => describeEvent(states[i], states[i + 1], e)).slice(2)
    expect(lines).toEqual([
      { label: 'Équipe « B1 & B2 » inscrite' },
      { label: 'Équipe « C1 & C2 » inscrite en liste d’attente (1re)' },
      { label: 'Équipe « A1 & A2 » modifiée', before: 'Nom : (par défaut) ; Téléphone : (vide)', after: 'Nom : Les Galets ; Téléphone : 06' },
      { label: 'Équipe « Les Galets » désinscrite ; « C1 & C2 » remonte de la liste d’attente' },
    ])
    expect(replay(t.events)).toEqual(t.state)
  })

  it('note la remontée de la liste d’attente quand le plafond est relevé', () => {
    const t = edition(2, 4)
    t.apply({ type: 'updateEdition', changes: { maxTeams: 3 } })
    const before = replay(t.events.slice(0, -1))
    expect(describeEvent(before, t.state, t.events.at(-1)!).label).toBe('Réglages modifiés ; « C1 & C2 » remonte de la liste d’attente')
  })
})
