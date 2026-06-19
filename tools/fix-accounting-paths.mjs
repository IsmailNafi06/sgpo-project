import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodesPath = path.join(dataDir, 'nodes_all.json')
const edgesPath = path.join(dataDir, 'edges.json')

const readJson = async (file) => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
const writeJson = async (file, value) => fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')

const nodes = await readJson(nodesPath)
const edges = await readJson(edgesPath)
const byCode = new Map(nodes.map((node) => [node.code, node]))

const financeSector = 'Audit, Comptabilite et Gestion'
let nodesUpdated = 0
let edgesAdded = 0

for (const node of nodes) {
  const text = `${node.code || ''} ${node.nom_fr || ''} ${node.description || ''}`.toUpperCase()
  if (/EXPERTISE_COMPTABLE|EXPERTISE COMPTABLE|D\.N\.E\.C|DNEC/.test(text)) {
    if (node.secteur !== financeSector) {
      node.secteur = financeSector
      nodesUpdated += 1
    }
    if (node.type === 'FILIERE' && Number(node.duree_mois || 0) !== 36) {
      node.duree_mois = 36
      nodesUpdated += 1
    }
  }
}

const edgeKey = (sourceId, targetId, typeLien) => `${sourceId}|${targetId}|${typeLien}`
const existingEdges = new Set(edges.map((edge) => edgeKey(edge.source_id, edge.target_id, edge.type_lien)))

const addEdge = (source, target, typeLien, extras = {}) => {
  if (!source || !target) return
  const key = edgeKey(source.id, target.id, typeLien)
  if (existingEdges.has(key)) return
  edges.push({
    source_id: source.id,
    target_id: target.id,
    type_lien: typeLien,
    type_acces: extras.type_acces || 'CONCOURS',
    moyenne_minimale: extras.moyenne_minimale ?? 12,
    taux_reussite: extras.taux_reussite ?? 78,
    cout_supplementaire: extras.cout_supplementaire ?? 0,
    duree_supplementaire_mois: extras.duree_supplementaire_mois ?? 0,
    actif: true,
  })
  existingEdges.add(key)
  edgesAdded += 1
}

const expertJob = byCode.get('EXPERT_COMPTABLE')
const cecPrograms = nodes.filter(
  (node) => node.type === 'FILIERE' && /CYCLE_D_EXPERTISE_COMPTABLE|Cycle d'Expertise Comptable/i.test(`${node.code} ${node.nom_fr}`),
)
const isAccountingBac5Program = (node) => {
  if (node.type !== 'FILIERE') return false
  const text = `${node.code || ''} ${node.nom_fr || ''} ${node.secteur || ''}`.toUpperCase()
  const positive = /(FINANCE|FINANCIER|COMPTABILITE|COMPTA|AUDIT|CONTROLE DE GESTION|GESTION COMPTABLE|EXPERTISE COMPTABLE|GENIE FINANCIER|BANQUE|ASSURANCE|FISCAL)/.test(
    text,
  )
  const negative = /(MARKETING|COMMUNICATION|LOGISTIQUE|SUPPLY|RESSOURCES HUMAINES|\bRH\b|TOURISME|SCIENCES POLITIQUES|DROIT INTERNATIONAL|COMMERCE INTERNATIONAL|E[-\s]?COMMERCE)/.test(
    text,
  )
  const credibleSchool = /(ISCAE|ENCG|FSJES|FACULTE|UNIVERSITE)/.test(text)
  const genericPrivateSchool = /(ISGA|MUNDIAPOLIS|EMSI|\bIGA\b|HEM|ESCA|GROUPE|PRIVE|PRIVEE|PRIVATE|SYSTEME D INFORMATION|SYSTEMES D INFORMATION)/.test(
    text,
  )
  return (
    Number(node.duree_mois || 0) >= 60 &&
    positive &&
    !negative &&
    credibleSchool &&
    !genericPrivateSchool &&
    !/CYCLE_D_EXPERTISE_COMPTABLE|EXPERTISE COMPTABLE/.test(text)
  )
}

const cecIds = new Set(cecPrograms.map((node) => node.id))
let edgesRemoved = 0
for (let index = edges.length - 1; index >= 0; index -= 1) {
  const edge = edges[index]
  if (edge.type_lien !== 'DONNE_ACCES' || !cecIds.has(edge.target_id)) continue
  const source = nodes.find((node) => node.id === edge.source_id)
  if (!source || isAccountingBac5Program(source)) continue
  edges.splice(index, 1)
  existingEdges.delete(edgeKey(edge.source_id, edge.target_id, edge.type_lien))
  edgesRemoved += 1
}

const financeBac5Programs = nodes.filter(isAccountingBac5Program)

for (const cec of cecPrograms) {
  addEdge(cec, expertJob, 'RECRUTEMENT', {
    type_acces: 'OUVERT',
    moyenne_minimale: null,
    taux_reussite: 92,
  })
  for (const source of financeBac5Programs) {
    addEdge(source, cec, 'DONNE_ACCES', {
      type_acces: 'CONCOURS',
      moyenne_minimale: 12,
      taux_reussite: 76,
    })
  }
}

nodes.sort((a, b) => a.code.localeCompare(b.code))
edges.sort((a, b) => `${a.source_id}${a.target_id}${a.type_lien}`.localeCompare(`${b.source_id}${b.target_id}${b.type_lien}`))

await writeJson(nodesPath, nodes)
await writeJson(edgesPath, edges)

console.log(JSON.stringify({ nodesUpdated, edgesAdded, edgesRemoved, nodes: nodes.length, edges: edges.length }, null, 2))
