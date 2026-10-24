import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react'

/** Routage maison sur `location.pathname` (pas de dépendance router). */
export type Route =
  | { page: 'home' }
  | { page: 'edition'; id: string }
  | { page: 'tele'; id: string }
  | { page: 'palmares' }
  | { page: 'console' }
  | { page: 'console-edition'; id: string; tab?: string }
  | { page: 'not-found' }

export function matchRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const [first, second, third] = parts
  if (parts.length === 0) return { page: 'home' }
  if (first === 'e' && second && parts.length === 2) return { page: 'edition', id: second }
  if (first === 'tele' && second && parts.length === 2) return { page: 'tele', id: second }
  if (first === 'palmares' && parts.length === 1) return { page: 'palmares' }
  if (first === 'console') {
    if (parts.length === 1) return { page: 'console' }
    if (parts.length <= 3) return { page: 'console-edition', id: second, tab: third }
  }
  return { page: 'not-found' }
}

const NAVIGATE_EVENT = 'app:navigate'

export function navigate(to: string, { replace = false } = {}): void {
  if (replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
  window.scrollTo(0, 0)
}

/** Chemin + recherche courants, mis à jour à chaque navigation. */
export function useLocation(): { pathname: string; search: URLSearchParams } {
  const [, setTick] = useState(0)
  useEffect(() => {
    const update = () => setTick((t) => t + 1)
    window.addEventListener('popstate', update)
    window.addEventListener(NAVIGATE_EVENT, update)
    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener(NAVIGATE_EVENT, update)
    }
  }, [])
  return { pathname: location.pathname, search: new URLSearchParams(location.search) }
}

/** Lien interne : navigation sans rechargement (ctrl/cmd-clic gardé). */
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || rest.target) return
    event.preventDefault()
    navigate(href)
  }
  return <a href={href} onClick={handle} {...rest} />
}
