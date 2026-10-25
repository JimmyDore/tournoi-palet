import { playsIn, type PoolMatchView, type PublicView } from '../../engine/index.ts'

/** Matchs de la partie en cours, par planche (téléphone). */
export function CurrentMatches({ view, teamId }: { view: PublicView; teamId: string | null }) {
  const round = view.pool.rounds.at(-1)
  if (!round) return null
  const scored = round.matches.length - round.awaitingScore.length
  return (
    <section className="card" aria-label="Matchs en cours">
      <h2 className="card-title">Partie {round.round} · matchs</h2>
      <p className="muted small">
        {scored} / {round.matches.length} scores saisis
      </p>
      <ol className="phone-matches">
        {round.matches.map((m) => (
          <PhoneMatch key={m.id} match={m} mine={playsIn(m, teamId)} />
        ))}
      </ol>
      {round.bye && (
        <p className="phone-bye">
          Exempte : <strong>{round.bye.team.name}</strong> (victoire {round.bye.score.a}-{round.bye.score.b})
        </p>
      )}
    </section>
  )
}

function PhoneMatch({ match, mine }: { match: PoolMatchView; mine: boolean }) {
  const { score } = match
  const winner = score ? (score.a > score.b ? 'a' : 'b') : null
  return (
    <li className={`phone-match phone-match-${match.status}${mine ? ' is-mine' : ''}`}>
      <span className="phone-board" aria-label={match.board ? `Planche ${match.board}` : 'En attente de planche'}>
        {match.board ?? '–'}
      </span>
      <span className="phone-teams">
        <span className={winner === 'a' ? 'winner' : undefined}>{match.teamA.name}</span>
        <span className={winner === 'b' ? 'winner' : undefined}>{match.teamB.name}</span>
      </span>
      {score ? (
        <span className="phone-score" title={match.forfeit ? 'Gagné par forfait' : undefined}>
          <span className={winner === 'a' ? 'winner' : undefined}>{score.a}</span>
          <span className={winner === 'b' ? 'winner' : undefined}>{score.b}</span>
          {match.forfeit && <span className="forfeit-tag">forfait</span>}
        </span>
      ) : match.status === 'waiting-board' ? (
        <span className="phone-state">attente</span>
      ) : null}
    </li>
  )
}

/** Classement des poules (téléphone). */
export function PoolStandings({ view, teamId }: { view: PublicView; teamId: string | null }) {
  const rows = view.pool.standings
  if (rows.length === 0) return null
  return (
    <section className="card" aria-label="Classement des poules">
      <h2 className="card-title">Classement des poules</h2>
      <table className="phone-standings">
        <thead>
          <tr>
            <th className="rank">#</th>
            <th className="name">Équipe</th>
            <th title="Victoires">V</th>
            <th title="Points pour">Pour</th>
            <th title="Différence">Diff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.team.id} className={s.team.id === teamId ? 'is-mine' : undefined}>
              <td className="rank">{s.rank}</td>
              <td className="name">
                {s.team.name}
                {s.forfeit && <span className="forfeit-tag"> forfait</span>}
              </td>
              <td className="wins">{s.wins}</td>
              <td>{s.pointsFor}</td>
              <td>{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
