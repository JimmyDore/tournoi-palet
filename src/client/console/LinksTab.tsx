import { publicLink } from '../api.ts'
import type { TabProps } from './tabs.tsx'

export function LinksTab({ view }: TabProps) {
  const links = [
    { label: 'Page publique (téléphones)', href: publicLink('e', view, true) },
    { label: 'Écran télé', href: publicLink('tele', view, true) },
  ]
  return (
    <section className="panel">
      <h2>Liens publics</h2>
      {view.settings.isTest ? (
        <p className="muted">
          Édition de test : ces liens contiennent un jeton secret. Sans lui, l'édition reste invisible. Ils servent à répéter sur la
          vraie télé et les vrais téléphones.
        </p>
      ) : (
        <p className="muted">L'édition la plus récente (hors test) est aussi celle de la page d'accueil du site.</p>
      )}
      <ul className="links">
        {links.map((l) => (
          <li key={l.label}>
            <span>{l.label}</span>
            <a href={l.href} target="_blank" rel="noreferrer">
              {l.href}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
