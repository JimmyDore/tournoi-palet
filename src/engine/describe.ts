import { bracketsView } from './brackets.ts'
import type { Event } from './engine.ts'
import { poolView } from './pool.ts'
import { SETTING_KEYS, SETTING_LABELS, formatSetting, type EditionSettings } from './settings.ts'
import type { EditionState } from './state.ts'
import { tvViewLabel } from './tv.ts'
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
    case 'teamCheckedIn': {
      const price = before.edition ? formatSetting('price', before.edition.settings.price) : '?'
      return { label: `Équipe « ${nameIn(before, event.teamId)} » pointée (présente, ${price} payés)` }
    }
    case 'teamCheckInUndone':
      return { label: `Pointage de « ${nameIn(before, event.teamId)} » annulé` }
    case 'absentTeamReplaced':
      return {
        label: `Équipe « ${nameIn(before, event.teamId)} » absente, remplacée par « ${nameIn(before, event.replacementId)} » (tête de la liste d’attente)`,
      }
    case 'poolRoundDrawn': {
      const round = poolView(after).rounds.find((r) => r.round === event.round)
      const count = event.matches.length
      const parts = [`Partie ${event.round} lancée : ${count} match${count > 1 ? 's' : ''}`]
      if (event.bye) parts.push(`« ${nameIn(after, event.bye)} » exempte`)
      const waiting = round?.awaitingBoard.length ?? 0
      if (waiting) parts.push(`${waiting} en attente de planche`)
      return { label: parts.join(' ; ') }
    }
    case 'poolScoreEntered': {
      const match = poolView(after)
        .rounds.flatMap((r) => r.matches)
        .find((m) => m.id === event.matchId)
      if (!match) return { label: `Score saisi (${event.matchId}) : ${event.scoreA}-${event.scoreB}` }
      const where = `partie ${match.round}${match.board ? `, planche ${match.board}` : ''}`
      const line = (a: number, b: number) => `« ${match.teamA.name} » ${a}-${b} « ${match.teamB.name} »`
      const previous = poolView(before)
        .rounds.flatMap((r) => r.matches)
        .find((m) => m.id === event.matchId)
      if (!previous?.score) return { label: `Score saisi (${where}) : ${line(event.scoreA, event.scoreB)}` }
      const was = line(previous.score.a, previous.score.b) + (previous.forfeit ? ' (forfait)' : '')
      return { label: `Score corrigé (${where})`, before: was, after: line(event.scoreA, event.scoreB) }
    }
    case 'poolRoundRemoved': {
      const round = poolView(before).rounds.find((r) => r.round === event.round)
      if (!round) return { label: `Partie ${event.round} retirée` }
      const entered = round.matches.filter((m) => m.score && !m.forfeit).length
      const scores = entered === 0 ? 'aucun score saisi' : `${entered} score${entered > 1 ? 's' : ''} saisi${entered > 1 ? 's' : ''}`
      return {
        label: `Partie ${event.round} retirée : tirage et scores effacés`,
        before: `${round.matches.length} match${round.matches.length > 1 ? 's' : ''}, ${scores}${round.bye ? `, « ${round.bye.team.name} » exempte` : ''}`,
        after: 'partie à relancer',
      }
    }
    case 'forfeitDeclared': {
      const name = nameIn(before, event.teamId)
      const won = poolView(after)
        .rounds.flatMap((r) => r.matches)
        .filter((m) => m.forfeit === event.teamId && !before.pool.finishOrder.includes(m.id))
        .map((m) => `« ${m.teamA.id === event.teamId ? m.teamB.name : m.teamA.name} »`)
      const parts = [`Équipe « ${name} » déclarée forfait`]
      if (won.length) parts.push(`${won.join(', ')} ${won.length > 1 ? 'gagnent' : 'gagne'} 13-0`)
      parts.push('elle ne sera plus tirée')
      return { label: parts.join(' ; ') }
    }
    case 'forfeitCancelled':
      return { label: `Forfait de « ${nameIn(before, event.teamId)} » annulé` }
    case 'splitValidated': {
      const split = bracketsView(after).split
      const label = `Répartition validée : ${event.principalCount} équipes en Principal, ${split.participants - event.principalCount} en Consolante`
      const previous = before.brackets.principalCount
      return previous === null ? { label } : { label, before: `${previous} en Principal`, after: `${event.principalCount} en Principal` }
    }
    case 'bracketsGenerated': {
      const { brackets, live } = bracketsView(after)
      const parts = brackets.map((b) => `${b.name} de ${b.teams}${b.byes ? ` (${b.byes} exempt${b.byes > 1 ? 's' : ''})` : ''}`)
      const method = after.edition?.settings.bracketFirstRound === 'random' ? 'tirage au sort' : 'têtes de série'
      const waiting = live.filter((m) => m.status === 'waiting-board').length
      return { label: `Tableaux générés (${method}) : ${parts.join(', ')}${waiting ? ` ; ${waiting} en attente de planche` : ''}` }
    }
    case 'bracketScoreEntered': {
      const find = (state: EditionState) =>
        bracketsView(state)
          .brackets.flatMap((b) => b.rounds.flatMap((r) => r.matches))
          .find((m) => m.id === event.matchId)
      const match = find(after)
      const where = match ? `${match.bracketName}, ${match.roundName}${match.board ? `, planche ${match.board}` : ''}` : event.matchId
      const line = (a: number, b: number) => `« ${nameIn(after, event.teamA)} » ${a}-${b} « ${nameIn(after, event.teamB)} »`
      const previous = find(before)?.score
      if (!previous) return { label: `Score saisi (${where}) : ${line(event.scoreA, event.scoreB)}` }
      return { label: `Score corrigé (${where})`, before: line(previous.a, previous.b), after: line(event.scoreA, event.scoreB) }
    }
    case 'tvViewSet':
      return { label: event.view === 'auto' ? 'Télé en rotation automatique' : `Télé bloquée sur « ${tvViewLabel(event.view)} »` }
  }
}

function nameIn(state: EditionState, teamId: string): string {
  const team = state.teams.find((t) => t.id === teamId)
  return team ? teamName(team) : teamId
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
