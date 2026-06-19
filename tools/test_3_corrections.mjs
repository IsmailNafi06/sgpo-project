/**
 * Validation des 3 corrections visuelles
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = join(__dir, '..')

const nodes = JSON.parse(readFileSync(join(ROOT, 'backend/src/main/resources/data/nodes_all.json'), 'utf8'))
const edges = JSON.parse(readFileSync(join(ROOT, 'backend/src/main/resources/data/edges.json'), 'utf8'))
const nmap  = Object.fromEntries(nodes.map(n => [String(n.id), n]))

// ── Fonctions ─────────────────────────────────────────────────────────────────

const norm = (v = '') => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

const schoolKeywords = [
  'FACULTE','FST','FSJES','FLSH','ENA','ENCG','ENSA','ENSIAS','EST',
  'EHTP','ISCAE','ISGA','IGA','EMI','INPT','ECOLE','INSTITUT','UNIVERSITE',
  'FM6P','FMPC','FMPR','FMPK','FMPM','FMPB','FMD','FMDS','FMDC','FMP','FMPDF',
  'UM6SS','UM6P',
]
const looksLikeSchool = v => schoolKeywords.some(kw => norm(v).includes(kw))

const getStepType = s => String(s?.type || 'FILIERE').toUpperCase()
const getStepCode = s => s?.code || s?.id || ''
const getStepName = s =>
  String(s?.nom || s?.nomFr || s?.nom_fr || s?.code || '')
    .replace(/^F9R_/i, '').replace(/^SCRAPE_[A-Z0-9]+_(FORMATION|ECOLE|METIER)_?/i, '')
    .replace(/_/g, ' ').trim()

const isBacSeriesStep = s => norm(getStepCode(s)).startsWith('BAC_')
const isSchoolFormationStep = s => {
  const c = norm(getStepCode(s))
  return c === 'TC' || c.startsWith('1BAC') || c.startsWith('BAC_')
}

const extractCity = name => {
  const cities = ['Casablanca', 'Rabat', 'Marrakech', 'Fes', 'Tanger', 'Agadir', 'Oujda']
  const n = norm(name)
  return cities.find(c => n.includes(norm(c))) || null
}

const splitEmbeddedSchool = step => {
  const name  = String(getStepName(step))
  const parts = name.split(/\s+-\s+/)
  if (parts.length < 2) return null
  const schoolName = parts.slice(1).join(' - ').trim()
  if (!looksLikeSchool(schoolName)) return null
  return {
    programName: parts[0].trim(),
    school: {
      type: 'ETABLISSEMENT',
      nom: schoolName,
      code: 'DISPLAY_' + norm(schoolName).replace(/[^A-Z0-9]+/g, '_'),
      ville: extractCity(schoolName),
      duree: 0,
      displayOnly: true,
    },
  }
}

// ── Correction 1 — isPrivateEducationStep MODIFIÉE ───────────────────────────
const isPrivateStep = s => {
  const txt = norm(`${getStepCode(s)} ${s?.nom || s?.nom_fr || s?.name || ''} ${s?.description || ''}`)
  return /\b(UM6SS|UM6P|FM6P|FM6MD|FM6SS|AUI|MUNDIAPOLIS|ISGA|IGA|EMSI|HEM|SUP.?RH|VATEL|ADALIA|MATCI|OSTELEA|ISIAM|ESCA|HECI|UIR|UPM|UNIVERSITE INTERNATIONALE DE RABAT|UNIVERSITE PRIVEE|ECOLE PRIVEE|INSTITUT PRIVE|EM6MV|EGE|ABULCASIS|FPMM|ESGB|IHE PARIS|SUPMTI|HESTIM|ISFORT|UIC|GROUPE IGS|EUROMED|UEMF|ESIG|ESISA|ESMS|ESP|SUPDECO|AL AKHAWAYN|HEC|ART.?COM|POLYPREPAS|SUP.?H|SUPINFO|BIOMEDTECH)\b/.test(txt)
    || /\bEURO MEDITERR/.test(txt)
}

const isPublicStep = s => {
  if (isPrivateStep(s)) return false
  const txt = norm(`${getStepCode(s)} ${s?.nom || s?.nom_fr || s?.name || ''} ${s?.description || ''}`)
  return /\b(FSJES|FLSH|FST|FSBM|FMP|FMPR|FMPO|FMPC|FMPK|FMPM|FMPB|FMD|FMDS|FMDC|ENCG|ENSA|ENSAM|ENSIAS|ENSEM|ENSC|ENSAD|EMI|EHTP|INPT|INSEA|ISCAE|IAV|ISPITS|AIAC|ENS|ENSET|CFI|CRMEF|CPR)\b/.test(txt)
    || /FACULTE DE MEDECINE ET DE PHARMACIE|FACULTE DE MEDECINE DENTAIRE|FACULTE DE MEDECINE|FACULTE DES SCIENCES ET TECHNIQUES/.test(txt)
}

const getEtabStatus = displaySteps => {
  const pub  = displaySteps.some(isPublicStep)
  const priv = displaySteps.some(isPrivateStep)
  if (pub && !priv) return 'PUBLIC'
  if (priv && !pub) return 'PRIVE'
  if (pub && priv)  return 'MIXTE'
  return ''
}

const getQualityRank = displaySteps => {
  const pub  = displaySteps.some(isPublicStep)
  const priv = displaySteps.some(isPrivateStep)
  if (pub && !priv) return 0
  if (pub && priv)  return 1
  if (priv)         return 2
  return 3
}

// ── Correction 3 — firstBacByTerminal MODIFIÉ ────────────────────────────────
const firstBacByTerminal = {
  BAC_SM:  { code: '1BAC_SM',      nom: '1ere Bac Sciences Mathematiques' },
  BAC_PC:  { code: '1BAC_SE',      nom: '1ere Bac Sciences Experimentales' },
  BAC_SVT: { code: '1BAC_SE',      nom: '1ere Bac Sciences Experimentales' },
  BAC_SE:  { code: '1BAC_SE',      nom: '1ere Bac Sciences Experimentales' },
  BAC_ECO: { code: '1BAC_ECO',     nom: '1ere Bac Sciences Economiques et Gestion' },
  BAC_GC:  { code: '1BAC_ECO',     nom: '1ere Bac Sciences Economiques et Gestion' },
  BAC_SGC: { code: '1BAC_ECO',     nom: '1ere Bac Sciences Economiques et Gestion' },
  BAC_LETTRES:   { code: '1BAC_LETTRES', nom: '1ere Bac Lettres' },
  BAC_SH:        { code: '1BAC_LETTRES', nom: '1ere Bac Lettres' },
  BAC_TECH_ELEC: { code: '1BAC_TECH',   nom: '1ere Bac Sciences et Technologies' },
  BAC_TECH_MECA: { code: '1BAC_TECH',   nom: '1ere Bac Sciences et Technologies' },
  BAC_TECH_CIVIL:{ code: '1BAC_TECH',   nom: '1ere Bac Sciences et Technologies' },
}

const missingFirstBacStep = (previous, current) => {
  if (norm(getStepCode(previous)) !== 'TC') return null
  const tc  = norm(getStepCode(current))
  const fb  = firstBacByTerminal[tc]
  if (!fb) return null
  return { type: 'FILIERE', code: fb.code, nom: fb.nom, nomFr: fb.nom, name: fb.nom, duree: 12, duree_mois: 12, displayOnly: true }
}

const getDisplaySteps = rawSteps => {
  const display = []
  for (const raw of rawSteps) {
    const embedded = splitEmbeddedSchool(raw)
    const prevType = display.length ? getStepType(display[display.length - 1]) : null
    if (embedded && getStepType(raw) === 'FILIERE' && prevType !== 'ETABLISSEMENT') {
      display.push(embedded.school)
    }
    const prev  = display[display.length - 1]
    const synth = prev ? missingFirstBacStep(prev, raw) : null
    if (synth) display.push(synth)
    display.push(embedded ? { ...raw, nom: embedded.programName } : raw)
  }
  return display
}

// ── Correction 2 — getCost + formatCost ──────────────────────────────────────
const inferDuration = s => {
  const txt = norm(`${s?.code || ''} ${s?.nom || s?.nom_fr || ''}`)
  if (/DOCTORAT EN MEDECINE|DOCTEUR EN MEDECINE/.test(txt)) return 84
  if (/DOCTORAT EN PHARMACIE|DOCTORAT PHARMACIE|MEDECINE DENTAIRE/.test(txt)) return 72
  return Number(s?.duree || s?.duree_mois || 0)
}
const privateAnnualCost = s => {
  const txt = norm(`${s?.code || ''} ${s?.nom || s?.nom_fr || ''} ${s?.secteur || ''} ${s?.description || ''}`)
  if (/MEDECINE|DENTAIRE|PHARMACIE/.test(txt)) return 90000
  if (/INGENIEUR|INFORMATIQUE|DATA|CYBER|RESEAUX|GENIE|EMSI|HESTIM/.test(txt)) return 55000
  return 35000
}
const getCost = (rawSteps, displaySteps) => {
  const privateSteps = displaySteps.filter(isPrivateStep)
  const dur = rawSteps.reduce((mx, s) => Math.max(mx, inferDuration(s)), 0)
  const privateCost = privateSteps.length
    ? Math.max(...privateSteps.map(privateAnnualCost)) * Math.max(1, Math.ceil(dur / 12))
    : 0
  if (!privateCost && displaySteps.some(isPublicStep)) return 0
  const backendCost = rawSteps.reduce((s, step) => s + Number(step?.cout_estime || step?.coutEstime || 0), 0)
  return Math.max(Number(backendCost || 0), privateCost)
}

const formatMoney = v => new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(Number(v || 0))
const formatCost = (cost, etabStatus) => {
  if (cost === 0 && etabStatus === 'PUBLIC')  return '✅ Cout public faible'
  if (cost > 150000) return `⚠️  Cout estime total : ${formatMoney(cost)}`
  return `Cout estime ${formatMoney(cost)}`
}

// ── Graphe ────────────────────────────────────────────────────────────────────
const DA  = edges.filter(e => e.type_lien === 'DONNE_ACCES')
const REC = edges.filter(e => e.type_lien === 'RECRUTEMENT')
const bacToFil = {}, filToMet = {}
for (const e of DA)  (bacToFil[e.source_id] ??= []).push({ id: e.target_id, taux: e.taux_reussite })
for (const e of REC) (filToMet[e.source_id] ??= []).push(e.target_id)

const canon = v => String(v).trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')

function findPaths (bacId, metId, ville) {
  const bacNode = nmap[bacId]
  if (!bacNode) return []
  const paths = []
  for (const { id: fid, taux } of (bacToFil[bacId] ?? [])) {
    const fn = nmap[fid]
    if (!fn) continue
    if (!(filToMet[fid] ?? []).includes(metId)) continue
    const mn = nmap[metId]
    if (!mn) continue
    if (fn.ville && fn.ville.toUpperCase() !== ville.toUpperCase()) continue
    if (mn.ville && mn.ville.toUpperCase() !== ville.toUpperCase()) continue
    const rawSteps    = [bacNode, fn, mn]
    const displaySteps = getDisplaySteps(rawSteps)
    const etabStatus  = getEtabStatus(displaySteps)
    const rank        = getQualityRank(displaySteps)
    const cost        = getCost(rawSteps, displaySteps)
    paths.push({ fil: fn.nom_fr || fn.nom_fr, etabStatus, rank, cost, displaySteps, taux })
  }
  return paths.sort((a, b) => b.taux - a.taux || a.rank - b.rank)
}

// ── Nœuds cibles ─────────────────────────────────────────────────────────────
const BAC_PC_ID = '76295ee1-7173-59d3-b492-659129349d51'
const PHARM_ID  = '873f9abe-bb3a-4fb2-a8dd-756bd4c2544a'
const TC_node   = nodes.find(n => n.code === 'TC')
const MED_node  = nodes.find(n => n.code === 'MEDECIN_GENERALISTE')
const FMPC_node = nmap['43d0776b-9262-ef44-2ebe-6a87d05f0960']
const FM6P_node = nmap['37d5f0bc-36d1-2237-74bd-200d91ab5c94']
const PHARM_node= nmap[PHARM_ID]

const SEP = '═'.repeat(68)
const sep = '─'.repeat(68)

function showPaths (label, paths) {
  console.log(`\n${sep}\n  ${label}\n${sep}`)
  if (!paths.length) { console.log('  (0 chemins)'); return }
  for (const p of paths) {
    const badge = p.etabStatus ? `[${p.etabStatus}]` : '[?]'
    console.log(`  ${badge}  ${p.fil?.slice(0, 55)}`)
    console.log(`       ${formatCost(p.cost, p.etabStatus)}`)
    const labels = p.displaySteps.map(s => getStepName(s).slice(0, 18))
    console.log(`       ${labels.join(' → ')}`)
  }
}

console.log(`\n${SEP}\n  VALIDATION — 3 CORRECTIONS VISUELLES\n${SEP}`)

// ── Test 3 : Pharmacien + BAC_PC + Casablanca ─────────────────────────────────
showPaths('Pharmacien + BAC_PC + Casablanca', findPaths(BAC_PC_ID, PHARM_ID, 'Casablanca'))

// ── Test 4 : Pharmacien + TC + Casablanca ─────────────────────────────────────
if (TC_node) {
  console.log(`\n${sep}\n  Pharmacien + TC + Casablanca (Correction 3 — doublon)\n${sep}`)
  const rawStepsTC = [TC_node, nmap[BAC_PC_ID], FMPC_node, PHARM_node]
  const displayTC  = getDisplaySteps(rawStepsTC)
  console.log('  displaySteps :')
  displayTC.forEach((s, i) => console.log(`    [${i}] ${getStepType(s).padEnd(14)} ${getStepName(s)}`))
  const tc1bac = displayTC.filter(s => norm(getStepCode(s)).startsWith('1BAC'))
  const tc2bac = displayTC.filter(s => norm(getStepCode(s)).startsWith('BAC_') && !norm(getStepCode(s)).startsWith('1BAC'))
  console.log(`\n  1ere Bac libellé : "${tc1bac[0] ? getStepName(tc1bac[0]) : '—'}"`)
  console.log(`  2e  Bac libellé  : "${tc2bac[0] ? getStepName(tc2bac[0]) : '—'}"`)
  const stillDuplicate = tc1bac[0] && tc2bac[0] &&
    norm(getStepName(tc1bac[0])).replace(/EXPERIMENTALES.*/,'EXPERIMENTALES') ===
    norm(getStepName(tc2bac[0])).replace(/PHYSIQUES.*|CHIMIE.*/,'').trim()
  console.log(`  Doublon réduit  : ${!stillDuplicate ? '✅ OUI (libellés différents)' : '⚠️  encore similaires'}`)
}

