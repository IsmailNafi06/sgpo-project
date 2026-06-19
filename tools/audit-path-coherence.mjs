import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodesPath = path.join(dataDir, 'nodes_all.json')
const edgesPath = path.join(dataDir, 'edges.json')

const readJson = async (file) => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const compact = (value = '') => normalize(value).replace(/\s+/g, '')

const cityNames = [
  'Casablanca',
  'Rabat',
  'Fes',
  'Marrakech',
  'Agadir',
  'Oujda',
  'Tanger',
  'Beni Mellal',
  'Laayoune',
  'Guelmim',
  'Errachidia',
  'Dakhla',
  'Settat',
  'Kenitra',
  'Tetouan',
  'El Jadida',
  'Mohammedia',
  'Safi',
  'Meknes',
  'Sale',
  'Essaouira',
  'Khouribga',
  'Khenifra',
  'Sidi Bennour',
  'Al Hoceima',
  'Berrechid',
  'Dakhla',
]

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const extractCity = (node) => {
  const text = normalize(`${node?.code || ''} ${node?.nom_fr || ''}`)
  const city = cityNames.find((item) => {
    const cityPattern = escapeRegExp(normalize(item)).replace(/\s+/g, '\\s+')
    return new RegExp(`(^|\\s)${cityPattern}(\\s|$)`).test(text)
  })
  if (city) return normalize(city)
  return normalize(node?.ville || '')
}

const programSchoolPart = (node) => {
  const parts = String(node?.nom_fr || '').split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return ''
  return parts.slice(1).join(' - ')
}

const family = (node) => {
  const text = normalize(`${node?.code || ''} ${node?.nom_fr || ''}`)
  if (/ENCG|ECOLE NATIONALE DE COMMERCE/.test(text)) return 'ENCG'
  if (/ECOLE NATIONALE D ARCHITECTURE|\bENA\b/.test(text)) return 'ENA'
  if (/AIAC|AVIATION CIVILE/.test(text)) return 'AIAC'
  if (/UM6SS|MOHAMMED VI DES SCIENCES DE LA SANTE/.test(text)) return 'UM6SS'
  if (/ENSC|ECOLE NATIONALE SUPERIEURE DE CHIMIE/.test(text)) return 'ENSC'
  if (/FSJES|SCIENCES JURIDIQUES ECONOMIQUES/.test(text)) return 'FSJES'
  if (/FST|FACULTE DES SCIENCES ET TECHNIQUES/.test(text)) return 'FST'
  if (/ENSA|ENSIAS|ENSEM|EMI|EHTP|ENSMR|INPT|ENSAM|IAV|INSEA|ECOLE NATIONALE DES SCIENCES APPLIQUEES|ECOLE NATIONALE SUPERIEURE D ELECTRICITE|ECOLE NATIONALE SUPERIEURE D INFORMATIQUE|ECOLE NATIONALE SUPERIEURE DES MINES|ECOLE MOHAMMADIA D INGENIEURS/.test(text)) return 'ENGINEERING'
  if (/ISCAE|INSTITUT SUPERIEUR DE COMMERCE/.test(text)) return 'ISCAE'
  if (/FACULTE DES SCIENCES AIN|FACULTE DES SCIENCES CASABLANCA|FACULTE DES SCIENCES\b/.test(text)) return 'FS'
  if (/ISGA/.test(text)) return 'ISGA'
  if (/\bIGA\b/.test(text)) return 'IGA'
  if (/ECOLE SUPERIEURE DE TECHNOLOGIE|\bEST\b/.test(text)) return 'EST'
  if (/BTS/.test(text)) return 'BTS'
  if (/FACULTE|UNIVERSITE/.test(text)) return 'UNIVERSITE'
  return ''
}

const isBacOrLevel = (node) => node?.type === 'NIVEAU' || /^BAC_/.test(String(node?.code || ''))
const isBacSource = (node) => node?.type === 'FILIERE' && /^BAC_/.test(String(node?.code || ''))
const isSchool = (node) => node?.type === 'ETABLISSEMENT'
const isProgram = (node) => node?.type === 'FILIERE'
const isJob = (node) => node?.type === 'METIER'

