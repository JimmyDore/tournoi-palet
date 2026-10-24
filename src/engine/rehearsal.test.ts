import { describe, expect, it } from 'vitest'
import { adminView, bracketsView, poolView, replay, type Command, type PoolStanding } from './index.ts'
import { createEdition, run, type Harness } from './testing.ts'

// Répétition générale : équipes fictives et scores au hasard, éditions de test seulement.

const fake = (count: number): Command => ({ type: 'generateFakeTeams', count })
const fill: Command = { type: 'fillRandomScores' }
const draw = (round: number): Command => ({ type: 'drawPoolRound', round })

/** Édition de test (24 planches, plafond 48 par défaut) avec `count` équipes fictives. */
const rehearsal = (count: number, seed?: number) => run([createEdition({ isTest: true }), fake(count)], seed === undefined ? {} : { seed })

const REAL_REFUSAL = 'Réservé aux éditions de test : la répétition générale ne touche jamais une vraie édition.'
const NOTHING_TO_FILL = 'Aucun match sans score dans la partie en cours.'

describe('équipes fictives', () => {
  it('génère N équipes inscrites et déjà pointées', () => {
    const view = adminView(rehearsal(20).state)
    expect(view.teams).toHaveLength(20)
    expect(view.checkedInCount).toBe(20)
    expect(view.teams.every((team) => team.status === 'registered' && team.player1 && team.player2)).toBe(true)
  })

  it('donne des noms tous différents, certains avec un nom d’équipe, d’autres le nom par défaut', () => {
    const { teams } = adminView(rehearsal(64).state)
    const names = teams.map((t) => t.name.toLowerCase())
    expect(new Set(names).size).toBe(64)
    expect(teams.some((t) => t.customName)).toBe(true)
    expect(teams.some((t) => !t.customName)).toBe(true)
  })

  it('relève le plafond pour que toutes les fictives jouent, jusqu’à 64', () => {
    const t = rehearsal(52)
    expect(adminView(t.state).settings.maxTeams).toBe(52)
    expect(adminView(t.state).waitlistCount).toBe(0)
    t.apply(fake(12))
    expect(adminView(t.state).checkedInCount).toBe(64)
  })

  it('refuse au-delà de 64 équipes en tout, ou sans nombre valable', () => {
    const t = rehearsal(60)
    expect(t.refusal(fake(5))).toBe('Au plus 4 équipes de plus : une édition compte 64 équipes au maximum.')
    expect(t.refusal(fake(0))).toBe('Indiquez un nombre d’équipes (au moins 1).')
  })

  it('s’ajoute aux équipes déjà inscrites', () => {
    const t = run([createEdition({ isTest: true }), { type: 'registerTeam', team: { player1: 'Jean', player2: 'Paul' } }, fake(30)])
    expect(adminView(t.state).teams).toHaveLength(31)
    expect(adminView(t.state).checkedInCount).toBe(30)
  })

  it('est refusée sur une vraie édition et une fois le tournoi commencé', () => {
    const real = run([createEdition()])
    expect(real.refusal(fake(10))).toBe(REAL_REFUSAL)
    expect(real.refusal(fill)).toBe(REAL_REFUSAL)
    const started = rehearsal(10).apply(draw(1))
    expect(started.refusal(fake(2))).toBe('Le tournoi a commencé : on ne peut plus ajouter d’équipes.')
  })
})

describe('scores au hasard', () => {
  it('remplit tous les matchs sans score de la partie en cours, et garde ceux déjà saisis', () => {
    const t = rehearsal(16).apply(draw(1))
    const first = poolView(t.state).rounds[0].matches[0]
    t.apply({ type: 'enterPoolScore', matchId: first.id, scoreA: 2, scoreB: 13 })
    t.apply(fill)
    const round = poolView(t.state).rounds[0]
    expect(round.complete).toBe(true)
    expect(round.matches.find((m) => m.id === first.id)!.score).toEqual({ a: 2, b: 13 })
  })

  it('refuse quand il n’y a rien à remplir', () => {
    const t = rehearsal(16)
    expect(t.refusal(fill)).toBe(NOTHING_TO_FILL)
    t.apply(draw(1)).apply(fill)
    expect(t.refusal(fill)).toBe(NOTHING_TO_FILL)
  })

  it('écrit les scores dans les événements : le rejouage redonne le même classement', () => {
    const t = rehearsal(33).apply(draw(1)).apply(fill)
    expect(poolView(replay(t.events)).standings).toEqual(poolView(t.state).standings)
  })

  it('donne des scores valides, environ un sur cinq gagné à moins de 13', () => {
    const t = rehearsal(64)
    for (let r = 1; r <= 4; r++) t.apply(draw(r)).apply(fill)
    const scores = poolView(t.state).rounds.flatMap((r) => r.matches.map((m) => m.score!))
    expect(scores).toHaveLength(128)
    for (const { a, b } of scores) {
      expect(a).not.toBe(b)
      expect(Math.min(a, b)).toBeGreaterThanOrEqual(0)
      expect(Math.max(a, b)).toBeLessThanOrEqual(13)
    }
    const short = scores.filter((s) => Math.max(s.a, s.b) < 13).length / scores.length
    expect(short).toBeGreaterThan(0.08)
    expect(short).toBeLessThan(0.35)
  })
})

