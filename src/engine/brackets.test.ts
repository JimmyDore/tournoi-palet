import { describe, expect, it } from 'vitest'
import { bracketsView, describeEvent, evolve, initialState, poolStandings, poolView, publicView, replay, seededRng, type Command } from './index.ts'
import { bracket, createEdition, poolsDone, run, type Harness } from './testing.ts'

// Tableaux : répartition Principal / Consolante, génération et premier tour.

describe('répartition Principal / Consolante', () => {
  it('propose 2/3 des équipes en Principal à la fin des poules : 48 → 32 / 16', () => {
    const t = poolsDone(48)
    expect(bracketsView(t.state).split).toMatchObject({ ready: true, participants: 48, proposedPrincipal: 32, validatedPrincipal: null })
  })
})

const validate = (principalCount: number): Command => ({ type: 'validateSplit', principalCount })
const generate: Command = { type: 'generateBrackets' }
const firstRound = (t: Harness, key: 'P' | 'C') => bracket(t, key).rounds[0].matches
/** Ids des équipes classées en poule, la 1re d'abord. */
const ranked = (t: Harness) => poolStandings(t.state).map((s) => s.team.id)
const exemptedIn = (t: Harness, key: 'P' | 'C') =>
  firstRound(t, key)
    .filter((m) => m.status === 'bye')
    .map((m) => (m.teamA ?? m.teamB)!.id)

describe('validation de la répartition', () => {
  it('refuse avant la fin des 4 parties de poule', () => {
    const early = run([createEdition(), ...[1, 2, 3, 4].map((i): Command => ({ type: 'registerTeam', team: { player1: `A${i}`, player2: `B${i}` } }))])
    expect(early.refusal(validate(2))).toBe('La répartition se valide une fois les 4 parties de poule terminées.')
    expect(bracketsView(early.state).split.ready).toBe(false)
  })

  it('accepte une répartition ajustée, revalidable avant la génération', () => {
    const t = poolsDone(48).apply(validate(30))
    expect(bracketsView(t.state).split).toMatchObject({ validatedPrincipal: 30, proposedPrincipal: 32 })
    expect(bracketsView(t.state).split.principal.map((r) => r.id)).toEqual(ranked(t).slice(0, 30))
    expect(bracketsView(t.state).split.consolante).toHaveLength(18)
    t.apply(validate(24))
    expect(bracketsView(t.state).split.validatedPrincipal).toBe(24)
    t.apply(generate)
    expect(bracket(t, 'P')).toMatchObject({ teams: 24, size: 32, byes: 8 })
    expect(bracket(t, 'C')).toMatchObject({ teams: 24, size: 32, byes: 8 })
  })

  it('refuse une répartition qui laisse moins de 2 équipes dans un tableau', () => {
    const t = poolsDone(12)
    expect(t.refusal(validate(11))).toBe('Chaque tableau doit compter au moins 2 équipes : entre 2 et 10 en Principal (12 équipes en jeu).')
    expect(t.refusal(validate(1))).toMatch(/au moins 2 équipes/)
    expect(t.refusal(validate(6.5))).toBe('Le nombre d’équipes en Principal doit être un nombre entier.')
  })

  it('ne compte pas les forfaits de poule', () => {
    const t = poolsDone(12)
    t.apply({ type: 'declareForfeit', teamId: 't3' })
    expect(bracketsView(t.state).split).toMatchObject({ participants: 11, proposedPrincipal: 7 })
    const split = bracketsView(t.state).split
    expect([...split.principal, ...split.consolante].map((r) => r.id)).not.toContain('t3')
  })

  it('refuse la génération sans répartition validée', () => {
    expect(poolsDone(12).refusal(generate)).toBe('Validez d’abord la répartition Principal / Consolante.')
  })
})