// ── Test 5 : Médecin + BAC_PC + Casablanca ───────────────────────────────────
if (MED_node) showPaths('Medecin + BAC_PC + Casablanca', findPaths(BAC_PC_ID, MED_node.id, 'Casablanca'))

// ── Test 6 & 7 : FM6P badges et coût ─────────────────────────────────────────
console.log(`\n${sep}\n  Tests FM6P\n${sep}`)
const fm6pSynth = { type: 'ETABLISSEMENT', nom: 'FM6P Casablanca', nom_fr: 'FM6P Casablanca', code: 'DISPLAY_FM6P_CASABLANCA', description: '' }
console.log(`  FM6P filière isPrivate : ${isPrivateStep(FM6P_node)} ${isPrivateStep(FM6P_node) ? '✅' : '❌ pas PRIVÉ via filière'}`)
console.log(`  FM6P ETAB synth isPrivate : ${isPrivateStep(fm6pSynth)} ${isPrivateStep(fm6pSynth) ? '✅' : '❌'}`)
const rawFm6p  = [nmap[BAC_PC_ID], FM6P_node, PHARM_node]
const dispFm6p = getDisplaySteps(rawFm6p)
const statusFm6p = getEtabStatus(dispFm6p)
const costFm6p   = getCost(rawFm6p, dispFm6p)
console.log(`\n  FM6P path etabStatus : "${statusFm6p}"  ${statusFm6p === 'PRIVE' ? '✅ badge PRIVÉ' : '❌ badge absent'}`)
console.log(`  FM6P path cost       : ${costFm6p} MAD`)
console.log(`  Affichage coût FM6P  : "${formatCost(costFm6p, statusFm6p)}"`)
console.log(`  ≥150000 → "total"   : ${costFm6p > 150000 ? '✅' : '❌'}`)

