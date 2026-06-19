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

const slug = (value = '') =>
  normalize(value)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const nodes = await readJson(nodesPath)
let edges = await readJson(edgesPath)
const report = {
  nodesRemoved: 0,
  nodesUpdated: 0,
  edgesRemoved: 0,
  edgesAdded: 0,
  architectureDurationsFixed: 0,
  engineeringDurationsFixed: 0,
  um6ssDuplicatesRemoved: 0,
}

const byId = () => new Map(nodes.map((node) => [node.id, node]))
const byCode = () => new Map(nodes.map((node) => [node.code, node]))

const cityNames = [
  'Casablanca',
  'Rabat',
  'Fes',
  'Marrakech',
  'Agadir',
  'Oujda',
  'Tanger',
  'Beni Mellal',
  'Settat',
  'Kenitra',
  'Tetouan',
  'El Jadida',
  'Mohammedia',
  'Safi',
  'Meknes',
  'Sale',
  'Essaouira',
  'Dakhla',
  'Sidi Bennour',
  'Laayoune',
  'Guelmim',
  'Errachidia',
  'Khouribga',
  'Khenifra',
  'Al Hoceima',
  'Berrechid',
]

const cityFromText = (value = '') => {
  const text = normalize(value)
  return cityNames.find((city) => new RegExp(`(^|[^A-Z])${normalize(city).replace(/\s+/g, '\\s+')}([^A-Z]|$)`).test(text)) || ''
}

const textOf = (node) => normalize(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.description || ''} ${node?.secteur || ''}`)
const labelTextOf = (node) => normalize(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`)
const programNameTextOf = (node) => normalize(String(node?.nom_fr || '').split(/\s+-\s+/)[0])
const isFiliere = (node) => node?.type === 'FILIERE'
const isMetier = (node) => node?.type === 'METIER'
const isEtablissement = (node) => node?.type === 'ETABLISSEMENT'
const isBac = (node) => isFiliere(node) && /^BAC_/i.test(node.code || '')
const isFirstBac = (node) => isFiliere(node) && /^1BAC/i.test(node.code || '')
const isEngineeringJob = (node) =>
  isMetier(node) &&
  /\b(INGENIEUR|ENGINEER|DATA SCIENTIST|DATA ENGINEER|CYBERSECURITE|ARCHITECTE LOGICIEL)\b/.test(normalize(`${node.code || ''} ${node.nom_fr || ''}`))
const isArchitectJob = (node) => isMetier(node) && normalize(node.code || node.nom_fr || '') === 'ARCHITECTE'
const isInteriorArchitectJob = (node) => isMetier(node) && /ARCHITECTE.*INTERIEUR|INTERIEUR/.test(normalize(`${node.code || ''} ${node.nom_fr || ''}`))
const isEngineeringProgram = (node) =>
  isFiliere(node) &&
  /\b(INGENIEUR|CYCLE INGENIEUR|DIPLOME D INGENIEUR|GENIE INFORMATIQUE|GENIE ELECTRIQUE|GENIE INDUSTRIEL|CYBER|RESEAUX ET TELECOMMUNICATIONS)\b/.test(labelTextOf(node))
const isAdvancedTechJob = (node) =>
  isMetier(node) &&
  /\b(INGENIEUR|ENGINEER|DATA SCIENTIST|DATA ENGINEER|DEEP LEARNING|MACHINE LEARNING|CYBERSECURITE|ARCHITECTE LOGICIEL)\b/.test(
    normalize(`${node.code || ''} ${node.nom_fr || ''}`).replace(/_/g, ' '),
  )
const isAdvancedTechProgram = (node) =>
  isFiliere(node) &&
  /\b(INGENIEUR|CYCLE INGENIEUR|DIPLOME D INGENIEUR|GENIE INFORMATIQUE|DATA|INTELLIGENCE ARTIFICIELLE|MACHINE LEARNING|DEEP LEARNING|CYBER|RESEAUX|TELECOM|LOGICIEL|ENSIAS|ENSA|EMI|INPT|INSEA)\b/.test(
    labelTextOf(node),
  ) &&
  !/\b(DESA|ARCHITECTURE DES SYSTEMES|LICENCE|DUT|BTS|DEUST)\b/.test(labelTextOf(node))
const isBacPlus2Program = (node) => isFiliere(node) && /\b(DUT|BTS|DEUST|CPGE)\b/.test(labelTextOf(node))
const isDiplomeEncgProgram = (node) => isFiliere(node) && /\b(DIPLOME ENCG|PROGRAMME GRANDE ECOLE|ENCG)\b/.test(labelTextOf(node))
const isDentalProgram = (node) => isFiliere(node) && /MEDECINE DENTAIRE|DOCTEUR EN MEDECINE DENTAIRE|CHIRURGIE DENTAIRE/.test(programNameTextOf(node))
const isShortProgram = (node) => Number(node?.duree_mois || 0) > 0 && Number(node?.duree_mois || 0) < 60
const isArchitectureProgram = (node) => isFiliere(node) && /\b(ARCHITECTURE|DIPLOME ARCHITECTE|ARCHITECTE)\b/.test(textOf(node))
const isInteriorArchitectureProgram = (node) => isFiliere(node) && /ARCHITECTURE.*INTERIEUR|DESIGN.*INTERIEUR|ART COM/.test(textOf(node))
const isRealArchitectProgram = (node) => isArchitectureProgram(node) && !isInteriorArchitectureProgram(node)
const isFakeEnsaCasablanca = (node) =>
  /\bENSA\b|ECOLE NATIONALE DES SCIENCES APPLIQUEES/.test(textOf(node)) && /\bCASABLANCA\b/.test(textOf(node))