const isBacPlus2 = (node) => /\b(DUT|BTS|DEUST|CPGE)\b/.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''}`))
const isLicenceLike = (node) => /\b(LICENCE|BAC 3|BACHELOR)\b/.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''}`))
const isEnsaOrEngineeringSchool = (node) => /ENSA|ENSIAS|ENSEM|EMI|EHTP|ENSMR|INPT|ENSAM|IAV|INSEA|ECOLE NATIONALE SUPERIEURE DES MINES/.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''}`))
const isMasterLike = (node) => /\b(MASTER|MASTERE|MBA)\b/.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''}`))
const isEngineerJob = (node) =>
  /\b(INGENIEUR|ENGINEER|ARCHITECTE LOGICIEL|DATA SCIENTIST|DATA ENGINEER)\b/.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''}`))

const isFinanceJob = (node) =>
  /\b(AUDITEUR|FINANCIER|COMPTABLE|COMPTABILITE|CONTROLEUR DE GESTION|EXPERT COMPTABLE|ANALYSTE FINANCIER)\b/.test(
    normalize(`${node?.code || ''} ${node?.nom_fr || ''}`),
  ) &&
  !/\b(AUDITEUR SI|AUDITEUR QUALITE|QUALITE|SYSTEME D INFORMATION)\b/.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''}`).replace(/_/g, ' '))
const isTechJob = (node) =>
  /\b(DATA|DEVELOPPEUR|INFORMATIQUE|CYBER|RESEAUX|LOGICIEL|FULL STACK|GENIE INFORMATIQUE|SECURITE INFORMATIQUE|AUDITEUR SI|SYSTEME D INFORMATION)\b/.test(
    normalize(`${node?.code || ''} ${node?.nom_fr || ''}`),
  )
const isTeachingJob = (node) => /\b(ENSEIGNANT|PROFESSEUR)\b/.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''}`))
const isGeneralDoctorJob = (node) => /\bMEDECIN_GENERALISTE\b|MEDECIN GENERALISTE/.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''}`))
const isDentistJob = (node) => /\b(DENTISTE|CHIRURGIEN DENTISTE|MEDECIN DENTISTE)\b/.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''}`).replace(/_/g, ' '))
const isPharmacistJob = (node) => /\b(PHARMACIEN|PHARMACIEN INDUSTRIEL)\b/.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''}`).replace(/_/g, ' '))
const isFinanceProgram = (node) =>
  /\b(FINANC|COMPTA|AUDIT|CONTROLE DE GESTION|GESTION COMPTABLE|BANQUE|ASSURANCE|ENCG|ISCAE|ACCOUNTING|DAF|FISCAL|EXPERTISE COMPTABLE|GENIE FINANCIER)\b/.test(
    normalize(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`),
  )
const isTechProgram = (node) =>
  /\b(INFORMATIQUE|DATA|CYBER|RESEAUX|LOGICIEL|SYSTEME D INFORMATION|INTELLIGENCE ARTIFICIELLE|GENIE INFORMATIQUE|DIGITAL|TELECOM|STATISTIQUE|MATHEMATIQUE|ENSIAS|ENSA|EMSI|INPT)\b/.test(
    normalize(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`),
  )
const isLifeScienceProgram = (node) =>
  /\b(SVT|SCIENCES DE LA VIE|BIOLOGIE|BIOTECH|SANTE|MEDECINE|PHARMACIE|DENTAIRE|VETERINAIRE|INFIRMIER|KINESITHERAPIE|ORTHOPHONIE)\b/.test(
    normalize(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`),
  )
const isBioTechBridgeProgram = (node) =>
  /\b(BIOINFORMATIQUE|BIOSTATISTIQUE|BIOMEDICAL|INFORMATIQUE MEDICALE|DATA SANTE|HEALTH DATA)\b/.test(
    normalize(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`),
  )
const isAdvancedAiOrDataProgram = (node) =>
  isMasterLike(node) &&
  /\b(DATA|INTELLIGENCE ARTIFICIELLE|IA|MACHINE LEARNING|BIG DATA|GENIE INFORMATIQUE|INFORMATIQUE|CYBER|LOGICIEL)\b/.test(
    normalize(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`),
  )
const isTeachingProgram = (node) =>
  /\b(ENSEIGNEMENT|ENSEIGNEMENT SUPERIEUR|RECHERCHE|DOCTORAT|EDUCATION|PEDAGOG|DIDACTIQUE|LETTRES|LANGUE|ARABE|FRANCAIS|ANGLAIS|HISTOIRE|GEOGRAPHIE|MATHEMATIQUE|PHYSIQUE|SVT)\b/.test(
    normalize(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`),
  )

