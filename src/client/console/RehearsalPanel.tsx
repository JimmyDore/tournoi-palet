import { useState, type FormEvent } from 'react'
import { MAX_TEAMS_LIMIT, type AdminView } from '../../engine/index.ts'
import { sendCommand } from '../api.ts'

/**
 * Panneau « Répétition générale », affiché seulement sur une édition de test :
 * générer des équipes fictives déjà pointées, puis remplir au hasard les
 * scores de la partie en cours, puis ceux des matchs de tableau lancés. Le moteur refuse tout sur une vraie édition.
 */
export function RehearsalPanel({ view }: { view: AdminView }) {
  const [count, setCount] = useState('32')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (!view.settings.isTest) return null

  const started = view.pool.currentRound !== null
  const current = view.pool.rounds.at(-1)
  const open = current?.awaitingScore.length ?? 0
  const inBrackets = view.brackets.live.length
  const room = MAX_TEAMS_LIMIT - view.teams.length

  const send = async (command: Parameters<typeof sendCommand>[1], success: string) => {
    setBusy(true)
    const result = await sendCommand(view.id, command)
    setBusy(false)
    if (!result.ok) {
      setMessage(null)
      return setRefusal(result.reason)
    }
    setRefusal(null)
    setMessage(success)
  }

  const generate = (event: FormEvent) => {
    event.preventDefault()
    const n = Number(count.trim())
    void send({ type: 'generateFakeTeams', count: n }, `${n} équipe${n > 1 ? 's' : ''} fictive${n > 1 ? 's' : ''} inscrite${n > 1 ? 's' : ''} et pointée${n > 1 ? 's' : ''}.`)
  }

  return (
    <section className="panel rehearsal" aria-labelledby="rehearsal-title">
      <h2 id="rehearsal-title">
        Répétition générale <span className="badge badge-test">test</span>
      </h2>
      <p className="muted small">Pour s’entraîner : rien de tout cela n’est possible sur une vraie édition.</p>
      {!started ? (
        <form className="rehearsal-row" onSubmit={generate} noValidate>
          <label className="field">
            Équipes fictives
            <input type="number" inputMode="numeric" min={1} max={room} value={count} onChange={(e) => setCount(e.target.value)} />
          </label>
          <button type="submit" className="btn" disabled={busy}>
            Générer les équipes
          </button>
          <p className="muted small">
            {view.teams.length} équipe{view.teams.length > 1 ? 's' : ''} déjà là, {MAX_TEAMS_LIMIT} au plus. Elles arrivent déjà pointées ; le plafond est relevé si besoin.
          </p>
        </form>
      ) : view.brackets.generated ? (
        <div className="rehearsal-row">
          <button
            type="button"
            className="btn"
            disabled={busy || inBrackets === 0}
            onClick={() => void send({ type: 'fillRandomScores' }, `Tableaux : ${inBrackets} score${inBrackets > 1 ? 's' : ''} rempli${inBrackets > 1 ? 's' : ''} au hasard.`)}
          >
            Remplir les scores des matchs en cours
          </button>
          <p className="muted small">
            {inBrackets > 0
              ? `${inBrackets} match${inBrackets > 1 ? 's' : ''} lancé${inBrackets > 1 ? 's' : ''} sans score (sur planche ou en attente), remplis au hasard ; les tours qu’ils complètent sont lancés aussitôt.`
              : 'Tous les matchs des tableaux sont joués.'}
          </p>
        </div>
      ) : (
        <div className="rehearsal-row">
          <button
            type="button"
            className="btn"
            disabled={busy || open === 0}
            onClick={() => void send({ type: 'fillRandomScores' }, `Partie ${current!.round} : ${open} score${open > 1 ? 's' : ''} rempli${open > 1 ? 's' : ''} au hasard.`)}
          >
            Remplir les scores de la partie {current!.round}
          </button>
          <p className="muted small">
            {open > 0 ? `${open} match${open > 1 ? 's' : ''} sans score, remplis au hasard (parfois gagnés à moins de 13).` : 'Tous les scores de la partie sont saisis.'}
          </p>
        </div>
      )}
      {refusal && (
        <p className="refusal" role="alert">
          {refusal}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
    </section>
  )
}
