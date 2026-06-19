import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodesPath = path.join(dataDir, 'nodes_all.json')
const edgesPath = path.join(dataDir, 'edges.json')
const reportPath = path.join(root, 'tools', 'data-quality-report.json')

const readJson = async (file) => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
const writeJson = async (file, value) => fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')

const decodePercentRepeated = (value = '') => {
  let current = String(value)
  for (let i = 0; i < 4; i += 1) {
    try {
      const decoded = decodeURIComponent(current)
      if (decoded === current) break
      current = decoded
    } catch {
      break
    }
  }
  return current
}

const normalizeText = (value = '') =>
  String(value)
    .replace(/Ã©/g, 'e')
    .replace(/Ã¨/g, 'e')
    .replace(/Ãª/g, 'e')
    .replace(/Ã«/g, 'e')
    .replace(/Ã /g, 'a')
    .replace(/Ã¢/g, 'a')
    .replace(/Ã´/g, 'o')
    .replace(/Ã®/g, 'i')
    .replace(/Ã¯/g, 'i')
    .replace(/Ã§/g, 'c')
    .replace(/Ã¹/g, 'u')
    .replace(/Ã»/g, 'u')
    .replace(/â€™/g, "'")
    .replace(/â€“|â€”/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

const stripAccentsAscii = (value = '') =>
  normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const hasEncodedGarbage = (value = '') => /%[0-9a-f]{2}|25D8|25D9|25EF|25BA|25BB/i.test(String(value))
const hasArabic = (value = '') => /[\u0600-\u06FF]/.test(String(value))
const genericLabels = /^(metiers?|fiches metiers?|tests metiers?|formations?|secteurs? de formation|orientation|accueil)$/i

const normalizeForMatch = (value = '') => stripAccentsAscii(value).toUpperCase()

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

const cityFromText = (value = '') => {
  const source = normalizeForMatch(value).replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  return (
    cityNames.find((city) => {
      const cityPattern = escapeRegExp(normalizeForMatch(city)).replace(/\s+/g, '\\s+')
      return new RegExp(`(^|\\s)${cityPattern}(\\s|$)`).test(source)
    }) || ''
  )
}

const inferCity = (node) => cityFromText(`${node.code || ''} ${node.nom_fr || ''}`) || cleanLabel(node.ville || '')

const inferSchoolPart = (node) => {
  const label = cleanLabel(node.nom_fr || '')
  const parts = label.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean)
  if (parts.length > 1) return parts.slice(1).join(' - ')
  return ''
}

const compactMatch = (value = '') => normalizeForMatch(value).replace(/[^A-Z0-9]+/g, '')

const family = (nodeOrText) => {
  const text =
    typeof nodeOrText === 'string'
      ? normalizeForMatch(nodeOrText)
      : normalizeForMatch(`${nodeOrText?.code || ''} ${nodeOrText?.nom_fr || ''}`)
  const spacedText = text.replace(/_/g, ' ')

  if (/ENCG|ECOLE NATIONALE DE COMMERCE/.test(spacedText)) return 'ENCG'
  if (/ECOLE SUPERIEURE DE TECHNOLOGIE|\bEST\b/.test(spacedText)) return 'EST'
  if (/ISCAE|INSTITUT SUPERIEUR DE COMMERCE/.test(spacedText)) return 'ISCAE'
  if (/ISGA/.test(spacedText)) return 'ISGA'
  if (/\bIGA\b/.test(spacedText)) return 'IGA'
  if (/EMSI/.test(spacedText)) return 'EMSI'
  if (/FSJES|SCIENCES JURIDIQUES.*ECONOMIQUES/.test(spacedText)) return 'FSJES'
  if (/FST|FACULTE DES SCIENCES ET TECHNIQUES/.test(spacedText)) return 'FST'
  if (
    /ENSA|ENSIAS|ENSEM|EMI|EHTP|ENSMR|INPT|ENSAM|IAV|INSEA|ECOLE NATIONALE DES SCIENCES APPLIQUEES|ECOLE NATIONALE SUPERIEURE D ELECTRICITE|ECOLE NATIONALE SUPERIEURE D MECANIQUE|ECOLE NATIONALE SUPERIEURE D INFORMATIQUE|ECOLE NATIONALE SUPERIEURE DES MINES|ECOLE MOHAMMADIA D INGENIEURS/.test(
      spacedText,
    )
  )
    return 'ENGINEERING'
  if (/FACULTE DES SCIENCES AIN|FACULTE DES SCIENCES CASABLANCA|FACULTE DES SCIENCES\b/.test(spacedText)) return 'FS'
  if (/FACULTE|UNIVERSITE/.test(spacedText)) return 'UNIVERSITE'
  return ''
}

const programNameOnly = (node) => cleanLabel(node?.nom_fr || '').split(/\s+-\s+/)[0] || cleanLabel(node?.nom_fr || '')

