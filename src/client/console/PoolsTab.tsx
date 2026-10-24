import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { POOL_ROUNDS, type PoolMatchView, type Score, type PoolRoundView, type PoolStanding, type PoolTeamRef } from '../../engine/index.ts'
import { sendCommand } from '../api.ts'
import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import { RehearsalPanel } from './RehearsalPanel.tsx'
import type { TabProps } from './tabs.tsx'

/** Ce qu'il faut d'un match pour l'afficher et saisir son score (poule ou tableau). */
export interface ScorableMatch {
  id: string
  board: number | null
  teamA: { name: string }
  teamB: { name: string }
  score: Score | null
  forfeit?: string | null
}

/** Texte saisi → nombre ; le moteur refuse ce qui n'est pas un entier de 0 à 13. */
const parseScore = (text: string): number | null => (text.trim() === '' ? null : Number(text.trim().replace(',', '.')))

type Dialog =
  | { kind: 'launch' }
  /** `warning` : le refus du moteur sans confirmation, qui dit ce qui sera effacé. */
  | { kind: 'remove'; round: number; warning: string }
  | { kind: 'forfeit'; team: PoolTeamRef }

/**
 * Onglet « Poules » : lancer les parties, saisir et corriger les scores match
 * par match (clic, deux scores, Entrée), voir les matchs sans score et le
 * classement, déclarer un forfait, retirer la dernière partie.
 */