describe('génération des tableaux', () => {
  it('48 équipes : Principal de 32 et Consolante de 16, sans exempt', () => {
    const t = poolsDone(48).apply(validate(32)).apply(generate)
    expect(bracket(t, 'P')).toMatchObject({ name: 'Principal', teams: 32, size: 32, byes: 0 })
    expect(bracket(t, 'C')).toMatchObject({ name: 'Consolante', teams: 16, size: 16, byes: 0 })
    expect(firstRound(t, 'P')).toHaveLength(16)
    expect(firstRound(t, 'P')[0]).toMatchObject({ id: 'P:1:0', roundName: '1/16' })
    expect(firstRound(t, 'C')[0]).toMatchObject({ id: 'C:1:0', roundName: '1/8' })
    const all = [...firstRound(t, 'P'), ...firstRound(t, 'C')]
    expect(all.every((m) => m.teamA && m.teamB && m.status === 'playing')).toBe(true)
    const inP = firstRound(t, 'P').flatMap((m) => [m.teamA!.id, m.teamB!.id])
    expect(new Set(inP)).toEqual(new Set(ranked(t).slice(0, 32)))
  })

  it('48 équipes : 24 matchs sur les planches 1 à 24, Principal d’abord', () => {
    const t = poolsDone(48).apply(validate(32)).apply(generate)
    expect(firstRound(t, 'P').map((m) => m.board)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
    expect(firstRound(t, 'C').map((m) => m.board)).toEqual(Array.from({ length: 8 }, (_, i) => i + 17))
    expect(bracketsView(t.state).live.map((m) => m.board)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1))
  })

  it('têtes de série : 1 contre la dernière, 1 et 2 dans des moitiés opposées', () => {
    const t = poolsDone(48).apply(validate(32)).apply(generate)
    const r = ranked(t)
    const p = firstRound(t, 'P')
    expect([p[0].teamA!.id, p[0].teamB!.id]).toEqual([r[0], r[31]])
    expect([p[8].teamA!.id, p[8].teamB!.id]).toEqual([r[1], r[30]])
    expect(p[0].teamA!.poolRank).toBe(1)
    // Consolante : sa 1re (17e des poules) contre sa 16e (48e).
    const c = firstRound(t, 'C')
    expect([c[0].teamA!.id, c[0].teamB!.id]).toEqual([r[32], r[47]])
  })

  it.each([
    [40, 27, { P: [27, 32, 5], C: [13, 16, 3] }],
    [52, 35, { P: [35, 64, 29], C: [17, 32, 15] }],
  ] as const)('%i équipes : exempts aux mieux classés de chaque tableau', (count, principal, sizes) => {
    const t = poolsDone(count)
    expect(bracketsView(t.state).split.proposedPrincipal).toBe(principal)
    t.apply(validate(principal)).apply(generate)
    const r = ranked(t)
    for (const [key, entrants] of [['P', r.slice(0, principal)], ['C', r.slice(principal)]] as const) {
      const [teams, size, byes] = sizes[key]
      expect(bracket(t, key)).toMatchObject({ teams, size, byes })
      expect(new Set(exemptedIn(t, key))).toEqual(new Set(entrants.slice(0, byes)))
      for (const m of firstRound(t, key).filter((m) => m.status === 'bye')) expect(m.board).toBeNull()
    }
  })

  it('tirage au sort : exempts quand même aux mieux classés, le reste au hasard, reproductible', () => {
    const drawn = (seed: number) => {
      const t = poolsDone(40, { bracketFirstRound: 'random' }, 3).apply(validate(27))
      t.ctx = { ...t.ctx, rng: seededRng(seed) }
      t.apply(generate)
      return { t, pairs: firstRound(t, 'P').map((m) => [m.teamA?.id ?? null, m.teamB?.id ?? null]) }
    }
    const a = drawn(1)
    expect(drawn(1).pairs).toEqual(a.pairs)
    expect(drawn(2).pairs).not.toEqual(a.pairs)
    const r = ranked(a.t)
    const exempted = exemptedIn(a.t, 'P')
    expect(new Set(exempted)).toEqual(new Set(r.slice(0, 5)))
    const playing = a.pairs.flat().filter((id) => id && !exempted.includes(id))
    expect(new Set(playing)).toEqual(new Set(r.slice(5, 27)))
    const seeded = poolsDone(40, {}, 3).apply(validate(27)).apply(generate)
    expect(firstRound(seeded, 'P').map((m) => [m.teamA?.id ?? null, m.teamB?.id ?? null])).not.toEqual(a.pairs)
  })

  it('refuse une seconde génération et une nouvelle répartition après', () => {
    const t = poolsDone(12).apply(validate(8)).apply(generate)
    expect(t.refusal(generate)).toBe('Les tableaux sont déjà générés.')
    expect(t.refusal(validate(6))).toBe('Les tableaux sont déjà générés : la répartition ne peut plus changer.')
  })

  it('refuse les commandes de poule une fois les tableaux générés', () => {
    const t = poolsDone(12).apply(validate(8)).apply(generate)
    const poolMatch = poolView(t.state).rounds[3].matches[0]
    expect(t.refusal({ type: 'enterPoolScore', matchId: poolMatch.id, scoreA: 2, scoreB: 13 })).toBe('Les tableaux sont générés : les poules sont closes.')
    expect(t.refusal({ type: 'removePoolRound', round: 4, confirm: true })).toBe('Les tableaux sont générés : les poules sont closes.')
    expect(t.refusal({ type: 'updateEdition', changes: { byeScore: { winner: 13, loser: 0 } } })).toMatch(/score d’exempt/)
    expect(t.refusal({ type: 'updateEdition', changes: { boards: 20 } })).toBeNull()
  })

  it('le rejouage des événements redonne les mêmes tableaux', () => {
    const t = poolsDone(40).apply(validate(27)).apply(generate)
    expect(bracketsView(replay(t.events)).brackets).toEqual(bracketsView(t.state).brackets)
  })
})

