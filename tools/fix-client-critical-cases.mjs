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
const edges = await readJson(edgesPath)
const byCode = new Map(nodes.map((node) => [node.code, node]))
const byId = new Map(nodes.map((node) => [node.id, node]))
let nextId = Math.max(...nodes.map((node) => Number(node.id) || 0)) + 1

let nodesAdded = 0
let nodesUpdated = 0
let edgesAdded = 0
let edgesUpdated = 0
let edgesRemoved = 0
let publicCostsFixed = 0

const publicPattern =
  /\b(FSJES|FACULTE|UNIVERSITE HASSAN|UNIVERSITE MOHAMMED|UNIVERSITE IBN|UNIVERSITE SIDI|UNIVERSITE CADI|UNIVERSITE ABDELMALEK|ENCG|ENSA|ECOLE NATIONALE DES SCIENCES APPLIQUEES|ENSAM|ENSIAS|ENSEM|ECOLE NATIONALE SUPERIEURE D ELECTRICITE|EMI|EHTP|ENSMR|ECOLE NATIONALE SUPERIEURE DES MINES|INPT|INSEA|IAV|EST|FST|FLSH|ISCAE|INSTITUT SUPERIEUR DE COMMERCE)\b/
const privatePattern =
  /\b(UM6SS|UM6P|MUNDIAPOLIS|ISGA|IGA|EMSI|HEM|SUP'?RH|VATEL|ADALIA|MATCI|OSTELEA|ISIAM|ESCA|HECI|UIR|UPM|UNIVERSITE INTERNATIONALE DE RABAT|UNIVERSITE PRIVEE|ECOLE PRIVEE|INSTITUT PRIVE|ECOLE MOHAMMED VI DE MEDECINE VETERINAIRE|EM6MV|EGE|ECOLE DE GUERRE ECONOMIQUE|ABULCASIS|FPMM|ESGB|IHE PARIS|SUPMTI|HESTIM|ISFORT|UIC|GROUPE IGS)\b/

const isPrivateNode = (node) => privatePattern.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.description || ''}`))
const isPublicNode = (node) => publicPattern.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.description || ''}`)) && !isPrivateNode(node)

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
]

const cityFromText = (value = '') => {
  const text = normalize(value)
  return cityNames.find((city) => text.includes(normalize(city))) || ''
}

const estimatePrivateCost = (program, school) => {
  const text = normalize(`${program?.code || ''} ${program?.nom_fr || ''} ${program?.secteur || ''} ${school?.code || ''} ${school?.nom_fr || ''}`)
  const years = Math.max(1, Math.ceil(Number(program?.duree_mois || 12) / 12))
  if (/MEDECINE|DENTAIRE|PHARMACIE|BIOMEDICAL|SANTE|VETERINAIRE/.test(text)) return years * 90000
  if (/INGENIEUR|INFORMATIQUE|DATA|CYBER|RESEAUX|GENIE|EMSI|HESTIM|SUPMTI|UIC|UIR/.test(text)) return years * 55000
  if (/BUSINESS|MANAGEMENT|COMMERCE|MARKETING|FINANCE|COMPTA|AUDIT|MBA|HEM|ISGA|IGA|MUNDIAPOLIS|ESCA|EGE/.test(text)) return years * 45000
  return years * 35000
}

const updateNode = (node, values) => {
  let changed = false
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue
    if (node[key] !== value) {
      node[key] = value
      changed = true
    }
  }
  if (changed) nodesUpdated += 1
  return node
}

const ensureNode = (code, values) => {
  const existing = byCode.get(code)
  if (existing) return updateNode(existing, values)
  const node = { id: nextId, code, actif: true, ...values }
  nextId += 1
  nodes.push(node)
  byCode.set(code, node)
  byId.set(node.id, node)
  nodesAdded += 1
  return node
}

const ensureSchool = (code, name, city, secteur = 'Enseignement superieur') =>
  ensureNode(code, {
    nom_fr: name,
    type: 'ETABLISSEMENT',
    description: `${name}. Etablissement public d'enseignement superieur a ${city}.`,
    secteur,
    ville: city,
    duree_mois: 0,
    cout_estime: 0,
    actif: true,
  })

