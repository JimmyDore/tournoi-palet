import { describe, expect, it } from 'vitest'
import { describeEvent, initialState, nextMatchOf, phaseOf, poolView, replay, type Command } from './index.ts'
import { createEdition, run, type Harness } from './testing.ts'

// Parties 2 à 4 : tirage sans revoir un adversaire, exempt tournant, forfaits,
// corrections et retrait de la dernière partie.

const register = (player1: string, player2: string): Command => ({ type: 'registerTeam', team: { player1, player2 } })
const draw = (round: number): Command => ({ type: 'drawPoolRound', round })

/** `count` équipes (t1, t2…), toutes pointées. */
function checkedIn(count: number, settings = {}, seed?: number) {
  const ids = Array.from({ length: count }, (_, i) => i + 1)
  return run(
    [
      createEdition(settings),
      ...ids.map((i) => register(`J${i}a`, `J${i}b`)),
      ...ids.map((i): Command => ({ type: 'checkInTeam', teamId: `t${i}` })),
    ],
    seed === undefined ? {} : { seed },
  )
}

const lastRound = (t: Harness) => poolView(t.state).rounds.at(-1)!

/** Saisit 13-`loser` pour l'équipe A de chaque match encore sans score de la dernière partie. */
function finishRound(t: Harness, loser = 7) {
  for (const m of lastRound(t).matches) if (!m.score) t.apply({ type: 'enterPoolScore', matchId: m.id, scoreA: 13, scoreB: loser })
  return t
}

/** Joue `rounds` parties complètes. */
function play(t: Harness, rounds: number) {
  for (let r = 1; r <= rounds; r++) finishRound(t.apply(draw(r)))
  return t
}

const pairKey = (a: string, b: string) => [a, b].sort().join('-')

describe('parties 2 à 4', () => {
  it.each([7, 8, 9])('48 équipes sur 4 parties : une seule apparition par partie, aucun adversaire revu (graine %i)', (seed) => {
    const t = play(checkedIn(48, {}, seed), 4)
    const { rounds } = poolView(t.state)
    expect(rounds.map((r) => r.round)).toEqual([1, 2, 3, 4])
    const seen = new Set<string>()
    for (const r of rounds) {
      expect(r.matches).toHaveLength(24)
      expect(r.bye).toBeNull()
      const teams = r.matches.flatMap((m) => [m.teamA.id, m.teamB.id])
      expect(new Set(teams).size).toBe(48)
      expect(r.matches.map((m) => m.board).sort((a, b) => a! - b!)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1))
      for (const m of r.matches) {
        const key = pairKey(m.teamA.id, m.teamB.id)
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }
    expect(poolView(t.state).standings.every((s) => s.played === 4)).toBe(true)
  })

  it('numérote les matchs de chaque partie (r2m1…)', () => {
    const t = play(checkedIn(4), 1).apply(draw(2))
    expect(lastRound(t).matches.map((m) => m.id).sort()).toEqual(['r2m1', 'r2m2'])
  })

  it('refuse la partie suivante tant que la précédente n’est pas terminée', () => {
    const t = checkedIn(6).apply(draw(1))
    const [first] = lastRound(t).matches
    t.apply({ type: 'enterPoolScore', matchId: first.id, scoreA: 13, scoreB: 2 })
    expect(t.refusal(draw(2))).toBe('La partie 1 n’est pas terminée : 2 matchs sans score.')
  })

  it('refuse une 5e partie', () => {
    const t = play(checkedIn(10), 4)
    expect(t.refusal(draw(5))).toBe('Les 4 parties de poule sont déjà lancées.')
  })

  it('refuse lisiblement quand aucun tirage sans revoir un adversaire n’existe', () => {
    // 4 équipes : chacune a rencontré les 3 autres après 3 parties.
    const t = play(checkedIn(4), 3)
    expect(t.refusal(draw(4))).toBe('Impossible de tirer la partie 4 sans faire rejouer deux équipes qui se sont déjà affrontées.')
  })
})

