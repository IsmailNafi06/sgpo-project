import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodesPath = path.join(dataDir, 'nodes_all.json')
const edgesPath = path.join(dataDir, 'edges.json')
const cacheDir = path.join(root, 'tools', 'cache')
const pageCachePath = path.join(cacheDir, 'scrape-pages.json')
const sitemapCachePath = path.join(cacheDir, 'scrape-sitemaps.json')
const reportPath = path.join(root, 'tools', 'scrape-report.json')

const config = {
  concurrency: Number(process.env.SCRAPE_CONCURRENCY || 8),
  timeoutMs: Number(process.env.SCRAPE_TIMEOUT_MS || 18000),
  maxPages: Number(process.env.SCRAPE_MAX_PAGES || 0),
  refresh: process.env.SCRAPE_REFRESH === '1',
  limits: {
    formation: Number(process.env.SCRAPE_LIMIT_FORMATIONS || 0),
    metier: Number(process.env.SCRAPE_LIMIT_METIERS || 0),
    ecole: Number(process.env.SCRAPE_LIMIT_ECOLES || 0),
    article: Number(process.env.SCRAPE_LIMIT_ARTICLES || 0),
  },
}

const sourceSitemaps = [
  { source: '9rayti', url: 'https://www.9rayti.com/sitemap.xml' },
  { source: 'postbac', url: 'https://postbac.ma/sitemap.xml' },
  { source: 'maroc-tawjih', url: 'https://maroc-tawjih.com/sitemap.xml' },
  { source: 'tawjeehsup', url: 'https://tawjeehsup.ma/sitemap.xml' },
  { source: 'e-tawjihi', url: 'https://e-tawjihi.ma/sitemap.xml' },
  { source: 'enssup', url: 'https://www.enssup.gov.ma/sitemap.xml' },
  { source: 'cursussup', url: 'https://www.cursussup.gov.ma/sitemap.xml' },
]

const seedPages = [
  ['maroc-tawjih', 'https://maroc-tawjih.com/formations/'],
  ['maroc-tawjih', 'https://maroc-tawjih.com/bts/'],
  ['maroc-tawjih', 'https://maroc-tawjih.com/dut/'],
  ['maroc-tawjih', 'https://maroc-tawjih.com/ensa/'],
  ['maroc-tawjih', 'https://maroc-tawjih.com/encg/'],
  ['maroc-tawjih', 'https://maroc-tawjih.com/pge/'],
  ['postbac', 'https://postbac.ma/fiches-metiers/'],
  ['postbac', 'https://postbac.ma/metiers/'],
  ['postbac', 'https://postbac.ma/tests-metiers/'],
  ['tawjeehsup', 'https://tawjeehsup.ma/'],
  ['e-tawjihi', 'https://e-tawjihi.ma/'],
  ['cursussup', 'https://www.cursussup.gov.ma/'],
  ['enssup', 'https://www.enssup.gov.ma/'],
]

const readJson = async (file, fallback) => {
  try {
    return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
  } catch (error) {
    if (fallback !== undefined) return fallback
    throw error
  }
}

