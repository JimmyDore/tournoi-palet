import { describe, expect, it } from 'vitest'
import { describeEvent, initialState, publicView, replay, TV_VIEWS, type Command } from './index.ts'
import { createEdition, run } from './testing.ts'

const setTv = (view: string) => ({ type: 'setTvView', view }) as Command

describe('vue de la télé', () => {
  it('tourne seule par défaut', () => {
    const t = run([createEdition()])
    expect(publicView(t.state).tv).toEqual({ view: 'auto' })
  })

  it('se bloque sur une vue depuis la console, puis repart en rotation', () => {
    const t = run([createEdition(), setTv('standings')])
    expect(publicView(t.state).tv.view).toBe('standings')
    t.apply(setTv('auto'))
    expect(publicView(t.state).tv.view).toBe('auto')
  })

  it('propose les vues matchs en cours et classement des poules', () => {
    expect(TV_VIEWS.map((v) => v.key)).toEqual(['matches', 'standings'])
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