const ensureJob = (code, name, secteur, aliases = []) =>
  ensureNode(code, {
    nom_fr: name,
    type: 'METIER',
    description: `${name}. Metier du secteur ${secteur}.`,
    secteur,
    ville: null,
    duree_mois: 0,
    cout_estime: 0,
    aliases,
    actif: true,
  })

const ensureProgram = (code, name, city, months, secteur, cost = 0) =>
  ensureNode(code, {
    nom_fr: name,
    type: 'FILIERE',
    description: `${name}. Duree du cycle: ${months} mois.`,
    secteur,
    ville: city,
    duree_mois: months,
    cout_estime: cost,
    actif: true,
  })

const edgeKey = (sourceId, targetId, typeLien) => `${sourceId}|${targetId}|${typeLien}`
const existingEdges = new Map(edges.map((edge) => [edgeKey(edge.source_id, edge.target_id, edge.type_lien), edge]))

const addEdge = (source, target, typeLien, extras = {}) => {
  if (!source || !target) return null
  const key = edgeKey(source.id, target.id, typeLien)
  const existing = existingEdges.get(key)
  const values = {
    type_acces: extras.type_acces ?? existing?.type_acces ?? 'OUVERT',
    moyenne_minimale: extras.moyenne_minimale ?? existing?.moyenne_minimale ?? null,
    taux_reussite: extras.taux_reussite ?? existing?.taux_reussite ?? 82,
    cout_supplementaire: extras.cout_supplementaire ?? existing?.cout_supplementaire ?? 0,
    duree_supplementaire_mois: extras.duree_supplementaire_mois ?? existing?.duree_supplementaire_mois ?? 0,
    actif: true,
  }

  if (existing) {
    let changed = false
    for (const [field, value] of Object.entries(values)) {
      if (existing[field] !== value) {
        existing[field] = value
        changed = true
      }
    }
    if (changed) edgesUpdated += 1
    return existing
  }

  const edge = {
    source_id: source.id,
    target_id: target.id,
    type_lien: typeLien,
    ...values,
  }
  edges.push(edge)
  existingEdges.set(key, edge)
  edgesAdded += 1
  return edge
}

const bac = (code) => byCode.get(code)
const bacsTech = ['BAC_SM', 'BAC_PC', 'BAC_SVT']
const bacsEco = ['BAC_SM', 'BAC_SE', 'BAC_GC', 'BAC_ECO', 'BAC_SGC']
const bacsDroit = ['BAC_LETTRES', 'BAC_SH', 'BAC_SE', 'BAC_GC', 'BAC_ECO']

const addSchoolProgressionEdges = () => {
  const tc = byCode.get('TC')
  const third = byCode.get('3AC')
  const firstBacToTerminal = {
    '1BAC_SM': ['BAC_SM'],
    '1BAC_SE': ['BAC_PC', 'BAC_SVT', 'BAC_SE'],
    '1BAC_ECO': ['BAC_ECO', 'BAC_GC', 'BAC_SE', 'BAC_SGC'],
    '1BAC_LETTRES': ['BAC_LETTRES', 'BAC_SH'],
    '1BAC_TECH': ['BAC_TECH_ELEC', 'BAC_TECH_MECA', 'BAC_TECH_CIVIL'],
    '1BAC_ART': ['BAC_ARTS'],
  }

  if (third && tc) {
    addEdge(third, tc, 'DONNE_ACCES', {
      type_acces: 'OUVERT',
      moyenne_minimale: null,
      taux_reussite: 90,
      duree_supplementaire_mois: 12,
    })
  }

  for (const [firstBacCode, terminalCodes] of Object.entries(firstBacToTerminal)) {
    const firstBac = byCode.get(firstBacCode)
    if (tc && firstBac) {
      addEdge(tc, firstBac, 'DONNE_ACCES', {
        type_acces: 'OUVERT',
        moyenne_minimale: null,
        taux_reussite: 88,
        duree_supplementaire_mois: 12,
      })
    }
    for (const terminalCode of terminalCodes) {
      const terminal = byCode.get(terminalCode)
      if (firstBac && terminal) {
        addEdge(firstBac, terminal, 'DONNE_ACCES', {
          type_acces: 'OUVERT',
          moyenne_minimale: null,
          taux_reussite: 88,
          duree_supplementaire_mois: 12,
        })
      }
    }
  }
}

