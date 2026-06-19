import { useState } from 'react'
import { Link } from 'react-router-dom'
import HeaderBar from '../components/HeaderBar'

const questions = [
  {
    question: 'Comment sont générés les parcours ?',
    answer:
      "Vous choisissez votre niveau et le métier que vous visez. Le moteur explore ensuite le graphe des niveaux, filières, établissements et métiers pour proposer les parcours possibles les plus cohérents.",
  },
  {
    question: "D'où viennent les données ?",
    answer:
      'Les données sont structurées à partir de sources publiques et spécialisées comme data.gov.ma, guide-metiers.ma et 9rayti.com, puis enrichies dans la base SGPO.',
  },
  {
    question: "Comment est calculé le score d'un parcours ?",
    answer:
      "Le score tient compte de la cohérence du chemin, de la durée, du coût, de la mobilité, du type d'établissement et des conditions d'accès. Plus le score est élevé, plus le parcours correspond à vos critères.",
  },
  {
    question: 'Puis-je partager un parcours ?',
    answer:
      "Oui. Depuis le détail d'un parcours, vous pouvez générer un lien de partage et l'envoyer à un proche, un conseiller ou un responsable d'orientation.",
  },
  {
    question: "Comment l'IA m'aide-t-elle ?",
    answer:
      "L'IA vous aide à comprendre le parcours avec des explications simples, des conseils personnalisés et une lecture plus claire des étapes importantes.",
  },
]

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export default function FaqPage() {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <div className="app-shell">
      <HeaderBar
        right={
          <Link to="/eleve" className="secondary-btn">
            Espace etudiant
          </Link>
        }
      />

      <main className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-brand-blue">Questions frequentes</p>
        <h1 className="mt-4 text-4xl font-black leading-tight text-brand-navy dark:text-white sm:text-5xl">
          Tout comprendre avant de commencer.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-brand-muted dark:text-slate-300">
          Voici les reponses aux questions les plus courantes sur la generation des parcours, les donnees utilisees et
          l'accompagnement propose.
        </p>

        <div className="mt-10 space-y-3">
          {questions.map((item, index) => {
            const isOpen = openIndex === index

            return (
              <article
                key={item.question}
                className={`overflow-hidden rounded-3xl border bg-white shadow-card transition-all duration-200 dark:bg-slate-900 ${
                  isOpen
                    ? 'border-brand-blue/25 shadow-soft dark:border-brand-blue/30'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-4">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black transition-colors duration-200 ${
                      isOpen ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {index + 1}
                    </span>
                    <span className="text-lg font-black text-brand-navy dark:text-white">{item.question}</span>
                  </div>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors duration-200 ${
                    isOpen ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    <ChevronIcon open={isOpen} />
                  </span>
                </button>

                {/* Animated accordion body using CSS grid trick */}
                <div className={`faq-body ${isOpen ? 'faq-open' : ''}`}>
                  <div>
                    <div className="border-t border-slate-100 px-6 pb-6 pt-4 dark:border-slate-800">
                      <p className="text-base leading-8 text-brand-muted dark:text-slate-300 pl-12">{item.answer}</p>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        <div className="mt-12 rounded-3xl border border-brand-blue/15 bg-brand-blueSoft p-7 dark:border-blue-800/40 dark:bg-blue-950/20">
          <p className="font-black text-brand-navy dark:text-white">Vous avez une autre question ?</p>
          <p className="mt-2 text-base leading-7 text-brand-muted dark:text-slate-300">
            Consultez la page <Link to="/comment-ca-marche" className="font-bold text-brand-blue underline underline-offset-2 hover:text-brand-blueDark">"Comment ca marche"</Link> pour plus de details sur le fonctionnement du moteur.
          </p>
        </div>
      </main>
    </div>
  )
}
