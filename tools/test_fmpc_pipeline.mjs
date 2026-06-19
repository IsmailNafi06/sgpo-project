/**
 * Test pipeline complet — Pharmacien + BAC_PC + Casablanca + mobilité Ville
 * Simule fidèlement : allResults → finalJobMatchesSelection → isCoherentPath → sort
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = join(__dir, '..')

const nodes = JSON.parse(readFileSync(join(ROOT, 'backend/src/main/resources/data/nodes_all.json'), 'utf8'))
const edges = JSON.parse(readFileSync(join(ROOT, 'backend/src/main/resources/data/edges.json'), 'utf8'))
const nmap  = Object.fromEntries(nodes.map(n => [String(n.id), n]))

// ── Fonctions copiées de pathUtils.js / StudentPage.jsx ──────────────────────

const normalizeForRules = (v = '') =>
  String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

const schoolKeywords = [
  'FACULTE','FST','FSJES','FLSH','ENA','ENCG','ENSA','ENSIAS','EST',
  'EHTP','ISCAE','ISGA','IGA','EMI','INPT','ECOLE','INSTITUT','UNIVERSITE',
  'FM6P','FMPC','FMPR','FMPK','FMPM','FMPB','FMD','FMDS','FMDC','FMP','FMPDF',
  'UM6SS','UM6P',
]
const looksLikeSchool = v => schoolKeywords.some(kw => normalizeForRules(v).includes(kw))

const getStepType = s => String(s?.type || 'FILIERE').toUpperCase()
const getStepCode = s => s?.code || s?.id || ''
const getStepName = s =>
  String(s?.nom || s?.nomFr || s?.nom_fr || s?.code || '')
    .replace(/^F9R_/i, '').replace(/_/g, ' ').trim()

const isBacSeriesStep = s => normalizeForRules(getStepCode(s)).startsWith('BAC_')
const isSchoolFormationStep = s => {
  const c = normalizeForRules(getStepCode(s))
  return c === 'TC' || c.startsWith('1BAC') || c.startsWith('BAC_')
}

const extractCityFromName = name => {
  const cities = ['Casablanca','Rabat','Marrakech','Fes','Tanger','Agadir','Oujda']
  const n = normalizeForRules(name)
  return cities.find(c => n.includes(normalizeForRules(c))) || null
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
      code: 'DISPLAY_' + normalizeForRules(schoolName).replace(/[^A-Z0-9]+/g, '_'),
      ville: extractCityFromName(schoolName),
      duree: 0,
      displayOnly: true,
    },
  }
}

const getDisplaySteps = rawSteps => {
  const display = []
  for (const raw of rawSteps) {
    const embedded = splitEmbeddedSchool(raw)
    const prevType = display.length ? getStepType(display[display.length - 1]) : null
    if (embedded && getStepType(raw) === 'FILIERE' && prevType !== 'ETABLISSEMENT') {
      display.push(embedded.school)
    }
    display.push(embedded ? { ...raw, nom: embedded.programName } : raw)
  }
  return display
}

const hasSchoolContext = (steps, i) => {
  const s = steps[i]
  if (getStepType(s) !== 'FILIERE') return true
  if (isBacSeriesStep(s) || isSchoolFormationStep(s)) return true
  if (splitEmbeddedSchool(s)) return true
  const pr = steps[i - 1], nx = steps[i + 1]
  return (pr && getStepType(pr) === 'ETABLISSEMENT') || (nx && getStepType(nx) === 'ETABLISSEMENT')
}

const isPharmacyProgram = s => {
  const pn  = String(getStepName(s)).split(/\s+-\s+/)[0]
  const txt = normalizeForRules(`${getStepCode(s)} ${pn} ${s?.secteur || ''}`).replace(/_/g, ' ')
  return /(DOCTORAT|DOCTEUR|DIPLOME).{0,30}PHARMACIE|PHARMACIEN/.test(txt) && !/PREPARATEUR|ASSISTANT/.test(txt)
}

const isPharmacistJob = s =>
  /\b(PHARMACIEN|PHARMACIEN INDUSTRIEL)\b/.test(normalizeForRules(`${getStepCode(s)} ${getStepName(s)}`).replace(/_/g, ' '))

const hasCompatibleProgramForJob = (steps, job) => {
  const programs = steps.filter(s => getStepType(s) === 'FILIERE')
  if (isPharmacistJob(job)) return programs.some(isPharmacyProgram)
  return true
}

// isPublicEducationStep — ligne 1049 pathUtils.js (regex fidèle)
const isPrivateStep = s => {
  const txt = normalizeForRules(`${getStepCode(s)} ${getStepName(s)} ${s?.description || ''}`)
  return /\b(UM6SS|UM6P|MUNDIAPOLIS|ISGA|IGA|EMSI|HEM|EUROMED|UEMF|UIR|AL AKHAWAYN|VATEL|FM6P)\b/.test(txt)
}

const isPublicStep = s => {
  if (isPrivateStep(s)) return false
  const txt = normalizeForRules(`${getStepCode(s)} ${getStepName(s)} ${s?.description || ''}`)
  return (
    /\b(FSJES|FLSH|FST|FSBM|FMP|FMPR|FMPO|FMPC|FMPK|FMPM|FMPB|FMD|FMDS|FMDC|ENCG|ENSA|ENSAM|ENSIAS|ENSEM|ENSC|ENSAD|EMI|EHTP|INPT|INSEA|ISCAE|IAV|ISPITS|AIAC|ENS|ENSET|CFI|CRMEF|CPR)\b/.test(txt) ||
    /FACULTE DE MEDECINE ET DE PHARMACIE|FACULTE DE MEDECINE DENTAIRE|FACULTE DE MEDECINE|FACULTE DES SCIENCES ET TECHNIQUES/.test(txt)
  )
}

const getQualityRank = displaySteps => {
  const pub  = displaySteps.some(isPublicStep)
  const priv = displaySteps.some(isPrivateStep)
  if (pub  && !priv) return 0
  if (pub  &&  priv) return 1
  if (priv)          return 2
  return 3
}

const getScore = (rawSteps, taux) => {
  let base = taux ?? 65
  const displaySteps = getDisplaySteps(rawSteps)
  if (displaySteps.some(isPublicStep))  base += 7
  if (displaySteps.some(isPrivateStep)) base -= 15
  return Math.min(100, Math.max(0, Math.round(base)))
}

// ── Graphe ────────────────────────────────────────────────────────────────────

const DA  = edges.filter(e => e.type_lien === 'DONNE_ACCES')
const REC = edges.filter(e => e.type_lien === 'RECRUTEMENT')
const OFF = edges.filter(e => e.type_lien === 'OFFERTE_PAR')

const bacToFil = {}, filToMet = {}, filToEtab = {}
for (const e of DA)  { (bacToFil[e.source_id]  ??= []).push({ id: e.target_id, taux: e.taux_reussite }) }
for (const e of REC) { (filToMet[e.source_id]  ??= []).push({ id: e.target_id, taux: e.taux_reussite }) }
for (const e of OFF) { (filToEtab[e.source_id] ??= []).push(e.target_id) }

const BAC_PC_ID = '76295ee1-7173-59d3-b492-659129349d51'
const VILLE     = 'Casablanca'
const selectedJob = { code: 'PHARMACIEN', label: 'Pharmacien', aliases: [] }

const canonicalToken = v =>
  String(v).trim().normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase()
    .replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'')

const bacNode = nmap[BAC_PC_ID]
const allResults = []

for (const { id: fid, taux: tDA } of (bacToFil[BAC_PC_ID] ?? [])) {
  const fn = nmap[fid]
  if (!fn) continue

  for (const { id: mid, taux: tREC } of (filToMet[fid] ?? [])) {
    const mn = nmap[mid]
    if (!mn) continue

    // finalJobMatchesSelection (StudentPage.jsx:212)
    const finalValues    = new Set([canonicalToken(mn.code || ''), canonicalToken(mn.nom_fr || '')])
    const selectedValues = new Set([canonicalToken(selectedJob.code), canonicalToken(selectedJob.label)])
    if (![...selectedValues].some(v => v && finalValues.has(v))) continue

    // Filtre ville backend (contientEtablissementDansVille)
    if (fn.ville && fn.ville.toUpperCase() !== VILLE.toUpperCase()) continue
    if (mn.ville && mn.ville.toUpperCase() !== VILLE.toUpperCase()) continue

    const rawSteps    = [bacNode, fn, mn]
    const displaySteps = getDisplaySteps(rawSteps)
    const finalStep   = rawSteps[rawSteps.length - 1]

    // isCoherentPath
    let rejectReason = null
    if (!hasCompatibleProgramForJob(rawSteps, finalStep)) {
      rejectReason = 'hasCompatibleProgramForJob FAIL'
    } else {
      for (let i = 0; i < displaySteps.length; i++) {
        if (!hasSchoolContext(displaySteps, i)) {
          rejectReason = `hasSchoolContext FAIL idx=${i} "${getStepName(displaySteps[i])}"`
          break
        }
      }
    }

    const etabs = (filToEtab[fid] ?? []).map(eid => (nmap[eid] || {}).nom_fr || eid)
    const rank  = getQualityRank(displaySteps)
    const score = getScore(rawSteps, tDA)

    // schoolContext details for display
    const sp = splitEmbeddedSchool(fn)
    const pubLabel = isPublicStep(fn)  ? '[PUBLIC]'  : ''
    const prvLabel = isPrivateStep(fn) ? '[PRIVÉ]'   : ''

    allResults.push({
      fid, fil: fn.nom_fr, ville: fn.ville, etabs,
      rank, score, tDA,
      coherent: !rejectReason,
      rejectReason,
      displaySteps,
      schoolSplit: sp ? sp.school.nom : null,
      pubLabel, prvLabel,
    })
  }
}

const SEP = '═'.repeat(70)
const sep = '─'.repeat(70)

console.log(`\n${SEP}`)
console.log('  PIPELINE Pharmacien + BAC_PC + Casablanca + mobilité Ville')
console.log(SEP)

// allResults
console.log(`\n  allResults (finalJobMatchesSelection ✅ + filtre ville ✅) : ${allResults.length} chemin(s)`)
for (const p of allResults) {
  console.log(`\n    FILIERE  : ${p.fil}`)
  console.log(`    ville    : ${p.ville}  ETABs=[${p.etabs.join(', ').slice(0,50)}]`)
  console.log(`    isPublic : ${isPublicStep(nmap[p.fid]) ? '✅' : '✗'}  isPrivate : ${isPrivateStep(nmap[p.fid]) ? '✅' : '✗'}`)
  console.log(`    schoolSplit : "${p.schoolSplit ?? '—'}"`)
}

// coherentResults
const coherentResults = allResults.filter(p => p.coherent)
const rejectedResults = allResults.filter(p => !p.coherent)
console.log(`\n  isCoherentPath — coherentResults : ${coherentResults.length}/${allResults.length}`)
if (rejectedResults.length) {
  console.log('  Rejetés :')
  for (const p of rejectedResults) {
    console.log(`    ✗ ${p.fil.slice(0,60)}  → ${p.rejectReason}`)
  }
}

// sortPathsForDisplay
const sortedResults = [...coherentResults].sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score
  if (a.rank  !== b.rank)  return a.rank  - b.rank
  return 0
})

console.log(`\n  RÉSULTATS TRIÉS (sortPathsForDisplay) :`)
console.log(sep)
for (const [i, p] of sortedResults.entries()) {
  const badge = p.rank === 0 ? '🟢 PUBLIC' : p.rank === 2 ? '🔴 PRIVÉ' : p.rank === 1 ? '🟡 MIXTE' : '⚪ ?'
  console.log(`  ${i + 1}. ${badge}  score=${p.score}  rank=${p.rank}`)
  console.log(`     ${p.fil.slice(0, 68)}`)
  console.log(`     ville=${p.ville}  school="${p.schoolSplit ?? p.etabs[0] ?? '—'}"`)
}

// ── Vérification des 4 critères attendus ────────────────────────────────────
const FMPC_ID = '43d0776b-9262-ef44-2ebe-6a87d05f0960'
const iFMPC   = sortedResults.findIndex(p => p.fid === FMPC_ID)
const iFM6P   = sortedResults.findIndex(p => p.fil.includes('FM6P'))

console.log(`\n${sep}`)
console.log('  VÉRIFICATION DES CRITÈRES :')
console.log(`  1. FMPC présent           : ${iFMPC >= 0 ? `✅ position ${iFMPC + 1}` : '❌'}`)
console.log(`  2. FMPC avant FM6P        : ${iFMPC >= 0 && iFM6P >= 0 && iFMPC < iFM6P ? `✅ (FMPC=${iFMPC+1}, FM6P=${iFM6P+1})` : iFMPC >= 0 && iFM6P < 0 ? '✅ (FM6P absent — normal si dedup)' : `❌ FMPC=${iFMPC+1} FM6P=${iFM6P+1}`}`)
console.log(`  3. FMPC badge PUBLIC (rank=0): ${iFMPC >= 0 && sortedResults[iFMPC].rank === 0 ? '✅' : `❌ rank=${iFMPC >= 0 ? sortedResults[iFMPC].rank : '—'}`}`)
console.log(`  4. FM6P présent           : ${iFM6P >= 0 ? `✅ position ${iFM6P + 1}` : '⚠️  absent (dedup probable)'}`)
console.log(SEP + '\n')
