import { BRACKET_NAMES, bracketsView, type BracketKey, type BracketMatchView, type BracketView, type BracketsView } from './brackets.ts'
import { BRACKET_ORDER, CHALLENGES } from './challenges.ts'
import { poolStandings } from './pool.ts'
import { playsIn, type TeamRef } from './types.ts'
import { prizeOf } from './prizes.ts'
import type { EditionState } from './state.ts'

// Classement final de 1 à N, vue pure des tableaux : blocs Principal,
// Challenge Principal, Consolante, Challenge Consolante, puis les forfaits de
// poule. Dans un bloc, une équipe éliminée plus tard est devant ; à tour égal,
// score de la défaite décroissant, puis classement des poules. Pendant le
// tournoi les places sont provisoires : une équipe encore en lice passe
// devant celles déjà éliminées de son bloc.

/** Bloc du classement : un tableau, ou les forfaits de poule (jamais entrés dans les tableaux). */
export type RankingBlock = BracketKey | 'forfeit'

export const RANKING_BLOCK_NAMES: Record<RankingBlock, string> = { ...BRACKET_NAMES, forfeit: 'Forfait en poule' }

export interface FinalRankingRow {
  place: number
  /** Nom seulement : la ligne est publique telle quelle. */
  team: TeamRef
  poolRank: number
  block: RankingBlock
  blockName: string
  /** Tour où l'équipe a été éliminée dans son bloc (« 1/8 », « Finale ») ; `null` : vainqueur du bloc, encore en lice, ou forfait de poule. */
  eliminatedIn: string | null
  /** Plus de match à jouer et tous les matchs du tour où elle a été éliminée sont joués. */
  definitive: boolean
  /** Lot de la place (tranches des réglages), `null` si aucune tranche ne la couvre. */
  prize: string | null
}

export interface FinalRanking {
  /** Les finales des quatre tableaux sont jouées. */
  finished: boolean
  /** Vide avant la génération des tableaux. */
  rows: FinalRankingRow[]
}

/** Parcours d'une équipe dans le tableau de son bloc. */
interface Path {
  team: TeamRef
  poolRank: number
  block: RankingBlock
  /** Plus c'est haut, plus l'équipe est allée loin : tour d'élimination, +½ si encore en lice, nombre de tours + 1 pour le vainqueur. */
  level: number
  /** Score de la défaite (−1 sans défaite). */
  losingScore: number
  eliminatedIn: string | null
  definitive: boolean
}

const playedOrBye = (m: BracketMatchView) => m.status === 'done' || m.status === 'bye'
const lost = (m: BracketMatchView, teamId: string) => m.score !== null && (m.score.a > m.score.b ? m.teamB : m.teamA)?.id === teamId

/** Parcours d'une équipe dans un tableau (`undefined` : Challenge pas encore formé). */
function pathIn(bracket: BracketView | undefined, block: RankingBlock, team: TeamRef, poolRank: number): Path {
  const base = { team: { id: team.id, name: team.name }, poolRank, block }
  if (!bracket) return { ...base, level: 0.5, losingScore: -1, eliminatedIn: null, definitive: false }
  let reached = 0
  for (const round of bracket.rounds) {
    const match = round.matches.find((m) => playsIn(m, team.id))
    if (!match) break
    reached = round.round
    if (lost(match, team.id)) {
      const score = match.score!
      return {
        ...base,
        level: round.round,
        losingScore: Math.min(score.a, score.b),
        eliminatedIn: round.name,
        definitive: round.matches.every(playedOrBye),
      }
    }
  }
  if (bracket.winner?.id === team.id) return { ...base, level: bracket.rounds.length + 1, losingScore: -1, eliminatedIn: null, definitive: true }
  return { ...base, level: reached + 0.5, losingScore: -1, eliminatedIn: null, definitive: false }
}

export function finalRanking(state: EditionState, brackets: BracketsView = bracketsView(state)): FinalRanking {
  if (!brackets.generated) return { finished: false, rows: [] }
  const byKey = new Map(brackets.brackets.map((b) => [b.key, b]))
  const blocks: Path[][] = []
  const placed = new Set<string>()

  for (const [parentKey, challengeKey] of CHALLENGES) {
    const parent = byKey.get(parentKey)!
    const challenge = byKey.get(challengeKey)
    const stays: Path[] = []
    const goes: Path[] = []
    // Toutes les équipes du parent sont au 1er tour (exemptes comprises).
    for (const match of parent.rounds[0]?.matches ?? []) {
      for (const team of [match.teamA, match.teamB]) {
        if (!team) continue
        placed.add(team.id)
        if (lost(match, team.id)) goes.push(pathIn(challenge, challengeKey, team, team.poolRank))
        else stays.push(pathIn(parent, parentKey, team, team.poolRank))
      }
    }
    blocks.push(stays, goes)
  }

  const forfeits = poolStandings(state)
    .filter((s) => !placed.has(s.team.id))
    .map((s): Path => ({ team: { id: s.team.id, name: s.team.name }, poolRank: s.rank, block: 'forfeit', level: 0, losingScore: -1, eliminatedIn: null, definitive: true }))

  const ordered = [...blocks.map((b) => b.sort((x, y) => y.level - x.level || y.losingScore - x.losingScore || x.poolRank - y.poolRank)), forfeits].flat()
  const rows = ordered.map(({ team, poolRank, block, eliminatedIn, definitive }, i): FinalRankingRow => ({
    place: i + 1,
    team,
    poolRank,
    block,
    blockName: RANKING_BLOCK_NAMES[block],
    eliminatedIn,
    definitive,
    prize: prizeOf(state.prizes, i + 1),
  }))
  const finished = BRACKET_ORDER.every((key) => byKey.get(key)?.winner)
  return { finished, rows }
}
