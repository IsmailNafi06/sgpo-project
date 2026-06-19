/**
 * Migration BAC_SE → BAC_PC / BAC_SVT
 * Phase 1 : dry-run avec vérifications complètes
 * Phase 2 : application si dry-run OK (0 chemin perdu, 0 doublon, 0 orphelin, 0 self-loop)
 *
 * Usage :
 *   node apply_bac_se_migration.mjs          → dry-run seul
 *   node apply_bac_se_migration.mjs --apply  → dry-run + application
 */
import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = join(__dir, '..')
const APPLY = process.argv.includes('--apply')

const EDGES_PATH = join(ROOT, 'backend/src/main/resources/data/edges.json')
const NODES_PATH = join(ROOT, 'backend/src/main/resources/data/nodes_all.json')

const nodes = JSON.parse(readFileSync(NODES_PATH, 'utf8'))
const edges = JSON.parse(readFileSync(EDGES_PATH, 'utf8'))
const nmap  = Object.fromEntries(nodes.map(n => [String(n.id), n]))

const SEP = '═'.repeat(76)
const sep = '─'.repeat(76)
const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

// ── IDs clés ─────────────────────────────────────────────────────────────────
const BAC_SE_ID  = '84a28554-5207-5ee6-a33f-340e0b111cfd'
const BAC_PC_ID  = '76295ee1-7173-59d3-b492-659129349d51'
const BAC_SVT_ID = 'e85e8101-794f-57da-ac49-bf1ccd2a4fae'

// ── Classificateurs PC / SVT ─────────────────────────────────────────────────
const PC_KW = [
  'PHYSIQUE','CHIMIE','ELECTR','MECANIQUE','GENIE CIVIL','GENIE ENERGETIQUE',
  'MATERIAUX','ELECTRONIQUE','AUTOMATIQUE','INFORMATIQUE','MATHEMATIQUE','MATH',
  'STATISTIQUE','MODELISATION','INGENIEUR','INGENIERIE','PREPAS','CPGE',
  'CONCOURS GRANDES ECOLES','ARCHITECTURE','TOPOGRAPHIE','MINES','PETROLE',
  'GEOLOGIE INGENIERIE','THERMODYNAMIQUE','AERONAUTIQUE','ROBOTIQUE',
  'SYSTEMES EMBARQUES','SIGNAL','TRAITEMENT IMAGE','RESEAU','NUMERIQUE',
  'GEOMATIQUE','TELECOMS','CYBER','SECURITE INFORMATIQUE','DEVELOPPEMENT',
  'LOGICIEL','BTS ELECTRONIQUE','BTS ELECTROTECHNIQUE',
]
const SVT_KW = [
  'BIOLOGIE','BIOCHIMIE','BIOTECH','BIOTECHNOLOGIE',
  'MEDECINE','PHARMACIE','DENTAIRE','INFIRMIER','SAGE.FEMME','SANTE',
  'VETERINAIRE','AGRONOMIE','AGRICULTURE','FORESTIER','PECHE','AQUACULTURE',
  'ENVIRONNEMENT','ECOLOGIE','MICROBIOLOGIE','IMMUNOLOGIE','PHYSIOLOGIE',
  'NUTRITION','DIETETICIEN','KINESITHERAPIE','ORTHOPHONIE','OPTICIEN',
  'PARAMEDICAL','RADIOLOGIE','ANESTHESIE','AUDIOPROTHES',
]
const BOTH_KW = [
  'DUT','BTS ','DEUST','LICENCE ES ','LICENCE SCIENCES ',
  'MANAGEMENT','GESTION','COMMERCE','ECONOMIE','DROIT','LANGUES',
  'SOCIOLOGIE','PSYCHOLOGIE','COMMUNICATION','TOURISME','HOTELLERIE',
  'MARKETING','RESSOURCES HUMAINES','FINANCE','COMPTABILITE','AUDIT',
  'LOGISTIQUE','SUPPLY','IMPORT','EXPORT','TRANSPORT','ACHAT',
  'ADMINISTRATION','JURIDIQUE','TRADUCTION',
]

