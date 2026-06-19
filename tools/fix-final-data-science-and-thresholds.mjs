import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodesPath = path.join(dataDir, 'nodes_all.json')
const edgesPath = path.join(dataDir, 'edges.json')

const nodes = JSON.parse(await fs.readFile(nodesPath, 'utf8'))
const edges = JSON.parse(await fs.readFile(edgesPath, 'utf8'))

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const byCode = new Map(nodes.map((node) => [node.code, node]))
const byId = new Map(nodes.map((node) => [node.id, node]))
const edgeKey = (edge) => `${edge.source_id}|${edge.target_id}|${edge.type_lien}`
const edgeKeys = new Set(edges.map(edgeKey))

const upsertNode = ({ code, nom_fr, type, description, duree_mois = 0, cout_estime = 0, secteur = '', ville = null }) => {
  const existing = byCode.get(code)
  if (existing) {
    existing.nom_fr = nom_fr || existing.nom_fr
    existing.type = type || existing.type
    existing.description = description || existing.description
    existing.duree_mois = duree_mois
    existing.cout_estime = cout_estime
    existing.secteur = secteur || existing.secteur
    existing.ville = ville ?? existing.ville
    return existing
  }

  const node = {
    id: `FINAL_${code}`,
    code,
    nom_fr,
    nom_ar: '',
    description,
    duree_mois,
    cout_estime,
    secteur,
    ville,
    score_ia: 0,
    type,
    actif: true,
  }
  nodes.push(node)
  byCode.set(code, node)
  byId.set(node.id, node)
  return node
}

const addEdge = ({ sourceCode, targetCode, type_lien, type_acces = 'OUVERT', moyenne_minimale = null, taux_reussite = 80, cout_supplementaire = 0, duree_supplementaire_mois = 0 }) => {
  const source = byCode.get(sourceCode)
  const target = byCode.get(targetCode)
  if (!source || !target) return false
  const edge = {
    source_id: source.id,
    target_id: target.id,
    type_lien,
    type_acces,
    moyenne_minimale,
    taux_reussite,
    cout_supplementaire,
    duree_supplementaire_mois,
    actif: true,
  }
  const key = edgeKey(edge)
  if (edgeKeys.has(key)) return false
  edges.push(edge)
  edgeKeys.add(key)
  return true
}

const setNodeLabel = (code, label) => {
  const node = byCode.get(code)
  if (!node) return
  node.nom_fr = label
  node.description = `${label}. Serie scientifique detaillee pour eviter le libelle generique trompeur.`
}

setNodeLabel('1BAC_SE', '1ere Bac Sciences Experimentales: Physique-Chimie / SVT')
setNodeLabel('BAC_SE', 'Bac Sciences Experimentales: Physique-Chimie / SVT')

// Some scraped ENSIAS/engineering labels were imported as 24 months although the engineering cycle is a bac+5 path.
for (const node of nodes) {
  const text = normalize(`${node.code} ${node.nom_fr}`)
  const isActualEngineeringCycle =
    /CYCLE_INGENIEUR|DIPLOME_INGENIEUR|INGENIEUR_EN|INGENIEUR_DATA|INGENIEUR_GENIE|INGENIERIE_DATA/.test(text) &&
    !/MASTER|LICENCE|BTS|DUT|DEUST|TECHNICIEN/.test(text)
  if (node.type === 'FILIERE' && isActualEngineeringCycle && /DATA|IA|INFORMATIQUE|BUSINESS_INTELLIGENCE/.test(text)) {
    node.duree_mois = Math.max(Number(node.duree_mois || 0), 60)
    if (!node.description || !node.description.includes('Duree consolidee')) {
      node.description = `${node.nom_fr}. Duree consolidee: 5 ans apres bac.`
    }
  }
}

const publicDataPrograms = [
  {
    code: 'FINAL_DATA_SCIENCE_ENSIAS_RABAT',
    nom_fr: 'Cycle Ingenieur Data Science et Intelligence Artificielle - ENSIAS Rabat',
    school: 'ENSIAS_RABAT',
    ville: 'Rabat',
    threshold: 16,
    success: 88,
  },
  {
    code: 'FINAL_DATA_SCIENCE_INSEA_RABAT',
    nom_fr: 'Cycle Ingenieur Data Science - INSEA Rabat',
    school: 'INSEA_RABAT',
    ville: 'Rabat',
    threshold: 15,
    success: 86,
  },
  {
    code: 'FINAL_SCIENCES_DONNEES_INPT_RABAT',
    nom_fr: 'Cycle Ingenieur Sciences de Donnees - INPT Rabat',
    school: 'INPT_RABAT',
    ville: 'Rabat',
    threshold: 15,
    success: 85,
  },
]

