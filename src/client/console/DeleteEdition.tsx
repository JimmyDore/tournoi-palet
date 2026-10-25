import { useState } from 'react'
import type { AdminView } from '../../engine/index.ts'
import { postJson } from '../api.ts'
import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import { navigate } from '../router.tsx'

/** Bas de l'onglet Réglages d'une édition de test : la supprimer pour faire le ménage. */
export function DeleteEdition({ view }: { view: AdminView }) {
  const [confirm, setConfirm] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const remove = async () => {
    setConfirm(false)
    const result = await postJson<{ ok: true }>(`/api/admin/editions/${encodeURIComponent(view.id)}/delete`, {})
    if (result.ok) navigate('/console')
    else setRefusal(result.reason)
  }

  return (
    <section className="panel">
      <h2>Supprimer cette édition de test</h2>
      <p className="muted">Pour faire le ménage après une répétition. Une vraie édition ne se supprime pas.</p>
      {refusal && (
        <p className="refusal" role="alert">
          {refusal}
        </p>
      )}
      <div className="actions">
        <button type="button" className="btn btn-danger-outline" onClick={() => setConfirm(true)}>
          Supprimer l'édition
        </button>
      </div>
      {confirm && (
        <ConfirmDialog title={`Supprimer « ${view.settings.name} » ?`} confirmLabel="Oui, supprimer" danger onConfirm={() => void remove()} onCancel={() => setConfirm(false)}>
          <p>Équipes, scores, tableaux et journal sont effacés définitivement. Les autres PC ouverts sur cette édition la verront disparaître.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}