const connectProgram = ({ program, school, bacs = [], jobs = [], moyenne = 11, taux = 82 }) => {
  addEdge(program, school, 'OFFERTE_PAR', { type_acces: 'OUVERT', taux_reussite: 100 })
  for (const bacCode of bacs) {
    addEdge(bac(bacCode), program, 'ADMISSION', {
      type_acces: 'CONCOURS',
      moyenne_minimale: moyenne,
      taux_reussite: taux,
    })
  }
  for (const jobCode of jobs) {
    addEdge(program, byCode.get(jobCode), 'RECRUTEMENT', {
      type_acces: 'OUVERT',
      moyenne_minimale: null,
      taux_reussite: 88,
    })
  }
}

const ensaCasablanca = ensureSchool('ENSA_CASABLANCA', 'Ecole Nationale des Sciences Appliquees Casablanca', 'Casablanca', 'Ingenierie')
const ensemCasablanca = ensureSchool('ENSEM_CASABLANCA', "Ecole Nationale Superieure d'Electricite et de Mecanique Casablanca", 'Casablanca', 'Ingenierie')
const ehtpCasablanca = ensureSchool('EHTP_CASABLANCA', 'Ecole Hassania des Travaux Publics Casablanca', 'Casablanca', 'Ingenierie')
const ensmrRabat = ensureSchool('ENSMR_RABAT', 'Ecole Nationale Superieure des Mines Rabat', 'Rabat', 'Ingenierie')
const fsCasablanca = ensureSchool('FACULTE_SCIENCES_CASABLANCA', 'Faculte des Sciences Casablanca', 'Casablanca', 'Sciences')
const fsjesCasablanca = ensureSchool('FSJES_CASABLANCA', 'Faculte des Sciences Juridiques, Economiques et Sociales Casablanca', 'Casablanca', 'Droit et economie')
const fsjesRabat = ensureSchool('FSJES_RABAT_AGDAL', 'Faculte des Sciences Juridiques, Economiques et Sociales Rabat Agdal', 'Rabat', 'Droit et economie')
const iscaeRabat = ensureSchool('ISCAE_RABAT', 'Institut Superieur de Commerce et d Administration des Entreprises Rabat', 'Rabat', 'Commerce et gestion')
const fstBeniMellal = ensureSchool('FST_BENI_MELLAL', 'Faculte des Sciences et Techniques Beni Mellal', 'Beni Mellal', 'Sciences et techniques')
const fstErrachidia = ensureSchool('FST_ERRACHIDIA', 'Faculte des Sciences et Techniques Errachidia', 'Errachidia', 'Sciences et techniques')
const fstMohammedia = ensureSchool('FST_MOHAMMEDIA', 'Faculte des Sciences et Techniques Mohammedia', 'Mohammedia', 'Sciences et techniques')
const fstSettat = ensureSchool('FST_SETTAT', 'Faculte des Sciences et Techniques Settat', 'Settat', 'Sciences et techniques')
const fstTanger = ensureSchool('FST_TANGER', 'Faculte des Sciences et Techniques Tanger', 'Tanger', 'Sciences et techniques')
const fmpTanger = ensureSchool('FMP_TANGER', 'Faculte de Medecine et de Pharmacie Tanger', 'Tanger', 'Sante')
const iavRabat = ensureSchool('IAV_HASSAN_II_RABAT', 'Institut Agronomique et Veterinaire Hassan II Rabat', 'Rabat', 'Agronomie et sciences veterinaires')
const btsCasablanca = ensureSchool('BTS_CENTRE_CASABLANCA', 'Centre BTS Casablanca', 'Casablanca', 'Brevet de Technicien Superieur')
const btsRabat = ensureSchool('BTS_CENTRE_RABAT', 'Centre BTS Rabat', 'Rabat', 'Brevet de Technicien Superieur')
const btsFes = ensureSchool('BTS_CENTRE_FES', 'Centre BTS Fes', 'Fes', 'Brevet de Technicien Superieur')
const btsMarrakech = ensureSchool('BTS_CENTRE_MARRAKECH', 'Centre BTS Marrakech', 'Marrakech', 'Brevet de Technicien Superieur')

