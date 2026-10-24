import logo from '../../../assets/logo-cjvhb.png'
import { Link } from '../router.tsx'

export const CLUB_TITLE = 'Concours de Palets du CJVHB'

/** Bandeau public aux couleurs du club. */
export function PublicHeader({ subtitle, compact = false }: { subtitle?: string; compact?: boolean }) {
  return (
    <header className={compact ? 'public-header compact' : 'public-header'}>
      <Link href="/" className="public-brand">
        <img src={logo} alt="Logo du CJVHB" className="public-logo" />
        <span className="public-club">{CLUB_TITLE}</span>
      </Link>
      {subtitle && <p className="public-subtitle">{subtitle}</p>}
    </header>
  )
}

export function Logo({ className }: { className?: string }) {
  return <img src={logo} alt="Logo du CJVHB" className={className} />
}
