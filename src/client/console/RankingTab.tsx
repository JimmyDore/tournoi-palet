import type { FinalRankingRow } from '../../engine/index.ts'
import { ordinal, rankingStage } from '../format.ts'
import type { TabProps } from './tabs.tsx'

/**
 * Onglet « Classement » : classement final de 1 à N, par blocs (Principal,
 * Challenge Principal, Consolante, Challenge Consolante, forfaits de poule).
 * Provisoire tant que des matchs restent à jouer : chaque place dit si elle
 * est définitive.
 */
export function RankingTab({ view }: TabProps) {
  const { finished, rows } = view.ranking
  if (rows.length === 0) {
    return (
      <section className="panel">
        <h2>Classement final</h2>
        <p className="muted">Le classement final apparaît dès la génération des tableaux.</p>
      </section>
    )
  }
  const definitive = rows.filter((r) => r.definitive).length
  const withPrizes = rows.some((r) => r.prize !== null)
  const blocks: FinalRankingRow[][] = []
  for (const row of rows) {
    const last = blocks.at(-1)
    if (last && last[0].block === row.block) last.push(row)
    else blocks.push([row])
  }
  return (
    <div className="stack">
      <section className="panel">
        <h2>Classement final</h2>
        <p className={finished ? 'success' : 'pool-missing'} role="status">
          {finished
            ? `Classement définitif : les quatre finales sont jouées (${rows.length} équipes).`
            : `Classement provisoire : ${definitive} place${definitive > 1 ? 's' : ''} définitive${definitive > 1 ? 's' : ''} sur ${rows.length}.`}
        </p>
        <p className="muted small">
          Principal, puis Challenge Principal, Consolante, Challenge Consolante, puis les forfaits de poule. Dans un bloc, une équipe éliminée plus tard est devant ; à
          tour égal, le score de la défaite puis le classement des poules départagent. Une place est définitive quand l’équipe n’a plus de match et que tout son tour
          est joué.
        </p>
      </section>
      {blocks.map((block) => (
        <section key={block[0].block} className="panel" aria-label={`Classement, ${block[0].blockName}`}>
          <h2>
            {block[0].blockName}{' '}
            <span className="muted small">
              places {block[0].place} à {block.at(-1)!.place}
            </span>
          </h2>
          <div className="table-wrap">
            <table className="standings ranking">
              <thead>
                <tr>
                  <th scope="col">Place</th>
                  <th scope="col" className="left">
                    Équipe
                  </th>
                  <th scope="col" className="left">
                    Parcours
                  </th>
                  <th scope="col" className="ranking-pool">Poules</th>
                  <th scope="col" className="left">
                    Statut
                  </th>
                  {withPrizes && (
                    <th scope="col" className="left">
                      Lot
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {block.map((row) => (
                  <tr key={row.team.id} className={row.definitive ? undefined : 'is-provisional'}>
                    <td>
                      <strong>{row.place}</strong>
                    </td>
                    <td className="left">{row.team.name}</td>
                    <td className="left">{rankingStage(row)}</td>
                    <td className="ranking-pool">{ordinal(row.poolRank)}</td>
                    <td className="left">
                      {row.definitive ? <span className="badge badge-final">définitive</span> : <span className="badge badge-wait">provisoire</span>}
                    </td>
                    {withPrizes && <td className="left ranking-prize">{row.prize ?? <span className="muted">—</span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
