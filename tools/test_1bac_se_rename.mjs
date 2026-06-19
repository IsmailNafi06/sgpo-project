/**
 * Test post-renommage 1BAC_SE
 * Vérifie l'affichage de la chaîne 3AC → TC → 1BAC SE → BAC → FMPC → Pharmacien
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = join(__dir, '..')

const nodes = JSON.parse(readFileSync(join(ROOT, 'backend/src/main/resources/data/nodes_all.json'), 'utf8'))
const edges = JSON.parse(readFileSync(join(ROOT, 'backend/src/main/resources/data/edges.json'), 'utf8'))
const nmap  = Object.fromEntries(nodes.map(n => [String(n.id), n]))

const norm = (v = '') => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

// ── Helpers frontend (miniature fidèle) ──────────────────────────────────────

const getStepType = s => String(s?.type || 'FILIERE').toUpperCase()
const getStepCode = s => s?.code || s?.id || ''
const getStepName = s =>
  String(s?.nom_fr || s?.nom || s?.code || '').replace(/^F9R_/i,'').replace(/_/g,' ').trim()

const schoolKeywords = [
  'FACULTE','FST','FSJES','FLSH','ENA','ENCG','ENSA','ENSIAS','EST',
  'EHTP','ISCAE','ISGA','IGA','EMI','INPT','ECOLE','INSTITUT','UNIVERSITE',
  'FM6P','FMPC','FMPR','FMPK','FMPM','FMPB','FMD','FMDS','FMDC','FMP','FMPDF',
  'UM6SS','UM6P',
]
const looksLikeSchool = v => schoolKeywords.some(kw => norm(v).includes(kw))

const splitEmbeddedSchool = step => {
  const name  = getStepName(step)
  const parts = name.split(/\s+-\s+/)
  if (parts.length < 2) return null
  const schoolName = parts.slice(1).join(' - ').trim()
  if (!looksLikeSchool(schoolName)) return null
  return {
    programName: parts[0].trim(),
    school: { type: 'ETABLISSEMENT', nom: schoolName, code: 'DISPLAY_' + norm(schoolName).replace(/[^A-Z0-9]+/g,'_'), ville: null, duree: 0, displayOnly: true },
  }
}

const firstBacByTerminal = {
  BAC_SM:  { code: '1BAC_SM',      nom: '1ere Bac Sciences Mathematiques' },
  BAC_PC:  { code: '1BAC_SE',      nom: '1ere Bac Sciences Experimentales' },
  BAC_SVT: { code: '1BAC_SE',      nom: '1ere Bac Sciences Experimentales' },
  BAC_SE:  { code: '1BAC_SE',      nom: '1ere Bac Sciences Experimentales' },
  BAC_ECO: { code: '1BAC_ECO',     nom: '1ere Bac Sciences Economiques et Gestion' },
}

const missingFirstBacStep = (prev, curr) => {
  if (norm(getStepCode(prev)) !== 'TC') return null
  const tc = norm(getStepCode(curr))
  const fb = firstBacByTerminal[tc]
  if (!fb) return null
  return { type: 'FILIERE', code: fb.code, nom: fb.nom, nom_fr: fb.nom, duree_mois: 12, displayOnly: true }
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
    display.push(embedded ? { ...raw, nom: embedded.programName, nom_fr: embedded.programName } : raw)
  }
  return display
}

// ── Graphe ────────────────────────────────────────────────────────────────────
const DA  = edges.filter(e => e.type_lien === 'DONNE_ACCES')
const ADM = edges.filter(e => e.type_lien === 'ADMISSION')
const REC = edges.filter(e => e.type_lien === 'RECRUTEMENT')

const toFil   = {}
const filToMet= {}
for (const e of [...DA, ...ADM]) (toFil[e.source_id]   ??= new Set()).add(e.target_id)
for (const e of REC)             (filToMet[e.source_id] ??= new Set()).add(e.target_id)

// ── Nœuds clés ───────────────────────────────────────────────────────────────
const TC_node    = nodes.find(n => n.code === 'TC')
const BAC_PC     = nodes.find(n => n.code === 'BAC_PC')
const BAC_SVT    = nodes.find(n => n.code === 'BAC_SVT')
const FMPC_node  = nmap['43d0776b-9262-ef44-2ebe-6a87d05f0960']
const FM6P_node  = nmap['37d5f0bc-36d1-2237-74bd-200d91ab5c94']
const PHARM_node = nmap['873f9abe-bb3a-4fb2-a8dd-756bd4c2544a']
const node1BAC_SE= nodes.find(n => n.id === '40227037-e705-4efb-9f6f-4c10b1078f19')

const SEP = '═'.repeat(72)
const sep = '─'.repeat(72)

// ── Vérification du nœud renommé ─────────────────────────────────────────────
console.log(`\n${SEP}`)
console.log('  TEST POST-RENOMMAGE 1BAC_SE')
console.log(SEP)

console.log(`\n  Nœud 1BAC_SE après renommage :`)
console.log(`    ID    : ${node1BAC_SE?.id}`)
console.log(`    code  : ${node1BAC_SE?.code}`)
console.log(`    nom_fr: "${node1BAC_SE?.nom_fr}"`)
const nomOK = node1BAC_SE?.nom_fr === '1ere Bac Sciences Experimentales'
console.log(`    → ${nomOK ? '✅ Renommage confirmé' : '❌ Renommage non appliqué !'}`)

// ── Vérification arêtes TC → 1BAC_SE ─────────────────────────────────────────
console.log(`\n${sep}\n  Arêtes TC → 1BAC_SE (doivent rester intactes)\n${sep}`)
if (TC_node) {
  const tcToSE = [...(toFil[TC_node.id] || [])].filter(id => nmap[id]?.code === '1BAC_SE')
  console.log(`  TC → 1BAC_SE : ${tcToSE.length} arête(s)  ${tcToSE.length > 0 ? '✅' : '❌ MANQUANT'}`)
  for (const id of tcToSE) console.log(`    ${nmap[id]?.nom_fr}`)
}

// ── Test 1 : Pharmacien depuis BAC_PC + Casablanca ────────────────────────────
console.log(`\n${sep}\n  TEST 1 — Pharmacien + BAC_PC + Casablanca\n${sep}`)
{
  const bacId = BAC_PC?.id
  const metId = PHARM_node?.id
  const paths = []
  for (const fid of toFil[bacId] || []) {
    const fn = nmap[fid]
    if (!fn || fn.type !== 'FILIERE') continue
    if (![...(filToMet[fid] || [])].includes(metId)) continue
    if (fn.ville && fn.ville.toUpperCase() !== 'CASABLANCA') continue
    if (PHARM_node.ville && PHARM_node.ville.toUpperCase() !== 'CASABLANCA') continue
    const raw = [BAC_PC, fn, PHARM_node]
    const disp = getDisplaySteps(raw)
    paths.push({ fn, disp })
  }
  console.log(`  ${paths.length} chemin(s) trouvé(s)`)
  for (const { fn, disp } of paths) {
    console.log(`\n  [${fn.nom_fr}]`)
    disp.forEach((s, i) => console.log(`    [${i}] ${getStepType(s).padEnd(14)} "${getStepName(s)}"`))
  }
}

// ── Test 2 : Pharmacien depuis TC + Casablanca ────────────────────────────────
console.log(`\n${sep}\n  TEST 2 — Pharmacien + TC + Casablanca (chaîne complète)\n${sep}`)
{
  const metId = PHARM_node?.id
  // TC → BAC → FILIERE → PHARMACIEN (chaîne 4 nœuds)
  let shown = 0
  for (const bacId of toFil[TC_node?.id] || []) {
    const bacNode = nmap[bacId]
    if (!bacNode || !bacNode.code?.startsWith('BAC_')) continue
    for (const fid of toFil[bacId] || []) {
      const fn = nmap[fid]
      if (!fn || fn.type !== 'FILIERE') continue
      if (![...(filToMet[fid] || [])].includes(metId)) continue
      if (fn.ville && fn.ville.toUpperCase() !== 'CASABLANCA') continue
      const raw = [TC_node, bacNode, fn, PHARM_node]
      const disp = getDisplaySteps(raw)
      if (shown < 4) {
        console.log(`\n  Via BAC: ${bacNode.nom_fr}  → Filière: ${fn.nom_fr?.slice(0,40)}`)
        disp.forEach((s, i) => console.log(`    [${i}] ${getStepType(s).padEnd(14)} "${getStepName(s)}"`))
        shown++
      }
    }
  }
  if (shown === 0) console.log('  (0 chemin via TC)')
}

// ── Test 3 : Chaîne idéale 3AC→TC→1BAC→BAC→FMPC→Pharmacien ─────────────────
console.log(`\n${sep}\n  TEST 3 — Chaîne idéale affichée\n${sep}`)
{
  // Simuler les étapes brutes idéales
  const rawIdeal = [TC_node, BAC_PC, FMPC_node, PHARM_node]
  const dispIdeal = getDisplaySteps(rawIdeal)
  console.log('  rawSteps  : TC → BAC_PC → FMPC → PHARMACIEN')
  console.log('  displaySteps (avec synthèse 1BAC) :')
  dispIdeal.forEach((s, i) => console.log(`    [${i}] ${getStepType(s).padEnd(14)} "${getStepName(s)}"`))

  // Vérifications
  const has1BAC = dispIdeal.some(s => norm(getStepName(s)).includes('1ERE BAC SCIENCES EXPERIMENTALES') && !norm(getStepName(s)).includes('PHYSIQUE') && !norm(getStepName(s)).includes('CHIMIE') && !norm(getStepName(s)).includes('SVT'))
  const hasBacPC= dispIdeal.some(s => norm(getStepName(s)).includes('BAC SCIENCES PHYSIQUES'))
  const hasFMPC = dispIdeal.some(s => norm(getStepName(s)).includes('PHARMACIE') && (norm(getStepName(s)).includes('FMPC') || norm(getStepName(s)).includes('FMP CASABLANCA') || norm(getStepName(s)).includes('MEDECINE ET DE PHARMACIE')))

  console.log(`\n  ✔ 1BAC_SE générique (sans spécialisation) : ${has1BAC ? '✅' : '❌'}`)
  console.log(`  ✔ BAC terminal distinct (Bac Sciences Physiques-Chimie) : ${hasBacPC ? '✅' : '❌'}`)
  console.log(`  ✔ FMPC présent : ${hasFMPC ? '✅' : '❌'}`)

  // Variante SVT
  const rawSVT = [TC_node, BAC_SVT, FMPC_node, PHARM_node]
  const dispSVT = getDisplaySteps(rawSVT)
  console.log('\n  Variante SVT (TC → BAC_SVT → FMPC → Pharmacien) :')
  dispSVT.forEach((s, i) => console.log(`    [${i}] ${getStepType(s).padEnd(14)} "${getStepName(s)}"`))
  const has1BAC_svt = dispSVT.some(s => norm(getStepName(s)) === '1ERE BAC SCIENCES EXPERIMENTALES')
  const hasBacSVT   = dispSVT.some(s => norm(getStepName(s)).includes('BAC SCIENCES DE LA VIE'))
  console.log(`\n  ✔ 1BAC_SE générique identique pour SVT : ${has1BAC_svt ? '✅' : '❌'}`)
  console.log(`  ✔ BAC SVT terminal distinct : ${hasBacSVT ? '✅' : '❌'}`)
}

console.log(`\n${SEP}\n  FIN DES TESTS\n${SEP}\n`)