describe('répétition des 4 parties de poule', () => {
  const sum = (rows: PoolStanding[], key: 'wins' | 'losses' | 'pointsFor' | 'pointsAgainst') => rows.reduce((n, r) => n + r[key], 0)

  function playPools(t: Harness) {
    for (let r = 1; r <= 4; r++) t.apply(draw(r)).apply(fill)
    return t
  }

  it.each([16, 33, 40, 48, 52, 64])('%i équipes sur 24 planches : sans erreur, classement cohérent', (count) => {
    const t = rehearsal(count).apply(draw(1))
    // Au-delà de 48 équipes, plus de matchs que de planches : file d'attente.
    expect(poolView(t.state).rounds[0].awaitingBoard).toHaveLength(Math.max(0, Math.floor(count / 2) - 24))
    t.apply(fill)
    for (let r = 2; r <= 4; r++) t.apply(draw(r)).apply(fill)

    const { rounds, standings } = poolView(t.state)
    const matches = rounds.flatMap((r) => r.matches)
    const byes = rounds.filter((r) => r.bye).length
    expect(rounds.every((r) => r.complete)).toBe(true)
    expect(matches).toHaveLength(4 * Math.floor(count / 2))
    expect(byes).toBe(count % 2 === 0 ? 0 : 4)
    if (byes) expect(new Set(rounds.map((r) => r.bye!.team.id)).size).toBe(4)
    // Chaque équipe a joué 4 fois, exempt compris, sans revoir un adversaire.
    expect(standings).toHaveLength(count)
    expect(standings.every((s) => s.played === 4 && s.wins + s.losses === 4)).toBe(true)
    const pairs = matches.map((m) => [m.teamA.id, m.teamB.id].sort().join('-'))
    expect(new Set(pairs).size).toBe(pairs.length)
    // Une victoire par match et par exempt ; les points se compensent, sauf l'exempt (13-7).
    expect(sum(standings, 'wins')).toBe(matches.length + byes)
    expect(sum(standings, 'losses')).toBe(matches.length)
    expect(sum(standings, 'pointsFor') - sum(standings, 'pointsAgainst')).toBe(byes * 6)
    // Rangs 1..N, triés : victoires ↓, points pour ↓, différence ↓, points contre ↑.
    expect(standings.map((s) => s.rank)).toEqual(Array.from({ length: count }, (_, i) => i + 1))
    const key = (s: PoolStanding) => [s.wins, s.pointsFor, s.diff, -s.pointsAgainst]
    for (let i = 1; i < standings.length; i++) {
      const [kx, ky] = [key(standings[i - 1]), key(standings[i])]
      const k = kx.findIndex((v, j) => v !== ky[j])
      if (k >= 0) expect(kx[k]).toBeGreaterThan(ky[k])
    }
    expect(poolView(replay(t.events)).standings).toEqual(standings)
  })

  it.each([1, 2, 3, 4, 5])('41 équipes, graine %i : les 4 parties se déroulent sans refus', (seed) => {
    expect(() => playPools(rehearsal(41, seed))).not.toThrow()
  })

  describe('répétition des tableaux', () => {
    /** Poules jouées, répartition proposée validée, tableaux générés. */
    function bracketsStarted(count: number) {
      const t = playPools(rehearsal(count))
      t.apply({ type: 'validateSplit', principalCount: bracketsView(t.state).split.proposedPrincipal })
      return t.apply({ type: 'generateBrackets' })
    }

    it('remplit les matchs de tableau lancés sans score, tour par tour', () => {
      const t = bracketsStarted(48)
      const first = bracketsView(t.state).live[0]
      t.apply({ type: 'enterBracketScore', matchId: first.id, scoreA: 3, scoreB: 13 })
      t.apply(fill)
      const view = bracketsView(t.state)
      const p = view.brackets.find((b) => b.key === 'P')!
      expect(p.rounds[0].matches.find((m) => m.id === first.id)!.score).toEqual({ a: 3, b: 13 })
      expect(p.rounds[0].matches.every((m) => m.status === 'done')).toBe(true)
      // Les 1/8 du Principal et du Challenge Principal, les 1/4 de la Consolante et du Challenge Consolante viennent d'être lancés, pas encore remplis.
      expect(p.rounds[1].matches.every((m) => m.status === 'playing' && !m.score)).toBe(true)
      expect(view.live).toHaveLength(8 + 8 + 4 + 4)
    })

    it.each([16, 33, 40, 48, 52, 64])('%i équipes : de bout en bout jusqu’aux finales des quatre tableaux', (count) => {
      const t = bracketsStarted(count)
      let clicks = 0
      while (bracketsView(t.state).live.length > 0) {
        t.apply(fill)
        clicks++
      }
      const { brackets } = bracketsView(t.state)
      const rounds = (key: string) => brackets.find((b) => b.key === key)!.rounds.length
      // Un clic par tour du plus long tableau (ils avancent ensemble, un Challenge un tour après son parent).
      expect(brackets.map((b) => b.key)).toEqual(['P', 'CP', 'C', 'CC'])
      expect(clicks).toBe(Math.max(rounds('P'), rounds('C'), rounds('CP') + 1, rounds('CC') + 1))
      for (const b of brackets) {
        expect(b.winner).not.toBeNull()
        // Un Challenge d'une seule équipe n'a pas de match.
        if (b.rounds.length === 0) continue
        const final = b.rounds.at(-1)!.matches[0]
        expect(final).toMatchObject({ roundName: 'Finale', status: 'done' })
        expect(b.winner).not.toBeNull()
        expect([final.teamA!.id, final.teamB!.id]).toContain(b.winner!.id)
        expect(b.rounds.every((r) => r.matches.every((m) => m.status === 'done' || m.status === 'bye'))).toBe(true)
      }
      expect(t.refusal(fill)).toBe('Aucun match de tableau en cours sans score.')
      expect(bracketsView(replay(t.events)).brackets).toEqual(brackets)
    })
  })
})
