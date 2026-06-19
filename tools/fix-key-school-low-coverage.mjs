import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodesPath = path.join(dataDir, 'nodes_all.json')
const edgesPath = path.join(dataDir, 'edges.json')

const readJson = async (file) => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
const writeJson = async (file, value) => fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

const slug = (value = '') =>
  normalize(value)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const nodes = await readJson(nodesPath)
const edges = await readJson(edgesPath)
const byCode = new Map(nodes.map((node) => [node.code, node]))
let nextId = Math.max(...nodes.map((node) => Number(node.id) || 0)) + 1
let nodesAdded = 0
let edgesAdded = 0

const edgeKey = (sourceId, targetId, typeLien) => `${sourceId}|${targetId}|${typeLien}`
const existingEdges = new Set(edges.map((edge) => edgeKey(edge.source_id, edge.target_id, edge.type_lien)))

const findSchool = (patterns) =>
  nodes.find((node) => node.type === 'ETABLISSEMENT' && patterns.some((pattern) => pattern.test(normalize(`${node.code || ''} ${node.nom_fr || ''}`))))

const upsertProgram = (name, city, months, secteur, cost = 0) => {
  const code = slug(name)
  const existing = byCode.get(code)
  if (existing) return existing
  const node = {
    id: nextId,
    code,
    nom_fr: name,
    type: 'FILIERE',
    description: `${name}. Duree consolidee: ${Math.round(months / 12)} ans apres bac.`,
    secteur,
    ville: city,
    duree_mois: months,
    cout_estime: cost,
    actif: true,
  }
  nextId += 1
  nodes.push(node)
  byCode.set(code, node)
  nodesAdded += 1
  return node
}

const addEdge = (source, target, typeLien, extras = {}) => {
  if (!source || !target) return
  const key = edgeKey(source.id, target.id, typeLien)
  if (existingEdges.has(key)) return
  edges.push({
    source_id: source.id,
    target_id: target.id,
    type_lien: typeLien,
    type_acces: extras.type_acces || 'OUVERT',
    moyenne_minimale: extras.moyenne_minimale ?? null,
    taux_reussite: extras.taux_reussite ?? 82,
    cout_supplementaire: extras.cout_supplementaire ?? 0,
    duree_supplementaire_mois: extras.duree_supplementaire_mois ?? 0,
    actif: true,
  })
  existingEdges.add(key)
  edgesAdded += 1
}

const bac = (code) => byCode.get(code)
const job = (code) => byCode.get(code)
const connect = ({ program, school, bacs = [], jobs = [], moyenne = 11 }) => {
  addEdge(program, school, 'OFFERTE_PAR')
  for (const bacCode of bacs) addEdge(bac(bacCode), program, 'ADMISSION', { type_acces: 'CONCOURS', moyenne_minimale: moyenne, taux_reussite: 74 })
  for (const jobCode of jobs) addEdge(program, job(jobCode), 'RECRUTEMENT', { type_acces: 'OUVERT', taux_reussite: 86 })
}

const cases = [
  {
    school: findSchool([/FACULTE.*MEDECINE.*PHARMACIE.*TANGER/, /FMP.*TANGER/]),
    city: 'Tanger',
    entries: [
      ['Diplome de Docteur en Medecine - Faculte de Medecine et de Pharmacie Tanger', 84, 'Sante', 0, ['BAC_SM', 'BAC_PC', 'BAC_SVT'], ['MEDECIN_GENERALISTE'], 14],
      ['Diplome de Docteur en Pharmacie - Faculte de Medecine et de Pharmacie Tanger', 72, 'Sante', 0, ['BAC_SM', 'BAC_PC', 'BAC_SVT'], ['PHARMACIEN'], 14],
    ],
  },
  {
    school: findSchool([/UM6P/, /MOHAMMED VI POLYTECHNIQUE/]),
    city: 'Benguerir',
    entries: [
      ['Bachelor Computer Science - UM6P', 36, 'Informatique', 180000, ['BAC_SM', 'BAC_PC'], ['DEVELOPPEUR_FULL_STACK'], 12],
      ['Cycle Ingenieur Data Science - UM6P', 60, 'Data et IA', 300000, ['BAC_SM', 'BAC_PC'], ['DATA_SCIENTIST', 'DATA_ENGINEER'], 13],
    ],
  },
  {
    school: findSchool([/UNIVERSITE INTERNATIONALE.*CASABLANCA/, /\bUIC\b/]),
    city: 'Casablanca',
    entries: [
      ['Cycle Ingenieur Informatique - Universite Internationale de Casablanca', 60, 'Informatique', 300000, ['BAC_SM', 'BAC_PC'], ['INGENIEUR_GENIE_INFORMATIQUE'], 12],
      ['Programme Grande Ecole Management - Universite Internationale de Casablanca', 60, 'Management', 280000, ['BAC_SE', 'BAC_SGC'], ['MANAGER_COMMERCIAL'], 11],
    ],
  },
  {
    school: findSchool([/ESCA.*CASABLANCA/]),
    city: 'Casablanca',
    entries: [
      ['Programme Grande Ecole Finance - ESCA Casablanca', 60, 'Finance', 260000, ['BAC_SE', 'BAC_SGC', 'BAC_SM'], ['ANALYSTE_FINANCIER', 'AUDITEUR_FINANCIER'], 12],
      ['Bachelor Management - ESCA Casablanca', 36, 'Management', 150000, ['BAC_SE', 'BAC_SGC'], ['ASSISTANT_COMMERCIAL'], 11],
    ],
  },
  {
    school: findSchool([/ISGA.*CASABLANCA/]),
    city: 'Casablanca',
    entries: [
      ['Bachelor Informatique - ISGA Casablanca', 36, 'Informatique', 135000, ['BAC_SM', 'BAC_PC'], ['DEVELOPPEUR_FULL_STACK'], 11],
      ['Bachelor Management et Marketing - ISGA Casablanca', 36, 'Management', 135000, ['BAC_SE', 'BAC_SGC'], ['RESPONSABLE_MARKETING'], 11],
    ],
  },
]

for (const item of cases) {
  if (!item.school) continue
  for (const [name, months, secteur, cost, bacs, jobs, moyenne] of item.entries) {
    connect({
      program: upsertProgram(name, item.city, months, secteur, cost),
      school: item.school,
      bacs,
      jobs,
      moyenne,
    })
  }
}

nodes.sort((a, b) => a.code.localeCompare(b.code))
edges.sort((a, b) => `${a.source_id}${a.target_id}${a.type_lien}`.localeCompare(`${b.source_id}${b.target_id}${b.type_lien}`))

await writeJson(nodesPath, nodes)
await writeJson(edgesPath, edges)

console.log(JSON.stringify({ nodesAdded, edgesAdded, nodes: nodes.length, edges: edges.length }, null, 2))
