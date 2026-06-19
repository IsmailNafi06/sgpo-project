/**
 * DRY-RUN — Correction progressive BAC_SE : domaine Santé uniquement
 * Filières : Pharmacie, Médecine, Médecine dentaire, Paramédical
 * Aucune modification. Lecture seule.
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = join(__dir, '..')

const nodes = JSON.parse(readFileSync(join(ROOT, 'backend/src/main/resources/data/nodes_all.json'), 'utf8'))
const edges = JSON.parse(readFileSync(join(ROOT, 'backend/src/main/resources/data/edges.json'), 'utf8'))
const nmap  = Object.fromEntries(nodes.map(n => [String(n.id), n]))

const SEP = '═'.repeat(76)
const sep = '─'.repeat(76)
const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

// ── IDs clés ─────────────────────────────────────────────────────────────────
const BAC_SE_ID  = '84a28554-5207-5ee6-a33f-340e0b111cfd'
const BAC_PC_ID  = '76295ee1-7173-59d3-b492-659129349d51'
const BAC_SVT_ID = 'e85e8101-794f-57da-ac49-bf1ccd2a4fae'
const PHARM_ID   = '873f9abe-bb3a-4fb2-a8dd-756bd4c2544a'

// ── Arêtes indexées ───────────────────────────────────────────────────────────
const DA  = edges.filter(e => e.type_lien === 'DONNE_ACCES')
const ADM = edges.filter(e => e.type_lien === 'ADMISSION')
const REC = edges.filter(e => e.type_lien === 'RECRUTEMENT')

const edgesFromBAC_SE  = [...DA, ...ADM].filter(e => e.source_id === BAC_SE_ID)
const edgesFromBAC_PC  = [...DA, ...ADM].filter(e => e.source_id === BAC_PC_ID)
const edgesFromBAC_SVT = [...DA, ...ADM].filter(e => e.source_id === BAC_SVT_ID)

// Index par (source_id, target_id, type_lien) pour détecter doublons exacts
const edgeKey = (src, tgt, type) => `${src}|${tgt}|${type}`
const existingEdgeKeys = new Set(edges.map(e => edgeKey(e.source_id, e.target_id, e.type_lien)))

const targetsOfBAC_PC  = new Set(edgesFromBAC_PC.map(e => e.target_id))
const targetsOfBAC_SVT = new Set(edgesFromBAC_SVT.map(e => e.target_id))

// ── Classificateurs santé ────────────────────────────────────────────────────

// Détecter si une filière appartient au domaine santé
const isSante = (nom = '', code = '') => {
  const txt = norm(`${nom} ${code}`)
  return /MEDECINE|PHARMACIE|DENTAIRE|INFIRMIER|SAGE.FEMME|SANTE|VETERINAIRE|KINESITHERAPIE|ORTHOPHONIE|OPTICIEN|PARAMEDICAL|RADIOLOGIE|ANESTHESIE|CHIRURGIE|LABORATOIRE MEDICAL|AUDIOPROTHES|TECHNICIEN DE SANTE|BIOTECHNOLOGIE SANTE|NUTRITION|DIETETIQUE/.test(txt)
}

// Sous-catégorie santé pour affichage
const categorieSante = (nom = '', code = '') => {
  const txt = norm(`${nom} ${code}`)
  if (/PHARMACIE/.test(txt))                              return 'PHARMACIE'
  if (/MEDECINE DENTAIRE|DENTAIRE|STOMATOLOGIE/.test(txt))return 'DENTAIRE'
  if (/MEDECINE|CHIRURGIE GENERALE/.test(txt))            return 'MEDECINE'
  if (/VETERINAIRE/.test(txt))                            return 'VETERINAIRE'
  if (/INFIRMIER|SAGE.FEMME|KINESITHERAPIE|ORTHOPHONIE|RADIOLOGIE|ANESTHESIE|AUDIOPROTHES|PARAMEDICAL|LABORATOIRE MEDICAL|TECHNICIEN DE SANTE/.test(txt)) return 'PARAMEDICAL'
  if (/NUTRITION|DIETETIQUE/.test(txt))                   return 'NUTRITION'
  if (/BIOTECHNOLOGIE SANTE|BIOLOGIE SANTE/.test(txt))    return 'BIOTECH_SANTE'
  return 'SANTE_AUTRE'
}

// Compatible PC / SVT pour une filière santé
//  - Médecine, Pharmacie, Dentaire, Paramédical → SVT prioritaire mais aussi PC
//  - Médecine et pharmacie acceptent BAC_PC (tradition marocaine)
const isSVTCompatible = (nom = '', code = '') => true  // toutes les filières santé acceptent SVT
const isPCCompatible  = (nom = '', code = '') => {
  const txt = norm(`${nom} ${code}`)
  // Kinésithérapie, infirmier, paramédical purement clinique → souvent PC non requis
  // mais au Maroc BAC_PC est traditionnellement accepté pour médecine/pharmacie/dentaire
  return /MEDECINE|PHARMACIE|DENTAIRE|VETERINAIRE|BIOLOGIE|BIOTECH|CHIMIE SANTE/.test(txt)
}

// ── Analyse filières santé accessibles via BAC_SE ────────────────────────────
const santeFilieres = []
for (const e of edgesFromBAC_SE) {
  const tgt = nmap[e.target_id]
  if (!tgt || tgt.type !== 'FILIERE') continue
  const nom  = tgt.nom_fr || tgt.nom || ''
  const code = tgt.code || ''
  if (!isSante(nom, code)) continue

  const cat = categorieSante(nom, code)
  const svtCompat = isSVTCompatible(nom, code)
  const pcCompat  = isPCCompatible(nom, code)
  const hasPC  = targetsOfBAC_PC.has(tgt.id)
  const hasSVT = targetsOfBAC_SVT.has(tgt.id)

  // Arêtes à créer (dry-run)
  const toAdd = []
  if (svtCompat && !hasSVT) {
    const key = edgeKey(BAC_SVT_ID, tgt.id, e.type_lien)
    if (!existingEdgeKeys.has(key)) toAdd.push({ src: 'BAC_SVT', srcId: BAC_SVT_ID, type_lien: e.type_lien })
  }
  if (pcCompat && !hasPC) {
    const key = edgeKey(BAC_PC_ID, tgt.id, e.type_lien)
    if (!existingEdgeKeys.has(key)) toAdd.push({ src: 'BAC_PC', srcId: BAC_PC_ID, type_lien: e.type_lien })
  }

  santeFilieres.push({
    id: tgt.id, nom: nom.slice(0, 65), code, cat, svtCompat, pcCompat,
    hasPC, hasSVT, toAdd, type_lien: e.type_lien,
    ville: tgt.ville || '?',
  })
}

// Dédupliquer par filière id (une filière peut avoir DA + ADMISSION depuis BAC_SE)
const dedup = new Map()
for (const f of santeFilieres) {
  if (!dedup.has(f.id)) {
    dedup.set(f.id, f)
  } else {
    // fusionner les toAdd
    const existing = dedup.get(f.id)
    for (const a of f.toAdd) {
      if (!existing.toAdd.some(x => x.src === a.src && x.type_lien === a.type_lien)) {
        existing.toAdd.push(a)
      }
    }
    if (f.hasPC)  existing.hasPC  = true
    if (f.hasSVT) existing.hasSVT = true
  }
}
const uniqueFilieres = [...dedup.values()]

// ── Comptages ─────────────────────────────────────────────────────────────────
const byCategorie = {}
for (const f of uniqueFilieres) {
  byCategorie[f.cat] = (byCategorie[f.cat] || [])
  byCategorie[f.cat].push(f)
}

const newEdgesPC  = uniqueFilieres.flatMap(f => f.toAdd.filter(a => a.src === 'BAC_PC'))
const newEdgesSVT = uniqueFilieres.flatMap(f => f.toAdd.filter(a => a.src === 'BAC_SVT'))
const alreadyCoveredBoth = uniqueFilieres.filter(f => f.hasPC && f.hasSVT)
const alreadyCoveredPC   = uniqueFilieres.filter(f => f.hasPC && !f.hasSVT)
const alreadyCoveredSVT  = uniqueFilieres.filter(f => !f.hasPC && f.hasSVT)
const notCovered         = uniqueFilieres.filter(f => !f.hasPC && !f.hasSVT && f.toAdd.length === 0)

console.log(`\n${SEP}`)
console.log('  DRY-RUN — Correction BAC_SE domaine Santé')
console.log(SEP)

// ── 1. Vue d'ensemble ─────────────────────────────────────────────────────────
console.log(`\n  1. VUE D'ENSEMBLE`)
console.log(sep)
console.log(`  Filières santé uniques accessibles via BAC_SE : ${uniqueFilieres.length}`)
console.log()
const catOrder = ['PHARMACIE','MEDECINE','DENTAIRE','PARAMEDICAL','VETERINAIRE','NUTRITION','BIOTECH_SANTE','SANTE_AUTRE']
for (const cat of catOrder) {
  const fils = byCategorie[cat] || []
  if (!fils.length) continue
  console.log(`  ${cat.padEnd(18)} : ${fils.length} filières`)
}
console.log()
console.log(`  Déjà couvertes BAC_PC + BAC_SVT : ${alreadyCoveredBoth.length}  (redondantes — OK, à conserver pour l'instant)`)
console.log(`  Couvertes BAC_PC seulement       : ${alreadyCoveredPC.length}`)
console.log(`  Couvertes BAC_SVT seulement      : ${alreadyCoveredSVT.length}`)
console.log(`  Non couvertes du tout            : ${uniqueFilieres.filter(f=>!f.hasPC&&!f.hasSVT).length}`)

// ── 2. Arêtes à créer ─────────────────────────────────────────────────────────
console.log(`\n  2. ARÊTES À CRÉER (dry-run)`)
console.log(sep)
console.log(`  Nouvelles arêtes BAC_PC  → filière santé : ${newEdgesPC.length}`)
console.log(`  Nouvelles arêtes BAC_SVT → filière santé : ${newEdgesSVT.length}`)
console.log(`  TOTAL nouvelles arêtes                   : ${newEdgesPC.length + newEdgesSVT.length}`)

// ── 3. Détail par filière ─────────────────────────────────────────────────────
console.log(`\n  3. DÉTAIL PAR FILIÈRE ET ACTION`)
console.log(sep)
for (const cat of catOrder) {
  const fils = byCategorie[cat] || []
  if (!fils.length) continue
  console.log(`\n  ── ${cat} (${fils.length}) ──`)
  for (const f of fils) {
    const pc  = f.hasPC  ? '✅PC'  : '✗PC'
    const svt = f.hasSVT ? '✅SVT' : '✗SVT'
    const adds = f.toAdd.length
      ? f.toAdd.map(a => `+${a.src}`).join(', ')
      : '→ déjà couvert'
    console.log(`    ${pc} ${svt}  ${adds.padEnd(22)}  ${f.nom}  [${f.ville}]`)
  }
}

// ── 4. Impact Pharmacien depuis 3AC ──────────────────────────────────────────
console.log(`\n  4. IMPACT PAR MÉTIER APRÈS MIGRATION`)
console.log(sep)

const TC_node   = nodes.find(n => n.code === 'TC')
const AC3_node  = nodes.find(n => n.code === '3AC')
const BAC_PC_n  = nmap[BAC_PC_ID]
const BAC_SVT_n = nmap[BAC_SVT_ID]
const BAC_SE_n  = nmap[BAC_SE_ID]

// Métiers santé à tester
const METIERS_SANTE = [
  { code: 'PHARMACIEN',          label: 'Pharmacien',            id: null },
  { code: 'MEDECIN_GENERALISTE', label: 'Medecin generaliste',   id: null },
  { code: 'CHIRURGIEN_DENTISTE', label: 'Chirurgien dentiste',   id: null },
  { code: 'INFIRMIER',           label: 'Infirmier',             id: null },
]
for (const m of METIERS_SANTE) {
  const n = nodes.find(x => x.code === m.code)
  m.id = n?.id
}

const recBySource = {}
for (const e of REC) {
  (recBySource[e.source_id] ??= new Set()).add(e.target_id)
}

// Pour chaque métier : chemins ACTUELS via BAC_SE vs APRÈS via BAC_PC et BAC_SVT
for (const metier of METIERS_SANTE) {
  if (!metier.id) {
    console.log(`\n  [${metier.label}] — nœud introuvable dans les données`)
    continue
  }

  // Filières → métier via RECRUTEMENT
  const filsForMetier = new Set(
    REC.filter(e => e.target_id === metier.id).map(e => e.source_id)
  )

  // Actuellement accessible via BAC_SE
  const viaBacSE = uniqueFilieres.filter(f => filsForMetier.has(f.id))

  // Accessible via BAC_PC MAINTENANT
  const viaPC_now = [...targetsOfBAC_PC].filter(tid => filsForMetier.has(tid))

  // Accessible via BAC_SVT MAINTENANT
  const viaSVT_now = [...targetsOfBAC_SVT].filter(tid => filsForMetier.has(tid))

  // Accessible via BAC_PC APRÈS (ajout arêtes)
  const newPCTargets = new Set([
    ...targetsOfBAC_PC,
    ...uniqueFilieres.flatMap(f => f.toAdd.filter(a => a.src === 'BAC_PC').map(() => f.id))
  ])
  const viaPCAfter = [...newPCTargets].filter(tid => filsForMetier.has(tid))

  // Accessible via BAC_SVT APRÈS
  const newSVTTargets = new Set([
    ...targetsOfBAC_SVT,
    ...uniqueFilieres.flatMap(f => f.toAdd.filter(a => a.src === 'BAC_SVT').map(() => f.id))
  ])
  const viaSVTAfter = [...newSVTTargets].filter(tid => filsForMetier.has(tid))

  console.log(`\n  [${metier.label}]`)
  console.log(`    Filières via BAC_SE (actuel)   : ${viaBacSE.length}`)
  console.log(`    Filières via BAC_PC  (actuel)  : ${viaPC_now.length}`)
  console.log(`    Filières via BAC_SVT (actuel)  : ${viaSVT_now.length}`)
  console.log(`    Filières via BAC_PC  (après)   : ${viaPCAfter.length}  (+${viaPCAfter.length - viaPC_now.length})`)
  console.log(`    Filières via BAC_SVT (après)   : ${viaSVTAfter.length}  (+${viaSVTAfter.length - viaSVT_now.length})`)

  // BAC_SE encore en priorité ?
  const bacSEStillFirst = viaBacSE.some(f => !newPCTargets.has(f.id) && !newSVTTargets.has(f.id))
  console.log(`    BAC_SE encore seul chemin      : ${bacSEStillFirst ? `⚠️  oui (${viaBacSE.filter(f=>!newPCTargets.has(f.id)&&!newSVTTargets.has(f.id)).length} filière(s))` : '✅ non — toutes filières couvertes par PC ou SVT'}`)

  // Détail filières de santé via BAC_SE pour ce métier
  if (viaBacSE.length > 0) {
    console.log(`    Détail :`)
    for (const f of viaBacSE) {
      const pca  = newPCTargets.has(f.id)  ? '✅PC' : '✗PC'
      const svta = newSVTTargets.has(f.id) ? '✅SVT': '✗SVT'
      const action = f.toAdd.length ? f.toAdd.map(a=>`+${a.src}`).join(',') : '→ déjà couvert'
      console.log(`      ${pca} ${svta}  ${action.padEnd(16)}  ${f.nom}`)
    }
  }
}

// ── 5. Liste exacte des arêtes à créer ───────────────────────────────────────
console.log(`\n  5. LISTE EXACTE DES NOUVELLES ARÊTES`)
console.log(sep)
console.log(`  Format : [src_id] → [target_id] via [type_lien]  (filière)`)
console.log()
let idxPC = 0, idxSVT = 0
for (const f of uniqueFilieres) {
  for (const a of f.toAdd) {
    const srcLabel = a.src === 'BAC_PC' ? `BAC_PC  (${BAC_PC_ID.slice(0,8)}…)` : `BAC_SVT (${BAC_SVT_ID.slice(0,8)}…)`
    if (a.src === 'BAC_PC') {
      idxPC++
      console.log(`  PC-${String(idxPC).padStart(3,'0')}  ${srcLabel} → ${String(f.id).slice(0,8)}… [${a.type_lien}]  ${f.cat.padEnd(12)} ${f.nom}`)
    } else {
      idxSVT++
      console.log(`  SVT-${String(idxSVT).padStart(3,'0')} ${srcLabel} → ${String(f.id).slice(0,8)}… [${a.type_lien}]  ${f.cat.padEnd(12)} ${f.nom}`)
    }
  }
}
console.log(`\n  TOTAL : ${idxPC} arêtes BAC_PC + ${idxSVT} arêtes BAC_SVT = ${idxPC + idxSVT}`)

// ── 6. Risques ─────────────────────────────────────────────────────────────────
console.log(`\n  6. RISQUES`)
console.log(sep)
const notFullyCovered = uniqueFilieres.filter(f =>
  !f.hasPC && !f.hasSVT && f.toAdd.filter(a=>a.src==='BAC_PC').length===0 && f.toAdd.filter(a=>a.src==='BAC_SVT').length===0
)
console.log(`  R1 — Filières santé sans couverture PC/SVT possible : ${notFullyCovered.length}`)
if (notFullyCovered.length > 0) {
  for (const f of notFullyCovered) console.log(`       → ${f.cat}  ${f.nom}`)
}
console.log(`  R2 — BAC_SE non supprimé → doublons de parcours possibles dans l'UI`)
console.log(`       (ex: un parcours via BAC_SE + un via BAC_SVT pour la même filière)`)
console.log(`       Mitigation : à résoudre en étape 2 (dedup ou suppression arêtes BAC_SE santé)`)
console.log(`  R3 — Arête BAC_SVT → FMPC Casablanca absente → à créer (impact Pharmacie SVT)`)
console.log(`  R4 — Backend redémarrage requis après modification edges.json`)
console.log(`  R5 — Aucun risque de perte : les arêtes BAC_SE existantes sont conservées`)

console.log(`\n${SEP}\n  FIN DU DRY-RUN — Aucun fichier modifié\n${SEP}\n`)
