import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../contexts/ToastContext'
import { useFavorites } from '../hooks/useFavorites'
import HeaderBar from '../components/HeaderBar'
import PathCard from '../components/PathCard'
import PathDetailModal from '../components/PathDetailModal'
import ComparisonModal from '../components/ComparisonModal'
import { backendMetiers } from '../data/backendMetiers'
import { fallbackMetiers } from '../data/fallbackData'
import { studentApi } from '../services/api'
import { dedupePaths, getDisplayDuration, getDisplaySteps, getPathId, getScore, getStepCity, isCoherentPath, sortPathsForDisplay, getSteps, getStepCode, getStepName, getStepType } from '../utils/pathUtils'

const firstBacSeries = [
  { code: '1BAC_SM', label: 'Sciences Mathematiques' },
  { code: '1BAC_SE', label: 'Sciences Experimentales: PC / SVT' },
  { code: '1BAC_ECO', label: 'Sciences Economiques et Gestion' },
  { code: '1BAC_LETTRES', label: 'Lettres et Sciences Humaines' },
  { code: '1BAC_TECH', label: 'Sciences et Technologies' },
  { code: '1BAC_ART', label: 'Arts Appliques' },
]

const secondBacSeries = [
  { code: 'BAC_SM_A', label: 'Sciences Mathematiques A' },
  { code: 'BAC_SM_B', label: 'Sciences Mathematiques B' },
  { code: 'BAC_SVT', label: 'Sciences de la Vie et de la Terre' },
  { code: 'BAC_PC', label: 'Sciences Physiques-Chimie' },
  { code: 'BAC_ECO', label: 'Sciences Economiques' },
  { code: 'BAC_GC', label: 'Sciences de Gestion Comptable' },
  { code: 'BAC_LETTRES', label: 'Lettres' },
  { code: 'BAC_SH', label: 'Sciences Humaines' },
  { code: 'BAC_TECH_ELEC', label: 'Technologies Electriques' },
  { code: 'BAC_TECH_MECA', label: 'Technologies Mecaniques' },
  { code: 'BAC_TECH_CIVIL', label: 'Genie Civil' },
  { code: 'BAC_AGR', label: 'Sciences Agronomiques' },
  { code: 'BAC_ARTS_APPLIQUES', label: 'Arts Appliques' },
  { code: 'BAC_PRO_COMMERCE', label: 'Bac Pro Commerce' },
  { code: 'BAC_PRO_MAINT_INDUS', label: 'Bac Pro Maintenance Industrielle' },
  { code: 'BAC_PRO_ELECTROTECH', label: 'Bac Pro Electrotechnique' },
  { code: 'BAC_PRO_SERV_REST', label: 'Bac Pro Services de Restauration' },
]

const initialForm = {
  niveau: '2BAC',
  bacSerie: 'BAC_GC',
  metier: '',
  moyenne: '',
  mobilite: 'Libre',
  villeDepart: '',
  dureeMax: '',
  coutMax: '',
  typeAcces: '',
}

const toBackendCode = (value) =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const normalizeText = (value = '') =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const normalizeCode = (value = '') =>
  String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

const resolveBackendStartCode = (code) => {
  if (code === 'BAC_SM_A' || code === 'BAC_SM_B') return 'BAC_SM'
  return code
}

const firstBacFamilyByCode = {
  '1BAC_SM': 'SCIENCES_MATH',
  '1BAC_SE': 'SCIENCES_EXP',
  '1BAC_ECO': 'ECONOMIE_GESTION',
  '1BAC_LETTRES': 'LETTRES',
  '1BAC_TECH': 'TECHNOLOGIES',
  '1BAC_ART': 'ARTS',
}

const terminalBacFamilyByCode = {
  BAC_SM: 'SCIENCES_MATH',
  BAC_PC: 'SCIENCES_EXP',
  BAC_SVT: 'SCIENCES_EXP',
  BAC_ECO: 'ECONOMIE_GESTION',
  BAC_GC: 'ECONOMIE_GESTION',
  BAC_SH: 'LETTRES',
  BAC_LETTRES: 'LETTRES',
  BAC_TECH_ELEC: 'TECHNOLOGIES',
  BAC_TECH_MECA: 'TECHNOLOGIES',
  BAC_TECH_CIVIL: 'TECHNOLOGIES',
  BAC_ARTS_APPLIQUES: 'ARTS',
}

const terminalCodesByFirstBac = {
  '1BAC_SM': ['BAC_SM'],
  '1BAC_SE': ['BAC_PC', 'BAC_SVT'],
  '1BAC_ECO': ['BAC_ECO', 'BAC_GC'],
  '1BAC_LETTRES': ['BAC_LETTRES', 'BAC_SH'],
  '1BAC_TECH': ['BAC_TECH_ELEC', 'BAC_TECH_MECA', 'BAC_TECH_CIVIL'],
  '1BAC_ART': ['BAC_ARTS_APPLIQUES'],
}

const terminalFamilyOf = (code) => terminalBacFamilyByCode[resolveBackendStartCode(code)] || ''