const classifyFil = (nom = '', code = '') => {
  const t = norm(`${nom} ${code}`)
  const pc   = PC_KW.filter(k => t.includes(k)).length
  const svt  = SVT_KW.filter(k => t.includes(k)).length
  const both = BOTH_KW.filter(k => t.includes(k)).length
  if (pc > 0 && svt === 0) return 'PC'
  if (svt > 0 && pc === 0) return 'SVT'
  if (pc > 0 && svt > 0)  return 'BOTH'
  if (both > 0)            return 'BOTH'
  return 'AMBIG'
}

// ── Arêtes indexées ───────────────────────────────────────────────────────────
const DA  = edges.filter(e => e.type_lien === 'DONNE_ACCES')
const ADM = edges.filter(e => e.type_lien === 'ADMISSION')
const REC = edges.filter(e => e.type_lien === 'RECRUTEMENT')

const fromBAC_SE  = [...DA, ...ADM].filter(e => e.source_id === BAC_SE_ID)
const fromBAC_PC  = [...DA, ...ADM].filter(e => e.source_id === BAC_PC_ID)
const fromBAC_SVT = [...DA, ...ADM].filter(e => e.source_id === BAC_SVT_ID)

// Index existence : (src, tgt, type) → true
const edgeKey = (s, t, y) => `${s}|${t}|${y}`
const existingKeys = new Set(edges.map(e => edgeKey(e.source_id, e.target_id, e.type_lien)))

const tgtPC  = new Map(fromBAC_PC.map(e => [e.target_id + '|' + e.type_lien, e]))
const tgtSVT = new Map(fromBAC_SVT.map(e => [e.target_id + '|' + e.type_lien, e]))

// ── Plan de migration ─────────────────────────────────────────────────────────
const toCreate  = []   // { id, source_id, target_id, type_lien, ...fields }
const toDelete  = new Set()  // edge ids
const toKeep    = []   // edges BAC_SE conservées (AMBIG)

for (const e of fromBAC_SE) {
  const tgt = nmap[e.target_id]
  if (!tgt) { toKeep.push(e); continue }
  const cat = classifyFil(tgt.nom_fr || '', tgt.code || '')
  const hasPC  = tgtPC.has(e.target_id  + '|' + e.type_lien)
  const hasSVT = tgtSVT.has(e.target_id + '|' + e.type_lien)

  // Arêtes à créer
  const needPC  = (cat === 'PC'  || cat === 'BOTH') && !hasPC
  const needSVT = (cat === 'SVT' || cat === 'BOTH') && !hasSVT

  if (needPC) {
    const k = edgeKey(BAC_PC_ID, e.target_id, e.type_lien)
    if (!existingKeys.has(k)) {
      const newEdge = {
        id: randomUUID(),
        source_id: BAC_PC_ID,
        target_id: e.target_id,
        type_lien: e.type_lien,
        taux_reussite: e.taux_reussite ?? 65,
        cout_supplementaire: e.cout_supplementaire ?? 0,
        duree_supplementaire_mois: e.duree_supplementaire_mois ?? 0,
        prerequis_notes: e.prerequis_notes ?? '',
        moyenne_minimale: e.moyenne_minimale ?? null,
        type_acces: e.type_acces ?? 'OUVERT',
      }
      toCreate.push({ ...newEdge, _meta: { cat, src: 'BAC_PC', fil: (tgt.nom_fr || '').slice(0, 55) } })
      existingKeys.add(k)
    }
  }
  if (needSVT) {
    const k = edgeKey(BAC_SVT_ID, e.target_id, e.type_lien)
    if (!existingKeys.has(k)) {
      const newEdge = {
        id: randomUUID(),
        source_id: BAC_SVT_ID,
        target_id: e.target_id,
        type_lien: e.type_lien,
        taux_reussite: e.taux_reussite ?? 65,
        cout_supplementaire: e.cout_supplementaire ?? 0,
        duree_supplementaire_mois: e.duree_supplementaire_mois ?? 0,
        prerequis_notes: e.prerequis_notes ?? '',
        moyenne_minimale: e.moyenne_minimale ?? null,
        type_acces: e.type_acces ?? 'OUVERT',
      }
      toCreate.push({ ...newEdge, _meta: { cat, src: 'BAC_SVT', fil: (tgt.nom_fr || '').slice(0, 55) } })
      existingKeys.add(k)
    }
  }

  // Supprimer BAC_SE si filière désormais couverte par PC ou SVT
  // AMBIG (CONSERVER_BAC_SE) = on ne supprime pas
  if (cat === 'AMBIG') {
    toKeep.push(e)
  } else {
    // La filière sera couverte après migration → arête BAC_SE redondante
    if (e.id) toDelete.add(e.id)  // si pas d'id, on ne peut pas la supprimer proprement
    else toKeep.push(e)            // arêtes sans id : conserver par sécurité
  }
}

