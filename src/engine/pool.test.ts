import { describe, expect, it } from 'vitest'
import { adminView, describeEvent, initialState, nextMatchOf, phaseOf, poolView, publicView, replay, type Command } from './index.ts'
import { createEdition, run, type Harness } from './testing.ts'

const register = (player1: string, player2: string): Command => ({ type: 'registerTeam', team: { player1, player2 } })
const draw: Command = { type: 'drawPoolRound', round: 1 }

/** `count` équipes « J1a & J1b », « J2a & J2b »… (t1, t2…), toutes pointées. */
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

const matches = (t: Harness) => poolView(t.state).rounds[0].matches

/** Match de la partie en cours où joue `teamId`. */
function matchOf(t: Harness, teamId: string) {
  const match = matches(t).find((m) => m.teamA.id === teamId || m.teamB.id === teamId)
  if (!match) throw new Error(`${teamId} ne joue pas`)
  return match
}

/** Saisit le score du match de `teamId`, vu de son côté : `mine` pour elle, `theirs` pour l'adversaire. */
function score(t: Harness, teamId: string, mine: number, theirs: number): Command {
  const match = matchOf(t, teamId)
  const isA = match.teamA.id === teamId
  return { type: 'enterPoolScore', matchId: match.id, scoreA: isA ? mine : theirs, scoreB: isA ? theirs : mine }
}

const opponentOf = (t: Harness, teamId: string) => {
  const m = matchOf(t, teamId)
  return m.teamA.id === teamId ? m.teamB.id : m.teamA.id
}

const ranking = (t: Harness) => poolView(t.state).standings.map((s) => s.team.id)

describe('tirage de la partie 1', () => {
  it('fait jouer chaque équipe pointée une seule fois, sur des planches de 1 à N/2', () => {
    const t = checkedIn(48).apply(draw)
    const [round] = poolView(t.state).rounds
    expect(round.round).toBe(1)
    expect(round.matches).toHaveLength(24)
    const teams = round.matches.flatMap((m) => [m.teamA.id, m.teamB.id])
    expect(new Set(teams).size).toBe(48)
    expect(round.matches.map((m) => m.board)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1))
    expect(round.matches.every((m) => m.status === 'playing')).toBe(true)
    expect(round.bye).toBeNull()
  })

  it('est reproductible avec la même graine, et différent avec une autre', () => {
    const pairs = (seed: number) => matches(checkedIn(16, {}, seed).apply(draw)).map((m) => [m.board, m.teamA.id, m.teamB.id])
    expect(pairs(7)).toEqual(pairs(7))
    expect(pairs(7)).not.toEqual(pairs(8))
  })

  it('tire les planches au hasard parmi toutes les planches quand il y en a plus que de matchs', () => {
    const t = checkedIn(8, { boards: 24 }).apply(draw)
    const boards = matches(t).map((m) => m.board!)
    expect(new Set(boards).size).toBe(4)
    expect(boards.every((b) => b >= 1 && b <= 24)).toBe(true)
    expect(boards).not.toEqual([1, 2, 3, 4])
  })

  it('ne tire que les équipes inscrites et pointées', () => {
    const t = run([
      createEdition({ maxTeams: 4 }),
      ...['A', 'B', 'C', 'D', 'E'].map((l) => register(`${l}1`, `${l}2`)),
      ...['t1', 't2', 't3'].map((teamId): Command => ({ type: 'checkInTeam', teamId })),
    ])
    t.apply(draw)
    const [round] = poolView(t.state).rounds
    const drawn = [...round.matches.flatMap((m) => [m.teamA.id, m.teamB.id]), round.bye!.team.id].sort()
    expect(drawn).toEqual(['t1', 't2', 't3'])
  })

  it('avec un nombre impair, une équipe est exempte et gagne au score d’exempt réglé', () => {
    const t = checkedIn(5, { byeScore: { winner: 13, loser: 5 } }).apply(draw)
    const [round] = poolView(t.state).rounds
    expect(round.matches).toHaveLength(2)
    const bye = round.bye!
    expect(bye.score).toEqual({ a: 13, b: 5 })
    const row = poolView(t.state).standings.find((s) => s.team.id === bye.team.id)!
    expect(row).toMatchObject({ rank: 1, played: 1, wins: 1, losses: 0, pointsFor: 13, pointsAgainst: 5, diff: 8 })
    expect(nextMatchOf(t.state, bye.team.id)).toEqual({ kind: 'bye', round: 1, score: { a: 13, b: 5 } })
  })

  it.each([
    [{ type: 'drawPoolRound', round: 2 } as Command, 'Lancez d’abord la partie 1.'],
  ])('refuse %j avant la partie 1', (command, reason) => {
    expect(checkedIn(4).refusal(command)).toBe(reason)
  })

  it('refuse de lancer deux fois la partie 1 (deux PC, double clic)', () => {
    const t = checkedIn(4).apply(draw)
    expect(t.refusal(draw)).toBe('La partie 1 est déjà lancée.')
  })

  it('refuse sans au moins deux équipes pointées', () => {
    expect(checkedIn(1).refusal(draw)).toBe('Il faut au moins 2 équipes pointées pour lancer la partie 1 (1 pointée).')
    expect(checkedIn(0).refusal(draw)).toBe('Il faut au moins 2 équipes pointées pour lancer la partie 1 (0 pointée).')
  })

  it('fait passer l’édition en cours', () => {
    const t = checkedIn(4)
    expect(phaseOf(t.state)).toBe('before')
    t.apply(draw)
    expect(phaseOf(t.state)).toBe('during')
  })
})

