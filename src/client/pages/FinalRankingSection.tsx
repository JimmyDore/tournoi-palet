import type { PublicView } from '../../engine/index.ts'

/** Classement final (téléphone) : provisoire pendant les tableaux, avec le lot de chaque place s'il y en a. */
export function FinalRankingSection({ view, teamId }: { view: PublicView; teamId: string | null }) {
  const { rows, finished } = view.ranking
  if (rows.length === 0) return null
  const withPrizes = rows.some((r) => r.prize !== null)
  return (
    <section className="card" aria-label="Classement final">
      <h2 className="card-title">{finished ? 'Classement final' : 'Classement final provisoire'}</h2>
      {!finished && <p className="muted small">Les places en gris peuvent encore changer.</p>}
      <table className="phone-standings phone-ranking">
        <thead>
          <tr>
            <th className="rank">#</th>
            <th className="name">Équipe</th>
            {withPrizes && <th className="name">Lot</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team.id} className={[r.team.id === teamId && 'is-mine', !r.definitive && 'is-provisional'].filter(Boolean).join(' ') || undefined}>
              <td className="rank">{r.place}</td>
              <td className="name">{r.team.name}</td>
              {withPrizes && <td className="name prize">{r.prize ?? ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
