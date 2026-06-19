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
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()

const slug = (value = '') => normalize(value).replace(/\s+/g, '_')
const compact = (value = '') => normalize(value).replace(/\s+/g, '')

const nodes = await readJson(nodesPath)
const edges = await readJson(edgesPath)

const byCode = new Map(nodes.map((node) => [node.code, node]))
const byId = new Map(nodes.map((node) => [node.id, node]))
let nextId = Math.max(...nodes.map((node) => Number(node.id) || 0)) + 1
let nodesAdded = 0
let nodesUpdated = 0
let edgesAdded = 0

const edgeKey = (sourceId, targetId, typeLien) => `${sourceId}|${targetId}|${typeLien}`
const existingEdges = new Set(edges.map((edge) => edgeKey(edge.source_id, edge.target_id, edge.type_lien)))

const upsertNode = (node) => {
  const existing = byCode.get(node.code)
  if (existing) {
    let changed = false
    for (const [key, value] of Object.entries(node)) {
      if (value === undefined) continue
      if ((existing[key] === null || existing[key] === undefined || existing[key] === '') && value !== null && value !== '') {
        existing[key] = value
        changed = true
      }
    }
    if (changed) nodesUpdated += 1
    return existing
  }

  const created = {
    id: nextId,
    actif: true,
    ...node,
  }
  nextId += 1
  nodes.push(created)
  byCode.set(created.code, created)
  byId.set(created.id, created)
  nodesAdded += 1
  return created
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
    taux_reussite: extras.taux_reussite ?? 80,
    cout_supplementaire: extras.cout_supplementaire ?? 0,
    duree_supplementaire_mois: extras.duree_supplementaire_mois ?? 0,
    prerequis_notes: extras.prerequis_notes || undefined,
    actif: true,
  })
  existingEdges.add(key)
  edgesAdded += 1
}

const school = (name, city, secteur = 'Enseignement superieur', description = '') =>
  upsertNode({
    code: slug(name),
    nom_fr: name,
    type: 'ETABLISSEMENT',
    description: description || `${name}, etablissement d'enseignement superieur a ${city}.`,
    secteur,
    ville: city,
    duree_mois: 0,
    cout_estime: 0,
  })

const program = (name, city, months, secteur, cost = 0, description = '') =>
  upsertNode({
    code: slug(name),
    nom_fr: name,
    type: 'FILIERE',
    description: description || `${name}. Duree consolidee: ${Math.round(months / 12)} ans apres bac.`,
    secteur,
    ville: city,
    duree_mois: months,
    cout_estime: cost,
  })

const job = (code) => byCode.get(code)
const bac = (code) => byCode.get(code)

const connectPostBac = (sources, target, moyenne = 12) => {
  for (const sourceCode of sources) {
    addEdge(bac(sourceCode), target, 'ADMISSION', { type_acces: 'CONCOURS', moyenne_minimale: moyenne, taux_reussite: 75 })
  }
}

const connectProgram = ({ programNode, schoolNode, bacs = [], jobs = [], moyenne = 12 }) => {
  addEdge(programNode, schoolNode, 'OFFERTE_PAR')
  connectPostBac(bacs, programNode, moyenne)
  connectPostBac(bacs, schoolNode, moyenne)
  for (const jobCode of jobs) addEdge(programNode, job(jobCode), 'RECRUTEMENT', { type_acces: 'OUVERT', taux_reussite: 86 })
}

const publicEngineeringBacs = ['BAC_SM', 'BAC_PC', 'BAC_SVT', 'BAC_TECH_ELEC', 'BAC_TECH_MECA']
const healthBacs = ['BAC_SM', 'BAC_PC', 'BAC_SVT']
const managementBacs = ['BAC_SE', 'BAC_SGC', 'BAC_SM', 'BAC_PC', 'BAC_SVT']

const fmpSchools = [
  ['Faculte de Medecine et de Pharmacie Rabat', 'Rabat'],
  ['Faculte de Medecine et de Pharmacie Agadir', 'Agadir'],
]
for (const [name, city] of fmpSchools) {
  const s = school(name, city, 'Sante')
  connectProgram({
    programNode: program(`Diplome de Docteur en Medecine - ${name}`, city, 84, 'Sante'),
    schoolNode: s,
    bacs: healthBacs,
    jobs: ['MEDECIN_GENERALISTE'],
    moyenne: 14,
  })
  connectProgram({
    programNode: program(`Diplome de Docteur en Pharmacie - ${name}`, city, 72, 'Sante'),
    schoolNode: s,
    bacs: healthBacs,
    jobs: ['PHARMACIEN'],
    moyenne: 14,
  })
}

for (const city of ['Rabat', 'Casablanca', 'Fes']) {
  const name = `Faculte de Medecine Dentaire ${city}`
  const s = school(name, city, 'Sante')
  connectProgram({
    programNode: program(`Diplome de Docteur en Medecine Dentaire - ${name}`, city, 72, 'Sante'),
    schoolNode: s,
    bacs: healthBacs,
    jobs: ['DENTISTE'],
    moyenne: 14,
  })
}