describe('saisie des scores', () => {
  it('enregistre le score d’un match et le marque joué', () => {
    const t = checkedIn(4).apply(draw)
    t.apply(score(t, 't1', 13, 8))
    const match = matchOf(t, 't1')
    expect(match.status).toBe('done')
    expect(match.teamA.id === 't1' ? match.score : { a: match.score!.b, b: match.score!.a }).toEqual({ a: 13, b: 8 })
  })

  it('accepte une victoire à moins de 13 (temps écoulé)', () => {
    const t = checkedIn(4).apply(draw)
    expect(t.refusal(score(t, 't1', 9, 7))).toBeNull()
  })

  it.each([
    [7, 7, 'Égalité impossible (7-7) : il faut un vainqueur.'],
    [14, 3, 'Un score ne peut pas dépasser 13.'],
    [13, -1, 'Un score ne peut pas être négatif.'],
    [12.5, 3, 'Les deux scores doivent être des nombres entiers.'],
    ['13', 3, 'Les deux scores doivent être des nombres entiers.'],
    [null, 3, 'Les deux scores doivent être des nombres entiers.'],
  ])('refuse %j-%j', (a, b, reason) => {
    const t = checkedIn(4).apply(draw)
    const matchId = matches(t)[0].id
    expect(t.refusal({ type: 'enterPoolScore', matchId, scoreA: a as number, scoreB: b as number })).toBe(reason)
  })

  it('refuse un match inconnu', () => {
    const t = checkedIn(4).apply(draw)
    expect(t.refusal({ type: 'enterPoolScore', matchId: 'r9m9', scoreA: 13, scoreB: 0 })).toBe("Ce match n'existe pas.")
  })

  it('corriger = ressaisir : le dernier score gagne et le classement suit', () => {
    const t = checkedIn(4).apply(draw)
    t.apply(score(t, 't1', 13, 8))
    expect(ranking(t)[0]).toBe('t1')
    t.apply(score(t, 't1', 8, 13))
    const row = poolView(t.state).standings.find((s) => s.team.id === 't1')!
    expect(row).toMatchObject({ played: 1, wins: 0, losses: 1, pointsFor: 8, pointsAgainst: 13 })
  })

  it('liste les matchs en attente de score', () => {
    const t = checkedIn(8).apply(draw)
    const [round] = poolView(t.state).rounds
    expect(round.awaitingScore).toHaveLength(4)
    t.apply(score(t, 't1', 13, 2))
    const after = poolView(t.state).rounds[0]
    expect(after.awaitingScore).toHaveLength(3)
    expect(after.awaitingScore).not.toContain(matchOf(t, 't1').id)
    expect(after.complete).toBe(false)
    for (const id of ['t2', 't3', 't4', 't5', 't6', 't7', 't8']) if (!matchOf(t, id).score) t.apply(score(t, id, 13, 0))
    expect(poolView(t.state).rounds[0]).toMatchObject({ awaitingScore: [], complete: true })
  })
})