const isUm6ss = (node) => /\bUM6SS\b|UNIVERSITE MOHAMMED VI DES SCIENCES DE LA SANTE|FACULTE MOHAMMED VI DE MEDECINE/.test(textOf(node))
const isDoctorMedicineUm6ss = (node) =>
  isUm6ss(node) && !isDentalProgram(node) && /DOCTEUR EN MEDECINE|DOCTORAT EN MEDECINE|DIPLOME.*MEDECINE/.test(programNameTextOf(node))

const familyOf = (node) => {
  const text = textOf(node)
  if (/ECOLE NATIONALE DES SCIENCES APPLIQUEES|\bENSA\b/.test(text)) return 'ENSA'
  if (/ECOLE NATIONALE DE COMMERC|ECOLE NATIONALE DE COMMERCE ET DE GESTION|\bENCG\b/.test(text)) return 'ENCG'
  if (/FACULTE DES SCIENCES ET TECHNIQUES|\bFST\b/.test(text)) return 'FST'
  if (/ECOLE SUPERIEURE DE TECHNOLOGIE|\bEST\b/.test(text)) return 'EST'
  if (/FACULTE DES SCIENCES JURIDIQUES|FSJES/.test(text)) return 'FSJES'
  if (/FACULTE DES SCIENCES\b|\bFS\b|\bFSO\b|\bFP\b|FLSH|FACULTE POLYDISCIPLINAIRE|FACULTE DES LETTRES/.test(text)) return 'FS'
  if (/CENTRE BTS|\bBTS\b/.test(text)) return 'BTS'
  if (/INSTITUT AGRONOMIQUE ET VETERINAIRE|\bIAV\b/.test(text)) return 'IAV'
  if (/\bIGA\b/.test(text)) return 'IGA'
  if (/IESCA|ESCA/.test(text)) return 'ESCA'
  if (/OSTELEA/.test(text)) return 'OSTELEA'
  if (/ECOLE MOHAMMADIA D INGENIEURS|\bEMI\b/.test(text)) return 'EMI'
  if (/ECOLE NATIONALE SUPERIEURE D INFORMATIQUE|ENSIAS/.test(text)) return 'ENSIAS'
  if (/INSTITUT NATIONAL DES POSTES|INPT/.test(text)) return 'INPT'
  if (/INSTITUT NATIONAL DE STATISTIQUE|INSEA/.test(text)) return 'INSEA'
  if (/ECOLE NATIONALE D ARCHITECTURE|\bENA\b/.test(text)) return 'ENA'
  if (/AIAC|AVIATION CIVILE/.test(text)) return 'AIAC'
  if (/UM6SS|MOHAMMED VI DES SCIENCES DE LA SANTE/.test(text)) return 'UM6SS'
  if (/ENSC|ECOLE NATIONALE SUPERIEURE DE CHIMIE/.test(text)) return 'ENSC'
  return ''
}

const embeddedFamilyOf = (node) => {
  const text = textOf(node)
  if (/FSJES|FACULTE DES SCIENCES JURIDIQUES/.test(text)) return 'FSJES'
  if (/\bFSO\b|FACULTE DES SCIENCES OUJDA|\bFP\b|FLSH|FACULTE DES LETTRES|FACULTE POLYDISCIPLINAIRE/.test(text)) return 'FS'
  if (/CENTRE BTS|\bBTS\b/.test(text)) return 'BTS'
  if (/FST|FACULTE DES SCIENCES ET TECHNIQUES/.test(text)) return 'FST'
  if (/ENCG|ECOLE NATIONALE DE COMMERC|ECOLE NATIONALE DE COMMERCE ET DE GESTION/.test(text)) return 'ENCG'
  if (/\bEST\b|ECOLE SUPERIEURE DE TECHNOLOGIE/.test(text)) return 'EST'
  if (/ENSIAS|ECOLE NATIONALE SUPERIEURE D INFORMATIQUE/.test(text)) return 'ENSIAS'
  if (/INSEA|INSTITUT NATIONAL DE STATISTIQUE/.test(text)) return 'INSEA'
  if (/INPT|INSTITUT NATIONAL DES POSTES/.test(text)) return 'INPT'
  if (/EMI|ECOLE MOHAMMADIA D INGENIEURS/.test(text)) return 'EMI'
  if (/ENSA|ECOLE NATIONALE DES SCIENCES APPLIQUEES/.test(text)) return 'ENSA'
  if (/ENA|ECOLE NATIONALE D ARCHITECTURE/.test(text)) return 'ENA'
  if (/UM6SS|MOHAMMED VI DES SCIENCES DE LA SANTE/.test(text)) return 'UM6SS'
  if (/IAV|INSTITUT AGRONOMIQUE ET VETERINAIRE/.test(text)) return 'IAV'
  if (/\bIGA\b/.test(text)) return 'IGA'
  if (/IESCA|ESCA/.test(text)) return 'ESCA'
  if (/OSTELEA/.test(text)) return 'OSTELEA'
  return ''
}