// ── Vérifications d'intégrité ─────────────────────────────────────────────────
const newEdgeClean = toCreate.map(e => {
  const { _meta, ...rest } = e
  return rest
})

// 1. Self-loops
const selfLoops = newEdgeClean.filter(e => e.source_id === e.target_id)

// 2. Doublons dans toCreate
const createKeys = new Set()
const dupCreate = []
for (const e of newEdgeClean) {
  const k = edgeKey(e.source_id, e.target_id, e.type_lien)
  if (createKeys.has(k)) dupCreate.push(k)
  else createKeys.add(k)
}

// 3. Orphelins après suppression
//    Un nœud devient orphelin (cible sans source) si toutes ses arêtes entrantes sont supprimées
const incomingCount = {}
for (const e of edges) {
  incomingCount[e.target_id] = (incomingCount[e.target_id] || 0) + 1
}
const orphansAfter = []
for (const eId of toDelete) {
  const e = edges.find(x => x.id === eId)
  if (!e) continue
  const remainingIn = edges.filter(x => x.target_id === e.target_id && !toDelete.has(x.id)).length
    + newEdgeClean.filter(x => x.target_id === e.target_id).length
  if (remainingIn === 0) orphansAfter.push(e.target_id)
}

// 4. Chemins perdus : pour chaque filière dont BAC_SE est supprimé,
//    vérifier qu'elle reste accessible via BAC_PC, BAC_SVT ou autre source
const lostPaths = []
const newFromPC  = new Set([...fromBAC_PC.map(e => e.target_id + '|' + e.type_lien),
                             ...newEdgeClean.filter(e => e.source_id === BAC_PC_ID).map(e => e.target_id + '|' + e.type_lien)])
const newFromSVT = new Set([...fromBAC_SVT.map(e => e.target_id + '|' + e.type_lien),
                             ...newEdgeClean.filter(e => e.source_id === BAC_SVT_ID).map(e => e.target_id + '|' + e.type_lien)])

for (const eId of toDelete) {
  const e = edges.find(x => x.id === eId)
  if (!e) continue
  const key = e.target_id + '|' + e.type_lien
  const coveredByPC  = newFromPC.has(key)
  const coveredBySVT = newFromSVT.has(key)
  const otherSource  = edges.some(x => x.target_id === e.target_id && x.source_id !== BAC_SE_ID && !toDelete.has(x.id))
  if (!coveredByPC && !coveredBySVT && !otherSource) {
    lostPaths.push({ target: nmap[e.target_id]?.nom_fr || e.target_id, eId })
  }
}

// ── DRY-RUN RAPPORT ───────────────────────────────────────────────────────────
console.log(`\n${SEP}`)
console.log(`  DRY-RUN FINAL — Migration BAC_SE → BAC_PC / BAC_SVT`)
console.log(`  Mode : ${APPLY ? '🔴 APPLICATION (--apply détecté)' : '🟡 DRY-RUN seul'}`)
console.log(SEP)

// Comptages par catégorie
const cats = { PC: 0, SVT: 0, BOTH: 0, AMBIG: 0 }
for (const e of fromBAC_SE) {
  const tgt = nmap[e.target_id]
  cats[classifyFil(tgt?.nom_fr || '', tgt?.code || '')]++
}
const newPC  = toCreate.filter(e => e._meta.src === 'BAC_PC').length
const newSVT = toCreate.filter(e => e._meta.src === 'BAC_SVT').length