describe('planches : file d’attente quand il y a plus de matchs que de planches', () => {
  it('met les matchs en trop en attente, puis leur donne la planche libérée par une saisie', () => {
    const t = checkedIn(8, { boards: 2 }).apply(draw)
    let [round] = poolView(t.state).rounds
    const [p1, p2, w1, w2] = round.matches
    expect([p1.status, p2.status, w1.status, w2.status]).toEqual(['playing', 'playing', 'waiting-board', 'waiting-board'])
    expect([p1.board, p2.board].sort()).toEqual([1, 2])
    expect(round.awaitingBoard).toEqual([w1.id, w2.id])

    t.apply({ type: 'enterPoolScore', matchId: p2.id, scoreA: 13, scoreB: 4 })
    round = poolView(t.state).rounds[0]
    const byId = (id: string) => round.matches.find((m) => m.id === id)!
    expect(byId(w1.id)).toMatchObject({ board: p2.board, status: 'playing' })
    expect(byId(p2.id)).toMatchObject({ board: p2.board, status: 'done' })
    expect(round.awaitingBoard).toEqual([w2.id])
    expect(round.matches.filter((m) => m.board === p2.board).map((m) => m.id)).toEqual([w1.id, p2.id])

    // Une correction ne libère pas une deuxième fois la planche.
    t.apply({ type: 'enterPoolScore', matchId: p2.id, scoreA: 13, scoreB: 5 })
    expect(poolView(t.state).rounds[0].awaitingBoard).toEqual([w2.id])
  })

  it('un match joué sans planche sort de la file', () => {
    const t = checkedIn(6, { boards: 1 }).apply(draw)
    const [, w1, w2] = poolView(t.state).rounds[0].matches
    t.apply({ type: 'enterPoolScore', matchId: w1.id, scoreA: 13, scoreB: 4 })
    const round = poolView(t.state).rounds[0]
    expect(round.awaitingBoard).toEqual([w2.id])
    expect(round.matches.find((m) => m.id === w1.id)).toMatchObject({ board: null, status: 'done' })
  })
})