const attachProgramsMatching = (school, pattern) => {
  for (const node of nodes) {
    if (node.type !== 'FILIERE') continue
    if (!pattern.test(normalize(`${node.code || ''} ${node.nom_fr || ''}`))) continue
    addEdge(node, school, 'OFFERTE_PAR', { type_acces: 'OUVERT', taux_reussite: 90 })
  }
}

attachProgramsMatching(fstBeniMellal, /FST.*BENI MELLAL|BENI MELLAL.*FST/)
attachProgramsMatching(fstErrachidia, /FST.*ERRACHIDIA|ERRACHIDIA.*FST/)
attachProgramsMatching(fstMohammedia, /FST.*MOHAMMEDIA|MOHAMMEDIA.*FST/)
attachProgramsMatching(fstSettat, /FST.*SETTAT|SETTAT.*FST/)
attachProgramsMatching(fstTanger, /FST.*TANGER|TANGER.*FST/)
attachProgramsMatching(fmpTanger, /MEDECINE.*PHARMACIE.*TANGER|PHARMACIE.*TANGER|MEDECINE.*TANGER/)
attachProgramsMatching(
  iavRabat,
  /(IAV|HASSAN II).*(VETERINAIRE|AGRONOM|AGRO|HALIEUTIQUE|FOREST|RURAL|HORTICOLE|ZOOTECHNIE|PROTECTION DES PLANTES|INDUSTRIES AGRICOLES)/,
)
attachProgramsMatching(btsCasablanca, /\bBTS\b.*CENTRE.*CASABLANCA|CENTRE.*BTS.*CASABLANCA|CASABLANCA.*CENTRE.*BTS/)
attachProgramsMatching(btsRabat, /\bBTS\b.*CENTRE.*RABAT|CENTRE.*BTS.*RABAT|RABAT.*CENTRE.*BTS/)
attachProgramsMatching(btsFes, /\bBTS\b.*CENTRE.*FES|CENTRE.*BTS.*FES|FES.*CENTRE.*BTS/)
attachProgramsMatching(btsMarrakech, /\bBTS\b.*CENTRE.*MARRAKECH|CENTRE.*BTS.*MARRAKECH|MARRAKECH.*CENTRE.*BTS/)
addSchoolProgressionEdges()

ensureJob('INGENIEUR_GENIE_INFORMATIQUE', 'Ingenieur genie informatique', 'Informatique', ['Ingenieur informatique', 'Genie informatique'])
ensureJob('DEEP_LEARNING_ENGINEER', 'Deep Learning Engineer', 'Data et IA', ['Ingenieur deep learning', 'Machine Learning Engineer', 'Ingenieur IA'])
ensureJob('DATA_SCIENTIST', 'Data Scientist', 'Data et IA')
ensureJob('DATA_ENGINEER', 'Data Engineer', 'Data et IA')
ensureJob('INGENIEUR_ENVIRONNEMENT', 'Ingenieur environnement', 'Environnement et energies')
ensureJob('INGENIEUR_HYDRAULIQUE', 'Ingenieur hydraulique', 'Environnement et energies')
ensureJob('INGENIEUR_MINES', 'Ingenieur mines', 'Mines et geologie')
ensureJob('INGENIEUR_BIOMEDICAL', 'Ingenieur biomedical', 'Sante et technologies medicales')
ensureJob('AUDITEUR', 'Auditeur', 'Audit, Comptabilite et Gestion', ['Auditeur financier', 'Auditeur interne'])
ensureJob('AUDITEUR_FINANCIER', 'Auditeur financier', 'Audit, Comptabilite et Gestion', ['Auditeur'])
ensureJob('AVOCAT', 'Avocat', 'Droit')
ensureJob('EXPERT_COMPTABLE', 'Expert comptable', 'Audit, Comptabilite et Gestion')
ensureJob('SOUDEUR', 'Soudeur', "Metiers de la production et de l'industrialisation", ['Soudeur industriel', 'Technicien soudage'])

