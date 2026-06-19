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
    .replace(/_/g, ' ')
    .replace(/[^A-Z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const slug = (value = '') =>
  normalize(value)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

let nodes = await readJson(nodesPath)
let edges = await readJson(edgesPath)

const report = {
  nodesRemoved: 0,
  nodesUpdated: 0,
  edgesRemoved: 0,
  edgesAdded: 0,
  costsFixed: 0,
  invalidAccessFixed: 0,
}

const byId = () => new Map(nodes.map((node) => [node.id, node]))
const byCode = () => new Map(nodes.map((node) => [node.code, node]))
let idMap = byId()
let codeMap = byCode()

const textOf = (node) => normalize(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.description || ''} ${node?.secteur || ''}`)
const labelOf = (node) => normalize(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`)
const programName = (node) => normalize(String(node?.nom_fr || '').split(/\s+-\s+/)[0])
const isProgram = (node) => node?.type === 'FILIERE'
const isSchool = (node) => node?.type === 'ETABLISSEMENT'
const isJob = (node) => node?.type === 'METIER'
const isBac = (node) => isProgram(node) && /^BAC_/i.test(node.code || '')
const isLevel = (node) => node?.type === 'NIVEAU'
const isMaster = (node) => isProgram(node) && /\b(MASTER|MASTERE|MBA|MSC)\b/.test(labelOf(node))
const isBacPlus2 = (node) => isProgram(node) && /\b(DUT|BTS|DEUST|CPGE|TECHNICIEN SPECIALISE)\b/.test(labelOf(node))
const isLicence = (node) => isProgram(node) && /\b(LICENCE|LICENCES|BACHELOR|BAC\+3|LST)\b/.test(labelOf(node))
const isEngineeringProgram = (node) =>
  isProgram(node) &&
  /\b(CYCLE INGENIEUR|DIPLOME D INGENIEUR|INGENIEUR EN|INGENIEUR GENIE|INGENIERIE|GENIE|INFORMATIQUE ET SYSTEMES|DATA SCIENCE|INTELLIGENCE ARTIFICIELLE|CYBERSECURITE|RESEAUX|TELECOMMUNICATIONS)\b/.test(
    labelOf(node),
  ) &&
  !/\b(LICENCE|LICENCES|BACHELOR|DUT|BTS|DEUST|DESA|MASTER|MASTERE|MBA)\b/.test(labelOf(node))
const isEngineerJob = (node) =>
  isJob(node) &&
  /\b(INGENIEUR|ENGINEER|DATA SCIENTIST|DATA ENGINEER|DEEP LEARNING|MACHINE LEARNING|CYBERSECURITE|ARCHITECTE LOGICIEL)\b/.test(textOf(node))
const isArchitectJob = (node) => isJob(node) && /\bARCHITECTE\b/.test(textOf(node)) && !/INTERIEUR|LOGICIEL/.test(textOf(node))
const isArchitectProgram = (node) =>
  isProgram(node) &&
  /\b(DIPLOME ARCHITECTE|ARCHITECTE)\b/.test(labelOf(node)) &&
  !/\b(INTERIEUR|DESIGN|DECORATION|ART COM)\b/.test(labelOf(node))
const isDoctorJob = (node) => isJob(node) && /\bMEDECIN GENERALISTE\b/.test(textOf(node))
const isDentistJob = (node) => isJob(node) && /\b(DENTISTE|CHIRURGIEN DENTISTE|MEDECIN DENTISTE)\b/.test(textOf(node))
const isPharmacistJob = (node) => isJob(node) && /\b(PHARMACIEN|PHARMACIEN INDUSTRIEL)\b/.test(textOf(node))
const isGeneralMedicineProgram = (node) =>
  isProgram(node) &&
  /\b(DIPLOME D ETAT DE DOCTEUR EN MEDECINE|DIPLOME DE DOCTEUR EN MEDECINE|DOCTEUR EN MEDECINE|DOCTORAT EN MEDECINE)\b/.test(programName(node)) &&
  !/\b(DENTAIRE|VETERINAIRE|PHARMACIE|BIOTECH|LABORATOIRE|KINESITHERAPIE|ORTHOPHONIE|SAGE FEMME|INFIRMIER|SPECIALITE)\b/.test(programName(node))
const isDentalProgram = (node) =>
  isProgram(node) &&
  /\b(DIPLOME DE DOCTEUR EN MEDECINE DENTAIRE|DOCTEUR EN MEDECINE DENTAIRE|MEDECINE DENTAIRE|CHIRURGIE DENTAIRE)\b/.test(programName(node)) &&
  !/\b(PROTHESE|ASSISTANT|HYGIENE)\b/.test(programName(node))
const isPharmacyProgram = (node) =>
  isProgram(node) &&
  /\b(PHARMACIE|PHARMACIEN)\b/.test(programName(node)) &&
  !/\b(PREPARATEUR|ASSISTANT|LICENCE|MASTER|TECHNICIEN)\b/.test(programName(node))
const isPrivateText = (node) =>
  /\b(UM6SS|UM6P|MUNDIAPOLIS|ISGA|IGA|EMSI|HEM|ESCA|UIR|UPM|UNIVERSITE PRIVEE|ECOLE PRIVEE|GROUPE IGS|UIC|ESGB|IHE PARIS|SUPMTI|HESTIM|ISFORT|OSTELEA|VATEL|MATCI|ADALIA|ABULCASIS|FPMM)\b/.test(
    textOf(node),
  )

const estimatedPrivateCost = (node) => {
  const text = labelOf(node)
  if (/\b(MEDECINE DENTAIRE|DOCTEUR EN MEDECINE|PHARMACIE)\b/.test(text)) return 630000
  if (/\b(INGENIEUR|BAC\+5|GRANDE ECOLE|PROGRAMME GRANDE ECOLE)\b/.test(text)) return 275000
  if (/\b(MASTER|MASTERE|MBA|MSC)\b/.test(text)) return 150000
  if (/\b(LICENCE|BACHELOR|BAC\+3)\b/.test(text)) return 165000
  if (/\b(DUT|BTS|TECHNICIEN)\b/.test(text)) return 90000
  return 120000
}

const removedIds = new Set()
for (const node of nodes) {
  const raw = `${node.code || ''} ${node.nom_fr || ''}`
  const text = textOf(node)
  if (/%25|%[0-9A-F]{2}/i.test(raw) || /<SPAN|<\/SPAN|CATEGORIE SPAN/.test(text)) removedIds.add(node.id)
  if (isSchool(node) && /\bENSA\b|ECOLE NATIONALE DES SCIENCES APPLIQUEES/.test(text) && /\bCASABLANCA\b/.test(text)) removedIds.add(node.id)
}

if (removedIds.size) {
  nodes = nodes.filter((node) => {
    const keep = !removedIds.has(node.id)
    if (!keep) report.nodesRemoved += 1
    return keep
  })
  idMap = byId()
  edges = edges.filter((edge) => {
    const keep = idMap.has(edge.source_id) && idMap.has(edge.target_id)
    if (!keep) report.edgesRemoved += 1
    return keep
  })
}

for (const node of nodes) {
  if (node.code === '1BAC_SE') node.nom_fr = '1ere Bac Sciences Experimentales: Physique-Chimie / SVT'
  if (node.code === 'BAC_SE') node.nom_fr = 'Bac Sciences Experimentales: Physique-Chimie / SVT'

  if (!isProgram(node)) continue

  if (/BACHELOR\/MASTER|BACHELOR MASTER|COMBINES/.test(textOf(node))) {
    node.secteur = /PROGRAMME GRANDE ECOLE|DIPLOME ENCG/.test(labelOf(node)) ? 'Commerce et management' : 'Formation superieure'
    node.description = `${node.nom_fr}. Donnee consolidee apres scraping.`
    report.nodesUpdated += 1
  }

  if (/COMBINED BACHELOR MASTER/.test(labelOf(node))) {
    node.duree_mois = 24
    node.description = `${node.nom_fr}. Cycle master consolide: 2 ans apres licence.`
    report.nodesUpdated += 1
    continue
  }

  if (/LICENCE MASTER|LICENCE ET MASTER|LICENCE.*MASTER/.test(labelOf(node))) {
    node.duree_mois = 36
    node.description = `${node.nom_fr}. Parcours licence consolide: 3 ans apres bac.`
    report.nodesUpdated += 1
    continue
  }

  if (isBacPlus2(node) && node.duree_mois !== 24) {
    node.duree_mois = 24
    report.nodesUpdated += 1
  } else if (isLicence(node) && node.duree_mois !== 36) {
    node.duree_mois = 36
    report.nodesUpdated += 1
  } else if (isMaster(node) && node.duree_mois !== 24) {
    node.duree_mois = 24
    report.nodesUpdated += 1
  } else if (isEngineeringProgram(node) && node.duree_mois !== 60) {
    node.duree_mois = 60
    report.nodesUpdated += 1
  } else if (isArchitectProgram(node) && node.duree_mois !== 72) {
    node.duree_mois = 72
    report.nodesUpdated += 1
  } else if ((isGeneralMedicineProgram(node) || isDentalProgram(node) || isPharmacyProgram(node)) && node.duree_mois !== (isGeneralMedicineProgram(node) ? 84 : 72)) {
    node.duree_mois = isGeneralMedicineProgram(node) ? 84 : 72
    report.nodesUpdated += 1
  }

  if (isPrivateText(node) && Number(node.cout_estime || 0) <= 0) {
    node.cout_estime = estimatedPrivateCost(node)
    report.costsFixed += 1
  }
}

idMap = byId()
edges = edges.filter((edge) => {
  const source = idMap.get(edge.source_id)
  const target = idMap.get(edge.target_id)
  if (!source || !target) {
    report.edgesRemoved += 1
    return false
  }

  if (edge.type_acces && !['CONCOURS', 'DOSSIER', 'OUVERT'].includes(edge.type_acces)) {
    edge.type_acces = 'OUVERT'
    report.invalidAccessFixed += 1
  }

  if (['ADMISSION', 'DONNE_ACCES'].includes(edge.type_lien) && isBac(source) && isMaster(target)) {
    report.edgesRemoved += 1
    return false
  }

  if (edge.type_lien === 'DONNE_ACCES' && isLevel(source) && isMaster(target)) {
    report.edgesRemoved += 1
    return false
  }

  if (edge.type_lien === 'RECRUTEMENT' && isEngineerJob(target) && (!isEngineeringProgram(source) || isBacPlus2(source) || isLicence(source))) {
    report.edgesRemoved += 1
    return false
  }

  if (edge.type_lien === 'RECRUTEMENT' && isArchitectJob(target) && !isArchitectProgram(source)) {
    report.edgesRemoved += 1
    return false
  }

  if (edge.type_lien === 'RECRUTEMENT' && isDoctorJob(target) && !isGeneralMedicineProgram(source)) {
    report.edgesRemoved += 1
    return false
  }

  if (edge.type_lien === 'RECRUTEMENT' && isDentistJob(target) && !isDentalProgram(source)) {
    report.edgesRemoved += 1
    return false
  }

  if (edge.type_lien === 'RECRUTEMENT' && isPharmacistJob(target) && !isPharmacyProgram(source)) {
    report.edgesRemoved += 1
    return false
  }

  if (edge.type_lien === 'OFFERTE_PAR' && isProgram(source) && isSchool(target) && isPrivateText(target) && Number(source.cout_estime || 0) <= 0) {
    source.cout_estime = estimatedPrivateCost(source)
    report.costsFixed += 1
  }

  return true
})

idMap = byId()
codeMap = byCode()
const edgeKeys = new Set(edges.map((edge) => `${edge.source_id}|${edge.target_id}|${edge.type_lien}`))
const ensureNode = (code, values) => {
  const existing = codeMap.get(code)
  if (existing) {
    Object.assign(existing, values)
    return existing
  }
  const node = { id: `FINAL_${code}`, code, actif: true, ...values }
  nodes.push(node)
  codeMap.set(code, node)
  return node
}
const ensureEdge = (source, target, typeLien, extras = {}) => {
  if (!source || !target) return
  const key = `${source.id}|${target.id}|${typeLien}`
  if (edgeKeys.has(key)) return
  edges.push({
    id: `POST_CLEAN_EDGE_${edgeKeys.size}`,
    source_id: source.id,
    target_id: target.id,
    type_lien: typeLien,
    type_acces: extras.type_acces || 'CONCOURS',
    moyenne_minimale: extras.moyenne_minimale ?? 14,
    taux_reussite: extras.taux_reussite ?? 82,
    cout_supplementaire: 0,
    duree_supplementaire_mois: 0,
    prerequis_notes: extras.prerequis_notes || 'Donnee consolidee apres verification de coherence.',
  })
  edgeKeys.add(key)
  report.edgesAdded += 1
}

const dataJobs = ['DATA_SCIENTIST', 'DATA_ENGINEER', 'DEEP_LEARNING_ENGINEER', 'MACHINE_LEARNING_ENGINEER']
const publicDataPrograms = [
  ['FINAL_DATA_SCIENCE_ENSIAS_RABAT', 'Cycle Ingenieur Data Science et Intelligence Artificielle - ENSIAS Rabat', 'ENSIAS_RABAT', "Ecole Nationale Superieure d'Informatique et d'Analyse des Systemes Rabat", 'Rabat', 15],
  ['FINAL_DATA_SCIENCE_INSEA_RABAT', 'Cycle Ingenieur Data Science - INSEA Rabat', 'INSEA_RABAT', 'Institut National de Statistique et d Economie Appliquee Rabat', 'Rabat', 15],
  ['FINAL_SCIENCES_DONNEES_INPT_RABAT', 'Cycle Ingenieur Sciences de Donnees - INPT Rabat', 'INPT_RABAT', 'Institut National des Postes et Telecommunications Rabat', 'Rabat', 14],
  ['FINAL_DATA_SCIENCE_ENSEM_CASABLANCA', 'Cycle Ingenieur Data Science et Systemes - ENSEM Casablanca', 'ENSEM_CASABLANCA', "Ecole Nationale Superieure d'Electricite et de Mecanique Casablanca", 'Casablanca', 14],
]

for (const [programCode, programNameFr, schoolCode, schoolName, city, min] of publicDataPrograms) {
  const school = ensureNode(schoolCode, {
    type: 'ETABLISSEMENT',
    nom_fr: schoolName,
    ville: city,
    secteur: 'Informatique et data',
    duree_mois: 0,
    cout_estime: 0,
    description: `${schoolName}. Etablissement public marocain.`,
  })
  const program = ensureNode(programCode, {
    type: 'FILIERE',
    nom_fr: programNameFr,
    ville: city,
    secteur: 'Data science et intelligence artificielle',
    duree_mois: 60,
    cout_estime: 0,
    description: `${programNameFr}. Cycle ingenieur consolide pour les parcours Data Scientist, Data Engineer et IA.`,
  })
  ensureEdge(program, school, 'OFFERTE_PAR', { moyenne_minimale: min, taux_reussite: 88 })
  for (const bacCode of ['BAC_SM', 'BAC_PC', 'BAC_TECH_ELEC']) {
    ensureEdge(codeMap.get(bacCode), program, 'ADMISSION', { moyenne_minimale: min, taux_reussite: 74 })
  }
  for (const jobCode of dataJobs) ensureEdge(program, codeMap.get(jobCode), 'RECRUTEMENT', { moyenne_minimale: min, taux_reussite: 88 })
}

const lastMilePrograms = [
  {
    programCode: 'FINAL_ARCHITECTURE_CLOUD_INPT_RABAT',
    programNameFr: 'Cycle Ingenieur Cloud Computing et Systemes Distribues - INPT Rabat',
    schoolCode: 'INPT_RABAT',
    schoolName: 'Institut National des Postes et Telecommunications Rabat',
    city: 'Rabat',
    sector: 'Cloud et systemes distribues',
    jobCodes: ['ARCHITECTE_CLOUD'],
    bacs: ['BAC_SM', 'BAC_PC', 'BAC_TECH_ELEC'],
    min: 14,
    cost: 0,
  },
  {
    programCode: 'FINAL_INGENIEUR_AGRONOME_IAV_RABAT',
    programNameFr: 'Cycle Ingenieur Agronome - IAV Hassan II Rabat',
    schoolCode: 'IAV_HASSAN_II_RABAT',
    schoolName: 'Institut Agronomique et Veterinaire Hassan II Rabat',
    city: 'Rabat',
    sector: 'Agronomie',
    jobCodes: ['INGENIEUR_AGRONOME', 'AGRONOME'],
    bacs: ['BAC_SM', 'BAC_PC', 'BAC_SVT'],
    min: 13,
    cost: 0,
  },
]

for (const item of lastMilePrograms) {
  const school = ensureNode(item.schoolCode, {
    type: 'ETABLISSEMENT',
    nom_fr: item.schoolName,
    ville: item.city,
    secteur: item.sector,
    duree_mois: 0,
    cout_estime: 0,
    description: `${item.schoolName}. Etablissement public marocain.`,
  })
  const program = ensureNode(item.programCode, {
    type: 'FILIERE',
    nom_fr: item.programNameFr,
    ville: item.city,
    secteur: item.sector,
    duree_mois: 60,
    cout_estime: item.cost,
    description: `${item.programNameFr}. Cycle bac+5 consolide.`,
  })
  ensureEdge(program, school, 'OFFERTE_PAR', { moyenne_minimale: item.min, taux_reussite: 88 })
  for (const bacCode of item.bacs) ensureEdge(codeMap.get(bacCode), program, 'ADMISSION', { moyenne_minimale: item.min, taux_reussite: 75 })
  for (const jobCode of item.jobCodes) ensureEdge(program, codeMap.get(jobCode), 'RECRUTEMENT', { moyenne_minimale: item.min, taux_reussite: 88 })
}

const pathProgression = [
  ['3AC', 'TC'],
  ['TC', '1BAC_SM'],
  ['TC', '1BAC_SE'],
  ['TC', '1BAC_STE'],
  ['TC', '1BAC_STM'],
  ['1BAC_SM', 'BAC_SM'],
  ['1BAC_SE', 'BAC_PC'],
  ['1BAC_SE', 'BAC_SVT'],
  ['1BAC_STE', 'BAC_TECH_ELEC'],
  ['1BAC_STM', 'BAC_TECH_MECA'],
]
for (const [source, target] of pathProgression) {
  ensureEdge(codeMap.get(source), codeMap.get(target), 'DONNE_ACCES', {
    type_acces: 'OUVERT',
    moyenne_minimale: null,
    taux_reussite: 90,
    prerequis_notes: 'Progression scolaire marocaine consolidee.',
  })
}

const seen = new Set()
edges = edges.filter((edge) => {
  const key = `${edge.source_id}|${edge.target_id}|${edge.type_lien}`
  if (seen.has(key)) {
    report.edgesRemoved += 1
    return false
  }
  seen.add(key)
  return true
})

nodes.sort((a, b) => String(a.code).localeCompare(String(b.code)))
edges.sort((a, b) => `${a.source_id}${a.target_id}${a.type_lien}`.localeCompare(`${b.source_id}${b.target_id}${b.type_lien}`))

await writeJson(nodesPath, nodes)
await writeJson(edgesPath, edges)

console.log(JSON.stringify({ ...report, nodes: nodes.length, edges: edges.length }, null, 2))