const hasHardOfferMismatch = (program, school) => {
  const programText = textOf(program)
  const schoolText = textOf(school)

  if (/ECOLE NATIONALE DE COMMERC|ECOLE NATIONALE DE COMMERCE ET DE GESTION|\bENCG\b/.test(programText) && /\bEST\b|ECOLE SUPERIEURE DE TECHNOLOGIE/.test(schoolText)) return true
  if (/INSTITUT POLYTECHNIQUE PRIVE|LICENCE PROFESSIONNELLE|MASTER PROFESSIONNEL/.test(programText) && /\bEST\b|ECOLE SUPERIEURE DE TECHNOLOGIE/.test(schoolText)) return true
  if (/CENTRE BTS|\bBTS\b|\bISTA\b|TECHNICIEN/.test(programText) && /ECOLE NATIONALE DE COMMERC|ECOLE NATIONALE DE COMMERCE ET DE GESTION|\bENCG\b/.test(schoolText)) return true
  if (/FACULTE DE MEDECINE|FMP|DIPLOME D ETAT DE DOCTEUR EN MEDECINE|DOCTEUR EN MEDECINE/.test(programText) && /INSTITUT AGRONOMIQUE|VETERINAIRE|IAV|ECOLE D INGENIEUR|ENSA|ENSMR|EMI/.test(schoolText)) return true
  if (/INSTITUT AGRONOMIQUE|VETERINAIRE|IAV/.test(programText) && /FACULTE DE MEDECINE|FMP|UM6SS/.test(schoolText)) return true
  if (/ARCHITECTURE|ARCHITECTE/.test(programText) && !/INTERIEUR|DECORATION|DESIGN/.test(programText) && !/ECOLE NATIONALE D ARCHITECTURE|\bENA\b/.test(schoolText)) return true
  if (/ECOLE NATIONALE D ARCHITECTURE|\bENA\b/.test(programText) && !/ECOLE NATIONALE D ARCHITECTURE|\bENA\b/.test(schoolText)) return true
  if (/ECOLE NATIONALE DES SCIENCES APPLIQUEES|\bENSA\b/.test(programText) && !/ECOLE NATIONALE DES SCIENCES APPLIQUEES|\bENSA\b/.test(schoolText)) return true
  if (/ECOLE MOHAMMADIA D INGENIEURS|\bEMI\b/.test(programText) && !/ECOLE MOHAMMADIA D INGENIEURS|\bEMI\b/.test(schoolText)) return true
  if (/ECOLE NATIONALE SUPERIEURE D INFORMATIQUE|ENSIAS/.test(programText) && !/ECOLE NATIONALE SUPERIEURE D INFORMATIQUE|ENSIAS/.test(schoolText)) return true

  return false
}

const removedIds = new Set()
for (const node of nodes) {
  if (isEtablissement(node) && isFakeEnsaCasablanca(node)) {
    removedIds.add(node.id)
  }
  if (isFiliere(node) && isFakeEnsaCasablanca(node)) {
    removedIds.add(node.id)
  }
}

for (let i = nodes.length - 1; i >= 0; i -= 1) {
  if (removedIds.has(nodes[i].id)) {
    nodes.splice(i, 1)
    report.nodesRemoved += 1
  }
}

let currentById = byId()
edges = edges.filter((edge) => {
  if (!currentById.has(edge.source_id) || !currentById.has(edge.target_id) || removedIds.has(edge.source_id) || removedIds.has(edge.target_id)) {
    report.edgesRemoved += 1
    return false
  }
  return true
})

for (const node of nodes) {
  if (isDiplomeEncgProgram(node) && !isBacPlus2Program(node) && Number(node.duree_mois || 0) !== 60) {
    node.duree_mois = 60
    node.description = `${node.nom_fr}. Diplome ENCG consolide: 5 ans apres bac.`
    report.nodesUpdated += 1
  } else if (isBacPlus2Program(node) && Number(node.duree_mois || 0) !== 24) {
    node.duree_mois = 24
    node.description = `${node.nom_fr}. Formation bac+2 consolidee: 2 ans apres bac.`
    report.nodesUpdated += 1
  } else if (isEngineeringProgram(node) && Number(node.duree_mois || 0) < 60) {
    node.duree_mois = 60
    node.description = `${node.nom_fr}. Cycle ingenieur consolide: 5 ans apres bac.`
    report.nodesUpdated += 1
    report.engineeringDurationsFixed += 1
  }

  if (isDentalProgram(node) && Number(node.duree_mois || 0) !== 72) {
    node.duree_mois = 72
    node.secteur = 'Sante'
    node.description = `${node.nom_fr}. Diplome de medecine dentaire consolide: 6 ans apres bac.`
    report.nodesUpdated += 1
  }

  if (isRealArchitectProgram(node) && Number(node.duree_mois || 0) !== 72) {
    node.duree_mois = 72
    node.secteur = 'Architecture'
    node.description = `${node.nom_fr}. Diplome d'architecte consolide: 6 ans apres bac.`
    report.nodesUpdated += 1
    report.architectureDurationsFixed += 1
  }

  if (isInteriorArchitectureProgram(node)) {
    node.secteur = 'Architecture d interieur et design'
    if (Number(node.duree_mois || 0) < 36) node.duree_mois = 36
  }

  if (isDoctorMedicineUm6ss(node)) {
    node.secteur = 'Sante'
    node.ville = node.ville || 'Casablanca'
    node.duree_mois = 84
    node.cout_estime = Math.max(Number(node.cout_estime || 0), 630000)
    node.description = `${node.nom_fr}. Formation de medecine a l'UM6SS, duree consolidee: 7 ans apres bac.`
  }
}

