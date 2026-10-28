import { useCallback, useEffect, useRef, useState } from 'react'
import type { PublicView } from '../../engine/index.ts'
import { publicPageUrl } from '../api.ts'
import { CLUB_TITLE, Logo } from '../components/Brand.tsx'
import { ClockDisplay } from '../components/Clock.tsx'
import { QrCode } from '../components/QrCode.tsx'
import { formatDate } from '../format.ts'
import { useEditionView } from '../live.ts'
import { slidesOf, TvEmpty, type Slide } from './screens.tsx'
import './tele.css'

/** Durée d'affichage d'une page de la rotation. */
const SLIDE_MS = 12_000

/** `/tele/:id` (+ `?k=` pour une édition de test) : écran télé plein écran. */
export function TelePage({ id, k }: { id: string; k?: string | null }) {
  const { view, status } = useEditionView(id, k)

  useEffect(() => {
    if (view) document.title = `Télé · ${view.name}`
  }, [view?.name])

  if (status === 'not-found') {
    return (
      <div className="tv tv-message">
        <Logo className="tv-message-logo" />
        <p>Édition introuvable : vérifiez le lien de la télé dans la console.</p>
      </div>
    )
  }
  if (!view) {
    return (
      <div className="tv tv-message">
        <Logo className="tv-message-logo" />
        <p>Connexion…</p>
      </div>
    )
  }
  return <TeleScreen view={view} k={k} offline={status === 'offline'} />
}

function TeleScreen({ view, k, offline }: { view: PublicView; k?: string | null; offline: boolean }) {
  const slides = slidesOf(view)
  const { slide, next } = useRotation(slides)
  // « Écran suivant » de la console : la télé avance à chaque nouveau clic (pas à l'ouverture).
  const skips = useRef(view.tv.skips)
  useEffect(() => {
    if (view.tv.skips === skips.current) return
    skips.current = view.tv.skips
    next()
  }, [view.tv.skips, next])
  const url = publicPageUrl(view.id, view.isTest ? k : null)
  const round = view.pool.rounds.at(-1)
  const scored = round ? round.matches.length - round.awaitingScore.length : 0
  // « En cours » : seulement les matchs sur une planche ; ceux qui attendent une planche sont comptés à part.
  const playing = view.brackets.live.filter((m) => m.status === 'playing').length
  const waiting = view.brackets.live.length - playing
  const done = view.phase === 'after'

  return (
    <div className="tv">
      <main className="tv-main">
        {slide ? (
          <>
            <header className="tv-head">
              <h1 className="tv-title">{slide.title}</h1>
              {slide.pages > 1 && (
                <span className="tv-pager" aria-label={`Page ${slide.page + 1} sur ${slide.pages}`}>
                  {slide.page + 1} / {slide.pages}
                </span>
              )}
            </header>
            <div className="tv-body" key={slide.key}>
              {slide.content}
            </div>
          </>
        ) : (
          <Welcome view={view} />
        )}
      </main>
      <aside className="tv-side">
        <Logo className="tv-logo" />
        <p className="tv-club">{CLUB_TITLE}</p>
        <p className="tv-edition">{view.name}</p>
        {view.brackets.generated ? (
          <p className="tv-round">
            {done ? 'Tournoi terminé' : 'Tableaux'}
            {!done && (
              <span>
                {playing} match{playing > 1 ? 's' : ''} en cours
              </span>
            )}
            {!done && waiting > 0 && <span className="tv-round-waiting">{waiting} en attente de planche</span>}
          </p>
        ) : round && (
          <p className="tv-round">
            Partie {round.round}
            <span>
              {scored} / {round.matches.length} scores
            </span>
          </p>
        )}
        {/* Tournoi terminé : plus de chrono (comme sur le téléphone). */}
        <div className="tv-clock-slot">{view.clock && !done && <ClockDisplay clock={view.clock} className="clock-tv" />}</div>
        <div className="tv-qr-block">
          <QrCode url={url} className="tv-qr" />
          <p className="tv-qr-caption">Suivez le tournoi et votre équipe sur votre téléphone</p>
        </div>
        {offline && <p className="tv-offline">Connexion perdue, reconnexion…</p>}
        {view.isTest && <p className="tv-test">Édition de test</p>}
        <div className="tv-controls">
          {slides.length > 1 && (
            <button type="button" className="tv-control" onClick={next}>
              Suivant →
            </button>
          )}
          <FullscreenButton />
        </div>
      </aside>
    </div>
  )
}

/** Avant le tirage : affiche du concours. */
function Welcome({ view }: { view: PublicView }) {
  return (
    <div className="tv-welcome">
      <p className="tv-welcome-date">{formatDate(view.date)}</p>
      <h1 className="tv-welcome-name">{view.name}</h1>
      <p className="tv-welcome-count">
        {view.teams.length} équipe{view.teams.length > 1 ? 's' : ''} inscrite{view.teams.length > 1 ? 's' : ''}
      </p>
      <TvEmpty text="Le tirage de la partie 1 arrive bientôt. Scannez le QR code pour suivre votre équipe." />
    </div>
  )
}

/**
 * Fait tourner les diapositives. Une nouvelle saisie ne relance pas le
 * minuteur ; on garde la diapositive affichée tant qu'elle existe.
 * `next` (bouton « Suivant », flèche droite ou espace) passe à la suivante
 * et relance le minuteur.
 */
function useRotation(slides: Slide[]): { slide: Slide | null; next: () => void } {
  const [current, setCurrent] = useState<string | null>(null)
  const [skips, setSkips] = useState(0)
  const keys = slides.map((s) => s.key).join('|')

  const advance = useCallback(() => {
    setCurrent((key) => {
      const list = keys.split('|')
      const index = key ? list.indexOf(key) : 0
      return list[(index + 1) % list.length]
    })
  }, [keys])

  const next = useCallback(() => {
    if (slides.length < 2) return
    advance()
    setSkips((n) => n + 1)
  }, [advance, slides.length])

  useEffect(() => {
    if (slides.length < 2) return
    const timer = setInterval(advance, SLIDE_MS)
    return () => clearInterval(timer)
  }, [advance, skips])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== ' ') return
      e.preventDefault()
      next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next])

  return { slide: slides.find((s) => s.key === current) ?? slides[0] ?? null, next }
}

/** Bouton discret, caché une fois en plein écran. */
function FullscreenButton() {
  const [full, setFull] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement)
  useEffect(() => {
    const update = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])
  if (full || !document.fullscreenEnabled) return null
  return (
    <button type="button" className="tv-control" onClick={() => document.documentElement.requestFullscreen().catch(() => {})}>
      Plein écran
    </button>
  )
}
