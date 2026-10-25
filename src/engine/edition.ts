import { capProblem } from './checkin.ts'
import { randomToken } from './rng.ts'
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  pickSettings,
  sameSetting,
  settingsProblem,
  type EditionSettings,
} from './settings.ts'
import type { EditionState } from './state.ts'
import { accept, refuse, type Ctx, type Decision } from './types.ts'

// --- Commandes -------------------------------------------------------------

export interface CreateEdition {
  type: 'createEdition'
  /** Attribué par le serveur. */
  editionId: string
  /** `name` et `date` obligatoires, le reste prend les valeurs par défaut. */
  settings: Partial<EditionSettings>
}

export interface UpdateEdition {
  type: 'updateEdition'
  /** Seuls les réglages présents sont modifiés. */
  changes: Partial<EditionSettings>
}

export type EditionCommand = CreateEdition | UpdateEdition

// --- Événements ------------------------------------------------------------

export interface EditionCreated {
  type: 'editionCreated'
  at: number
  editionId: string
  settings: EditionSettings
  previewToken: string
}

export interface EditionUpdated {
  type: 'editionUpdated'
  at: number
  /** Uniquement les réglages qui changent vraiment. */
  changes: Partial<EditionSettings>
}

export type EditionEvent = EditionCreated | EditionUpdated

// --- decide / evolve -------------------------------------------------------

export function decideEdition(state: EditionState, command: EditionCommand, ctx: Ctx): Decision<EditionEvent> {
  switch (command.type) {
    case 'createEdition': {
      if (state.edition) return refuse('Cette édition existe déjà.')
      const settings: EditionSettings = {
        ...DEFAULT_SETTINGS,
        name: '',
        date: '',
        ...pickSettings(command.settings ?? {}),
      }
      settings.name = typeof settings.name === 'string' ? settings.name.trim() : settings.name
      const problem = settingsProblem(settings)
      if (problem) return refuse(problem)
      return accept({
        type: 'editionCreated',
        at: ctx.now,
        editionId: command.editionId,
        settings,
        previewToken: randomToken(ctx.rng),
      })
    }
    case 'updateEdition': {
      const edition = state.edition!
      const requested = pickSettings(command.changes ?? {})
      if (typeof requested.name === 'string') requested.name = requested.name.trim()
      const next = { ...edition.settings, ...requested }
      const problem = settingsProblem(next) ?? capProblem(state, next.maxTeams)
      if (problem) return refuse(problem)
      const changes: Record<string, unknown> = {}
      for (const key of SETTING_KEYS) {
        if (!sameSetting(key, edition.settings[key], next[key])) changes[key] = next[key]
      }
      if (Object.keys(changes).length === 0) return accept()
      return accept({ type: 'editionUpdated', at: ctx.now, changes: changes as Partial<EditionSettings> })
    }
  }
}

export function evolveEdition(state: EditionState, event: EditionEvent): EditionState {
  switch (event.type) {
    case 'editionCreated':
      return {
        ...state,
        // Les réglages ajoutés depuis la création d'une édition prennent leur valeur par défaut au rejeu.
        edition: { id: event.editionId, settings: { ...DEFAULT_SETTINGS, ...event.settings }, previewToken: event.previewToken, createdAt: event.at },
      }
    case 'editionUpdated': {
      const edition = state.edition!
      return { ...state, edition: { ...edition, settings: { ...edition.settings, ...event.changes } } }
    }
  }
}