currentById = byId()
edges = edges.filter((edge) => {
  const source = currentById.get(edge.source_id)
  const target = currentById.get(edge.target_id)

  if (!source || !target) {
    report.edgesRemoved += 1
    return false
  }

  if (['ADMISSION', 'DONNE_ACCES'].includes(edge.type_lien) && isBac(source) && /\b(MASTER|MASTERE)\b/.test(labelTextOf(target))) {
    report.edgesRemoved += 1
    return false
  }

  if (edge.type_lien === 'RECRUTEMENT' && isEngineeringJob(target)) {
    if (!isEngineeringProgram(source) && !/\b(MASTER|MASTERE)\b/.test(textOf(source))) {
      report.edgesRemoved += 1
      return false
    }
    if (isShortProgram(source) && !/\b(MASTER|MASTERE)\b/.test(textOf(source))) {
      report.edgesRemoved += 1
      return false
    }
  }

  if (edge.type_lien === 'RECRUTEMENT' && isAdvancedTechJob(target) && !isAdvancedTechProgram(source)) {
    report.edgesRemoved += 1
    return false
  }

  if (
    edge.type_lien === 'RECRUTEMENT' &&
    /\b(DESA|ARCHITECTURE DES SYSTEMES)\b/.test(labelTextOf(source)) &&
    /\b(DEVELOPPEUR|INGENIEUR|ENGINEER|DATA|CYBER)\b/.test(normalize(`${target.code || ''} ${target.nom_fr || ''}`))
  ) {
    report.edgesRemoved += 1
    return false
  }

  if (edge.type_lien === 'RECRUTEMENT' && isArchitectJob(target) && !isRealArchitectProgram(source)) {
    report.edgesRemoved += 1
    return false
  }

  if (
    edge.type_lien === 'RECRUTEMENT' &&
    normalize(`${target.code || ''} ${target.nom_fr || ''}`).includes('MEDECIN GENERALISTE') &&
    /\b(IAV|VETERINAIRE|AGRONOME|AGRONOMIQUE|AGRO)\b/.test(textOf(source))
  ) {
    report.edgesRemoved += 1
    return false
  }

  if (edge.type_lien === 'RECRUTEMENT' && isInteriorArchitectJob(target) && isRealArchitectProgram(source)) {
    report.edgesRemoved += 1
    return false
  }

  if (edge.type_lien === 'DONNE_ACCES' && isBac(source) && isShortProgram(target) && isEngineeringProgram(target)) {
    report.edgesRemoved += 1
    return false
  }

  return true
})

const canonicalUm6ss = new Map()
for (const node of nodes) {
  if (!isFiliere(node) || !isUm6ss(node)) continue
  const key = `${slug((node.nom_fr || '').replace(/\s+-\s+.*/, ''))}|${cityFromText(`${node.nom_fr} ${node.ville}`) || 'CASABLANCA'}`
  const existing = canonicalUm6ss.get(key)
  if (!existing) {
    canonicalUm6ss.set(key, node)
    continue
  }
  const keep = Number(existing.cout_estime || 0) >= Number(node.cout_estime || 0) ? existing : node
  const remove = keep === existing ? node : existing
  canonicalUm6ss.set(key, keep)
  removedIds.add(remove.id)
  report.um6ssDuplicatesRemoved += 1
}

if (removedIds.size) {
  const idRedirect = new Map()
  for (const [key, keep] of canonicalUm6ss) {
    for (const node of nodes) {
      if (!removedIds.has(node.id) || !isFiliere(node) || !isUm6ss(node)) continue
      const nodeKey = `${slug((node.nom_fr || '').replace(/\s+-\s+.*/, ''))}|${cityFromText(`${node.nom_fr} ${node.ville}`) || 'CASABLANCA'}`
      if (nodeKey === key) idRedirect.set(node.id, keep.id)
    }
  }

  for (const edge of edges) {
    if (idRedirect.has(edge.source_id)) edge.source_id = idRedirect.get(edge.source_id)
    if (idRedirect.has(edge.target_id)) edge.target_id = idRedirect.get(edge.target_id)
  }

  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    if (removedIds.has(nodes[i].id)) nodes.splice(i, 1)
  }
}

