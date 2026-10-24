import { useEffect, useState } from 'react'
import { clockReading, type ClockState } from '../../engine/index.ts'
import { serverNow } from '../live.ts'

/** Heure du serveur, rafraîchie plusieurs fois par seconde tant que `active`. */
export function useServerNow(active = true): number {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    if (!active) return
    setNow(serverNow())
    const timer = setInterval(() => setNow(serverNow()), 250)
    return () => clearInterval(timer)
  }, [active])
  return now
}

/**
 * Chrono de la partie : temps restant, alerte dans les 5 dernières minutes,
 * dépassement en rouge (« +2:13 »). Le style dépend de `className`
 * (télé, téléphone, console) ; l'état est porté par `data-state`.
 */
export function ClockDisplay({ clock, className }: { clock: ClockState; className: string }) {
  const now = useServerNow(clock.stoppedAt === null)
  const reading = clockReading(clock, now)
  const label = !reading.running ? 'Chrono arrêté' : reading.state === 'overtime' ? 'Temps dépassé' : 'Temps restant'
  return (
    <div className={`clock ${className}`} data-state={reading.state} data-running={reading.running} role="timer" aria-label={`${label} : ${reading.text}`}>
      <span className="clock-label">{label}</span>
      <span className="clock-time">{reading.text}</span>
    </div>
  )
}
