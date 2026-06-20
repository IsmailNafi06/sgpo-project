import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../contexts/ToastContext'
import HeaderBar from '../components/HeaderBar'
import AdminTable from '../components/AdminTable'
import { adminApi } from '../services/api'

const tabs = ['Dashboard', 'Noeuds', 'Aretes', 'Documents RAG', 'CSV', 'Admins']

const NODE_TYPE_OPTIONS = [
  { value: 'NIVEAU', label: 'Niveau scolaire' },
  { value: 'FILIERE', label: 'Filiere' },
  { value: 'ETABLISSEMENT', label: 'Etablissement' },
  { value: 'METIER', label: 'Metier' },
]

const NODE_TYPE_BADGE = (val) => {
  const map = {
    NIVEAU: 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300',
    FILIERE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
    ETABLISSEMENT: 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300',
    METIER: 'bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300',
  }
  return map[val] || 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
}

const NODE_TYPE_BAR_COLOR = {
  NIVEAU: 'bg-brand-blue',
  FILIERE: 'bg-brand-green',
  ETABLISSEMENT: 'bg-amber-500',
  METIER: 'bg-violet-500',
}

const NODE_TYPE_LABELS = {
  NIVEAU: 'Niveaux scolaires',
  FILIERE: 'Filieres',
  ETABLISSEMENT: 'Etablissements',
  METIER: 'Metiers',
}

const EDGE_TYPE_OPTIONS = [
  { value: 'ADMISSION', label: 'Admission' },
  { value: 'DONNE_ACCES', label: 'Donne acces' },
  { value: 'OFFERTE_PAR', label: 'Offerte par' },
  { value: 'RECRUTEMENT', label: 'Recrutement' },
]

const EDGE_TYPE_LABELS = {
  ADMISSION: 'Admission',
  DONNE_ACCES: 'Donne acces',
  OFFERTE_PAR: 'Offerte par',
  RECRUTEMENT: 'Recrutement',
}

const EDGE_TYPE_BADGE = (val) => {
  const map = {
    ADMISSION: 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300',
    DONNE_ACCES: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
    OFFERTE_PAR: 'bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300',
    RECRUTEMENT: 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300',
  }
  return map[val] || 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
}

const ACCESS_TYPE_OPTIONS = [
  { value: 'OUVERT', label: 'Ouvert' },
  { value: 'CONCOURS', label: 'Concours' },
  { value: 'DOSSIER', label: 'Dossier' },
]