currentById = byId()
const edgeKeys = new Set()
edges = edges.filter((edge) => {
  const source = currentById.get(edge.source_id)
  const target = currentById.get(edge.target_id)

  if (!source || !target) {
    report.edgesRemoved += 1
    return false
  }

  if (edge.type_lien === 'OFFERTE_PAR') {
    if (!isFiliere(source) || !isEtablissement(target)) {
      report.edgesRemoved += 1
      return false
    }

    const sourceFamily = familyOf(source)
    const targetFamily = familyOf(target)
    const embeddedFamily = embeddedFamilyOf(source)
    const sourceCity = cityFromText(`${source.nom_fr || ''} ${source.code || ''} ${source.ville || ''}`)
    const targetCity = cityFromText(`${target.nom_fr || ''} ${target.code || ''} ${target.ville || ''}`)

    if (hasHardOfferMismatch(source, target)) {
      report.edgesRemoved += 1
      return false
    }

    if (/QHSE.*UM6SS/.test(textOf(source)) && /ENSIAS|INFORM SYSTEMES|ECOLE NATIONALE SUPERIEURE D INFORMATIQUE/.test(textOf(target))) {
      report.edgesRemoved += 1
      return false
    }

    if (/VETERINAIRE/.test(textOf(target)) && !/VETERINAIRE/.test(textOf(source))) {
      report.edgesRemoved += 1
      return false
    }

    if (embeddedFamily && targetFamily && embeddedFamily !== targetFamily) {
      report.edgesRemoved += 1
      return false
    }

    if (sourceFamily && targetFamily && sourceFamily !== targetFamily && !['UNIVERSITE'].includes(targetFamily)) {
      report.edgesRemoved += 1
      return false
    }

    if ((sourceFamily || embeddedFamily) && targetFamily && sourceCity && targetCity && sourceCity !== targetCity) {
      report.edgesRemoved += 1
      return false
    }
  }

  if (edge.type_acces && !['CONCOURS', 'DOSSIER', 'OUVERT'].includes(edge.type_acces)) edge.type_acces = 'OUVERT'
  const key = `${edge.source_id}|${edge.target_id}|${edge.type_lien}`
  if (edgeKeys.has(key)) {
    report.edgesRemoved += 1
    return false
  }
  edgeKeys.add(key)
  return true
})

const codeMap = byCode()
const ensureNode = (code, values) => {
  const existing = codeMap.get(code)
  if (existing) return Object.assign(existing, values)
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
    id: `FINAL_EDGE_${edgeKeys.size}`,
    source_id: source.id,
    target_id: target.id,
    type_lien: typeLien,
    type_acces: extras.type_acces || 'OUVERT',
    moyenne_minimale: extras.moyenne_minimale ?? null,
    taux_reussite: extras.taux_reussite ?? 82,
    cout_supplementaire: 0,
    duree_supplementaire_mois: extras.duree_supplementaire_mois ?? 0,
    prerequis_notes: extras.prerequis_notes || 'Donnee consolidee pour coherence parcours.',
  })
  edgeKeys.add(key)
  report.edgesAdded += 1
}

const enaCities = ['Rabat', 'Casablanca', 'Fes', 'Marrakech', 'Tetouan', 'Agadir', 'Oujda']
const archJob = codeMap.get('ARCHITECTE')
for (const city of enaCities) {
  const school = ensureNode(`ENA_${slug(city)}`, {
    type: 'ETABLISSEMENT',
    nom_fr: `Ecole Nationale d'Architecture ${city}`,
    description: `Ecole Nationale d'Architecture ${city}. Etablissement public de formation des architectes.`,
    secteur: 'Architecture',
    ville: city,
    duree_mois: 0,
    cout_estime: 0,
  })
  const program = ensureNode(`DIPLOME_ARCHITECTE_ENA_${slug(city)}`, {
    type: 'FILIERE',
    nom_fr: `Diplome Architecte - ENA ${city}`,
    description: `Diplome d'architecte a l'Ecole Nationale d'Architecture ${city}. Duree consolidee: 6 ans apres bac.`,
    secteur: 'Architecture',
    ville: city,
    duree_mois: 72,
    cout_estime: 0,
  })
  ensureEdge(program, school, 'OFFERTE_PAR', { taux_reussite: 90 })
  for (const bacCode of ['BAC_SM', 'BAC_PC', 'BAC_SVT', 'BAC_SE', 'BAC_ARTS_APPLIQUES']) {
    ensureEdge(codeMap.get(bacCode), program, 'ADMISSION', { type_acces: 'CONCOURS', moyenne_minimale: 12, taux_reussite: 75 })
  }
  ensureEdge(program, archJob, 'RECRUTEMENT', { taux_reussite: 92 })
}

const ensureSchoolProgram = ({ schoolCode, schoolName, city, sector, programCode, programName, jobCode, cost = 0, bacs }) => {
  const school = ensureNode(schoolCode, {
    type: 'ETABLISSEMENT',
    nom_fr: schoolName,
    description: `${schoolName}. Etablissement consolide pour enrichir les parcours d'orientation.`,
    secteur: sector,
    ville: city,
    duree_mois: 0,
    cout_estime: 0,
  })
  const program = ensureNode(programCode, {
    type: 'FILIERE',
    nom_fr: programName,
    description: `${programName}. Cycle bac+5 consolide pour un parcours coherent vers ${jobCode.replace(/_/g, ' ').toLowerCase()}.`,
    secteur: sector,
    ville: city,
    duree_mois: 60,
    cout_estime: cost,
  })
  ensureEdge(program, school, 'OFFERTE_PAR', { taux_reussite: 88 })
  for (const bacCode of bacs || ['BAC_SM', 'BAC_PC', 'BAC_TECH_ELEC']) {
    ensureEdge(codeMap.get(bacCode), program, 'ADMISSION', { type_acces: 'CONCOURS', moyenne_minimale: 12, taux_reussite: 74 })
  }
  ensureEdge(program, codeMap.get(jobCode), 'RECRUTEMENT', { taux_reussite: 86 })
}

