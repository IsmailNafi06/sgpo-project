import { Link } from 'react-router-dom'
import logo from '../assets/e-tawjihi-logo.png'

const cols = [
  {
    heading: 'Plateforme',
    links: [
      { label: 'Accueil', to: '/' },
      { label: 'Espace etudiant', to: '/eleve' },
      { label: 'Administration', to: '/admin' },
    ],
  },
  {
    heading: 'Aide',
    links: [
      { label: 'Comment ca marche', to: '/comment-ca-marche' },
      { label: 'FAQ', to: '/faq' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">

        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          {/* Brand */}
          <div>
            <Link to="/">
              <img src={logo} alt="E-Tawjihi.ma" className="h-10 w-auto object-contain" />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-7 text-slate-500 dark:text-slate-400">
              Trouvez les chemins vers le metier de vos reves. Visualisez, comparez et decidez sereinement.
            </p>
          </div>

          {/* Link columns */}
          {cols.map((col) => (
            <div key={col.heading}>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {col.heading}
              </p>
              <ul className="mt-4 space-y-3">
                {col.links.map(({ to, label }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      className="text-sm font-medium text-slate-600 transition hover:text-brand-blue dark:text-slate-400 dark:hover:text-white"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t border-slate-200 pt-6 dark:border-slate-800">
          <p className="text-xs text-slate-400 dark:text-slate-600">
            © {new Date().getFullYear()} E-Tawjihi.ma — Tous droits réservés.
          </p>
        </div>

      </div>
    </footer>
  )
}