describe('classement des poules', () => {
  it('classe d’abord aux victoires, même avec moins de points', () => {
    const t = checkedIn(4).apply(draw)
    const other = ['t2', 't3', 't4'].find((id) => id !== opponentOf(t, 't1'))!
    t.apply(score(t, 't1', 12, 13)).apply(score(t, other, 5, 3))
    const view = poolView(t.state).standings
    expect(view.findIndex((s) => s.team.id === other)).toBeLessThan(view.findIndex((s) => s.team.id === 't1'))
  })

  it('à victoires égales, aux points pour, même avec une moins bonne différence', () => {
    const t = checkedIn(4).apply(draw)
    const other = ['t2', 't3', 't4'].find((id) => id !== opponentOf(t, 't1'))!
    t.apply(score(t, 't1', 13, 12)).apply(score(t, other, 12, 0))
    expect(ranking(t).slice(0, 2)).toEqual(['t1', other])
  })

  it('à victoires et points pour égaux, à la différence (donc aux points contre)', () => {
    const t = checkedIn(4).apply(draw)
    const other = ['t2', 't3', 't4'].find((id) => id !== opponentOf(t, 't1'))!
    t.apply(score(t, 't1', 13, 10)).apply(score(t, other, 13, 4))
    const [first, second] = poolView(t.state).standings
    expect([first.team.id, second.team.id]).toEqual([other, 't1'])
    expect([first.diff, second.diff]).toEqual([9, 3])
    expect([first.pointsAgainst, second.pointsAgainst]).toEqual([4, 10])
  })

  it('les perdants aussi : à points pour égaux, le moins de points contre devant', () => {
    const t = checkedIn(4).apply(draw)
    const other = ['t2', 't3', 't4'].find((id) => id !== opponentOf(t, 't1'))!
    t.apply(score(t, 't1', 6, 13)).apply(score(t, other, 6, 9))
    expect(ranking(t).slice(2)).toEqual([other, 't1'])
  })

  it('à égalité parfaite, dans l’ordre d’inscription', () => {
    const t = checkedIn(8).apply(draw)
    for (const id of ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8']) if (!matchOf(t, id).score) t.apply(score(t, id, 13, 7))
    const winners = poolView(t.state).standings.slice(0, 4).map((s) => s.team.id)
    expect(winners).toEqual([...winners].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))))
  })

  it('avant toute saisie, liste les équipes tirées dans l’ordre d’inscription, à zéro', () => {
    const t = checkedIn(4).apply(draw)
    expect(poolView(t.state).standings).toEqual(
      ['t1', 't2', 't3', 't4'].map((id, i) => ({
        rank: i + 1,
        team: { id, name: `J${i + 1}a & J${i + 1}b` },
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        diff: 0,
        forfeit: false,
      })),
    )
  })
})

describe('renommer une équipe pendant la partie', () => {
  it('ne change aucun résultat, seulement le nom affiché', () => {
    const t = checkedIn(4).apply(draw)
    t.apply(score(t, 't1', 13, 9))
    const before = poolView(t.state)
    t.apply({ type: 'updateTeam', teamId: 't1', changes: { name: 'Les Rapides' } })
    const after = poolView(t.state)
    const rename = (name: string) => (name === 'J1a & J1b' ? 'Les Rapides' : name)
    expect(after).toEqual(JSON.parse(JSON.stringify(before), (key, value) => (key === 'name' ? rename(value) : value)))
    expect(matchOf(t, 't1').teamA.name === 'Les Rapides' || matchOf(t, 't1').teamB.name === 'Les Rapides').toBe(true)
  })
})

describe('prochain match d’une équipe', () => {
  it('donne la planche et l’adversaire, puis plus rien une fois le score saisi', () => {
    const t = checkedIn(4).apply(draw)
    const match = matchOf(t, 't1')
    const opponent = match.teamA.id === 't1' ? match.teamB : match.teamA
    expect(nextMatchOf(t.state, 't1')).toEqual({ kind: 'match', round: 1, matchId: match.id, board: match.board, opponent })
    t.apply(score(t, 't1', 13, 1))
    expect(nextMatchOf(t.state, 't1')).toBeNull()
  })

  it('sans planche si le match attend une planche ; rien avant la partie 1', () => {
    const t = checkedIn(6, { boards: 1 })
    expect(nextMatchOf(t.state, 't1')).toBeNull()
    t.apply(draw)
    const waiting = poolView(t.state).rounds[0].matches[2]
    expect(nextMatchOf(t.state, waiting.teamA.id)).toMatchObject({ kind: 'match', board: null, opponent: waiting.teamB })
  })
})