const ensaGi = ensureProgram('F9R_INGENIEUR_GENIE_INFORMATIQUE_ENSA_CASABLANCA', 'Ingenieur Genie Informatique - ENSA Casablanca', 'Casablanca', 60, 'Informatique', 0)
connectProgram({
  program: ensaGi,
  school: ensaCasablanca,
  bacs: bacsTech,
  jobs: ['INGENIEUR_GENIE_INFORMATIQUE', 'DATA_ENGINEER', 'DEEP_LEARNING_ENGINEER'],
  moyenne: 13,
  taux: 78,
})

const ensemInfo = ensureProgram('F9R_CYCLE_INGENIEUR_INFORMATIQUE_ENSEM_CASABLANCA', 'Cycle Ingenieur Informatique - ENSEM Casablanca', 'Casablanca', 60, 'Informatique', 0)
connectProgram({
  program: ensemInfo,
  school: ensemCasablanca,
  bacs: ['BAC_SM', 'BAC_PC'],
  jobs: ['INGENIEUR_GENIE_INFORMATIQUE', 'DATA_ENGINEER'],
  moyenne: 13,
  taux: 76,
})

const ehtpEnv = ensureProgram('F9R_INGENIEUR_ENVIRONNEMENT_EHTP_CASABLANCA', 'Cycle Ingenieur Environnement - EHTP Casablanca', 'Casablanca', 60, 'Environnement et energies', 0)
connectProgram({
  program: ehtpEnv,
  school: ehtpCasablanca,
  bacs: ['BAC_SM', 'BAC_PC', 'BAC_SVT'],
  jobs: ['INGENIEUR_ENVIRONNEMENT'],
  moyenne: 13,
  taux: 76,
})

const ehtpHydraulique = ensureProgram('F9R_INGENIEUR_HYDRAULIQUE_EHTP_CASABLANCA', 'Cycle Ingenieur Hydraulique - EHTP Casablanca', 'Casablanca', 60, 'Hydraulique et genie civil', 0)
connectProgram({
  program: ehtpHydraulique,
  school: ehtpCasablanca,
  bacs: ['BAC_SM', 'BAC_PC'],
  jobs: ['INGENIEUR_HYDRAULIQUE'],
  moyenne: 13,
  taux: 76,
})

const ensmrMines = ensureProgram('F9R_INGENIEUR_MINES_ENSMR_RABAT', 'Cycle Ingenieur Mines - ENSMR Rabat', 'Rabat', 60, 'Mines et geologie', 0)
connectProgram({
  program: ensmrMines,
  school: ensmrRabat,
  bacs: ['BAC_SM', 'BAC_PC'],
  jobs: ['INGENIEUR_MINES'],
  moyenne: 13,
  taux: 75,
})

const licenceBiomedical = ensureProgram('F9R_LICENCE_SCIENCES_BIOMEDICALES_FACULTE_DES_SCIENCES_CASABLANCA', 'Licence Sciences Biomedicales - Faculte des Sciences Casablanca', 'Casablanca', 36, 'Sante et technologies medicales', 0)
connectProgram({
  program: licenceBiomedical,
  school: fsCasablanca,
  bacs: ['BAC_SM', 'BAC_PC', 'BAC_SVT'],
  jobs: ['TECHNICIEN_LABORATOIRE'],
  moyenne: 11,
  taux: 78,
})

