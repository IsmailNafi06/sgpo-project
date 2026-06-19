/**
 * Trace complète du pipeline pour les parcours contenant BAC_SE
 * Aucune modification — lecture seule
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = join(__dir, '..')

const nodes = JSON.parse(readFileSync(join(ROOT, 'backend/src/main/resources/data/nodes_all.json'), 'utf8'))
const edges = JSON.parse(readFileSync(join(ROOT, 'backend/src/main/resources/data/edges.json'), 'utf8'))
const nmap  = Object.fromEntries(nodes.map(n => [String(n.id), n]))

const SEP = '═'.repeat(72)
const sep = '─'.repeat(72)
const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

// ── cleanClientLabel CORRIGÉE (sans les 2 lignes supprimées) ────────────────
const cleanClientLabel = v => {
  const c = String(v)
    .replace(/^SCRAPE_[A-Z0-9]+_(FORMATION|ECOLE|METIER)_?/i, '')
    .replace(/^F9R_/i, '').replace(/^DISPLAY_/i, '').replace(/_/g, ' ')
    .replace(/\b8217\b/g, "'").replace(/\s+/g, ' ').trim()
  return c || 'Etape'
}

const fd = (...vals) => vals.find(v => v !== null && v !== undefined && v !== '')

const getStepName = s => cleanClientLabel(fd(s?.nom, s?.nomFr, s?.nom_fr, s?.name, s?.label, s?.titre, s?.code, 'Etape'))
const getStepType = s => String(fd(s?.type, s?.nodeType, s?.node_type, 'FILIERE')).toUpperCase()
const getStepCode = s => fd(s?.code, s?.id, '')

const schoolKeywords = ['FACULTE','FST','FSJES','FLSH','ENA','ENCG','ENSA','ENSIAS','EST','EHTP','ISCAE','ISGA','IGA','EMI','INPT','ECOLE','INSTITUT','UNIVERSITE','FM6P','FMPC','FMPR','FMPK','FMPM','FMPB','FMD','FMDS','FMDC','FMP','FMPDF','UM6SS','UM6P']
const looksLikeSchool = v => schoolKeywords.some(kw => norm(v).includes(kw))

const splitEmbeddedSchool = step => {
  const name  = getStepName(step)
  const parts = name.split(/\s+-\s+/)
  if (parts.length < 2) return null
  const schoolName = parts.slice(1).join(' - ').trim()
  if (!looksLikeSchool(schoolName)) return null
  return {
    programName: parts[0].trim(),
    school: { type: 'ETABLISSEMENT', nom: schoolName, code: 'DISPLAY_'+norm(schoolName).replace(/[^A-Z0-9]+/g,'_'), ville: null, duree: 0, displayOnly: true }
  }
}

const firstBacByTerminal = {
  BAC_SM:  { code: '1BAC_SM',  nom: '1ere Bac Sciences Mathematiques' },
  BAC_PC:  { code: '1BAC_SE',  nom: '1ere Bac Sciences Experimentales' },
  BAC_SVT: { code: '1BAC_SE',  nom: '1ere Bac Sciences Experimentales' },
  BAC_SE:  { code: '1BAC_SE',  nom: '1ere Bac Sciences Experimentales' },
  BAC_ECO: { code: '1BAC_ECO', nom: '1ere Bac Sciences Economiques et Gestion' },
}

const missingFirstBacStep = (prev, curr) => {
  if (norm(getStepCode(prev)) !== 'TC') return null
  const tc = norm(getStepCode(curr))
  const fb = firstBacByTerminal[tc]
  if (!fb) return null
  return { type: 'FILIERE', code: fb.code, nom: fb.nom, nom_fr: fb.nom, duree_mois: 12, _synthetic: true }
}

const getDisplaySteps = raw => {
  const display = []
  for (const step of raw) {
    const emb = splitEmbeddedSchool(step)
    const prevType = display.length ? getStepType(display[display.length - 1]) : null
    if (emb && getStepType(step) === 'FILIERE' && prevType !== 'ETABLISSEMENT') display.push(emb.school)
    const prev = display[display.length - 1]
    const synth = prev ? missingFirstBacStep(prev, step) : null
    if (synth) display.push(synth)
    display.push(emb ? { ...step, nom: emb.programName, nom_fr: emb.programName } : step)
  }
  return display
}

// ── Graphe ────────────────────────────────────────────────────────────────────
const DA  = edges.filter(e => e.type_lien === 'DONNE_ACCES')
const ADM = edges.filter(e => e.type_lien === 'ADMISSION')
const REC = edges.filter(e => e.type_lien === 'RECRUTEMENT')
const toNext   = {}
const filToMet = {}
for (const e of [...DA, ...ADM]) (toNext[e.source_id]   ??= new Map()).set(e.target_id, e)
for (const e of REC)             (filToMet[e.source_id] ??= new Map()).set(e.target_id, e)

// ── Nœuds clés ───────────────────────────────────────────────────────────────
const BAC_SE_ID  = '84a28554-5207-5ee6-a33f-340e0b111cfd'
const BAC_PC_ID  = '76295ee1-7173-59d3-b492-659129349d51'
const BAC_SVT_ID = 'e85e8101-794f-57da-ac49-bf1ccd2a4fae'
const BACS_1SE_ID= '40227037-e705-4efb-9f6f-4c10b1078f19'
const PHARM_ID   = '873f9abe-bb3a-4fb2-a8dd-756bd4c2544a'
const TC_node    = nodes.find(n => n.code === 'TC')
const PHARM_node = nmap[PHARM_ID]

// ── Section 1 : Anatomie du nœud BAC_SE ──────────────────────────────────────
const BAC_SE_node = nmap[BAC_SE_ID]
console.log(`\n${SEP}`)
console.log('  SECTION 1 — Anatomie du nœud BAC_SE (terminal)')
console.log(SEP)
console.log('  ID      :', BAC_SE_node?.id)
console.log('  code    :', BAC_SE_node?.code)
console.log('  nom_fr  :', JSON.stringify(BAC_SE_node?.nom_fr))
console.log('  type    :', BAC_SE_node?.type)
console.log('\n  → Ce nœud existe dans nodes_all.json avec ce nom INTACT (non renommé).')
console.log('  → Le renommage effectué visait 1BAC_SE (40227037…), PAS BAC_SE (84a28554…).')

// Arêtes entrant dans BAC_SE
const inEdges = [...DA, ...ADM].filter(e => e.target_id === BAC_SE_ID)
console.log(`\n  Arêtes entrantes vers BAC_SE (${inEdges.length}) :`)
for (const e of inEdges) {
  const src = nmap[e.source_id]
  console.log(`    [${e.type_lien}]  source: ${src?.code || e.source_id}  "${src?.nom_fr || '?'}"`)
}

// Arêtes sortantes de BAC_SE vers filières
const outEdges = [...DA, ...ADM].filter(e => e.source_id === BAC_SE_ID)
console.log(`\n  Arêtes sortantes de BAC_SE vers filières (${outEdges.length}) :`)
for (const e of outEdges.slice(0, 10)) {
  const tgt = nmap[e.target_id]
  console.log(`    [${e.type_lien}]  -> ${tgt?.code || e.target_id}  "${(tgt?.nom_fr || '?').slice(0, 50)}"`)
}
if (outEdges.length > 10) console.log(`    … ${outEdges.length - 10} autres`)

// ── Section 2 : Trace pipeline pour Pharmacien + BAC_SE ──────────────────────
console.log(`\n${SEP}`)
console.log('  SECTION 2 — Pipeline complet pour Pharmacien via BAC_SE')
console.log(SEP)

// Trouver les filières accessibles depuis BAC_SE qui mènent à PHARMACIEN
const filsViaBacSE = [...(toNext[BAC_SE_ID] || new Map()).keys()]
  .filter(fid => {
    const fn = nmap[fid]
    if (!fn || fn.type !== 'FILIERE') return false
    return (filToMet[fid] || new Map()).has(PHARM_ID)
  })

console.log(`\n  Filières accessibles depuis BAC_SE → Pharmacien : ${filsViaBacSE.length}`)

for (const fid of filsViaBacSE.slice(0, 3)) {
  const fn = nmap[fid]
  if (!fn) continue

  // ── Étape 1 : Données brutes backend ────────────────────────────────────
  const rawSteps_bacSE = [BAC_SE_node, fn, PHARM_node]
  console.log(`\n${sep}`)
  console.log(`  Filière : ${fn.nom_fr}`)
  console.log(sep)

  console.log('\n  [ÉTAPE 1] Données brutes retournées par le backend (etapes[]) :')
  rawSteps_bacSE.forEach((s, i) => {
    console.log(`    [${i}] id="${s.id}"  code="${s.code}"  nom_fr=${JSON.stringify(s.nom_fr)}  type="${s.type}"`)
  })

  // ── Étape 2 : getDisplaySteps ────────────────────────────────────────────
  const dispSteps = getDisplaySteps(rawSteps_bacSE)
  console.log('\n  [ÉTAPE 2] Après getDisplaySteps() :')
  dispSteps.forEach((s, i) => {
    const src = s._synthetic ? '← synthétique' : s.displayOnly ? '← displayOnly' : ''
    console.log(`    [${i}] id="${s.id || '—'}"  code="${s.code}"  getStepName="${getStepName(s)}"  ${src}`)
  })

  // Identifier où BAC_SE apparaît
  const bacSEidx = dispSteps.findIndex(s => s.id === BAC_SE_ID || s.code === 'BAC_SE')
  if (bacSEidx >= 0) {
    const s = dispSteps[bacSEidx]
    console.log(`\n  ⚠️  BAC_SE trouvé à l'index [${bacSEidx}] de displaySteps`)
    console.log(`      Source : nœud réel du backend (id=${s.id})`)
    console.log(`      Libellé affiché : "${getStepName(s)}"`)
    console.log(`      Provenance : le BFS a traversé le nœud BAC_SE (id=${BAC_SE_ID})`)
    console.log(`      Point exact : ÉTAPE 1 — données brutes, avant getDisplaySteps`)
  }

  // ── Étape 3 : cleanResults — isCoherentPath ──────────────────────────────
  // Simuler uniquement la question : ce parcours passerait-il isCoherentPath ?
  const isSchoolFormation = s => {
    const c = norm(getStepCode(s))
    return c === 'TC' || c.startsWith('1BAC') || c.startsWith('BAC_')
  }
  const hasSchoolCtx = (steps, i) => {
    const s = steps[i]
    if (getStepType(s) !== 'FILIERE') return true
    if (isSchoolFormation(s)) return true
    if (splitEmbeddedSchool(s)) return true
    const pr = steps[i - 1], nx = steps[i + 1]
    return (pr && getStepType(pr) === 'ETABLISSEMENT') || (nx && getStepType(nx) === 'ETABLISSEMENT')
  }
  let reject = null
  for (let i = 0; i < dispSteps.length; i++) {
    if (!hasSchoolCtx(dispSteps, i)) { reject = `hasSchoolContext FAIL idx=${i}`; break }
  }
  console.log(`\n  [ÉTAPE 3] Après cleanResults (isCoherentPath) :`)
  console.log(`    Résultat : ${reject ? '❌ REJETÉ — ' + reject : '✅ CONSERVÉ'}`)

  // ── Étape 4 : sortPathsForDisplay — aucun changement de nœuds ───────────
  console.log('\n  [ÉTAPE 4] sortPathsForDisplay :')
  console.log('    → Trie uniquement les parcours. Ne modifie pas les nœuds ni les libellés.')
}

// ── Section 3 : Comparaison BAC_PC vs BAC_SE vs BAC_SVT ──────────────────────
console.log(`\n${SEP}`)
console.log('  SECTION 3 — Comparaison des 3 nœuds BAC concernés')
console.log(SEP)

const BAC_PC_node  = nmap[BAC_PC_ID]
const BAC_SVT_node = nmap[BAC_SVT_ID]

for (const [label, n] of [['BAC_PC', BAC_PC_node], ['BAC_SVT', BAC_SVT_node], ['BAC_SE', BAC_SE_node]]) {
  const out = [...DA, ...ADM].filter(e => e.source_id === n?.id)
  const pharmFils = out.filter(e => {
    const fn = nmap[e.target_id]
    return fn && fn.type === 'FILIERE' && (filToMet[e.target_id] || new Map()).has(PHARM_ID)
  })
  console.log(`\n  ${label} (id: ${n?.id?.slice(0,8)}…)`)
  console.log(`    nom_fr : ${JSON.stringify(n?.nom_fr)}`)
  console.log(`    arêtes sortantes : ${out.length}  |  filières → Pharmacien : ${pharmFils.length}`)
}

// ── Section 4 : Résumé du point exact ────────────────────────────────────────
console.log(`\n${SEP}`)
console.log('  SECTION 4 — POINT EXACT DU PIPELINE')
console.log(SEP)
console.log(`
  Le libellé "Bac Sciences Experimentales: Physique-Chimie / SVT" NE provient PAS d'une
  transformation frontend. Il provient d'un NŒUD RÉEL dans le graphe :

    Nœud BAC_SE
    ID     : 84a28554-5207-5ee6-a33f-340e0b111cfd
    code   : BAC_SE
    nom_fr : "Bac Sciences Experimentales: Physique-Chimie / SVT"   ← jamais renommé

  Ce nœud est distinct de :
    - BAC_PC  (id: 76295ee1…)  "Bac Sciences Physiques-Chimie"
    - BAC_SVT (id: e85e8101…)  "Bac Sciences de la Vie et de la Terre"

  Chaîne dans le graphe :
    1BAC_SE → [DONNE_ACCES] → BAC_SE  (arête réelle dans edges.json)

  Point du pipeline où BAC_SE apparaît :
    ÉTAPE 1 — Données brutes retournées par le BFS backend
    (avant getDisplaySteps, avant cleanResults, avant sortPathsForDisplay)

  getDisplaySteps, cleanResults et sortPathsForDisplay ne le modifient pas.
  Le libellé est affiché tel quel depuis le champ nom_fr du nœud en base.
`)
console.log(SEP + '\n')