for (const city of ['Kenitra', 'Marrakech']) {
  const s = school(`ENSA ${city}`, city, 'Ingenierie')
  for (const [label, jobs] of [
    ['Genie Informatique', ['INGENIEUR_GENIE_INFORMATIQUE', 'DEVELOPPEUR_FULL_STACK']],
    ['Genie Industriel', ['INGENIEUR_INDUSTRIEL']],
    ['Genie Electrique', ['INGENIEUR_ELECTRIQUE']],
  ]) {
    connectProgram({
      programNode: program(`Cycle Ingenieur ${label} - ENSA ${city}`, city, 60, 'Ingenierie'),
      schoolNode: s,
      bacs: publicEngineeringBacs,
      jobs,
      moyenne: 13,
    })
  }
}

const ensamCasa = school('ENSAM Casablanca', 'Casablanca', 'Ingenierie')
for (const [label, jobs] of [
  ['Genie Mecanique', ['INGENIEUR_MECANIQUE']],
  ['Genie Industriel', ['INGENIEUR_INDUSTRIEL']],
  ['Genie Electrique', ['INGENIEUR_ELECTRIQUE']],
]) {
  connectProgram({
    programNode: program(`Cycle Ingenieur ${label} - ENSAM Casablanca`, 'Casablanca', 60, 'Ingenierie'),
    schoolNode: ensamCasa,
    bacs: publicEngineeringBacs,
    jobs,
    moyenne: 13,
  })
}

const iav = school('Institut Agronomique et Veterinaire Hassan II Rabat', 'Rabat', 'Agronomie et sciences veterinaires')
connectProgram({
  programNode: program('APESA - IAV Hassan II Rabat', 'Rabat', 24, 'Agronomie et sciences veterinaires'),
  schoolNode: iav,
  bacs: healthBacs,
  jobs: ['TECHNICIEN_AGROINDUSTRIE'],
  moyenne: 13,
})
connectProgram({
  programNode: program('Diplome Ingenieur Agronome - IAV Hassan II Rabat', 'Rabat', 60, 'Agronomie'),
  schoolNode: iav,
  bacs: healthBacs,
  jobs: ['INGENIEUR_AGRONOME'],
  moyenne: 13,
})
connectProgram({
  programNode: program('Diplome de Docteur Veterinaire - IAV Hassan II Rabat', 'Rabat', 72, 'Sante animale'),
  schoolNode: iav,
  bacs: healthBacs,
  jobs: ['VETERINAIRE'],
  moyenne: 14,
})

const privateSchools = [
  ['Universite Internationale de Rabat', 'Rabat', 65000],
  ['Universite Internationale de Casablanca', 'Casablanca', 60000],
  ['IGA Casablanca', 'Casablanca', 42000],
]
for (const [name, city, annualCost] of privateSchools) {
  const s = school(name, city, 'Enseignement superieur prive')
  const entries = name.includes('IGA')
    ? [
        ['Bachelor Systemes d Information - IGA Casablanca', 36, 'Informatique', ['ADMINISTRATEUR_SYSTEMES_RESEAUX']],
        ['Master Systemes d Information Finance et Controle - IGA Casablanca', 60, 'Finance et systemes d information', ['AUDITEUR_SI', 'CONTROLEUR_DE_GESTION']],
        ['Master Informatique Reseaux et Securite - IGA Casablanca', 60, 'Informatique', ['INGENIEUR_CYBERSECURITE', 'ADMINISTRATEUR_SYSTEMES_RESEAUX']],
      ]
    : [
        [`Programme Grande Ecole Management - ${name}`, 60, 'Management', ['MANAGER_COMMERCIAL', 'RESPONSABLE_MARKETING']],
        [`Cycle Ingenieur Informatique - ${name}`, 60, 'Informatique', ['INGENIEUR_GENIE_INFORMATIQUE', 'DEVELOPPEUR_FULL_STACK']],
        [`Architecture - ${name}`, 60, 'Architecture', ['ARCHITECTE']],
      ]
  for (const [label, months, secteur, jobs] of entries) {
    connectProgram({
      programNode: program(label, city, months, secteur, annualCost * Math.ceil(months / 12)),
      schoolNode: s,
      bacs: secteur.includes('Management') ? managementBacs : publicEngineeringBacs,
      jobs,
      moyenne: 11,
    })
  }
}

const cityFromName = (value = '') => {
  const text = normalize(value)
  const cities = [
    'BENI MELLAL',
    'ERRACHIDIA',
    'FES',
    'MARRAKECH',
    'MOHAMMEDIA',
    'SETTAT',
    'TANGER',
    'CASABLANCA',
    'ESSAOUIRA',
  ]
  return cities.find((city) => text.includes(city))?.replace(/\b\w/g, (letter) => letter.toUpperCase()) || ''
}

