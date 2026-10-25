import { describe, expect, it } from 'vitest'
import { bracketsView, describeEvent, milestones, replay, type BracketMatchView } from './index.ts'
import { bracket, bracketsReady, round, type Harness } from './testing.ts'

// Tableaux : avancement des vainqueurs, tours synchronisés, planches.

/** Fait gagner l'équipe A (13-5) ou B (4-13). */
const win = (t: Harness, m: BracketMatchView, side: 'A' | 'B' = 'A', confirm = false) =>
  t.apply({ type: 'enterBracketScore', matchId: m.id, scoreA: side === 'A' ? 13 : 4, scoreB: side === 'A' ? 5 : 13, confirm })
const winnerId = (m: BracketMatchView) => {
  if (m.status === 'bye') return (m.teamA ?? m.teamB)!.id
  return m.score!.a > m.score!.b ? m.teamA!.id : m.teamB!.id
}
/** Joue tous les matchs lancés sans score d'un tour, l'équipe A gagnante. */
const playRound = (t: Harness, key: 'P' | 'C', n: number) => {
  for (const m of round(t, key, n).filter((m) => m.status === 'playing' || m.status === 'waiting-board')) win(t, m)
}

describe('avancement des vainqueurs', () => {
  it('le tableau compte tous ses tours jusqu’à la finale, les suivants sans équipes au départ', () => {
    const t = bracketsReady(48)
    expect(bracket(t, 'P').rounds.map((r) => [r.name, r.matches.length])).toEqual([
      ['1/16', 16],
      ['1/8', 8],
      ['1/4', 4],
      ['1/2', 2],
      ['Finale', 1],
    ])
    expect(bracket(t, 'C').rounds.map((r) => r.name)).toEqual(['1/8', '1/4', '1/2', 'Finale'])
    expect(round(t, 'P', 2)[0]).toMatchObject({ id: 'P:2:0', teamA: null, teamB: null, status: 'pending', board: null })
  })

  it('le vainqueur du match 2i et celui du 2i+1 se retrouvent au tour suivant', () => {
    const t = bracketsReady(48)
    const [m0, m1] = round(t, 'P', 1)
    win(t, m0, 'B')
    win(t, m1, 'A')
    expect(round(t, 'P', 2)[0]).toMatchObject({ teamA: { id: m0.teamB!.id }, teamB: { id: m1.teamA!.id }, status: 'pending' })
  })
})