console.log(`\n  1. OPÉRATIONS PLANIFIÉES`)
console.log(sep)
console.log(`  Arêtes BAC_SE analysées          : ${fromBAC_SE.length}`)
console.log(`    PC   : ${cats.PC}   SVT : ${cats.SVT}   BOTH : ${cats.BOTH}   AMBIG : ${cats.AMBIG}`)
console.log()
console.log(`  Nouvelles arêtes BAC_PC  à créer : ${newPC}`)
console.log(`  Nouvelles arêtes BAC_SVT à créer : ${newSVT}`)
console.log(`  Total nouvelles arêtes           : ${toCreate.length}`)
console.log()
console.log(`  Arêtes BAC_SE à supprimer        : ${toDelete.size}`)
console.log(`  Arêtes BAC_SE à conserver (AMBIG): ${toKeep.length}`)
console.log(`  Arêtes BAC_SE sans id (conservées): ${fromBAC_SE.filter(e => !e.id && classifyFil(nmap[e.target_id]?.nom_fr||'',nmap[e.target_id]?.code||'') !== 'AMBIG').length}`)
console.log()
console.log(`  Taille edges.json avant : ${edges.length}`)
console.log(`  Taille edges.json après : ${edges.length + toCreate.length - toDelete.size}`)

console.log(`\n  2. VÉRIFICATIONS D'INTÉGRITÉ`)
console.log(sep)
const allOK = selfLoops.length === 0 && dupCreate.length === 0 && orphansAfter.length === 0 && lostPaths.length === 0
console.log(`  Self-loops              : ${selfLoops.length   === 0 ? '✅ 0' : '❌ ' + selfLoops.length}`)
console.log(`  Doublons dans toCreate  : ${dupCreate.length   === 0 ? '✅ 0' : '❌ ' + dupCreate.length}`)
console.log(`  Orphelins après suppr.  : ${orphansAfter.length=== 0 ? '✅ 0' : '❌ ' + orphansAfter.length}`)
console.log(`  Chemins perdus          : ${lostPaths.length   === 0 ? '✅ 0' : '❌ ' + lostPaths.length}`)
console.log()
if (lostPaths.length > 0) {
  console.log('  !! CHEMINS PERDUS :')
  for (const p of lostPaths.slice(0, 10)) console.log(`     → ${p.target}`)
}
console.log(`  Bilan global            : ${allOK ? '✅ TOUTES LES VÉRIFICATIONS PASSENT' : '❌ ÉCHEC — application bloquée'}`)

// ── 10 exemples avant/après par domaine ──────────────────────────────────────
console.log(`\n  3. EXEMPLES AVANT/APRÈS (10 domaines)`)
console.log(sep)

const examples = [
  { label: 'SANTÉ — Pharmacie',     kw: 'PHARMACIE' },
  { label: 'SANTÉ — Médecine',      kw: 'MEDECINE' },
  { label: 'SANTÉ — Dentaire',      kw: 'DENTAIRE' },
  { label: 'INFORMATIQUE',          kw: 'INFORMATIQUE' },
  { label: 'INGÉNIERIE',            kw: 'INGENIEUR' },
  { label: 'DROIT / ÉCO',          kw: 'DROIT' },
  { label: 'COMMERCE / MANAGEMENT', kw: 'MANAGEMENT' },
  { label: 'AGRICULTURE',           kw: 'AGRONOMIE' },
  { label: 'TOURISME',              kw: 'TOURISME' },
  { label: 'BTP / GÉNIE CIVIL',     kw: 'GENIE CIVIL' },
]

for (const { label, kw } of examples) {
  const hit = fromBAC_SE.find(e => norm(nmap[e.target_id]?.nom_fr || '').includes(kw))
  if (!hit) { console.log(`\n  [${label}] — aucun exemple trouvé`); continue }
  const tgt = nmap[hit.target_id]
  const cat = classifyFil(tgt?.nom_fr || '', tgt?.code || '')
  const willPC  = toCreate.some(e => e.target_id === hit.target_id && e._meta.src === 'BAC_PC')
  const willSVT = toCreate.some(e => e.target_id === hit.target_id && e._meta.src === 'BAC_SVT')
  const hasPC   = tgtPC.has(hit.target_id  + '|' + hit.type_lien)
  const hasSVT  = tgtSVT.has(hit.target_id + '|' + hit.type_lien)
  const del = toDelete.has(hit.id)
  console.log(`\n  [${label}]  cat=${cat}`)
  console.log(`    AVANT : BAC_SE → ${(tgt?.nom_fr || '?').slice(0, 55)}`)
  console.log(`    APRÈS :`)
  if (hasPC || willPC)  console.log(`      ✅ BAC_PC  → ${(tgt?.nom_fr || '?').slice(0, 55)}`)
  if (hasSVT || willSVT) console.log(`      ✅ BAC_SVT → ${(tgt?.nom_fr || '?').slice(0, 55)}`)
  if (del)  console.log(`      🗑  BAC_SE edge supprimée`)
  else      console.log(`      ⚠️  BAC_SE edge conservée (AMBIG)`)
}

