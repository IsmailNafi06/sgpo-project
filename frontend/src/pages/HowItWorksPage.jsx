import { Link } from 'react-router-dom'
import HeaderBar from '../components/HeaderBar'

const steps = [
  {
    title: 'Choisir votre point de depart',
    text: 'Vous indiquez votre niveau actuel, votre serie ou votre branche, puis le metier que vous souhaitez viser.',
  },
  {
    title: 'Explorer les parcours possibles',
    text: "Notre moteur de graphe analyse les relations entre niveaux, filieres, etablissements et metiers pour trouver les chemins realistes.",
  },
  {
    title: 'Comprendre et comparer',
    text: "L'IA vous donne des conseils personnalises pour lire les resultats, comparer les durees, les couts et les conditions d'acces.",
  },
]

const sources = ['data.gov.ma', 'guide-metiers.ma', '9rayti.com']

export default function HowItWorksPage() {
  return (
    <div className="app-shell">
      <HeaderBar right={<Link to="/eleve" className="primary-btn px-6 py-3 text-base">Commencer</Link>} />
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <section className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-brand-blue">Comment ca marche</p>
            <h1 className="mt-4 text-4xl font-black leading-tight text-brand-navy dark:text-white sm:text-5xl">
              Une recherche d'orientation claire, basee sur les parcours possibles.
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-600 dark:text-slate-300">
              Vous choisissez un niveau et un metier, notre moteur de graphe trouve tous les parcours possibles, et
              l'IA vous donne des conseils personnalises.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/eleve" className="primary-btn min-h-14 px-8 text-base">
                Trouver mon parcours
              </Link>
              <Link to="/" className="secondary-btn min-h-14 px-8 text-base">
                Retour a l'accueil
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-soft backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
            <div className="grid gap-4">
              {steps.map((step, index) => (
                <article key={step.title} className="rounded-3xl border border-slate-100 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-800/80">
                  <div className="flex items-start gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-blue text-base font-black text-white">
                      {index + 1}
                    </span>
                    <div>
                      <h2 className="text-xl font-black text-brand-navy dark:text-white">{step.title}</h2>
                      <p className="mt-2 leading-7 text-slate-600 dark:text-slate-300">{step.text}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-12 rounded-[2rem] border border-emerald-100 bg-brand-mint/80 p-6 shadow-card dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-brand-greenDark dark:text-emerald-400">Sources de donnees</p>
          <p className="mt-3 max-w-3xl text-lg leading-8 text-brand-navy dark:text-slate-100">
            Les informations d'orientation sont enrichies a partir de sources publiques et specialisees, notamment :
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {sources.map((source) => (
              <span key={source} className="rounded-full bg-white px-4 py-2 text-sm font-black text-brand-blue shadow-sm dark:bg-slate-800 dark:text-blue-400">
                {source}
              </span>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