const engineeringLastMile = [
  {
    schoolCode: 'ENSIAS_RABAT',
    schoolName: "Ecole Nationale Superieure d'Informatique et d'Analyse des Systemes Rabat",
    city: 'Rabat',
    sector: 'Informatique',
    programCode: 'FINAL_GENIE_INFORMATIQUE_ENSIAS_RABAT',
    programName: 'Cycle Ingenieur Genie Informatique - ENSIAS Rabat',
    jobCode: 'INGENIEUR_GENIE_INFORMATIQUE',
  },
  {
    schoolCode: 'INPT_RABAT',
    schoolName: 'Institut National des Postes et Telecommunications Rabat',
    city: 'Rabat',
    sector: 'Informatique et telecommunications',
    programCode: 'FINAL_GENIE_INFORMATIQUE_INPT_RABAT',
    programName: 'Cycle Ingenieur Informatique et Reseaux - INPT Rabat',
    jobCode: 'INGENIEUR_GENIE_INFORMATIQUE',
  },
  {
    schoolCode: 'EMI_RABAT',
    schoolName: 'Ecole Mohammadia d Ingenieurs Rabat',
    city: 'Rabat',
    sector: 'Informatique',
    programCode: 'FINAL_GENIE_INFORMATIQUE_EMI_RABAT',
    programName: 'Cycle Ingenieur Genie Informatique - EMI Rabat',
    jobCode: 'INGENIEUR_GENIE_INFORMATIQUE',
  },
  {
    schoolCode: 'ENSEM_CASABLANCA',
    schoolName: "Ecole Nationale Superieure d'Electricite et de Mecanique Casablanca",
    city: 'Casablanca',
    sector: 'Informatique industrielle',
    programCode: 'FINAL_GENIE_INFORMATIQUE_ENSEM_CASABLANCA',
    programName: 'Cycle Ingenieur Informatique et Systemes - ENSEM Casablanca',
    jobCode: 'INGENIEUR_GENIE_INFORMATIQUE',
  },
  {
    schoolCode: 'ENSIAS_RABAT',
    schoolName: "Ecole Nationale Superieure d'Informatique et d'Analyse des Systemes Rabat",
    city: 'Rabat',
    sector: 'Informatique',
    programCode: 'FINAL_INGENIERIE_LOGICIELLE_ARCHITECTURE_SI_ENSIAS_RABAT',
    programName: "Ingenierie Logicielle et Architecture des Systemes d'Information - ENSIAS Rabat",
    jobCode: 'ARCHITECTE_LOGICIEL',
  },
  {
    schoolCode: 'ENSAM_CASABLANCA',
    schoolName: 'Ecole Nationale Superieure d Arts et Metiers Casablanca',
    city: 'Casablanca',
    sector: 'Ingenierie',
    programCode: 'FINAL_INGENIERIE_AUTOMOBILE_ENSAM_CASABLANCA',
    programName: 'Ingenierie Automobile - ENSAM Casablanca',
    jobCode: 'INGENIEUR_AUTOMOBILE',
  },
  {
    schoolCode: 'AIAC_CASABLANCA',
    schoolName: "Academie Internationale Mohammed VI de l'Aviation Civile Casablanca",
    city: 'Casablanca',
    sector: 'Aeronautique',
    programCode: 'FINAL_GENIE_AERONAUTIQUE_AIAC_CASABLANCA',
    programName: "Genie Aeronautique - AIAC Casablanca",
    jobCode: 'INGENIEUR_AERONAUTIQUE',
  },
  {
    schoolCode: 'EMI_RABAT',
    schoolName: 'Ecole Mohammadia d Ingenieurs Rabat',
    city: 'Rabat',
    sector: 'Energie',
    programCode: 'FINAL_GENIE_ENERGIES_RENOUVELABLES_EMI_RABAT',
    programName: 'Genie Energies Renouvelables - EMI Rabat',
    jobCode: 'INGENIEUR_ENERGIES_RENOUVELABLES',
  },
  {
    schoolCode: 'EMI_RABAT',
    schoolName: 'Ecole Mohammadia d Ingenieurs Rabat',
    city: 'Rabat',
    sector: 'Industrie',
    programCode: 'FINAL_GENIE_INDUSTRIEL_PROCESS_EMI_RABAT',
    programName: 'Genie Industriel et Process - EMI Rabat',
    jobCode: 'INGENIEUR_PROCESS',
  },
  {
    schoolCode: 'ENSAM_CASABLANCA',
    schoolName: 'Ecole Nationale Superieure d Arts et Metiers Casablanca',
    city: 'Casablanca',
    sector: 'Industrie',
    programCode: 'FINAL_GENIE_INDUSTRIEL_QUALITE_ENSAM_CASABLANCA',
    programName: 'Genie Industriel Qualite - ENSAM Casablanca',
    jobCode: 'INGENIEUR_QUALITE',
  },
  {
    schoolCode: 'FST_SETTAT',
    schoolName: 'Faculte des Sciences et Techniques Settat',
    city: 'Settat',
    sector: 'Industrie',
    programCode: 'FINAL_GENIE_HSE_FST_SETTAT',
    programName: 'Genie HSE et Management des Risques - FST Settat',
    jobCode: 'INGENIEUR_HSE',
  },
  {
    schoolCode: 'UM6SS_CASABLANCA',
    schoolName: 'Universite Mohammed VI des Sciences de la Sante Casablanca',
    city: 'Casablanca',
    sector: 'Sante et technologies medicales',
    programCode: 'FINAL_GENIE_BIOMEDICAL_UM6SS_CASABLANCA',
    programName: 'Genie Biomedical - UM6SS Casablanca',
    jobCode: 'INGENIEUR_BIOMEDICAL',
    cost: 450000,
    bacs: ['BAC_SM', 'BAC_PC', 'BAC_SVT'],
  },
  {
    schoolCode: 'EMI_RABAT',
    schoolName: 'Ecole Mohammadia d Ingenieurs Rabat',
    city: 'Rabat',
    sector: 'Materiaux',
    programCode: 'FINAL_GENIE_MATERIAUX_EMI_RABAT',
    programName: 'Genie des Materiaux - EMI Rabat',
    jobCode: 'INGENIEUR_MATERIAUX',
  },
  {
    schoolCode: 'ENSC_KENITRA',
    schoolName: 'Ecole Nationale Superieure de Chimie Kenitra',
    city: 'Kenitra',
    sector: 'Chimie industrielle',
    programCode: 'FINAL_GENIE_CHIMIE_INDUSTRIELLE_ENSC_KENITRA',
    programName: 'Genie Chimie Industrielle - ENSC Kenitra',
    jobCode: 'INGENIEUR_CHIMIE_INDUSTRIELLE',
  },
  {
    schoolCode: 'ENSMR_RABAT',
    schoolName: 'Ecole Nationale Superieure des Mines de Rabat',
    city: 'Rabat',
    sector: 'Mines et petrochimie',
    programCode: 'FINAL_GENIE_PETROCHIMIE_ENSMR_RABAT',
    programName: 'Genie Petrochimie - ENSMR Rabat',
    jobCode: 'INGENIEUR_PETROCHIMIE',
  },
  {
    schoolCode: 'ENSAM_CASABLANCA',
    schoolName: 'Ecole Nationale Superieure d Arts et Metiers Casablanca',
    city: 'Casablanca',
    sector: 'Industrie',
    programCode: 'FINAL_GENIE_PLASTURGIE_ENSAM_CASABLANCA',
    programName: 'Genie Plasturgie - ENSAM Casablanca',
    jobCode: 'INGENIEUR_PLASTURGIE',
  },
  {
    schoolCode: 'INPT_RABAT',
    schoolName: 'Institut National des Postes et Telecommunications Rabat',
    city: 'Rabat',
    sector: 'Cybersecurite',
    programCode: 'FINAL_CYBERSECURITE_INPT_RABAT',
    programName: 'Cybersecurite et Confiance Numerique - INPT Rabat',
    jobCode: 'CONSULTANT_CYBERSECURITE',
  },
  {
    schoolCode: 'INSEA_RABAT',
    schoolName: 'Institut National de Statistique et d Economie Appliquee Rabat',
    city: 'Rabat',
    sector: 'Statistique et actuariat',
    programCode: 'FINAL_ACTUARIAT_INSEA_RABAT',
    programName: 'Actuariat et Finance Quantitative - INSEA Rabat',
    jobCode: 'ACTUAIRE',
    bacs: ['BAC_SM', 'BAC_PC', 'BAC_SE'],
  },
  {
    schoolCode: 'INSEA_RABAT',
    schoolName: 'Institut National de Statistique et d Economie Appliquee Rabat',
    city: 'Rabat',
    sector: 'Statistique',
    programCode: 'FINAL_STATISTIQUE_ECONOMIE_APPLIQUEE_INSEA_RABAT',
    programName: 'Statistique et Economie Appliquee - INSEA Rabat',
    jobCode: 'STATISTICIEN',
    bacs: ['BAC_SM', 'BAC_PC', 'BAC_SE'],
  },
  {
    schoolCode: 'FSJES_RABAT',
    schoolName: 'Faculte des Sciences Juridiques Economiques et Sociales Rabat',
    city: 'Rabat',
    sector: 'Economie',
    programCode: 'FINAL_ECONOMIE_APPLIQUEE_FSJES_RABAT',
    programName: 'Economie Appliquee - FSJES Rabat',
    jobCode: 'ECONOMISTE',
    bacs: ['BAC_SM', 'BAC_PC', 'BAC_SE', 'BAC_ECO', 'BAC_GC', 'BAC_LETTRES'],
  },
]

