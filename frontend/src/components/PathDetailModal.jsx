import { useState } from 'react'
import PathDetail from './PathDetail'
import { studentApi } from '../services/api'
import { firstDefined, getCost, getDuration, getScore, getSteps } from '../utils/pathUtils'

const encodeSharePayload = (payload) => {
  const json = JSON.stringify(payload)
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

const buildShareUrl = (token, path) => {
  const payload = encodeSharePayload(toSharePayload(path))
  return `${window.location.origin}/shared/${token}?p=${payload}`
}

const createLocalShare = (path) => {
  const token = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  localStorage.setItem(`sharedPath:${token}`, JSON.stringify(toSharePayload(path)))
  return buildShareUrl(token, path)
}

const saveLocalShare = (token, path) => {
  localStorage.setItem(`sharedPath:${token}`, JSON.stringify(toSharePayload(path)))
}

const toSharePayload = (path) => ({
  id: firstDefined(path?.id, path?.token, `parcours-${Date.now()}`),
  etapes: getSteps(path).map((step) => ({
    code: firstDefined(step?.code, step?.id),
    nom: firstDefined(step?.nom, step?.nomFr, step?.nom_fr, step?.name, step?.label),
    type: firstDefined(step?.type, step?.nodeType, step?.node_type),
    duree: firstDefined(step?.duree, step?.dureeMois, step?.duree_mois, step?.duration, 0),
    ville: firstDefined(step?.ville, step?.city),
    secteur: firstDefined(step?.secteur, step?.sector),
    typeAcces: firstDefined(step?.typeAcces, step?.type_acces, step?.accessType, step?.access_type),
    moyenneMinimale: firstDefined(step?.moyenneMinimale, step?.moyenne_minimale, step?.minAverage, step?.min_average),
    typeLien: firstDefined(step?.typeLien, step?.type_lien, step?.linkType, step?.link_type),
    tauxReussite: firstDefined(step?.tauxReussite, step?.taux_reussite, step?.successRate, step?.success_rate),
  })),
  dureeTotale: Number(getDuration(path) || 0),
  coutTotal: Number(getCost(path) || 0),
  scoreComposite: Number(getScore(path) || 0),
  interpretation: firstDefined(path?.interpretation, path?.interpretationIa, path?.aiInterpretation, ''),
})

export default function PathDetailModal({ path, onClose }) {
  const [shareLink, setShareLink] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  if (!path) return null

  const sharePath = async () => {
    setBusy('share')
    setError('')
    try {
      const data = await studentApi.share(toSharePayload(path))
      const raw = data?.token || data?.shareToken || data?.id || data
      const rawText = String(raw || '')
      const token = (rawText.includes('/shared/') ? rawText.split('/shared/').pop() : rawText.split('/').pop())
        ?.split('?')[0]
        ?.replace(/\/$/, '')
      if (!token) throw new Error('Invalid share link')
      const url = buildShareUrl(token, path)
      saveLocalShare(token, path)
      setShareLink(url)
      await navigator.clipboard?.writeText(url)
    } catch {
      const url = createLocalShare(path)
      setShareLink(url)
      await navigator.clipboard?.writeText(url)
      setError("Lien copie pour ce navigateur. Le partage public n'est pas disponible pour le moment.")
    } finally {
      setBusy('')
    }
  }

  const exportPdf = async () => {
    setBusy('export')
    setError('')
    try {
      const blob = await studentApi.exportPdf(path)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'parcours-e-tawjihi.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setError("L'export PDF a echoue. Reessayez dans quelques instants.")
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-navy/65 p-4 backdrop-blur-sm">
      <div className="relative mx-auto my-6 max-w-5xl rounded-3xl bg-slate-50 p-5 shadow-soft dark:bg-slate-900 sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le detail"
          className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-xl font-black leading-none text-brand-blue shadow-sm transition hover:bg-brand-blue hover:text-white dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-brand-blue dark:hover:text-white"
        >
          ×
        </button>
        <PathDetail
          path={path}
          actions={
            <div className="border-t border-slate-200 pt-5 dark:border-slate-700">
              {(shareLink || error) && (
                <div className="mb-4 text-sm font-semibold text-brand-blue">
                  {shareLink && (
                    <span className="block break-all">
                      Lien copie : <a className="underline" href={shareLink} target="_blank" rel="noreferrer">{shareLink}</a>
                    </span>
                  )}
                  {error && <span className="block text-rose-600">{error}</span>}
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={exportPdf} disabled={busy === 'export'} className="secondary-btn w-full justify-center sm:w-auto">
                  {busy === 'export' ? 'Export...' : 'Exporter en PDF'}
                </button>
                <button type="button" onClick={sharePath} disabled={busy === 'share'} className="secondary-btn w-full justify-center sm:w-auto">
                  {busy === 'share' ? 'Partage...' : 'Partager ce parcours'}
                </button>
                <button type="button" onClick={onClose} className="primary-btn w-full justify-center sm:w-auto">
                  Fermer
                </button>
              </div>
            </div>
          }
        />
      </div>
    </div>
  )
}