const programNameOnly = (node) => String(node?.nom_fr || '').split(/\s+-\s+/)[0] || String(node?.nom_fr || '')
const isGeneralMedicineProgram = (node) => {
  const programOnlyText = normalize(`${programNameOnly(node)} ${node?.secteur || ''}`)
  return (
    /DOCTORAT MEDECINE|DOCTORAT EN MEDECINE|DOCTEUR EN MEDECINE|DIPLOME DE DOCTEUR EN MEDECINE|DIPLOME D ETAT DE DOCTEUR EN MEDECINE/.test(programOnlyText) &&
    !/VETERINAIRE|DENTAIRE|PHARMACIE|BIOTECH|LICENCE|MASTER|INFIRMIER|KINESITHERAPIE|ORTHOPHONIE|SAGE FEMME/.test(programOnlyText)
  )
}

const isDentalProgram = (node) => {
  const text = normalize(`${node?.code || ''} ${programNameOnly(node)} ${node?.secteur || ''}`).replace(/_/g, ' ')
  return /MEDECINE DENTAIRE|DOCTEUR EN MEDECINE DENTAIRE|CHIRURGIE DENTAIRE/.test(text) && !/PROTHESE|ASSISTANT|HYGIENE/.test(text)
}

const isPharmacyProgram = (node) => {
  const text = normalize(`${node?.code || ''} ${programNameOnly(node)} ${node?.secteur || ''}`).replace(/_/g, ' ')
  return /(DOCTORAT|DOCTEUR|DIPLOME).{0,30}PHARMACIE|PHARMACIEN/.test(text) && !/PREPARATEUR|ASSISTANT/.test(text)
}

const knownBadForFinanceAudit = (program) => {
  const text = normalize(`${program?.code || ''} ${program?.nom_fr || ''}`)
  return /SCIENCES POLITIQUES/.test(text)
}

const isFsjesCompatibleProgram = (program) => {
  const text = normalize(`${program?.code || ''} ${program?.nom_fr || ''} ${program?.secteur || ''}`)
  if (/ECONOMIE APPLIQUEE|ECONOMIE/.test(text)) return true
  if (/\b(SCIENCES DE LA VIE|SVI|BIOLOGIE|ETUDES ARABES|MATHEMATIQUE|PHYSIQUE|CHIMIE|INFORMATIQUE PURE|GENIE)\b/.test(text)) return false
  return /\b(DROIT|JURIDIQUE|ECONOM|GESTION|COMMERCE|FINANC|COMPTA|AUDIT|BANQUE|ASSURANCE|MANAGEMENT|ADMINISTRATION|SCIENCES POLITIQUES|RELATIONS INTERNATIONALES|FISCAL|MARKETING|TOURISTIQUE|ORGANISATION|DEVELOPPEMENT|AUTORITE LOCALE|FONCIER|AFFAIRES)\b/.test(text)
}

const isIavCompatibleProgram = (program) => {
  const text = normalize(`${program?.code || ''} ${program?.nom_fr || ''} ${program?.secteur || ''}`)
  if (isGeneralMedicineProgram(program) || isDentalProgram(program) || isPharmacyProgram(program)) return false
  if (/\bAPESA\b/.test(text)) return true
  return /\b(VETERINAIRE|AGRONOM|AGRO|HALIEUTIQUE|FOREST|EAU|ENVIRONNEMENT|RURAL|HORTICOLE|ZOOTECHNIE|PROTECTION DES PLANTES|INDUSTRIES AGRICOLES|BIOTECHNOLOGIE VEGETALE)\b/.test(text)
}

const hasEmbeddedSchoolMismatch = (school, program) => {
  const embedded = programSchoolPart(program)
  if (!embedded) return false

  const schoolFamily = family(school)
  const embeddedFamily = family({ code: embedded, nom_fr: embedded })
  if (schoolFamily && embeddedFamily && schoolFamily !== embeddedFamily) return true

  const schoolCity = extractCity(school)
  const embeddedCity = extractCity({ nom_fr: embedded })
  if (schoolCity && embeddedCity && schoolCity !== embeddedCity) return true

  if (schoolFamily && embeddedFamily && schoolFamily === embeddedFamily) return false

  if (
    /\b(IAV|HASSAN II|INSTITUT AGRONOMIQUE ET VETERINAIRE)\b/.test(normalize(embedded)) &&
    /\b(IAV|HASSAN II|INSTITUT AGRONOMIQUE ET VETERINAIRE)\b/.test(normalize(`${school?.code || ''} ${school?.nom_fr || ''}`))
  ) {
    return false
  }

  const schoolCompact = compact(school?.nom_fr || school?.code || '')
  const embeddedCompact = compact(embedded)
  if (embeddedCompact.length > 10 && schoolCompact.length > 10 && !schoolCompact.includes(embeddedCompact) && !embeddedCompact.includes(schoolCompact)) {
    return true
  }

  return false
}