describe('nombre impair : l’exempt tourne', () => {
  it.each([1, 2, 3, 4, 5])('33 équipes : un exempt différent à chaque partie, au score d’exempt réglé (graine %i)', (seed) => {
    const t = play(checkedIn(33, { byeScore: { winner: 13, loser: 5 } }, seed), 4)
    const { rounds, standings } = poolView(t.state)
    const byes = rounds.map((r) => r.bye!.team.id)
    expect(new Set(byes).size).toBe(4)
    for (const r of rounds) {
      expect(r.bye!.score).toEqual({ a: 13, b: 5 })
      const teams = [...r.matches.flatMap((m) => [m.teamA.id, m.teamB.id]), r.bye!.team.id]
      expect(new Set(teams).size).toBe(33)
    }
    expect(standings.every((s) => s.played === 4)).toBe(true)
  })

  it('3 équipes : chacune exempte à son tour, sans jamais rejouer', () => {
    const t = play(checkedIn(3), 3)
    const { rounds } = poolView(t.state)
    expect(new Set(rounds.map((r) => r.bye!.team.id)).size).toBe(3)
    expect(t.refusal(draw(4))).toBe('Impossible de tirer la partie 4 sans faire rejouer deux équipes qui se sont déjà affrontées.')
  })
})

describe('forfait en poule', () => {
  const forfeit = (teamId: string): Command => ({ type: 'declareForfeit', teamId })

  it('le match en cours du forfaité est gagné 13-0 par l’adversaire, la partie peut se terminer', () => {
    const t = checkedIn(4).apply(draw(1))
    const match = lastRound(t).matches.find((m) => m.teamA.id === 't1' || m.teamB.id === 't1')!
    t.apply(forfeit('t1'))
    const after = lastRound(t).matches.find((m) => m.id === match.id)!
    expect(after.status).toBe('done')
    expect(after.forfeit).toBe('t1')
    expect(after.teamA.id === 't1' ? after.score : { a: after.score!.b, b: after.score!.a }).toEqual({ a: 0, b: 13 })
    expect(lastRound(t).awaitingScore).toHaveLength(1)
    finishRound(t)
    expect(t.refusal(draw(2))).toBeNull()
  })

  it('n’est plus tiré, et finit en bas du classement des poules', () => {
    const t = play(checkedIn(9), 1)
    t.apply(forfeit('t1'))
    for (let r = 2; r <= 4; r++) finishRound(t.apply(draw(r)))
    const { rounds, standings } = poolView(t.state)
    for (const r of rounds.slice(1)) {
      const teams = [...r.matches.flatMap((m) => [m.teamA.id, m.teamB.id]), ...(r.bye ? [r.bye.team.id] : [])]
      expect(teams).not.toContain('t1')
      expect(teams).toHaveLength(8)
      expect(r.bye).toBeNull()
    }
    expect(standings.at(-1)).toMatchObject({ team: { id: 't1' }, forfeit: true })
    expect(standings.slice(0, -1).every((s) => !s.forfeit && s.played === 4)).toBe(true)
  })

  it('un score saisi ensuite remplace le 13-0', () => {
    const t = checkedIn(4).apply(draw(1)).apply(forfeit('t1'))
    const match = lastRound(t).matches.find((m) => m.forfeit === 't1')!
    t.apply({ type: 'enterPoolScore', matchId: match.id, scoreA: 9, scoreB: 13 })
    expect(lastRound(t).matches.find((m) => m.id === match.id)).toMatchObject({ score: { a: 9, b: 13 }, forfeit: null, status: 'done' })
  })

  it('libère la planche du forfaité pour le premier match en attente', () => {
    const t = checkedIn(6, { boards: 1 }).apply(draw(1))
    const [playing, waiting] = lastRound(t).matches
    t.apply(forfeit(playing.teamA.id))
    expect(lastRound(t).matches.find((m) => m.id === waiting.id)).toMatchObject({ board: playing.board, status: 'playing' })
  })

  it('n’a plus de prochain match', () => {
    const t = checkedIn(4).apply(draw(1)).apply(forfeit('t1'))
    expect(nextMatchOf(t.state, 't1')).toBeNull()
  })

  it.each([
    ['avant le tirage', (t: Harness) => t, 't1', 'Le tournoi n’a pas commencé : désinscrivez l’équipe plutôt que de la déclarer forfait.'],
    ['deux fois', (t: Harness) => t.apply(draw(1)).apply(forfeit('t1')), 't1', '« J1a & J1b » est déjà déclarée forfait.'],
    ['inconnue', (t: Harness) => t.apply(draw(1)), 't99', "Cette équipe n'existe pas."],
  ])('refuse %s', (_, setup, teamId, reason) => {
    expect(setup(checkedIn(4)).refusal(forfeit(teamId))).toBe(reason)
  })

  it('refuse une équipe qui n’a pas été tirée', () => {
    const t = run([createEdition(), ...['A', 'B', 'C'].map((l) => register(`${l}1`, `${l}2`))])
    t.apply({ type: 'checkInTeam', teamId: 't1' }).apply({ type: 'checkInTeam', teamId: 't2' }).apply(draw(1))
    expect(t.refusal(forfeit('t3'))).toBe('« C1 & C2 » n’a pas été tirée en poule : désinscrivez-la plutôt.')
  })

  it('s’annule tant qu’aucune partie n’a été tirée sans l’équipe', () => {
    const t = checkedIn(4).apply(draw(1))
    const before = poolView(t.state)
    t.apply(forfeit('t1')).apply({ type: 'cancelForfeit', teamId: 't1' })
    expect(poolView(t.state)).toEqual(before)
    t.apply(forfeit('t1'))
    finishRound(t).apply(draw(2))
    expect(t.refusal({ type: 'cancelForfeit', teamId: 't1' })).toBe('La partie 2 a été tirée sans « J1a & J1b » : son forfait ne peut plus être annulé.')
    expect(t.refusal({ type: 'cancelForfeit', teamId: 't2' })).toBe('« J2a & J2b » n’est pas déclarée forfait.')
  })
})

