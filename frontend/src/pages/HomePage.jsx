import { useState } from 'react'
import { Link } from 'react-router-dom'
import logo from '../assets/e-tawjihi-logo.png'
import studentFutureHero from '../assets/student-future-hero.png'
import ThemeToggle from '../components/ThemeToggle'

const highlights = [
  { value: '4 niveaux', label: 'du collège au bac', icon: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3.33 1.67 8.67 1.67 12 0v-5" />
    </svg>
  )},
  { value: 'Parcours', label: 'comparables et exportables', icon: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
    </svg>
  )},
  { value: 'Choix', label: 'plus clairs pour votre avenir', icon: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )},
]

const steps = [
  {
    icon: (
      <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none" aria-hidden="true">
        <circle cx="16" cy="8" r="5" stroke="currentColor" strokeWidth="2.2" />
        <path d="M16 15v8M8 28c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Indiquez votre niveau',
    text: '3AC, tronc commun, 1BAC ou 2BAC : le parcours commence depuis votre situation actuelle.',
  },
  {
    icon: (
      <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" strokeWidth="2.2" />
        <path d="M10 16h12M16 10v12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Choisissez un metier',
    text: 'Le moteur propose des chemins selon le metier vise, la mobilite, la ville et les contraintes.',
  },
  {
    icon: (
      <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none" aria-hidden="true">
        <path d="M4 24l7-7 5 5 12-13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Comparez les options',
    text: 'Score, duree, cout, etablissement, filiere et details sont regroupes pour decider sereinement.',
  },
]

const audiences = [
  { text: 'Eleves qui cherchent une orientation realiste', icon: '🎓' },
  { text: 'Parents qui veulent comparer les alternatives', icon: '👨‍👩‍👧' },
  { text: 'Administrateurs qui maintiennent les donnees', icon: '⚙️' },
]

const trustSignals = [
  'Parcours classes par pertinence',
  'Bacs acceptes regroupes',
  'Details complets de chaque chemin',
]

const navLinks = [
  { to: '/', label: 'Accueil' },
  { to: '/eleve', label: 'Etudiant' },
  { to: '/admin', label: 'Administration' },
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

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfdfd] text-brand-navy dark:bg-slate-950 dark:text-slate-100">
      {/* Header */}
      <header className="relative z-20 border-b border-slate-200 bg-white/95 shadow-[0_8px_24px_rgba(31,41,55,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-black/30">
        <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between px-5 py-3 sm:min-h-[86px] lg:px-8">
          <Link to="/" onClick={() => setMenuOpen(false)} className="inline-flex items-center">
            <img src={logo} alt="E-Tawjihi.ma" className="h-12 w-auto object-contain sm:h-14 lg:h-16" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 text-base font-bold text-brand-muted dark:text-slate-300 md:flex">
            <Link to="/" className="relative text-brand-blue after:absolute after:-bottom-1 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-brand-blue after:content-['']">
              Accueil
            </Link>
            {navLinks.slice(1).map(({ to, label }) => (
              <Link key={to} to={to} className="transition hover:text-brand-blue">
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={menuOpen}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-brand-navy transition hover:bg-brand-blueSoft dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 md:hidden"
            >
              {menuOpen ? <CloseIcon /> : <HamburgerIcon />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="mobile-menu-enter border-t border-slate-100 bg-white/98 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/98 md:hidden">
            <nav className="mx-auto flex max-w-7xl flex-col px-5">
              {navLinks.map(({ to, label }, i) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={`border-b border-slate-100 py-4 text-base font-bold transition last:border-0 dark:border-slate-800 ${i === 0 ? 'text-brand-blue' : 'text-brand-navy hover:text-brand-blue dark:text-slate-100'}`}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section
        className="relative min-h-[calc(100vh-86px)] overflow-hidden px-5 py-10 lg:px-8 lg:py-14"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(251,253,253,0.99) 0%, rgba(251,253,253,0.96) 38%, rgba(251,253,253,0.7) 58%, rgba(251,253,253,0.08) 100%), url(${studentFutureHero})`,
          backgroundPosition: 'center, right -95px bottom -4px',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover, clamp(760px, 72vw, 1080px) auto',
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_12%,rgba(50,70,181,0.08),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(52,211,153,0.14),transparent_30%)]" />
        <div className="absolute inset-0 hidden dark:block dark:bg-slate-950/85" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent dark:from-slate-950" />

        <div className="relative mx-auto grid min-h-[calc(100vh-188px)] max-w-7xl items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="max-w-2xl">
            <p className="text-base font-extrabold text-brand-muted dark:text-slate-400">Orientation scolaire & professionnelle au Maroc</p>
            <h1 className="mt-4 text-[42px] font-black leading-[1.05] text-brand-blue sm:text-5xl lg:text-[64px]">
              Trouvez tous les chemins pour atteindre le metier de vos reves
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-brand-muted dark:text-slate-300">
              E-Tawjihi.ma aide l'eleve a visualiser les parcours possibles, comparer les options et comprendre les
              conditions d'acces avant de choisir sa voie.
            </p>

            {/* Trust signals */}
            <div className="mt-5 flex flex-wrap gap-3">
              {trustSignals.map((item) => (
                <span key={item} className="inline-flex items-center gap-2 rounded-full border border-brand-blue/15 bg-white/80 px-4 py-2 text-sm font-bold text-brand-navy shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100">
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-brand-green" fill="currentColor" aria-hidden="true">
                    <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm3.78 4.78a.75.75 0 0 0-1.06-1.06L6.75 8.69 5.28 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l4.5-4.5Z" />
                  </svg>
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link to="/eleve" className="primary-btn min-h-14 min-w-56 rounded-2xl px-7 text-base">
                Je suis etudiant
              </Link>
              <Link to="/admin" className="secondary-btn min-h-14 min-w-56 rounded-2xl px-7 text-base">
                Espace administration
              </Link>
            </div>

            {/* Highlight stats */}
            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              {highlights.map((item) => (
                <div
                  key={item.value}
                  className="flex items-start gap-3 rounded-2xl border border-white/90 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/70"
                >
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-green/10 text-brand-greenDark dark:bg-emerald-950/50 dark:text-emerald-300">
                    {item.icon}
                  </span>
                  <div>
                    <p className="text-base font-black text-brand-blue">{item.value}</p>
                    <p className="mt-0.5 text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">{item.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden lg:block" aria-hidden="true" />
        </div>
      </section>

      {/* Steps section */}
      <section className="border-y border-slate-200 bg-[linear-gradient(180deg,#f8fbfc_0%,#eef8f4_100%)] px-5 py-16 dark:border-slate-800 dark:bg-slate-900 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-brand-blue">Experience eleve</p>
            <h2 className="mt-3 text-4xl font-black text-brand-navy dark:text-white">Une orientation plus simple a comprendre.</h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => (
              <article key={step.title} className="group rounded-3xl border border-white bg-white/90 p-7 shadow-card backdrop-blur transition hover:-translate-y-1 hover:shadow-soft dark:border-slate-700 dark:bg-slate-800/90">
                <div className="flex items-center gap-4">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-blue text-white shadow-lg shadow-blue-900/20">
                    {step.icon}
                  </div>
                  <span className="text-4xl font-black text-slate-100 dark:text-slate-700">{index + 1}</span>
                </div>
                <h3 className="mt-6 text-xl font-black text-brand-navy dark:text-white">{step.title}</h3>
                <p className="mt-3 text-base leading-8 text-brand-muted dark:text-slate-400">{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* For who section */}
      <section className="bg-white px-5 py-16 dark:bg-slate-950 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-brand-greenDark">Pour qui ?</p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-brand-navy dark:text-white">
              Un outil pense pour accompagner la decision, pas seulement afficher des donnees.
            </h2>
            <Link to="/comment-ca-marche" className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-brand-blue transition hover:text-brand-blueDark">
              Comment ca marche
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 10h12M10 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
          <div className="grid gap-4">
            {audiences.map((item) => (
              <div
                key={item.text}
                className="flex items-center gap-4 rounded-2xl border border-emerald-100 bg-brand-mint px-6 py-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-emerald-900/50 dark:bg-emerald-950/30"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-xl shadow-sm dark:bg-slate-900">
                  {item.icon}
                </span>
                <p className="text-lg font-bold text-brand-navy dark:text-slate-100">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA section */}
      <section className="relative overflow-hidden bg-[linear-gradient(135deg,#27368f_0%,#3246b5_54%,#2f9f76_100%)] px-5 py-14 text-white lg:px-8">
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        <div className="relative mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-white/70">Commencer</p>
            <h2 className="mt-3 text-4xl font-black">Construisez votre parcours maintenant.</h2>
            <p className="mt-3 max-w-md text-base text-white/75">Gratuit, sans inscription, disponible pour tous les niveaux du college au bac.</p>
          </div>
          <Link
            to="/eleve"
            className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-white px-8 text-base font-black text-brand-blue shadow-lg shadow-blue-950/20 transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            Acceder au formulaire
          </Link>
        </div>
      </section>
    </main>
  )
}