// ── Impact BFS sur 6 métiers ──────────────────────────────────────────────────
console.log(`\n  4. IMPACT SUR LES 6 MÉTIERS TESTÉS`)
console.log(sep)

const METIERS = [
  'PHARMACIEN','MEDECIN_GENERALISTE','INGENIEUR_INFORMATIQUE',
  'DEVELOPPEUR_WEB','GESTIONNAIRE_RH','SUPPLY_CHAIN_MANAGER',
]

const filToMet = {}
for (const e of REC) (filToMet[e.source_id] ??= new Set()).add(e.target_id)
const filFromPC_now  = new Set(fromBAC_PC.map(e => e.target_id))
const filFromSVT_now = new Set(fromBAC_SVT.map(e => e.target_id))
const filFromSE_now  = new Set(fromBAC_SE.map(e => e.target_id))

// Après migration
const filFromPC_after  = new Set([...filFromPC_now,  ...newEdgeClean.filter(e => e.source_id === BAC_PC_ID).map(e => e.target_id)])
const filFromSVT_after = new Set([...filFromSVT_now, ...newEdgeClean.filter(e => e.source_id === BAC_SVT_ID).map(e => e.target_id)])
const deletedTargets   = new Set(fromBAC_SE.filter(e => toDelete.has(e.id)).map(e => e.target_id))
const filFromSE_after  = new Set([...fromBAC_SE].filter(e => !toDelete.has(e.id)).map(e => e.target_id))

for (const mCode of METIERS) {
  const mNode = nodes.find(n => n.code === mCode)
  if (!mNode) { console.log(`\n  [${mCode}] — nœud introuvable`); continue }
  const mid = mNode.id

  const viaSE_before  = [...filFromSE_now].filter(fid  => (filToMet[fid]  || new Set()).has(mid)).length
  const viaPC_before  = [...filFromPC_now].filter(fid  => (filToMet[fid]  || new Set()).has(mid)).length
  const viaSVT_before = [...filFromSVT_now].filter(fid => (filToMet[fid]  || new Set()).has(mid)).length
  const viaSE_after   = [...filFromSE_after].filter(fid => (filToMet[fid] || new Set()).has(mid)).length
  const viaPC_after   = [...filFromPC_after].filter(fid => (filToMet[fid] || new Set()).has(mid)).length
  const viaSVT_after  = [...filFromSVT_after].filter(fid => (filToMet[fid]|| new Set()).has(mid)).length

  const lostForMet = viaSE_before - viaSE_after
  const gainPC     = viaPC_after - viaPC_before
  const gainSVT    = viaSVT_after - viaSVT_before

  console.log(`\n  [${mCode}]`)
  console.log(`    via BAC_SE  : ${viaSE_before} → ${viaSE_after}   (${lostForMet > 0 ? '-'+lostForMet : lostForMet === 0 ? 'inchangé' : '+'+(-lostForMet)})`)
  console.log(`    via BAC_PC  : ${viaPC_before} → ${viaPC_after}   (+${gainPC})`)
  console.log(`    via BAC_SVT : ${viaSVT_before} → ${viaSVT_after}   (+${gainSVT})`)
  const totalBefore = viaSE_before + viaPC_before + viaSVT_before
  const totalAfter  = viaSE_after  + viaPC_after  + viaSVT_after
  const warn = totalAfter < totalBefore ? ' ⚠️  DIMINUTION' : ''
  console.log(`    total filières accessibles : ${totalBefore} → ${totalAfter}${warn}`)
}

// ── Application ───────────────────────────────────────────────────────────────
if (!allOK) {
  console.log(`\n${SEP}`)
  console.log('  ❌ APPLICATION BLOQUÉE — corrige les erreurs ci-dessus')
  console.log(SEP + '\n')
  process.exit(1)
}