engineeringLastMile.forEach(ensureSchoolProgram)

const linkExistingProgramsToSchool = (schoolCode, programCodes, successRate = 82) => {
  const school = codeMap.get(schoolCode)
  for (const programCode of programCodes) {
    ensureEdge(codeMap.get(programCode), school, 'OFFERTE_PAR', { taux_reussite: successRate })
  }
}

linkExistingProgramsToSchool('FST_MARRAKECH', [
  'F9R_LICENCE_ENVIRONNEMENT_ENERGIES_FST_MARRAKECH',
  'F9R_LICENCE_GENIE_CIVIL_FST_MARRAKECH',
  'F9R_LICENCE_GENIE_INFORMATIQUE_FST_MARRAKECH',
  'F9R_LICENCE_RESEAUX_TELECOMS_FST_MARRAKECH',
  'F9R_LST_GENIE_ELECTRIQUE_FST_MARRAKECH',
  'F9R_LST_GENIE_INDUSTRIEL_FST_MARRAKECH',
  'F9R_LST_GENIE_INFORMATIQUE_FST_MARRAKECH',
  'F9R_MST_DATA_SCIENCE_FST_MARRAKECH',
  'F9R_MST_ENERGIES_RENOUVELABLES_FST_MARRAKECH',
  'F9R_MST_RESEAUX_SYSTEMES_FST_MARRAKECH',
])

