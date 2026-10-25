import { describe, expect, it } from 'vitest'
import { adminView, clockReading, describeEvent, poolView, initialState, publicView, replay, type Command } from './index.ts'
import { createEdition, run, TEST_NOW } from './testing.ts'

const start = (durationMin?: number) => ({ type: 'startClock', ...(durationMin !== undefined ? { durationMin } : {}) }) as Command
const stop = { type: 'stopClock' } as Command
const MIN = 60_000

describe('chrono', () => {
  it('n’est pas lancé à la création de l’édition', () => {
    const t = run([createEdition()])
    expect(publicView(t.state).clock).toBeNull()
  })

  it('se lance avec la durée d’une partie réglée dans l’édition, à l’heure du serveur', () => {
    const t = run([createEdition({ gameMinutes: 25 })])
    const now = t.ctx.now
    t.apply(start())
    expect(publicView(t.state).clock).toEqual({ startedAt: now, durationMs: 25 * MIN, stoppedAt: null })
  })

  it('accepte une autre durée pour ce lancement', () => {
    const t = run([createEdition(), start(45)])
    expect(publicView(t.state).clock?.durationMs).toBe(45 * MIN)
  })

  it('refuse une durée qui n’est pas un nombre de minutes raisonnable', () => {
    const t = run([createEdition()])
    expect(t.refusal(start(0))).toBe('La durée du chrono doit être un nombre de minutes entre 1 et 180.')
    expect(t.refusal(start(2.5))).toBe('La durée du chrono doit être un nombre de minutes entre 1 et 180.')
  })

  it('s’arrête, et garde l’heure de l’arrêt', () => {
    const t = run([createEdition(), start()])
    const startedAt = publicView(t.state).clock!.startedAt
    const now = t.ctx.now
    t.apply(stop)
    expect(publicView(t.state).clock).toEqual({ startedAt, durationMs: 30 * MIN, stoppedAt: now })
  })

  it('refuse l’arrêt d’un chrono qui ne tourne pas', () => {
    expect(run([createEdition()]).refusal(stop)).toBe('Le chrono n’est pas lancé.')
    expect(run([createEdition(), start(), stop]).refusal(stop)).toBe('Le chrono n’est pas lancé.')
  })

  it('se relance de zéro, qu’il soit arrêté ou en cours', () => {
    const t = run([createEdition(), start(), stop])
    const now = t.ctx.now
    t.apply(start())
    expect(publicView(t.state).clock).toEqual({ startedAt: now, durationMs: 30 * MIN, stoppedAt: null })
    const later = t.ctx.now
    t.apply(start(10))
    expect(publicView(t.state).clock).toEqual({ startedAt: later, durationMs: 10 * MIN, stoppedAt: null })
  })

  it('ne bloque aucune autre action, même en dépassement', () => {
    const t = run([
      createEdition({ maxTeams: 4 }),
      start(1),
      { type: 'registerTeam', team: { player1: 'Anne', player2: 'Bob' } } as Command,
      { type: 'registerTeam', team: { player1: 'Carl', player2: 'Dora' } } as Command,
    ])
    for (const team of adminView(t.state).teams) t.apply({ type: 'checkInTeam', teamId: team.id } as Command)
    t.apply({ type: 'drawPoolRound', round: 1 } as Command)
    const match = poolView(t.state).rounds[0].matches[0]
    t.apply({ type: 'enterPoolScore', matchId: match.id, scoreA: 13, scoreB: 4 } as Command)
    t.apply({ type: 'updateEdition', changes: { gameMinutes: 20 } } as Command)
    expect(publicView(t.state).pool.rounds[0].complete).toBe(true)
    expect(publicView(t.state).clock?.stoppedAt).toBeNull()
  })

  it('note le lancement, l’arrêt et la relance au journal', () => {
    const t = run([createEdition(), start(), stop, start(20)])
    const at = (n: number) => replay(t.events.slice(0, n), initialState())
    const label = (n: number) => describeEvent(at(n), at(n + 1), t.events[n]).label
    expect(label(1)).toBe('Chrono lancé : 30 min')
    expect(label(2)).toBe('Chrono arrêté')
    expect(label(3)).toBe('Chrono relancé : 20 min')
  })
})

describe('lecture du chrono', () => {
  const clock = { startedAt: TEST_NOW, durationMs: 30 * MIN, stoppedAt: null }

  it('affiche le temps restant en minutes et secondes', () => {
    expect(clockReading(clock, TEST_NOW)).toEqual({ text: '30:00', state: 'running', running: true })
    expect(clockReading(clock, TEST_NOW + 61_500)).toEqual({ text: '28:59', state: 'running', running: true })
  })

  it('passe en alerte à 5 minutes de la fin', () => {
    expect(clockReading(clock, TEST_NOW + 24 * MIN + 59_000).state).toBe('running')
    expect(clockReading(clock, TEST_NOW + 25 * MIN)).toEqual({ text: '5:00', state: 'alert', running: true })
    expect(clockReading(clock, TEST_NOW + 30 * MIN - 1)).toEqual({ text: '0:01', state: 'alert', running: true })
  })

  it('continue en dépassement après zéro', () => {
    expect(clockReading(clock, TEST_NOW + 30 * MIN)).toEqual({ text: '0:00', state: 'alert', running: true })
    expect(clockReading(clock, TEST_NOW + 32 * MIN + 13_000)).toEqual({ text: '+2:13', state: 'overtime', running: true })
    expect(clockReading(clock, TEST_NOW + 95 * MIN).text).toBe('+65:00')
  })

  it('se fige à l’heure de l’arrêt', () => {
    const stopped = { ...clock, stoppedAt: TEST_NOW + 10 * MIN }
    expect(clockReading(stopped, TEST_NOW + 50 * MIN)).toEqual({ text: '20:00', state: 'running', running: false })
  })

  it('ne dépasse pas la durée si l’horloge locale retarde un peu', () => {
    expect(clockReading(clock, TEST_NOW - 3_000).text).toBe('30:00')
  })
})