const hasSchoolProgramMismatch = (school, program) => {
  const schoolFamily = family(school)
  const programFamily = family(program)
  const schoolCity = extractCity(school)
  const programCity = extractCity(program)

  if (hasEmbeddedSchoolMismatch(school, program)) return 'embedded-school-mismatch'
  if (schoolFamily && programFamily && schoolFamily !== programFamily && !['UNIVERSITE', 'FS'].includes(schoolFamily)) return 'family-mismatch'
  if (schoolFamily === 'FSJES' && !isFsjesCompatibleProgram(program)) return 'fsjes-domain-mismatch'
  if (/\b(IAV|AGRONOMIQUE|VETERINAIRE)\b/.test(normalize(`${school?.code || ''} ${school?.nom_fr || ''}`)) && !isIavCompatibleProgram(program)) return 'iav-domain-mismatch'
  if (schoolFamily === 'ENCG' && isBacPlus2(program)) return 'encg-bac-plus-2'
  if (
    isEnsaOrEngineeringSchool(school) &&
    /\b(MARKETING|COMMERCE|GESTION|BUSINESS|RH|RESSOURCES HUMAINES)\b/.test(
      normalize(`${program.code || ''} ${program.nom_fr || ''} ${program.secteur || ''}`),
    )
  ) {
    return 'engineering-school-business-program-mismatch'
  }
  if (schoolFamily === 'ENCG' && knownBadForFinanceAudit(program)) return 'encg-bad-domain'
  if (
    schoolFamily === 'ENCG' &&
    !/\b(ENCG|COMMERCE|GESTION|MANAGEMENT|MARKETING|FINANC|COMPTA|AUDIT|LOGISTIQUE|SUPPLY|RH|RESSOURCES HUMAINES|BUSINESS|ECONOM)\b/.test(
      normalize(`${program.code || ''} ${program.nom_fr || ''} ${program.secteur || ''}`),
    )
  ) {
    return 'encg-program-domain-mismatch'
  }
  if (schoolCity && programCity && schoolCity !== programCity && programFamily && schoolFamily && schoolFamily === programFamily) return 'same-family-city-mismatch'
  if (isEnsaOrEngineeringSchool(school) && /DUT|BTS|MASTER SCIENCES POLITIQUES/.test(normalize(program?.nom_fr || ''))) return 'engineering-school-program-mismatch'
  return ''
}

const badRecruitmentReason = (program, job) => {
  if (program?.type !== 'FILIERE' || job?.type !== 'METIER') return ''
  const programText = normalize(`${program?.code || ''} ${program?.nom_fr || ''} ${program?.secteur || ''}`)
  const jobText = normalize(`${job?.code || ''} ${job?.nom_fr || ''}`)
  if (isBacPlus2(program) && isEngineerJob(job)) return 'bac-plus-2-to-engineer-job'
  if (isLicenceLike(program) && isEngineerJob(job)) return 'licence-to-engineer-job'
  if (isGeneralDoctorJob(job) && !isGeneralMedicineProgram(program)) return 'job-domain-general-medicine-mismatch'
  if (isDentistJob(job) && !isDentalProgram(program)) return 'job-domain-dentistry-mismatch'
  if (isPharmacistJob(job) && !isPharmacyProgram(program)) return 'job-domain-pharmacy-mismatch'
  if (/SYSTEMES D INFORMATION.*FINANCE.*CONTROLE|FINANCE.*CONTROLE/.test(programText) && /CONTROLEUR DE GESTION|AUDITEUR SI/.test(jobText)) return ''
  if (isFinanceJob(job) && !isFinanceProgram(program)) return 'job-domain-finance-mismatch'
  if (isTechJob(job) && !isTechProgram(program)) return 'job-domain-tech-mismatch'
  if (isTeachingJob(job) && !isTeachingProgram(program)) return 'job-domain-teaching-mismatch'
  return ''
}

