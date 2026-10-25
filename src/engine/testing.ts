import { bracketsView, type BracketKey, type BracketMatchView } from './brackets.ts'
import { decide, evolve, type Command, type Event } from './engine.ts'
import { poolView } from './pool.ts'
import { seededRng } from './rng.ts'
import { initialState, type EditionState } from './state.ts'
import type { EditionSettings } from './settings.ts'
import type { Ctx } from './types.ts'

/** Graine et heure de départ par défaut des tests. */
export const TEST_SEED = 42
export const TEST_NOW = Date.UTC(2026, 11, 19, 13, 0)

export interface Harness {
  state: EditionState
  events: Event[]
  ctx: Ctx
  /** Applique une commande de plus ; lève si elle est refusée. */
  apply(command: Command): Harness
  /** Tente une commande sans modifier l'état ; renvoie la raison du refus, ou `null`. */
  refusal(command: Command): string | null
}

/**
 * Helper de test : applique les commandes dans l'ordre et lève dès qu'une
 * est refusée. Le temps avance d'une minute par commande.
 *
 *   const t = run([{ type: 'createEdition', editionId: 'e1', settings: { name: 'X', date: '2026-12-19' } }])
 *   expect(publicView(t.state).name).toBe('X')
 */
export function run(commands: Command[], { seed = TEST_SEED, now = TEST_NOW, from = initialState() } = {}): Harness {
  const harness: Harness = {
    state: from,
    events: [],
    ctx: { rng: seededRng(seed), now },
    apply(command) {
      const decision = decide(harness.state, command, harness.ctx)
      if (!decision.ok) throw new Error(`Commande ${command.type} refusée : ${decision.reason}`)
      harness.events.push(...decision.events)
      harness.state = decision.events.reduce(evolve, harness.state)
      harness.ctx = { ...harness.ctx, now: harness.ctx.now + 60_000 }
      return harness
    },
    refusal(command) {
      const decision = decide(harness.state, command, harness.ctx)
      return decision.ok ? null : decision.reason
    },
  }
  for (const command of commands) harness.apply(command)
  return harness
}

/** Commande de création prête à l'emploi pour les tests. */
export function createEdition(settings: Partial<EditionSettings> = {}, editionId = 'e1'): Command {
  return { type: 'createEdition', editionId, settings: { name: 'Concours de test', date: '2026-12-19', ...settings } }
}

/** `count` équipes pointées, les 4 parties de poule jouées (l'équipe A gagne, scores variés). */
export function poolsDone(count: number, settings: Partial<EditionSettings> = {}, seed = TEST_SEED): Harness {
  const ids = Array.from({ length: count }, (_, i) => i + 1)
  const t = run(
    [
      createEdition({ maxTeams: Math.max(48, count), ...settings }),
      ...ids.map((i): Command => ({ type: 'registerTeam', team: { player1: `J${i}a`, player2: `J${i}b` } })),
      ...ids.map((i): Command => ({ type: 'checkInTeam', teamId: `t${i}` })),
    ],
    { seed },
  )
  let k = 0
  for (let round = 1; round <= 4; round++) {
    t.apply({ type: 'drawPoolRound', round })
    for (const m of poolView(t.state).rounds.at(-1)!.matches) {
      k++
      t.apply({ type: 'enterPoolScore', matchId: m.id, scoreA: 13, scoreB: k % 13 })
    }
  }
  return t
}

/**
 * `count` équipes pointées, les 4 parties de poule jouées, les équipes
 * `forfeits` déclarées forfait ensuite, puis les tableaux générés avec la
 * répartition proposée.
 */
export function bracketsReady(count: number, settings: Partial<EditionSettings> = {}, forfeits: string[] = []): Harness {
  const t = poolsDone(count, settings)
  for (const teamId of forfeits) t.apply({ type: 'declareForfeit', teamId })
  t.apply({ type: 'validateSplit', principalCount: bracketsView(t.state).split.proposedPrincipal })
  return t.apply({ type: 'generateBrackets' })
}

/** Un tableau de la vue des tableaux. */
export const bracket = (t: Harness, key: BracketKey) => bracketsView(t.state).brackets.find((b) => b.key === key)!
/** Les matchs du tour `n` (1 = premier tour) d'un tableau. */
export const round = (t: Harness, key: BracketKey, n: number): BracketMatchView[] => bracket(t, key).rounds[n - 1].matches
/** Tous les matchs de tous les tableaux. */
export const allBracketMatches = (t: Harness): BracketMatchView[] => bracketsView(t.state).brackets.flatMap((b) => b.rounds.flatMap((r) => r.matches))
