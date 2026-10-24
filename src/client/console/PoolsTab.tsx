import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { PoolMatchView, PoolRoundView, PoolStanding } from '../../engine/index.ts'
import { sendCommand } from '../api.ts'
import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import type { TabProps } from './tabs.tsx'

/** Texte saisi → nombre ; le moteur refuse ce qui n'est pas un entier de 0 à 13. */
const parseScore = (text: string): number | null => (text.trim() === '' ? null : Number(text.trim().replace(',', '.')))

/**
 * Onglet « Poules » : lancer la partie, saisir les scores match par match
 * (clic, deux scores, Entrée), voir les matchs sans score et le classement.
 */
export function PoolsTab({ view }: TabProps) {
  const pool = view.pool
  const round = pool.rounds.at(-1) ?? null
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const nextRound = (pool.currentRound ?? 0) + 1
  const players = view.checkedInCount
  const missing = view.registeredCount - players

  const launch = async () => {
    setConfirming(false)
    const result = await sendCommand(view.id, { type: 'drawPoolRound', round: nextRound })
    if (!result.ok) {
      setMessage(null)
      return setRefusal(result.reason)
    }
    setRefusal(null)
    setMessage(`Partie ${nextRound} lancée : les planches sont attribuées.`)
  }

  const edit = (matchId: string) => {
    setEditing(matchId)
    setRefusal(null)
    setMessage(null)
  }

  /** Renvoie le refus du moteur (affiché sous le match), ou `null`. */
  const save = async (match: PoolMatchView, a: number | null, b: number | null): Promise<string | null> => {
    const result = await sendCommand(view.id, { type: 'enterPoolScore', matchId: match.id, scoreA: a as number, scoreB: b as number })
    if (!result.ok) return result.reason
    setRefusal(null)
    setMessage(`${match.board ? `Planche ${match.board} : ` : ''}« ${match.teamA.name} » ${a}-${b} « ${match.teamB.name} »${match.score ? ' (corrigé)' : ''}.`)
    setEditing(null)
    return null
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Poules</h2>
        {round ? (
          <RoundSummary round={round} />
        ) : (
          <>
            <p className="checkin-count">
              <strong>{players}</strong> {players > 1 ? 'équipes pointées' : 'équipe pointée'} pour la partie 1
              {missing > 0 && <span className="muted"> · {missing} inscrite{missing > 1 ? 's' : ''} pas encore pointée{missing > 1 ? 's' : ''}</span>}
            </p>
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
                Lancer la partie 1
              </button>
            </div>
          </>
        )}
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
      </section>

      {round && (
        <section className="panel">
          <h2>Partie {round.round} : matchs par planche</h2>
          <p className="muted small">Cliquez sur un match pour saisir ou corriger son score (Tab passe au second score, Entrée valide, Échap annule).</p>
          <MatchList
            matches={round.matches.filter((m) => m.board !== null)}
            editing={editing}
            onEdit={edit}
            onCancel={() => setEditing(null)}
            onSave={save}
          />
          {round.matches.some((m) => m.board === null) && (
            <>
              <h3 className="pool-subtitle">En attente de planche ({round.awaitingBoard.length})</h3>
              <p className="muted small">Ils prennent la prochaine planche libérée, dans cet ordre.</p>
              <MatchList
                matches={round.matches.filter((m) => m.board === null)}
                editing={editing}
                onEdit={edit}
                onCancel={() => setEditing(null)}
                onSave={save}
              />
            </>
          )}
          {round.bye && (
            <p className="pool-bye">
              Exempte : <strong>{round.bye.team.name}</strong> (gagne {round.bye.score.a}-{round.bye.score.b})
            </p>
          )}
        </section>
      )}

      {pool.standings.length > 0 && <Standings standings={pool.standings} />}

      {confirming && (
        <ConfirmDialog title={`Lancer la partie ${nextRound} ?`} confirmLabel="Lancer le tirage" onConfirm={() => void launch()} onCancel={() => setConfirming(false)}>
          <p>
            Tirage au sort de {players} équipe{players > 1 ? 's' : ''} pointée{players > 1 ? 's' : ''}, une planche par match.
            {players % 2 === 1 && ' Nombre impair : une équipe sera exempte.'}
          </p>
          <p>Ensuite, le pointage et les inscriptions sont clos.{missing > 0 && ` ${missing} inscrite${missing > 1 ? 's' : ''} non pointée${missing > 1 ? 's' : ''} ne jouera pas.`}</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

function RoundSummary({ round }: { round: PoolRoundView }) {
  const total = round.matches.length
  const done = total - round.awaitingScore.length
  const missingBoards = round.matches.filter((m) => !m.score && m.board !== null).map((m) => m.board)
  return (
    <div role="status">
      <p className="checkin-count">
        Partie {round.round} : <strong>{done} / {total}</strong> scores saisis
      </p>
      {round.complete ? (
        <p className="success">Tous les scores de la partie {round.round} sont saisis.</p>
      ) : (
        <p className="pool-missing">
          En attente de score : {missingBoards.length > 0 && `planche${missingBoards.length > 1 ? 's' : ''} ${missingBoards.join(', ')}`}
          {round.awaitingBoard.length > 0 && `${missingBoards.length ? ' ; ' : ''}${round.awaitingBoard.length} match${round.awaitingBoard.length > 1 ? 's' : ''} sans planche`}
        </p>
      )}
    </div>
  )
}

function MatchList({
  matches,
  editing,
  onEdit,
  onCancel,
  onSave,
}: {
  matches: PoolMatchView[]
  editing: string | null
  onEdit: (id: string) => void
  onCancel: () => void
  onSave: (match: PoolMatchView, a: number | null, b: number | null) => Promise<string | null>
}) {
  return (
    <ul className="pool-matches">
      {matches.map((m) =>
        editing === m.id ? (
          <ScoreEditor key={m.id} match={m} onCancel={onCancel} onSave={onSave} />
        ) : (
          <li key={m.id}>
            <button
              type="button"
              className={`pool-match${m.score ? ' is-done' : ' is-missing'}`}
              onClick={() => onEdit(m.id)}
              aria-label={`${m.board ? `Planche ${m.board}` : 'Sans planche'} : ${m.teamA.name} contre ${m.teamB.name}, ${m.score ? `${m.score.a}-${m.score.b}, corriger` : 'saisir le score'}`}
            >
              <span className="pool-board">{m.board ?? '–'}</span>
              <span className={`pool-team${m.score && m.score.a > m.score.b ? ' is-winner' : ''}`}>{m.teamA.name}</span>
              <span className="pool-score">{m.score ? `${m.score.a} - ${m.score.b}` : <span className="badge badge-wait">sans score</span>}</span>
              <span className={`pool-team pool-team-b${m.score && m.score.b > m.score.a ? ' is-winner' : ''}`}>{m.teamB.name}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  )
}

function ScoreEditor({
  match,
  onCancel,
  onSave,
}: {
  match: PoolMatchView
  onCancel: () => void
  onSave: (match: PoolMatchView, a: number | null, b: number | null) => Promise<string | null>
}) {
  const [a, setA] = useState(match.score ? String(match.score.a) : '')
  const [b, setB] = useState(match.score ? String(match.score.b) : '')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<{ reason: string; attempt: number } | null>(null)
  const first = useRef<HTMLInputElement>(null)

  // À l'ouverture et après chaque refus : retour au premier score, sélectionné.
  useEffect(() => {
    first.current?.focus()
    first.current?.select()
  }, [refusal])

  const submit = async () => {
    if (busy) return
    setBusy(true)
    const reason = await onSave(match, parseScore(a), parseScore(b))
    setBusy(false)
    if (reason) setRefusal((r) => ({ reason, attempt: (r?.attempt ?? 0) + 1 }))
  }

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') return onCancel()
    if (event.key === 'Enter') {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <li>
      <form
        className="pool-match is-editing"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        noValidate
      >
        <span className="pool-board">{match.board ?? '–'}</span>
        <label className="pool-team">
          {match.teamA.name}
          <input
            ref={first}
            className="pool-input"
            inputMode="numeric"
            autoComplete="off"
            value={a}
            onChange={(e) => setA(e.target.value)}
            onKeyDown={onKey}
            aria-label={`Score de ${match.teamA.name}`}
          />
        </label>
        <span className="pool-score">-</span>
        <label className="pool-team pool-team-b">
          <input
            className="pool-input"
            inputMode="numeric"
            autoComplete="off"
            value={b}
            onChange={(e) => setB(e.target.value)}
            onKeyDown={onKey}
            aria-label={`Score de ${match.teamB.name}`}
          />
          {match.teamB.name}
        </label>
        <span className="pool-edit-actions">
          <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
            Valider
          </button>
          <button type="button" className="btn btn-small" onClick={onCancel}>
            Annuler
          </button>
        </span>
      </form>
      {refusal && (
        <p className="refusal pool-feedback" role="alert">
          {refusal.reason}
        </p>
      )}
    </li>
  )
}

function Standings({ standings }: { standings: PoolStanding[] }) {
  return (
    <section className="panel">
      <h2>Classement des poules</h2>
      <p className="muted small">Victoires, puis points pour, puis différence, puis points contre.</p>
      <div className="table-wrap">
        <table className="standings">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col" className="left">
                Équipe
              </th>
              <th scope="col" title="Matchs joués">
                J
              </th>
              <th scope="col" title="Victoires">
                V
              </th>
              <th scope="col" title="Défaites">
                D
              </th>
              <th scope="col">Pour</th>
              <th scope="col">Contre</th>
              <th scope="col">Diff.</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.team.id}>
                <td>{s.rank}</td>
                <td className="left">{s.team.name}</td>
                <td>{s.played}</td>
                <td>
                  <strong>{s.wins}</strong>
                </td>
                <td>{s.losses}</td>
                <td>{s.pointsFor}</td>
                <td>{s.pointsAgainst}</td>
                <td>{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
