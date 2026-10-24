import type { EditionState, Team } from './state.ts'
import { accept, refuse, type Ctx, type Decision } from './types.ts'

// --- Fiche équipe ----------------------------------------------------------

/** Ce que l'organisateur saisit pour une équipe. */
export interface TeamFields {
  /** Vide : nom par défaut « Joueur1 & Joueur2 ». */
  name: string
  player1: string
  player2: string
  player1Licensed: boolean
  player2Licensed: boolean
  /** Facultatif, jamais public. */
  phone: string
  /** Jamais public. */
  comment: string
}

export const TEAM_FIELD_KEYS = ['name', 'player1', 'player2', 'player1Licensed', 'player2Licensed', 'phone', 'comment'] as const

export const TEAM_FIELD_LABELS: Record<keyof TeamFields, string> = {
  name: 'Nom',
  player1: 'Joueur 1',
  player2: 'Joueur 2',
  player1Licensed: 'Joueur 1 licencié',
  player2Licensed: 'Joueur 2 licencié',
  phone: 'Téléphone',
  comment: 'Commentaire',
}

const EMPTY_FIELDS: TeamFields = {
  name: '',
  player1: '',
  player2: '',
  player1Licensed: false,
  player2Licensed: false,
  phone: '',
  comment: '',
}

/** Nom affiché : le nom saisi, sinon « Joueur1 & Joueur2 ». */
export function teamName(team: Pick<TeamFields, 'name' | 'player1' | 'player2'>): string {
  return team.name || `${team.player1} & ${team.player2}`
}

export const TWO_LICENSED_WARNING = 'Les deux joueurs sont licenciés : la règle est d’un licencié maximum par doublette.'

/** Alertes non bloquantes d'une fiche. */
export function teamWarnings(team: Pick<TeamFields, 'player1Licensed' | 'player2Licensed'>): string[] {
  return team.player1Licensed && team.player2Licensed ? [TWO_LICENSED_WARNING] : []
}

/** Ne garde que les champs connus, au bon type, texte nettoyé. */
function pickFields(input: unknown): Partial<TeamFields> {
  const out: Record<string, unknown> = {}
  if (!input || typeof input !== 'object') return out
  const source = input as Record<string, unknown>
  for (const key of TEAM_FIELD_KEYS) {
    if (!(key in source)) continue
    const value = source[key]
    if (key === 'player1Licensed' || key === 'player2Licensed') out[key] = value === true
    else if (typeof value === 'string') out[key] = value.trim().replace(/\s+/g, ' ')
    else if (value === null || value === undefined) out[key] = ''
  }
  return out as Partial<TeamFields>
}

function fieldsOf(team: Team): TeamFields {
  const { name, player1, player2, player1Licensed, player2Licensed, phone, comment } = team
  return { name, player1, player2, player1Licensed, player2Licensed, phone, comment }
}

const sameName = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' }) === 0

function fieldsProblem(state: EditionState, fields: TeamFields, teamId?: string): string | null {
  if (!fields.player1) return 'Le nom du joueur 1 est obligatoire.'
  if (!fields.player2) return 'Le nom du joueur 2 est obligatoire.'
  const name = teamName(fields)
  if (name.length > 60) return "Le nom d'équipe ne doit pas dépasser 60 caractères."
  const twin = state.teams.find((t) => t.id !== teamId && sameName(teamName(t), name))
  if (twin) return `Une équipe s'appelle déjà « ${teamName(twin)} ».`
  return null
}

// --- Commandes -------------------------------------------------------------

export interface RegisterTeam {
  type: 'registerTeam'
  team: Partial<TeamFields>
}

/** Modifier ou renommer : seuls les champs présents changent. */
export interface UpdateTeam {
  type: 'updateTeam'
  teamId: string
  changes: Partial<TeamFields>
}

export interface WithdrawTeam {
  type: 'withdrawTeam'
  teamId: string
}

export type TeamCommand = RegisterTeam | UpdateTeam | WithdrawTeam

// --- Événements ------------------------------------------------------------

export interface TeamRegistered {
  type: 'teamRegistered'
  at: number
  teamId: string
  team: TeamFields
}

export interface TeamUpdated {
  type: 'teamUpdated'
  at: number
  teamId: string
  /** Uniquement les champs qui changent vraiment. */
  changes: Partial<TeamFields>
}

export interface TeamWithdrawn {
  type: 'teamWithdrawn'
  at: number
  teamId: string
}

export type TeamEvent = TeamRegistered | TeamUpdated | TeamWithdrawn

// --- decide / evolve -------------------------------------------------------

export function decideTeams(state: EditionState, command: TeamCommand, ctx: Ctx): Decision<TeamEvent> {
  switch (command.type) {
    case 'registerTeam': {
      const team = { ...EMPTY_FIELDS, ...pickFields(command.team) }
      const problem = fieldsProblem(state, team)
      if (problem) return refuse(problem)
      return accept({ type: 'teamRegistered', at: ctx.now, teamId: `t${state.nextTeamNumber}`, team })
    }
    case 'updateTeam': {
      const current = state.teams.find((t) => t.id === command.teamId)
      if (!current) return refuse("Cette équipe n'est pas inscrite.")
      const before = fieldsOf(current)
      const next = { ...before, ...pickFields(command.changes) }
      const problem = fieldsProblem(state, next, current.id)
      if (problem) return refuse(problem)
      const changes: Record<string, unknown> = {}
      for (const key of TEAM_FIELD_KEYS) if (before[key] !== next[key]) changes[key] = next[key]
      if (Object.keys(changes).length === 0) return accept()
      return accept({ type: 'teamUpdated', at: ctx.now, teamId: current.id, changes: changes as Partial<TeamFields> })
    }
    case 'withdrawTeam': {
      if (!state.teams.some((t) => t.id === command.teamId)) return refuse("Cette équipe n'est pas inscrite.")
      return accept({ type: 'teamWithdrawn', at: ctx.now, teamId: command.teamId })
    }
  }
}

export function evolveTeams(state: EditionState, event: TeamEvent): EditionState {
  switch (event.type) {
    case 'teamRegistered':
      return {
        ...state,
        nextTeamNumber: state.nextTeamNumber + 1,
        teams: [...state.teams, { id: event.teamId, ...event.team, registeredAt: event.at, checkedInAt: null }],
      }
    case 'teamUpdated':
      return { ...state, teams: state.teams.map((t) => (t.id === event.teamId ? { ...t, ...event.changes } : t)) }
    case 'teamWithdrawn':
      return { ...state, teams: state.teams.filter((t) => t.id !== event.teamId) }
  }
}

// --- Inscrits et liste d'attente --------------------------------------------

export type TeamStatus = 'registered' | 'waitlist'

/**
 * Les `maxTeams` premières équipes par ordre d'inscription sont inscrites,
 * les suivantes en liste d'attente. Rien n'est stocké : une place libérée
 * (désinscription, plafond relevé) fait remonter la tête de la liste.
 */
export function teamStatuses(state: EditionState): Map<string, TeamStatus> {
  const max = state.edition?.settings.maxTeams ?? 0
  return new Map(state.teams.map((t, i) => [t.id, i < max ? 'registered' : 'waitlist']))
}
