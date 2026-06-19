import { Link } from 'react-router-dom'
import HeaderBar from '../components/HeaderBar'

export default function NotFoundPage() {
  return (
    <div className="app-shell">
      <HeaderBar right={<Link to="/" className="primary-btn px-6 py-3 text-base">Accueil</Link>} />
      <main className="mx-auto grid min-h-[calc(100vh-220px)] max-w-4xl place-items-center px-4 py-16 text-center sm:px-6 lg:px-8">
        <section className="glass-panel rounded-[2.5rem] p-8 dark:border-slate-700/70 dark:bg-slate-900/80 sm:p-12">
          <p className="bg-gradient-to-br from-brand-blue via-brand-blueDark to-brand-green bg-clip-text text-8xl font-black leading-none text-transparent sm:text-9xl">
            404
          </p>
          <h1 className="mt-6 text-3xl font-black text-brand-navy dark:text-white">
            Page introuvable
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">
            Page introuvable – Le chemin que vous cherchez n'existe pas.
          </p>
          <Link to="/" className="primary-btn mt-8 min-h-14 px-8 text-base">
            Retour à l'accueil
          </Link>
        </section>
      </main>
    </div>
  )
}