describe('correction de score', () => {
  it('recalcule le classement sans autre action, même après des parties suivantes', () => {
    const t = play(checkedIn(8), 2)
    const first = poolView(t.state).rounds[0].matches[0]
    const winner = first.teamA.id
    const row = () => poolView(t.state).standings.find((s) => s.team.id === winner)!
    const was = row()
    t.apply({ type: 'enterPoolScore', matchId: first.id, scoreA: 2, scoreB: 13 })
    expect(row()).toMatchObject({ wins: was.wins - 1, losses: was.losses + 1, pointsFor: was.pointsFor - 11, pointsAgainst: was.pointsAgainst + 6 })
  })
})

describe('retrait de la dernière partie', () => {
  const remove = (round: number, confirm?: boolean): Command => ({ type: 'removePoolRound', round, ...(confirm === undefined ? {} : { confirm }) })

  it('sans confirmation, refuse en disant ce qui sera effacé', () => {
    const t = play(checkedIn(5), 1).apply(draw(2))
    const [m] = lastRound(t).matches
    t.apply({ type: 'enterPoolScore', matchId: m.id, scoreA: 13, scoreB: 1 })
    const warning = 'Retirer la partie 2 efface son tirage (2 matchs et l’exempt) et 1 score saisi. Confirmez pour la retirer.'
    expect(t.refusal(remove(2))).toBe(warning)
    expect(t.refusal(remove(2, false))).toBe(warning)
  })

  it('n’accepte que la dernière partie', () => {
    const t = play(checkedIn(4), 2)
    expect(t.refusal(remove(1, true))).toBe('Seule la dernière partie lancée (la partie 2) peut être retirée.')
    expect(checkedIn(4).refusal(remove(1, true))).toBe('Aucune partie n’est lancée.')
  })

  it('confirmée, efface le tirage et les scores ; la partie se relance avec les mêmes identifiants', () => {
    const t = play(checkedIn(8), 1)
    const afterRound1 = poolView(t.state)
    finishRound(t.apply(draw(2)))
    t.apply(remove(2, true))
    expect(poolView(t.state)).toEqual(afterRound1)
    t.apply(draw(2))
    expect(lastRound(t).matches.map((m) => m.id).sort()).toEqual(['r2m1', 'r2m2', 'r2m3', 'r2m4'])
    expect(lastRound(t).matches.every((m) => m.status === 'playing')).toBe(true)
  })

  it('un forfait déclaré pendant la partie retirée reste valable au nouveau tirage', () => {
    const t = checkedIn(5).apply(draw(1)).apply({ type: 'declareForfeit', teamId: 't1' }).apply(remove(1, true)).apply(draw(1))
    const r = lastRound(t)
    expect([...r.matches.flatMap((m) => [m.teamA.id, m.teamB.id]), r.bye?.team.id]).not.toContain('t1')
    expect(r.bye).toBeNull()
  })

  it('retirer la partie 1 rouvre le pointage', () => {
    const t = checkedIn(4).apply(draw(1)).apply(remove(1, true))
    expect(phaseOf(t.state)).toBe('before')
    expect(t.refusal({ type: 'undoCheckIn', teamId: 't1' })).toBeNull()
  })
})