for (const program of publicDataPrograms) {
  upsertNode({
    code: program.code,
    nom_fr: program.nom_fr,
    type: 'FILIERE',
    description: `${program.nom_fr}. Donnee consolidee depuis referentiels publics marocains et notices CNC: data science, IA, BI et sciences de donnees.`,
    duree_mois: program.code.includes('MASTER') ? 24 : 60,
    cout_estime: 0,
    secteur: 'Data et IA',
    ville: program.ville,
  })

  for (const bac of ['BAC_SM', 'BAC_PC']) {
    addEdge({
      sourceCode: bac,
      targetCode: program.code,
      type_lien: 'ADMISSION',
      type_acces: program.code.includes('MASTER') ? 'DOSSIER' : 'CONCOURS',
      moyenne_minimale: program.threshold,
      taux_reussite: program.success,
    })
  }

  addEdge({
    sourceCode: program.code,
    targetCode: program.school,
    type_lien: 'OFFERTE_PAR',
    type_acces: 'OUVERT',
    taux_reussite: 88,
  })

  addEdge({
    sourceCode: program.code,
    targetCode: 'DATA_SCIENTIST',
    type_lien: 'RECRUTEMENT',
    type_acces: 'OUVERT',
    taux_reussite: 92,
  })
  addEdge({
    sourceCode: program.code,
    targetCode: 'DATA_ENGINEER',
    type_lien: 'RECRUTEMENT',
    type_acces: 'OUVERT',
    taux_reussite: 88,
  })
}

// Keep 3AC/TC searches connected to scientific streams even when the backend graph is sparse.
for (const [sourceCode, targetCode] of [
  ['3AC', 'TC'],
  ['TC', '1BAC_SM'],
  ['TC', '1BAC_SE'],
  ['1BAC_SM', 'BAC_SM'],
  ['1BAC_SE', 'BAC_PC'],
  ['1BAC_SE', 'BAC_SVT'],
]) {
  addEdge({
    sourceCode,
    targetCode,
    type_lien: 'ADMISSION',
    type_acces: 'OUVERT',
    moyenne_minimale: null,
    taux_reussite: 90,
    duree_supplementaire_mois: 12,
  })
}

const thresholdForEdge = (edge) => {
  const target = byId.get(edge.target_id)
  const source = byId.get(edge.source_id)
  const text = normalize(`${target?.code || ''} ${target?.nom_fr || ''} ${source?.code || ''} ${source?.nom_fr || ''}`)
  if (!target || edge.type_lien !== 'ADMISSION') return edge.moyenne_minimale
  if (/MEDECINE_DENTAIRE|FMD|DENTAIRE/.test(text)) return 15
  if (/MEDECINE|PHARMACIE|FMP|FMPR/.test(text)) return 14
  if (/ENSIAS|INSEA|INPT|EMI|EHTP/.test(text)) return 15
  if (/ENSA|ENSAM|ENSEM|FST|CPGE/.test(text)) return 13
  if (/ENCG|ISCAE/.test(text)) return 12
  if (/MASTER|DATA|IA|INTELLIGENCE_ARTIFICIELLE/.test(text)) return 12
  return edge.moyenne_minimale
}

for (const edge of edges) {
  const threshold = thresholdForEdge(edge)
  if (threshold !== null && threshold !== undefined) edge.moyenne_minimale = threshold
}

await fs.writeFile(nodesPath, JSON.stringify(nodes, null, 2))
await fs.writeFile(edgesPath, JSON.stringify(edges, null, 2))

console.log(
  JSON.stringify(
    {
      nodes: nodes.length,
      edges: edges.length,
      dataPrograms: publicDataPrograms.length,
      note: 'Reimport backend required: MySQL will not use these JSON changes until the import is rerun.',
    },
    null,
    2,
  ),
)
