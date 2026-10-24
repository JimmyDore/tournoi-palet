import { useState } from 'react'
import type { AdminView } from '../../engine/index.ts'
import { sendCommand } from '../api.ts'
import { ClockDisplay } from '../components/Clock.tsx'
import { ConfirmDialog } from '../components/ConfirmDialog.tsx'

/**
 * Chrono de la partie ou du tour : lancer, arrêter, relancer. Indicatif, il
 * ne bloque aucune saisie. Utilisé par l'onglet Poules (et les tableaux).
 */
export function ClockControls({ view }: { view: AdminView }) {
  const clock = view.clock
  const running = clock !== null && clock.stoppedAt === null
  const [minutes, setMinutes] = useState('')
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const duration = minutes.trim() === '' ? view.settings.gameMinutes : Number(minutes.trim().replace(',', '.'))

  const send = async (command: Parameters<typeof sendCommand>[1]) => {
    setConfirmRestart(false)
    const result = await sendCommand(view.id, command)
    setRefusal(result.ok ? null : result.reason)
  }
  // Une saisie illisible part telle quelle : le moteur la refuse avec un message clair.
  const start = () => void send({ type: 'startClock', durationMin: Number.isFinite(duration) ? duration : (minutes as unknown as number) })

  return (
    <section className="panel clock-panel" aria-label="Chrono">
      <div className="clock-panel-row">
        {clock ? <ClockDisplay clock={clock} className="clock-console" /> : <p className="muted clock-idle">Chrono pas encore lancé</p>}
        <label className="clock-duration">
          Durée
          <input
            inputMode="numeric"
            value={minutes}
            placeholder={String(view.settings.gameMinutes)}
            onChange={(e) => setMinutes(e.target.value)}
            aria-label="Durée du chrono en minutes"
          />
          min
        </label>
        <div className="actions">
          {!clock && (
            <button type="button" className="btn btn-primary" onClick={start}>
              Lancer le chrono
            </button>
          )}
          {running && (
            <button type="button" className="btn" onClick={() => void send({ type: 'stopClock' })}>
              Arrêter
            </button>
          )}
          {clock && (
            <button type="button" className={`btn${running ? '' : ' btn-primary'}`} onClick={() => (running ? setConfirmRestart(true) : start())}>
              Relancer
            </button>
          )}
        </div>
      </div>
      {refusal && (
        <p className="refusal" role="alert">
          {refusal}
        </p>
      )}
      {confirmRestart && (
        <ConfirmDialog title="Relancer le chrono ?" confirmLabel={`Relancer (${duration} min)`} onConfirm={start} onCancel={() => setConfirmRestart(false)}>
          <p>Le chrono en cours repart de zéro, pour {duration} minute{duration > 1 ? "s" : ""}. Télé et téléphones suivent aussitôt.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}
