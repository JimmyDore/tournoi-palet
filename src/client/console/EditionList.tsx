import { useEffect, useState, type FormEvent } from 'react'
import type { AdminView, EditionSummary } from '../../engine/index.ts'
import { getJson, postJson } from '../api.ts'
import { formatDate } from '../format.ts'
import { Link, navigate } from '../router.tsx'

/** `/console` : liste des éditions et création. */
export function EditionList() {
  const [editions, setEditions] = useState<EditionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getJson<EditionSummary[]>('/api/admin/editions')
      .then(setEditions)
      .catch(() => setError('Impossible de charger les éditions.'))
  }, [])

  return (
    <div className="stack">
      <section className="panel">
        <h1>Éditions</h1>
        {error && <p className="refusal" role="alert">{error}</p>}
        {editions && editions.length === 0 && <p className="muted">Aucune édition pour l'instant : créez la première ci-dessous.</p>}
        {editions && editions.length > 0 && (
          <ul className="edition-list">
            {editions.map((e) => (
              <li key={e.id}>
                <Link href={`/console/${e.id}`} className="edition-row">
                  <span className="edition-row-name">{e.name}</span>
                  <span className="muted">{formatDate(e.date)}</span>
                  {e.isTest && <span className="badge badge-test">test</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <CreateEdition />
    </div>
  )
}

function CreateEdition() {
  const year = new Date().getFullYear()
  const [name, setName] = useState(`Concours de Palets ${year}`)
  const [date, setDate] = useState('')
  const [isTest, setIsTest] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const result = await postJson<{ ok: true; id: string; view: AdminView }>('/api/admin/editions', { settings: { name, date, isTest } })
    setBusy(false)
    if (result.ok) navigate(`/console/${result.id}`)
    else setRefusal(result.reason)
  }

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <h2>Nouvelle édition</h2>
      <p className="muted">Les autres réglages (planches, plafond, horaires…) prennent les valeurs habituelles et se modifient ensuite.</p>
      <div className="grid">
        <label className="field">
          <span>Nom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} />
        <span>Édition de test (jamais visible publiquement, pour répéter)</span>
      </label>
      {refusal && <p className="refusal" role="alert">{refusal}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        Créer l'édition
      </button>
    </form>
  )
}