const sameFamilyTerminalCodes = (code) => {
  const family = terminalFamilyOf(code)
  if (!family) return [resolveBackendStartCode(code)]
  return Array.from(
    new Set(
      Object.keys(terminalBacFamilyByCode)
        .filter((candidate) => terminalFamilyOf(candidate) === family)
        .map(resolveBackendStartCode),
    ),
  )
}

const requestedStartMatchesForm = (path, formState, payloadCodeDepart) => {
  const steps = getSteps(path)
  if (!steps.length) return false

  if (formState.niveau === '2BAC') {
    const firstBacStep = steps.find((step) => terminalFamilyOf(getStepCode(step)))
    if (!firstBacStep) return false
    const stepBacCode = resolveBackendStartCode(normalizeCode(getStepCode(firstBacStep)))
    const requestedBacCode = resolveBackendStartCode(normalizeCode(payloadCodeDepart))
    return stepBacCode === requestedBacCode
  }

  if (formState.niveau === '1BAC') {
    const firstBacStep = steps.find((step) => firstBacFamilyByCode[normalizeCode(getStepCode(step))])
    if (!firstBacStep) return false
    return normalizeCode(getStepCode(firstBacStep)) === normalizeCode(formState.bacSerie)
  }

  if (formState.niveau === 'TC') {
    return normalizeCode(getStepCode(steps[0])) === 'TC'
  }

  if (formState.niveau === '3AC') {
    return normalizeCode(getStepCode(steps[0])) === '3AC'
  }

  return true
}

const requestedStartMatchesFamilyFallback = (path, formState, payloadCodeDepart) => {
  const steps = getSteps(path)
  if (!steps.length) return false

  if (formState.niveau === '2BAC') {
    const firstBacStep = steps.find((step) => terminalFamilyOf(getStepCode(step)))
    if (!firstBacStep) return false
    return terminalFamilyOf(getStepCode(firstBacStep)) === terminalFamilyOf(payloadCodeDepart)
  }

  if (formState.niveau === '1BAC') {
    const firstBacStep = steps.find((step) => firstBacFamilyByCode[normalizeCode(getStepCode(step))])
    if (!firstBacStep) return false
    return firstBacFamilyByCode[normalizeCode(getStepCode(firstBacStep))] === firstBacFamilyByCode[normalizeCode(formState.bacSerie)]
  }

  return requestedStartMatchesForm(path, formState, payloadCodeDepart)
}

const firstBacByTerminal = {
  BAC_SM: { code: '1BAC_SM', label: '1ere Bac Sciences Mathematiques' },
  BAC_PC: { code: '1BAC_SE', label: '1ere Bac Sciences Experimentales' },
  BAC_SVT: { code: '1BAC_SE', label: '1ere Bac Sciences Experimentales' },
  BAC_SE: { code: '1BAC_SE', label: '1ere Bac Sciences Experimentales' },
  BAC_ECO: { code: '1BAC_ECO', label: '1ere Bac Sciences Economiques et Gestion' },
  BAC_GC: { code: '1BAC_ECO', label: '1ere Bac Sciences Economiques et Gestion' },
  BAC_LETTRES: { code: '1BAC_LETTRES', label: '1ere Bac Lettres' },
  BAC_SH: { code: '1BAC_LETTRES', label: '1ere Bac Lettres' },
  BAC_TECH_ELEC: { code: '1BAC_TECH', label: '1ere Bac Sciences et Technologies' },
  BAC_TECH_MECA: { code: '1BAC_TECH', label: '1ere Bac Sciences et Technologies' },
  BAC_TECH_CIVIL: { code: '1BAC_TECH', label: '1ere Bac Sciences et Technologies' },
  BAC_ARTS_APPLIQUES: { code: '1BAC_ART', label: '1ere Bac Arts Appliques' },
}

const makeStep = (code, label, type = 'FILIERE') => ({
  type,
  code,
  nom: label,
  nomFr: label,
  name: label,
  duree: 12,
  duree_mois: 12,
  displayOnly: true,
})

const pathSteps = (path) => path?.etapes || path?.steps || path?.nodes || []
const stepCode = (step) => normalizeCode(step?.code || step?.id || '')

const canonicalToken = (value = '') =>
  String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const finalJobMatchesSelection = (path, selectedJob) => {
  const finalJob = [...getSteps(path)].reverse().find((step) => getStepType(step) === 'METIER')
  if (!finalJob) return false

  const finalValues = new Set([
    canonicalToken(getStepCode(finalJob)),
    canonicalToken(getStepName(finalJob)),
  ])

  const selectedValues = new Set([
    canonicalToken(selectedJob?.code),
    canonicalToken(selectedJob?.label),
    ...(selectedJob?.aliases || []).map(canonicalToken),
  ])

  return [...selectedValues].some((value) => value && finalValues.has(value))
}

const getCityMatchLevel = (path, requestedCity) => {
  const city = canonicalToken(requestedCity)
  if (!city) return 0
  const concreteCities = getDisplaySteps(path)
    .filter((step) => !['NIVEAU', 'METIER'].includes(getStepType(step)))
    .map(getStepCity)
    .filter(Boolean)
    .map(canonicalToken)
  if (!concreteCities.length) return 1
  const matches = concreteCities.filter((c) => c === city).length
  if (matches === concreteCities.length) return 0
  if (matches > 0) return 1
  return 2
}

