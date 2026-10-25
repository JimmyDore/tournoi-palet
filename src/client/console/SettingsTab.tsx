import { useEffect, useState, type FormEvent } from 'react'
import { MAX_TEAMS_LIMIT, type EditionSettings } from '../../engine/index.ts'
import { sendCommand } from '../api.ts'
import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import { PrizesEditor } from './PrizesEditor.tsx'
import type { TabProps } from './tabs.tsx'

/** Réglages choisis dans une liste ou par une case : gardés tels quels. */
type Choices = Pick<EditionSettings, 'isTest' | 'bracketFirstRound' | 'bracketPace' | 'splitRule'>

/** Le formulaire garde des chaînes ; le moteur valide et refuse au besoin. */
type Form = Record<Exclude<keyof EditionSettings, 'byeScore' | keyof Choices>, string> &
  Choices & {
    byeWinner: string
    byeLoser: string
  }

function toForm(s: EditionSettings): Form {
  return {
    name: s.name,
    date: s.date,
    arrivalTime: s.arrivalTime,
    startTime: s.startTime,
    venue: s.venue,
    price: String(s.price),
    contact: s.contact,
    boards: String(s.boards),
    maxTeams: String(s.maxTeams),
    gameMinutes: String(s.gameMinutes),
    byeWinner: String(s.byeScore.winner),
    byeLoser: String(s.byeScore.loser),
    isTest: s.isTest,
    bracketFirstRound: s.bracketFirstRound,
    bracketPace: s.bracketPace,
    splitRule: s.splitRule,
  }
}

const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v.replace(',', '.')))

function toSettings(f: Form): EditionSettings {
  return {
    name: f.name,
    date: f.date,
    arrivalTime: f.arrivalTime,
    startTime: f.startTime,
    venue: f.venue,
    price: num(f.price),
    contact: f.contact,
    boards: num(f.boards),
    maxTeams: num(f.maxTeams),
    gameMinutes: num(f.gameMinutes),
    byeScore: { winner: num(f.byeWinner), loser: num(f.byeLoser) },
    isTest: f.isTest,
    bracketFirstRound: f.bracketFirstRound,
    bracketPace: f.bracketPace,
    splitRule: f.splitRule,
  }
}

export function SettingsTab({ view }: TabProps) {
  const [form, setForm] = useState<Form>(() => toForm(view.settings))
  const [dirty, setDirty] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmPublic, setConfirmPublic] = useState(false)

  // Un autre PC a modifié les réglages : on suit, sauf saisie en cours.
  useEffect(() => {
    if (!dirty) setForm(toForm(view.settings))
  }, [view.settings, dirty])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setDirty(true)
    setSaved(false)
  }

  const save = async () => {
    setConfirmPublic(false)
    const result = await sendCommand(view.id, { type: 'updateEdition', changes: toSettings(form) })
    if (result.ok) {
      setRefusal(null)
      setDirty(false)
      setSaved(true)
      setForm(toForm(result.view.settings))
    } else setRefusal(result.reason)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (view.settings.isTest && !form.isTest) setConfirmPublic(true)
    else void save()
  }

  const text = (key: 'name' | 'venue' | 'contact', label: string, placeholder?: string) => (
    <label className="field">
      <span>{label}</span>
      <input value={form[key]} placeholder={placeholder} onChange={(e) => set(key, e.target.value)} />
    </label>
  )
  const number = (key: 'price' | 'boards' | 'maxTeams' | 'gameMinutes' | 'byeWinner' | 'byeLoser', label: string, attrs: object = {}) => (
    <label className="field">
      <span>{label}</span>
      <input type="number" inputMode="decimal" value={form[key]} onChange={(e) => set(key, e.target.value)} {...attrs} />
    </label>
  )

  return (
    <div className="stack">
    {/* noValidate : c'est le moteur qui valide, et la console affiche son refus. */}
    <form className="panel" onSubmit={submit} noValidate>
      <h2>Infos pratiques</h2>
      <div className="grid">
        {text('name', 'Nom')}
        <label className="field">
          <span>Date</span>
          <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </label>
        <label className="field">
          <span>Accueil</span>
          <input type="time" value={form.arrivalTime} onChange={(e) => set('arrivalTime', e.target.value)} />
        </label>
        <label className="field">
          <span>Début</span>
          <input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
        </label>
        {text('venue', 'Lieu')}
        {number('price', 'Tarif par doublette (€)', { min: 0, step: '0.5' })}
        {text('contact', 'Contact (inscriptions)', 'Jean, 06 …')}
      </div>

      <h2>Tournoi</h2>
      <div className="grid">
        {number('boards', 'Planches', { min: 1 })}
        {number('maxTeams', "Plafond d'équipes", { min: 2, max: MAX_TEAMS_LIMIT })}
        {number('gameMinutes', "Durée indicative d'une partie (min)", { min: 1 })}
        <fieldset className="field field-pair">
          <legend>Score d'exempt en poule</legend>
          <div className="pair">
            <input type="number" aria-label="Score de l'exempt" value={form.byeWinner} onChange={(e) => set('byeWinner', e.target.value)} />
            <span>à</span>
            <input type="number" aria-label="Score de l'adversaire fictif" value={form.byeLoser} onChange={(e) => set('byeLoser', e.target.value)} />
          </div>
        </fieldset>
        <label className="field">
          <span>Premier tour des tableaux</span>
          <select value={form.bracketFirstRound} onChange={(e) => set('bracketFirstRound', e.target.value as Form['bracketFirstRound'])}>
            <option value="seeded">Têtes de série</option>
            <option value="random">Tirage au sort</option>
          </select>
        </label>
        <label className="field">
          <span>Rythme des tableaux</span>
          <select value={form.bracketPace} onChange={(e) => set('bracketPace', e.target.value as Form['bracketPace'])}>
            <option value="synchronized">Tours synchronisés (le tour suivant part quand le tour est fini)</option>
            <option value="asReady">Au fil de l’eau (un match part dès que ses deux équipes sont connues)</option>
          </select>
        </label>
        <label className="field">
          <span>Répartition proposée</span>
          <select value={form.splitRule} onChange={(e) => set('splitRule', e.target.value as Form['splitRule'])}>
            <option value="twoThirds">2/3 des équipes en Principal</option>
            <option value="fullPrincipal">Principal plein : puissance de 2 la plus proche des 2/3 (48 → 32, 52 → 32)</option>
          </select>
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.isTest} onChange={(e) => set('isTest', e.target.checked)} />
        <span>Édition de test (jamais visible publiquement)</span>
      </label>

      {refusal && <p className="refusal" role="alert">{refusal}</p>}
      {saved && !dirty && <p className="success" role="status">Réglages enregistrés.</p>}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={!dirty}>
          Enregistrer
        </button>
        {dirty && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setForm(toForm(view.settings))
              setDirty(false)
              setRefusal(null)
            }}
          >
            Annuler les modifications
          </button>
        )}
      </div>

      {confirmPublic && (
        <ConfirmDialog
          title="Rendre l'édition publique ?"
          confirmLabel="Oui, la rendre publique"
          onConfirm={() => void save()}
          onCancel={() => setConfirmPublic(false)}
        >
          <p>Elle ne sera plus une édition de test : elle apparaîtra sur le site public et dans le palmarès.</p>
        </ConfirmDialog>
      )}
    </form>
    <PrizesEditor view={view} />
    </div>
  )
}