if (!APPLY) {
  console.log(`\n${SEP}`)
  console.log('  DRY-RUN TERMINÉ — aucun fichier modifié.')
  console.log('  Pour appliquer : node tools/apply_bac_se_migration.mjs --apply')
  console.log(SEP + '\n')
  process.exit(0)
}

// ── Backup ────────────────────────────────────────────────────────────────────
const ts  = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const bak = EDGES_PATH.replace('edges.json', `edges.bak_bac_se_mig_${ts}`)
copyFileSync(EDGES_PATH, bak)
console.log(`\n  Backup : ${bak.split('/').pop() || bak.split('\\').pop()}`)

// ── Construction du nouveau tableau d'arêtes ──────────────────────────────────
const retained = edges.filter(e => !toDelete.has(e.id))
const newEdges = [...retained, ...newEdgeClean]

// Vérification finale taille
console.log(`  Avant : ${edges.length} arêtes  |  Après : ${newEdges.length} arêtes`)
console.log(`  Suppressions effectives : ${edges.length - retained.length}  |  Créations : ${newEdgeClean.length}`)

writeFileSync(EDGES_PATH, JSON.stringify(newEdges, null, 2), 'utf8')

// Validation JSON
const verify = JSON.parse(readFileSync(EDGES_PATH, 'utf8'))
if (verify.length !== newEdges.length) {
  console.error('❌ ERREUR : taille incohérente après écriture !')
  process.exit(1)
}
console.log(`  ✅ edges.json écrit et vérifié — ${verify.length} arêtes`)

// ── Tests post-application ────────────────────────────────────────────────────
console.log(`\n  5. TESTS POST-APPLICATION`)
console.log(sep)

const newEdgesLoaded = JSON.parse(readFileSync(EDGES_PATH, 'utf8'))
const newDA  = newEdgesLoaded.filter(e => e.type_lien === 'DONNE_ACCES')
const newADM = newEdgesLoaded.filter(e => e.type_lien === 'ADMISSION')
const newREC = newEdgesLoaded.filter(e => e.type_lien === 'RECRUTEMENT')
const newFromPC2  = new Set([...newDA, ...newADM].filter(e => e.source_id === BAC_PC_ID).map(e => e.target_id))
const newFromSVT2 = new Set([...newDA, ...newADM].filter(e => e.source_id === BAC_SVT_ID).map(e => e.target_id))
const newFromSE2  = new Set([...newDA, ...newADM].filter(e => e.source_id === BAC_SE_ID).map(e => e.target_id))
const newFilToMet = {}
for (const e of newREC) (newFilToMet[e.source_id] ??= new Set()).add(e.target_id)

const TC_node = nodes.find(n => n.code === 'TC')
const tcFils  = new Set([...newDA, ...newADM].filter(e => e.source_id === TC_node?.id).map(e => e.target_id))

for (const mCode of METIERS) {
  const mNode = nodes.find(n => n.code === mCode)
  if (!mNode) { console.log(`  [${mCode}] nœud introuvable`); continue }
  const mid = mNode.id
  // Filières atteignables via TC → BAC_* → filière → métier
  const viaPC  = [...newFromPC2].filter(fid  => tcFils.has(BAC_PC_ID)  ? false : (newFilToMet[fid]||new Set()).has(mid)).length
  // Direct : filières via BAC_PC et BAC_SVT qui mènent au métier
  const pcFils  = [...newFromPC2].filter(fid  => (newFilToMet[fid]||new Set()).has(mid))
  const svtFils = [...newFromSVT2].filter(fid => (newFilToMet[fid]||new Set()).has(mid))
  const seFils  = [...newFromSE2].filter(fid  => (newFilToMet[fid]||new Set()).has(mid))
  console.log(`  [${mCode}]  PC:${pcFils.length} SVT:${svtFils.length} SE_reste:${seFils.length}  ${seFils.length === 0 ? '✅ BAC_SE éliminé' : '⚠️ BAC_SE encore présent (AMBIG)'}`)
}

console.log(`\n${SEP}`)
console.log('  ✅ MIGRATION APPLIQUÉE — Redémarrer le backend Spring Boot')
console.log(SEP + '\n')