const masterBiomedical = ensureProgram('F9R_MASTER_GENIE_BIOMEDICAL_FACULTE_DES_SCIENCES_CASABLANCA', 'Master Genie Biomedical - Faculte des Sciences Casablanca', 'Casablanca', 24, 'Sante et technologies medicales', 0)
connectProgram({
  program: masterBiomedical,
  school: fsCasablanca,
  jobs: ['INGENIEUR_BIOMEDICAL'],
})
addEdge(licenceBiomedical, masterBiomedical, 'DONNE_ACCES', {
  type_acces: 'DOSSIER',
  moyenne_minimale: 12,
  taux_reussite: 74,
})

const licenceInfoCasa = ensureProgram('F9R_LICENCE_INFORMATIQUE_FACULTE_DES_SCIENCES_CASABLANCA', 'Licence Informatique - Faculte des Sciences Casablanca', 'Casablanca', 36, 'Informatique', 0)
const masterIaCasa = ensureProgram('F9R_MASTER_IA_DATA_SCIENCE_FACULTE_DES_SCIENCES_CASABLANCA', 'Master Intelligence Artificielle et Data Science - Faculte des Sciences Casablanca', 'Casablanca', 24, 'Data et IA', 0)
connectProgram({
  program: licenceInfoCasa,
  school: fsCasablanca,
  bacs: ['BAC_SM', 'BAC_PC'],
  jobs: ['DEVELOPPEUR_FULL_STACK'],
  moyenne: 11,
  taux: 80,
})
connectProgram({
  program: masterIaCasa,
  school: fsCasablanca,
  jobs: ['DATA_SCIENTIST', 'DATA_ENGINEER', 'DEEP_LEARNING_ENGINEER'],
})
addEdge(licenceInfoCasa, masterIaCasa, 'DONNE_ACCES', {
  type_acces: 'DOSSIER',
  moyenne_minimale: 12,
  taux_reussite: 72,
})

const licenceDroitCasa = ensureProgram('F9R_LICENCE_DROIT_PRIVE_FSJES_CASABLANCA', 'Licence Droit Prive - FSJES Casablanca', 'Casablanca', 36, 'Droit', 0)
connectProgram({
  program: licenceDroitCasa,
  school: fsjesCasablanca,
  bacs: bacsDroit,
  jobs: ['AVOCAT'],
  moyenne: 10,
  taux: 84,
})

const licenceEcoRabat = ensureProgram('F9R_LICENCE_ECONOMIE_GESTION_FSJES_RABAT_AGDAL', 'Licence Economie et Gestion - FSJES Rabat Agdal', 'Rabat', 36, 'Economie et Gestion', 0)
const masterAuditRabat = ensureProgram('F9R_MASTER_AUDIT_CONTROLE_GESTION_FSJES_RABAT_AGDAL', 'Master Audit et Controle de Gestion - FSJES Rabat Agdal', 'Rabat', 24, 'Audit, Comptabilite et Gestion', 0)
connectProgram({
  program: licenceEcoRabat,
  school: fsjesRabat,
  bacs: bacsEco,
  jobs: ['COMPTABLE', 'ANALYSTE_FINANCIER', 'AUDITEUR'],
  moyenne: 10,
  taux: 84,
})
connectProgram({
  program: masterAuditRabat,
  school: fsjesRabat,
  jobs: ['AUDITEUR', 'AUDITEUR_FINANCIER', 'CONTROLEUR_DE_GESTION'],
})
addEdge(licenceEcoRabat, masterAuditRabat, 'DONNE_ACCES', {
  type_acces: 'DOSSIER',
  moyenne_minimale: 12,
  taux_reussite: 76,
})

const iscaeFinance = ensureProgram('F9R_DIPLOME_ISCAE_FINANCE_COMPTABILITE_RABAT', 'Diplome ISCAE Finance et Comptabilite - ISCAE Rabat', 'Rabat', 60, 'Audit, Comptabilite et Gestion', 0)
connectProgram({
  program: iscaeFinance,
  school: iscaeRabat,
  bacs: ['BAC_SM', 'BAC_SE', 'BAC_GC', 'BAC_ECO'],
  jobs: ['AUDITEUR', 'AUDITEUR_FINANCIER', 'ANALYSTE_FINANCIER'],
  moyenne: 13,
  taux: 78,
})

