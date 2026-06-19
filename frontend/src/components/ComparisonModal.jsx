import { formatDuration, formatMoney, getCost, getDisplayDuration, getDisplaySteps, getScore, getStepName } from '../utils/pathUtils'

const criteria = [
  { label: 'Score', getter: (path) => getScore(path) },
  { label: 'Duree totale', getter: (path) => formatDuration(getDisplayDuration(path)) },
  { label: 'Cout total', getter: (path) => formatMoney(getCost(path)) },
  { label: 'Nombre etapes', getter: (path) => getDisplaySteps(path).length },
  { label: 'Etapes', getter: (path) => getDisplaySteps(path).map(getStepName).join(' → ') },
]

export default function ComparisonModal({ paths, onClose }) {
  if (!paths.length) return null

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-brand-navy/65 p-3 backdrop-blur-sm sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="mx-auto my-6 max-w-5xl rounded-3xl bg-white shadow-soft dark:bg-slate-900 sm:my-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-brand-blue">Comparaison</p>
            <h2 className="mt-1 text-xl font-black text-brand-navy dark:text-white sm:text-2xl">
              {paths.length} parcours selectionnés
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 sm:p-8">
          {/* Mobile: stacked path cards */}
          <div className="space-y-4 sm:hidden">
            {paths.map((path, pathIndex) => (
              <div key={pathIndex} className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                  <span className="text-xs font-black uppercase tracking-widest text-brand-blue">Parcours {pathIndex + 1}</span>
                </div>
                <div className="divide-y divide-slate-100 px-4 dark:divide-slate-700">
                  {criteria.map(({ label, getter }) => (
                    <div key={label} className="flex items-start justify-between gap-4 py-3">
                      <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</span>
                      <span className="max-w-[55%] text-right text-sm font-bold text-brand-navy dark:text-slate-100">
                        {getter(path)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-slate-200 text-left text-sm dark:border-slate-700">
              <thead className="bg-brand-blue text-white">
                <tr>
                  <th className="p-4 font-black">Critere</th>
                  {paths.map((_, i) => (
                    <th key={i} className="p-4 font-black">Parcours {i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {criteria.map(({ label, getter }) => (
                  <tr key={label} className="align-top">
                    <td className="bg-slate-50 p-4 font-black text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                      {label}
                    </td>
                    {paths.map((path, i) => (
                      <td key={i} className="p-4 text-slate-700 dark:text-slate-300">
                        {getter(path)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end">
            <button type="button" onClick={onClose} className="primary-btn w-full sm:w-auto">
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