const normalizeOutcomeText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`´]/g, ' ')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()

const schoolishCodeOrName = (step) => {
  const code = normalizeOutcomeText(getStepCode(step))
  const name = normalizeOutcomeText(getStepName(step))
  return (
    code === '3AC' ||
    code === 'TC' ||
    code.startsWith('1BAC') ||
    code.startsWith('BAC') ||
    name.includes('TRONC COMMUN') ||
    name.includes('1ERE BAC') ||
    name.startsWith('BAC ')
  )
}

const clientEstablishmentFamily = (step) => {
  const text = normalizeOutcomeText(`${getStepCode(step)} ${getStepName(step)}`)
  if (/ENSEM|ECOLE NATIONALE SUPERIEURE D ELECTRICITE/.test(text)) return 'ENSEM'
  if (/ENSIAS|ECOLE NATIONALE SUPERIEURE D INFORMATIQUE/.test(text)) return 'ENSIAS'
  if (/ECOLE MOHAMMADIA D INGENIEURS|\bEMI\b/.test(text)) return 'EMI'
  if (/INPT|INSTITUT NATIONAL DES POSTES/.test(text)) return 'INPT'
  if (/\b(FMD|FMDS|FMDC)\b|FACULTE DE MEDECINE DENTAIRE/.test(text)) return 'FMD'
  if (/\b(FMP|FMPR|FMPC|FMPO|FMPK|FMPM|FMPB)\b|FACULTE DE MEDECINE ET DE PHARMACIE|FACULTE DE MEDECINE\b/.test(text)) return 'FMP'
  if (/ECOLE NATIONALE D ARCHITECTURE|\bENA\b/.test(text)) return 'ENA'
  if (/\bENSA\b|ECOLE NATIONALE DES SCIENCES APPLIQUEES/.test(text)) return 'ENSA'
  if (/ENCG|ECOLE NATIONALE DE COMMERCE/.test(text)) return 'ENCG'
  if (/ISCAE/.test(text)) return 'ISCAE'
  return text
}

const clientCareerFamily = (program, job) => {
  const text = normalizeOutcomeText(`${getStepCode(program)} ${getStepName(program)} ${getStepCode(job)} ${getStepName(job)}`)
  if (/DENTAIRE|DENTISTE/.test(text)) return 'DENTAIRE'
  if (/PHARMACIE|PHARMACIEN/.test(text)) return 'PHARMACIE'
  if (/MEDECINE|MEDECIN/.test(text)) return 'MEDECINE'
  if (/ARCHITECT/.test(text)) return 'ARCHITECTURE'
  if (/EXPERT COMPTABLE|EXPERTISE COMPTABLE/.test(text)) return 'EXPERTISE_COMPTABLE'
  if (/DATA|INTELLIGENCE ARTIFICIELLE|\bIA\b|MACHINE LEARNING|DEEP LEARNING|BIG DATA/.test(text)) return 'DATA_IA'
  if (/CYBER|SECURITE/.test(text)) return 'CYBERSECURITE'
  if (/INFORMATIQUE|SYSTEMES|RESEAUX|LOGICIEL|DEVELOPPEUR|CLOUD|TELECOM/.test(text)) return 'GENIE_INFORMATIQUE'
  return normalizeOutcomeText(getStepName(program))
}

const clientResultSignature = (path) => {
  const steps = getDisplaySteps(path)
  const establishment = [...steps].reverse().find((step) => getStepType(step) === 'ETABLISSEMENT')
  const job = [...steps].reverse().find((step) => getStepType(step) === 'METIER')
  const program = [...steps]
    .reverse()
    .find((step) => getStepType(step) === 'FILIERE' && !schoolishCodeOrName(step))

  if (!establishment || !job || !program) {
    return steps
      .filter((step) => getStepType(step) !== 'NIVEAU')
      .map((step) => `${getStepType(step)}:${normalizeOutcomeText(getStepName(step))}`)
      .join('|')
  }

  return [
    clientEstablishmentFamily(establishment),
    normalizeOutcomeText(getStepCity(establishment) || getStepCity(program) || ''),
    clientCareerFamily(program, job),
    normalizeOutcomeText(getStepName(job)),
  ].join('|')
}

const finalClientDedupe = (paths = []) => {
  const best = new Map()
  paths.forEach((path) => {
    const signature = clientResultSignature(path)
    const existing = best.get(signature)
    if (!existing || getScore(path) > getScore(existing) || (getScore(path) === getScore(existing) && getDisplayDuration(path) <= getDisplayDuration(existing))) {
      const acceptedBacs = [
        ...(existing?.acceptedBacs || existing?.bacsAcceptes || []),
        ...(path?.acceptedBacs || path?.bacsAcceptes || []),
      ]
      best.set(signature, acceptedBacs.length ? { ...path, acceptedBacs, bacsAcceptes: acceptedBacs } : path)
    }
  })
  return sortPathsForDisplay(Array.from(best.values()))
}

const preferredBacsForJob = (job) => {
  const text = normalizeCode(`${job?.code || ''} ${job?.label || ''} ${(job?.aliases || []).join(' ')}`).replace(/_/g, ' ')

  if (/\b(MEDECIN|DENTISTE|PHARMACIEN|VETERINAIRE|SANTE|INFIRMIER|KINE|BIOLOGISTE)\b/.test(text)) {
    return ['BAC_SVT', 'BAC_PC', 'BAC_SM']
  }
  if (/\b(INGENIEUR|INFORMATIQUE|DATA|CYBER|LOGICIEL|RESEAUX|IA|DEEP LEARNING|DEVELOPPEUR|ELECTRIQUE|MECANIQUE)\b/.test(text)) {
    return ['BAC_SM', 'BAC_PC', 'BAC_TECH_ELEC']
  }
  if (/\b(COMPTABLE|AUDITEUR|FINANCE|BANQUE|GESTION|ECONOM|EXPERT COMPTABLE|CONTROLEUR)\b/.test(text)) {
    return ['BAC_GC', 'BAC_ECO', 'BAC_SM']
  }
  if (/\b(AVOCAT|JURISTE|DROIT|MAGISTRAT|NOTAIRE)\b/.test(text)) {
    return ['BAC_LETTRES', 'BAC_SH', 'BAC_ECO']
  }
  if (/\b(ARCHITECTE|DESIGNER|ART|INFOGRAPHISTE)\b/.test(text)) {
    return ['BAC_SM', 'BAC_ARTS_APPLIQUES', 'BAC_PC']
  }

  return ['BAC_SM', 'BAC_PC', 'BAC_GC', 'BAC_ECO']
}

const uniqueAttempts = (attempts) => {
  const seen = new Set()
  return attempts.filter((attempt) => {
    const key = JSON.stringify(attempt)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const buildSearchAttempts = (payload, formState, selectedJob) => {
  const attempts = [payload]
  const requiresExactCity = payload.mobilite === 'VILLE' && Boolean(payload.villeDepart)
  const addMobilityVariants = (base) => {
    attempts.push(base)
    if (!requiresExactCity && base.mobilite !== 'LIBRE') attempts.push({ ...base, mobilite: 'LIBRE', villeDepart: null })
  }

  if (formState.niveau === '3AC') {
    addMobilityVariants({ ...payload, codeDepart: 'TC' })
    preferredBacsForJob(selectedJob).forEach((codeDepart) => addMobilityVariants({ ...payload, codeDepart }))
  } else if (formState.niveau === 'TC') {
    preferredBacsForJob(selectedJob).forEach((codeDepart) => addMobilityVariants({ ...payload, codeDepart }))
  } else if (formState.niveau === '2BAC') {
    sameFamilyTerminalCodes(payload.codeDepart).forEach((codeDepart) => addMobilityVariants({ ...payload, codeDepart }))
  } else if (formState.niveau === '1BAC') {
    ;(terminalCodesByFirstBac[formState.bacSerie] || []).forEach((codeDepart) => addMobilityVariants({ ...payload, codeDepart }))
  } else if (payload.mobilite !== 'LIBRE') {
    attempts.push({ ...payload, mobilite: 'LIBRE', villeDepart: null })
  }

  return uniqueAttempts(attempts)
}

const addStartContext = (path, requestedStart, actualStart) => {
  const requested = normalizeCode(requestedStart)
  const steps = pathSteps(path)
  const returnedStart = stepCode(steps[0])
  const actual = returnedStart || normalizeCode(actualStart)
  if (requested === actual) return path

  const existingCodes = new Set(steps.map(stepCode))
  const prefix = []

  const pushPrefix = (step) => {
    if (!existingCodes.has(stepCode(step)) && !prefix.some((item) => stepCode(item) === stepCode(step))) prefix.push(step)
  }

  if (requested === '3AC') pushPrefix(makeStep('3AC', '3eme annee college', 'NIVEAU'))
  if ((requested === '3AC' || requested === 'TC') && actual !== '3AC') pushPrefix(makeStep('TC', 'Tronc Commun', 'NIVEAU'))
  if ((requested.startsWith('1BAC') || requested === 'TC' || requested === '3AC') && actual.startsWith('BAC_') && firstBacByTerminal[actual]) {
    pushPrefix(makeStep(firstBacByTerminal[actual].code, firstBacByTerminal[actual].label))
  }

  if (!prefix.length) return path
  return { ...path, etapes: [...prefix, ...steps] }
}

const hasEncodedGarbage = (value = '') => /%[0-9a-f]{2}|25d8|25d9|25ef|25ba|25bb/i.test(String(value))

const isReadableJob = (job) => {
  if (!job?.code || !job?.label) return false
  const label = String(job.label).trim()
  if (hasEncodedGarbage(`${job.code} ${label}`)) return false
  if (!/[A-Za-z]{3}/.test(label.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) return false
  if (/^(metiers?|fiches metiers?|tests metiers?|formations?|secteurs? de formation|orientation)$/i.test(label)) return false
  return true
}

const mergeJobs = (...groups) => {
  const merged = new Map()
  groups.flat().forEach((job) => {
    if (!isReadableJob(job)) return
    const existing = merged.get(job.code)
    if (!existing) {
      merged.set(job.code, { ...job, aliases: job.aliases || [] })
      return
    }
    merged.set(job.code, {
      ...existing,
      ...job,
      label: existing.label || job.label,
      aliases: Array.from(new Set([...(existing.aliases || []), ...(job.aliases || [])])),
    })
  })
  return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}

const localMetiers = mergeJobs(backendMetiers, fallbackMetiers)

function LoadingSpinner() {
  return (
    <span aria-hidden="true" className="relative flex h-5 w-5 items-center justify-center">
      <span className="absolute h-5 w-5 rounded-full border-2 border-white/25" />
      <span className="absolute h-5 w-5 animate-spin rounded-full border-2 border-transparent border-r-white border-t-white" />
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
    </span>
  )
}

const loaderScenarios = [
  {
    title: 'Analyse du profil',
    text: 'Niveau, serie du bac et objectif metier',
    steps: ['Depart', 'Branche', 'Etablissement', 'Metier vise'],
  },
  {
    title: 'Exploration des chemins',
    text: 'Formations publiques, privees et conditions d acces',
    steps: ['Bac conseille', 'Formation', 'Ville', 'Score'],
  },
  {
    title: 'Verification finale',
    text: 'Duree, cout, mobilite et coherence du parcours',
    steps: ['Duree', 'Cout', 'Acces', 'Conseil IA'],
  },
]

function PathCardSkeleton({ index = 0 }) {
  const scenario = loaderScenarios[index % loaderScenarios.length]

  return (
    <article className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-5 shadow-card dark:border-slate-700 dark:bg-slate-900/95 sm:p-7">
      <span className="path-loader-sheen" aria-hidden="true" />

      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="path-loader-float flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue text-white shadow-lg shadow-blue-900/20">
            <svg viewBox="0 0 32 32" className="h-9 w-9" fill="none" aria-hidden="true">
              <path d="M7 12l9-5 9 5-9 5-9-5Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M11 15v5c0 1.7 2.2 3 5 3s5-1.3 5-3v-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M25 12v6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-blue dark:text-blue-300">
              Recherche intelligente
            </p>
            <h3 className="mt-1 text-xl font-black text-brand-navy dark:text-white">{scenario.title}</h3>
            <p className="mt-1 text-sm font-semibold text-brand-muted dark:text-slate-300">{scenario.text}</p>
          </div>
        </div>
        <div className="rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200">
          Construction du parcours
        </div>
      </div>

      <div className="path-scroll relative mt-8 overflow-x-auto rounded-3xl border border-slate-100 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-950/70">
        <div className="flex min-w-[600px] items-center gap-4">
          {scenario.steps.map((step, stepIndex) => (
            <div key={step} className="flex flex-1 items-center gap-4">
              <div className="path-loader-pulse min-h-28 flex-1 rounded-3xl border border-emerald-100 bg-emerald-50 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700/80 dark:text-emerald-200/80">
                  Etape {stepIndex + 1}
                </p>
                <p className="mt-3 text-lg font-black text-brand-navy dark:text-white">{step}</p>
                <div className="mt-4 h-2 w-20 rounded-full bg-emerald-200 dark:bg-emerald-400/30" />
              </div>
              {stepIndex < scenario.steps.length - 1 && (
                <div className="flex w-16 shrink-0 items-center">
                  <span className="path-loader-line" aria-hidden="true" />
                  <span className="-ml-1 text-2xl font-black text-brand-blue dark:text-blue-300">›</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:grid-cols-3">
        {['Bacs acceptes', 'Scores compares', 'Conseils prepares'].map((label) => (
          <div key={label} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400 path-loader-pulse" />
            {label}
          </div>
        ))}
      </div>
    </article>
  )
}

export default function StudentPage() {
  const toast = useToast()
  const { toggle: toggleFavorite, isFavorite } = useFavorites()
  const [form, setForm] = useState(initialForm)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [metiers, setMetiers] = useState(localMetiers)
  const [metierNodes, setMetierNodes] = useState(localMetiers)
  const [metierFocused, setMetierFocused] = useState(false)
  const [paths, setPaths] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [detailPath, setDetailPath] = useState(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)

  useEffect(() => {
    studentApi.metiers()
      .then((data) => {
        const items = Array.isArray(data) ? data : data.content || data.nodes || []
        const jobs = items.filter((item) => !item || !item.type ? Boolean(item?.code) : (item.type || item.nodeType) === 'METIER')
        const normalizedJobs = jobs
          .map((item) => ({
            code: item.code,
            label: item.nomFr || item.nom_fr || item.nom || item.name || item.label || item.code,
            aliases: item.aliases || [],
          }))
          .filter(isReadableJob)
        if (normalizedJobs.length) {
          const mergedJobs = mergeJobs(normalizedJobs, localMetiers)
          setMetiers(mergedJobs)
          setMetierNodes(mergedJobs)
        }
      })
      .catch(() => {
        setMetiers(localMetiers)
        setMetierNodes(localMetiers)
      })
  }, [])

  const suggestions = useMemo(() => {
    const query = normalizeText(form.metier)
    if (!query) return metiers.filter(isReadableJob).slice(0, 8)
    return metiers
      .filter(isReadableJob)
      .filter((job) => {
        const searchableValues = [job.label, job.code, ...(job.aliases || [])].map(normalizeText)
        return searchableValues.some((value) => value.includes(query))
      })
      .slice(0, 8)
  }, [form.metier, metiers])

  const selectedPaths = paths.filter((path) => selectedIds.includes(getPathId(path)))
  const availableBacSeries = form.niveau === '1BAC' ? firstBacSeries : secondBacSeries

  const update = (field, value) => {
    setForm((current) => {
      if (field === 'niveau') {
        if (value === '1BAC') return { ...current, niveau: value, bacSerie: firstBacSeries[0].code }
        if (value === '2BAC') return { ...current, niveau: value, bacSerie: secondBacSeries[4].code }
      }
      return { ...current, [field]: value }
    })
  }

  const submit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setSelectedIds([])
    try {
      const query = normalizeText(form.metier)
      const selectedJob =
        metierNodes.find((item) => normalizeText(item.label) === query) ||
        metierNodes.find((item) => normalizeText(item.code) === query) ||
        metierNodes.find((item) => (item.aliases || []).some((alias) => normalizeText(alias) === query)) ||
        metierNodes.find((item) => normalizeText(item.label).startsWith(query)) ||
        metierNodes.find((item) => [item.label, item.code, ...(item.aliases || [])].map(normalizeText).some((value) => value.includes(query)))

      if (!selectedJob) {
        setPaths([])
        toast('Choisissez un metier dans les suggestions pour lancer une recherche fiable.', 'info')
        return
      }

      const payload = {
        codeDepart: ['1BAC', '2BAC'].includes(form.niveau) ? resolveBackendStartCode(form.bacSerie) : form.niveau,
        codeArrivee: selectedJob.code || toBackendCode(form.metier),
        moyenne: form.moyenne ? Number(form.moyenne) : null,
        mobilite: form.mobilite.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
        villeDepart: form.villeDepart || null,
        dureeMax: form.dureeMax ? Number(form.dureeMax) * 12 : null,
        coutMax: form.coutMax ? Number(form.coutMax) : null,
        typeAccesFiltre: form.typeAcces || null,
      }
      const attempts = buildSearchAttempts(payload, form, selectedJob)
      const responses = await Promise.allSettled(
        attempts.map((attempt) =>
          studentApi.search(attempt).then((data) => {
            const results = Array.isArray(data) ? data : data.parcours || data.paths || data.results || []
            const normalizedResults = results.map((path) => addStartContext(path, payload.codeDepart, attempt.codeDepart))
            const isFallbackAttempt =
              payload.mobilite !== 'LIBRE' &&
              (attempt.mobilite !== payload.mobilite || attempt.villeDepart !== payload.villeDepart)

            return { normalizedResults, isFallbackAttempt }
          }),
        ),
      )

      const fulfilled = responses.filter((response) => response.status === 'fulfilled').map((response) => response.value)
      const allResults = fulfilled.flatMap((response) => response.normalizedResults)
      const strictMobilityResults = fulfilled.filter((response) => !response.isFallbackAttempt).flatMap((response) => response.normalizedResults)
      const fallbackResults = fulfilled.filter((response) => response.isFallbackAttempt).flatMap((response) => response.normalizedResults)

      if (!fulfilled.length) {
        const firstError = responses.find((response) => response.status === 'rejected')?.reason
        throw firstError || new Error('Search unavailable')
      }

      const cleanResults = (items, { useFamilyFallback = false } = {}) => {
        const sorted = finalClientDedupe(
          dedupePaths(
            items
              .filter((path) => useFamilyFallback
                ? requestedStartMatchesFamilyFallback(path, form, payload.codeDepart)
                : requestedStartMatchesForm(path, form, payload.codeDepart))
              .filter((path) => finalJobMatchesSelection(path, selectedJob))
              .filter(isCoherentPath),
          ),
        )
        if (!form.villeDepart) return sorted
        const withLevel = sorted.map((p) => ({ p, lvl: getCityMatchLevel(p, form.villeDepart) }))
        const filtered = form.mobilite === 'Ville'
          ? withLevel.filter(({ lvl }) => lvl < 2)
          : withLevel
        const exactCity = filtered.filter(({ lvl }) => lvl === 0)
        const partialCity = filtered.filter(({ lvl }) => lvl === 1)
        const cityFiltered = form.mobilite === 'Ville'
          ? (exactCity.length ? exactCity : partialCity)
          : filtered

        return finalClientDedupe(dedupePaths(cityFiltered.map(({ p }) => p)))
      }

      // Try exact bac match first
      const strictResults = cleanResults(strictMobilityResults)
      const fallbackCleanResults = cleanResults(fallbackResults)
      let coherentResults = strictResults.length ? strictResults : fallbackCleanResults.length ? fallbackCleanResults : cleanResults(allResults)
      // Si aucun résultat exact, élargir à la famille bac (ex: SVT peut voir résultats SE)
      if (!coherentResults.length && ['1BAC', '2BAC'].includes(form.niveau)) {
        const familyStrict = cleanResults(strictMobilityResults, { useFamilyFallback: true })
        const familyFallback = cleanResults(fallbackResults, { useFamilyFallback: true })
        coherentResults = familyStrict.length ? familyStrict : familyFallback.length ? familyFallback : cleanResults(allResults, { useFamilyFallback: true })
      }
      setPaths(coherentResults)
      if (!allResults.length) {
        toast('Aucun parcours trouve pour ces criteres. Essayez une autre branche, une autre moyenne ou une mobilite plus large.', 'info')
      } else if (!coherentResults.length) {
        if (form.niveau === '1BAC' || form.niveau === '2BAC') {
          toast('Aucun parcours coherent trouve depuis cette branche vers ce metier avec les donnees disponibles.', 'info')
        } else {
          toast('Aucun parcours trouve pour ces criteres. Essayez une autre branche, une autre moyenne ou une mobilite plus large.', 'info')
        }
      }
    } catch (error) {
      const status = error?.response?.status
      const backendMessage = typeof error?.response?.data === 'string' ? error.response.data : ''
      if (!error?.response) {
        setPaths([])
        toast('Service de recherche indisponible pour le moment. Reessayez dans quelques instants.', 'error')
      } else if (status >= 400 && status < 500) {
        setPaths([])
        toast(backendMessage || "Nous n'avons pas pu lancer cette recherche. Verifiez le niveau et le metier choisi.", 'error')
      } else {
        setPaths([])
        toast('Erreur serveur pendant la recherche. Reessayez avec un autre metier ou une autre serie.', 'error')
      }
    } finally {
      setLoading(false)
      setHasSearched(true)
    }
  }

  const toggleSelected = (id) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= 3) return current
      return [...current, id]
    })
  }

  return (
    <div className="app-shell">
      <HeaderBar right={<a href="/admin" className="secondary-btn px-6 py-3 text-base">Administration</a>} />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="mb-10">
          <p className="text-sm font-bold uppercase tracking-wide text-brand-blue">Espace etudiant</p>
          <h1 className="mt-2 text-4xl font-black leading-tight text-brand-navy sm:text-5xl lg:text-6xl">Construire mon parcours</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600 dark:text-slate-300">Indiquez votre niveau, votre metier cible et vos contraintes. E-Tawjihi vous propose des chemins clairs, comparables et exportables.</p>
        </section>

        <form onSubmit={submit} className="glass-panel rounded-[2rem] p-5 ring-1 ring-white/80 sm:p-8">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Niveau</label>
              <select value={form.niveau} onChange={(e) => update('niveau', e.target.value)} className="field">
                {['3AC', 'TC', '1BAC', '2BAC'].map((level) => <option key={level}>{level}</option>)}
              </select>
            </div>
            {['1BAC', '2BAC'].includes(form.niveau) && (
              <div>
                <label className="label">{form.niveau === '1BAC' ? 'Branche' : 'Serie du bac'}</label>
                <select value={form.bacSerie} onChange={(e) => update('bacSerie', e.target.value)} className="field">
                  {availableBacSeries.map((serie) => <option key={serie.code} value={serie.code}>{serie.label}</option>)}
                </select>
              </div>
            )}
            <div className="relative lg:col-span-2">
              <label className="label">Metier souhaite</label>
              <input
                value={form.metier}
                onChange={(e) => update('metier', e.target.value)}
                onFocus={() => setMetierFocused(true)}
                onBlur={() => window.setTimeout(() => setMetierFocused(false), 120)}
                className="field"
                placeholder="Ex: comptable, medecin, architecte..."
                required
              />
              {metierFocused && (
                <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-900">
                  {suggestions.length > 0 ? (
                    suggestions.map((job) => (
                      <button
                        key={`${job.code}-${job.label}`}
                        type="button"
                        onMouseDown={() => {
                          update('metier', job.label)
                          setMetierFocused(false)
                        }}
                        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-brand-blueSoft dark:hover:bg-slate-800"
                      >
                        <span className="font-bold text-brand-navy dark:text-slate-100">{job.label}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-brand-blue dark:bg-slate-800 dark:text-blue-400">Metier</span>
                      </button>
                    ))
                  ) : (
                    <p className="px-4 py-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Aucun metier trouve. Essayez un autre mot.</p>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="label">Moyenne</label>
              <input type="number" min="0" max="20" step="0.01" value={form.moyenne} onChange={(e) => update('moyenne', e.target.value)} className="field" placeholder="Optionnel" />
            </div>
            <div>
              <label className="label">Mobilite</label>
              <select value={form.mobilite} onChange={(e) => update('mobilite', e.target.value)} className="field">
                {['Libre', 'Region', 'Ville'].map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            {form.mobilite === 'Ville' && (
              <div>
                <label className="label">Ville de depart</label>
                <input value={form.villeDepart} onChange={(e) => update('villeDepart', e.target.value)} className="field" placeholder="Ex: Fes" />
              </div>
            )}
          </div>

          <div className="mt-5">
            <button type="button" onClick={() => setAdvancedOpen((open) => !open)} className="secondary-btn py-2">
              {advancedOpen ? 'Masquer les filtres' : 'Filtres avances'}
            </button>
          </div>
          {advancedOpen && (
            <div className="mt-5 grid gap-5 rounded-[1.5rem] border border-slate-100 bg-slate-50/90 p-5 md:grid-cols-3 dark:border-slate-700 dark:bg-slate-900/60">
              <div>
                <label className="label">Duree max</label>
                <input type="number" value={form.dureeMax} onChange={(e) => update('dureeMax', e.target.value)} className="field" placeholder="Annees" />
              </div>
              <div>
                <label className="label">Cout max</label>
                <input type="number" value={form.coutMax} onChange={(e) => update('coutMax', e.target.value)} className="field" placeholder="MAD" />
              </div>
              <div>
                <label className="label">Type d'acces</label>
                <select value={form.typeAcces} onChange={(e) => update('typeAcces', e.target.value)} className="field">
                  <option value="">Tous</option>
                  <option value="DOSSIER">Dossier</option>
                  <option value="CONCOURS">Concours</option>
                  <option value="OUVERT">Ouvert</option>
                </select>
              </div>
            </div>
          )}

          <div className="mt-8 flex justify-end border-t border-slate-100 pt-6 dark:border-slate-800">
            <button type="submit" disabled={loading} className="primary-btn min-w-56 gap-3">
              {loading ? (
                <>
                  <LoadingSpinner />
                  <span>Construction des parcours</span>
                </>
              ) : (
                'Trouver mes parcours'
              )}
            </button>
          </div>
        </form>

        {/* Pre-search empty state */}
        {!loading && !hasSearched && (
          <section className="mt-10">
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white/50 px-8 py-14 text-center backdrop-blur dark:border-slate-700 dark:bg-slate-900/30">
              <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-brand-blueSoft text-brand-blue dark:bg-blue-950/40 dark:text-blue-300">
                <svg viewBox="0 0 48 48" className="h-10 w-10" fill="none" aria-hidden="true">
                  <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="2.8" />
                  <path d="M24 13v4M24 31v4M13 24h4M31 24h4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="24" cy="24" r="2.5" fill="currentColor" />
                  <path d="M24 24l5.5-5.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-brand-navy dark:text-white">Decouvrez vos parcours</h2>
              <p className="mx-auto mt-3 max-w-md text-base leading-7 text-brand-muted dark:text-slate-400">
                Selectionnez votre niveau, choisissez un metier cible et cliquez sur{' '}
                <strong className="font-black text-brand-navy dark:text-slate-100">Trouver mes parcours</strong>{' '}
                pour explorer les chemins disponibles.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {['3AC', 'TC', '1BAC', '2BAC'].map((lvl) => (
                  <span key={lvl} className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-black text-brand-navy shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    {lvl}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {loading && (
          <section className="mt-10 space-y-5" aria-label="Chargement des parcours">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-3xl font-black text-brand-navy dark:text-white">Nous construisons vos parcours</h2>
                <p className="mt-1 text-sm font-bold text-brand-muted dark:text-slate-300">
                  Le moteur explore les formations, les etablissements et les conditions d acces.
                </p>
              </div>
            </div>
            {[0, 1, 2].map((item) => (
              <PathCardSkeleton key={item} index={item} />
            ))}
          </section>
        )}

        {!loading && paths.length > 0 && (
          <section className="mt-10 space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-black text-brand-navy dark:text-white sm:text-3xl">Parcours proposes</h2>
                <p className="mt-1 text-sm font-bold text-brand-muted dark:text-slate-400">
                  {paths.length} {paths.length > 1 ? 'parcours trouvés' : 'parcours trouvé'}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowFavorites((v) => !v)}
                  className={`flex-1 sm:flex-none ${showFavorites ? 'primary-btn' : 'secondary-btn'}`}
                >
                  <svg viewBox="0 0 20 20" className="mr-2 h-4 w-4 shrink-0" fill={showFavorites ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.172 5.172a4 4 0 0 1 5.656 0L10 6.343l1.172-1.171a4 4 0 1 1 5.656 5.656L10 17.657l-6.828-6.829a4 4 0 0 1 0-5.656Z" />
                  </svg>
                  Favoris
                </button>
                <button
                  type="button"
                  disabled={!selectedPaths.length}
                  onClick={() => setCompareOpen(true)}
                  className="flex-1 primary-btn sm:flex-none"
                >
                  Comparer ({selectedPaths.length}/3)
                </button>
              </div>
            </div>
            {showFavorites && paths.filter((p) => isFavorite(p)).length === 0 && (
              <p className="rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                Aucun favori parmi ces parcours. Cliquez sur le coeur d'un parcours pour l'ajouter.
              </p>
            )}
            {(showFavorites ? paths.filter((p) => isFavorite(p)) : paths).map((path) => {
              const id = getPathId(path)
              return (
                <PathCard
                  key={id}
                  path={path}
                  selected={selectedIds.includes(id)}
                  disabled={selectedIds.length >= 3}
                  onSelect={toggleSelected}
                  onDetails={setDetailPath}
                  isFavorite={isFavorite(path)}
                  onToggleFavorite={toggleFavorite}
                />
              )
            })}
          </section>
        )}
      </main>

      <PathDetailModal path={detailPath} onClose={() => setDetailPath(null)} />
      {compareOpen && <ComparisonModal paths={selectedPaths} onClose={() => setCompareOpen(false)} />}
    </div>
  )
}
