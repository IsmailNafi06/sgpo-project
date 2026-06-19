import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import HeaderBar from '../components/HeaderBar'
import PathDetail from '../components/PathDetail'
import { studentApi } from '../services/api'

const decodeSharePayload = (value) => {
  if (!value) return null
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return JSON.parse(decodeURIComponent(escape(atob(padded))))
  } catch {
    return null
  }
}

export default function SharedPage() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const [path, setPath] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const embeddedPath = decodeSharePayload(searchParams.get('p'))
    if (embeddedPath) {
      localStorage.setItem(`sharedPath:${token}`, JSON.stringify(embeddedPath))
      queueMicrotask(() => {
        setPath(embeddedPath)
        setStatus('ready')
      })
      return
    }

    const localPath = localStorage.getItem(`sharedPath:${token}`)
    if (localPath) {
      try {
        const parsedPath = JSON.parse(localPath)
        queueMicrotask(() => {
          setPath(parsedPath)
          setStatus('ready')
        })
        return
      } catch {
        localStorage.removeItem(`sharedPath:${token}`)
      }
    }

    studentApi.shared(token)
      .then((data) => {
        setPath(data.parcours || data.path || data)
        setStatus('ready')
      })
      .catch(() => {
        setStatus('error')
      })
  }, [searchParams, token])

  return (
    <div className="app-shell">
      <HeaderBar right={<Link to="/eleve" className="primary-btn px-6 py-3 text-base">Nouveau parcours</Link>} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {status === 'loading' && (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-card dark:border-slate-800 dark:bg-slate-900">
            <p className="font-bold text-slate-600 dark:text-slate-300">Chargement du parcours partage...</p>
          </div>
        )}
        {status === 'error' && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center shadow-card dark:border-rose-900/60 dark:bg-rose-950/30">
            <h1 className="text-2xl font-black text-rose-900 dark:text-rose-300">Lien introuvable</h1>
            <p className="mt-2 text-rose-700 dark:text-rose-400">Le parcours partage n'est plus disponible ou le token est invalide.</p>
          </div>
        )}
        {status === 'ready' && (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <PathDetail path={path} />
          </div>
        )}
      </main>
    </div>
  )
}

