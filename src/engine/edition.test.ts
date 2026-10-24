import { describe, expect, it } from 'vitest'
import { adminView, currentEdition, describeEvent, editionSummary, initialState, publicView, replay } from './index.ts'
import { createEdition, run } from './testing.ts'

describe('édition', () => {
  it('se crée avec les réglages par défaut du club', () => {
    const { state } = run([{ type: 'createEdition', editionId: 'e1', settings: { name: 'Concours 2026', date: '2026-12-19' } }])

    expect(adminView(state).settings).toEqual({
      name: 'Concours 2026',
      date: '2026-12-19',
      arrivalTime: '13:00',
      startTime: '14:00',
      venue: 'Salle Arc-en-Ciel, Chantonnay',
      price: 18,
      contact: '',
      boards: 24,
      maxTeams: 48,
      gameMinutes: 30,
      byeScore: { winner: 13, loser: 7 },
      isTest: false,
      bracketFirstRound: 'seeded',
    })
  })
})

describe('réglages refusés', () => {
  it.each([
    [{ name: '  ' }, "Le nom de l'édition est obligatoire."],
    [{ date: '2026-02-30' }, 'La date doit être une vraie date (AAAA-MM-JJ).'],
    [{ maxTeams: 65 }, "Le plafond d'équipes ne peut pas dépasser 64."],
    [{ boards: 0 }, 'Il faut au moins une planche.'],
    [{ byeScore: { winner: 7, loser: 13 } }, "Le score d'exempt doit être une victoire valide (de 0 à 13, le premier score plus grand que le second)."],
    [{ startTime: '25:00' }, "Début : l'horaire doit être au format HH:MM."],
  ])('refuse %j avec une raison lisible', (settings, reason) => {
    expect(run([]).refusal(createEdition(settings))).toBe(reason)
  })
})

describe('modification', () => {
  it('ne change que les réglages demandés', () => {
    const t = run([createEdition(), { type: 'updateEdition', changes: { boards: 20, venue: 'Salle des fêtes' } }])
    const { settings } = adminView(t.state)
    expect(settings.boards).toBe(20)
    expect(settings.venue).toBe('Salle des fêtes')
    expect(settings.maxTeams).toBe(48)
  })

  it('refuse un réglage invalide et laisse l’édition intacte', () => {
    const t = run([createEdition()])
    expect(t.refusal({ type: 'updateEdition', changes: { maxTeams: 80 } })).toBe("Le plafond d'équipes ne peut pas dépasser 64.")
    expect(adminView(t.state).settings.maxTeams).toBe(48)
  })

  it('refuse de modifier une édition qui n’existe pas', () => {
    expect(run([]).refusal({ type: 'updateEdition', changes: { boards: 10 } })).toBe("Cette édition n'existe pas.")
  })

  it('refuse de créer deux fois la même édition', () => {
    expect(run([createEdition()]).refusal(createEdition())).toBe('Cette édition existe déjà.')
  })

  it('ignore les champs inconnus', () => {
    const t = run([createEdition(), { type: 'updateEdition', changes: { hack: 1 } as never }])
    expect(adminView(t.state).settings).not.toHaveProperty('hack')
  })

  it('se retrouve à l’identique en rejouant ses événements', () => {
    const t = run([createEdition(), { type: 'updateEdition', changes: { boards: 12, isTest: true } }])
    expect(replay(t.events)).toEqual(t.state)
  })
})

describe('vue publique', () => {
  it('montre les infos pratiques sans le jeton secret', () => {
    const t = run([createEdition({ name: 'Concours 2026', contact: 'Jean 06 00 00 00 00' })])
    const view = publicView(t.state)
    expect(view).toMatchObject({
      name: 'Concours 2026',
      date: '2026-12-19',
      arrivalTime: '13:00',
      startTime: '14:00',
      venue: 'Salle Arc-en-Ciel, Chantonnay',
      price: 18,
      contact: 'Jean 06 00 00 00 00',
      maxTeams: 48,
      phase: 'before',
    })
    expect(JSON.stringify(view)).not.toContain(adminView(t.state).previewToken)
  })

  it('donne à chaque édition un jeton secret, reproductible à graine égale', () => {
    const a = adminView(run([createEdition()], { seed: 1 }).state).previewToken
    const b = adminView(run([createEdition()], { seed: 1 }).state).previewToken
    const c = adminView(run([createEdition()], { seed: 2 }).state).previewToken
    expect(a).toMatch(/^[a-z0-9]{24}$/)
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('édition en cours', () => {
  const summary = (id: string, date: string, isTest = false) => editionSummary(run([createEdition({ date, isTest }, id)]).state)

  it('est la plus récente par date, en ignorant les éditions de test', () => {
    const editions = [summary('a', '2025-12-20'), summary('b', '2026-12-19'), summary('t', '2027-01-10', true)]
    expect(currentEdition(editions)?.id).toBe('b')
  })

  it('n’existe pas s’il n’y a que des éditions de test', () => {
    expect(currentEdition([summary('t', '2026-12-19', true)])).toBeNull()
  })
})

describe('journal', () => {
  it('décrit la création et chaque modification avec avant / après', () => {
    const t = run([
      createEdition({ name: 'Concours 2026' }),
      { type: 'updateEdition', changes: { boards: 20, byeScore: { winner: 13, loser: 5 } } },
    ])
    const states = [initialState(), ...t.events.map((_, i) => replay(t.events.slice(0, i + 1)))]
    const lines = t.events.map((e, i) => describeEvent(states[i], states[i + 1], e))
    expect(lines).toEqual([
      { label: 'Édition « Concours 2026 » créée' },
      { label: 'Réglages modifiés', before: "Planches : 24 ; Score d'exempt : 13-7", after: "Planches : 20 ; Score d'exempt : 13-5" },
    ])
  })

  it('n’écrit rien quand une modification ne change rien', () => {
    const t = run([createEdition(), { type: 'updateEdition', changes: { boards: 24 } }])
    expect(t.events.map((e) => e.type)).toEqual(['editionCreated'])
  })
})