describe('tours synchronisés', () => {
  it('le tour suivant n’est lancé qu’une fois le tour complet, sur les plus petites planches libres', () => {
    const t = bracketsReady(48)
    const first = round(t, 'P', 1)
    for (const m of first.slice(0, 15)) win(t, m)
    // 15 matchs sur 16 joués : les 1/8 déjà connus attendent la fin du tour.
    expect(round(t, 'P', 2).slice(0, 7).every((m) => m.teamA && m.teamB && m.status === 'pending' && m.board === null)).toBe(true)
    expect(t.refusal({ type: 'enterBracketScore', matchId: 'P:2:0', scoreA: 13, scoreB: 2 })).toBe('Ce match n’est pas encore lancé.')
    win(t, first[15])
    expect(round(t, 'P', 2).map((m) => m.status)).toEqual(Array(8).fill('playing'))
    // Planches 1 à 16 libérées (la Consolante occupe 17 à 24) : les 1/8 prennent 1 à 8.
    expect(round(t, 'P', 2).map((m) => m.board)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(round(t, 'P', 3).map((m) => m.status)).toEqual(Array(4).fill('pending'))
  })

  it('chaque tableau avance à son rythme', () => {
    const t = bracketsReady(48)
    playRound(t, 'C', 1)
    expect(round(t, 'C', 2).map((m) => m.status)).toEqual(Array(4).fill('playing'))
    expect(round(t, 'C', 2).map((m) => m.board)).toEqual([17, 18, 19, 20])
    expect(round(t, 'P', 2).map((m) => m.status)).toEqual(Array(8).fill('pending'))
  })

  it.each([48, 40, 52])('%i équipes : les vainqueurs avancent jusqu’à la finale de chaque tableau', (count) => {
    const t = bracketsReady(count)
    for (const key of ['P', 'C'] as const) {
      const rounds = bracket(t, key).rounds.length
      for (let n = 1; n <= rounds; n++) {
        expect(bracket(t, key).winner).toBeNull()
        // Côté B gagnant au 1er tour, A ensuite : on suit le chemin à la main.
        for (const m of round(t, key, n).filter((m) => m.status === 'playing' || m.status === 'waiting-board')) win(t, m, n === 1 ? 'B' : 'A')
        const played = round(t, key, n)
        if (n < rounds) {
          const next = round(t, key, n + 1)
          next.forEach((m, i) => expect([m.teamA!.id, m.teamB!.id]).toEqual([winnerId(played[2 * i]), winnerId(played[2 * i + 1])]))
        }
      }
      const final = round(t, key, rounds)[0]
      expect(final.roundName).toBe('Finale')
      expect(bracket(t, key).winner!.id).toBe(winnerId(final))
    }
    // Plus aucun match du Principal ni de la Consolante en cours (restent les Challenges).
    expect(bracketsView(t.state).live.filter((m) => m.bracket === 'P' || m.bracket === 'C')).toEqual([])
  })
})

describe('rythme « au fil de l’eau »', () => {
  it('un match est lancé dès que ses deux équipes sont connues, sans attendre la fin du tour', () => {
    const t = bracketsReady(48, { bracketPace: 'asReady' })
    const first = round(t, 'P', 1)
    win(t, first[0])
    expect(round(t, 'P', 2)[0]).toMatchObject({ teamB: null, status: 'pending' })
    win(t, first[1])
    // Le 1er 1/8 a ses deux équipes : lancé sur la planche libérée la plus petite.
    expect(round(t, 'P', 2)[0]).toMatchObject({ status: 'playing', board: 1 })
    expect(round(t, 'P', 2)[1].status).toBe('pending')
  })

  it('passer au fil de l’eau en cours de tableau lance aussitôt les matchs prêts', () => {
    const t = bracketsReady(48)
    win(t, round(t, 'P', 1)[0])
    win(t, round(t, 'P', 1)[1])
    expect(round(t, 'P', 2)[0].status).toBe('pending')
    t.apply({ type: 'updateEdition', changes: { bracketPace: 'asReady' } })
    expect(round(t, 'P', 2)[0].status).toBe('playing')
    expect(bracketsView(t.state).ready).toBe(0)
  })

  it('refuse un rythme inconnu', () => {
    const t = bracketsReady(12)
    expect(t.refusal({ type: 'updateEdition', changes: { bracketPace: 'vite' as never } })).toMatch(/rythme des tableaux/i)
  })
})

describe('journal', () => {
  it('le score qui complète un tour annonce le lancement du suivant, et du Challenge', () => {
    const t = bracketsReady(12, { boards: 3 })
    const [m0, m1, m2, m3] = round(t, 'P', 1)
    for (const m of [m0, m1, m2]) win(t, m)
    win(t, m3)
    const before = replay(t.events.slice(0, -1))
    const line = describeEvent(before, t.state, t.events.at(-1)!)
    expect(line.label).toBe(`Score saisi (Principal, 1/4, planche 1) : « ${m3.teamA!.name} » 13-5 « ${m3.teamB!.name} » ; lancement des 1/2 du Principal et des 1/2 du Challenge Principal, 3 en attente de planche`)
  })
})

describe('jalons de copie', () => {
  it('chaque tour de tableau complet est un jalon, après les parties de poule', () => {
    const t = bracketsReady(12)
    const poules = ['poule-partie-1', 'poule-partie-2', 'poule-partie-3', 'poule-partie-4']
    expect(milestones(t.state)).toEqual(poules)
    playRound(t, 'C', 1)
    expect(milestones(t.state)).toEqual([...poules, 'tableau-C-tour-1'])
    playRound(t, 'P', 1)
    playRound(t, 'P', 2)
    expect(milestones(t.state)).toEqual([...poules, 'tableau-P-tour-1', 'tableau-P-tour-2', 'tableau-C-tour-1'])
    // Corriger un score d'un tour complet n'en crée pas de nouveau.
    win(t, round(t, 'P', 2)[0], 'B', true)
    expect(milestones(t.state)).toHaveLength(7)
  })
})

describe('planches', () => {
  it('avec 4 planches : les matchs lancés attendent et prennent la prochaine planche libérée', () => {
    const t = bracketsReady(12, { boards: 4 })
    // Principal de 8 (4 matchs) puis Consolante de 4 (2 matchs) : 6 matchs pour 4 planches.
    const live = () => bracketsView(t.state).live
    expect(live().map((m) => [m.id, m.board, m.status])).toEqual([
      ['P:1:0', 1, 'playing'],
      ['P:1:1', 2, 'playing'],
      ['P:1:2', 3, 'playing'],
      ['P:1:3', 4, 'playing'],
      ['C:1:0', null, 'waiting-board'],
      ['C:1:1', null, 'waiting-board'],
    ])
    win(t, round(t, 'P', 1)[2])
    expect(round(t, 'C', 1)[0]).toMatchObject({ board: 3, status: 'playing' })
    win(t, round(t, 'P', 1)[0])
    win(t, round(t, 'P', 1)[1])
    expect(round(t, 'C', 1)[1]).toMatchObject({ board: 1, status: 'playing' })
    // Dernier match du 1/4 : la planche 4 se libère et les deux 1/2 sont lancés, la 2 et la 4 libres.
    win(t, round(t, 'P', 1)[3])
    expect(round(t, 'P', 2).map((m) => [m.board, m.status])).toEqual([
      [2, 'playing'],
      [4, 'playing'],
    ])
    // Le Challenge Principal (4 perdants), lancé en même temps, attend derrière : il prend les planches de la Consolante.
    win(t, round(t, 'C', 1)[0])
    win(t, round(t, 'C', 1)[1])
    expect(round(t, 'CP', 1).map((m) => [m.board, m.status])).toEqual([
      [3, 'playing'],
      [1, 'playing'],
    ])
    // La finale de la Consolante attend la prochaine planche libre, file commune à tous les tableaux.
    expect(round(t, 'C', 2)[0]).toMatchObject({ board: null, status: 'waiting-board' })
  })

  it('un match en attente garde sa place dans la file, même d’un tour suivant', () => {
    const t = bracketsReady(12, { boards: 2 })
    const order = () => bracketsView(t.state).live.filter((m) => m.status === 'waiting-board').map((m) => m.id)
    expect(order()).toEqual(['P:1:2', 'P:1:3', 'C:1:0', 'C:1:1'])
    win(t, round(t, 'P', 1)[0])
    win(t, round(t, 'P', 1)[1])
    win(t, round(t, 'P', 1)[2])
    win(t, round(t, 'P', 1)[3])
    // Les 1/2 du Principal et le Challenge Principal arrivent derrière la Consolante.
    expect(order()).toEqual(['P:2:0', 'P:2:1', 'CP:1:0', 'CP:1:1'])
    expect(round(t, 'C', 1).map((m) => m.board)).toEqual([1, 2])
  })
})
