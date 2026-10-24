import type { Event } from './engine.ts'
import { SETTING_KEYS, SETTING_LABELS, formatSetting, type EditionSettings } from './settings.ts'
import type { EditionState } from './state.ts'
import { TEAM_FIELD_KEYS, TEAM_FIELD_LABELS, teamName, teamStatuses, type TeamFields } from './teams.ts'

/** Une ligne du journal : ce qui a été fait, et les valeurs avant / après. */
export interface EventDescription {
  label: string
  before?: string
  after?: string
}

export function describeEvent(before: EditionState, after: EditionState, event: Event): EventDescription {
  switch (event.type) {
    case 'editionCreated':
      return { label: `Édition « ${event.settings.name} » créée` }
    case 'editionUpdated': {
      const previous = before.edition?.settings
      const keys = SETTING_KEYS.filter((k) => k in event.changes)
      const show = (s: Partial<EditionSettings> | undefined) =>
        keys.map((k) => `${SETTING_LABELS[k]} : ${s && s[k] !== undefined ? formatSetting(k, s[k]!) : '?'}`).join(' ; ')
      return { label: `Réglages modifiés${moves(before, after)}`, before: show(previous), after: show(event.changes) }
    }
    case 'teamRegistered': {
      const name = teamName(event.team)
      const status = teamStatuses(after).get(event.teamId)
      if (status === 'registered') return { label: `Équipe « ${name} » inscrite` }
      const rank = after.teams.filter((t) => teamStatuses(after).get(t.id) === 'waitlist').length
      return { label: `Équipe « ${name} » inscrite en liste d’attente (${rank === 1 ? '1re' : `${rank}e`})` }
    }
    case 'teamUpdated': {
      const team = before.teams.find((t) => t.id === event.teamId)
      const keys = TEAM_FIELD_KEYS.filter((k) => k in event.changes)
      const show = (f: Partial<TeamFields> | undefined) => keys.map((k) => `${TEAM_FIELD_LABELS[k]} : ${formatField(k, f?.[k])}`).join(' ; ')
      return { label: `Équipe « ${team ? teamName(team) : event.teamId} » modifiée`, before: show(team), after: show(event.changes) }
    }
    case 'teamWithdrawn': {
      const team = before.teams.find((t) => t.id === event.teamId)
      return { label: `Équipe « ${team ? teamName(team) : event.teamId} » désinscrite${moves(before, after)}` }
    }
  }
}

function formatField(key: keyof TeamFields, value: TeamFields[keyof TeamFields] | undefined): string {
  if (typeof value === 'boolean') return value ? 'oui' : 'non'
  if (!value) return key === 'name' ? '(par défaut)' : '(vide)'
  return value
}

/** Équipes qui changent de liste (remontée de la liste d'attente, ou retour en attente). */
function moves(before: EditionState, after: EditionState): string {
  const was = teamStatuses(before)
  const now = teamStatuses(after)
  const changed = (from: string, to: string) =>
    after.teams.filter((t) => was.get(t.id) === from && now.get(t.id) === to).map((t) => `« ${teamName(t)} »`)
  const up = changed('waitlist', 'registered')
  const down = changed('registered', 'waitlist')
  return [
    up.length && ` ; ${up.join(', ')} ${up.length > 1 ? 'remontent' : 'remonte'} de la liste d’attente`,
    down.length && ` ; ${down.join(', ')} ${down.length > 1 ? 'repassent' : 'repasse'} en liste d’attente`,
  ]
    .filter(Boolean)
    .join('')
}
