import { useEffect, useState, type FormEvent } from 'react'
import type { AdminView } from '../../engine/index.ts'
import { sendCommand } from '../api.ts'

interface Row {
  range: string
  label: string
}

const toRows = (view: AdminView): Row[] => view.prizes.ranges.map(({ range, label }) => ({ range, label }))
const blank = (r: Row) => !r.range.trim() && !r.label.trim()

/**
 * Lots, dans l'onglet Réglages : des tranches de places (« 1 », « 5-16 »)
 * et leur lot. Toute la liste est enregistrée d'un coup ; le moteur refuse
 * les tranches illisibles ou qui se chevauchent. Modifiable à tout moment.
 */
export function PrizesEditor({ view }: { view: AdminView }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(view))
  const [dirty, setDirty] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Un autre PC a modifié les lots : on suit, sauf saisie en cours.
  useEffect(() => {
    if (!dirty) setRows(toRows(view))
  }, [view.prizes, dirty])

  const edit = (next: Row[]) => {
    setRows(next)
    setDirty(true)
    setSaved(false)
  }
  const change = (i: number, key: keyof Row, value: string) => edit(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await sendCommand(view.id, { type: 'setPrizes', prizes: rows.filter((r) => !blank(r)) })
    if (result.ok) {
      setRefusal(null)
      setDirty(false)
      setSaved(true)
      setRows(toRows(result.view))
    } else setRefusal(result.reason)
  }

  const { uncovered, places } = view.prizes
  return (
    <form className="panel" onSubmit={submit} noValidate aria-label="Lots">
      <h2>Lots</h2>
      <p className="muted small">Une ligne par tranche de places : « 1 » pour une seule place, « 5-16 » pour les places 5 à 16. Modifiable jusqu’au dernier moment.</p>
      {rows.length === 0 ? (
        <p className="muted">Aucun lot saisi.</p>
      ) : (
        <ul className="prize-rows">
          {rows.map((row, i) => (
            <li key={i} className="prize-row">
              <label className="field prize-range">
                <span>Places</span>
                <input value={row.range} placeholder="5-16" inputMode="numeric" onChange={(e) => change(i, 'range', e.target.value)} />
              </label>
              <label className="field prize-label">
                <span>Lot</span>
                <input value={row.label} placeholder="Un saucisson" onChange={(e) => change(i, 'label', e.target.value)} />
              </label>
              <button type="button" className="btn btn-small btn-danger-outline" aria-label={`Supprimer la ligne ${row.range || i + 1}`} onClick={() => edit(rows.filter((_, j) => j !== i))}>
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="button" className="btn" onClick={() => edit([...rows, { range: nextRange(rows), label: '' }])}>
          Ajouter une tranche
        </button>
      </div>

      {places > 0 && !dirty && (
        uncovered.length > 0 ? (
          <p className="pool-missing" role="status">
            Places sans lot (sur {places}) : {uncovered.join(', ')}.
          </p>
        ) : (
          view.prizes.ranges.length > 0 && <p className="muted small">Les {places} places ont un lot.</p>
        )
      )}
      {refusal && <p className="refusal" role="alert">{refusal}</p>}
      {saved && !dirty && <p className="success" role="status">Lots enregistrés.</p>}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={!dirty}>
          Enregistrer les lots
        </button>
        {dirty && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setRows(toRows(view))
              setDirty(false)
              setRefusal(null)
            }}
          >
            Annuler les modifications
          </button>
        )}
      </div>
    </form>
  )
}

/** Proposition pour la ligne ajoutée : la place qui suit la dernière tranche. */
function nextRange(rows: Row[]): string {
  const last = Math.max(0, ...rows.map((r) => Number(/(\d+)\s*$/.exec(r.range)?.[1] ?? 0)))
  return String(last + 1)
}