const schoolMatches = (programNode, schoolNode) => {
  const programText = normalize(`${programNode.code || ''} ${programNode.nom_fr || ''}`)
  const schoolText = normalize(`${schoolNode.code || ''} ${schoolNode.nom_fr || ''}`)
  const city = normalize(schoolNode.ville || '')
  if (schoolText.includes('SCIENCES ET TECHNIQUES')) return programText.includes('FST') && programText.includes(city)
  if (schoolText.includes('SUPERIEURE DE TECHNOLOGIE')) return programText.includes('EST') && programText.includes(city)
  if (schoolText.includes('IGA CASABLANCA')) return /IGA (2 MARS|BELVEDERE|MAARIF|CASABLANCA)/.test(programText)
  if (schoolText.includes('UM6P')) return programText.includes('UM6P')
  if (schoolText.includes('UM6SS')) return programText.includes('UM6SS')
  if (schoolText.includes('ESCA')) return programText.includes('ESCA')
  if (schoolText.includes('ISGA CASABLANCA')) return programText.includes('ISGA') && programText.includes('CASABLANCA')
  return false
}

const candidateSchools = nodes.filter((node) =>
  /FST|FACULTE DES SCIENCES ET TECHNIQUES|ECOLE SUPERIEURE DE TECHNOLOGIE|IGA CASABLANCA|UM6P|UM6SS|ESCA|ISGA CASABLANCA/i.test(
    `${node.code || ''} ${node.nom_fr || ''}`,
  ),
)

for (const s of candidateSchools) {
  for (const p of nodes) {
    if (p.type !== 'FILIERE' || !schoolMatches(p, s)) continue
    addEdge(p, s, 'OFFERTE_PAR')
  }
}

for (const city of ['Beni Mellal', 'Errachidia', 'Mohammedia', 'Settat', 'Tanger']) {
  const s =
    nodes.find(
      (node) =>
        node.type === 'ETABLISSEMENT' &&
        /SCIENCES ET TECHNIQUES/.test(normalize(`${node.code} ${node.nom_fr}`)) &&
        normalize(`${node.ville} ${node.nom_fr}`).includes(normalize(city)),
    ) || school(`Faculte des Sciences et Techniques ${city}`, city, 'Sciences et techniques')
  for (const label of ['DEUST Mathematiques Informatique Physique', 'DEUST Biologie Chimie Geologie']) {
    const p = program(`${label} - FST ${city}`, city, 24, label.includes('Informatique') ? 'Informatique et sciences' : 'Sciences de la vie')
    connectProgram({
      programNode: p,
      schoolNode: s,
      bacs: label.includes('Informatique') ? publicEngineeringBacs : healthBacs,
      jobs: label.includes('Informatique') ? ['DEVELOPPEUR_FULL_STACK'] : ['BIOLOGISTE'],
      moyenne: 12,
    })
  }
}

for (const city of ['Casablanca', 'Essaouira']) {
  const s =
    nodes.find(
      (node) =>
        node.type === 'ETABLISSEMENT' &&
        /ECOLE SUPERIEURE DE TECHNOLOGIE/.test(normalize(`${node.code} ${node.nom_fr}`)) &&
        normalize(`${node.ville} ${node.nom_fr}`).includes(normalize(city)),
    ) || school(`Ecole Superieure de Technologie ${city}`, city, 'Technologie')
  for (const [label, jobs] of [
    ['DUT Genie Informatique', ['DEVELOPPEUR_FULL_STACK']],
    ['DUT Techniques de Management', ['ASSISTANT_COMMERCIAL']],
  ]) {
    connectProgram({
      programNode: program(`${label} - EST ${city}`, city, 24, label.includes('Informatique') ? 'Informatique' : 'Gestion'),
      schoolNode: s,
      bacs: label.includes('Informatique') ? publicEngineeringBacs : managementBacs,
      jobs,
      moyenne: 11,
    })
  }
}

// Fix obvious city gaps for existing scraped programs.
for (const node of nodes) {
  if (node.type !== 'FILIERE' && node.type !== 'ETABLISSEMENT') continue
  const inferred = cityFromName(`${node.code || ''} ${node.nom_fr || ''}`)
  if (inferred && !node.ville) {
    node.ville = inferred
    nodesUpdated += 1
  }
}

nodes.sort((a, b) => a.code.localeCompare(b.code))
edges.sort((a, b) => `${a.source_id}${a.target_id}${a.type_lien}`.localeCompare(`${b.source_id}${b.target_id}${b.type_lien}`))

await writeJson(nodesPath, nodes)
await writeJson(edgesPath, edges)

console.log(JSON.stringify({ nodesAdded, nodesUpdated, edgesAdded, nodes: nodes.length, edges: edges.length }, null, 2))