describe('journal', () => {
  const journal = (t: Harness) => {
    const states = [initialState(), ...t.events.map((_, i) => replay(t.events.slice(0, i + 1)))]
    return t.events.map((e, i) => describeEvent(states[i], states[i + 1], e))
  }

  it('décrit le forfait, son annulation, la correction d’un 13-0 et le retrait', () => {
    const t = checkedIn(4).apply(draw(1))
    const match = lastRound(t).matches.find((m) => m.teamA.id === 't1' || m.teamB.id === 't1')!
    const other = match.teamA.id === 't1' ? match.teamB : match.teamA
    const t1First = match.teamA.id === 't1'
    t.apply({ type: 'declareForfeit', teamId: 't1' })
    t.apply({ type: 'cancelForfeit', teamId: 't1' })
    t.apply({ type: 'declareForfeit', teamId: 't1' })
    t.apply({ type: 'enterPoolScore', matchId: match.id, scoreA: t1First ? 4 : 13, scoreB: t1First ? 13 : 4 })
    t.apply({ type: 'removePoolRound', round: 1, confirm: true })
    const line = (a: number, b: number) => `« ${match.teamA.name} » ${a}-${b} « ${match.teamB.name} »`
    const declared = { label: `Équipe « J1a & J1b » déclarée forfait ; « ${other.name} » gagne 13-0 ; elle ne sera plus tirée` }
    expect(journal(t).slice(-5)).toEqual([
      declared,
      { label: 'Forfait de « J1a & J1b » annulé' },
      declared,
      {
        label: `Score corrigé (partie 1, planche ${match.board})`,
        before: `${t1First ? line(0, 13) : line(13, 0)} (forfait)`,
        after: t1First ? line(4, 13) : line(13, 4),
      },
      { label: 'Partie 1 retirée : tirage et scores effacés', before: '2 matchs, 1 score saisi', after: 'partie à relancer' },
    ])
    expect(replay(t.events)).toEqual(t.state)
  })
})

describe('robustesse du tirage', () => {
  it.each([64, 63, 10, 9, 8, 7, 6, 5])('%i équipes, avec un forfait : parties sans revoir un adversaire', (count) => {
    for (const seed of [1, 2, 3]) {
      const t = play(checkedIn(count, { maxTeams: 64 }, seed), 1)
      if (count > 6) t.apply({ type: 'declareForfeit', teamId: 't2' })
      for (let r = 2; r <= 4; r++) {
        if (t.refusal(draw(r))) break
        finishRound(t.apply(draw(r)))
      }
      const seen = new Set<string>()
      for (const r of poolView(t.state).rounds)
        for (const m of r.matches) {
          const key = pairKey(m.teamA.id, m.teamB.id)
          expect(seen.has(key)).toBe(false)
          seen.add(key)
        }
      if (count >= 9) expect(poolView(t.state).rounds).toHaveLength(4)
    }
  })
})
