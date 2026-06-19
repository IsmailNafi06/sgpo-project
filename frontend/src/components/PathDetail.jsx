import {
  firstDefined,
  formatDuration,
  formatMoney,
  formatStepDuration,
  getCost,
  getAcceptedBacs,
  getDisplayDuration,
  getDisplaySteps,
  getPathInterpretation,
  getScore,
  getStepAccess,
  getStepLinkType,
  getStepMinAverage,
  getStepName,
  getStepSuccessRate,
  getStepType,
  getStepTypeLabel,
} from '../utils/pathUtils'

const valueOrDash = (value, suffix = '') => {
  if (value === null || value === undefined || value === '') return 'Non precise'
  return `${value}${suffix}`
}

const formatAccess = (step) => {
  const access = getStepAccess(step)
  const linkType = getStepLinkType(step)
  if (access && linkType) return `${access} (${linkType})`
  return access || linkType || 'Non precise'
}

export default function PathDetail({ path, actions }) {
  if (!path) return null
  const steps = getDisplaySteps(path)
  const relatedJobs = path.relatedJobs || path.metiersConnexes || path.metiers_connexes || []
  const acceptedBacs = getAcceptedBacs(path)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 pr-12">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand-blue">Parcours recommande</p>
          <h2 className="mt-1 text-3xl font-black text-brand-navy dark:text-white">Score {getScore(path)}</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800 dark:text-slate-200">{formatDuration(getDisplayDuration(path))}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800 dark:text-slate-200">{formatMoney(getCost(path))}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800 dark:text-slate-200">{steps.length} etapes</span>
        </div>
      </div>

      <section>
        <h3 className="mb-3 text-lg font-black text-slate-900 dark:text-white">Etapes detaillees</h3>
        {acceptedBacs.length > 1 && (
          <div className="mb-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-100">
            <span className="font-black">Bacs acceptes :</span>{' '}
            {acceptedBacs.map((bac) => bac.label).join(' / ')}
          </div>
        )}
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={`${getStepName(step)}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-brand-blue">{getStepTypeLabel(getStepType(step))}</p>
                  <h4 className="mt-1 text-lg font-black text-brand-navy dark:text-white">{getStepName(step)}</h4>
                </div>
                <span className="rounded-full bg-brand-blue px-3 py-1 text-xs font-bold text-white">Etape {index + 1}</span>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
                <p><strong>Duree:</strong> {formatStepDuration(step, index)}</p>
                <p><strong>Ville:</strong> {valueOrDash(firstDefined(step.ville, step.city))}</p>
                <p><strong>Acces:</strong> {formatAccess(step)}</p>
                <p><strong>Moyenne min.:</strong> {valueOrDash(getStepMinAverage(step))}</p>
                <p><strong>Taux reussite:</strong> {valueOrDash(getStepSuccessRate(step), '%')}</p>
                {firstDefined(step.secteur, step.sector) && <p><strong>Secteur:</strong> {firstDefined(step.secteur, step.sector)}</p>}
                {firstDefined(step.code, step.id) && <p><strong>Code:</strong> {firstDefined(step.code, step.id)}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-brand-blue p-5 text-white">
        <h3 className="text-lg font-black">Interpretation IA</h3>
        <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-200">
          {getPathInterpretation(path)}
        </p>
      </section>

      {relatedJobs.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-black text-slate-900 dark:text-white">Metiers connexes</h3>
          <div className="flex flex-wrap gap-2">
            {relatedJobs.map((job) => (
              <span key={job} className="rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900 dark:bg-amber-950/70 dark:text-amber-200">{job}</span>
            ))}
          </div>
        </section>
      )}

      {actions}
    </div>
  )
}
