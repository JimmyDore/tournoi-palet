import type { Event } from './engine.ts'
import { SETTING_KEYS, SETTING_LABELS, formatSetting, type EditionSettings } from './settings.ts'
import type { EditionState } from './state.ts'

/** Une ligne du journal : ce qui a été fait, et les valeurs avant / après. */
export interface EventDescription {
  label: string
  before?: string
  after?: string
}

export function describeEvent(before: EditionState, _after: EditionState, event: Event): EventDescription {
  switch (event.type) {
    case 'editionCreated':
      return { label: `Édition « ${event.settings.name} » créée` }
    case 'editionUpdated': {
      const previous = before.edition?.settings
      const keys = SETTING_KEYS.filter((k) => k in event.changes)
      const show = (s: Partial<EditionSettings> | undefined) =>
        keys.map((k) => `${SETTING_LABELS[k]} : ${s && s[k] !== undefined ? formatSetting(k, s[k]!) : '?'}`).join(' ; ')
      return { label: 'Réglages modifiés', before: show(previous), after: show(event.changes) }
    }
  }
}