const isBacSeries = (node) => node?.type === 'FILIERE' && /^BAC_/i.test(node.code || '')
const isMasterLike = (node) => /\b(MASTER|MASTERE|MBA)\b/i.test(normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''}`))
const isBacPlus2 = (node) => /\b(DUT|BTS|DEUST|CPGE)\b/.test(normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''}`))
const isLicenceLike = (node) =>
  /\b(LICENCE|LICENCE PROFESSIONNELLE|BAC\+3|BACHELOR)\b/.test(normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''}`).replace(/_/g, ' '))
const isEngineeringSchool = (node) =>
  /ENSA|ENSIAS|ENSEM|EMI|EHTP|ENSMR|INPT|ENSAM|IAV|INSEA|ECOLE NATIONALE SUPERIEURE D ELECTRICITE|ECOLE NATIONALE SUPERIEURE D MECANIQUE|ECOLE NATIONALE SUPERIEURE DES MINES|ECOLE NATIONALE DES SCIENCES APPLIQUEES/.test(
    normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''}`).replace(/_/g, ' '),
  )
const isBacSource = (node) => node?.type === 'FILIERE' && /^BAC_/i.test(node.code || '')
const isEngineerJob = (node) =>
  /\b(INGENIEUR|ENGINEER|ARCHITECTE LOGICIEL|DATA SCIENTIST|DATA ENGINEER)\b/.test(
    normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''}`).replace(/_/g, ' '),
  )
const isFinanceJob = (node) =>
  /\b(AUDITEUR|FINANCIER|COMPTABLE|COMPTABILITE|CONTROLEUR DE GESTION|EXPERT COMPTABLE|ANALYSTE FINANCIER)\b/.test(
    normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''}`),
  ) &&
  !/\b(AUDITEUR SI|AUDITEUR QUALITE|QUALITE|SYSTEME D INFORMATION)\b/.test(normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''}`).replace(/_/g, ' '))
const isTechJob = (node) =>
  /\b(DATA|DEVELOPPEUR|INFORMATIQUE|CYBER|RESEAUX|LOGICIEL|FULL STACK|GENIE INFORMATIQUE|SECURITE INFORMATIQUE|AUDITEUR SI|SYSTEME D INFORMATION)\b/.test(
    normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''}`),
  )
const isTeachingJob = (node) => /\b(ENSEIGNANT|PROFESSEUR)\b/.test(normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''}`))
const isResearchJob = (node) =>
  /\b(CHERCHEUR|RECHERCHE|PROFESSEUR UNIVERSITAIRE|ENSEIGNANT CHERCHEUR|SCIENTIFIQUE)\b/.test(
    normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''}`).replace(/_/g, ' '),
  )
const isGeneralDoctorJob = (node) => /\bMEDECIN_GENERALISTE\b|MEDECIN GENERALISTE/.test(normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''}`))
const isDentistJob = (node) => /\b(DENTISTE|CHIRURGIEN DENTISTE|MEDECIN DENTISTE)\b/.test(normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''}`).replace(/_/g, ' '))
const isPharmacistJob = (node) => /\b(PHARMACIEN|PHARMACIEN INDUSTRIEL)\b/.test(normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''}`).replace(/_/g, ' '))

const isFinanceProgram = (node) =>
  /\b(FINANC|COMPTA|AUDIT|CONTROLE DE GESTION|GESTION COMPTABLE|BANQUE|ASSURANCE|ACCOUNTING|DAF|FISCAL|EXPERTISE COMPTABLE|GENIE FINANCIER)\b/.test(
    normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`),
  ) &&
  !/\b(MARKETING|COMMUNICATION|LOGISTIQUE|SUPPLY|RESSOURCES HUMAINES|RH|TOURISME|SCIENCES POLITIQUES|DROIT INTERNATIONAL|E COMMERCE)\b/.test(
    normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`),
  )
const isTechProgram = (node) =>
  /\b(INFORMATIQUE|DATA|CYBER|RESEAUX|LOGICIEL|SYSTEME D INFORMATION|INTELLIGENCE ARTIFICIELLE|GENIE INFORMATIQUE|DIGITAL|TELECOM|STATISTIQUE|MATHEMATIQUE|ENSIAS|ENSA|EMSI|INPT)\b/.test(
    normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`),
  )
const isLifeScienceProgram = (node) =>
  /\b(SVT|SCIENCES DE LA VIE|BIOLOGIE|BIOTECH|SANTE|MEDECINE|PHARMACIE|DENTAIRE|VETERINAIRE|INFIRMIER|KINESITHERAPIE|ORTHOPHONIE)\b/.test(
    normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`),
  )
const isBioTechBridgeProgram = (node) =>
  /\b(BIOINFORMATIQUE|BIOSTATISTIQUE|BIOMEDICAL|INFORMATIQUE MEDICALE|DATA SANTE|HEALTH DATA)\b/.test(
    normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`),
  )