export function PoolsTab({ view }: TabProps) {
  const pool = view.pool
  const current = pool.rounds.at(-1) ?? null
  const [shownRound, setShownRound] = useState<number | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Partie affichée : celle choisie, sinon la dernière lancée.
  const round = pool.rounds.find((r) => r.round === shownRound) ?? current
  const nextRound = (pool.currentRound ?? 0) + 1
  const inPlay = current ? pool.standings.filter((s) => !s.forfeit).length : view.checkedInCount
  const missing = view.registeredCount - view.checkedInCount

  /** Envoie une commande ; affiche le refus du moteur, sinon `success`. */
  const send = async (command: Parameters<typeof sendCommand>[1], success: string) => {
    setDialog(null)
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

  const launch = async () => {
    if (await send({ type: 'drawPoolRound', round: nextRound }, `Partie ${nextRound} lancée : les planches sont attribuées.`)) setShownRound(null)
  }

  /** Demande d'abord au moteur ce que le retrait effacerait, puis confirme. */
  const askRemove = async (roundNumber: number) => {
    const result = await sendCommand(view.id, { type: 'removePoolRound', round: roundNumber })
    if (result.ok) return // ne peut pas arriver sans `confirm`
    setDialog({ kind: 'remove', round: roundNumber, warning: result.reason })
  }

  const remove = async (roundNumber: number) => {
    if (await send({ type: 'removePoolRound', round: roundNumber, confirm: true }, `Partie ${roundNumber} retirée : son tirage et ses scores sont effacés.`)) {
      setShownRound(null)
      setEditing(null)
    }
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
    setMessage(
      `Partie ${match.round}${match.board ? `, planche ${match.board}` : ''} : « ${match.teamA.name} » ${a}-${b} « ${match.teamB.name} »${match.score ? ' (corrigé)' : ''}.`,
    )
    setEditing(null)
    return null
  }

  return (
    <div className="stack">
      <RehearsalPanel view={view} />
      <section className="panel">
        <h2>Poules</h2>
        {current ? (
          <RoundSummary round={current} />
        ) : (
          <p className="checkin-count">
            <strong>{inPlay}</strong> {inPlay > 1 ? 'équipes pointées' : 'équipe pointée'} pour la partie 1
            {missing > 0 && <span className="muted"> · {missing} inscrite{missing > 1 ? 's' : ''} pas encore pointée{missing > 1 ? 's' : ''}</span>}
          </p>
        )}
        <div className="actions">
          {(!current || (current.complete && nextRound <= POOL_ROUNDS)) && (
            <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: 'launch' })}>
              Lancer la partie {nextRound}
            </button>
          )}
          {current?.complete && nextRound > POOL_ROUNDS && <p className="success">Les {POOL_ROUNDS} parties de poule sont terminées.</p>}
          {current?.complete && nextRound > POOL_ROUNDS && view.brackets.generated && <p className="muted">Les tableaux sont générés : les poules sont closes.</p>}
          {current && !view.brackets.generated && (
            <button type="button" className="btn btn-danger-outline" onClick={() => void askRemove(current.round)}>
              Retirer la partie {current.round}
            </button>
          )}
        </div>
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
          {pool.rounds.length > 1 && (
            <div className="pool-rounds" role="group" aria-label="Partie affichée">
              {pool.rounds.map((r) => (
                <button
                  key={r.round}
                  type="button"
                  className={`btn btn-small${r.round === round.round ? ' btn-primary' : ''}`}
                  aria-pressed={r.round === round.round}
                  onClick={() => {
                    setShownRound(r.round === current?.round ? null : r.round)
                    setEditing(null)
                  }}
                >
                  Partie {r.round}
                </button>
              ))}
            </div>
          )}
          <h2>
            Partie {round.round} : matchs par planche{round !== current && <span className="muted small"> (partie terminée, scores corrigeables)</span>}
          </h2>
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

      {pool.standings.length > 0 && (
        <Standings
          standings={pool.standings}
          onForfeit={(team) => setDialog({ kind: 'forfeit', team })}
          onCancelForfeit={(team) => void send({ type: 'cancelForfeit', teamId: team.id }, `Forfait de « ${team.name} » annulé.`)}
        />
      )}

      {dialog?.kind === 'launch' && (
        <ConfirmDialog title={`Lancer la partie ${nextRound} ?`} confirmLabel="Lancer le tirage" onConfirm={() => void launch()} onCancel={() => setDialog(null)}>
          {current ? (
            <p>
              Tirage au sort de {inPlay} équipe{inPlay > 1 ? 's' : ''} encore en jeu, sans revoir un adversaire déjà rencontré, une planche par match.
              {inPlay % 2 === 1 && ' Nombre impair : une équipe pas encore exempte le sera.'}
            </p>
          ) : (
            <>
              <p>
                Tirage au sort de {inPlay} équipe{inPlay > 1 ? 's' : ''} pointée{inPlay > 1 ? 's' : ''}, une planche par match.
                {inPlay % 2 === 1 && ' Nombre impair : une équipe sera exempte.'}
              </p>
              <p>
                Ensuite, le pointage et les inscriptions sont clos.
                {missing > 0 && ` ${missing} inscrite${missing > 1 ? 's' : ''} non pointée${missing > 1 ? 's' : ''} ne jouera pas.`}
              </p>
            </>
          )}
        </ConfirmDialog>
      )}

      {dialog?.kind === 'remove' && (
        <ConfirmDialog
          title={`Retirer la partie ${dialog.round} ?`}
          confirmLabel={`Retirer la partie ${dialog.round}`}
          danger
          onConfirm={() => void remove(dialog.round)}
          onCancel={() => setDialog(null)}
        >
          <p>{dialog.warning.replace(/ Confirmez pour la retirer\.$/, '')}</p>
          <p>Cette action est irréversible : les scores effacés devront être ressaisis. Le journal en garde la trace.</p>
        </ConfirmDialog>
      )}

      {dialog?.kind === 'forfeit' && (
        <ConfirmDialog
          title={`Déclarer « ${dialog.team.name} » forfait ?`}
          confirmLabel="Déclarer forfait"
          danger
          onConfirm={() => void send({ type: 'declareForfeit', teamId: dialog.team.id }, `« ${dialog.team.name} » est déclarée forfait.`)}
          onCancel={() => setDialog(null)}
        >
          <p>Ses matchs sans score sont gagnés 13-0 par l’adversaire, et elle ne sera plus tirée. Elle passe en bas du classement.</p>
          <p>Le forfait peut être annulé tant que la partie suivante n’est pas lancée.</p>
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
        Partie {round.round} / {POOL_ROUNDS} : <strong>{done} / {total}</strong> scores saisis
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

export function MatchList<M extends ScorableMatch>({
  matches,
  editing,
  onEdit,
  onCancel,
  onSave,
}: {
  matches: M[]
  editing: string | null
  onEdit: (id: string) => void
  onCancel: () => void
  onSave: (match: M, a: number | null, b: number | null) => Promise<string | null>
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
              aria-label={`${m.board ? `Planche ${m.board}` : 'Sans planche'} : ${m.teamA.name} contre ${m.teamB.name}, ${m.score ? `${m.score.a}-${m.score.b}${m.forfeit ? ' par forfait' : ''}, corriger` : 'saisir le score'}`}
            >
              <span className="pool-board">{m.board ?? '–'}</span>
              <span className={`pool-team${m.score && m.score.a > m.score.b ? ' is-winner' : ''}`}>{m.teamA.name}</span>
              <span className="pool-score">
                {m.score ? `${m.score.a} - ${m.score.b}` : <span className="badge badge-wait">sans score</span>}
                {m.forfeit && <span className="badge badge-forfeit">forfait</span>}
              </span>
              <span className={`pool-team pool-team-b${m.score && m.score.b > m.score.a ? ' is-winner' : ''}`}>{m.teamB.name}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  )
}

function ScoreEditor<M extends ScorableMatch>({
  match,
  onCancel,
  onSave,
}: {
  match: M
  onCancel: () => void
  onSave: (match: M, a: number | null, b: number | null) => Promise<string | null>
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

function Standings({
  standings,
  onForfeit,
  onCancelForfeit,
}: {
  standings: PoolStanding[]
  onForfeit: (team: PoolTeamRef) => void
  onCancelForfeit: (team: PoolTeamRef) => void
}) {
  return (
    <section className="panel">
      <h2>Classement des poules</h2>
      <p className="muted small">Victoires, puis points pour, puis différence, puis points contre. Les équipes forfait sont classées en dernier.</p>
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
              <th scope="col">
                <span className="visually-hidden">Forfait</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.team.id} className={s.forfeit ? 'is-forfeit' : undefined}>
                <td>{s.rank}</td>
                <td className="left">
                  {s.team.name}
                  {s.forfeit && <span className="badge badge-forfeit">forfait</span>}
                </td>
                <td>{s.played}</td>
                <td>
                  <strong>{s.wins}</strong>
                </td>
                <td>{s.losses}</td>
                <td>{s.pointsFor}</td>
                <td>{s.pointsAgainst}</td>
                <td>{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
                <td>
                  {s.forfeit ? (
                    <button type="button" className="btn btn-small" onClick={() => onCancelForfeit(s.team)} aria-label={`Annuler le forfait de ${s.team.name}`}>
                      Annuler
                    </button>
                  ) : (
                    <button type="button" className="btn btn-small btn-danger-outline" onClick={() => onForfeit(s.team)} aria-label={`Déclarer ${s.team.name} forfait`}>
                      Forfait
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
