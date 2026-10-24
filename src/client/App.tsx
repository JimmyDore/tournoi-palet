import { useEffect } from 'react'
import { ConsoleGate } from './console/ConsoleApp.tsx'
import { EditionConsole } from './console/EditionConsole.tsx'
import { EditionList } from './console/EditionList.tsx'
import { PublicHeader } from './components/Brand.tsx'
import { PublicEdition, PublicHome } from './pages/PublicEdition.tsx'
import { Link, matchRoute, useLocation } from './router.tsx'
import { TelePage } from './tele/TelePage.tsx'

/** Aiguillage des pages. Ajouter une page : un cas dans `Route` (router.tsx) et ici. */
export function App() {
  const { pathname, search } = useLocation()
  const route = matchRoute(pathname)
  const k = search.get('k')

  useEffect(() => {
    document.title = route.page.startsWith('console') ? 'Console · Concours de Palets du CJVHB' : 'Concours de Palets du CJVHB'
  }, [route.page])

  switch (route.page) {
    case 'home':
      return <PublicHome />
    case 'edition':
      return <PublicEdition id={route.id} k={k} />
    case 'tele':
      return <TelePage id={route.id} k={k} />
    case 'palmares':
      return <ComingSoon />
    case 'console':
      return (
        <ConsoleGate>
          <EditionList />
        </ConsoleGate>
      )
    case 'console-edition':
      return (
        <ConsoleGate>
          <EditionConsole id={route.id} tab={route.tab} />
        </ConsoleGate>
      )
    case 'not-found':
      return <NotFound />
  }
}

function ComingSoon() {
  return (
    <div className="public">
      <PublicHeader />
      <main className="public-main">
        <section className="card">
          <h1 className="edition-name">Bientôt disponible</h1>
          <p>
            Cette page arrive avec les prochaines versions du site. <Link href="/">Retour à l'accueil</Link>
          </p>
        </section>
      </main>
    </div>
  )
}

function NotFound() {
  return (
    <div className="public">
      <PublicHeader />
      <main className="public-main">
        <section className="card">
          <h1 className="edition-name">Page introuvable</h1>
          <p>
            <Link href="/">Retour à l'accueil</Link>
          </p>
        </section>
      </main>
    </div>
  )
}
