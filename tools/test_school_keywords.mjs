/**
 * Test des scénarios post-correction schoolKeywords
 * Simule : normalizeForRules, looksLikeSchool, splitEmbeddedSchool, hasSchoolContext
 * Données réelles issues de nodes_all.json / edges.json
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = join(__dir, '..')

const nodes = JSON.parse(readFileSync(join(ROOT, 'backend/src/main/resources/data/nodes_all.json'), 'utf8'))
const edges = JSON.parse(readFileSync(join(ROOT, 'backend/src/main/resources/data/edges.json'), 'utf8'))

const nmap = Object.fromEntries(nodes.map(n => [String(n.id), n]))

// ── Reproduction des fonctions pathUtils.js ──────────────────────────────────

const normalizeForRules = (s = '') =>
  s.toUpperCase()
    .normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/[''`\-]/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const schoolKeywords = [
  'FACULTE','FST','FSJES','FLSH','ENA','ENCG','ENSA','ENSIAS','EST',
  'EHTP','ISCAE','ISGA','IGA','EMI','INPT','ECOLE','INSTITUT','UNIVERSITE',
  // NOUVEAU
  'FM6P','FMPC','FMPR','FMPK','FMPM','FMPB','FMD','FMDS','FMDC','FMP','FMPDF',
]

const looksLikeSchool = (value = '') =>
  schoolKeywords.some(kw => normalizeForRules(value).includes(kw))

const splitEmbeddedSchool = (nom = '') => {
  const parts = nom.split(/\s+-\s+/)
  if (parts.length < 2) return null
  const schoolName = parts.slice(1).join(' - ').trim()
  if (!looksLikeSchool(schoolName)) return null
  return { programName: parts[0].trim(), school: schoolName }
}

const getStepType = n => n?.type ?? ''
const getStepName = n => n?.nom_fr ?? ''
const getStepCode = n => n?.code ?? ''

const isBacSeriesStep = n => /^BAC_/.test(getStepCode(n) || getStepName(n))

const isSchoolFormationStep = n => {
  const nom = normalizeForRules(getStepName(n))
  return /CPGE|CLASSES PREPARATOIRES/.test(nom)
}

const hasSchoolContext = (steps, index) => {
  const step = steps[index]
  if (getStepType(step) !== 'FILIERE') return true
  if (isBacSeriesStep(step) || isSchoolFormationStep(step)) return true
  if (splitEmbeddedSchool(getStepName(step))) return true
  const prev = steps[index - 1]
  const next = steps[index + 1]
  return getStepType(prev) === 'ETABLISSEMENT' || getStepType(next) === 'ETABLISSEMENT'
}

const isPharmacyProgram = n => {
  const programName = String(getStepName(n)).split(/\s+-\s+/)[0]
  const text = normalizeForRules(`${getStepCode(n)} ${programName} ${n?.secteur || ''}`).replace(/_/g, ' ')
  return /(DOCTORAT|DOCTEUR|DIPLOME).{0,30}PHARMACIE|PHARMACIEN/.test(text) && !/PREPARATEUR|ASSISTANT/.test(text)
}

const isMedecineProgram = n => {
  const programName = String(getStepName(n)).split(/\s+-\s+/)[0]
  const text = normalizeForRules(`${getStepCode(n)} ${programName} ${n?.secteur || ''}`).replace(/_/g, ' ')
  return /(DOCTORAT|DOCTEUR|DIPLOME).{0,30}(MEDECIN|MEDICINE)|MEDECIN GENERALISTE/.test(text) && !isPharmacyProgram(n)
}

const isDentaireProgram = n => {
  const programName = String(getStepName(n)).split(/\s+-\s+/)[0]
  const text = normalizeForRules(`${getStepCode(n)} ${programName} ${n?.secteur || ''}`).replace(/_/g, ' ')
  return /(DOCTORAT|DOCTEUR|DIPLOME).{0,30}(DENTAIRE|DENTIST)|CHIRURGIEN DENTISTE/.test(text)
}

const hasMedicalPath = steps =>
  steps.some(s => isPharmacyProgram(s) || isMedecineProgram(s) || isDentaireProgram(s))

const isCoherentPath = steps => {
  const medical = hasMedicalPath(steps)
  // Simplification : on vérifie uniquement hasSchoolContext (le check qui était bloquant)
  return steps.every((step, i) => hasSchoolContext(steps, i))
}

// ── Construction du graphe in-memory ─────────────────────────────────────────

const DA  = edges.filter(e => e.type_lien === 'DONNE_ACCES')
const REC = edges.filter(e => e.type_lien === 'RECRUTEMENT')
const OFF = edges.filter(e => e.type_lien === 'OFFERTE_PAR')

// Adjacence BAC → FILIERE (via DONNE_ACCES)
const bacToFil = {}
for (const e of DA) {
  if (!bacToFil[e.source_id]) bacToFil[e.source_id] = []
  bacToFil[e.source_id].push(e.target_id)
}

// Adjacence FILIERE → METIER (via RECRUTEMENT)
const filToMet = {}
for (const e of REC) {
  if (!filToMet[e.source_id]) filToMet[e.source_id] = []
  filToMet[e.source_id].push(e.target_id)
}

// Adjacence FILIERE → ETAB (via OFFERTE_PAR — pour info)
const filToEtab = {}
for (const e of OFF) {
  if (!filToEtab[e.source_id]) filToEtab[e.source_id] = []
  filToEtab[e.source_id].push(e.target_id)
}

// ── BFS simplifié : BAC → FILIERE → METIER ───────────────────────────────────

function findPaths(bacId, metierCode, ville = null) {
  const bacNode = nmap[bacId]
  const filières = bacToFil[bacId] || []
  const results = { total: 0, coherent: 0, paths: [], rejected: [] }

  for (const fid of filières) {
    const filNode = nmap[fid]
    if (!filNode) continue
    const metiers = filToMet[fid] || []
    for (const mid of metiers) {
      const metNode = nmap[mid]
      if (!metNode) continue
      const metCode = normalizeForRules(metNode.code || metNode.nom_fr || '')
      if (!metCode.includes(normalizeForRules(metierCode))) continue

      // Filtre ville (backend : contientEtablissementDansVille)
      if (ville) {
        const filVille = filNode.ville
        const metVille = metNode.ville
        if (filVille && filVille.toUpperCase() !== ville.toUpperCase()) continue
        if (metVille && metVille.toUpperCase() !== ville.toUpperCase()) continue
      }

      results.total++
      const steps = [bacNode, filNode, metNode]
      const coherent = isCoherentPath(steps)

      const schoolCtx = hasSchoolContext(steps, 1)
      const split     = splitEmbeddedSchool(getStepName(filNode))
      const etabs     = filToEtab[fid] || []

      if (coherent) {
        results.coherent++
        results.paths.push({
          fil: filNode.nom_fr,
          ville: filNode.ville,
          etabs: etabs.length,
          split: split ? split.school : null,
        })
      } else {
        results.rejected.push({
          fil: filNode.nom_fr,
          ville: filNode.ville,
          schoolCtx,
          split: split ? split.school : null,
          etabs: etabs.length,
        })
      }
    }
  }
  return results
}

// ── Nœuds clés ───────────────────────────────────────────────────────────────

const BAC_PC  = '76295ee1-7173-59d3-b492-659129349d51'
const BAC_SVT = 'e85e8101-794f-57da-ac49-bf1ccd2a4fae'

// Métier codes (simplifiés)
const PHARMACIEN         = 'PHARMACIEN'
const MEDECIN_GEN        = 'MEDECIN'
const CHIRURGIEN_DENT    = 'CHIRURGIEN DENTISTE'

const SEP = '═'.repeat(68)
const sep = '─'.repeat(68)

// ── TESTS ────────────────────────────────────────────────────────────────────

function runTest(label, bacId, metierCode, ville) {
  const r = findPaths(bacId, metierCode, ville)
  const status = r.coherent > 0 ? '✅ PASS' : '❌ FAIL'
  console.log(`\n${sep}`)
  console.log(`  ${status}  ${label}`)
  console.log(`${sep}`)
  console.log(`  Backend (simulé) : ${r.total} chemin(s) retourné(s)`)
  console.log(`  Cohérents        : ${r.coherent} / ${r.total}`)

  if (r.paths.length > 0) {
    console.log(`\n  Parcours affichés :`)
    for (const p of r.paths) {
      console.log(`    ✓ ${p.fil.slice(0,60)}`)
      console.log(`      ville=${p.ville ?? 'null'}  ETABs=${p.etabs}  school="${p.split ?? '(embedded non reconnu)'}"`)
    }
  }

  if (r.rejected.length > 0) {
    console.log(`\n  Rejetés par isCoherentPath :`)
    for (const p of r.rejected.slice(0,5)) {
      console.log(`    ✗ ${p.fil.slice(0,58)}`)
      console.log(`      ville=${p.ville ?? 'null'}  schoolCtx=${p.schoolCtx}  split="${p.split ?? 'null'}"  ETABs=${p.etabs}`)
    }
    if (r.rejected.length > 5) console.log(`    ... +${r.rejected.length - 5} rejetés`)
  }
}

console.log(`\n${SEP}`)
console.log(`  TESTS CORRECTION schoolKeywords — pathUtils.js`)
console.log(`${SEP}`)
console.log(`  schoolKeywords ajoutés : FM6P, FMPC, FMPR, FMPK, FMPM, FMPB, FMD, FMDS, FMDC, FMP, FMPDF`)

// Vérification directe looksLikeSchool
console.log(`\n${sep}`)
console.log(`  Vérification directe looksLikeSchool :`)
const checks = [
  'FM6P Casablanca',
  'Faculte de Medecine et de Pharmacie Casablanca',
  'Faculte de Medecine et de Pharmacie de Rabat',
  'FMP Agadir',
  'FMD Rabat',
  'FMPC Casablanca',
  'Euromed University of Fes',   // doit être FALSE (on vérifie)
]
for (const s of checks) {
  const result = looksLikeSchool(s)
  console.log(`    ${result ? '✓' : '✗'} looksLikeSchool("${s}") → ${result}`)
}

// Vérification splitEmbeddedSchool sur cas concrets
console.log(`\n${sep}`)
console.log(`  splitEmbeddedSchool sur filières médicales :`)
const filNoms = [
  'Doctorat en Pharmacie - FM6P Casablanca',
  'Diplome de Docteur en Pharmacie - Faculte de Medecine et de Pharmacie Casablanca',
  'Doctorat en Medecine - FMP Agadir',
  'Doctorat en Medecine Dentaire - FMD Rabat',
  'Chirurgie Dentaire - FMDS Oujda',
]
for (const nom of filNoms) {
  const r = splitEmbeddedSchool(nom)
  console.log(`    ${r ? '✓' : '✗'} "${nom.slice(0,60)}"`)
  if (r) console.log(`       → school: "${r.school}"`)
}

// TESTS SCÉNARIOS
runTest('Pharmacien + BAC_PC + Casablanca + mobilité Ville',  BAC_PC,  PHARMACIEN,      'Casablanca')
runTest('Pharmacien + BAC_SVT + Casablanca + mobilité Ville', BAC_SVT, PHARMACIEN,      'Casablanca')
runTest('Médecin (généraliste) + BAC_PC + Casablanca',        BAC_PC,  MEDECIN_GEN,     'Casablanca')
runTest('Chirurgien dentiste + BAC_PC + Casablanca',          BAC_PC,  CHIRURGIEN_DENT, 'Casablanca')

// Vérification Euromed — ne doit pas apparaître pour Casablanca
console.log(`\n${sep}`)
console.log(`  CHECK Euromed (ne doit pas apparaître pour Casablanca) :`)
const euromeds = nodes.filter(n =>
  /EUROMED|UEMF/i.test(n.nom_fr || n.code || '') && n.type === 'ETABLISSEMENT'
)
let euromCasa = euromeds.filter(n => (n.ville || '').toLowerCase() === 'casablanca')
console.log(`  ETABs Euromed détectés : ${euromeds.length}`)
console.log(`  ETABs Euromed avec ville=Casablanca : ${euromCasa.length} ${euromCasa.length === 0 ? '✅' : '❌'}`)
if (euromCasa.length > 0) {
  for (const n of euromCasa) console.log(`    ✗ ${n.nom_fr} (ville=${n.ville})`)
}
const euromFil = nodes.filter(n =>
  /EUROMED|UEMF/i.test(n.nom_fr || n.code || '') && n.type === 'FILIERE'
)
let euromFilCasa = euromFil.filter(n => (n.ville || '').toLowerCase() === 'casablanca')
console.log(`  FILIEREs Euromed avec ville=Casablanca : ${euromFilCasa.length} ${euromFilCasa.length === 0 ? '✅' : '❌'}`)

console.log(`\n${SEP}`)
console.log(`  FIN DES TESTS`)
console.log(`${SEP}\n`)
