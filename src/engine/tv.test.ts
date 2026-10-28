import { describe, expect, it } from 'vitest'
import { describeEvent, initialState, openMatches, publicView, replay, tvRotation, TV_VIEWS, type Command } from './index.ts'
import { bracketsReady, createEdition, run } from './testing.ts'

const setTv = (view: string) => ({ type: 'setTvView', view }) as Command

describe('vue de la télé', () => {
  it('tourne seule par défaut', () => {
    const t = run([createEdition()])
    expect(publicView(t.state).tv).toEqual({ view: 'auto', hidden: [], skips: 0 })
  })

  it('se bloque sur une vue depuis la console, puis repart en rotation', () => {
    const t = run([createEdition(), setTv('standings')])
    expect(publicView(t.state).tv.view).toBe('standings')
    t.apply(setTv('auto'))
    expect(publicView(t.state).tv.view).toBe('auto')
  })

  it('propose les matchs en cours, le classement des poules, chaque tableau et le classement final', () => {
    expect(TV_VIEWS.map((v) => v.label)).toEqual([
      'Matchs en cours',
      'Classement des poules',
      'Tableau Principal',
      'Challenge Principal',
      'Consolante',
      'Challenge Consolante',
      'Classement final',
    ])
  })

  it('se bloque sur un tableau, par exemple pendant la finale', () => {
    const t = bracketsReady(12)
    t.apply(setTv('bracket-P'))
    expect(publicView(t.state).tv.view).toBe('bracket-P')
    expect(tvRotation(publicView(t.state))).toEqual(['bracket-P'])
  })

  it('« Écran suivant » depuis la console : la télé voit le compteur avancer', () => {
    const t = run([createEdition(), { type: 'skipTvSlide' }, { type: 'skipTvSlide' }])
    expect(publicView(t.state).tv.skips).toBe(2)
    const at = (n: number) => replay(t.events.slice(0, n), initialState())
    expect(describeEvent(at(1), at(2), t.events[1]).label).toBe('Télé : écran suivant')
  })

  it('refuse une vue inconnue', () => {
    const t = run([createEdition()])
    expect(t.refusal(setTv('tableaux-imaginaires'))).toBe('Cette vue de télé n’existe pas.')
  })

  it('n’écrit rien si la vue ne change pas', () => {
    const t = run([createEdition(), setTv('matches')])
    const count = t.events.length
    t.apply(setTv('matches'))
    expect(t.events).toHaveLength(count)
  })

  it('note le blocage au journal', () => {
    const t = run([createEdition(), setTv('matches'), setTv('auto')])
    const [, locked, auto] = t.events
    const at = (n: number) => replay(t.events.slice(0, n), initialState())
    expect(describeEvent(at(1), at(2), locked).label).toBe('Télé bloquée sur « Matchs en cours »')
    expect(describeEvent(at(2), at(3), auto).label).toBe('Télé en rotation automatique')
  })
})

describe('rotation automatique de la télé, selon le moment du tournoi', () => {
  const draw: Command = { type: 'drawPoolRound', round: 1 }
  const checkedIn = (count: number) =>
    run([
      createEdition(),
      ...Array.from({ length: count }, (_, i): Command => ({ type: 'registerTeam', team: { player1: `J${i}a`, player2: `J${i}b` } })),
      ...Array.from({ length: count }, (_, i): Command => ({ type: 'checkInTeam', teamId: `t${i + 1}` })),
    ])

  it('rien avant le tirage (la télé affiche l’affiche du concours)', () => {
    expect(tvRotation(publicView(checkedIn(4).state))).toEqual([])
  })

  it('poules : matchs en cours et classement des poules', () => {
    expect(tvRotation(publicView(checkedIn(4).apply(draw).state))).toEqual(['matches', 'standings'])
  })

  it('tableaux : matchs en cours, classement des poules, les tableaux formés et le classement provisoire', () => {
    const t = bracketsReady(48, { isTest: true })
    expect(tvRotation(publicView(t.state))).toEqual(['matches', 'standings', 'bracket-P', 'bracket-C', 'ranking'])
    // Le 1er tour joué : les Challenges sont formés.
    t.apply({ type: 'fillRandomScores' })
    expect(tvRotation(publicView(t.state))).toEqual(['matches', 'standings', 'bracket-P', 'bracket-CP', 'bracket-C', 'bracket-CC', 'ranking'])
  })

  it('saute les vues retirées par la console ; un tableau formé plus tard y entre seul', () => {
    const t = bracketsReady(48, { isTest: true })
    t.apply({ type: 'setTvRotation', hidden: ['ranking', 'standings'] })
    expect(tvRotation(publicView(t.state))).toEqual(['matches', 'bracket-P', 'bracket-C'])
    t.apply({ type: 'fillRandomScores' })
    expect(tvRotation(publicView(t.state))).toEqual(['matches', 'bracket-P', 'bracket-CP', 'bracket-C', 'bracket-CC'])
  })

  it('tourne sur tout si toutes les vues du moment sont retirées', () => {
    const t = checkedIn(4).apply(draw)
    t.apply({ type: 'setTvRotation', hidden: ['matches', 'standings'] })
    expect(tvRotation(publicView(t.state))).toEqual(['matches', 'standings'])
  })

  it('garde les vues retirées quand on bloque puis débloque la télé', () => {
    const t = checkedIn(4).apply(draw)
    t.apply({ type: 'setTvRotation', hidden: ['standings'] })
    t.apply(setTv('standings'))
    expect(tvRotation(publicView(t.state))).toEqual(['standings'])
    t.apply(setTv('auto'))
    expect(tvRotation(publicView(t.state))).toEqual(['matches'])
  })

  it('refuse une vue inconnue dans la rotation et note le choix au journal', () => {
    const t = run([createEdition()])
    expect(t.refusal({ type: 'setTvRotation', hidden: ['nope'] } as unknown as Command)).toBe('Cette vue de télé n’existe pas.')
    t.apply({ type: 'setTvRotation', hidden: ['ranking', 'matches', 'ranking'] })
    expect(publicView(t.state).tv.hidden).toEqual(['matches', 'ranking'])
    const at = (n: number) => replay(t.events.slice(0, n), initialState())
    const n = t.events.length
    expect(describeEvent(at(n - 1), at(n), t.events[n - 1]).label).toBe('Rotation de la télé sans « Matchs en cours », « Classement final »')
  })

  it('après les finales : classement final puis les tableaux', () => {
    const t = bracketsReady(48, { isTest: true })
    while (openMatches(t.state).length > 0) t.apply({ type: 'fillRandomScores' })
    expect(tvRotation(publicView(t.state))).toEqual(['ranking', 'bracket-P', 'bracket-CP', 'bracket-C', 'bracket-CC'])
  })
})
