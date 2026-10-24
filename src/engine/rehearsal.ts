import type { Command, Event } from './engine.ts'
import { poolView } from './pool.ts'
import { randomInt, type Rng } from './rng.ts'
import { MAX_SCORE, MAX_TEAMS_LIMIT } from './settings.ts'
import type { EditionState } from './state.ts'
import { accept, refuse, type Ctx, type Decision } from './types.ts'

// Répétition générale, réservée aux éditions de test : des équipes fictives
// déjà pointées, puis des scores au hasard pour dérouler le tournoi en
// quelques minutes. Rien de neuf n'est stocké : ces commandes produisent les
// événements ordinaires (inscription, pointage, score), tirés dans `decide`,
// donc rejouables et visibles au journal comme une vraie saisie.

// --- Commandes -------------------------------------------------------------

/** Inscrit et pointe `count` équipes fictives (le plafond est relevé si besoin). */
export interface GenerateFakeTeams {
  type: 'generateFakeTeams'
  count: number
}

/** Saisit un score au hasard pour chaque match sans score de la partie en cours. */
export interface FillRandomScores {
  type: 'fillRandomScores'
}

export type RehearsalCommand = GenerateFakeTeams | FillRandomScores

/** Le moteur, injecté par `engine.ts` (évite un import circulaire). */
export interface Engine {
  decide(state: EditionState, command: Command, ctx: Ctx): Decision<Event>
  evolve(state: EditionState, event: Event): EditionState
}

// --- Matchs ouverts ----------------------------------------------------------

/** Un match lancé sans score, et la commande qui saisit son score. */
export interface OpenMatch {
  id: string
  enter(scoreA: number, scoreB: number): Command
}

/**
 * Matchs à remplir par la répétition : ceux de la partie de poule en cours
 * encore sans score (sur planche ou en attente de planche).
 * Ticket 12 : y ajouter les matchs de tableau lancés sans score.
 */
export function openMatches(state: EditionState): OpenMatch[] {
  const round = poolView(state).rounds.at(-1)
  if (!round) return []
  return round.matches
    .filter((m) => !m.score)
    .map((m) => ({ id: m.id, enter: (scoreA, scoreB) => ({ type: 'enterPoolScore', matchId: m.id, scoreA, scoreB }) }))
}

// --- decide ----------------------------------------------------------------

export function decideRehearsal(state: EditionState, command: RehearsalCommand, ctx: Ctx, engine: Engine): Decision<Event> {
  if (!state.edition!.settings.isTest) {
    return refuse('Réservé aux éditions de test : la répétition générale ne touche jamais une vraie édition.')
  }
  switch (command.type) {
    case 'generateFakeTeams': {
      const { count } = command
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) return refuse('Indiquez un nombre d’équipes (au moins 1).')
      if (state.pool.rounds.length > 0) return refuse('Le tournoi a commencé : on ne peut plus ajouter d’équipes.')
      const room = MAX_TEAMS_LIMIT - state.teams.length
      if (count > room) {
        return refuse(
          room === 0
            ? `L’édition compte déjà ${MAX_TEAMS_LIMIT} équipes, le maximum.`
            : `Au plus ${room} équipe${room > 1 ? 's' : ''} de plus : une édition compte ${MAX_TEAMS_LIMIT} équipes au maximum.`,
        )
      }
      const commands: Command[] = []
      const total = state.teams.length + count
      // Toutes les fictives doivent jouer : le plafond suit, sans dépasser 64.
      if (total > state.edition!.settings.maxTeams) commands.push({ type: 'updateEdition', changes: { maxTeams: total } })
      const names = fakeTeams(ctx.rng, count, state)
      const first = state.nextTeamNumber
      names.forEach((team) => commands.push({ type: 'registerTeam', team }))
      names.forEach((_, i) => commands.push({ type: 'checkInTeam', teamId: `t${first + i}` }))
      return chain(state, commands, ctx, engine)
    }
    case 'fillRandomScores': {
      const open = openMatches(state)
      if (open.length === 0) return refuse('Aucun match sans score dans la partie en cours.')
      return chain(
        state,
        open.map((m) => {
          const [winner, loser] = randomScore(ctx.rng)
          return randomInt(ctx.rng, 2) === 0 ? m.enter(winner, loser) : m.enter(loser, winner)
        }),
        ctx,
        engine,
      )
    }
  }
}

