import { Fragment } from 'react'

import {
  firstDefined,
  formatDuration,
  formatMoney,
  formatStepDuration,
  getAcceptedBacs,
  getCost,
  getDisplayDuration,
  getDisplaySteps,
  getPathEtabStatus,
  getPathId,
  getScore,
  getStepMinAverage,
  getStepName,
  getSteps,
  getStepType,
  getStepTypeLabel,
  typeStyles,
} from '../utils/pathUtils'

const getPathClassification = (path) => {
  const score = getScore(path)
  const steps = getDisplaySteps(path)
  const hasSchool = steps.some((s) => getStepType(s) === 'ETABLISSEMENT')
  const duration = getDisplayDuration(path)
  if (!hasSchool) return 'INCOMPLET'
  if (score >= 60 && duration > 0) return 'RECOMMANDE'
  if (score >= 35) return 'POSSIBLE'
  return 'A_VERIFIER'
}

const CLASSIFICATION_BADGE = {
  RECOMMANDE: { label: 'Recommande', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200' },
  POSSIBLE:   { label: 'Possible',   className: 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-200' },
  A_VERIFIER: { label: 'A verifier', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-200' },
  INCOMPLET:  { label: 'Incomplet',  className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300' },
}

const ETAB_STATUS_BADGE = {
  PUBLIC: { label: 'Public',  className: 'bg-green-50 text-green-700 border border-green-200 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200' },
  PRIVE:  { label: 'Prive',   className: 'bg-orange-50 text-orange-700 border border-orange-200 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200' },
  MIXTE:  { label: 'Mixte',   className: 'bg-violet-50 text-violet-700 border border-violet-200 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200' },
}

const getDifficultyBadge = (path) => {
  const averages = getSteps(path)
    .map(getStepMinAverage)
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n))
  if (!averages.length) return null
  const max = Math.max(...averages)
  if (max <= 10) return { label: 'Facile', className: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200' }
  if (max <= 14) return { label: 'Modere', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200' }
  return { label: 'Difficile', className: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200' }
}

function HeartIcon({ filled }) {
  return filled ? (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-rose-500" aria-hidden="true">
      <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
    </svg>
  )
}

function StudentIcon() {
  return (
    <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl bg-brand-blue text-white shadow-lg shadow-blue-900/20">
      <svg viewBox="0 0 48 48" className="h-9 w-9" aria-hidden="true">
        <circle cx="24" cy="10" r="6" fill="currentColor" />
        <path d="M24 18v13m-11-5 11-8 11 8M16 41l8-10 8 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  )
}

function PathArrow() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path d="M5 12h13m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

function StepBlock({ step, index }) {
  const type = getStepType(step)

  return (
    <div className={`min-h-[132px] w-[238px] shrink-0 rounded-[1.35rem] border p-5 shadow-sm ${typeStyles[type] || typeStyles.FILIERE}`}>
      <p className="text-xs font-black uppercase tracking-wide opacity-70">{getStepTypeLabel(type)}</p>
      <h3 className="mt-2 text-lg font-black leading-tight">{getStepName(step)}</h3>
      <p className="mt-3 text-sm opacity-80">{formatStepDuration(step, index)}</p>
      {firstDefined(step.ville, step.city) && <p className="text-sm opacity-80">{firstDefined(step.ville, step.city)}</p>}
    </div>
  )
}

export default function PathCard({ path, selected, disabled, onSelect, onDetails, isFavorite = false, onToggleFavorite }) {
  const steps = getDisplaySteps(path)
  const id = getPathId(path)
  const badge = CLASSIFICATION_BADGE[getPathClassification(path)]
  const etabStatus = getPathEtabStatus(path)
  const etabBadge = ETAB_STATUS_BADGE[etabStatus] ?? null
  const acceptedBacs = getAcceptedBacs(path)
  const difficultyBadge = getDifficultyBadge(path)

  return (
    <article className="rounded-[2rem] border border-slate-200/80 bg-white/95 p-5 shadow-card backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-brand-blue/20 hover:shadow-soft dark:border-slate-800 dark:bg-slate-900/92 dark:shadow-black/30 dark:hover:border-brand-blue/45 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-end gap-2 rounded-[1.35rem] bg-brand-blue px-5 py-3 text-white shadow-lg shadow-blue-900/15">
            <span className="text-4xl font-black leading-none">{getScore(path)}</span>
            <span className="pb-1 text-xs font-semibold uppercase tracking-wide text-white/75">score</span>
          </div>
          {difficultyBadge && (
            <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${difficultyBadge.className}`}>
              {difficultyBadge.label}
            </span>
          )}
          <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${badge.className}`}>
            {badge.label}
          </span>
          {etabBadge && (
            <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${etabBadge.className}`}>
              {etabBadge.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={() => onToggleFavorite(path)}
              aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition hover:scale-110 ${isFavorite ? 'border-rose-200 bg-rose-50 text-rose-500 dark:border-rose-800 dark:bg-rose-950/40' : 'border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:text-rose-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 dark:hover:border-rose-800 dark:hover:text-rose-400'}`}
            >
              <HeartIcon filled={isFavorite} />
            </button>
          )}
          <label className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold ${disabled && !selected ? 'border-slate-200 text-slate-400 dark:border-slate-800 dark:text-slate-600' : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200'}`}>
            <input
              type="checkbox"
              checked={selected}
              disabled={disabled && !selected}
              onChange={() => onSelect(id)}
              className="h-4 w-4 accent-brand-blue"
            />
            Comparer
          </label>
        </div>
      </div>

      <div className="relative">
        <div className="path-scroll flex items-center gap-4 overflow-x-auto rounded-[1.75rem] bg-slate-50/80 px-4 py-5 ring-1 ring-slate-100 dark:bg-slate-950/65 dark:ring-slate-800">
          {[{ kind: 'start', key: 'start' }, ...steps.map((step, index) => ({ kind: 'step', key: `${getStepType(step)}-${index}-${getStepName(step)}`, step, index }))].map((item, index, items) => (
            <Fragment key={item.key}>
              {item.kind === 'start' ? <StudentIcon /> : <StepBlock step={item.step} index={item.index} />}
              {index < items.length - 1 && <PathArrow />}
            </Fragment>
          ))}
        </div>
        {/* Fade gradient to indicate horizontal scroll */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 rounded-r-[1.75rem] bg-gradient-to-l from-slate-50 to-transparent dark:from-slate-950" aria-hidden="true" />
      </div>

      {acceptedBacs.length > 1 && (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-100">
          <span className="font-black">Bacs acceptes :</span>{' '}
          {acceptedBacs.map((bac) => bac.label).join(' / ')}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800 dark:text-slate-200">
            {formatDuration(getDisplayDuration(path))}
          </span>
          {getCost(path) === 0 && etabStatus === 'PUBLIC'
            ? <span className="rounded-full bg-green-50 px-3 py-1 text-green-700 dark:bg-emerald-950/45 dark:text-emerald-200">Cout faible</span>
            : <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800 dark:text-slate-200">{formatMoney(getCost(path))}</span>
          }
          <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800 dark:text-slate-200">{steps.length} etapes</span>
        </div>
        <button type="button" onClick={() => onDetails(path)} className="primary-btn w-full sm:w-auto">
          Voir le detail
        </button>
      </div>
    </article>
  )
}
