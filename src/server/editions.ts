import { randomBytes } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  decide,
  describeEvent,
  editionSummary,
  evolve,
  initialState,
  replay,
  type Command,
  type Ctx,
  type EditionSettings,
  type EditionState,
  type EditionSummary,
  type Event,
} from '../engine/index.ts'
import { appendEvents, loadEvents } from './db.ts'

export interface JournalLine {
  seq: number
  at: number
  type: string
  label: string
  before?: string
  after?: string
}

interface Edition {
  state: EditionState
  events: Event[]
}

export type Applied = { ok: true; editionId: string; state: EditionState; events: Event[] } | { ok: false; reason: string; notFound?: boolean }

/**
 * Éditions en mémoire, reconstruites au démarrage en rejouant les événements
 * de SQLite, puis tenues à jour à chaque commande acceptée. Une commande est
 * persistée (transaction) avant d'être appliquée en mémoire.
 */
export class EditionStore {
  private readonly editions = new Map<string, Edition>()
  private readonly db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.db = db
    for (const [id, events] of loadEvents(db)) this.editions.set(id, { state: replay(events), events })
  }

  get(editionId: string): EditionState | undefined {
    return this.editions.get(editionId)?.state
  }

  /** Les événements d'une édition, dans l'ordre (les faits stockés). */
  events(editionId: string): readonly Event[] | undefined {
    return this.editions.get(editionId)?.events
  }

  /** Toutes les éditions, la plus récente (par date) en tête. */
  list(): EditionSummary[] {
    return [...this.editions.values()]
      .map((e) => editionSummary(e.state))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  }

  create(settings: Partial<EditionSettings>, ctx: Ctx): Applied {
    let editionId = newEditionId()
    while (this.editions.has(editionId)) editionId = newEditionId()
    return this.commit(editionId, { state: initialState(), events: [] }, { type: 'createEdition', editionId, settings }, ctx)
  }

  apply(editionId: string, command: Command, ctx: Ctx): Applied {
    const edition = this.editions.get(editionId)
    if (!edition) return { ok: false, reason: "Cette édition n'existe pas.", notFound: true }
    if (command?.type === 'createEdition') return { ok: false, reason: 'Cette édition existe déjà.' }
    return this.commit(editionId, edition, command, ctx)
  }

  journal(editionId: string): JournalLine[] | undefined {
    const edition = this.editions.get(editionId)
    if (!edition) return undefined
    const lines: JournalLine[] = []
    let state = initialState()
    edition.events.forEach((event, seq) => {
      const next = evolve(state, event)
      lines.push({ seq, at: event.at, type: event.type, ...describeEvent(state, next, event) })
      state = next
    })
    return lines
  }

  private commit(editionId: string, edition: Edition, command: Command, ctx: Ctx): Applied {
    const decision = decide(edition.state, command, ctx)
    if (!decision.ok) return decision
    appendEvents(this.db, editionId, edition.events.length, decision.events)
    const state = decision.events.reduce(evolve, edition.state)
    this.editions.set(editionId, { state, events: [...edition.events, ...decision.events] })
    return { ok: true, editionId, state, events: decision.events }
  }
}

function newEditionId(): string {
  return randomBytes(5).toString('hex')
}
