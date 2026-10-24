import { useEffect, useState, type FormEvent } from 'react'
import { BRACKET_NAMES, IMPACT_END, POOL_ROUNDS, bracketSize, type BracketKey, type BracketMatchView, type BracketRoundView, type BracketTeamRef, type BracketView } from '../../engine/index.ts'
import { sendCommand } from '../api.ts'
import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import { ClockControls } from './ClockControls.tsx'
import { MatchList } from './PoolsTab.tsx'
import { RehearsalPanel } from './RehearsalPanel.tsx'
import type { TabProps } from './tabs.tsx'

/** Ordre d'affichage : chaque Challenge sous son tableau parent. */
const BRACKET_ORDER: BracketKey[] = ['P', 'CP', 'C', 'CC']

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** « 13 équipes, tableau de 16 (3 exempts) ». */
function sizeLine(teams: number): string {
  if (teams < 2) return plural(teams, 'équipe')
  const size = bracketSize(teams)
  const byes = size - teams
  return `${plural(teams, 'équipe')}, tableau de ${size}${byes ? ` (${plural(byes, 'exempt')} pour les mieux classées)` : ', sans exempt'}`
}

/** Nom affiché dans la console : avec le rang au classement des poules. */
const seeded = (team: BracketTeamRef | null) => (team ? { ...team, name: `${team.name} (${team.poolRank === 1 ? '1re' : `${team.poolRank}e`})` } : { name: 'exempt' })

type Dialog =
  /** `warning` : le refus du moteur sans confirmation, qui dit l'impact de la correction. */
  | { kind: 'correct'; match: BracketMatchView; a: number; b: number; warning: string }
  | { kind: 'forfeit'; team: BracketTeamRef }

/** Équipes encore dans les tableaux (au 1er tour d'un tableau, hors forfaits), par ordre alphabétique. */
function teamsInBrackets(brackets: readonly BracketView[], forfeits: readonly BracketTeamRef[]): BracketTeamRef[] {
  const out = new Map<string, BracketTeamRef>()
  for (const b of brackets) for (const m of b.rounds[0]?.matches ?? []) for (const t of [m.teamA, m.teamB]) if (t) out.set(t.id, t)
  for (const f of forfeits) out.delete(f.id)
  return [...out.values()].sort((x, y) => x.name.localeCompare(y.name, 'fr'))
}

/**
 * Onglet « Tableaux » : répartition Principal / Consolante proposée,
 * ajustable et validée, génération des tableaux, puis chaque tableau en arbre
 * (un tour par colonne), les planches, la file d’attente et la saisie des
 * scores de tous les matchs lancés.
 */
