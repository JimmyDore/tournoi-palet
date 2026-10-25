/**
 * Réglages d'une édition. Les réglages encore ouverts dans docs/grilling.md
 * (méthode du 1er tour, score d'exempt…) sont ici avec leur valeur par défaut.
 */
export interface EditionSettings {
  name: string
  /** AAAA-MM-JJ. Sert aussi à choisir l'édition « en cours » (la plus récente). */
  date: string
  /** HH:MM, ou vide. */
  arrivalTime: string
  startTime: string
  venue: string
  /** Tarif par équipe, en euros. */
  price: number
  contact: string
  /** Nombre de planches disponibles. */
  boards: number
  /** Plafond d'équipes (au-delà : liste d'attente). */
  maxTeams: number
  /** Durée indicative d'une partie, en minutes (chrono). */
  gameMinutes: number
  /** Score attribué à l'équipe exempte en poule. */
  byeScore: { winner: number; loser: number }
  /** Édition de test : jamais visible publiquement (sauf lien secret). */
  isTest: boolean
  /** Premier tour des tableaux : têtes de série ou tirage au sort. */
  bracketFirstRound: BracketFirstRound
  /**
   * Rythme des tableaux : tours synchronisés (le tour suivant part quand le
   * précédent est complet) ou au fil de l'eau (un match part dès que ses deux
   * équipes sont connues).
   */
  bracketPace: BracketPace
}

export type BracketFirstRound = 'seeded' | 'random'
export type BracketPace = 'synchronized' | 'asReady'

export const MAX_TEAMS_LIMIT = 64
export const MAX_SCORE = 13

export const DEFAULT_SETTINGS: Omit<EditionSettings, 'name' | 'date'> = {
  arrivalTime: '13:00',
  startTime: '14:00',
  venue: 'Salle Arc-en-Ciel, Chantonnay',
  price: 18,
  contact: '',
  boards: 24,
  maxTeams: 48,
  gameMinutes: 30,
  byeScore: { winner: 13, loser: 7 },
  isTest: false,
  bracketFirstRound: 'seeded',
  bracketPace: 'synchronized',
}

export const SETTING_KEYS = [
  'name',
  'date',
  'arrivalTime',
  'startTime',
  'venue',
  'price',
  'contact',
  'boards',
  'maxTeams',
  'gameMinutes',
  'byeScore',
  'isTest',
  'bracketFirstRound',
  'bracketPace',
] as const satisfies readonly (keyof EditionSettings)[]

export const SETTING_LABELS: Record<keyof EditionSettings, string> = {
  name: 'Nom',
  date: 'Date',
  arrivalTime: 'Accueil',
  startTime: 'Début',
  venue: 'Lieu',
  price: 'Tarif',
  contact: 'Contact',
  boards: 'Planches',
  maxTeams: "Plafond d'équipes",
  gameMinutes: "Durée d'une partie",
  byeScore: "Score d'exempt",
  isTest: 'Édition de test',
  bracketFirstRound: '1er tour des tableaux',
  bracketPace: 'Rythme des tableaux',
}

export function formatSetting<K extends keyof EditionSettings>(key: K, value: EditionSettings[K]): string {
  switch (key) {
    case 'price':
      return `${value} €`
    case 'gameMinutes':
      return `${value} min`
    case 'byeScore': {
      const score = value as EditionSettings['byeScore']
      return `${score.winner}-${score.loser}`
    }
    case 'isTest':
      return value ? 'oui' : 'non'
    case 'bracketFirstRound':
      return value === 'random' ? 'tirage au sort' : 'têtes de série'
    case 'bracketPace':
      return value === 'asReady' ? 'au fil de l’eau' : 'tours synchronisés'
    default:
      return String(value) || '(vide)'
  }
}

const isInteger = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function isRealDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false
  const d = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date
}

/** Première incohérence trouvée, en français, ou `null` si tout va bien. */
export function settingsProblem(s: EditionSettings): string | null {
  if (typeof s.name !== 'string' || !s.name.trim()) return "Le nom de l'édition est obligatoire."
  if (typeof s.date !== 'string' || !isRealDate(s.date)) return 'La date doit être une vraie date (AAAA-MM-JJ).'
  for (const key of ['arrivalTime', 'startTime'] as const) {
    if (typeof s[key] !== 'string' || (s[key] !== '' && !TIME_RE.test(s[key]))) {
      return `${SETTING_LABELS[key]} : l'horaire doit être au format HH:MM.`
    }
  }
  if (typeof s.venue !== 'string' || typeof s.contact !== 'string') return 'Le lieu et le contact doivent être du texte.'
  if (typeof s.price !== 'number' || !Number.isFinite(s.price) || s.price < 0) return 'Le tarif doit être un montant positif ou nul.'
  if (!isInteger(s.boards) || s.boards < 1) return 'Il faut au moins une planche.'
  if (!isInteger(s.maxTeams) || s.maxTeams < 2) return "Le plafond d'équipes doit être d'au moins 2."
  if (s.maxTeams > MAX_TEAMS_LIMIT) return `Le plafond d'équipes ne peut pas dépasser ${MAX_TEAMS_LIMIT}.`
  if (!isInteger(s.gameMinutes) || s.gameMinutes < 1 || s.gameMinutes > 180) {
    return "La durée d'une partie doit être un nombre de minutes entre 1 et 180."
  }
  const bye = s.byeScore
  if (
    !bye ||
    !isInteger(bye.winner) ||
    !isInteger(bye.loser) ||
    bye.winner < 0 ||
    bye.loser < 0 ||
    bye.winner > MAX_SCORE ||
    bye.loser > MAX_SCORE ||
    bye.winner <= bye.loser
  ) {
    return `Le score d'exempt doit être une victoire valide (de 0 à ${MAX_SCORE}, le premier score plus grand que le second).`
  }
  if (typeof s.isTest !== 'boolean') return "L'indicateur « édition de test » doit être oui ou non."
  if (s.bracketFirstRound !== 'seeded' && s.bracketFirstRound !== 'random') {
    return 'Le premier tour des tableaux se fait par têtes de série ou par tirage au sort.'
  }
  if (s.bracketPace !== 'synchronized' && s.bracketPace !== 'asReady') {
    return 'Le rythme des tableaux est « tours synchronisés » ou « au fil de l’eau ».'
  }
  return null
}

/** Ne garde que les réglages connus (un client ne peut pas glisser de champ). */
export function pickSettings(input: Partial<Record<string, unknown>>): Partial<EditionSettings> {
  const out: Record<string, unknown> = {}
  for (const key of SETTING_KEYS) if (input[key] !== undefined) out[key] = input[key]
  return out as Partial<EditionSettings>
}

export function sameSetting<K extends keyof EditionSettings>(key: K, a: EditionSettings[K], b: EditionSettings[K]): boolean {
  if (key === 'byeScore') {
    const x = a as EditionSettings['byeScore']
    const y = b as EditionSettings['byeScore']
    return x.winner === y.winner && x.loser === y.loser
  }
  return a === b
}
