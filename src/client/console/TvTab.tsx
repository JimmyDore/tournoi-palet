import { useState } from 'react'
import { TV_VIEWS, tvViewLabel, type TvViewChoice } from '../../engine/index.ts'
import { publicLink, sendCommand } from '../api.ts'
import type { TabProps } from './tabs.tsx'

const CHOICES: TvViewChoice[] = ['auto', ...TV_VIEWS.map((v) => v.key)]

/** Onglet « Télé » : lien de l'écran et blocage sur une vue (diffusé en direct à la télé). */
export function TvTab({ view }: TabProps) {
  const [refusal, setRefusal] = useState<string | null>(null)
  const current = view.tv.view
  const link = publicLink('tele', view, true)

  const choose = async (choice: TvViewChoice) => {
    const result = await sendCommand(view.id, { type: 'setTvView', view: choice })
    setRefusal(result.ok ? null : result.reason)
  }

  return (
    <section className="panel">
      <h2>Télé</h2>
      <p>
        Ouvrez{' '}
        <a href={link} target="_blank" rel="noreferrer">
          l’écran télé
        </a>{' '}
        sur le PC branché à la télé, puis cliquez sur « Plein écran ».
      </p>
      <p className="muted">
        Actuellement : <strong>{current === 'auto' ? 'rotation automatique' : `bloquée sur « ${tvViewLabel(current)} »`}</strong>
      </p>
      <div className="actions tv-choices" role="group" aria-label="Vue de la télé">
        {CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            className={choice === current ? 'btn btn-primary' : 'btn'}
            aria-pressed={choice === current}
            onClick={() => choose(choice)}
          >
            {choice === 'auto' ? 'Rotation automatique' : tvViewLabel(choice)}
          </button>
        ))}
      </div>
      {refusal && (
        <p className="refusal" role="alert">
          {refusal}
        </p>
      )}
    </section>
  )
}