export function BracketsTab({ view }: TabProps) {
  const { split, generated, brackets, live } = view.brackets
  const queue = live.filter((m) => m.status === 'waiting-board').map((m) => m.id)
  const inBrackets = teamsInBrackets(brackets, view.brackets.forfeits)
  const current = split.validatedPrincipal ?? split.proposedPrincipal
  const [count, setCount] = useState(String(current))
  const [dirty, setDirty] = useState(false)
  const [confirmGenerate, setConfirmGenerate] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [forfeitId, setForfeitId] = useState('')

  // Un autre PC a validé, ou le classement a changé : on suit, sauf saisie en cours.
  useEffect(() => {
    if (!dirty) setCount(String(current))
  }, [current, dirty])

  const send = async (command: Parameters<typeof sendCommand>[1], success: string) => {
    const result = await sendCommand(view.id, command)
    if (!result.ok) {
      setMessage(null)
      setRefusal(result.reason)
      return false
    }
    setRefusal(null)
    setMessage(success)
    return true
  }

  const validate = async (event: FormEvent) => {
    event.preventDefault()
    const principalCount = count.trim() === '' ? NaN : Number(count.trim())
    // Le succès se lit dans la ligne « Répartition validée ».
    if (await send({ type: 'validateSplit', principalCount }, '')) {
      setMessage(null)
      setDirty(false)
    }
  }

  const generate = async () => {
    setConfirmGenerate(false)
    await send({ type: 'generateBrackets' }, 'Tableaux générés : les matchs du premier tour ont leur planche.')
  }

  const save = async (match: BracketMatchView, a: number | null, b: number | null, confirm = false): Promise<string | null> => {
    const result = await sendCommand(view.id, { type: 'enterBracketScore', matchId: match.id, scoreA: a as number, scoreB: b as number, ...(confirm ? { confirm } : {}) })
    if (!result.ok) {
      // Correction qui change le vainqueur : le moteur dit d'abord ce qu'elle change dans la suite, on fait confirmer.
      const flips = !confirm && match.score !== null && a !== null && b !== null && a !== b && a > b !== match.score.a > match.score.b
      if (flips) {
        setDialog({ kind: 'correct', match, a, b, warning: result.reason })
        return null
      }
      return result.reason
    }
    setDialog(null)
    setRefusal(null)
    setMessage(
      `${match.bracketName}, ${match.roundName}${match.board ? `, planche ${match.board}` : ''} : « ${match.teamA?.name} » ${a}-${b} « ${match.teamB?.name} »${match.score ? ' (corrigé)' : ''}.`,
    )
    setEditing(null)
    return null
  }

  const feedback = (
    <>
      {refusal && (
        <p className="refusal pool-feedback" role="alert">
          {refusal}
        </p>
      )}
      {message && (
        <p className="success pool-feedback" role="status">
          {message}
        </p>
      )}
    </>
  )

  if (!split.ready && !generated) {
    return (
      <section className="panel">
        <h2>Tableaux</h2>
        <p className="muted">
          La répartition Principal / Consolante se valide une fois les {POOL_ROUNDS} parties de poule terminées
          {view.pool.currentRound ? ` (partie ${view.pool.currentRound} en cours)` : ''}.
        </p>
      </section>
    )
  }

  const typed = Number(count)
  const preview = Number.isInteger(typed) && typed >= 0 && typed <= split.participants ? typed : null

  return (
    <div className="stack">
      {generated && <ClockControls view={view} />}
      {!generated && (
        <section className="panel">
          <h2>Répartition Principal / Consolante</h2>
          <p className="muted small">
            {split.participants} équipes en jeu (forfaits de poule exclus). Proposition : 2/3 en Principal, soit <strong>{split.proposedPrincipal}</strong>. Les premières du
            classement des poules vont en Principal, les suivantes en Consolante.
          </p>
          <form className="split-form" onSubmit={(e) => void validate(e)} noValidate>
            <label className="field">
              <span>Équipes en Principal</span>
              <input
                type="number"
                inputMode="numeric"
                value={count}
                onChange={(e) => {
                  setCount(e.target.value)
                  setDirty(true)
                }}
              />
            </label>
            <button type="submit" className="btn btn-primary">
              {split.validatedPrincipal === null ? 'Valider la répartition' : 'Revalider la répartition'}
            </button>
          </form>
          {preview !== null && (
            <ul className="split-preview">
              <li>
                <strong>Principal</strong> : {sizeLine(preview)}
              </li>
              <li>
                <strong>Consolante</strong> : {sizeLine(split.participants - preview)}
              </li>
            </ul>
          )}
          <p className={split.validatedPrincipal === null ? 'pool-missing' : 'success'}>
            {split.validatedPrincipal === null
              ? 'Répartition pas encore validée.'
              : `Répartition validée : ${split.validatedPrincipal} en Principal, ${split.participants - split.validatedPrincipal} en Consolante.`}
          </p>
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={split.validatedPrincipal === null || dirty} onClick={() => setConfirmGenerate(true)}>
              Générer les tableaux
            </button>
          </div>
          {feedback}
          {split.validatedPrincipal !== null && (
            <div className="split-lists">
              <SplitList title="Principal" teams={split.principal} />
              <SplitList title="Consolante" teams={split.consolante} />
            </div>
          )}
        </section>
      )}

      {generated && (
        <>
          <RehearsalPanel view={view} />
          <section className="panel">
            <h2>Tableaux</h2>
            <p className="muted small">
              Premier tour {view.settings.bracketFirstRound === 'random' ? 'tiré au sort' : 'en têtes de série'}. Les vainqueurs avancent d’eux-mêmes ; quand un tour
              est complet, le suivant est lancé sur les planches libres (les matchs sans planche la prennent dès qu’une se libère). Cliquez sur un match pour saisir
              ou corriger son score (Tab passe au second score, Entrée valide, Échap annule). Entre parenthèses : le rang au classement des poules.
            </p>
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={view.brackets.ready === 0}
                onClick={() => void send({ type: 'launchReadyMatches' }, `${plural(view.brackets.ready, 'match prêt')} lancé${view.brackets.ready > 1 ? 's' : ''}.`)}
              >
                Lancer les matchs prêts ({view.brackets.ready})
              </button>
            </div>
            <p className="muted small">
              {view.brackets.ready === 0
                ? 'Aucun match prêt : pas de match non lancé dont les deux équipes sont connues.'
                : `${plural(view.brackets.ready, 'match')} du tour suivant ${view.brackets.ready > 1 ? 'ont' : 'a'} déjà ${view.brackets.ready > 1 ? 'leurs' : 'ses'} deux équipes : ${view.brackets.ready > 1 ? 'ils peuvent' : 'il peut'} commencer sans attendre la fin du tour.`}
            </p>
            <form
              className="split-form"
              onSubmit={(e) => {
                e.preventDefault()
                const team = inBrackets.find((t) => t.id === forfeitId)
                if (team) setDialog({ kind: 'forfeit', team })
              }}
            >
              <label className="field">
                <span>Forfait en tableau</span>
                <select value={forfeitId} onChange={(e) => setForfeitId(e.target.value)}>
                  <option value="">Choisir une équipe…</option>
                  {inBrackets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn btn-danger" disabled={!forfeitId}>
                Déclarer forfait
              </button>
            </form>
            {view.brackets.forfeits.length > 0 && (
              <p className="muted small">Forfaits en tableau : {view.brackets.forfeits.map((t) => `« ${t.name} »`).join(', ')}.</p>
            )}
            {feedback}
          </section>
          {BRACKET_ORDER.map((key) => {
            const b = brackets.find((x) => x.key === key)
            if (b) return <BracketPanel key={key} bracket={b} editing={editing} onEdit={setEditing} onSave={save} queue={queue} />
            const parent = key === 'CP' ? 'du Principal' : 'de la Consolante'
            return (
              <section key={key} className="panel" aria-label={`Tableau ${BRACKET_NAMES[key]}`}>
                <h2>{BRACKET_NAMES[key]}</h2>
                <p className="muted small">
                  Formé dès que le premier tour {parent} est joué : les perdants de ses vrais matchs (pas les exempts), en têtes de série d’après le classement des
                  poules.
                </p>
              </section>
            )
          })}
        </>
      )}

      {confirmGenerate && split.validatedPrincipal !== null && (
        <ConfirmDialog title="Générer les tableaux ?" confirmLabel="Générer les tableaux" onConfirm={() => void generate()} onCancel={() => setConfirmGenerate(false)}>
          <p>
            Principal : {sizeLine(split.validatedPrincipal)}. Consolante : {sizeLine(split.participants - split.validatedPrincipal)}.
          </p>
          <p>Premier tour {view.settings.bracketFirstRound === 'random' ? 'tiré au sort (les exempts restent aux mieux classées)' : 'en têtes de série'}, une planche par match.</p>
          <p>Ensuite, les poules sont closes : leurs scores et la répartition ne peuvent plus changer.</p>
        </ConfirmDialog>
      )}

      {dialog?.kind === 'correct' && (
        <ConfirmDialog
          title={`Corriger : ${dialog.match.bracketName}, ${dialog.match.roundName}${dialog.match.board ? `, planche ${dialog.match.board}` : ''} ?`}
          confirmLabel={`Corriger en ${dialog.a}-${dialog.b}`}
          danger
          onConfirm={() => void save(dialog.match, dialog.a, dialog.b, true).then((reason) => reason && (setDialog(null), setRefusal(reason)))}
          onCancel={() => setDialog(null)}
        >
          <ImpactText warning={dialog.warning} />
          <p>Les scores effacés devront être ressaisis. Le journal garde la trace de la correction.</p>
        </ConfirmDialog>
      )}

      {dialog?.kind === 'forfeit' && (
        <ConfirmDialog
          title={`Déclarer « ${dialog.team.name} » forfait ?`}
          confirmLabel="Déclarer forfait"
          danger
          onConfirm={() => {
            const team = dialog.team
            setDialog(null)
            void send({ type: 'declareForfeit', teamId: team.id }, `« ${team.name} » est déclarée forfait : son adversaire avance.`).then((ok) => ok && setForfeitId(''))
          }}
          onCancel={() => setDialog(null)}
        >
          <p>Son prochain match non joué est gagné 13-0 par l’adversaire (dès qu’il est connu), qui avance ; de même pour ses matchs suivants, Challenge compris.</p>
          <p>Elle est classée à sa place d’élimination. Un forfait en tableau ne peut pas être annulé.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

/** Impact d'une correction, dit par le moteur une phrase par ligne : le changement de vainqueur, puis la liste de ce qui change ensuite. */
function ImpactText({ warning }: { warning: string }) {
  const [head, ...rest] = warning.split('\n').filter((line) => line !== IMPACT_END)
  return (
    <>
      <p>
        <strong>{head}</strong>
      </p>
      {rest.length === 1 && !rest[0].startsWith('«') ? (
        <p>{rest[0]}</p>
      ) : (
        <ul className="impact-list">
          {rest.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </>
  )
}

function SplitList({ title, teams }: { title: string; teams: BracketTeamRef[] }) {
  return (
    <div>
      <h3 className="pool-subtitle">
        {title} ({teams.length})
      </h3>
      <ol className="split-list">
        {teams.map((t) => (
          <li key={t.id}>
            <span className="muted">{t.poolRank}.</span> {t.name}
          </li>
        ))}
      </ol>
    </div>
  )
}

function BracketPanel({
  bracket,
  editing,
  onEdit,
  onSave,
  queue,
}: {
  bracket: BracketView
  editing: string | null
  onEdit: (id: string | null) => void
  onSave: (match: BracketMatchView, a: number | null, b: number | null) => Promise<string | null>
  /** Ids des matchs en attente de planche, dans l'ordre de la file. */
  queue: string[]
}) {
  // Tours qui ont au moins un match lancé : le plus récent d'abord ; les tours pas encore lancés ne sont que dans l'arbre.
  const started = bracket.rounds.filter((r) => r.matches.some((m) => m.status !== 'pending' && m.status !== 'bye')).reverse()
  const final = bracket.rounds.at(-1)?.matches[0]
  return (
    <section className="panel" aria-label={`Tableau ${bracket.name}`}>
      <h2>
        {bracket.name} <span className="muted small">{sizeLine(bracket.teams)}</span>
      </h2>
      {bracket.winner ? (
        <p className="bracket-winner" role="status">
          Vainqueur {bracket.key === 'C' ? 'de la' : 'du'} {bracket.name} : <strong>{seeded(bracket.winner).name}</strong>
          {final?.score && <span className="muted"> ({Math.max(final.score.a, final.score.b)}-{Math.min(final.score.a, final.score.b)} en finale)</span>}
        </p>
      ) : null}
      {started.map((round) => (
        <RoundScores key={round.round} round={round} editing={editing} onEdit={onEdit} onSave={onSave} queue={queue} />
      ))}
      <h3 className="pool-subtitle">Arbre du tableau</h3>
      <BracketTree bracket={bracket} />
    </section>
  )
}

/** Arbre du tableau, une colonne par tour : planche, équipes, score ; en lecture seule (la saisie est en dessous). */
function BracketTree({ bracket }: { bracket: BracketView }) {
  return (
    <div className="bracket-tree" role="list" aria-label={`Arbre du ${bracket.name}`}>
      {bracket.rounds.map((round) => (
        <div key={round.round} className="bracket-col" role="listitem">
          <h3 className="bracket-col-title">{round.name}</h3>
          <div className="bracket-col-matches">
            {round.matches.map((m) => (
              <TreeMatch key={m.id} match={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const TREE_STATUS: Record<BracketMatchView['status'], string> = {
  playing: 'en cours',
  'waiting-board': 'attend une planche',
  done: 'joué',
  pending: 'à venir',
  bye: 'exempt',
}

function TreeMatch({ match: m }: { match: BracketMatchView }) {
  const won = (side: 'a' | 'b') => (m.score ? (side === 'a' ? m.score.a > m.score.b : m.score.b > m.score.a) : m.status === 'bye' && (side === 'a' ? m.teamA : m.teamB) !== null)
  const team = (t: BracketTeamRef | null, side: 'a' | 'b') => (
    <span className={`bracket-team${won(side) ? ' is-winner' : ''}${t ? '' : ' is-unknown'}`}>
      <span className="bracket-team-name">{t ? seeded(t).name : m.status === 'bye' ? 'exempt' : 'à déterminer'}</span>
      {m.score && <span className="bracket-team-score">{side === 'a' ? m.score.a : m.score.b}</span>}
    </span>
  )
  return (
    <div className={`bracket-match is-${m.status}`} title={`${m.roundName} : ${TREE_STATUS[m.status]}`}>
      <span className="bracket-match-board">
        {m.board ? `Planche ${m.board}` : m.status === 'waiting-board' ? 'En attente de planche' : m.forfeit ? 'forfait' : TREE_STATUS[m.status]}
        {m.board && m.forfeit ? ' · forfait' : ''}
      </span>
      {team(m.teamA, 'a')}
      {team(m.teamB, 'b')}
    </div>
  )
}

/** Saisie des scores d'un tour lancé ; un tour terminé se replie (on le rouvre pour corriger). */
function RoundScores({
  round,
  editing,
  onEdit,
  onSave,
  queue,
}: {
  round: BracketRoundView
  editing: string | null
  onEdit: (id: string | null) => void
  onSave: (match: BracketMatchView, a: number | null, b: number | null) => Promise<string | null>
  queue: string[]
}) {
  const real = round.matches.filter((m) => m.status !== 'bye')
  const byes = round.matches.filter((m) => m.status === 'bye')
  const missing = real.filter((m) => !m.score).length
  const [open, setOpen] = useState(false)
  const shownOpen = missing > 0 || open || real.some((m) => m.id === editing)
  // MatchList attend des noms : on y met le rang des poules, et on retrouve le match d'origine à la saisie.
  const shown = (list: BracketMatchView[]) => list.map((m) => ({ ...m, teamA: seeded(m.teamA), teamB: seeded(m.teamB), match: m }))
  const onBoard = real.filter((m) => m.board !== null)
  const waiting = real.filter((m) => m.status === 'waiting-board').sort((x, y) => queue.indexOf(x.id) - queue.indexOf(y.id))
  const forfeits = real.filter((m) => m.forfeit && m.board === null)
  return (
    <div className="bracket-round">
      <h3 className="pool-subtitle">
        {round.name} : {missing ? `${missing} / ${real.length} sans score` : 'tous les scores sont saisis'}
        {missing === 0 && (
          <button type="button" className="btn btn-small" onClick={() => setOpen(!shownOpen)} aria-expanded={shownOpen}>
            {shownOpen ? 'Replier' : 'Voir ou corriger'}
          </button>
        )}
      </h3>
      {shownOpen && (
        <>
          <MatchList matches={shown(onBoard)} editing={editing} onEdit={onEdit} onCancel={() => onEdit(null)} onSave={(m, a, b) => onSave(m.match, a, b)} />
          {waiting.length > 0 && (
            <>
              <p className="muted small">En attente de planche ({waiting.length}) : ils prennent la prochaine planche libérée, dans cet ordre.</p>
              <MatchList matches={shown(waiting)} editing={editing} onEdit={onEdit} onCancel={() => onEdit(null)} onSave={(m, a, b) => onSave(m.match, a, b)} />
            </>
          )}
          {forfeits.length > 0 && (
            <p className="pool-bye">
              Gagnés par forfait (13-0, sans planche) :{' '}
              {forfeits.map((m) => `« ${seeded(m.forfeit === m.teamA?.id ? m.teamB : m.teamA).name} » contre « ${seeded(m.forfeit === m.teamA?.id ? m.teamA : m.teamB).name} » (forfait)`).join(', ')}
            </p>
          )}
          {byes.length > 0 && (
            <p className="pool-bye">
              Exempts du {round.name} (qualifiés d’office) :{' '}
              {byes
                .map((m) => (m.teamA ?? m.teamB)!)
                .sort((x, y) => x.poolRank - y.poolRank)
                .map((t) => seeded(t).name)
                .join(', ')}
            </p>
          )}
        </>
      )}
    </div>
  )
}
