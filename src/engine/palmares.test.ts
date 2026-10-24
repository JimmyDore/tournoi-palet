import { describe, expect, it } from 'vitest'
import { bracketsView, editionSummary, openMatches, palmares, type EditionSummary } from './index.ts'
import { bracketsReady, createEdition, run, type Harness } from './testing.ts'

// Palmarès public : les éditions terminées, jamais une édition de test.

/** Joue tous les matchs jusqu'aux finales (l'équipe A gagne 13-6). */
const playAll = (t: Harness) => {
  while (openMatches(t.state).length > 0) for (const m of openMatches(t.state)) t.apply(m.enter(13, 6))
  return t
}
const finished = (id: string, date: string, isTest = false) => {
  const t = playAll(bracketsReady(12, { date, isTest }))
  return { t, summary: { ...editionSummary(t.state), id } }
}
const upcoming = (id: string, date: string) => editionSummary(run([createEdition({ date }, id)]).state)

describe('palmarès', () => {
  it('donne le vainqueur du Principal d’une édition terminée', () => {
    const { t, summary } = finished('a', '2025-12-20')
    const principal = bracketsView(t.state).brackets.find((b) => b.key === 'P')!
    expect(summary.phase).toBe('after')
    expect(summary.winner).toEqual({ id: principal.winner!.id, name: principal.winner!.name })
  })

  it('pas de vainqueur tant que le tournoi n’est pas terminé', () => {
    expect(upcoming('b', '2026-12-19').winner).toBeNull()
    expect(editionSummary(bracketsReady(12).state).winner).toBeNull()
  })

  it('liste les éditions terminées, la plus récente en tête, sans les éditions de test ni celles à venir', () => {
    const editions: EditionSummary[] = [
      finished('old', '2024-12-21').summary,
      upcoming('next', '2026-12-19'),
      finished('test', '2025-12-21', true).summary,
      finished('last', '2025-12-20').summary,
    ]
    expect(palmares(editions).map((e) => e.id)).toEqual(['last', 'old'])
  })
})