const isAdvancedAiOrDataProgram = (node) =>
  isMasterLike(node) &&
  /\b(DATA|INTELLIGENCE ARTIFICIELLE|IA|MACHINE LEARNING|BIG DATA|GENIE INFORMATIQUE|INFORMATIQUE|CYBER|LOGICIEL)\b/.test(
    normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`),
  )
const isTeachingProgram = (node) =>
  /\b(ENSEIGNEMENT|ENSEIGNEMENT SUPERIEUR|RECHERCHE|DOCTORAT|EDUCATION|PEDAGOG|DIDACTIQUE|LETTRES|LANGUE|ARABE|FRANCAIS|ANGLAIS|HISTOIRE|GEOGRAPHIE|MATHEMATIQUE|PHYSIQUE|SVT)\b/.test(
    normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`),
  )

const isGeneralMedicineProgram = (node) => {
  const text = normalizeForMatch(`${node?.code || ''} ${programNameOnly(node)} ${node?.secteur || ''}`)
  return (
    /DOCTORAT_MEDECINE|DOCTORAT EN MEDECINE|DOCTEUR EN MEDECINE|DIPLOME DE DOCTEUR EN MEDECINE|DIPLOME D ETAT DE DOCTEUR EN MEDECINE/.test(text) &&
    !/VETERINAIRE|DENTAIRE|PHARMACIE|BIOTECH|LICENCE|MASTER|INFIRMIER|KINESITHERAPIE|ORTHOPHONIE|SAGE FEMME/.test(text)
  )
}

const isDentalProgram = (node) => {
  const text = normalizeForMatch(`${node?.code || ''} ${programNameOnly(node)} ${node?.secteur || ''}`).replace(/_/g, ' ')
  return /MEDECINE DENTAIRE|DOCTEUR EN MEDECINE DENTAIRE|CHIRURGIE DENTAIRE/.test(text) && !/PROTHESE|ASSISTANT|HYGIENE/.test(text)
}

const isPharmacyProgram = (node) => {
  const text = normalizeForMatch(`${node?.code || ''} ${programNameOnly(node)} ${node?.secteur || ''}`).replace(/_/g, ' ')
  return /(DOCTORAT|DOCTEUR|DIPLOME).{0,30}PHARMACIE|PHARMACIEN/.test(text) && !/PREPARATEUR|ASSISTANT/.test(text)
}

const isResearchDoctorateProgram = (node) => {
  const text = normalizeForMatch(`${node?.code || ''} ${programNameOnly(node)} ${node?.secteur || ''}`).replace(/_/g, ' ')
  return /\b(DOCTORAT|DOCTEUR|PHD|DBA)\b/.test(text) && !isGeneralMedicineProgram(node) && !isDentalProgram(node) && !isPharmacyProgram(node)
}

const privateSchoolPattern =
  /\b(UM6SS|UM6P|MUNDIAPOLIS|ISGA|IGA|EMSI|HEM|SUP'?RH|VATEL|ADALIA|MATCI|OSTELEA|ISIAM|ESCA|HECI|UIR|UPM|UNIVERSITE INTERNATIONALE DE RABAT|UNIVERSITE PRIVEE|ECOLE PRIVEE|INSTITUT PRIVE|ECOLE MOHAMMED VI DE MEDECINE VETERINAIRE|EM6MV|EGE|ECOLE DE GUERRE ECONOMIQUE|ABULCASIS|FPMM|ESGB|IHE PARIS|SUPMTI|HESTIM|ISFORT|UIC)\b/

const publicSchoolPattern =
  /\b(FSJES|FACULTE|UNIVERSITE HASSAN|UNIVERSITE MOHAMMED|UNIVERSITE IBN|UNIVERSITE SIDI|UNIVERSITE CADI|UNIVERSITE ABDELMALEK|ENCG|ENSA|ECOLE NATIONALE DES SCIENCES APPLIQUEES|ENSAM|ENSIAS|ENSEM|ECOLE NATIONALE SUPERIEURE D ELECTRICITE|ECOLE NATIONALE SUPERIEURE DES MINES|EMI|EHTP|ENSMR|INPT|INSEA|IAV|EST|FST|FLSH|ISCAE|INSTITUT SUPERIEUR DE COMMERCE)\b/

const isPrivateEducationNode = (node) =>
  ['FILIERE', 'ETABLISSEMENT'].includes(node?.type) &&
  privateSchoolPattern.test(normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.description || ''}`))

const isPublicEducationNode = (node) =>
  ['FILIERE', 'ETABLISSEMENT'].includes(node?.type) &&
  publicSchoolPattern.test(normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.description || ''}`)) &&
  !isPrivateEducationNode(node)

