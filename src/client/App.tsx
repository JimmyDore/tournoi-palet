import { useEffect, useState } from 'react'
import logo from '../../assets/logo-cjvhb.png'

type Status = 'en attente' | 'ok' | 'erreur'

export function App() {
  const [database, setDatabase] = useState<Status>('en attente')
  const [socket, setSocket] = useState<Status>('en attente')

  useEffect(() => {
    fetch('/health')
      .then((res) => res.json())
      .then((body: { database?: string }) => setDatabase(body.database === 'ok' ? 'ok' : 'erreur'))
      .catch(() => setDatabase('erreur'))

    // URL dérivée de la page : wss:// en production derrière Caddy.
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    ws.onmessage = () => setSocket('ok')
    ws.onerror = () => setSocket('erreur')
    return () => ws.close()
  }, [])

  return (
    <main className="hello">
      <img src={logo} alt="Logo du CJVHB" className="logo" />
      <h1>Concours de Palets du CJVHB</h1>
      <p>Le site arrive bientôt.</p>
      <ul className="status">
        <li>Base de données : {database}</li>
        <li>Temps réel : {socket}</li>
      </ul>
    </main>
  )
}
