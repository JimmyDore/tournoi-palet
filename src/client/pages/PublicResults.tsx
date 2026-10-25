import { playsIn, type BracketMatchView, type BracketView, type PublicView } from '../../engine/index.ts'
import { rankingStage } from '../format.ts'

/** Vainqueurs des quatre tableaux, en tête de la page d'une édition terminée. */
export function Winners({ view }: { view: PublicView }) {
  const [champion, ...others] = view.brackets.brackets.filter((b) => b.winner)
  if (!champion) return null
  return (
    <section className="card results-winners" aria-label="Vainqueurs">
      <p className="my-team-label">Vainqueur du {champion.name}</p>
      <p className="results-champion">{champion.winner!.name}</p>
      {others.length > 0 && (
        <ul className="results-others">
          {others.map((b) => (
            <li key={b.key}>
              <span className="muted">{b.name} :</span> <strong>{b.winner!.name}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Classement final de 1 à N (téléphone), par blocs ; la colonne Lot n’apparaît que si un lot est renseigné, et le lot seulement sur une place définitive. */
export function FinalRankingCard({ view, teamId }: { view: PublicView; teamId: string | null }) {
  const rows = view.ranking.rows
  if (rows.length === 0) return null
  const withLots = rows.some((r) => r.prize !== null)
  return (
    <section className="card" aria-label="Classement final">
      <h2 className="card-title">Classement final</h2>
      {!view.ranking.finished && <p className="muted small">Provisoire : des matchs restent à jouer.</p>}
      <table className="phone-standings results-ranking">
        <thead>
          <tr>
            <th className="rank">#</th>
            <th className="name">Équipe</th>
            {withLots && <th className="name">Lot</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const startsBlock = i === 0 || rows[i - 1].block !== row.block
            return [
              startsBlock && (
                <tr key={`${row.block}-title`} className="results-block">
                  <th colSpan={withLots ? 3 : 2} scope="colgroup">
                    {row.blockName}
                  </th>
                </tr>
              ),
              <tr key={row.team.id} className={row.team.id === teamId ? 'is-mine' : undefined}>
                <td className="rank">{row.place}</td>
                <td className="name">
                  {row.team.name}
                  <span className="results-stage">{rankingStage(row)}</span>
                </td>
                {withLots && <td className="name results-lot">{(row.definitive && row.prize) || ''}</td>}
              </tr>,
            ]
          })}
        </tbody>
      </table>
    </section>
  )
}

/** Les quatre tableaux en lecture seule, un tour sous l'autre, la finale en tête (lisible à 375 px). */
export function PublicBrackets({ view, teamId }: { view: PublicView; teamId: string | null }) {
  const { brackets } = view.brackets
  if (brackets.length === 0) return null
  // Ouvert : le dernier tableau où joue « mon équipe », sinon le Principal.
  const mineKey = teamId ? brackets.filter((b) => b.rounds.some((r) => r.matches.some((m) => m.status !== 'bye' && hasTeam(m, teamId)))).at(-1)?.key : undefined
  return (
    <section className="card" aria-label="Tableaux">
      <h2 className="card-title">Tableaux</h2>
      {brackets.map((b) => (
        <BracketDetails key={b.key} bracket={b} teamId={teamId} open={b.key === (mineKey ?? 'P')} />
      ))}
    </section>
  )
}

const hasTeam = playsIn

/** Matchs de tableau en cours, par planche, puis ceux en attente de planche (téléphone). */
export function LiveBracketMatches({ view, teamId }: { view: PublicView; teamId: string | null }) {
  const { live } = view.brackets
  if (live.length === 0) return null
  return (
    <section className="card" aria-label="Matchs en cours">
      <h2 className="card-title">Matchs en cours</h2>
      <ol className="phone-matches">
        {live.map((m) => (
          <li key={m.id} className={`phone-match phone-match-${m.status}${hasTeam(m, teamId) ? ' is-mine' : ''}`}>
            <span className="phone-board" aria-label={m.board ? `Planche ${m.board}` : 'En attente de planche'}>
              {m.board ?? '–'}
            </span>
            <span className="phone-teams">
              <span className="phone-stage">
                {m.bracketName} · {m.roundName}
              </span>
              <span>{m.teamA?.name}</span>
              <span>{m.teamB?.name}</span>
            </span>
            {m.status === 'waiting-board' && <span className="phone-state">attente</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

function BracketDetails({ bracket, teamId, open }: { bracket: BracketView; teamId: string | null; open: boolean }) {
  return (
    <details className="results-bracket" open={open}>
      <summary>
        <strong>{bracket.name}</strong>{' '}
        <span className="muted small">
          {bracket.teams} équipe{bracket.teams > 1 ? 's' : ''}
          {bracket.winner && <> · vainqueur {bracket.winner.name}</>}
        </span>
      </summary>
      {[...bracket.rounds].reverse().map((round) => {
        const played = round.matches.filter((m) => m.status !== 'bye')
        if (played.length === 0) return null
        return (
          <div key={round.round} className="results-round">
            <h3 className="card-subtitle">{round.name}</h3>
            <ol className="phone-matches">
              {played.map((m) => (
                <ResultMatch key={m.id} match={m} mine={hasTeam(m, teamId)} />
              ))}
            </ol>
          </div>
        )
      })}
    </details>
  )
}

function ResultMatch({ match, mine }: { match: BracketMatchView; mine: boolean }) {
  const { score } = match
  const winner = score ? (score.a > score.b ? 'a' : 'b') : null
  const name = (t: BracketMatchView['teamA']) => t?.name ?? 'à déterminer'
  return (
    <li className={`phone-match results-match${mine ? ' is-mine' : ''}`}>
      <span className="phone-teams">
        <span className={winner === 'a' ? 'winner' : undefined}>{name(match.teamA)}</span>
        <span className={winner === 'b' ? 'winner' : undefined}>{name(match.teamB)}</span>
      </span>
      {score ? (
        <span className="phone-score">
          <span className={winner === 'a' ? 'winner' : undefined}>{score.a}</span>
          <span className={winner === 'b' ? 'winner' : undefined}>{score.b}</span>
        </span>
      ) : (
        <span className="phone-state">{match.status === 'playing' ? `planche ${match.board}` : match.status === 'waiting-board' ? 'attente' : 'à jouer'}</span>
      )}
    </li>
  )
}
