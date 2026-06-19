/**
 * DRY-RUN — Analyse des arêtes sortantes de BAC_SE pour migration propre
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

const SEP = '═'.repeat(76)
const sep = '─'.repeat(76)
const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

// ── IDs clés ─────────────────────────────────────────────────────────────────
const BAC_SE_ID  = '84a28554-5207-5ee6-a33f-340e0b111cfd'
const BAC_PC_ID  = '76295ee1-7173-59d3-b492-659129349d51'
const BAC_SVT_ID = 'e85e8101-794f-57da-ac49-bf1ccd2a4fae'
const BACS_1SE_ID= '40227037-e705-4efb-9f6f-4c10b1078f19'
const PHARM_ID   = '873f9abe-bb3a-4fb2-a8dd-756bd4c2544a'

const BAC_SE_node  = nmap[BAC_SE_ID]
const BAC_PC_node  = nmap[BAC_PC_ID]
const BAC_SVT_node = nmap[BAC_SVT_ID]

// ── Arêtes indexées ───────────────────────────────────────────────────────────
const DA  = edges.filter(e => e.type_lien === 'DONNE_ACCES')
const ADM = edges.filter(e => e.type_lien === 'ADMISSION')
const REC = edges.filter(e => e.type_lien === 'RECRUTEMENT')
const allEdgesFromBAC_SE  = [...DA, ...ADM].filter(e => e.source_id === BAC_SE_ID)
const allEdgesFromBAC_PC  = [...DA, ...ADM].filter(e => e.source_id === BAC_PC_ID)
const allEdgesFromBAC_SVT = [...DA, ...ADM].filter(e => e.source_id === BAC_SVT_ID)
const targetsOfBAC_PC  = new Map(allEdgesFromBAC_PC.map(e  => [e.target_id, e]))
const targetsOfBAC_SVT = new Map(allEdgesFromBAC_SVT.map(e => [e.target_id, e]))

// ── Classificateur PC / SVT / BOTH / AMBIG ────────────────────────────────────
//    Basé sur le nom normalisé de la filière cible

const PC_KEYWORDS = [
  'PHYSIQUE','CHIMIE','ELECTR','MECANIQUE','GENIE CIVIL','GENIE ENERGETIQUE',
  'MATERIAUX','ELECTRONIQUE','AUTOMATIQUE','INFORMATIQUE','MATHEMATIQUE','MATH',
  'STATISTIQUE','MODELISATION','INGENIEUR','INGENIERIE','PREPAS','CPGE',
  'CONCOURS GRANDES ECOLES','ARCHITECTURE','TOPOGRAPHIE','MINES','PETROLE',
  'GEOLOGIE INGENIERIE','THERMODYNAMIQUE','AERONAUTIQUE','ROBOTIQUE',
  'SYSTEMES EMBARQUES','SIGNAL','TRAITEMENT IMAGE','RESEAU',
]

const SVT_KEYWORDS = [
  'BIOLOGIE','BIOCHIMIE','BIOTECH','BIOTECHNOLOGIE',
  'MEDECINE','PHARMACIE','DENTAIRE','INFIRMIER','SAGE.FEMME','SANTE',
  'VETERINAIRE','AGRONOMIE','AGRICULTURE','FORESTIER','PECHE','AQUACULTURE',
  'ENVIRONNEMENT','ECOLOGIE','GEOLOGIE SCIENCES','MICROBIOLOGIE',
  'IMMUNOLOGIE','PHYSIOLOGIE','NUTRITION','DIETETICIEN','KINESITHERAPIE',
  'ORTHOPHONIE','OPTICIEN','PARAMEDICAL',
]

const BOTH_KEYWORDS = [
  'SCIENCES EXPERIMENTALES','SCIENCES EXP',
  'LICENCE SCIENCES','LICENCE ES','DUT','BTS',
  'MANAGEMENT','GESTION','COMMERCE','ECONOMIE','DROIT','LANGUES',
  'SOCIOLOGIE','PSYCHOLOGIE','COMMUNICATION',
]

const classifyFiliere = (nom = '', code = '') => {
  const txt = norm(`${nom} ${code}`)
  const pcScore  = PC_KEYWORDS.filter(kw => txt.includes(kw)).length
  const svtScore = SVT_KEYWORDS.filter(kw => txt.includes(kw)).length
  const bothScore= BOTH_KEYWORDS.filter(kw => txt.includes(kw)).length

  if (pcScore > 0 && svtScore === 0)  return { cat: 'PC',   pcScore, svtScore, bothScore }
  if (svtScore > 0 && pcScore === 0)  return { cat: 'SVT',  pcScore, svtScore, bothScore }
  if (pcScore > 0 && svtScore > 0)    return { cat: 'BOTH', pcScore, svtScore, bothScore }
  if (bothScore > 0)                  return { cat: 'BOTH', pcScore, svtScore, bothScore }
  return { cat: 'AMBIG', pcScore, svtScore, bothScore }
}

// ── Analyse de chaque arête sortante de BAC_SE ───────────────────────────────
const analysis = []
for (const e of allEdgesFromBAC_SE) {
  const tgt = nmap[e.target_id]
  if (!tgt) continue
  const nom  = tgt.nom_fr || tgt.nom || ''
  const code = tgt.code || ''
  const cls  = classifyFiliere(nom, code)

  const coveredByPC  = targetsOfBAC_PC.has(e.target_id)
  const coveredBySVT = targetsOfBAC_SVT.has(e.target_id)

  // Stratégie par arête
  let strategy
  if (coveredByPC && coveredBySVT) {
    strategy = 'DEJA_COUVERTE_PC_SVT'    // déjà présente dans les deux → supprimer BAC_SE edge
  } else if (coveredByPC && !coveredBySVT) {
    strategy = cls.cat === 'SVT' ? 'AJOUTER_SVT'         // ajouter vers SVT aussi
              : cls.cat === 'PC'  ? 'DEJA_PC_OK'          // couvert par PC, conforme
              : cls.cat === 'BOTH'? 'AJOUTER_SVT'         // dual → ajouter SVT
              : 'DEJA_PC_AMBIG'                            // ambigu, couvert PC
  } else if (!coveredByPC && coveredBySVT) {
    strategy = cls.cat === 'PC'  ? 'AJOUTER_PC'          // ajouter vers PC aussi
              : cls.cat === 'SVT' ? 'DEJA_SVT_OK'         // couvert par SVT, conforme
              : cls.cat === 'BOTH'? 'AJOUTER_PC'          // dual → ajouter PC
              : 'DEJA_SVT_AMBIG'                           // ambigu, couvert SVT
  } else {
    // Ni PC ni SVT ne couvrent cette cible
    strategy = cls.cat === 'PC'   ? 'MIGRER_VERS_PC'
              : cls.cat === 'SVT'  ? 'MIGRER_VERS_SVT'
              : cls.cat === 'BOTH' ? 'DUPLIQUER_PC_ET_SVT'
              : 'CONSERVER_BAC_SE'  // vraiment ambigu
  }

  analysis.push({
    edgeId: e.id,
    targetId: e.target_id,
    nom: nom.slice(0, 60),
    code,
    type_lien: e.type_lien,
    cat: cls.cat,
    coveredByPC, coveredBySVT,
    strategy,
  })
}

// ── Comptages par stratégie ───────────────────────────────────────────────────
const byStrategy = {}
for (const a of analysis) {
  byStrategy[a.strategy] = (byStrategy[a.strategy] || 0) + 1
}

const byCategory = {}
for (const a of analysis) {
  byCategory[a.cat] = (byCategory[a.cat] || 0) + 1
}

// Arêtes vers Pharmacien spécifiquement
const pharmEdgesFromSE = analysis.filter(a => {
  const n = nmap[a.targetId]
  return n && (REC[0] || []) && [...edges.filter(e => e.source_id === a.targetId && e.type_lien === 'RECRUTEMENT')].some(e => e.target_id === PHARM_ID)
})

console.log(`\n${SEP}`)
console.log('  DRY-RUN — Migration BAC_SE → BAC_PC / BAC_SVT')
console.log(SEP)

// ── 1. Comptages globaux ──────────────────────────────────────────────────────
console.log(`\n  1. COMPTAGES GLOBAUX`)
console.log(sep)
console.log(`  Total arêtes sortantes BAC_SE       : ${analysis.length}`)
console.log(`  Arêtes sortantes BAC_PC              : ${allEdgesFromBAC_PC.length}`)
console.log(`  Arêtes sortantes BAC_SVT             : ${allEdgesFromBAC_SVT.length}`)

console.log(`\n  Classification des filières cibles (BAC_SE → ?) :`)
console.log(`    PC   (Physique-Chimie, Ingénierie…) : ${byCategory['PC']   || 0}`)
console.log(`    SVT  (Bio, Médecine, Agro…)         : ${byCategory['SVT']  || 0}`)
console.log(`    BOTH (compatible PC + SVT)           : ${byCategory['BOTH'] || 0}`)
console.log(`    AMBIG (pas de signal)                : ${byCategory['AMBIG']|| 0}`)

// ── 2. Couverture par BAC_PC et BAC_SVT ──────────────────────────────────────
console.log(`\n  2. COUVERTURE EXISTANTE`)
console.log(sep)
const alreadyBothPC_SVT = analysis.filter(a => a.coveredByPC && a.coveredBySVT).length
const alreadyOnlyPC     = analysis.filter(a => a.coveredByPC && !a.coveredBySVT).length
const alreadyOnlySVT    = analysis.filter(a => !a.coveredByPC && a.coveredBySVT).length
const notCoveredByAny   = analysis.filter(a => !a.coveredByPC && !a.coveredBySVT).length

console.log(`  Déjà couvertes par BAC_PC ET BAC_SVT : ${alreadyBothPC_SVT}  → arêtes BAC_SE redondantes`)
console.log(`  Couvertes par BAC_PC seulement        : ${alreadyOnlyPC}`)
console.log(`  Couvertes par BAC_SVT seulement       : ${alreadyOnlySVT}`)
console.log(`  Non couvertes par BAC_PC ni BAC_SVT   : ${notCoveredByAny}`)

// ── 3. Stratégie par arête ────────────────────────────────────────────────────
console.log(`\n  3. STRATÉGIE PAR ARÊTE`)
console.log(sep)
const stratOrder = [
  ['DEJA_COUVERTE_PC_SVT',  'Redondante (déjà dans PC + SVT) → supprimer BAC_SE edge'],
  ['DEJA_PC_OK',            'Déjà dans PC, classification PC → OK'],
  ['DEJA_SVT_OK',           'Déjà dans SVT, classification SVT → OK'],
  ['DEJA_PC_AMBIG',         'Déjà dans PC, filière ambiguë → conserver ou dupliquer SVT'],
  ['DEJA_SVT_AMBIG',        'Déjà dans SVT, filière ambiguë → conserver ou dupliquer PC'],
  ['AJOUTER_SVT',           'Dans PC, mais filière SVT/BOTH → ajouter arête BAC_SVT→filière'],
  ['AJOUTER_PC',            'Dans SVT, mais filière PC/BOTH → ajouter arête BAC_PC→filière'],
  ['MIGRER_VERS_PC',        'Ni PC ni SVT, classification PC → créer BAC_PC→filière'],
  ['MIGRER_VERS_SVT',       'Ni PC ni SVT, classification SVT → créer BAC_SVT→filière'],
  ['DUPLIQUER_PC_ET_SVT',   'Ni PC ni SVT, BOTH → créer BAC_PC→filière ET BAC_SVT→filière'],
  ['CONSERVER_BAC_SE',      'Ambigu, pas de signal clair → conserver arête BAC_SE'],
]
for (const [strat, label] of stratOrder) {
  const count = byStrategy[strat] || 0
  if (count > 0) {
    console.log(`  ${String(count).padStart(4)}  ${strat.padEnd(28)} ${label}`)
  }
}

// ── 4. Résumé opérationnel ────────────────────────────────────────────────────
console.log(`\n  4. RÉSUMÉ OPÉRATIONNEL`)
console.log(sep)

const toDelete   = byStrategy['DEJA_COUVERTE_PC_SVT'] || 0
const toAddSVT   = (byStrategy['AJOUTER_SVT']   || 0) + (byStrategy['MIGRER_VERS_SVT']       || 0)
const toAddPC    = (byStrategy['AJOUTER_PC']    || 0) + (byStrategy['MIGRER_VERS_PC']         || 0)
const toDupBoth  = (byStrategy['DUPLIQUER_PC_ET_SVT'] || 0)
const toKeep     = (byStrategy['CONSERVER_BAC_SE']    || 0)
  + (byStrategy['DEJA_PC_OK']    || 0) + (byStrategy['DEJA_SVT_OK']    || 0)
  + (byStrategy['DEJA_PC_AMBIG'] || 0) + (byStrategy['DEJA_SVT_AMBIG'] || 0)

console.log(`  Arêtes BAC_SE rendues redondantes (supprimables) : ${toDelete}`)
console.log(`  Nouvelles arêtes à créer vers BAC_SVT            : ${toAddSVT}`)
console.log(`  Nouvelles arêtes à créer vers BAC_PC             : ${toAddPC}`)
console.log(`  Arêtes à dupliquer vers BAC_PC ET BAC_SVT        : ${toDupBoth} (×2 = ${toDupBoth * 2} nouvelles)`)
console.log(`  Arêtes BAC_SE à conserver (ambiguës)             : ${toKeep}`)
console.log(`  TOTAL nouvelles arêtes                           : ${toAddSVT + toAddPC + toDupBoth * 2}`)
console.log(`  Impact net BFS : +${toAddSVT + toAddPC + toDupBoth * 2} arêtes, -${toDelete} redondantes`)

// ── 5. Exemples par catégorie ─────────────────────────────────────────────────
console.log(`\n  5. EXEMPLES PAR CATÉGORIE (5 premiers)`)
console.log(sep)
for (const [strat] of stratOrder) {
  const examples = analysis.filter(a => a.strategy === strat).slice(0, 5)
  if (!examples.length) continue
  console.log(`\n  [${strat}]`)
  for (const ex of examples) {
    const pcMark  = ex.coveredByPC  ? '✅PC'  : '✗PC'
    const svtMark = ex.coveredBySVT ? '✅SVT' : '✗SVT'
    console.log(`    ${pcMark} ${svtMark} [${ex.cat}]  ${ex.nom}`)
  }
}

// ── 6. Focus Pharmacien ───────────────────────────────────────────────────────
console.log(`\n  6. FOCUS — Arêtes BAC_SE → filières Pharmacien`)
console.log(sep)
const pharmFromSE = analysis.filter(a => {
  return edges.some(e => e.source_id === a.targetId && e.type_lien === 'RECRUTEMENT' && e.target_id === PHARM_ID)
})
console.log(`  Filières Pharmacie accessibles via BAC_SE : ${pharmFromSE.length}`)
for (const a of pharmFromSE) {
  const pcMark  = a.coveredByPC  ? '✅PC'  : '✗PC'
  const svtMark = a.coveredBySVT ? '✅SVT' : '✗SVT'
  console.log(`    ${pcMark} ${svtMark} [${a.cat}] [${a.strategy}]  ${a.nom}`)
}

// ── 7. Impact BFS estimé ──────────────────────────────────────────────────────
console.log(`\n  7. IMPACT BFS ESTIMÉ`)
console.log(sep)

// Sources de BAC_SE (1BAC_SE + 1BAC_ECO)
const sourcesOfSE = [...new Set([...DA, ...ADM].filter(e => e.target_id === BAC_SE_ID).map(e => e.source_id))]
console.log(`  Sources → BAC_SE : ${sourcesOfSE.length}`)
for (const id of sourcesOfSE) {
  const n = nmap[id]
  console.log(`    ${n?.code}  "${n?.nom_fr}"`)
}
console.log(`  (Seul 1BAC_SE → BAC_SE est concerné par le modèle pédagogique)`)
console.log(`\n  Chemins actuels via BAC_SE : ${sourcesOfSE.length} sources × ${analysis.length} filières cibles`)
console.log(`  Après migration, ces chemins seraient répartis entre BAC_PC et BAC_SVT.`)
console.log(`  Chemins Pharmacie via BAC_SE perdus si BAC_SE supprimé : ${pharmFromSE.filter(a => !a.coveredByPC && !a.coveredBySVT).length}`)
console.log(`  Chemins Pharmacie déjà dans BAC_PC ou BAC_SVT : ${pharmFromSE.filter(a => a.coveredByPC || a.coveredBySVT).length}`)

// ── 8. Exemple avant/après Pharmacien depuis 3AC ─────────────────────────────
console.log(`\n  8. EXEMPLE AVANT/APRÈS — Pharmacien depuis 3AC`)
console.log(sep)

// Trouver la filière FMPC Casablanca
const FMPC_node = nmap['43d0776b-9262-ef44-2ebe-6a87d05f0960']
const PHARM_node = nmap[PHARM_ID]
const TC_node    = nodes.find(n => n.code === 'TC')
const AC3_node   = nodes.find(n => n.code === '3AC')
const BAC_PC_node_= nmap[BAC_PC_ID]
const BAC_SVT_node_= nmap[BAC_SVT_ID]
const node1BAC_SE = nmap[BACS_1SE_ID]

console.log('  AVANT :')
console.log(`    3AC → TC → [1BAC_SE] → [BAC_SE "Bac Sciences Experimentales: Physique-Chimie / SVT"] → FMPC → Pharmacien`)
console.log(`    └─ Libellé affiché : "Bac Sciences Experimentales: Physique-Chimie / SVT"  ❌`)
console.log()
console.log('  APRÈS (post-migration) :')
console.log(`    Chemin A : 3AC → TC → [1BAC_SE] → [BAC_PC "Bac Sciences Physiques-Chimie"] → FMPC → Pharmacien`)
console.log(`               └─ Libellé affiché : "Bac Sciences Physiques-Chimie"  ✅`)
console.log(`    Chemin B : 3AC → TC → [1BAC_SE] → [BAC_SVT "Bac Sciences de la Vie et de la Terre"] → FMPC → Pharmacien`)
console.log(`               └─ Libellé affiché : "Bac Sciences de la Vie et de la Terre"  ✅`)
console.log(`    └─ Ces deux chemins existent déjà partiellement (BAC_PC → FMPC couvert par PC, BAC_SVT à vérifier)`)

// Vérifier si BAC_PC → FMPC existe déjà
const fmpcId = '43d0776b-9262-ef44-2ebe-6a87d05f0960'
const pcToFMPC  = allEdgesFromBAC_PC.some(e => e.target_id === fmpcId)
const svtToFMPC = allEdgesFromBAC_SVT.some(e => e.target_id === fmpcId)
const seToFMPC  = allEdgesFromBAC_SE.some(e => e.target_id === fmpcId)
console.log(`\n  Arête BAC_PC → FMPC existe : ${pcToFMPC   ? '✅ oui' : '❌ non'}`)
console.log(`  Arête BAC_SVT→ FMPC existe : ${svtToFMPC  ? '✅ oui' : '❌ non'}`)
console.log(`  Arête BAC_SE → FMPC existe : ${seToFMPC   ? '✅ oui' : '❌ non'}`)

// ── 9. Risques ────────────────────────────────────────────────────────────────
console.log(`\n  9. RISQUES`)
console.log(sep)
console.log(`
  R1 — Volume : ${analysis.length} arêtes à traiter. Opération lourde sur edges.json.
       Mitigation : script automatisé avec backup + vérification post-migration.

  R2 — Classification imparfaite : le classificateur par mots-clés peut mal classer
       des filières au nom générique (ex: "Licence Sciences" → BOTH, mais peut être
       purement PC ou SVT selon l'établissement).
       Mitigation : classer BOTH = dupliquer vers PC + SVT (sécurité maximale),
       valider manuellement les cas AMBIG (${byCategory['AMBIG'] || 0} filières).

  R3 — Perte de chemins si BAC_SE supprimé avant migration : si des filières ne sont
       couvertes ni par BAC_PC ni BAC_SVT, les supprimer de BAC_SE les rendrait
       inaccessibles.
       Mitigation : migrer AVANT de supprimer les arêtes BAC_SE.

  R4 — BAC_SE reçoit aussi des arêtes depuis 1BAC_ECO (filières économiques).
       Ces arêtes ne concernent pas la migration PC/SVT.
       Mitigation : ne migrer que les arêtes dont la source directe est 1BAC_SE.

  R5 — Doublons arêtes : si BAC_PC → filière existe déjà avec même type_lien,
       dupliquer créerait deux arêtes identiques.
       Mitigation : vérifier l'existence avant insertion (section 2 ci-dessus).

  R6 — Backend cache : redémarrage Spring Boot requis après modification edges.json.
`)

console.log(SEP + '\n')