describe('score de premier tour', () => {
  it('se saisit avec les règles des poules et libère la planche', () => {
    const t = poolsDone(48, { boards: 20 }).apply(validate(32)).apply(generate)
    expect(bracketsView(t.state).live.filter((m) => m.status === 'waiting-board').map((m) => m.id)).toEqual(['C:1:4', 'C:1:5', 'C:1:6', 'C:1:7'])
    const [first] = firstRound(t, 'P')
    expect(t.refusal({ type: 'enterBracketScore', matchId: first.id, scoreA: 13, scoreB: 13 })).toBe('Égalité impossible (13-13) : il faut un vainqueur.')
    expect(t.refusal({ type: 'enterBracketScore', matchId: first.id, scoreA: 14, scoreB: 2 })).toBe('Un score ne peut pas dépasser 13.')
    expect(t.refusal({ type: 'enterBracketScore', matchId: 'P:9:0', scoreA: 13, scoreB: 2 })).toBe("Ce match de tableau n'existe pas.")
    t.apply({ type: 'enterBracketScore', matchId: first.id, scoreA: 9, scoreB: 13 })
    expect(firstRound(t, 'P')[0]).toMatchObject({ score: { a: 9, b: 13 }, status: 'done', board: 1 })
    // La planche 1 passe au premier match en attente.
    expect(firstRound(t, 'C')[4]).toMatchObject({ board: 1, status: 'playing' })
    // Corriger : même commande (confirmée, le vainqueur change), pas de nouvelle planche libérée.
    t.apply({ type: 'enterBracketScore', matchId: first.id, scoreA: 13, scoreB: 4, confirm: true })
    expect(firstRound(t, 'P')[0].score).toEqual({ a: 13, b: 4 })
    expect(firstRound(t, 'C')[5].status).toBe('waiting-board')
  })

  it('refuse un score sur un exempt', () => {
    const t = poolsDone(40).apply(validate(27)).apply(generate)
    const bye = firstRound(t, 'P').find((m) => m.status === 'bye')!
    expect(t.refusal({ type: 'enterBracketScore', matchId: bye.id, scoreA: 13, scoreB: 0 })).toBe('Ce match n’a pas encore ses deux équipes.')
  })

  it('les matchs lancés apparaissent dans la vue publique (matchs en cours de la télé)', () => {
    const t = poolsDone(12).apply(validate(8)).apply(generate)
    const live = publicView(t.state).brackets.live
    expect(live).toHaveLength(6)
    expect(live[0]).toMatchObject({ bracketName: 'Principal', roundName: '1/4', board: 1, status: 'playing' })
  })
})

describe('journal des tableaux', () => {
  it('décrit la répartition, la génération et les scores', () => {
    const t = poolsDone(40).apply(validate(26)).apply(validate(27)).apply(generate)
    const first = firstRound(t, 'P').find((m) => m.status === 'playing')!
    t.apply({ type: 'enterBracketScore', matchId: first.id, scoreA: 13, scoreB: 6 })
    t.apply({ type: 'enterBracketScore', matchId: first.id, scoreA: 5, scoreB: 13, confirm: true })
    const states = t.events.reduce((acc, e) => [...acc, evolve(acc.at(-1)!, e)], [initialState()])
    const lines = t.events.map((e, i) => describeEvent(states[i], states[i + 1], e)).slice(-5)
    const a = first.teamA!.name
    const b = first.teamB!.name
    expect(lines).toEqual([
      { label: 'Répartition validée : 26 équipes en Principal, 14 en Consolante' },
      { label: 'Répartition validée : 27 équipes en Principal, 13 en Consolante', before: '26 en Principal', after: '27 en Principal' },
      { label: 'Tableaux générés (têtes de série) : Principal de 27 (5 exempts), Consolante de 13 (3 exempts)' },
      { label: `Score saisi (Principal, 1/16, planche ${first.board}) : « ${a} » 13-6 « ${b} »` },
      { label: `Score corrigé (Principal, 1/16, planche ${first.board}) ; vainqueur changé, 1 match suivant modifié`, before: `« ${a} » 13-6 « ${b} »`, after: `« ${a} » 5-13 « ${b} »` },
    ])
  })
})