const estimatePrivateAnnualCost = (node) => {
  const text = normalizeForMatch(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.description || ''} ${node?.secteur || ''}`)
  if (/MEDECINE|DENTAIRE|PHARMACIE/.test(text)) return 90000
  if (/SANTE|INFIRMIER|KINESITHERAPIE|ORTHOPHONIE|ORTHOPTIE|PSYCHOMOTRICITE|SAGE FEMME|RADIOLOGIE/.test(text)) return 60000
  if (/INGENIEUR|INFORMATIQUE|DATA|CYBER|RESEAUX|GENIE|EMSI|HESTIM|SUPMTI/.test(text)) return 55000
  if (/BUSINESS|MANAGEMENT|COMMERCE|MARKETING|FINANCE|COMPTA|AUDIT|MBA|HEM|ISGA|IGA|MUNDIAPOLIS|ESCA/.test(text)) return 45000
  return 35000
}

const estimatePrivateProgramCost = (node) => {
  const months = Number(node?.duree_mois || 0)
  const years = Math.max(1, Math.ceil(months / 12))
  return estimatePrivateAnnualCost(node) * years
}

const isFsjesCompatibleProgram = (program) => {
  const text = normalizeForMatch(`${program?.code || ''} ${program?.nom_fr || ''} ${program?.secteur || ''}`)
  if (/\b(SCIENCES DE LA VIE|SVI|BIOLOGIE|ETUDES ARABES|MATHEMATIQUE|PHYSIQUE|CHIMIE|INFORMATIQUE PURE|GENIE)\b/.test(text)) return false
  return /\b(DROIT|JURIDIQUE|ECONOM|GESTION|COMMERCE|FINANC|COMPTA|AUDIT|BANQUE|ASSURANCE|MANAGEMENT|ADMINISTRATION|SCIENCES POLITIQUES|RELATIONS INTERNATIONALES|FISCAL|MARKETING|TOURISTIQUE|ORGANISATION|DEVELOPPEMENT|AUTORITE LOCALE|FONCIER|AFFAIRES)\b/.test(text)
}

const isIavCompatibleProgram = (program) => {
  const text = normalizeForMatch(`${program?.code || ''} ${program?.nom_fr || ''} ${program?.secteur || ''}`).replace(/_/g, ' ')
  if (isGeneralMedicineProgram(program) || isDentalProgram(program) || isPharmacyProgram(program)) return false
  return /\b(VETERINAIRE|AGRONOM|AGRO|HALIEUTIQUE|FOREST|EAU|ENVIRONNEMENT|RURAL|HORTICOLE|ZOOTECHNIE|PROTECTION DES PLANTES|INDUSTRIES AGRICOLES|BIOTECHNOLOGIE VEGETALE)\b/.test(text)
}

const hasOfferMismatch = (program, school) => {
  if (program?.type !== 'FILIERE' || school?.type !== 'ETABLISSEMENT') return false

  const programText = normalizeForMatch(`${program.code || ''} ${program.nom_fr || ''} ${program.secteur || ''}`)
  const schoolText = normalizeForMatch(`${school.code || ''} ${school.nom_fr || ''} ${school.secteur || ''}`)
  const explicitPrivateBrand = ['EMSI', 'HEC', 'ISGA', 'IGA', 'HEM', 'ESCA', 'MUNDIAPOLIS', 'GROUPE IGS', 'SUPMTI', 'HESTIM', 'ISFORT'].find(
    (brand) => programText.includes(brand),
  )
  if (explicitPrivateBrand && !schoolText.includes(explicitPrivateBrand)) return true

  const embeddedSchool = inferSchoolPart(program)
  const schoolFamily = family(school)
  const embeddedFamily = family(embeddedSchool)
  const programFamily = family(program)
  const schoolCity = inferCity(school)
  const programCity = inferCity(program)
  const embeddedCity = cityFromText(embeddedSchool)

  if (
    schoolFamily === 'FST' &&
    (programFamily === 'FST' || embeddedFamily === 'FST') &&
    (!programCity || !schoolCity || programCity === schoolCity) &&
    (!embeddedCity || !schoolCity || embeddedCity === schoolCity)
  ) {
    return false
  }

  if (embeddedFamily && schoolFamily && embeddedFamily !== schoolFamily) return true
  if (programFamily && schoolFamily && programFamily !== schoolFamily && !['UNIVERSITE', 'FS'].includes(schoolFamily)) return true
  if (embeddedCity && schoolCity && embeddedCity !== schoolCity) return true
  if (programFamily && schoolFamily && programFamily === schoolFamily && programCity && schoolCity && programCity !== schoolCity) return true
  if (schoolFamily === 'FSJES' && !isFsjesCompatibleProgram(program)) return true
  if (/\b(IAV|AGRONOMIQUE|VETERINAIRE)\b/.test(schoolText.replace(/_/g, ' ')) && !isIavCompatibleProgram(program)) return true

  if (embeddedSchool && !(embeddedFamily && schoolFamily && embeddedFamily === schoolFamily)) {
    const schoolCompact = compactMatch(school.nom_fr || school.code || '')
    const embeddedCompact = compactMatch(embeddedSchool)
    if (schoolCompact.length > 10 && embeddedCompact.length > 10 && !schoolCompact.includes(embeddedCompact) && !embeddedCompact.includes(schoolCompact)) {
      return true
    }
  }

  if (schoolFamily === 'ENCG' && isBacPlus2(program)) return true
  if (isEngineeringSchool(school) && isBacPlus2(program)) return true
  if (
    isEngineeringSchool(school) &&
    /\b(MARKETING|COMMERCE|GESTION|BUSINESS|RH|RESSOURCES HUMAINES)\b/.test(
      normalizeForMatch(`${program.code || ''} ${program.nom_fr || ''} ${program.secteur || ''}`),
    )
  ) {
    return true
  }
  if (
    schoolFamily === 'ENCG' &&
    !/\b(ENCG|COMMERCE|GESTION|MANAGEMENT|MARKETING|FINANC|COMPTA|AUDIT|LOGISTIQUE|SUPPLY|RH|RESSOURCES HUMAINES|BUSINESS|ECONOM)\b/.test(
      normalizeForMatch(`${program.code || ''} ${program.nom_fr || ''} ${program.secteur || ''}`),
    )
  ) {
    return true
  }
  return false
}

const isBadRecruitment = (program, job) => {
  if (program?.type !== 'FILIERE' || job?.type !== 'METIER') return false
  if (isBacPlus2(program) && isEngineerJob(job)) return true
  if (isLicenceLike(program) && isEngineerJob(job)) return true
  if (isGeneralDoctorJob(job) && !isGeneralMedicineProgram(program)) return true
  if (isDentistJob(job) && !isDentalProgram(program)) return true
  if (isPharmacistJob(job) && !isPharmacyProgram(program)) return true
  if (isResearchDoctorateProgram(program) && !isResearchJob(job) && !isTeachingJob(job)) return true
  if (isFinanceJob(job) && !isFinanceProgram(program)) return true
  if (isTechJob(job) && !isTechProgram(program)) return true
  if (isTeachingJob(job) && !isTeachingProgram(program)) return true
  return false
}

const isBadAdmission = (source, target) => {
  if (!isBacSource(source) || !['FILIERE', 'ETABLISSEMENT'].includes(target?.type)) return false

  const bacCode = normalizeForMatch(source.code || '')
  const targetText = normalizeForMatch(`${target?.code || ''} ${target?.nom_fr || ''} ${target?.secteur || ''}`).replace(/_/g, ' ')
  const healthBacs = new Set(['BAC_SM', 'BAC_PC', 'BAC_SVT', 'BAC_SE', 'BAC_AGR'])
  const techBacs = new Set(['BAC_SM', 'BAC_PC', 'BAC_SVT', 'BAC_SE', 'BAC_TECH_ELEC', 'BAC_TECH_MECA', 'BAC_TECH_CIVIL'])
  const isHealthTarget = /\b(FMP|FMPR|FMD|MEDECINE|PHARMACIE|DENTAIRE|SANTE|UM6SS)\b/.test(targetText)
  if (isHealthTarget && !healthBacs.has(bacCode)) return true

  const isTechTarget = /\b(DATA|INFORMATIQUE|CYBER|RESEAUX|LOGICIEL|GENIE|INGENIEUR|ENSA|ENSIAS|EMI|EHTP|INPT|ENSAM|IAV|INSEA|TELECOM)\b/.test(targetText)
  if (isTechTarget && !techBacs.has(bacCode)) return true

  const isFinanceTarget = /\b(ENCG|FINANC|COMPTA|AUDIT|GESTION|COMMERCE|MARKETING|MANAGEMENT|BUSINESS|BANQUE|ASSURANCE)\b/.test(targetText)
  if (isFinanceTarget && /BAC_(PRO_SERV_REST|AGR|TECH_CIVIL|TECH_ELEC|TECH_MECA)$/.test(bacCode)) return true

  return false
}

const isBadProgramAccess = (source, target) => {
  if (source?.type !== 'FILIERE' || target?.type !== 'FILIERE') return false
  if (isResearchDoctorateProgram(target) && !isMasterLike(source) && !isEngineeringSchool(source)) return true
  if (isLifeScienceProgram(source) && isAdvancedAiOrDataProgram(target) && !isBioTechBridgeProgram(source) && !isBioTechBridgeProgram(target)) return true
  return false
}

const isBadSchoolProgressionShortcut = (source, target) => {
  const sourceCode = normalizeForMatch(source?.code || '')
  const targetCode = normalizeForMatch(target?.code || '')
  if (sourceCode === '3AC' && targetCode !== 'TC') return true
  if (sourceCode === 'TC' && targetCode.startsWith('BAC_')) return true
  return false
}

const inferHealthDescription = (node) => {
  if (node.type !== 'FILIERE') return ''

  const label = cleanLabel(node.nom_fr || '')
  const programName = label.split(/\s+-\s+/)[0] || label
  const text = normalizeForMatch(programName).replace(/_/g, ' ')
  if (!/(MEDECINE|PHARMACIE)/.test(text)) return ''

  const school = inferSchoolPart(node)
  const city = inferCity(node)
  const location = [school, city && !normalizeForMatch(school).includes(normalizeForMatch(city)) ? city : '']
    .filter(Boolean)
    .join(', ')

  if (text.includes('MEDECINE DENTAIRE')) {
    return `Doctorat en medecine dentaire${location ? ` propose par ${location}` : ''}. Duree consolidee: 6 ans apres bac.`
  }

  if (text.includes('MEDECINE VETERINAIRE')) {
    return `Doctorat en medecine veterinaire${location ? ` propose par ${location}` : ''}. Duree consolidee: 6 ans apres bac.`
  }

  if (text.includes('PHARMACIE')) {
    return `Doctorat en pharmacie${location ? ` propose par ${location}` : ''}. Duree consolidee: 6 ans apres bac.`
  }

  if (text.includes('MEDECINE')) {
    return `Diplome de docteur en medecine${location ? ` propose par ${location}` : ''}. Duree consolidee: 7 ans apres bac.`
  }

  return ''
}

const isBadMetier = (node) => {
  const label = stripAccentsAscii(decodePercentRepeated(node.nom_fr || ''))
  if (!node.code || !label) return true
  if (hasEncodedGarbage(`${node.code} ${node.nom_fr}`)) return true
  if (hasArabic(decodePercentRepeated(node.nom_fr))) return true
  if (!/[A-Za-z]{3}/.test(label)) return true
  if (genericLabels.test(label)) return true
  return false
}

const isBadSchool = (node) =>
  node.type === 'ETABLISSEMENT' &&
  /^SCRAPE_9RAYTI_ECOLE_/i.test(node.code || '') &&
  /(?:_ACTUALITE|_INSCRIPTION)$/i.test(node.code || '')

const cleanDescription = (value = '', node) => {
  const healthDescription = inferHealthDescription(node)
  if (healthDescription) return healthDescription

  let text = normalizeText(value)

  text = text.replace(/Source:\s*https?:\/\/(?:www\.)?([^/\s?#]+)[^\s]*/gi, (_, domain) => `Source: ${domain}`)
  text = text.replace(/https?:\/\/(?:www\.)?([^/\s?#]+)[^\s]*/gi, (_, domain) => domain)
  text = decodePercentRepeated(text)
  text = normalizeText(text)
    .replace(/[\u0600-\u06FF]+/g, ' ')
    .replace(/%[0-9a-f]{2}/gi, ' ')
    .replace(/\s+\./g, '.')
    .replace(/(?:\.\s*){2,}/g, '. ')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text || text === '.' || text.length < 8) {
    if (node.type === 'METIER') return `Metier du secteur ${node.secteur || 'orientation'}.`
    if (node.type === 'FILIERE') return `Formation du secteur ${node.secteur || 'orientation'}.`
    if (node.type === 'ETABLISSEMENT') return `Etablissement du secteur ${node.secteur || 'enseignement superieur'}.`
  }

  return text
}

const cleanLabel = (value = '') => {
  const decoded = decodePercentRepeated(value)
  return stripAccentsAscii(decoded).replace(/%[0-9a-f]{2}/gi, ' ').replace(/\s+/g, ' ').trim()
}

const nodes = await readJson(nodesPath)
const edges = await readJson(edgesPath)

const report = {
  nodesBefore: nodes.length,
  edgesBefore: edges.length,
  nodesRemoved: 0,
  edgesRemoved: 0,
  nodesCleaned: 0,
  descriptionsCleaned: 0,
  labelsCleaned: 0,
  healthDescriptionsCorrected: 0,
  citiesCorrected: 0,
  privateCostsCorrected: 0,
  coherenceEdgesRemoved: 0,
  schoolToSchoolEdgesRemoved: 0,
}

const removedIds = new Set()
const keptNodes = []

for (const node of nodes) {
  if ((node.type === 'METIER' && isBadMetier(node)) || isBadSchool(node)) {
    removedIds.add(node.id)
    report.nodesRemoved += 1
    continue
  }

  let changed = false

  for (const key of ['nom_fr', 'secteur', 'ville']) {
    if (typeof node[key] !== 'string') continue
    const cleaned = cleanLabel(node[key])
    if (cleaned && cleaned !== node[key]) {
      node[key] = cleaned
      changed = true
      report.labelsCleaned += 1
    }
  }

  const inferredCity = cityFromText(`${node.code || ''} ${node.nom_fr || ''}`)
  if (inferredCity && node.ville !== inferredCity && ['FILIERE', 'ETABLISSEMENT'].includes(node.type)) {
    node.ville = inferredCity
    changed = true
    report.citiesCorrected += 1
  } else if (!inferredCity && node.type === 'FILIERE' && node.ville) {
    node.ville = null
    changed = true
    report.citiesCorrected += 1
  }

  if (typeof node.description === 'string') {
    const cleaned = cleanDescription(node.description, node)
    if (cleaned !== node.description) {
      if (inferHealthDescription(node)) report.healthDescriptionsCorrected += 1
      node.description = cleaned
      changed = true
      report.descriptionsCleaned += 1
    }
  }

  if (node.type === 'FILIERE' && isPrivateEducationNode(node) && Number(node.cout_estime || 0) <= 0) {
    node.cout_estime = estimatePrivateProgramCost(node)
    changed = true
    report.privateCostsCorrected += 1
  }

  if (node.type === 'FILIERE' && isPublicEducationNode(node) && Number(node.cout_estime || 0) > 0) {
    node.cout_estime = 0
    changed = true
    report.privateCostsCorrected += 1
  }

  if (node.type === 'FILIERE') {
    const nodeText = normalizeForMatch(`${node.code || ''} ${node.nom_fr || ''} ${node.secteur || ''}`)
    const programText = normalizeForMatch(`${String(node.nom_fr || '').split(/\s+-\s+/)[0]} ${node.secteur || ''}`).replace(/_/g, ' ')
    let expectedDuration = null
    if (/\b(EXPERTISE COMPTABLE|DNEC|D N E C|CYCLE D EXPERTISE)\b/.test(nodeText.replace(/_/g, ' '))) expectedDuration = 36
    else if (/\b(DUT|BTS|DEUST|CPGE)\b/.test(nodeText)) expectedDuration = 24
    else if (/\b(LICENCE|BAC\+3)\b/.test(nodeText)) expectedDuration = 36
    else if (/\b(MASTER|MASTERE|MBA)\b/.test(nodeText)) expectedDuration = 24
    else if (/\b(BAC\+5|DIPLOME ENCG|INGENIEUR)\b/.test(nodeText)) expectedDuration = 60
    else if (/MEDECINE DENTAIRE|PHARMACIE/.test(programText)) expectedDuration = 72
    else if (/DOCTORAT.*MEDECINE|DOCTEUR EN MEDECINE|DIPLOME DE DOCTEUR EN MEDECINE/.test(programText)) expectedDuration = 84
    else if (/\b(DOCTORAT|PHD|DBA)\b/.test(programText)) expectedDuration = 96

    if (expectedDuration !== null && Number(node.duree_mois || 0) !== expectedDuration) {
      node.duree_mois = expectedDuration
      changed = true
      report.nodesCleaned += 1
    }
  }

  if (changed) report.nodesCleaned += 1
  keptNodes.push(node)
}

const keptEdges = edges.filter((edge) => {
  if (!removedIds.has(edge.source_id) && !removedIds.has(edge.target_id)) return true
  report.edgesRemoved += 1
  return false
})

const validIds = new Set(keptNodes.map((node) => node.id))
const byId = new Map(keptNodes.map((node) => [node.id, node]))
const privateOfferedProgramIds = new Set(
  keptEdges
    .filter((edge) => {
      const source = byId.get(edge.source_id)
      const target = byId.get(edge.target_id)
      return edge.type_lien === 'OFFERTE_PAR' && source?.type === 'FILIERE' && target?.type === 'ETABLISSEMENT' && isPrivateEducationNode(target)
    })
    .map((edge) => edge.source_id),
)

for (const edge of keptEdges) {
  if (edge.type_lien !== 'OFFERTE_PAR') continue
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  if (source?.type === 'FILIERE' && target?.type === 'ETABLISSEMENT' && isPrivateEducationNode(target) && Number(source.cout_estime || 0) <= 0) {
    source.cout_estime = estimatePrivateProgramCost(source)
    report.privateCostsCorrected += 1
    report.nodesCleaned += 1
  }
  if (
    source?.type === 'FILIERE' &&
    target?.type === 'ETABLISSEMENT' &&
    isPublicEducationNode(target) &&
    !isPrivateEducationNode(source) &&
    !privateOfferedProgramIds.has(source.id) &&
    Number(source.cout_estime || 0) > 0
  ) {
    source.cout_estime = 0
    report.privateCostsCorrected += 1
    report.nodesCleaned += 1
  }
}

const compactedEdges = []
const edgeKeys = new Set()
for (const edge of keptEdges) {
  if (!validIds.has(edge.source_id) || !validIds.has(edge.target_id)) {
    report.edgesRemoved += 1
    continue
  }
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  const isSchoolToSchool = source?.type === 'ETABLISSEMENT' && target?.type === 'ETABLISSEMENT'

  if (
    isSchoolToSchool ||
    (edge.type_lien === 'DONNE_ACCES' && isBadSchoolProgressionShortcut(source, target)) ||
    (edge.type_lien === 'OFFERTE_PAR' && hasOfferMismatch(source, target)) ||
    (edge.type_lien === 'DONNE_ACCES' && isBacSeries(source) && isMasterLike(target)) ||
    (edge.type_lien === 'DONNE_ACCES' && isBadAdmission(source, target)) ||
    (edge.type_lien === 'DONNE_ACCES' && isBadProgramAccess(source, target)) ||
    (edge.type_lien === 'RECRUTEMENT' && isBadRecruitment(source, target))
  ) {
    report.edgesRemoved += 1
    report.coherenceEdgesRemoved += 1
    if (isSchoolToSchool) report.schoolToSchoolEdgesRemoved += 1
    continue
  }

  const key = `${edge.source_id}|${edge.target_id}|${edge.type_lien}`
  if (edgeKeys.has(key)) {
    report.edgesRemoved += 1
    continue
  }
  edgeKeys.add(key)
  compactedEdges.push(edge)
}

const nodeByCode = new Map(keptNodes.map((node) => [node.code, node]))
const findSchoolByFamilyCity = (wantedFamily, wantedCity) =>
  keptNodes.find((node) => node.type === 'ETABLISSEMENT' && family(node) === wantedFamily && inferCity(node) === wantedCity)
const addFinalOffer = (program, school, { force = false } = {}) => {
  if (!program || !school) return
  const key = `${program.id}|${school.id}|OFFERTE_PAR`
  if (edgeKeys.has(key) || (!force && hasOfferMismatch(program, school))) return
  compactedEdges.push({
    source_id: program.id,
    target_id: school.id,
    type_lien: 'OFFERTE_PAR',
    type_acces: 'OUVERT',
    moyenne_minimale: null,
    taux_reussite: 90,
    cout_supplementaire: 0,
    duree_supplementaire_mois: 0,
    actif: true,
  })
  edgeKeys.add(key)
}

const attachFinalProgramsMatching = (schoolCode, pattern) => {
  const school = nodeByCode.get(schoolCode)
  if (!school) return
  for (const program of keptNodes) {
    if (program.type !== 'FILIERE') continue
    const text = normalizeForMatch(`${program.code || ''} ${program.nom_fr || ''}`).replace(/_/g, ' ')
    if (pattern.test(text)) addFinalOffer(program, school)
  }
}

const attachFinalProgramsToSchool = (school, pattern, { force = false } = {}) => {
  if (!school) return
  for (const program of keptNodes) {
    if (program.type !== 'FILIERE') continue
    const text = normalizeForMatch(`${program.code || ''} ${program.nom_fr || ''}`).replace(/_/g, ' ')
    if (pattern.test(text)) addFinalOffer(program, school, { force })
  }
}

attachFinalProgramsMatching('FST_BENI_MELLAL', /FST.*BENI MELLAL|BENI MELLAL.*FST/)
attachFinalProgramsMatching('FST_ERRACHIDIA', /FST.*ERRACHIDIA|ERRACHIDIA.*FST/)
attachFinalProgramsMatching('FST_MOHAMMEDIA', /FST.*MOHAMMEDIA|MOHAMMEDIA.*FST/)
attachFinalProgramsMatching('FST_SETTAT', /FST.*SETTAT|SETTAT.*FST/)
attachFinalProgramsMatching('FST_TANGER', /FST.*TANGER|TANGER.*FST/)
attachFinalProgramsToSchool(findSchoolByFamilyCity('FST', 'Beni Mellal'), /FST.*BENI MELLAL|BENI MELLAL.*FST/, { force: true })
attachFinalProgramsToSchool(findSchoolByFamilyCity('FST', 'Errachidia'), /FST.*ERRACHIDIA|ERRACHIDIA.*FST/, { force: true })
attachFinalProgramsToSchool(findSchoolByFamilyCity('FST', 'Mohammedia'), /FST.*MOHAMMEDIA|MOHAMMEDIA.*FST/, { force: true })
attachFinalProgramsToSchool(findSchoolByFamilyCity('FST', 'Settat'), /FST.*SETTAT|SETTAT.*FST/, { force: true })
attachFinalProgramsToSchool(findSchoolByFamilyCity('FST', 'Tanger'), /FST.*TANGER|TANGER.*FST/, { force: true })
attachFinalProgramsMatching('EST_CASABLANCA', /\bEST\b.*CASABLANCA|CASABLANCA.*\bEST\b/)
attachFinalProgramsMatching('EST_ESSAOUIRA', /\bEST\b.*ESSAOUIRA|ESSAOUIRA.*\bEST\b/)
attachFinalProgramsToSchool(findSchoolByFamilyCity('EST', 'Casablanca'), /\bEST\b.*CASABLANCA|CASABLANCA.*\bEST\b/, { force: true })
attachFinalProgramsToSchool(findSchoolByFamilyCity('EST', 'Essaouira'), /\bEST\b.*ESSAOUIRA|ESSAOUIRA.*\bEST\b/, { force: true })
attachFinalProgramsMatching('FMP_TANGER', /MEDECINE.*PHARMACIE.*TANGER|PHARMACIE.*TANGER|MEDECINE.*TANGER/)
attachFinalProgramsMatching(
  'IAV_HASSAN_II_RABAT',
  /(IAV|HASSAN II).*(VETERINAIRE|AGRONOM|AGRO|HALIEUTIQUE|FOREST|RURAL|HORTICOLE|ZOOTECHNIE|PROTECTION DES PLANTES|INDUSTRIES AGRICOLES)/,
)

keptNodes.sort((a, b) => a.code.localeCompare(b.code))
compactedEdges.sort((a, b) => `${a.source_id}${a.target_id}${a.type_lien}`.localeCompare(`${b.source_id}${b.target_id}${b.type_lien}`))

await writeJson(nodesPath, keptNodes)
await writeJson(edgesPath, compactedEdges)

report.nodesAfter = keptNodes.length
report.edgesAfter = compactedEdges.length
await writeJson(reportPath, report)

console.log(JSON.stringify(report, null, 2))
