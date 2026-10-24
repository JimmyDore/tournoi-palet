import { useRef, useState, type FormEvent } from 'react'
import { teamName, teamWarnings, type AdminTeam, type TeamFields } from '../../engine/index.ts'
import { sendCommand } from '../api.ts'
import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import type { TabProps } from './tabs.tsx'

const EMPTY: TeamFields = { name: '', player1: '', player2: '', player1Licensed: false, player2Licensed: false, phone: '', comment: '' }

function fieldsOf(team: AdminTeam): TeamFields {
  const { customName, player1, player2, player1Licensed, player2Licensed, phone, comment } = team
  return { name: customName, player1, player2, player1Licensed, player2Licensed, phone, comment }
}

/** Onglet « Équipes » : inscriptions, modifications, désinscriptions, liste d'attente. */
export function TeamsTab({ view }: TabProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [withdrawing, setWithdrawing] = useState<AdminTeam | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const registered = view.teams.filter((t) => t.status === 'registered')
  const waitlist = view.teams.filter((t) => t.status === 'waitlist')

  const register = async (fields: TeamFields) => {
    const result = await sendCommand(view.id, { type: 'registerTeam', team: fields })
    if (!result.ok) return result.reason
    const team = result.view.teams.find((t) => !view.teams.some((old) => old.id === t.id))
    setMessage(
      team && team.status === 'waitlist'
        ? `« ${team.name} » est en liste d'attente (${team.waitlistPosition === 1 ? '1re' : `${team.waitlistPosition}e`}).`
        : `« ${team?.name ?? teamName(fields)} » est inscrite.`,
    )
    return null
  }

  const update = async (team: AdminTeam, fields: TeamFields) => {
    const result = await sendCommand(view.id, { type: 'updateTeam', teamId: team.id, changes: fields })
    if (!result.ok) return result.reason
    setEditing(null)
    setMessage(null)
    return null
  }

  const withdraw = async (team: AdminTeam) => {
    setWithdrawing(null)
    const result = await sendCommand(view.id, { type: 'withdrawTeam', teamId: team.id })
    if (!result.ok) return setRefusal(result.reason)
    setRefusal(null)
    const promoted = result.view.teams.filter((t) => t.status === 'registered' && waitlist.some((w) => w.id === t.id))
    setMessage(
      `« ${team.name} » est désinscrite.` + (promoted.length ? ` ${promoted.map((t) => `« ${t.name} »`).join(', ')} remonte de la liste d'attente.` : ''),
    )
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Inscrire une équipe</h2>
        <p className="counts" role="status">
          <strong>
            {view.registeredCount} / {view.settings.maxTeams}
          </strong>{' '}
          inscrites · {view.placesLeft} {view.placesLeft > 1 ? 'places restantes' : 'place restante'}
          {view.waitlistCount > 0 && ` · ${view.waitlistCount} en liste d'attente`}
        </p>
        {view.placesLeft === 0 && <p className="hint">Le plafond est atteint : une nouvelle équipe passera en liste d'attente.</p>}
        <TeamForm initial={EMPTY} resetOnSuccess submitLabel="Inscrire" onSubmit={register} onChange={() => setMessage(null)} />
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
      </section>

      {refusal && (
        <p className="refusal" role="alert">
          {refusal}
        </p>
      )}

      <TeamList
        title={`Inscrites (${registered.length})`}
        empty="Aucune équipe inscrite pour l'instant."
        teams={registered}
        editing={editing}
        onEdit={setEditing}
        onUpdate={update}
        onWithdraw={setWithdrawing}
      />
      {waitlist.length > 0 && (
        <TeamList
          title={`Liste d'attente (${waitlist.length})`}
          hint="Dans l'ordre : la première remonte automatiquement dès qu'une place se libère."
          teams={waitlist}
          editing={editing}
          onEdit={setEditing}
          onUpdate={update}
          onWithdraw={setWithdrawing}
        />
      )}

      {withdrawing && (
        <ConfirmDialog
          title={`Désinscrire « ${withdrawing.name} » ?`}
          confirmLabel="Oui, désinscrire"
          danger
          onConfirm={() => void withdraw(withdrawing)}
          onCancel={() => setWithdrawing(null)}
        >
          <p>L'équipe disparaît de la liste{withdrawing.status === 'registered' && waitlist.length > 0 ? ` et « ${waitlist[0].name} » prend sa place` : ''}.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

function TeamList({
  title,
  hint,
  empty,
  teams,
  editing,
  onEdit,
  onUpdate,
  onWithdraw,
}: {
  title: string
  hint?: string
  empty?: string
  teams: AdminTeam[]
  editing: string | null
  onEdit: (id: string | null) => void
  onUpdate: (team: AdminTeam, fields: TeamFields) => Promise<string | null>
  onWithdraw: (team: AdminTeam) => void
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {hint && <p className="muted">{hint}</p>}
      {teams.length === 0 && empty && <p className="muted">{empty}</p>}
      <ol className="team-list">
        {teams.map((team, i) => (
          <li key={team.id} className="team-row">
            <span className="team-rank">{i + 1}</span>
            {editing === team.id ? (
              <div className="team-edit">
                <TeamForm
                  initial={fieldsOf(team)}
                  submitLabel="Enregistrer"
                  onSubmit={(fields) => onUpdate(team, fields)}
                  onCancel={() => onEdit(null)}
                />
              </div>
            ) : (
              <>
                <div className="team-main">
                  <span className="team-name">{team.name}</span>
                  <span className="team-players">
                    {team.player1}
                    {team.player1Licensed && <span className="badge badge-licence">licencié</span>} · {team.player2}
                    {team.player2Licensed && <span className="badge badge-licence">licencié</span>}
                  </span>
                  {(team.phone || team.comment) && (
                    <span className="team-extra muted">{[team.phone && `Tél. ${team.phone}`, team.comment].filter(Boolean).join(' · ')}</span>
                  )}
                  {team.warnings.map((w) => (
                    <span key={w} className="warning">
                      {w}
                    </span>
                  ))}
                </div>
                <div className="team-actions">
                  <button type="button" className="btn btn-small" onClick={() => onEdit(team.id)}>
                    Modifier
                  </button>
                  <button type="button" className="btn btn-small btn-danger-outline" onClick={() => onWithdraw(team)}>
                    Désinscrire
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Fiche équipe ; le moteur valide et la console affiche son refus tel quel. */
function TeamForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  onChange,
  resetOnSuccess = false,
}: {
  initial: TeamFields
  /** Vide le formulaire après succès (inscription à la chaîne). */
  resetOnSuccess?: boolean
  submitLabel: string
  onSubmit: (fields: TeamFields) => Promise<string | null>
  onCancel?: () => void
  onChange?: () => void
}) {
  const [form, setForm] = useState<TeamFields>(initial)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const firstRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof TeamFields>(key: K, value: TeamFields[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    onChange?.()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const reason = await onSubmit(form)
    setBusy(false)
    setRefusal(reason)
    if (reason === null && resetOnSuccess) {
      setForm(initial)
      firstRef.current?.focus()
    }
  }

  const defaultName = form.player1.trim() && form.player2.trim() ? teamName({ name: '', player1: form.player1.trim(), player2: form.player2.trim() }) : 'Joueur1 & Joueur2'
  const player = (n: 1 | 2) => {
    const key = n === 1 ? 'player1' : 'player2'
    const licensed = n === 1 ? 'player1Licensed' : 'player2Licensed'
    return (
      <div className="field player-field">
        <label className="field">
          <span>Joueur {n}</span>
          <input ref={n === 1 ? firstRef : undefined} value={form[key]} onChange={(e) => set(key, e.target.value)} autoComplete="off" />
        </label>
        <label className="check check-inline">
          <input type="checkbox" checked={form[licensed]} onChange={(e) => set(licensed, e.target.checked)} />
          <span>licencié</span>
        </label>
      </div>
    )
  }

  return (
    // noValidate : c'est le moteur qui valide.
    <form className="team-form" onSubmit={submit} noValidate>
      <div className="grid">
        {player(1)}
        {player(2)}
        <label className="field">
          <span>Nom d'équipe (facultatif)</span>
          <input value={form.name} placeholder={defaultName} onChange={(e) => set('name', e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span>Téléphone (facultatif)</span>
          <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="off" />
        </label>
        <label className="field field-wide">
          <span>Commentaire</span>
          <input value={form.comment} onChange={(e) => set('comment', e.target.value)} autoComplete="off" />
        </label>
      </div>
      {teamWarnings(form).map((w) => (
        <p key={w} className="warning" role="status">
          {w} L'inscription reste possible.
        </p>
      ))}
      {refusal && (
        <p className="refusal" role="alert">
          {refusal}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </form>
  )
}
