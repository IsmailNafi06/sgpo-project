import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import logo from '../assets/e-tawjihi-logo.png'
import ThemeToggle from './ThemeToggle'

const navLinks = [
  { to: '/', label: 'Accueil' },
  { to: '/eleve', label: 'Etudiant' },
  { to: '/comment-ca-marche', label: 'Comment ca marche' },
  { to: '/faq', label: 'FAQ' },
]

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}

export default function HeaderBar({ right }) {
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const close = () => setMenuOpen(false)

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 shadow-[0_8px_24px_rgba(31,41,55,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/92 dark:shadow-black/30">
      <div className="mx-auto flex min-h-[68px] max-w-7xl items-center justify-between px-4 py-3 sm:min-h-[80px] sm:px-6 lg:px-8">
        <Link to="/" onClick={close} className="flex items-center gap-3">
          <img src={logo} alt="E-Tawjihi.ma" className="h-11 w-auto object-contain sm:h-12 lg:h-14" />
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-6 text-sm font-bold text-brand-muted dark:text-slate-300 lg:flex">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`relative transition hover:text-brand-blue ${pathname === to ? 'text-brand-blue after:absolute after:-bottom-1 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-brand-blue after:content-[\'\']' : ''}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {right && <div className="hidden sm:block">{right}</div>}
          <ThemeToggle />
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-brand-navy transition hover:bg-brand-blueSoft dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 lg:hidden"
          >
            {menuOpen ? <CloseIcon /> : <HamburgerIcon />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="mobile-menu-enter border-t border-slate-100 bg-white/98 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/98 lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col px-4 sm:px-6">
            {navLinks.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                onClick={close}
                className={`flex items-center justify-between border-b border-slate-100 py-4 text-base font-bold transition last:border-0 hover:text-brand-blue dark:border-slate-800 ${pathname === to ? 'text-brand-blue' : 'text-brand-navy dark:text-slate-100'}`}
              >
                {label}
                {pathname === to && (
                  <span className="h-2 w-2 rounded-full bg-brand-blue" />
                )}
              </Link>
            ))}
            {right && <div className="py-4">{right}</div>}
          </nav>
        </div>
      )}
    </header>
  )
}
