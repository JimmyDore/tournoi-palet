import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { getJson, postJson } from '../api.ts'
import { CLUB_TITLE, Logo } from '../components/Brand.tsx'
import { Link } from '../router.tsx'

/** Garde de la console : affiche le login tant qu'il n'y a pas de session. */
export function ConsoleGate({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    getJson<{ admin: boolean }>('/api/session')
      .then((s) => setAdmin(s.admin))
      .catch(() => setAdmin(false))
    const lost = () => setAdmin(false)
    window.addEventListener('app:unauthorized', lost)
    return () => window.removeEventListener('app:unauthorized', lost)
  }, [])

  if (admin === null) return <ConsoleShell><p className="muted">Chargement…</p></ConsoleShell>
  if (!admin) return <Login onLogin={() => setAdmin(true)} />
  return (
    <ConsoleShell
      onLogout={async () => {
        await postJson('/api/logout', {})
        setAdmin(false)
      }}
    >
      {children}
    </ConsoleShell>
  )
}

function ConsoleShell({ children, onLogout }: { children: ReactNode; onLogout?: () => void }) {
  return (
    <div className="console">
      <header className="console-bar">
        <Link href="/console" className="console-brand">
          <Logo className="console-logo" />
          <span>{CLUB_TITLE} · Console</span>
        </Link>
        {onLogout && (
          <button type="button" className="btn btn-ghost" onClick={onLogout}>
            Se déconnecter
          </button>
        )}
      </header>
      <main className="console-main">{children}</main>
    </div>
  )
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const result = await postJson<{ ok: true }>('/api/login', { password, name })
    setBusy(false)
    if (result.ok) onLogin()
    else setError(result.reason)
  }

  return (
    <ConsoleShell>
      <form className="panel login" onSubmit={submit}>
        <h1>Console organisateur</h1>
        <label className="field">
          <span>Mot de passe</span>
          <input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          <span>Votre prénom (facultatif, noté au journal)</span>
          <input autoComplete="given-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <p className="refusal" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || !password}>
          Se connecter
        </button>
      </form>
    </ConsoleShell>
  )
}
