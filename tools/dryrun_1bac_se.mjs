/**
 * DRY-RUN — Audit nœuds 1BAC Sciences Expérimentales spécialisés
 * Aucune modification de fichier. Lecture seule.
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

// ── 1. Tous les nœuds 1BAC Sciences Expérimentales ───────────────────────────
const is1BAC_SE = n =>
  n.type === 'FILIERE' &&
  norm(n.code || '').startsWith('1BAC') &&
  /EXPERIMENTALES?|SCIENCES.EXP/i.test(n.nom_fr || n.nom || '')

const all1BAC_SE = nodes.filter(is1BAC_SE)

console.log(`\n${SEP}`)
console.log('  DRY-RUN — Nœuds 1BAC Sciences Expérimentales')
console.log(SEP)

console.log(`\n  1. NŒUDS 1BAC SCIENCES EXPÉRIMENTALES TROUVÉS : ${all1BAC_SE.length}`)
console.log(sep)
for (const n of all1BAC_SE) {
  const outE = edges.filter(e => e.source_id === n.id)
  const inE  = edges.filter(e => e.target_id === n.id)
  console.log(`\n  ID   : ${n.id}`)
  console.log(`  code : ${n.code}`)
  console.log(`  nom  : ${n.nom_fr || n.nom}`)
  console.log(`  type : ${n.type}  ville: ${n.ville || '—'}  duree: ${n.duree_mois ?? n.duree ?? '?'} mois`)
  console.log(`  arêtes entrantes : ${inE.length}  |  sortantes : ${outE.length}`)
}

// ── 2. Nœud générique existant ? ─────────────────────────────────────────────
const isGeneric = n =>
  is1BAC_SE(n) && !/SVT|PHYSIQUE|CHIMIE|PC\b|\//.test(norm(n.nom_fr || n.nom || ''))

const genericNodes = all1BAC_SE.filter(isGeneric)
const specializedNodes = all1BAC_SE.filter(n => !isGeneric(n))

console.log(`\n\n  2. NŒUD GÉNÉRIQUE`)
console.log(sep)
if (genericNodes.length === 0) {
  console.log('  ❌ Aucun nœud générique "1ere Bac Sciences Experimentales" (sans spécialisation) n\'existe.')
  console.log('  → Il faudrait EN CRÉER UN.')
} else {
  console.log(`  ✅ Nœud(s) générique(s) existant(s) : ${genericNodes.length}`)
  for (const n of genericNodes) {
    console.log(`     ID: ${n.id}  code: ${n.code}  nom: ${n.nom_fr || n.nom}`)
  }
}

console.log(`\n  Nœuds spécialisés (à rediriger) : ${specializedNodes.length}`)
for (const n of specializedNodes) {
  console.log(`     ID: ${n.id}  nom: ${n.nom_fr || n.nom}`)
}

// ── 3. Arêtes à rediriger ────────────────────────────────────────────────────
console.log(`\n\n  3. ARÊTES À REDIRIGER`)
console.log(sep)

const targetId = genericNodes.length > 0 ? genericNodes[0].id : '<<NOUVEAU_NŒUD_GÉNÉRIQUE>>'

let totalIn = 0, totalOut = 0
const redirectPlan = []

for (const n of specializedNodes) {
  const inEdges  = edges.filter(e => e.target_id === n.id)
  const outEdges = edges.filter(e => e.source_id === n.id)
  totalIn  += inEdges.length
  totalOut += outEdges.length

  for (const e of inEdges) {
    const src = nmap[e.source_id]
    redirectPlan.push({
      type: 'IN',
      edgeId: e.id,
      edgeType: e.type_lien,
      from: src?.nom_fr || src?.nom || e.source_id,
      fromId: e.source_id,
      toOld: n.nom_fr || n.nom,
      toOldId: n.id,
      toNew: genericNodes.length > 0 ? (genericNodes[0].nom_fr || genericNodes[0].nom) : '<<NOUVEAU>>',
      toNewId: targetId,
    })
  }
  for (const e of outEdges) {
    const tgt = nmap[e.target_id]
    redirectPlan.push({
      type: 'OUT',
      edgeId: e.id,
      edgeType: e.type_lien,
      from: n.nom_fr || n.nom,
      fromId: n.id,
      fromNew: genericNodes.length > 0 ? (genericNodes[0].nom_fr || genericNodes[0].nom) : '<<NOUVEAU>>',
      fromNewId: targetId,
      to: tgt?.nom_fr || tgt?.nom || e.target_id,
      toId: e.target_id,
    })
  }

  console.log(`\n  [${n.nom_fr || n.nom}]`)
  console.log(`    Arêtes entrantes (${inEdges.length}) :`)
  for (const e of inEdges) {
    const src = nmap[e.source_id]
    const eid1 = (e.id || 'NO_ID').slice(0, 8)
    console.log(`      ${eid1}… [${e.type_lien}] ${src?.nom_fr || src?.code || e.source_id} → OLD`)
  }
  console.log(`    Arêtes sortantes (${outEdges.length}) :`)
  for (const e of outEdges) {
    const tgt = nmap[e.target_id]
    const eid2 = (e.id || 'NO_ID').slice(0, 8)
    console.log(`      ${eid2}… [${e.type_lien}] OLD → ${tgt?.nom_fr || tgt?.code || e.target_id}`)
  }
}

console.log(`\n  TOTAL arêtes entrantes à rediriger : ${totalIn}`)
console.log(`  TOTAL arêtes sortantes à rediriger : ${totalOut}`)
console.log(`  TOTAL opérations de redirection    : ${totalIn + totalOut}`)

// ── 4. Doublons potentiels ────────────────────────────────────────────────────
console.log(`\n\n  4. DOUBLONS POTENTIELS APRÈS REDIRECTION`)
console.log(sep)

if (genericNodes.length > 0) {
  const gId = genericNodes[0].id
  // Arêtes déjà existantes sur le nœud générique
  const existingIn  = edges.filter(e => e.target_id === gId)
  const existingOut = edges.filter(e => e.source_id === gId)

  const existingInSources = new Set(existingIn.map(e => e.source_id))
  const existingOutTargets= new Set(existingOut.map(e => e.target_id))

  let dupIn = 0, dupOut = 0
  for (const n of specializedNodes) {
    const inE  = edges.filter(e => e.target_id === n.id)
    const outE = edges.filter(e => e.source_id === n.id)
    for (const e of inE) {
      if (existingInSources.has(e.source_id)) {
        dupIn++
        const src = nmap[e.source_id]
        console.log(`  ⚠️  Doublon IN : ${src?.code || e.source_id} → générique (déjà présent)`)
      }
    }
    for (const e of outE) {
      if (existingOutTargets.has(e.target_id)) {
        dupOut++
        const tgt = nmap[e.target_id]
        console.log(`  ⚠️  Doublon OUT : générique → ${tgt?.code || e.target_id} (déjà présent)`)
      }
    }
  }
  if (dupIn + dupOut === 0) console.log('  ✅ Aucun doublon détecté — redirection propre.')
  else console.log(`\n  ${dupIn + dupOut} doublon(s) à supprimer lors de la redirection.`)
} else {
  console.log('  (Non applicable — nœud générique à créer : aucun doublon possible)')
}

// ── 5. Impact BFS estimé ─────────────────────────────────────────────────────
console.log(`\n\n  5. IMPACT BFS ESTIMÉ`)
console.log(sep)

// Combien de chemins BAC_* passent par des 1BAC_SE spécialisés ?
const DA  = edges.filter(e => e.type_lien === 'DONNE_ACCES')
const specializedIds = new Set(specializedNodes.map(n => n.id))

// Sources qui pointent vers des 1BAC_SE spécialisés
const sourcesViaSpecialized = new Set(DA.filter(e => specializedIds.has(e.target_id)).map(e => e.source_id))
// Cibles que les 1BAC_SE spécialisés alimentent
const targetsFromSpecialized= new Set(DA.filter(e => specializedIds.has(e.source_id)).map(e => e.target_id))

console.log(`  Nœuds sources pointant vers 1BAC_SE spécialisés : ${sourcesViaSpecialized.size}`)
for (const id of sourcesViaSpecialized) {
  const n = nmap[id]
  console.log(`    ${n?.code || id}  (${n?.nom_fr || n?.nom || '?'})`)
}
console.log(`  Nœuds cibles alimentés par 1BAC_SE spécialisés  : ${targetsFromSpecialized.size}`)
for (const id of targetsFromSpecialized) {
  const n = nmap[id]
  console.log(`    ${n?.code || id}  (${n?.nom_fr || n?.nom || '?'})`)
}

const pathsAffected = sourcesViaSpecialized.size * targetsFromSpecialized.size
console.log(`\n  Impact BFS estimé : ~${pathsAffected} chemins affectés (toutes combinaisons sources × cibles)`)
console.log('  → Après redirection vers nœud générique, ces chemins continuent de fonctionner.')
console.log('  → Aucun chemin cassé si la redirection est correcte.')

// ── 6. Exemple avant/après : Pharmacien depuis 3AC ───────────────────────────
console.log(`\n\n  6. EXEMPLE AVANT/APRÈS — Pharmacien depuis 3AC`)
console.log(sep)

const TC_node   = nodes.find(n => n.code === 'TC')
const AC3_node  = nodes.find(n => n.code === '3AC' || (n.nom_fr || '').includes('3ème'))
const BAC_PC_id = '76295ee1-7173-59d3-b492-659129349d51'
const BAC_SVT_id= 'e85e8101-794f-57da-ac49-bf1ccd2a4fae'
const PHARM_id  = '873f9abe-bb3a-4fb2-a8dd-756bd4c2544a'

const getChain = (startId, endIds) => {
  const DA2  = edges.filter(e => e.type_lien === 'DONNE_ACCES')
  const result = []
  const endsSet = new Set(endIds)
  for (const e1 of DA2.filter(e => e.source_id === startId)) {
    if (endsSet.has(e1.target_id)) result.push([startId, e1.target_id])
    for (const e2 of DA2.filter(e => e.source_id === e1.target_id)) {
      if (endsSet.has(e2.target_id)) result.push([startId, e1.target_id, e2.target_id])
    }
  }
  return result
}

// Chemin TC → 1BAC_SE_? → BAC_PC
const tcId = TC_node?.id
if (tcId) {
  const chains = getChain(tcId, [BAC_PC_id, BAC_SVT_id])
  console.log('  AVANT (état actuel) :')
  if (chains.length === 0) {
    // TC → 1BAC_SE spécialisés → BAC
    const step1 = DA.filter(e => e.source_id === tcId && specializedIds.has(e.target_id))
    if (step1.length > 0) {
      for (const e1 of step1) {
        const mid = nmap[e1.target_id]
        const step2 = DA.filter(e => e.source_id === e1.target_id)
        for (const e2 of step2) {
          const bac = nmap[e2.target_id]
          if (bac) console.log(`    TC → [${mid.nom_fr}] → [${bac.nom_fr}]`)
        }
      }
    } else {
      console.log('    (TC ne pointe pas directement vers les 1BAC_SE spécialisés)')
      // chercher via BAC_PC directement
      const step1b = DA.filter(e => e.source_id === tcId)
      for (const e1 of step1b.slice(0, 3)) {
        const mid = nmap[e1.target_id]
        console.log(`    TC → ${mid?.code || e1.target_id}  (${mid?.nom_fr?.slice(0,50) || '?'})`)
      }
      if (step1b.length > 3) console.log(`    … ${step1b.length - 3} autres`)
    }
  } else {
    for (const c of chains) {
      console.log('    ' + c.map(id => nmap[id]?.nom_fr || nmap[id]?.code || id).join(' → '))
    }
  }

  console.log('\n  APRÈS (post-redirection) :')
  if (genericNodes.length > 0) {
    const gn = genericNodes[0]
    // Chercher les BAC terminaux qui seraient atteints depuis le générique
    const outFromGen = DA.filter(e => e.source_id === gn.id)
    // Fusionner avec les sorties des spécialisés
    const allOutIds = new Set([
      ...outFromGen.map(e => e.target_id),
      ...specializedNodes.flatMap(n => DA.filter(e => e.source_id === n.id).map(e => e.target_id))
    ])
    const bacTerminals = [...allOutIds].map(id => nmap[id]).filter(Boolean)

    // Sources entrantes dans le générique + spécialisés
    const allInSources = new Set([
      ...DA.filter(e => e.target_id === gn.id).map(e => e.source_id),
      ...specializedNodes.flatMap(n => DA.filter(e => e.target_id === n.id).map(e => e.source_id))
    ])

    console.log(`    Sources → [${gn.nom_fr}] :`)
    for (const id of [...allInSources].slice(0, 5)) {
      console.log(`      ${nmap[id]?.code || id}`)
    }
    console.log(`    [${gn.nom_fr}] → BAC terminaux :`)
    for (const n of bacTerminals.slice(0, 6)) {
      console.log(`      ${n.code}  (${n.nom_fr?.slice(0, 45) || '?'})`)
    }
    if (bacTerminals.length > 6) console.log(`      … ${bacTerminals.length - 6} autres`)
  } else {
    console.log('    TC → [1ere Bac Sciences Experimentales (GÉNÉRIQUE)] → Bac Sciences Physiques-Chimie')
    console.log('    TC → [1ere Bac Sciences Experimentales (GÉNÉRIQUE)] → Bac Sciences de la Vie et de la Terre')
  }
}

// ── 7. Risques ────────────────────────────────────────────────────────────────
console.log(`\n\n  7. RISQUES`)
console.log(sep)
console.log('  R1 — Doublons arêtes : si un nœud source pointe déjà vers le générique ET vers')
console.log('       un spécialisé, la redirection créerait une arête dupliquée.')
console.log('       → Mitigation : vérifier les doublons avant d\'écrire (Section 4 ci-dessus).')
console.log()
console.log('  R2 — Nœuds spécialisés orphelins : après redirection, les nœuds spécialisés')
console.log('       n\'auraient plus d\'arêtes. Le BFS ne les traverserait plus.')
console.log('       → Risque faible si le nœud générique reçoit toutes les arêtes.')
console.log()
console.log('  R3 — Perte de granularité affichage : "1BAC SE: SVT" distincts de "1BAC SE: PC".')
console.log('       Après fusion, un élève SVT et un élève PC ont le même 1BAC générique.')
console.log('       → Conforme à l\'objectif déclaré : la spécialisation est portée par le BAC terminal.')
console.log()
console.log('  R4 — Backend cache : le backend Spring Boot charge les données au démarrage.')
console.log('       Un redémarrage est nécessaire après modification de nodes_all.json / edges.json.')
console.log()

if (genericNodes.length === 0) {
  console.log('  R5 — Création nœud générique : si aucun nœud générique n\'existe, il faut')
  console.log('       en créer un avec un UUID valide + tous les champs obligatoires du schéma.')
  console.log('       → Inspecter la structure d\'un nœud 1BAC existant pour cloner les champs.')
}

console.log(`\n${SEP}\n  FIN DU DRY-RUN — Aucun fichier modifié\n${SEP}\n`)