linkExistingProgramsToSchool('EST_SIDI_BENNOUR', [
  'F9R_DUT_AGRO_INDUSTRIE_EST_SIDI_BENNOUR',
  'F9R_DUT_FINANCE_COMPTABILITE_EST_SIDI_BENNOUR',
  'F9R_DUT_GENIE_ELECTRIQUE_EST_SIDI_BENNOUR',
  'F9R_DUT_GENIE_INFORMATIQUE_EST_SIDI_BENNOUR',
  'F9R_DUT_GENIE_MECANIQUE_PRODUCTIQUE_EST_SIDI_BENNOUR',
  'F9R_DUT_GESTION_BANQUE_ASSURANCE_EST_SIDI_BENNOUR',
  'F9R_DUT_LOGISTIQUE_TRANSPORT_EST_SIDI_BENNOUR',
  'F9R_DUT_MAINTENANCE_INDUSTRIELLE_EST_SIDI_BENNOUR',
  'F9R_DUT_MANAGEMENT_ENTREPRISES_EST_SIDI_BENNOUR',
  'F9R_DUT_QHSE_EST_SIDI_BENNOUR',
  'F9R_DUT_RESEAUX_TELECOMS_EST_SIDI_BENNOUR',
])

linkExistingProgramsToSchool('SCRAPE_9RAYTI_ECOLE_ESCA_CASABLANCA', [
  'BACHELOR_MANAGEMENT_ESCA_CASABLANCA',
  'PROGRAMME_GRANDE_ECOLE_FINANCE_ESCA_CASABLANCA',
], 84)

for (const node of nodes) {
  if (!isFiliere(node)) continue
  const label = labelTextOf(node)
  const programName = programNameTextOf(node)

  if (/\b(DUT|BTS|DEUST|CPGE)\b/.test(label)) {
    node.duree_mois = 24
    node.description = `${node.nom_fr}. Formation bac+2 consolidee: 2 ans apres bac.`
    continue
  }

  if (/\b(LICENCE|LST|BAC\+3)\b/.test(label)) {
    node.duree_mois = 36
    node.description = `${node.nom_fr}. Formation bac+3 consolidee: 3 ans apres bac.`
    continue
  }

  if (/\b(MASTER|MASTERE|MBA)\b/.test(label)) {
    node.duree_mois = 24
    node.description = `${node.nom_fr}. Cycle master consolide: 2 ans apres licence.`
    continue
  }

  if (isRealArchitectProgram(node)) {
    node.duree_mois = 72
    node.secteur = 'Architecture'
    node.description = `${node.nom_fr}. Diplome d'architecte consolide: 6 ans apres bac.`
    continue
  }

  if (isDentalProgram(node) || /PHARMACIE/.test(programName)) {
    node.duree_mois = 72
    node.secteur = 'Sante'
    node.description = `${node.nom_fr}. Duree consolidee: 6 ans apres bac.`
    continue
  }

  if (/DOCTEUR EN MEDECINE|DOCTORAT EN MEDECINE|DIPLOME.*MEDECINE/.test(programName)) {
    node.duree_mois = 84
    node.secteur = 'Sante'
    node.description = `${node.nom_fr}. Duree consolidee: 7 ans apres bac.`
    continue
  }

  if (isDiplomeEncgProgram(node) || (isEngineeringProgram(node) && !isBacPlus2Program(node))) {
    node.duree_mois = 60
    node.description = `${node.nom_fr}. Duree consolidee: 5 ans apres bac.`
  }
}

nodes.sort((a, b) => String(a.code).localeCompare(String(b.code)))
edges.sort((a, b) => `${a.source_id}${a.target_id}${a.type_lien}`.localeCompare(`${b.source_id}${b.target_id}${b.type_lien}`))

await writeJson(nodesPath, nodes)
await writeJson(edgesPath, edges)

console.log(JSON.stringify({ ...report, nodes: nodes.length, edges: edges.length }, null, 2))