const writeJson = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const idFrom = (value) => {
  const hex = crypto.createHash('sha1').update(`sgpo:${value}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const decodeEntities = (value = '') =>
  String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&eacute;/gi, 'e')
    .replace(/&egrave;/gi, 'e')
    .replace(/&agrave;/gi, 'a')
    .replace(/&ccedil;/gi, 'c')
    .replace(/&ndash;|&mdash;/gi, '-')

const stripHtml = (html = '') =>
  decodeEntities(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')

const cleanText = (value = '') =>
  decodeEntities(value)
    .replace(/[\u0600-\u06FF]+/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const canonical = (value = '') =>
  cleanText(value)
    .toLowerCase()
    .replace(/\b(au|aux|de|des|du|d|la|le|les|l|et|en|a)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const normalize = (value = '') => cleanText(value).toUpperCase()

const decodePercentRepeated = (value = '') => {
  let current = String(value)
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(current)
      if (decoded === current) break
      current = decoded
    } catch {
      break
    }
  }
  return current
}

const hasEncodedGarbage = (value = '') => /%[0-9a-f]{2}|25D8|25D9|25EF|25BA|25BB/i.test(String(value))

const isReadableFrenchLabel = (value = '') => {
  const text = cleanText(decodePercentRepeated(value))
  if (hasEncodedGarbage(text)) return false
  if (!/[A-Za-z]{3}/.test(text)) return false
  if (/^(metiers?|fiches metiers?|tests metiers?|formations?|secteurs? de formation|orientation)$/i.test(text)) return false
  return true
}

const titleToCode = (value = '') =>
  normalize(value)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100)

const sourceFromUrl = (url) => {
  if (url.includes('9rayti.com')) return '9rayti'
  if (url.includes('postbac.ma')) return 'postbac'
  if (url.includes('maroc-tawjih.com')) return 'maroc-tawjih'
  if (url.includes('tawjeehsup.ma')) return 'tawjeehsup'
  if (url.includes('e-tawjihi.ma')) return 'e-tawjihi'
  if (url.includes('enssup.gov.ma')) return 'enssup'
  if (url.includes('cursussup.gov.ma')) return 'cursussup'
  return 'web'
}

const kindFromUrl = (url) => {
  const pathname = new URL(url).pathname
  if (/\/(?:metiers?|fiches-metiers|tests-metiers)\/?$/i.test(pathname)) return 'article'
  if (/\/formation\//i.test(url)) return 'formation'
  if (/\/metier\//i.test(url) || /\/metiers/i.test(url) || /fiches-metiers/i.test(url)) return 'metier'
  if (/\/ecole\//i.test(url) || /\/etablissement/i.test(url)) return 'ecole'
  return 'article'
}

const extractLocs = (xml = '') => [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => decodeEntities(match[1]).trim())

const fetchText = async (url) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; SGPO-Data-Enricher/1.0; +http://localhost)',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    const text = await response.text()
    return { ok: response.ok, status: response.status, text }
  } catch (error) {
    return { ok: false, status: 0, text: '', error: error.message }
  } finally {
    clearTimeout(timeout)
  }
}

let pageCache = await readJson(pageCachePath, {})
let sitemapCache = await readJson(sitemapCachePath, {})
let pageCacheDirty = 0
let sitemapCacheDirty = 0

const cachedFetchSitemap = async (url) => {
  if (!config.refresh && sitemapCache[url]) return sitemapCache[url]
  const result = await fetchText(url)
  const entry = {
    url,
    status: result.status,
    ok: result.ok,
    error: result.error || '',
    locs: result.ok ? extractLocs(result.text) : [],
    isSitemapIndex: /<sitemapindex\b/i.test(result.text),
    fetchedAt: new Date().toISOString(),
  }
  sitemapCache[url] = entry
  sitemapCacheDirty += 1
  return entry
}

const expandSitemap = async (url, seen = new Set()) => {
  if (seen.has(url)) return []
  seen.add(url)

  const entry = await cachedFetchSitemap(url)
  if (!entry.ok) return []

  if (entry.isSitemapIndex || entry.locs.some((loc) => /sitemap/i.test(loc))) {
    const nested = []
    for (const loc of entry.locs) {
      if (/sitemap/i.test(loc)) nested.push(...(await expandSitemap(loc, seen)))
      else nested.push(loc)
    }
    return nested
  }

  return entry.locs
}

const extractTitle = (html = '') => {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  const og = html.match(/<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)/i)?.[1]
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return cleanPageTitle(h1 || og || title || '')
}

const extractDescription = (html = '') => {
  const direct = html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)/i)?.[1]
  const reverse = html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)?.[1]
  const og = html.match(/<meta\b[^>]*property=["']og:description["'][^>]*content=["']([^"']+)/i)?.[1]
  return cleanText(direct || reverse || og || '')
}

const cleanPageTitle = (title = '') =>
  cleanText(title)
    .replace(/\s*[-|]\s*9rayti\.com\s*$/i, '')
    .replace(/\s*[-|]\s*POSTBAC Maroc\s*$/i, '')
    .replace(/\s*[-|]\s*Maroc Tawjih\s*$/i, '')
    .replace(/^Accueil\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()

const getPageSummary = async (url, sourceHint) => {
  if (!config.refresh && pageCache[url]) return pageCache[url]
  const result = await fetchText(url)
  const text = result.ok ? cleanText(stripHtml(result.text)).slice(0, 12000) : ''
  const summary = {
    url,
    source: sourceHint || sourceFromUrl(url),
    kind: kindFromUrl(url),
    status: result.status,
    ok: result.ok,
    error: result.error || '',
    title: result.ok ? extractTitle(result.text) : '',
    description: result.ok ? extractDescription(result.text) : '',
    text,
    fetchedAt: new Date().toISOString(),
  }
  pageCache[url] = summary
  pageCacheDirty += 1
  if (pageCacheDirty % 40 === 0) await writeJson(pageCachePath, pageCache)
  return summary
}

const runLimited = async (items, worker, concurrency) => {
  const results = []
  let next = 0
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

const nodes = await readJson(nodesPath)
const edges = await readJson(edgesPath)

const report = {
  startedAt: new Date().toISOString(),
  config,
  sources: {},
  pagesSelected: 0,
  pagesFetchedOrCached: 0,
  nodesBefore: nodes.length,
  edgesBefore: edges.length,
  nodesAdded: 0,
  nodesRemoved: 0,
  nodesUpdated: 0,
  edgesAdded: 0,
  edgesRemoved: 0,
  duplicateEdgesMerged: 0,
  skipped: [],
}

const cleanupBadScrapedNodes = () => {
  const badIds = new Set()
  const keptNodes = nodes.filter((node) => {
    const badSchoolSubpage =
      node.type === 'ETABLISSEMENT' &&
      /^SCRAPE_9RAYTI_ECOLE_/i.test(node.code || '') &&
      /(?:_ACTUALITE|_INSCRIPTION)$/i.test(node.code || '')

    const badMetier =
      node.type === 'METIER' &&
      (/^SCRAPE_9RAYTI_METIER_25/i.test(node.code || '') ||
        hasEncodedGarbage(`${node.code || ''} ${node.nom_fr || ''}`) ||
        !isReadableFrenchLabel(node.nom_fr || ''))

    if (!badSchoolSubpage && !badMetier) return true
    badIds.add(node.id)
    report.nodesRemoved += 1
    return false
  })

  if (!badIds.size) return

  const keptEdges = edges.filter((edge) => {
    if (!badIds.has(edge.source_id) && !badIds.has(edge.target_id)) return true
    report.edgesRemoved += 1
    return false
  })

  nodes.length = 0
  nodes.push(...keptNodes)
  edges.length = 0
  edges.push(...keptEdges)
}

cleanupBadScrapedNodes()

const nodesByCode = new Map(nodes.map((node) => [node.code, node]))
const nodesById = new Map(nodes.map((node) => [node.id, node]))
const nodeCodeByTypeLabel = new Map()
for (const node of nodes) {
  nodeCodeByTypeLabel.set(`${node.type}|${canonical(node.nom_fr)}`, node.code)
}

let edgeKeySet = new Set(edges.map((edge) => `${edge.source_id}|${edge.target_id}|${edge.type_lien}`))

const cleanupScrapedInferenceEdges = () => {
  const filtered = edges.filter((edge) => {
    if (edge.type_lien !== 'RECRUTEMENT') return true
    if (!String(edge.prerequis_notes || '').startsWith('Debouche inferred depuis les mots-cles')) return true
    report.edgesRemoved += 1
    return false
  })
  edges.length = 0
  edges.push(...filtered)
  edgeKeySet = new Set(edges.map((edge) => `${edge.source_id}|${edge.target_id}|${edge.type_lien}`))
}

cleanupScrapedInferenceEdges()

const schemaNode = ({
  type,
  code,
  nom_fr,
  nom_ar = '',
  description = '',
  duree_mois = 0,
  cout_estime = 0,
  secteur = '',
  ville = null,
  score_ia = 0,
}) => ({
  id: idFrom(`node:${code}`),
  type,
  code,
  nom_fr,
  nom_ar,
  description,
  duree_mois,
  cout_estime,
  secteur,
  ville,
  score_ia,
  actif: true,
})

const sourceDescription = (summary, fallback = '') => {
  const base = cleanText(summary.description || fallback || summary.text.slice(0, 420))
  const short = base.length > 650 ? `${base.slice(0, 650).replace(/\s+\S*$/, '')}.` : base
  return cleanText(`${short} Source: ${summary.url}`)
}

const addOrUpdateNode = (payload) => {
  const labelKey = `${payload.type}|${canonical(payload.nom_fr)}`
  const existingByLabel = nodeCodeByTypeLabel.get(labelKey)
  const code = existingByLabel || payload.code
  const existing = nodesByCode.get(code)

  if (existing) {
    let changed = false
    const fillable = ['nom_fr', 'nom_ar', 'description', 'duree_mois', 'cout_estime', 'secteur', 'ville', 'score_ia']
    for (const key of fillable) {
      const value = payload[key]
      if (value === undefined || value === null || value === '') continue
      const current = existing[key]
      if ((current === null || current === undefined || current === '' || current === 0) && value !== 0) {
        existing[key] = value
        changed = true
      }
    }
    if (payload.duree_mois && Number(existing.duree_mois || 0) < payload.duree_mois && shouldPreferLongDuration(existing, payload)) {
      existing.duree_mois = payload.duree_mois
      changed = true
    }
    if (payload.description && !String(existing.description || '').includes(payload.sourceUrl || payload.nom_fr)) {
      const currentDescription = cleanText(existing.description || '')
      if (currentDescription.length < 220 || currentDescription.startsWith('Metier cible du secteur')) {
        existing.description = payload.description
        changed = true
      }
    }
    if (changed) report.nodesUpdated += 1
    return existing
  }

  const node = schemaNode({ ...payload, code })
  nodes.push(node)
  nodesByCode.set(node.code, node)
  nodesById.set(node.id, node)
  nodeCodeByTypeLabel.set(labelKey, node.code)
  report.nodesAdded += 1
  return node
}

const shouldPreferLongDuration = (existing, payload) => {
  if (existing.type !== 'FILIERE') return false
  const text = normalize(`${existing.code} ${existing.nom_fr} ${payload.nom_fr}`)
  return /MASTER|MASTERE|INGENIEUR|PGE|MEDECINE|PHARMACIE|DENTAIRE/.test(text)
}

const addEdge = ({
  source,
  target,
  type_lien,
  taux_reussite = 70,
  cout_supplementaire = 0,
  duree_supplementaire_mois = 0,
  prerequis_notes = '',
  moyenne_minimale = null,
  type_acces = 'DOSSIER',
}) => {
  const sourceNode = nodesByCode.get(source)
  const targetNode = nodesByCode.get(target)
  if (!sourceNode || !targetNode) return null

  const key = `${sourceNode.id}|${targetNode.id}|${type_lien}`
  if (edgeKeySet.has(key)) return null

  const edge = {
    id: idFrom(`edge:${key}`),
    source_id: sourceNode.id,
    target_id: targetNode.id,
    type_lien,
    taux_reussite,
    cout_supplementaire,
    duree_supplementaire_mois,
    prerequis_notes,
    moyenne_minimale,
    type_acces,
  }
  edges.push(edge)
  edgeKeySet.add(key)
  report.edgesAdded += 1
  return edge
}

const ensureJob = (code, label, sector, summary = null) =>
  addOrUpdateNode({
    type: 'METIER',
    code,
    nom_fr: label,
    description: summary ? sourceDescription(summary, `Metier du secteur ${sector}.`) : `Metier cible du secteur ${sector}.`,
    secteur: sector,
    sourceUrl: summary?.url,
  })

const cityFromText = (value = '') => {
  const text = normalize(value)
  const cities = [
    ['Casablanca', ['CASABLANCA', 'CASA']],
    ['Rabat', ['RABAT']],
    ['Marrakech', ['MARRAKECH']],
    ['Fes', ['FES', 'FEZ']],
    ['Tanger', ['TANGER']],
    ['Agadir', ['AGADIR']],
    ['Oujda', ['OUJDA']],
    ['Kenitra', ['KENITRA']],
    ['Settat', ['SETTAT']],
    ['Mohammedia', ['MOHAMMEDIA']],
    ['Meknes', ['MEKNES']],
    ['Tetouan', ['TETOUAN']],
    ['El Jadida', ['EL JADIDA', 'JADIDA']],
    ['Beni Mellal', ['BENI MELLAL']],
    ['Safi', ['SAFI']],
    ['Laayoune', ['LAAYOUNE']],
    ['Guelmim', ['GUELMIM']],
    ['Al Hoceima', ['AL HOCEIMA']],
    ['Berkane', ['BERKANE']],
    ['Nador', ['NADOR']],
  ]
  return cities.find(([, aliases]) => aliases.some((alias) => text.includes(alias)))?.[0] || null
}

const sectorRules = [
  ['Informatique', ['informatique', 'digital', 'data', 'donnee', 'cyber', 'reseau', 'telecom', 'logiciel', 'ia', 'intelligence artificielle', 'systeme d information']],
  ['Finance', ['finance', 'comptabilite', 'audit', 'banque', 'assurance', 'gestion', 'actuariat', 'fiscalite']],
  ['Commerce et gestion', ['commerce', 'marketing', 'management', 'vente', 'communication', 'business', 'entrepreneuriat']],
  ['Ingenierie', ['ingenieur', 'genie', 'mecanique', 'electrique', 'industriel', 'energetique', 'electronique', 'automatique']],
  ['BTP', ['civil', 'btp', 'travaux publics', 'batiment', 'architecture', 'urbanisme']],
  ['Sante', ['medecine', 'pharmacie', 'dentaire', 'infirmier', 'sante', 'biomedical', 'kinese', 'paramedical']],
  ['Droit', ['droit', 'juridique', 'juriste', 'notariat']],
  ['Education', ['education', 'enseignement', 'professeur', 'pedagogie']],
  ['Logistique', ['logistique', 'supply chain', 'transport']],
  ['Agroalimentaire', ['agro', 'agriculture', 'alimentaire', 'biologie']],
  ['Tourisme', ['tourisme', 'hotellerie', 'restauration']],
  ['Arts et medias', ['journalisme', 'media', 'audiovisuel', 'design', 'art', 'cinema']],
]

const inferSector = (value = '') => {
  const text = canonical(value)
  return sectorRules.find(([, keys]) => keys.some((key) => text.includes(canonical(key))))?.[0] || 'Orientation'
}

const inferDuration = (value = '') => {
  const text = normalize(value)
  const programName = normalize(String(value).split(' - ')[0])
  if (/MEDECINE DENTAIRE|DENTAIRE/.test(programName)) return 72
  if (/PHARMACIE|PHARMACIEN/.test(programName)) return 72
  if (/DOCTORAT.*MEDECINE|DOCTEUR.*MEDECINE|DIPLOME.*MEDECINE|MEDECIN/.test(programName)) return 84
  if (/BAC\+5|BAC 5|MASTER|MASTERE|MBA|PGE|PROGRAMME GRANDE ECOLE|INGENIEUR|CYCLE INGENIEUR/.test(text)) return 60
  if (/BAC\+4|BAC 4|BACHELOR/.test(text)) return 48
  if (/BAC\+3|BAC 3|LICENCE|LST|LP\b/.test(text)) return 36
  if (/BAC\+2|BAC 2|DUT|BTS|DEUST|CPGE|TECHNICIEN SPECIALISE/.test(text)) return 24
  return 0
}

const jobRules = [
  [['data science', 'big data', 'intelligence artificielle', 'machine learning', 'analytics'], [['DATA_SCIENTIST', 'Data scientist', 'Informatique'], ['DATA_ENGINEER', 'Data engineer', 'Informatique'], ['DATA_ANALYST', 'Data analyst', 'Informatique']]],
  [['cyber', 'securite informatique'], [['INGENIEUR_CYBERSECURITE', 'Ingenieur cybersecurite', 'Informatique'], ['ANALYSTE_CYBERSECURITE', 'Analyste cybersecurite', 'Informatique']]],
  [['informatique', 'logiciel', 'developpement web', 'genie logiciel'], [['DEVELOPPEUR_FULL_STACK', 'Developpeur full stack', 'Informatique'], ['INGENIEUR_GENIE_INFORMATIQUE', 'Ingenieur genie informatique', 'Informatique']]],
  [['reseau', 'telecom'], [['INGENIEUR_RESEAU_ET_TELECOMS', 'Ingenieur reseaux et telecoms', 'Informatique'], ['ADMINISTRATEUR_SYSTEMES_RESEAUX', 'Administrateur systemes et reseaux', 'Informatique']]],
  [['comptabilite', 'audit', 'finance', 'controle de gestion'], [['COMPTABLE', 'Comptable', 'Finance'], ['EXPERT_COMPTABLE', 'Expert comptable', 'Finance'], ['AUDITEUR_FINANCIER', 'Auditeur financier', 'Finance'], ['ANALYSTE_FINANCIER', 'Analyste financier', 'Finance']]],
  [['marketing', 'communication digitale'], [['RESPONSABLE_MARKETING_DIGITAL', 'Responsable marketing digital', 'Commerce et gestion'], ['COMMUNITY_MANAGER', 'Community manager', 'Arts et medias']]],
  [['management', 'gestion des entreprises', 'business administration'], [['MANAGER_COMMERCIAL', 'Manager commercial', 'Commerce et gestion'], ['BUSINESS_ANALYST', 'Business analyst', 'Finance']]],
  [['logistique', 'supply chain', 'transport'], [['RESPONSABLE_LOGISTIQUE', 'Responsable logistique', 'Logistique'], ['SUPPLY_CHAIN_MANAGER', 'Supply chain manager', 'Logistique']]],
  [['genie civil', 'travaux publics', 'batiment'], [['INGENIEUR_GENIE_CIVIL', 'Ingenieur genie civil', 'BTP'], ['CONDUCTEUR_DE_TRAVAUX_BTP', 'Conducteur de travaux BTP', 'BTP']]],
  [['genie electrique', 'electrotechnique', 'electronique'], [['INGENIEUR_ELECTRIQUE', 'Ingenieur electrique', 'Ingenierie']]],
  [['genie mecanique', 'maintenance industrielle'], [['INGENIEUR_MECANIQUE', 'Ingenieur mecanique', 'Ingenierie'], ['TECHNICIEN_MAINTENANCE_INDUSTRIELLE', 'Technicien maintenance industrielle', 'Industrie']]],
  [['medecine', 'docteur en medecine'], [['MEDECIN_GENERALISTE', 'Medecin generaliste', 'Sante']]],
  [['pharmacie'], [['PHARMACIEN', 'Pharmacien', 'Sante'], ['PHARMACIEN_INDUSTRIEL', 'Pharmacien industriel', 'Sante']]],
  [['dentaire'], [['DENTISTE', 'Dentiste', 'Sante']]],
  [['droit', 'juridique'], [['JURISTE_D_AFFAIRES', 'Juriste d affaires', 'Droit'], ['AVOCAT', 'Avocat', 'Droit']]],
  [['enseignement', 'education'], [['ENSEIGNANT_SECONDAIRE', 'Enseignant secondaire', 'Education']]],
  [['journalisme', 'audiovisuel', 'media'], [['JOURNALISTE', 'Journaliste', 'Arts et medias'], ['COMMUNITY_MANAGER', 'Community manager', 'Arts et medias']]],
  [['architecture', 'urbanisme'], [['ARCHITECTE', 'Architecte', 'BTP']]],
  [['tourisme', 'hotellerie'], [['CONCIERGE_DHOTEL', 'Concierge d hotel', 'Tourisme'], ['REVENUE_MANAGER_HOTELLERIE', 'Revenue manager hotellerie', 'Tourisme']]],
  [['agro', 'biologie', 'alimentaire'], [['INGENIEUR_AGROALIMENTAIRE', 'Ingenieur agroalimentaire', 'Agroalimentaire'], ['TECHNOLOGUE_ALIMENTAIRE', 'Technologue alimentaire', 'Agroalimentaire']]],
]

const inferJobs = (value = '') => {
  const text = canonical(value)
  const jobs = []
  for (const [keywords, targets] of jobRules) {
    if (keywords.some((keyword) => text.includes(canonical(keyword)))) jobs.push(...targets)
  }
  return [...new Map(jobs.map((job) => [job[0], job])).values()].slice(0, 5)
}

const bacGroups = {
  scientific: ['BAC_SM', 'BAC_PC', 'BAC_SVT', 'BAC_SE'],
  engineering: ['BAC_SM', 'BAC_PC', 'BAC_SE', 'BAC_TECH_ELEC', 'BAC_TECH_MECA'],
  economy: ['BAC_ECO', 'BAC_GC', 'BAC_SM', 'BAC_SE'],
  literature: ['BAC_LETTRES', 'BAC_SH'],
  all: ['BAC_SM', 'BAC_PC', 'BAC_SVT', 'BAC_SE', 'BAC_ECO', 'BAC_GC', 'BAC_LETTRES', 'BAC_SH', 'BAC_TECH_ELEC', 'BAC_TECH_MECA'],
}

const existingBacs = (codes) => codes.filter((code) => nodesByCode.has(code))

const bacsForSector = (sector) => {
  if (sector === 'Finance' || sector === 'Commerce et gestion' || sector === 'Logistique') return existingBacs(bacGroups.economy)
  if (sector === 'Droit' || sector === 'Education' || sector === 'Arts et medias') return existingBacs([...bacGroups.literature, ...bacGroups.economy])
  if (sector === 'Ingenierie' || sector === 'BTP' || sector === 'Informatique') return existingBacs(bacGroups.engineering)
  if (sector === 'Sante' || sector === 'Agroalimentaire') return existingBacs(bacGroups.scientific)
  return existingBacs(bacGroups.all)
}

const extractSchoolFromText = (summary, title) => {
  const text = summary.text
  const patterns = [
    /Ecole\s+(.{3,90}?)\s+type de formation/i,
    /Etablissement\s+(.{3,90}?)\s+(?:type de formation|secteurs|presentation)/i,
    /Institut\s+(.{3,90}?)\s+type de formation/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)?.[1]
    if (match) return cleanSchoolName(match)
  }

  const pieces = cleanText(title).split(/\s+-\s+/)
  if (pieces.length > 1) {
    const candidate = pieces[pieces.length - 1]
    if (/^[A-Z0-9]{2,}\b/.test(candidate) || cityFromText(candidate) || /ecole|faculte|institut|universite|ensa|encg|est|fst|fsjes|ofppt/i.test(candidate)) {
      return cleanSchoolName(candidate)
    }
  }

  return ''
}

const cleanSchoolName = (value = '') =>
  cleanText(value)
    .replace(/\b(Presentation|Formation|Admission|Contact|Secteurs?)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 130)

const extractFormationName = (summary) => {
  const title = cleanPageTitle(summary.title)
  if (!title || title.length < 4) return ''
  return title.replace(/\s*\|\s*.*$/, '').trim()
}

const relevantFormationText = (summary, formationName) => {
  const text = summary.text || ''
  const sectorMatch = text.match(/Secteurs? de formation\s+(.{0,420}?)(?:Introduction|Objectifs|Programme|Admission|Debouches|Conditions|$)/i)?.[1] || ''
  const typeMatch = text.match(/type de formation\s+(.{0,180}?)(?:Secteurs?|Introduction|Objectifs|$)/i)?.[1] || ''
  const brief = text.match(/En Bref\s+(.{0,650}?)(?:Introduction|Presentation|Objectifs|Programme|Admission|$)/i)?.[1] || ''
  return cleanText(`${formationName} ${summary.description} ${typeMatch} ${sectorMatch} ${brief}`)
}

const extractMetierName = (summary) => {
  const slug = decodePercentRepeated(new URL(summary.url).pathname.split('/').filter(Boolean).pop() || '')
  const fromSlug = cleanText(slug.replace(/-/g, ' '))
  const title = cleanPageTitle(summary.title)
    .replace(/^Metier\s*:\s*/i, '')
    .replace(/^Fiche metier\s*:\s*/i, '')
  if (!title || title.length > 90 || /metiers|tests|guide|orientation/i.test(title)) return toTitleCase(fromSlug)
  const asciiWords = title.replace(/[^A-Za-z0-9 '&-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return toTitleCase(asciiWords || fromSlug)
}

const toTitleCase = (value = '') =>
  cleanText(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bD /g, "D'")
    .trim()

const handleMetierPage = (summary) => {
  const label = extractMetierName(summary)
  if (!label || label.length < 3 || !isReadableFrenchLabel(label)) {
    report.skipped.push({ url: summary.url, reason: 'metier-title-empty' })
    return
  }
  const sector = inferSector(`${label} ${summary.description} ${summary.text}`)
  ensureJob(`SCRAPE_${titleToCode(summary.source)}_METIER_${titleToCode(label)}`, label, sector, summary)
}

const handleSchoolPage = (summary) => {
  const label = cleanSchoolName(summary.title)
  if (!label || label.length < 3 || /sitemap|page non trouvee/i.test(label)) return
  const sector = inferSector(`${label} ${summary.description} ${summary.text}`)
  addOrUpdateNode({
    type: 'ETABLISSEMENT',
    code: `SCRAPE_${titleToCode(summary.source)}_ECOLE_${titleToCode(label)}`,
    nom_fr: label,
    description: sourceDescription(summary, `Etablissement du secteur ${sector}.`),
    secteur: sector,
    ville: cityFromText(`${label} ${summary.text}`),
    sourceUrl: summary.url,
  })
}

const handleFormationPage = (summary) => {
  const formationName = extractFormationName(summary)
  if (!formationName || formationName.length < 4 || /page non trouvee|not found|sitemap/i.test(formationName)) {
    report.skipped.push({ url: summary.url, reason: 'formation-title-empty' })
    return
  }

  const sourceText = relevantFormationText(summary, formationName)
  const sector = inferSector(sourceText)
  const duration = inferDuration(sourceText)
  const schoolName = extractSchoolFromText(summary, formationName)
  let school = null

  if (schoolName && !canonical(schoolName).includes(canonical(formationName))) {
    school = addOrUpdateNode({
      type: 'ETABLISSEMENT',
      code: `SCRAPE_${titleToCode(summary.source)}_ECOLE_${titleToCode(schoolName)}`,
      nom_fr: schoolName,
      description: sourceDescription(summary, `Etablissement proposant ${formationName}.`),
      secteur: sector,
      ville: cityFromText(`${schoolName} ${summary.text}`),
      sourceUrl: summary.url,
    })
  }

  const formation = addOrUpdateNode({
    type: 'FILIERE',
    code: `SCRAPE_${titleToCode(summary.source)}_FORMATION_${titleToCode(formationName)}`,
    nom_fr: formationName,
    description: sourceDescription(summary, `Formation du secteur ${sector}.`),
    duree_mois: duration,
    secteur: sector,
    ville: cityFromText(`${formationName} ${schoolName} ${summary.text}`),
    sourceUrl: summary.url,
  })

  if (school) {
    addEdge({
      source: formation.code,
      target: school.code,
      type_lien: 'OFFERTE_PAR',
      taux_reussite: 100,
      type_acces: 'OUVERT',
      prerequis_notes: `Formation recensee sur ${summary.source}.`,
    })
  }

  const admissionTarget = school?.code || formation.code
  const bacs = bacsForSector(sector)
  const min = sector === 'Sante' ? 15 : sector === 'Ingenierie' || sector === 'Informatique' ? 13 : 11
  const access = sector === 'Sante' || sector === 'Ingenierie' ? 'CONCOURS' : 'DOSSIER'
  for (const bac of bacs) {
    addEdge({
      source: bac,
      target: admissionTarget,
      type_lien: 'DONNE_ACCES',
      taux_reussite: sector === 'Sante' ? 68 : 72,
      moyenne_minimale: min,
      type_acces: access,
      prerequis_notes: `Acces indicatif d apres les informations publiques ${summary.source}; verifier le concours et les seuils de l annee.`,
    })
  }

  for (const [code, label, jobSector] of inferJobs(sourceText)) {
    const job = ensureJob(code, label, jobSector)
    addEdge({
      source: formation.code,
      target: job.code,
      type_lien: 'RECRUTEMENT',
      taux_reussite: 74,
      type_acces: 'OUVERT',
      prerequis_notes: `Debouche inferred depuis les mots-cles de la formation: ${sector}.`,
    })
  }
}

const handleArticlePage = (summary) => {
  const text = `${summary.title} ${summary.description} ${summary.text}`
  if (/formations|bts|dut|ensa|encg|pge|master|ingenieur/i.test(text)) {
    for (const [code, label, sector] of inferJobs(text)) ensureJob(code, label, sector)
  }
}

const collectUrls = async () => {
  const candidates = []
  for (const source of sourceSitemaps) {
    const urls = await expandSitemap(source.url)
    report.sources[source.source] = report.sources[source.source] || { sitemap: source.url, discovered: 0, selected: 0, errors: [] }
    report.sources[source.source].discovered += urls.length
    for (const url of urls) {
      if (!/^https?:\/\//i.test(url)) continue
      const kind = kindFromUrl(url)
      if (source.source === '9rayti' && !['formation', 'metier', 'ecole'].includes(kind)) continue
      if (source.source === '9rayti' && kind === 'ecole' && !/\/ecole\/[^/?#]+\/?$/i.test(new URL(url).pathname)) continue
      if (source.source === 'postbac' && !/metier|formation|secteur|orientation|ecole/i.test(url)) continue
      if (source.source === 'maroc-tawjih' && !/formation|bts|dut|ensa|encg|pge|cpge|master|ingenieur|ecole|metier/i.test(url)) continue
      candidates.push({ source: source.source, url, kind })
    }
  }

  for (const [source, url] of seedPages) candidates.push({ source, url, kind: kindFromUrl(url) })

  const byUrl = new Map()
  for (const candidate of candidates) byUrl.set(candidate.url.replace(/\/$/, ''), candidate)

  const grouped = { formation: [], metier: [], ecole: [], article: [] }
  for (const candidate of byUrl.values()) grouped[candidate.kind || 'article'].push(candidate)

  const selected = []
  for (const kind of Object.keys(grouped)) {
    const limit = config.limits[kind]
    const items = grouped[kind].sort((a, b) => a.url.localeCompare(b.url))
    selected.push(...(limit > 0 ? items.slice(0, limit) : items))
  }

  const prioritySeeds = seedPages.map(([source, url]) => ({ source, url, kind: kindFromUrl(url) }))
  const selectedWithSeeds = [...new Map([...prioritySeeds, ...selected].map((item) => [item.url.replace(/\/$/, ''), item])).values()]

  const balanceBySource = (items, maxPages) => {
    if (maxPages <= 0 || items.length <= maxPages) return items

    const sourceOrder = [...sourceSitemaps.map((item) => item.source), ...seedPages.map(([source]) => source)]
    const groupedBySource = new Map()
    for (const item of items) {
      if (!groupedBySource.has(item.source)) groupedBySource.set(item.source, [])
      groupedBySource.get(item.source).push(item)
    }

    const orderedSources = [...new Set(sourceOrder)].filter((source) => groupedBySource.has(source))
    const result = []
    while (result.length < maxPages && orderedSources.some((source) => groupedBySource.get(source)?.length)) {
      for (const source of orderedSources) {
        const bucket = groupedBySource.get(source)
        if (!bucket?.length) continue
        result.push(bucket.shift())
        if (result.length >= maxPages) break
      }
    }
    return result
  }

  const finalItems = config.maxPages > 0 ? balanceBySource(selectedWithSeeds, config.maxPages) : selectedWithSeeds
  for (const item of finalItems) {
    report.sources[item.source] = report.sources[item.source] || { discovered: 0, selected: 0, errors: [] }
    report.sources[item.source].selected += 1
  }
  report.pagesSelected = finalItems.length
  return finalItems
}

const processSummary = (summary) => {
  if (!summary.ok) {
    report.skipped.push({ url: summary.url, status: summary.status, error: summary.error })
    return
  }
  if (summary.kind === 'metier') handleMetierPage(summary)
  else if (summary.kind === 'formation') handleFormationPage(summary)
  else if (summary.kind === 'ecole') handleSchoolPage(summary)
  else handleArticlePage(summary)
}

const removeDirectBacToMasterWhenSchoolExists = () => {
  const offeredProgramIds = new Set(edges.filter((edge) => edge.type_lien === 'OFFERTE_PAR').map((edge) => edge.source_id))
  const filtered = edges.filter((edge) => {
    if (edge.type_lien !== 'DONNE_ACCES') return true
    const source = nodesById.get(edge.source_id)
    const target = nodesById.get(edge.target_id)
    if (!source || !target) return true
    if (source.type !== 'NIVEAU' || target.type !== 'FILIERE') return true
    if (!offeredProgramIds.has(target.id)) return true
    const text = normalize(`${target.code} ${target.nom_fr}`)
    if (!/MASTER|MASTERE|MBA|PGE|PROGRAMME GRANDE ECOLE/.test(text)) return true
    report.edgesRemoved += 1
    return false
  })
  edges.length = 0
  edges.push(...filtered)
}

const dedupeEdges = () => {
  const compacted = new Map()
  for (const edge of edges) {
    const key = `${edge.source_id}|${edge.target_id}|${edge.type_lien}`
    const existing = compacted.get(key)
    if (!existing) {
      compacted.set(key, edge)
      continue
    }
    existing.taux_reussite = Math.max(Number(existing.taux_reussite || 0), Number(edge.taux_reussite || 0)) || null
    existing.cout_supplementaire = Math.min(Number(existing.cout_supplementaire || 0), Number(edge.cout_supplementaire || 0))
    existing.duree_supplementaire_mois = Math.max(Number(existing.duree_supplementaire_mois || 0), Number(edge.duree_supplementaire_mois || 0))
    existing.moyenne_minimale = Math.max(Number(existing.moyenne_minimale || 0), Number(edge.moyenne_minimale || 0)) || existing.moyenne_minimale || edge.moyenne_minimale || null
    if ((edge.prerequis_notes || '').length > (existing.prerequis_notes || '').length) existing.prerequis_notes = edge.prerequis_notes
    if (edge.type_acces === 'CONCOURS') existing.type_acces = 'CONCOURS'
    report.duplicateEdgesMerged += 1
  }
  edges.length = 0
  edges.push(...compacted.values())
  edgeKeySet = new Set(edges.map((edge) => `${edge.source_id}|${edge.target_id}|${edge.type_lien}`))
}

const urls = await collectUrls()

await runLimited(
  urls,
  async (item) => {
    const summary = await getPageSummary(item.url, item.source)
    summary.kind = item.kind
    processSummary(summary)
    report.pagesFetchedOrCached += 1
  },
  config.concurrency,
)

removeDirectBacToMasterWhenSchoolExists()
dedupeEdges()

nodes.sort((a, b) => a.code.localeCompare(b.code))
edges.sort((a, b) => `${a.source_id}${a.target_id}${a.type_lien}`.localeCompare(`${b.source_id}${b.target_id}${b.type_lien}`))

await writeJson(nodesPath, nodes)
await writeJson(edgesPath, edges)
if (pageCacheDirty) await writeJson(pageCachePath, pageCache)
if (sitemapCacheDirty) await writeJson(sitemapCachePath, sitemapCache)

report.nodesAfter = nodes.length
report.edgesAfter = edges.length
report.finishedAt = new Date().toISOString()
await writeJson(reportPath, report)

console.log(JSON.stringify(report, null, 2))