// ── Test 8 : FMPC public "Cout public faible" ────────────────────────────────
console.log(`\n${sep}\n  Test FMPC — public doit afficher "Cout public faible"\n${sep}`)
const rawFmpc  = [nmap[BAC_PC_ID], FMPC_node, PHARM_node]
const dispFmpc = getDisplaySteps(rawFmpc)
const statusFmpc = getEtabStatus(dispFmpc)
const costFmpc   = getCost(rawFmpc, dispFmpc)
console.log(`  FMPC etabStatus : "${statusFmpc}"  ${statusFmpc === 'PUBLIC' ? '✅' : '❌'}`)
console.log(`  FMPC cost       : ${costFmpc} MAD`)
console.log(`  Affichage coût  : "${formatCost(costFmpc, statusFmpc)}"  ${statusFmpc === 'PUBLIC' && costFmpc === 0 ? '✅' : '❌'}`)

// ── Récapitulatif ─────────────────────────────────────────────────────────────
console.log(`\n${SEP}\n  RÉCAPITULATIF\n${SEP}`)
const checks = [
  ['6. FM6P badge PRIVÉ',          statusFm6p === 'PRIVE'],
  ['7. FM6P coût affiché "total"', costFm6p > 150000],
  ['8. FMPC "Cout public faible"', statusFmpc === 'PUBLIC' && costFmpc === 0],
]
for (const [label, ok] of checks) console.log(`  ${ok ? '✅' : '❌'} ${label}`)
console.log(SEP)
