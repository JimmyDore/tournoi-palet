import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { AdminTeam } from '../../engine/index.ts'
import { sendCommand } from '../api.ts'
import { useRefusal } from './useRefusal.ts'
import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import { formatPrice } from '../format.ts'
import type { TabProps } from './tabs.tsx'

/** Minuscules, sans accents : « Bénédicte » se trouve en tapant « bene ». */
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Chaque mot tapé doit se retrouver dans le nom d'équipe ou un prénom de joueur. */
function matches(team: AdminTeam, query: string): boolean {
  const haystack = normalize(`${team.name} ${team.player1} ${team.player2}`)
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}

type PaletsAction = 'lendPalets' | 'cancelPaletsLoan' | 'returnPalets' | 'cancelPaletsReturn'

const hourFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

/**
 * Onglet « Pointage » du jour J : une équipe passe à la table, on la cherche
 * et on coche « arrivée » (le paiement passe par HelloAsso). Une seconde case
 * note les palets prêtés contre caution, rendus en fin de journée.
 */
export function CheckInTab({ view }: TabProps) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [refusal, setRefusal] = useRefusal(view)
  const [message, setMessage] = useState<string | null>(null)
  const [replacing, setReplacing] = useState<AdminTeam | null>(null)
  const [showOut, setShowOut] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => searchRef.current?.focus(), [])

  const deposit = formatPrice(view.settings.deposit)
  const registered = view.teams.filter((t) => t.status === 'registered')
  const missing = registered.filter((t) => t.checkedInAt === null)
  const checkedIn = registered.filter((t) => t.checkedInAt !== null)
  const waitlist = view.teams.filter((t) => t.status === 'waitlist')
  const results = query.trim() ? view.teams.filter((t) => matches(t, query)) : []
  const paletsOut = view.teams.filter((t) => t.paletsLentAt !== null && t.paletsReturnedAt === null)

  const toggle = async (team: AdminTeam) => {
    setBusy(team.id)
    const undo = team.checkedInAt !== null
    const result = await sendCommand(view.id, { type: undo ? 'undoCheckIn' : 'checkInTeam', teamId: team.id })
    setBusy(null)
    if (!result.ok) {
      setMessage(null)
      return setRefusal(result.reason)
    }
    setRefusal(null)
    setMessage(undo ? `Pointage de « ${team.name} » annulé.` : `« ${team.name} » est pointée : arrivée.`)
    if (!undo) setQuery('')
    searchRef.current?.focus()
  }

  const palets = async (team: AdminTeam, type: PaletsAction) => {
    setBusy(team.id)
    const result = await sendCommand(view.id, { type, teamId: team.id })
    setBusy(null)
    if (!result.ok) {
      setMessage(null)
      return setRefusal(result.reason)
    }
    setRefusal(null)
    setMessage(
      {
        lendPalets: `Palets prêtés à « ${team.name} » : ${deposit} de caution.`,
        cancelPaletsLoan: `Prêt de palets à « ${team.name} » annulé.`,
        returnPalets: `« ${team.name} » a rendu ses palets : ${deposit} à lui rendre.`,
        cancelPaletsReturn: `Rendu des palets de « ${team.name} » annulé.`,
      }[type],
    )
  }

  // Entrée : pointe l'équipe si la recherche n'en trouve qu'une.
  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setRefusal(null)
      setMessage(null)
      return setQuery('')
    }
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (results.length !== 1) {
      setMessage(null)
      return setRefusal(results.length === 0 ? 'Aucune équipe ne correspond.' : `${results.length} équipes correspondent : précisez ou cochez la bonne.`)
    }
    const [team] = results
    if (team.checkedInAt !== null) {
      setRefusal(null)
      return setMessage(`« ${team.name} » est déjà pointée.`)
    }
    void toggle(team)
  }

  const replace = async (team: AdminTeam) => {
    setReplacing(null)
    const result = await sendCommand(view.id, { type: 'replaceAbsentTeam', teamId: team.id })
    if (!result.ok) {
      setMessage(null)
      return setRefusal(result.reason)
    }
    setRefusal(null)
    const promoted = result.view.teams.find((t) => t.status === 'registered' && waitlist.some((w) => w.id === t.id))
    searchRef.current?.focus()
    setMessage(`« ${team.name} » est retirée${promoted ? ` ; « ${promoted.name} » prend sa place, à pointer quand elle passe à la table` : ''}.`)
  }

  const row = (team: AdminTeam) => (
    <CheckInRow
      key={team.id}
      team={team}
      deposit={deposit}
      busy={busy === team.id}
      onToggle={toggle}
      onPalets={palets}
      onReplace={waitlist.length > 0 ? setReplacing : undefined}
    />
  )

  return (
    <div className="stack">
      <section className="panel">
        <h2>Pointage</h2>
        <p className="checkin-count" role="status">
          <strong>
            {checkedIn.length} / {registered.length}
          </strong>{' '}
          pointées · {missing.length} {missing.length > 1 ? 'manquantes' : 'manquante'}
        </p>
        <label className="field">
          <span>Rechercher une équipe ou un joueur</span>
          <input
            ref={searchRef}
            type="search"
            className="checkin-search"
            value={query}
            placeholder="Nom d'équipe ou prénom…"
            onChange={(e) => {
              setQuery(e.target.value)
              setRefusal(null)
            }}
            onKeyDown={onSearchKey}
            autoComplete="off"
            enterKeyHint="done"
          />
        </label>
        <p className="muted small">Entrée pointe l'équipe quand une seule correspond. Échap efface.</p>
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
        {query.trim() && (
          <>
            {results.length === 0 && <p className="muted">Aucune équipe ne correspond.</p>}
            <ul className="team-list">{results.map(row)}</ul>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Palets prêtés</h2>
        <p className="checkin-count" role="status">
          <strong>{view.palets.out}</strong> à rendre
          <span className="muted">
            {' '}
            · {view.palets.lent} {view.palets.lent > 1 ? 'jeux prêtés' : 'jeu prêté'} · {view.palets.returned} {view.palets.returned > 1 ? 'rendus' : 'rendu'} ·{' '}
            <span className="nowrap">{deposit} de caution</span>
          </span>
        </p>
        <p className="muted small">Cochez « palets » quand une équipe emprunte un jeu ; en fin de journée, « Rendu » quand elle le rapporte.</p>
        {paletsOut.length > 0 && (
          <div className="actions">
            <button type="button" className="btn" aria-expanded={showOut} onClick={() => setShowOut(!showOut)}>
              {showOut ? 'Masquer les palets à rendre' : `Voir les palets à rendre (${paletsOut.length})`}
            </button>
          </div>
        )}
        {showOut && paletsOut.length > 0 && <ul className="team-list">{paletsOut.map(row)}</ul>}
      </section>

      <section className="panel">
        <h2>Manquantes ({missing.length})</h2>
        {missing.length === 0 ? (
          <p className="muted">{registered.length ? 'Toutes les équipes inscrites sont pointées.' : 'Aucune équipe inscrite.'}</p>
        ) : (
          <ul className="team-list">{missing.map(row)}</ul>
        )}
      </section>

      {checkedIn.length > 0 && (
        <section className="panel">
          <h2>Pointées ({checkedIn.length})</h2>
          <ul className="team-list">{checkedIn.map(row)}</ul>
        </section>
      )}

      {waitlist.length > 0 && (
        <section className="panel">
          <h2>Liste d'attente ({waitlist.length})</h2>
          <p className="muted">Elles ne peuvent être pointées qu'une fois remontées : remplacez d'abord une équipe absente.</p>
          <ol className="team-list">
            {waitlist.map((team) => (
              <li key={team.id} className="team-row">
                <span className="team-rank">{team.waitlistPosition}</span>
                <TeamLabel team={team} showWaitlist={false} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {replacing && waitlist[0] && (
        <ConfirmDialog
          title={`Remplacer « ${replacing.name} » ?`}
          confirmLabel="Oui, remplacer"
          danger
          onConfirm={() => void replace(replacing)}
          onCancel={() => setReplacing(null)}
        >
          <p>
            « {replacing.name} » est absente : elle est retirée du concours et « {waitlist[0].name} », en tête de la liste d'attente, prend sa place.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}

function TeamLabel({ team, showWaitlist = true }: { team: AdminTeam; showWaitlist?: boolean }) {
  return (
    <div className="team-main">
      <span className="team-name">
        {team.name}
        {showWaitlist && team.status === 'waitlist' && <span className="badge badge-wait">liste d'attente ({team.waitlistPosition === 1 ? '1re' : `${team.waitlistPosition}e`})</span>}
      </span>
      <span className="team-players">
        {team.player1} · {team.player2}
      </span>
      {team.phone && <span className="team-extra muted">Tél. {team.phone}</span>}
    </div>
  )
}

function CheckInRow({
  team,
  deposit,
  busy,
  onToggle,
  onPalets,
  onReplace,
}: {
  team: AdminTeam
  deposit: string
  busy: boolean
  onToggle: (team: AdminTeam) => void
  onPalets: (team: AdminTeam, type: PaletsAction) => void
  onReplace?: (team: AdminTeam) => void
}) {
  const checked = team.checkedInAt !== null
  return (
    <li className={`team-row checkin-row${checked ? ' is-checked' : ''}`}>
      <label className="checkin-box">
        <input type="checkbox" checked={checked} disabled={busy} onChange={() => onToggle(team)} aria-label={`${team.name} : arrivée`} />
        <span>arrivée</span>
      </label>
      <TeamLabel team={team} />
      <div className="team-actions">
        {checked && <span className="muted small">pointée à {hourFormat.format(team.checkedInAt!)}</span>}
        {team.status === 'registered' && <PaletsControl team={team} deposit={deposit} busy={busy} onPalets={onPalets} />}
        {!checked && team.status === 'registered' && onReplace && (
          <button type="button" className="btn btn-small btn-danger-outline" onClick={() => onReplace(team)} aria-label={`${team.name} absente : remplacer`}>
            Absente : remplacer
          </button>
        )}
      </div>
    </li>
  )
}

/** Palets prêtés : case à cocher (prêt ou annulation), puis « Rendu » en fin de journée. */
function PaletsControl({
  team,
  deposit,
  busy,
  onPalets,
}: {
  team: AdminTeam
  deposit: string
  busy: boolean
  onPalets: (team: AdminTeam, type: PaletsAction) => void
}) {
  const lent = team.paletsLentAt !== null
  if (team.paletsReturnedAt !== null) {
    return (
      <span className="palets-control">
        <span className="muted small">palets rendus à {hourFormat.format(team.paletsReturnedAt)}</span>
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => onPalets(team, 'cancelPaletsReturn')} aria-label={`${team.name} : annuler le rendu des palets`}>
          Annuler le rendu
        </button>
      </span>
    )
  }
  return (
    <span className="palets-control">
      <label className="checkin-box palets-box">
        <input
          type="checkbox"
          checked={lent}
          disabled={busy}
          onChange={() => onPalets(team, lent ? 'cancelPaletsLoan' : 'lendPalets')}
          aria-label={`${team.name} : palets prêtés (${deposit} de caution)`}
        />
        <span>palets ({deposit})</span>
      </label>
      {lent && (
        <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => onPalets(team, 'returnPalets')} aria-label={`${team.name} : palets rendus`}>
          Rendu
        </button>
      )}
    </span>
  )
}