/** Applique les commandes l'une après l'autre ; le premier refus annule tout. */
function chain(state: EditionState, commands: Command[], ctx: Ctx, engine: Engine): Decision<Event> {
  const events: Event[] = []
  let current = state
  for (const command of commands) {
    const decision = engine.decide(current, command, ctx)
    if (!decision.ok) return decision
    events.push(...decision.events)
    current = decision.events.reduce(engine.evolve, current)
  }
  return accept(...events)
}

/** Part des matchs gagnés à moins de 13 (temps écoulé). */
const SHORT_WIN_RATE = 0.2

/** [vainqueur, perdant] : 13 la plupart du temps, parfois moins (de 6 à 12). */
export function randomScore(rng: Rng): [number, number] {
  const winner = rng.next() < SHORT_WIN_RATE ? 6 + randomInt(rng, MAX_SCORE - 6) : MAX_SCORE
  return [winner, randomInt(rng, winner)]
}

// --- Équipes fictives ------------------------------------------------------

const FIRST_NAMES = [
  'Alain', 'Anne', 'Antoine', 'Aurélie', 'Benoît', 'Bernadette', 'Camille', 'Céline', 'Christophe', 'Claude',
  'Damien', 'Delphine', 'Didier', 'Élodie', 'Émilie', 'Éric', 'Fabien', 'Florence', 'François', 'Gaëlle',
  'Gérard', 'Guillaume', 'Hélène', 'Hugo', 'Isabelle', 'Jacques', 'Jérôme', 'Joël', 'Julie', 'Karine',
  'Laurent', 'Léa', 'Lucas', 'Ludovic', 'Manon', 'Marc', 'Marie', 'Martine', 'Mathieu', 'Maxime',
  'Michel', 'Monique', 'Nathalie', 'Nicolas', 'Noémie', 'Olivier', 'Pascal', 'Patricia', 'Philippe', 'Pierre',
  'Romain', 'Sandrine', 'Sébastien', 'Sophie', 'Stéphane', 'Sylvie', 'Thierry', 'Thomas', 'Valérie', 'Yannick',
]

const TEAM_NAMES = [
  'Les Palets d’Or', 'Les Fondus du Palet', 'Les Gars du Lay', 'La Plombée', 'Les Tontons Palets', 'Les Vendéens Volants',
  'Les Mains d’Argent', 'Le Palet Masqué', 'Les Copains d’Abord', 'Les Ch’tis du Bocage', 'Les Rois de la Planche', 'Les Petits Bras',
  'Les Pas Pressés', 'Les Mogettes', 'Les Rillettes', 'Team Préfou', 'Les Handballeurs', 'Les Anciens du CJVHB',
  'Les Sans Rivaux', 'Les Bouchons', 'La Doublette Infernale', 'Les Chantonnaisiens', 'Les Pieds Nickelés', 'Les Galoches',
]

/** Équipes aux noms plausibles et variés, distinctes entre elles et des équipes déjà là. */
function fakeTeams(rng: Rng, count: number, state: EditionState) {
  const taken = new Set(state.teams.flatMap((t) => [t.name, `${t.player1} & ${t.player2}`].map(normalize)))
  const teams: { name: string; player1: string; player2: string; comment: string }[] = []
  const pick = <T,>(items: readonly T[]) => items[randomInt(rng, items.length)]
  while (teams.length < count) {
    const player1 = pick(FIRST_NAMES)
    const player2 = pick(FIRST_NAMES)
    if (player1 === player2) continue
    // Une sur trois environ porte un nom d'équipe, les autres le nom par défaut.
    const name = rng.next() < 0.35 ? pick(TEAM_NAMES) : ''
    const shown = normalize(name || `${player1} & ${player2}`)
    if (taken.has(shown)) continue
    taken.add(shown)
    teams.push({ name, player1, player2, comment: 'Équipe fictive (répétition)' })
  }
  return teams
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