function KpiCard({ label, value, sub, color, bar }) {
  return (
    <div className={`rounded-[1.75rem] p-6 text-white shadow-card ${color}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-white/70">{label}</p>
      <p className="mt-3 text-5xl font-black leading-none">{value}</p>
      {sub && <p className="mt-2 text-sm font-semibold text-white/80">{sub}</p>}
      {bar !== undefined && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/25">
          <div style={{ width: `${bar}%` }} className="h-1.5 rounded-full bg-white transition-all duration-700" />
        </div>
      )}
    </div>
  )
}

const firstDefined = (...values) => values.find((value) => value !== null && value !== undefined && value !== '')

const cleanLabel = (value = '') => {
  const text = String(value || '')
    .replace(/^SCRAPE_[A-Z0-9]+_(FORMATION|ECOLE|METIER)_?/i, '')
    .replace(/^F9R_?/i, '')
    .replace(/^DISPLAY_?/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return '-'
  return text
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\b(Bts|Dut|Cpge|Ensa|Encg|Ensias|Fst|Fsjes|Ofppt|Ia|Si|Rh)\b/g, (word) => word.toUpperCase())
}

const nodeName = (node) =>
  cleanLabel(firstDefined(node?.nomFr, node?.nom_fr, node?.nom, node?.name, node?.label, node?.code, '-'))

const nodeCode = (node) => firstDefined(node?.code, node?.id, '')
const nodeType = (node) => firstDefined(node?.type, node?.nodeType, node?.node_type, 'AUTRE')
const nodeCity = (node) => firstDefined(node?.ville, node?.city, '')
const nodeDuration = (node) => firstDefined(node?.dureeMois, node?.duree_mois, node?.duration, '')
const nodeCost = (node) => firstDefined(node?.coutEstime, node?.cout_estime, node?.cost, '')

const normalizeNode = (node) => ({
  ...node,
  code: nodeCode(node),
  nomFr: nodeName(node),
  type: nodeType(node),
  ville: nodeCity(node),
  dureeMois: nodeDuration(node),
  coutEstime: nodeCost(node),
})

const edgeType = (edge) => firstDefined(edge?.typeLien, edge?.type_lien, edge?.linkType, edge?.link_type, '')
const edgeAccess = (edge) => firstDefined(edge?.typeAcces, edge?.type_acces, edge?.accessType, edge?.access_type, '')
const edgeRate = (edge) => firstDefined(edge?.tauxReussite, edge?.taux_reussite, edge?.successRate, edge?.success_rate, '')
const edgeMinAverage = (edge) => firstDefined(edge?.moyenneMinimale, edge?.moyenne_minimale, edge?.minAverage, edge?.min_average, '')
const edgeCost = (edge) => firstDefined(edge?.coutSupplementaire, edge?.cout_supplementaire, edge?.extraCost, edge?.extra_cost, '')
const edgeDuration = (edge) =>
  firstDefined(edge?.dureeSupplementaireMois, edge?.duree_supplementaire_mois, edge?.extraDuration, edge?.extra_duration, '')

const nodeLabelForSelect = (node) => `${nodeName(node)}${nodeCity(node) ? ` - ${nodeCity(node)}` : ''}`

const latestLogDate = (logs) => {
  const dates = logs
    .map((log) => firstDefined(log.createdAt, log.created_at, log.date, log.timestamp))
    .map((value) => new Date(value))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())
  return dates[0] || null
}

const decodeJwtPayload = (jwt) => {
  try {
    const payload = jwt.split('.')[1]
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=')
    return JSON.parse(window.atob(paddedPayload))
  } catch {
    return {}
  }
}

const tokenRequiresPasswordChange = (jwt) => Boolean(decodeJwtPayload(jwt).mustChangePassword)

export default function AdminPage() {
  const toast = useToast()
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '')
  const [login, setLogin] = useState({ username: '', password: '' })
  const [mustChangePassword, setMustChangePassword] = useState(() =>
    token ? tokenRequiresPasswordChange(token) : false,
  )
  const [passwordChange, setPasswordChange] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [stats, setStats] = useState(null)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [logs, setLogs] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [ragFile, setRagFile] = useState(null)
  const [ragLoading, setRagLoading] = useState(false)
  const [newAdmin, setNewAdmin] = useState({ username: '', password: '', confirmPassword: '' })
  const [disableUsername, setDisableUsername] = useState('')

  const requiresPasswordChange = Boolean(token) && mustChangePassword
  const isConnected = Boolean(token) && !requiresPasswordChange

  const loadAdminData = async () => {
    const safe = (promise, fallback) => promise.catch(() => fallback)
    const [statsData, nodeData, edgeData, logData] = await Promise.all([
      safe(adminApi.stats(), null),
      safe(adminApi.nodes(), []),
      safe(adminApi.edges(), []),
      safe(adminApi.logs(), []),
    ])
    setStats(statsData)
    setNodes((Array.isArray(nodeData) ? nodeData : nodeData.content || nodeData.nodes || []).map(normalizeNode))
    setEdges(Array.isArray(edgeData) ? edgeData : edgeData.content || edgeData.edges || [])
    setLogs(Array.isArray(logData) ? logData : logData.content || logData.logs || [])
    setLastUpdated(new Date())
  }

  useEffect(() => {
    if (!isConnected) return
    loadAdminData()
  }, [isConnected])

  const computedStats = useMemo(() => {
    const repartition = nodes.reduce((acc, node) => {
      const type = nodeType(node)
      acc[type] = (acc[type] || 0) + 1
      return acc
    }, {})
    const completeNodes = nodes.filter((n) => {
      const type = nodeType(n)
      const hasBase = Boolean(nodeCode(n) && nodeName(n) && type)
      if (!hasBase) return false
      if (type === 'ETABLISSEMENT') return Boolean(nodeCity(n))
      if (type === 'FILIERE') return nodeDuration(n) !== ''
      return true
    }).length
    const completionRate = nodes.length ? Math.round((completeNodes / nodes.length) * 100) : 0
    return {
      totalNodes: stats?.totalNodes ?? stats?.totalNoeuds ?? nodes.length,
      totalEdges: stats?.totalEdges ?? stats?.totalAretes ?? edges.length,
      completeNodes,
      repartition,
      completionRate,
    }
  }, [stats, nodes, edges])

  const nodeIndex = useMemo(() => {
    const map = new Map()
    nodes.forEach((node) => {
      if (node.id) map.set(String(node.id), node)
      if (node.code) map.set(String(node.code), node)
    })
    return map
  }, [nodes])

  const normalizedEdges = useMemo(
    () =>
      edges.map((edge) => {
        const sourceId = firstDefined(edge.source?.id, edge.sourceId, edge.source_id, edge.source?.code, edge.sourceCode)
        const targetId = firstDefined(edge.target?.id, edge.targetId, edge.target_id, edge.target?.code, edge.targetCode)
        const source = nodeIndex.get(String(sourceId)) || normalizeNode(edge.source || { id: sourceId, code: sourceId })
        const target = nodeIndex.get(String(targetId)) || normalizeNode(edge.target || { id: targetId, code: targetId })
        return {
          ...edge,
          source,
          target,
          sourceId: source?.id || sourceId,
          targetId: target?.id || targetId,
          typeLien: edgeType(edge),
          typeAcces: edgeAccess(edge),
          moyenneMinimale: edgeMinAverage(edge),
          tauxReussite: edgeRate(edge),
          coutSupplementaire: edgeCost(edge),
          dureeSupplementaireMois: edgeDuration(edge),
        }
      }),
    [edges, nodeIndex],
  )

  const submitLogin = async (event) => {
    event.preventDefault()
    try {
      const data = await adminApi.login(login)
      const jwt = data['access-token'] || data.token || data.jwt || data.accessToken
      if (!jwt) throw new Error('Token absent')
      localStorage.setItem('adminToken', jwt)
      setToken(jwt)
      setMustChangePassword(tokenRequiresPasswordChange(jwt))
    } catch {
      toast('Connexion impossible. Verifiez les identifiants et assurez-vous que le service est lance.', 'error')
    }
  }

  const submitPasswordChange = async (event) => {
    event.preventDefault()

    if (passwordChange.newPassword !== passwordChange.confirmPassword) {
      toast('La confirmation ne correspond pas au nouveau mot de passe.', 'error')
      return
    }

    try {
      const data = await adminApi.changePassword({
        oldPassword: passwordChange.oldPassword,
        newPassword: passwordChange.newPassword,
      })
      const jwt = data['access-token'] || data.token || data.jwt || data.accessToken
      if (!jwt) throw new Error('Token absent')
      localStorage.setItem('adminToken', jwt)
      setToken(jwt)
      setMustChangePassword(false)
      setPasswordChange({ oldPassword: '', newPassword: '', confirmPassword: '' })
      toast(data.message || 'Mot de passe mis a jour avec succes.', 'success')
    } catch (error) {
      toast(error.response?.data?.message || 'Changement de mot de passe impossible.', 'error')
    }
  }

  const logout = () => {
    localStorage.removeItem('adminToken')
    setToken('')
    setMustChangePassword(false)
    setPasswordChange({ oldPassword: '', newPassword: '', confirmPassword: '' })
  }

  const refreshAfter = async (action) => {
    await action()
    await loadAdminData()
  }

  const normalizeNodePayload = (payload) => ({
    ...payload,
    dureeMois: payload.dureeMois ? Number(payload.dureeMois) : null,
    coutEstime: payload.coutEstime ? Number(payload.coutEstime) : null,
    actif: true,
  })

  const normalizeEdgePayload = (payload) => ({
    source: { id: payload.sourceId },
    target: { id: payload.targetId },
    typeLien: payload.typeLien || 'ADMISSION',
    typeAcces: payload.typeAcces || null,
    tauxReussite: payload.tauxReussite ? Number(payload.tauxReussite) : null,
    coutSupplementaire: payload.coutSupplementaire ? Number(payload.coutSupplementaire) : null,
    dureeSupplementaireMois: payload.dureeSupplementaireMois ? Number(payload.dureeSupplementaireMois) : null,
    moyenneMinimale: payload.moyenneMinimale ? Number(payload.moyenneMinimale) : null,
  })

  const downloadCsv = async (type) => {
    const blob = type === 'edges' ? await adminApi.exportEdgesCsv() : await adminApi.exportNodesCsv()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `e-tawjihi-${type}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const uploadCsv = async (event, type) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (type === 'edges') {
      await adminApi.uploadEdgesCsv(file)
    } else {
      await adminApi.uploadNodesCsv(file)
    }
    await loadAdminData()
    toast('CSV importe avec succes.', 'success')
  }

  const uploadRagDocument = async (event) => {
    event.preventDefault()

    if (!ragFile) {
      toast('Selectionnez un document TXT, PDF ou CSV.', 'error')
      return
    }

    setRagLoading(true)
    try {
      const response = await adminApi.uploadRagDocument(ragFile)
      toast(response?.message || 'Document RAG importe avec succes.', 'success')
      setRagFile(null)
      event.target.reset()
    } catch (error) {
      toast(error.response?.data?.message || "L'import du document RAG a echoue.", 'error')
    } finally {
      setRagLoading(false)
    }
  }

  const submitDisableAdmin = async (event) => {
    event.preventDefault()
    if (!disableUsername.trim()) return
    try {
      const data = await adminApi.disableAdmin(disableUsername.trim())
      toast(data.message || 'Administrateur désactivé.', 'success')
      setDisableUsername('')
    } catch (error) {
      toast(error.response?.data?.message || 'Désactivation impossible.', 'error')
    }
  }

  const submitCreateAdmin = async (event) => {
    event.preventDefault()
    if (newAdmin.password !== newAdmin.confirmPassword) {
      toast('Les mots de passe ne correspondent pas.', 'error')
      return
    }
    try {
      const data = await adminApi.createAdmin({ username: newAdmin.username, password: newAdmin.password })
      toast(data.message || 'Administrateur cree avec succes.', 'success')
      setNewAdmin({ username: '', password: '', confirmPassword: '' })
    } catch (error) {
      toast(error.response?.data?.message || 'Creation impossible.', 'error')
    }
  }

  const formatDate = (date) => {
    if (!date) return null
    return {
      time: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      day: date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    }
  }

  const nodeFields = [
    {
      key: 'nomFr',
      label: 'Nom complet',
      full: true,
      placeholder: 'ex: Bac Sciences Physiques',
      cellClass: 'min-w-[320px] font-semibold text-brand-navy dark:text-slate-100',
      display: (val, item) => (
        <div>
          <p>{val || cleanLabel(item.code)}</p>
          <p className="mt-1 max-w-[420px] truncate text-xs font-medium text-slate-400">{item.code}</p>
        </div>
      ),
    },
    { key: 'code', label: 'Code', placeholder: 'ex: BAC_SP', table: false },
    { key: 'type', label: 'Type', options: NODE_TYPE_OPTIONS, badge: NODE_TYPE_BADGE },
    { key: 'ville', label: 'Ville', placeholder: 'ex: Rabat' },
    { key: 'dureeMois', label: 'Duree (mois)', inputType: 'number', placeholder: '24', display: (val) => val || '-' },
    { key: 'coutEstime', label: 'Cout estime (MAD)', inputType: 'number', placeholder: '5000', display: (val) => val || '0' },
  ]

  const edgeFields = [
    {
      key: 'sourceId',
      label: 'Source',
      options: nodes.map((n) => ({ value: String(n.id), label: nodeLabelForSelect(n) })),
      cellClass: 'min-w-[360px] font-semibold text-brand-navy dark:text-slate-100',
      display: (_val, item) => (
        <div>
          <p>{nodeName(item.source)}</p>
          <p className="mt-1 max-w-[420px] truncate text-xs font-medium text-slate-400">{nodeCode(item.source)}</p>
        </div>
      ),
    },
    {
      key: 'targetId',
      label: 'Cible',
      options: nodes.map((n) => ({ value: String(n.id), label: nodeLabelForSelect(n) })),
      cellClass: 'min-w-[360px] font-semibold text-brand-navy dark:text-slate-100',
      display: (_val, item) => (
        <div>
          <p>{nodeName(item.target)}</p>
          <p className="mt-1 max-w-[420px] truncate text-xs font-medium text-slate-400">{nodeCode(item.target)}</p>
        </div>
      ),
    },
    {
      key: 'typeLien',
      label: 'Type de lien',
      options: EDGE_TYPE_OPTIONS,
      badge: EDGE_TYPE_BADGE,
      display: (val) => EDGE_TYPE_LABELS[val] || val || '-',
    },
    {
      key: 'typeAcces',
      label: "Type d'acces",
      options: ACCESS_TYPE_OPTIONS,
      display: (val) => val || '-',
    },
    { key: 'moyenneMinimale', label: 'Moyenne min.', inputType: 'number', placeholder: '12.0' },
    { key: 'tauxReussite', label: 'Taux reussite %', inputType: 'number', placeholder: '80' },
    { key: 'coutSupplementaire', label: 'Cout supp. (MAD)', inputType: 'number', placeholder: '0' },
    { key: 'dureeSupplementaireMois', label: 'Duree supp. (mois)', inputType: 'number', placeholder: '0' },
  ]

  if (requiresPasswordChange) {
    return (
      <div className="app-shell">
        <HeaderBar right={<button type="button" onClick={logout} className="secondary-btn px-6 py-3 text-base">Annuler</button>} />
        <main className="mx-auto flex min-h-[calc(100vh-104px)] max-w-5xl items-center px-4 py-10">
          <section className="grid w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="bg-brand-navy p-8 text-white sm:p-10">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-brand-green">Securite admin</p>
              <h1 className="mt-5 max-w-sm text-4xl font-black leading-tight">Changement requis</h1>
              <p className="mt-4 max-w-sm text-sm leading-7 text-slate-200">
                Pour proteger le back office, le mot de passe initial doit etre remplace avant d'acceder au tableau de bord.
              </p>
            </div>
            <form onSubmit={submitPasswordChange} className="p-8 sm:p-10">
              <p className="text-sm font-bold uppercase tracking-wide text-brand-blue">Premiere connexion</p>
              <h2 className="mt-2 text-3xl font-black text-brand-navy dark:text-white">Definir un nouveau mot de passe</h2>
              <div className="mt-8 space-y-5">
                <div>
                  <label className="label">Ancien mot de passe</label>
                  <input
                    type="password"
                    value={passwordChange.oldPassword}
                    onChange={(e) => setPasswordChange((current) => ({ ...current, oldPassword: e.target.value }))}
                    className="field bg-slate-50"
                    required
                  />
                </div>
                <div>
                  <label className="label">Nouveau mot de passe</label>
                  <input
                    type="password"
                    value={passwordChange.newPassword}
                    onChange={(e) => setPasswordChange((current) => ({ ...current, newPassword: e.target.value }))}
                    className="field bg-slate-50"
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <label className="label">Confirmation</label>
                  <input
                    type="password"
                    value={passwordChange.confirmPassword}
                    onChange={(e) => setPasswordChange((current) => ({ ...current, confirmPassword: e.target.value }))}
                    className="field bg-slate-50"
                    minLength={8}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="primary-btn mt-7 w-full">Changer le mot de passe</button>
            </form>
          </section>
        </main>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="app-shell">
        <HeaderBar />
        <main className="mx-auto flex min-h-[calc(100vh-104px)] max-w-5xl items-center px-4 py-10">
          <section className="grid w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="bg-brand-navy p-8 text-white sm:p-10">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-brand-green">Back office</p>
              <h1 className="mt-5 max-w-sm text-4xl font-black leading-tight">Administration E-Tawjihi</h1>
              <p className="mt-4 max-w-sm text-sm leading-7 text-slate-200">
                Acces securise pour maintenir les donnees d'orientation, les parcours et la base documentaire RAG.
              </p>
              <div className="mt-10 grid gap-3 text-sm font-semibold text-slate-100">
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">Donnees scolaires structurees</div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">Import CSV et documents RAG</div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">Suivi des transitions et noeuds</div>
              </div>
            </div>
            <form onSubmit={submitLogin} className="p-8 sm:p-10">
              <p className="text-sm font-bold uppercase tracking-wide text-brand-blue">Connexion administrateur</p>
              <h2 className="mt-2 text-3xl font-black text-brand-navy dark:text-white">Bienvenue</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Connectez-vous pour gerer le referentiel SGPO.</p>
              <div className="mt-8 space-y-5">
                <div>
                  <label className="label">Identifiant</label>
                  <input value={login.username} onChange={(e) => setLogin((current) => ({ ...current, username: e.target.value }))} className="field bg-slate-50" required />
                </div>
                <div>
                  <label className="label">Mot de passe</label>
                  <input type="password" value={login.password} onChange={(e) => setLogin((current) => ({ ...current, password: e.target.value }))} className="field bg-slate-50" required />
                </div>
              </div>
              <button type="submit" className="primary-btn mt-7 w-full">Se connecter</button>
            </form>
          </section>
        </main>
      </div>
    )
  }

  const latestAdminAction = formatDate(latestLogDate(logs))
  const loadedAt = formatDate(lastUpdated)
  const repartitionTotal = Object.values(computedStats.repartition).reduce((s, v) => s + v, 0)
  const repartitionEntries = Object.entries(computedStats.repartition).sort(([, a], [, b]) => b - a)

  return (
    <div className="app-shell">
      <HeaderBar right={<button type="button" onClick={logout} className="secondary-btn px-6 py-3 text-base">Deconnexion</button>} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-brand-blue">Back office</p>
            <h1 className="mt-1 text-4xl font-black text-brand-navy dark:text-white">Administration E-Tawjihi</h1>
          </div>
        </div>

        <nav className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {tabs.map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`tab-btn ${activeTab === tab ? 'tab-btn-active' : ''}`}>
              {tab}
            </button>
          ))}
        </nav>

        {activeTab === 'Dashboard' && (
          <div className="space-y-6">
            {/* KPI row */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Total noeuds" value={computedStats.totalNodes} color="bg-brand-blue" />
              <KpiCard label="Total transitions" value={computedStats.totalEdges} color="bg-brand-green" />
              <KpiCard
                label="Taux de completude"
                value={`${computedStats.completionRate}%`}
                sub={`${computedStats.completeNodes} / ${nodes.length} noeuds exploitables`}
                color="bg-brand-navy"
                bar={computedStats.completionRate}
              />
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-card dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Derniere action admin</p>
                {latestAdminAction ? (
                  <>
                    <p className="mt-3 text-2xl font-black text-brand-navy dark:text-white">{latestAdminAction.time}</p>
                    <p className="mt-1 text-xs font-semibold capitalize text-slate-500">{latestAdminAction.day}</p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-xl font-black text-brand-navy dark:text-white">Aucune modification</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {loadedAt ? `Donnees chargees a ${loadedAt.time}` : 'Donnees non chargees'}
                    </p>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => loadAdminData()}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-blueSoft px-3 py-1.5 text-xs font-bold text-brand-blue transition hover:bg-brand-blueSoft/60 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
                >
                  Rafraichir
                </button>
              </div>
            </div>

            {/* Distribution + Logs */}
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Repartition par type */}
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-card dark:border-slate-800 dark:bg-slate-900">
                <p className="mb-5 text-xs font-black uppercase tracking-wide text-slate-400">Repartition par type</p>
                {repartitionEntries.length === 0 && (
                  <p className="text-center text-sm text-slate-400">Aucune donnee</p>
                )}
                <div className="space-y-5">
                  {repartitionEntries.map(([type, count], i) => {
                    const pct = repartitionTotal ? Math.round((count / repartitionTotal) * 100) : 0
                    const colors = ['bg-brand-blue', 'bg-brand-green', 'bg-amber-500', 'bg-violet-500', 'bg-rose-500']
                    const barColor = NODE_TYPE_BAR_COLOR[type] || colors[i % colors.length]
                    return (
                      <div key={type}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{NODE_TYPE_LABELS[type] || type}</span>
                          <span className="text-sm font-black text-brand-navy dark:text-slate-100">
                            {count}{' '}
                            <span className="font-normal text-slate-400">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            style={{ width: `${pct}%` }}
                            className={`h-2.5 rounded-full ${barColor} transition-all duration-700`}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Activite recente (logs) */}
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-card dark:border-slate-800 dark:bg-slate-900">
                <p className="mb-5 text-xs font-black uppercase tracking-wide text-slate-400">Activite recente</p>
                {logs.length === 0 && (
                  <p className="text-center text-sm text-slate-400">Aucune activite enregistree</p>
                )}
                <div className="space-y-3">
                  {logs.slice(0, 6).map((log, index) => {
                    const action = (log.action || log.event || '').toUpperCase()
                    const isCreate = action.includes('CREAT') || action.includes('ADD')
                    const isDelete = action.includes('DELET') || action.includes('SUPPR')
                    const dotColor = isCreate ? 'bg-brand-green' : isDelete ? 'bg-rose-500' : 'bg-brand-blue'
                    return (
                      <div key={log.id || index} className="flex items-start gap-3">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-brand-navy dark:text-white">
                            {log.action || log.event || 'Action'}
                          </p>
                          <p className="truncate text-xs text-slate-500">{log.message || log.details || ''}</p>
                        </div>
                        <p className="shrink-0 text-xs text-slate-400">{log.createdAt || log.date || ''}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'Noeuds' && (
          <AdminTable
            title="Gestion des noeuds"
            items={nodes}
            fields={nodeFields}
            onCreate={(payload) => refreshAfter(() => adminApi.createNode(normalizeNodePayload(payload)))}
            onUpdate={(id, payload) => refreshAfter(() => adminApi.updateNode(id, normalizeNodePayload(payload)))}
            onDelete={(id) => refreshAfter(() => adminApi.deleteNode(id))}
          />
        )}
        {activeTab === 'Aretes' && (
          <AdminTable
            title="Gestion des transitions"
            items={normalizedEdges}
            fields={edgeFields}
            onCreate={(payload) => refreshAfter(() => adminApi.createEdge(normalizeEdgePayload(payload)))}
            onUpdate={(id, payload) => refreshAfter(() => adminApi.updateEdge(id, normalizeEdgePayload(payload)))}
            onDelete={(id) => refreshAfter(() => adminApi.deleteEdge(id))}
          />
        )}
        {activeTab === 'Documents RAG' && (
          <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-5 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-xs font-black uppercase tracking-wide text-brand-blue">Base de connaissances</p>
              <h2 className="mt-1 text-2xl font-black text-brand-navy dark:text-white">Documents RAG</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Ajoutez des contenus de reference pour enrichir les interpretations et les informations metiers.
              </p>
            </div>

            <form onSubmit={uploadRagDocument} className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <label className="label">Document a importer</label>
                <input
                  type="file"
                  accept=".txt,.pdf,.csv,text/plain,application/pdf,text/csv"
                  onChange={(event) => setRagFile(event.target.files?.[0] || null)}
                  className="field bg-slate-50"
                />
                <p className="mt-3 text-sm font-semibold text-slate-500">Formats acceptés : TXT, PDF, CSV</p>
                {ragFile && (
                  <p className="mt-2 text-sm font-bold text-brand-navy dark:text-slate-100">
                    Fichier selectionne : <span className="text-brand-blue">{ragFile.name}</span>
                  </p>
                )}
              </div>
              <button type="submit" disabled={ragLoading} className="primary-btn min-w-[190px]">
                {ragLoading ? 'Import en cours...' : 'Importer le document'}
              </button>
            </form>
          </section>
        )}
        {activeTab === 'CSV' && (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-card dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-2xl font-black text-brand-navy dark:text-white">Import / export CSV</h2>
            <div className="mt-6 flex flex-wrap gap-4">
              <button type="button" onClick={() => downloadCsv('nodes')} className="primary-btn">Exporter noeuds</button>
              <button type="button" onClick={() => downloadCsv('edges')} className="primary-btn">Exporter aretes</button>
              <label className="secondary-btn">
                Importer noeuds
                <input type="file" accept=".csv,text/csv" onChange={(event) => uploadCsv(event, 'nodes')} className="hidden" />
              </label>
              <label className="secondary-btn">
                Importer aretes
                <input type="file" accept=".csv,text/csv" onChange={(event) => uploadCsv(event, 'edges')} className="hidden" />
              </label>
            </div>
          </section>
        )}
        {activeTab === 'Admins' && (
          <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-5 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-xs font-black uppercase tracking-wide text-brand-blue">Gestion des acces</p>
              <h2 className="mt-1 text-2xl font-black text-brand-navy dark:text-white">Creer un administrateur</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Le nouvel administrateur devra changer son mot de passe lors de sa premiere connexion.
              </p>
            </div>
            <form onSubmit={submitCreateAdmin} className="grid gap-5 p-6 sm:max-w-md">
              <div>
                <label className="label">Identifiant</label>
                <input
                  value={newAdmin.username}
                  onChange={(e) => setNewAdmin((c) => ({ ...c, username: e.target.value }))}
                  className="field bg-slate-50"
                  placeholder="ex: admin2"
                  required
                />
              </div>
              <div>
                <label className="label">Mot de passe temporaire</label>
                <input
                  type="password"
                  value={newAdmin.password}
                  onChange={(e) => setNewAdmin((c) => ({ ...c, password: e.target.value }))}
                  className="field bg-slate-50"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className="label">Confirmation</label>
                <input
                  type="password"
                  value={newAdmin.confirmPassword}
                  onChange={(e) => setNewAdmin((c) => ({ ...c, confirmPassword: e.target.value }))}
                  className="field bg-slate-50"
                  minLength={8}
                  required
                />
              </div>
              <button type="submit" className="primary-btn w-full">Creer l'administrateur</button>
            </form>

            <div className="border-t border-slate-100 px-6 py-5 dark:border-slate-800">
              <p className="text-xs font-black uppercase tracking-wide text-rose-500">Zone dangereuse</p>
              <h3 className="mt-1 text-lg font-black text-brand-navy dark:text-white">Désactiver un administrateur</h3>
              <p className="mt-1 text-sm text-slate-500">L'administrateur ne pourra plus se connecter. Action irréversible depuis l'interface.</p>
              <form onSubmit={submitDisableAdmin} className="mt-4 flex gap-3">
                <input
                  value={disableUsername}
                  onChange={(e) => setDisableUsername(e.target.value)}
                  className="field bg-slate-50 flex-1"
                  placeholder="Identifiant à désactiver"
                  required
                />
                <button type="submit" className="rounded-xl bg-rose-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-rose-600">
                  Désactiver
                </button>
              </form>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}