const badAdmissionReason = (source, target) => {
  if (!isBacSource(source) || !['FILIERE', 'ETABLISSEMENT'].includes(target?.type)) return ''

  const bacCode = normalize(source.code || '').replace(/\s+/g, '_')
  const targetText = normalize(`${target?.code || ''} ${target?.nom_fr || ''} ${target?.secteur || ''}`)
  const healthBacs = new Set(['BAC_SM', 'BAC_PC', 'BAC_SVT', 'BAC_SE', 'BAC_AGR'])
  const techBacs = new Set(['BAC_SM', 'BAC_PC', 'BAC_SVT', 'BAC_SE', 'BAC_TECH_ELEC', 'BAC_TECH_MECA', 'BAC_TECH_CIVIL'])
  if (/\b(FMP|FMPR|FMD|MEDECINE|PHARMACIE|DENTAIRE|SANTE|UM6SS)\b/.test(targetText) && !healthBacs.has(bacCode)) {
    return 'admission-health-bac-mismatch'
  }

  if (/\b(DATA|INFORMATIQUE|CYBER|RESEAUX|LOGICIEL|GENIE|INGENIEUR|ENSA|ENSIAS|EMI|EHTP|INPT|ENSAM|IAV|INSEA|TELECOM)\b/.test(targetText) && !techBacs.has(bacCode)) {
    return 'admission-tech-bac-mismatch'
  }

  if (/\b(ENCG|FINANC|COMPTA|AUDIT|GESTION|COMMERCE|MARKETING|MANAGEMENT|BUSINESS|BANQUE|ASSURANCE)\b/.test(targetText) && /BAC_(PRO_SERV_REST|AGR|TECH_CIVIL|TECH_ELEC|TECH_MECA)$/.test(bacCode)) {
    return 'admission-finance-bac-mismatch'
  }

  return ''
}

const badProgramAccessReason = (source, target) => {
  if (source?.type !== 'FILIERE' || target?.type !== 'FILIERE') return ''
  if (/DOCTORAT|DOCTEUR|PHD|DBA/.test(normalize(`${target?.code || ''} ${target?.nom_fr || ''}`)) && !isMasterLike(source) && !isEnsaOrEngineeringSchool(source)) {
    return 'direct-access-to-research-doctorate'
  }
  if (isLifeScienceProgram(source) && isAdvancedAiOrDataProgram(target) && !isBioTechBridgeProgram(source) && !isBioTechBridgeProgram(target)) {
    return 'life-science-to-ai-data-master-mismatch'
  }
  return ''
}

const nodes = await readJson(nodesPath)
const edges = await readJson(edgesPath)
const byId = new Map(nodes.map((node) => [node.id, node]))

const badEdges = []
for (const edge of edges) {
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  if (!source || !target) continue

  if (isSchool(source) && isSchool(target)) {
    badEdges.push({ reason: 'school-to-school-transition', edge, school: source, program: target })
  }

  if (edge.type_lien === 'OFFERTE_PAR' && isSchool(source) && isProgram(target)) {
    const reason = hasSchoolProgramMismatch(source, target)
    if (reason) badEdges.push({ reason, edge, school: source, program: target })
  }

  if (edge.type_lien === 'OFFERTE_PAR' && isProgram(source) && isSchool(target)) {
    const reason = hasSchoolProgramMismatch(target, source)
    if (reason) badEdges.push({ reason, edge, school: source, program: target })
  }

  if (isBacOrLevel(source) && isProgram(target) && isMasterLike(target)) {
    badEdges.push({ reason: 'direct-bac-to-master', edge, school: source, program: target })
  }

  if (edge.type_lien === 'DONNE_ACCES') {
    const reason = badAdmissionReason(source, target) || badProgramAccessReason(source, target)
    if (reason) badEdges.push({ reason, edge, school: source, program: target })
  }

  if (isProgram(source) && isJob(target)) {
    const reason = badRecruitmentReason(source, target)
    if (reason) badEdges.push({ reason, edge, school: source, program: target })
  }

  if (isJob(source) && !['METIER'].includes(target?.type)) {
    badEdges.push({ reason: 'job-as-source', edge, school: source, program: target })
  }
}

const samples = badEdges.slice(0, 40).map(({ reason, school, program }) => ({
  reason,
  fromType: school.type,
  from: school.code,
  fromName: school.nom_fr,
  fromCity: school.ville,
  toType: program.type,
  to: program.code,
  toName: program.nom_fr,
  toCity: program.ville,
}))

const byReason = Object.fromEntries(
  [...badEdges.reduce((map, item) => map.set(item.reason, (map.get(item.reason) || 0) + 1), new Map())]
    .sort((a, b) => a[0].localeCompare(b[0])),
)

console.log(JSON.stringify({ nodes: nodes.length, edges: edges.length, suspiciousEdges: badEdges.length, byReason, samples }, null, 2))