const istaCasablanca = ensureSchool('ISTA_CASABLANCA', 'ISTA Casablanca', 'Casablanca', 'Formation professionnelle')
const soudeurIsta = ensureProgram(
  'F9R_FORMATION_SOUDEUR_QUALIFIE_ISTA_CASABLANCA',
  'Formation Soudeur Qualifie - ISTA Casablanca',
  'Casablanca',
  24,
  "Metiers de la production et de l'industrialisation",
  0,
)
connectProgram({
  program: soudeurIsta,
  school: istaCasablanca,
  bacs: ['3AC', 'TC', 'BAC_PRO_MAINT_INDUS', 'BAC_TECH_ELEC', 'BAC_TECH_MECA', 'BAC_PC'],
  jobs: ['SOUDEUR'],
  moyenne: 10,
  taux: 82,
})
for (const bacCode of ['BAC_PRO_MAINT_INDUS', 'BAC_TECH_ELEC', 'BAC_TECH_MECA', 'BAC_PC']) {
  addEdge(bac(bacCode), soudeurIsta, 'DONNE_ACCES', {
    type_acces: 'DOSSIER',
    moyenne_minimale: 10,
    taux_reussite: 82,
  })
}

const cecPrograms = nodes.filter((node) => node.type === 'FILIERE' && /EXPERTISE COMPTABLE|DNEC|CYCLE D EXPERTISE/i.test(`${node.code || ''} ${node.nom_fr || ''}`))
for (const cec of cecPrograms) {
  updateNode(cec, {
    secteur: 'Audit, Comptabilite et Gestion',
    duree_mois: 36,
    cout_estime: isPublicNode(cec) ? 0 : cec.cout_estime || 0,
  })
  addEdge(cec, byCode.get('EXPERT_COMPTABLE'), 'RECRUTEMENT', {
    type_acces: 'OUVERT',
    moyenne_minimale: null,
    taux_reussite: 92,
  })
  addEdge(iscaeFinance, cec, 'DONNE_ACCES', {
    type_acces: 'CONCOURS',
    moyenne_minimale: 12,
    taux_reussite: 76,
  })
}

const cecIds = new Set(cecPrograms.map((node) => node.id))
const expertComptableId = byCode.get('EXPERT_COMPTABLE')?.id
const isCredibleCecSource = (node) => {
  if (!node || node.type !== 'FILIERE') return false
  const text = normalize(`${node.code || ''} ${node.nom_fr || ''} ${node.secteur || ''}`)
  if (!/(ISCAE|ENCG|FSJES|FACULTE|UNIVERSITE)/.test(text)) return false
  if (/(ISGA|MUNDIAPOLIS|EMSI|\bIGA\b|HEM|ESCA|SYSTEME D INFORMATION|SCIENCES POLITIQUES|MARKETING|COMMUNICATION|LOGISTIQUE)/.test(text)) return false
  return /(FINANCE|FINANCIER|COMPTABILITE|COMPTA|AUDIT|CONTROLE DE GESTION|GESTION COMPTABLE|EXPERTISE COMPTABLE|BANQUE|ASSURANCE|FISCAL)/.test(text)
}

const ensureFsjesSchool = (city) => {
  if (!city) return null
  const code = `FSJES_${slug(city)}`
  return ensureSchool(code, `Faculte des Sciences Juridiques, Economiques et Sociales ${city}`, city, 'Droit et economie')
}