describe('après le lancement de la partie 1', () => {
  it.each([
    [register('Z1', 'Z2'), 'Le tournoi a commencé : les inscriptions sont closes.'],
    [{ type: 'undoCheckIn', teamId: 't1' } as Command, 'Le tournoi a commencé : le pointage est clos.'],
    [{ type: 'checkInTeam', teamId: 't5' } as Command, 'Le tournoi a commencé : le pointage est clos.'],
    [{ type: 'replaceAbsentTeam', teamId: 't5' } as Command, 'Le tournoi a commencé : le pointage est clos.'],
    [{ type: 'withdrawTeam', teamId: 't1' } as Command, 'Cette équipe a déjà été tirée en poule : on ne la désinscrit plus, déclarez-la forfait.'],
  ])('refuse %j', (command, reason) => {
    const t = run([createEdition({ maxTeams: 5 }), ...['A', 'B', 'C', 'D', 'E', 'F'].map((l) => register(`${l}1`, `${l}2`))])
    for (const teamId of ['t1', 't2', 't3', 't4']) t.apply({ type: 'checkInTeam', teamId })
    t.apply(draw)
    expect(t.refusal(command)).toBe(reason)
  })

  it('laisse désinscrire une équipe absente qui n’a pas été tirée, et renommer', () => {
    const t = run([createEdition(), ...['A', 'B', 'C'].map((l) => register(`${l}1`, `${l}2`))])
    t.apply({ type: 'checkInTeam', teamId: 't1' }).apply({ type: 'checkInTeam', teamId: 't2' }).apply(draw)
    t.apply({ type: 'withdrawTeam', teamId: 't3' })
    t.apply({ type: 'updateTeam', teamId: 't1', changes: { name: 'Nouveau nom' } })
  })
})

describe('vues publique et console', () => {
  it('exposent les poules avec les noms d’équipe seulement', () => {
    const t = run([createEdition(), register('A1', 'A2'), register('B1', 'B2')])
    t.apply({ type: 'updateTeam', teamId: 't1', changes: { phone: '0611223344', comment: 'secret', player1Licensed: true } })
    t.apply({ type: 'checkInTeam', teamId: 't1' }).apply({ type: 'checkInTeam', teamId: 't2' }).apply(draw)
    t.apply(score(t, 't1', 13, 11))
    const pub = publicView(t.state)
    expect(pub.pool).toEqual(adminView(t.state).pool)
    expect(pub.pool.rounds[0].matches[0].score).not.toBeNull()
    const json = JSON.stringify(pub)
    for (const secret of ['0611223344', 'secret', 'Licensed', 'checkedIn', adminView(t.state).previewToken]) expect(json).not.toContain(secret)
  })
})

describe('journal et rejouage des poules', () => {
  it('décrit le lancement, la saisie et la correction', () => {
    const t = checkedIn(5, { boards: 1 }).apply(draw)
    const first = matches(t)[0]
    t.apply({ type: 'enterPoolScore', matchId: first.id, scoreA: 13, scoreB: 6 })
    t.apply({ type: 'enterPoolScore', matchId: first.id, scoreA: 13, scoreB: 9 })
    const states = [initialState(), ...t.events.map((_, i) => replay(t.events.slice(0, i + 1)))]
    const lines = t.events.map((e, i) => describeEvent(states[i], states[i + 1], e)).slice(-3)
    const bye = poolView(t.state).rounds[0].bye!.team.name
    const line = (a: number, b: number) => `« ${first.teamA.name} » ${a}-${b} « ${first.teamB.name} »`
    expect(lines).toEqual([
      { label: `Partie 1 lancée : 2 matchs ; « ${bye} » exempte ; 1 en attente de planche` },
      { label: `Score saisi (partie 1, planche 1) : ${line(13, 6)}` },
      { label: 'Score corrigé (partie 1, planche 1)', before: line(13, 6), after: line(13, 9) },
    ])
    expect(replay(t.events)).toEqual(t.state)
  })

  it('ressaisir le même score ne produit aucun événement', () => {
    const t = checkedIn(2).apply(draw)
    const id = matches(t)[0].id
    t.apply({ type: 'enterPoolScore', matchId: id, scoreA: 13, scoreB: 6 })
    const count = t.events.length
    t.apply({ type: 'enterPoolScore', matchId: id, scoreA: 13, scoreB: 6 })
    expect(t.events).toHaveLength(count)
  })
})
