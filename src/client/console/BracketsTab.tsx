import { useEffect, useState, type FormEvent } from 'react'
import { POOL_ROUNDS, bracketSize, type BracketMatchView, type BracketTeamRef, type BracketView } from '../../engine/index.ts'
import { sendCommand } from '../api.ts'
import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import { MatchList } from './PoolsTab.tsx'
import type { TabProps } from './tabs.tsx'

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

/**
 * Onglet « Tableaux » : répartition Principal / Consolante proposée,
 * ajustable et validée, génération des tableaux, puis premier tour avec ses
 * planches et la saisie des scores.
 */
export function BracketsTab({ view }: TabProps) {
  const { split, generated, brackets } = view.brackets
  const current = split.validatedPrincipal ?? split.proposedPrincipal
  const [count, setCount] = useState(String(current))
  const [dirty, setDirty] = useState(false)
  const [confirmGenerate, setConfirmGenerate] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

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

  const save = async (match: BracketMatchView, a: number | null, b: number | null): Promise<string | null> => {
    const result = await sendCommand(view.id, { type: 'enterBracketScore', matchId: match.id, scoreA: a as number, scoreB: b as number })
    if (!result.ok) return result.reason
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
          <section className="panel">
            <h2>Tableaux</h2>
            <p className="muted small">
              Premier tour {view.settings.bracketFirstRound === 'random' ? 'tiré au sort' : 'en têtes de série'}. Cliquez sur un match pour saisir ou corriger son
              score (Tab passe au second score, Entrée valide, Échap annule). Entre parenthèses : le rang au classement des poules.
            </p>
            {feedback}
          </section>
          {brackets.map((b) => (
            <BracketPanel key={b.key} bracket={b} editing={editing} onEdit={setEditing} onSave={save} />
          ))}
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
    </div>
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
}: {
  bracket: BracketView
  editing: string | null
  onEdit: (id: string | null) => void
  onSave: (match: BracketMatchView, a: number | null, b: number | null) => Promise<string | null>
}) {
  return (
    <section className="panel">
      <h2>
        {bracket.name} <span className="muted small">{sizeLine(bracket.teams)}</span>
      </h2>
      {bracket.rounds.map((round) => {
        const real = round.matches.filter((m) => m.status !== 'bye')
        const byes = round.matches.filter((m) => m.status === 'bye')
        const missing = real.filter((m) => !m.score).length
        // MatchList attend des noms : on y met le rang des poules, et on retrouve le match d'origine à la saisie.
        const shown = (list: BracketMatchView[]) => list.map((m) => ({ ...m, teamA: seeded(m.teamA), teamB: seeded(m.teamB), match: m }))
        const onBoard = real.filter((m) => m.board !== null)
        const waiting = real.filter((m) => m.board === null)
        return (
          <div key={round.round}>
            <h3 className="pool-subtitle">
              {round.name} : {missing ? `${missing} / ${real.length} sans score` : 'tous les scores sont saisis'}
            </h3>
            <MatchList matches={shown(onBoard)} editing={editing} onEdit={onEdit} onCancel={() => onEdit(null)} onSave={(m, a, b) => onSave(m.match, a, b)} />
            {waiting.length > 0 && (
              <>
                <p className="muted small">En attente de planche ({waiting.length}) : ils prennent la prochaine planche libérée, dans cet ordre.</p>
                <MatchList matches={shown(waiting)} editing={editing} onEdit={onEdit} onCancel={() => onEdit(null)} onSave={(m, a, b) => onSave(m.match, a, b)} />
              </>
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
          </div>
        )
      })}
    </section>
  )
}