const ensurePublicFsjesContext = (program) => {
  const text = normalize(`${program.code || ''} ${program.nom_fr || ''}`)
  if (!/(FSJES|FACULTE DES SCIENCES JURIDIQUES)/.test(text)) return
  const isFsjesDomain =
    !/(SCIENCES DE LA VIE|SVI|BIOLOGIE|ETUDES ARABES|MATHEMATIQUE|PHYSIQUE|CHIMIE|INFORMATIQUE PURE|GENIE)/.test(text) &&
    /(DROIT|JURIDIQUE|ECONOM|GESTION|COMMERCE|FINANC|COMPTA|AUDIT|BANQUE|ASSURANCE|MANAGEMENT|ADMINISTRATION|SCIENCES POLITIQUES|RELATIONS INTERNATIONALES|FISCAL|MARKETING|TOURISTIQUE|ORGANISATION|DEVELOPPEMENT|AUTORITE LOCALE|FONCIER|AFFAIRES)/.test(text)
  const city = cityFromText(text) || cityFromText(program.ville || '')
  const school = ensureFsjesSchool(city)
  if (school && isFsjesDomain) addEdge(program, school, 'OFFERTE_PAR', { type_acces: 'OUVERT', taux_reussite: 85 })
  if (/(DROIT PRIVE|DROIT PUBLIC|SCIENCES JURIDIQUES|ECONOMIE|GESTION|FINANCE|AUDIT|BANQUE|ASSURANCE)/.test(text)) {
    program.cout_estime = 0
  }
}

for (const node of nodes) {
  if (node.type === 'FILIERE') ensurePublicFsjesContext(node)
}

const privateOfferedProgramIds = new Set(
  edges
    .filter((edge) => {
      const source = byId.get(edge.source_id)
      const target = byId.get(edge.target_id)
      return edge.type_lien === 'OFFERTE_PAR' && source?.type === 'FILIERE' && target?.type === 'ETABLISSEMENT' && isPrivateNode(target)
    })
    .map((edge) => edge.source_id),
)

for (let index = edges.length - 1; index >= 0; index -= 1) {
  const edge = edges[index]
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  if (edge.type_lien === 'DONNE_ACCES' && cecIds.has(edge.target_id) && !isCredibleCecSource(source)) {
    existingEdges.delete(edgeKey(edge.source_id, edge.target_id, edge.type_lien))
    edges.splice(index, 1)
    edgesRemoved += 1
    continue
  }
  if (edge.type_lien === 'RECRUTEMENT' && edge.target_id === expertComptableId && !cecIds.has(edge.source_id)) {
    existingEdges.delete(edgeKey(edge.source_id, edge.target_id, edge.type_lien))
    edges.splice(index, 1)
    edgesRemoved += 1
    continue
  }
  if (source?.type === 'FILIERE' && target?.type === 'ETABLISSEMENT' && edge.type_lien === 'OFFERTE_PAR' && isPrivateNode(target) && Number(source.cout_estime || 0) <= 0) {
    source.cout_estime = estimatePrivateCost(source, target)
    publicCostsFixed += 1
  }
  if (
    source?.type === 'FILIERE' &&
    target?.type === 'ETABLISSEMENT' &&
    edge.type_lien === 'OFFERTE_PAR' &&
    isPublicNode(target) &&
    !isPrivateNode(source) &&
    !privateOfferedProgramIds.has(source.id) &&
    Number(source.cout_estime || 0) > 0
  ) {
    source.cout_estime = 0
    publicCostsFixed += 1
  }
}

for (const node of nodes) {
  if (node.type === 'FILIERE' && isPublicNode(node) && Number(node.cout_estime || 0) > 0) {
    node.cout_estime = 0
    publicCostsFixed += 1
  }
  if (node.type === 'FILIERE' && /DROIT PRIVE|DROIT PUBLIC|FSJES/.test(normalize(`${node.code || ''} ${node.nom_fr || ''}`)) && isPublicNode(node)) {
    node.cout_estime = 0
  }
}

nodes.sort((a, b) => a.code.localeCompare(b.code))
edges.sort((a, b) => `${a.source_id}${a.target_id}${a.type_lien}`.localeCompare(`${b.source_id}${b.target_id}${b.type_lien}`))

await writeJson(nodesPath, nodes)
await writeJson(edgesPath, edges)

console.log(
  JSON.stringify(
    {
      nodesAdded,
      nodesUpdated,
      edgesAdded,
      edgesUpdated,
      edgesRemoved,
      publicCostsFixed,
      nodes: nodes.length,
      edges: edges.length,
    },
    null,
    2,
  ),
)
