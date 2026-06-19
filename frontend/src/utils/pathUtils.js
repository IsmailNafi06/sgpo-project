export const getSteps = (path) => path?.etapes || path?.steps || path?.nodes || []

export const getPathId = (path) => path?.id || path?.token || path?.reference || JSON.stringify(path).slice(0, 80)

export const firstDefined = (...values) => values.find((value) => value !== null && value !== undefined && value !== '')

const cleanClientLabel = (value = '') => {
  const cleaned = String(value)
    .replace(/^SCRAPE_[A-Z0-9]+_(FORMATION|ECOLE|METIER)_?/i, '')
    .replace(/^F9R_/i, '')
    .replace(/^DISPLAY_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b8217\b/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || 'Etape'
}

export const getStepName = (step) =>
  cleanClientLabel(firstDefined(step?.nom, step?.nomFr, step?.nom_fr, step?.name, step?.label, step?.titre, step?.code, 'Etape'))

export const getStepCode = (step) => firstDefined(step?.code, step?.id, '')

export const getStepType = (step) =>
  String(firstDefined(step?.type, step?.nodeType, step?.node_type, 'FILIERE')).toUpperCase()

export const getStepTypeLabel = (type) =>
  ({
    NIVEAU: 'Depart',
    FILIERE: 'Formation',
    ETABLISSEMENT: 'Etablissement',
    METIER: 'Metier vise',
  })[String(type || '').toUpperCase()] || 'Etape'

export const getStepAccess = (step) =>
  firstDefined(step?.typeAcces, step?.type_acces, step?.accessType, step?.access_type)

export const getStepLinkType = (step) =>
  firstDefined(step?.typeLien, step?.type_lien, step?.linkType, step?.link_type)

export const getStepMinAverage = (step) =>
  firstDefined(step?.moyenneMinimale, step?.moyenne_minimale, step?.minAverage, step?.min_average)

export const getStepSuccessRate = (step) =>
  firstDefined(step?.tauxReussite, step?.taux_reussite, step?.successRate, step?.success_rate)

const normalizeForRules = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`´]/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase()

const isBtsFormation = (step) => {
  const name = normalizeForRules(getStepName(step))
  const code = normalizeForRules(firstDefined(step?.code, step?.id, ''))
  return name.includes('BTS') || code.includes('BTS')
}

const isMasterFormation = (step) => {
  const name = normalizeForRules(getStepName(step))
  const code = normalizeForRules(firstDefined(step?.code, step?.id, ''))
  return name.includes('MASTER') || name.includes('MASTERE') || code.includes('MASTER') || code.includes('MASTERE')
}

const isBacFormation = (step) => {
  const code = normalizeForRules(getStepCode(step))
  const name = normalizeForRules(getStepName(step))
  return code.startsWith('BAC_') || name.startsWith('BAC ')
}

const schoolKeywords = [
  'FACULTE',
  'FST',
  'FSJES',
  'FLSH',
  'ENA',
  'ENCG',
  'ENSA',
  'ENSIAS',
  'EST',
  'EHTP',
  'ISCAE',
  'ISGA',
  'IGA',
  'EMI',
  'INPT',
  'ECOLE',
  'INSTITUT',
  'UNIVERSITE',
  // Abréviations facultés de médecine/pharmacie/dentaire marocaines
  'FM6P',
  'FMPC',
  'FMPR',
  'FMPK',
  'FMPM',
  'FMPB',
  'FMD',
  'FMDS',
  'FMDC',
  'FMP',
  'FMPDF',
  // Universités privées de santé marocaines
  'UM6SS',
  'UM6P',
]

const cityKeywords = [
  'Casablanca',
  'Rabat',
  'Marrakech',
  'Fes',
  'Tanger',
  'Agadir',
  'Oujda',
  'Settat',
  'Kenitra',
  'Tetouan',
  'Beni Mellal',
  'Mohammedia',
  'El Jadida',
  'Laayoune',
  'Guelmim',
  'Errachidia',
  'Safi',
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

const looksLikeSchool = (value = '') => {
  const normalized = normalizeForRules(value)
  return schoolKeywords.some((keyword) => normalized.includes(keyword))
}

const extractCity = (value = '') => {
  const normalized = normalizeForRules(value).replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  return (
    cityKeywords.find((city) => {
      const cityPattern = escapeRegExp(normalizeForRules(city)).replace(/\s+/g, '\\s+')
      return new RegExp(`(^|\\s)${cityPattern}(\\s|$)`).test(normalized)
    }) || null
  )
}

const splitEmbeddedSchool = (step) => {
  const name = String(getStepName(step))
  const parts = name.split(/\s+-\s+/)
  if (parts.length < 2) return null

  const schoolName = parts.slice(1).join(' - ').trim()
  if (!looksLikeSchool(schoolName)) return null

  return {
    programName: parts[0].trim(),
    school: {
      type: 'ETABLISSEMENT',
      nom: schoolName,
      code: `DISPLAY_${normalizeForRules(schoolName).replace(/[^A-Z0-9]+/g, '_')}`,
      ville: extractCity(schoolName),
      duree: 0,
      displayOnly: true,
    },
  }
}

const cleanProgramStep = (step) => {
  if (getStepType(step) !== 'FILIERE') return step
  const embedded = splitEmbeddedSchool(step)
  if (!embedded) return step
  return { ...step, nom: embedded.programName, nomFr: embedded.programName, name: embedded.programName }
}

const firstBacByTerminal = {
  BAC_SM: { code: '1BAC_SM', nom: '1ere Bac Sciences Mathematiques' },
  BAC_PC: { code: '1BAC_SE', nom: '1ere Bac Sciences Experimentales' },
  BAC_SVT: { code: '1BAC_SE', nom: '1ere Bac Sciences Experimentales' },
  BAC_SE: { code: '1BAC_SE', nom: '1ere Bac Sciences Experimentales' },
  BAC_ECO: { code: '1BAC_ECO', nom: '1ere Bac Sciences Economiques et Gestion' },
  BAC_GC: { code: '1BAC_ECO', nom: '1ere Bac Sciences Economiques et Gestion' },
  BAC_SGC: { code: '1BAC_ECO', nom: '1ere Bac Sciences Economiques et Gestion' },
  BAC_LETTRES: { code: '1BAC_LETTRES', nom: '1ere Bac Lettres' },
  BAC_SH: { code: '1BAC_LETTRES', nom: '1ere Bac Lettres' },
  BAC_TECH_ELEC: { code: '1BAC_TECH', nom: '1ere Bac Sciences et Technologies' },
  BAC_TECH_MECA: { code: '1BAC_TECH', nom: '1ere Bac Sciences et Technologies' },
  BAC_TECH_CIVIL: { code: '1BAC_TECH', nom: '1ere Bac Sciences et Technologies' },
  BAC_ARTS: { code: '1BAC_ART', nom: '1ere Bac Arts Appliques' },
  BAC_ARTS_APPLIQUES: { code: '1BAC_ART', nom: '1ere Bac Arts Appliques' },
}

const missingFirstBacStep = (previous, current) => {
  if (normalizeForRules(getStepCode(previous)) !== 'TC') return null
  const terminalCode = normalizeForRules(getStepCode(current))
  const firstBac = firstBacByTerminal[terminalCode]
  if (!firstBac) return null
  return {
    type: 'FILIERE',
    code: firstBac.code,
    nom: firstBac.nom,
    nomFr: firstBac.nom,
    name: firstBac.nom,
    duree: 12,
    duree_mois: 12,
    displayOnly: true,
  }
}

export const getDisplaySteps = (path) =>
  getSteps(path).reduce((displaySteps, rawStep) => {
    const step = cleanProgramStep(rawStep)
    const embedded = splitEmbeddedSchool(rawStep)
    const previousType = displaySteps.length ? getStepType(displaySteps[displaySteps.length - 1]) : null

    const pushIfUseful = (candidate) => {
      const type = getStepType(candidate)
      if (type === 'ETABLISSEMENT') {
        const family = stepFamily(candidate)
        const city = normalizeForRules(stepCity(candidate) || '')
        const alreadySeen = displaySteps.some(
          (existing) =>
            getStepType(existing) === 'ETABLISSEMENT' &&
            stepFamily(existing) === family &&
            normalizeForRules(stepCity(existing) || '') === city,
        )
        if (alreadySeen) return
      }
      displaySteps.push(candidate)
    }

    if (embedded && getStepType(rawStep) === 'FILIERE' && previousType !== 'ETABLISSEMENT') {
      pushIfUseful(embedded.school)
    }

    const previousStep = displaySteps[displaySteps.length - 1]
    const syntheticFirstBac = previousStep ? missingFirstBacStep(previousStep, step) : null
    if (syntheticFirstBac) pushIfUseful(syntheticFirstBac)

    pushIfUseful(step)
    return displaySteps
  }, [])

const isUniversityOrGrandeEcole = (step) => {
  const name = normalizeForRules(getStepName(step))
  return [
    'ENCG',
    'ECOLE NATIONALE DE COMMERCE',
    'FACULTE',
    'UNIVERSITE',
    'ENSA',
    'ENSAM',
    'ENSIAS',
    'EHTP',
    'EMI',
    'INPT',
    'IAV',
    'ISCAE',
  ].some((keyword) => name.includes(keyword))
}

const isGrandeEcoleIngenieur = (step) => {
  const name = normalizeForRules(getStepName(step))
  return [
    'ENCG', 'ECOLE NATIONALE DE COMMERCE',
    'ENSA', 'ENSAM', 'ENSIAS', 'EHTP', 'EMI', 'INPT', 'IAV', 'ISCAE',
  ].some((kw) => name.includes(kw))
}

const stepFamily = (step) => {
  const text = normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`)
  if (/ENCG|ECOLE NATIONALE DE COMMERCE/.test(text)) return 'ENCG'
  if (/ECOLE NATIONALE D.?ARCHITECTURE|\bENA\b/.test(text)) return 'ENA'
  if (/AIAC|AVIATION CIVILE/.test(text)) return 'AIAC'
  if (/\bFM6MD\b|FACULTE MOHAMMED VI DE MEDECINE DENTAIRE|MOHAMMED VI DE MEDECINE DENTAIRE/.test(text)) return 'FM6MD'
  if (/\bFM6P\b|FACULTE MOHAMMED VI DE PHARMACIE|MOHAMMED VI DE PHARMACIE/.test(text)) return 'FM6P'
  if (/\b(FMD|FMDS|FMDC)\b|FACULTE DE MEDECINE DENTAIRE/.test(text)) return 'FMD'
  if (/\b(FMP|FMPR|FMPC|FMPO|FMPK|FMPM|FMPB)\b|FACULTE DE MEDECINE ET DE PHARMACIE|FACULTE DE MEDECINE\b/.test(text)) return 'FMP'
  if (/UM6SS|MOHAMMED VI DES SCIENCES DE LA SANTE/.test(text)) return 'UM6SS'
  if (/ENSC|ECOLE NATIONALE SUPERIEURE DE CHIMIE/.test(text)) return 'ENSC'
  if (/ECOLE SUPERIEURE DE TECHNOLOGIE|\bEST\b/.test(text)) return 'EST'
  if (/ISCAE|INSTITUT SUPERIEUR DE COMMERCE/.test(text)) return 'ISCAE'
  if (/ISGA/.test(text)) return 'ISGA'
  if (/\bIGA\b/.test(text)) return 'IGA'
  if (/EMSI/.test(text)) return 'EMSI'
  if (/FSJES|SCIENCES JURIDIQUES/.test(text)) return 'FSJES'
  if (/FST|FACULTE DES SCIENCES ET TECHNIQUES/.test(text)) return 'FST'
  if (/ENSEM|ECOLE NATIONALE SUPERIEURE D ELECTRICITE/.test(text)) return 'ENSEM'
  if (/ENSIAS|ECOLE NATIONALE SUPERIEURE D INFORMATIQUE/.test(text)) return 'ENSIAS'
  if (/ECOLE MOHAMMADIA D INGENIEURS|\bEMI\b/.test(text)) return 'EMI'
  if (/INPT|INSTITUT NATIONAL DES POSTES/.test(text)) return 'INPT'
  if (/ENSAM|ECOLE NATIONALE SUPERIEURE D ARTS ET METIERS/.test(text)) return 'ENSAM'
  if (/EHTP|ECOLE HASSANIA DES TRAVAUX PUBLICS/.test(text)) return 'EHTP'
  if (/IAV|INSTITUT AGRONOMIQUE ET VETERINAIRE/.test(text)) return 'IAV'
  if (/INSEA|INSTITUT NATIONAL DE STATISTIQUE/.test(text)) return 'INSEA'
  if (/\bENSA\b|ECOLE NATIONALE DES SCIENCES APPLIQUEES/.test(text)) return 'ENSA'
  if (/INGENIEUR|INGENIERIE|GENIE/.test(text) && /ECOLE|INSTITUT|POLYTECHNIQUE/.test(text)) return 'ENGINEERING'
  if (/FACULTE DES SCIENCES AIN|FACULTE DES SCIENCES CASABLANCA|FACULTE DES SCIENCES\b/.test(text)) return 'FS'
  if (/FACULTE|UNIVERSITE/.test(text)) return 'UNIVERSITE'
  return ''
}

const stepCity = (step) => extractCity(`${getStepCode(step)} ${getStepName(step)}`) || firstDefined(step?.ville, step?.city, '')

export const getStepCity = (step) => stepCity(step)

const isBacSeriesStep = (step) => getStepType(step) === 'FILIERE' && normalizeForRules(getStepCode(step)).startsWith('BAC_')

const firstBacFamily = (step) => {
  const code = normalizeForRules(getStepCode(step))
  const name = normalizeForRules(getStepName(step))
  if (code.includes('1BAC_SM') || name.includes('SCIENCES MATHEMATIQUES')) return 'SCIENCES_MATH'
  if (code.includes('1BAC_SE') || name.includes('SCIENCES EXPERIMENTALES')) return 'SCIENCES_EXP'
  if (code.includes('1BAC_ECO') || name.includes('ECONOM')) return 'ECONOMIE_GESTION'
  if (code.includes('1BAC_LETTRES') || name.includes('LETTRES') || name.includes('SCIENCES HUMAINES')) return 'LETTRES'
  if (code.includes('1BAC_TECH') || name.includes('TECHNOLOG')) return 'TECHNOLOGIES'
  if (code.includes('1BAC_ART') || name.includes('ART')) return 'ARTS'
  return ''
}

const terminalBacFamily = (step) => {
  const code = normalizeForRules(getStepCode(step))
  if (code === 'BAC_SM' || code === 'BAC_SM_A' || code === 'BAC_SM_B') return 'SCIENCES_MATH'
  if (['BAC_PC', 'BAC_SVT', 'BAC_SE'].includes(code)) return 'SCIENCES_EXP'
  if (['BAC_ECO', 'BAC_GC', 'BAC_SGC'].includes(code)) return 'ECONOMIE_GESTION'
  if (['BAC_LETTRES', 'BAC_SH'].includes(code)) return 'LETTRES'
  if (['BAC_TECH_ELEC', 'BAC_TECH_MECA', 'BAC_TECH_CIVIL'].includes(code)) return 'TECHNOLOGIES'
  if (['BAC_ARTS', 'BAC_ARTS_APPLIQUES'].includes(code)) return 'ARTS'
  return ''
}

const hasBacProgressionMismatch = (previous, current) => {
  if (!previous || !current) return false
  if (!normalizeForRules(getStepCode(previous)).startsWith('1BAC')) return false
  if (!isBacSeriesStep(current)) return false
  const firstFamily = firstBacFamily(previous)
  const terminalFamily = terminalBacFamily(current)
  return Boolean(firstFamily && terminalFamily && firstFamily !== terminalFamily)
}

const isSchoolFormationStep = (step) => {
  const code = normalizeForRules(getStepCode(step))
  const name = normalizeForRules(getStepName(step))
  return (
    code === '3AC' ||
    code === 'TC' ||
    code.startsWith('1BAC') ||
    code.startsWith('BAC_') ||
    name.includes('TRONC COMMUN') ||
    name.includes('1ERE BAC') ||
    name.includes('1RE BAC') ||
    name.startsWith('BAC ')
  )
}
const isBacPlus2Formation = (step) => /\b(DUT|BTS|DEUST|CPGE)\b/.test(normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`))
const isBacPlus3Formation = (step) => /\b(LICENCE|LST|BAC\+3)\b/.test(normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`))

const hasEmbeddedSchoolMismatch = (school, program) => {
  if (getStepType(school) !== 'ETABLISSEMENT' || getStepType(program) !== 'FILIERE') return false
  const embedded = splitEmbeddedSchool(program)
  if (!embedded) return false

  const embeddedSchool = embedded.school
  const schoolFamily = stepFamily(school)
  const embeddedFamily = stepFamily(embeddedSchool)
  const schoolCity = stepCity(school)
  const embeddedCity = stepCity(embeddedSchool)

  if (embeddedFamily && schoolFamily && embeddedFamily !== schoolFamily) return true
  if (embeddedCity && schoolCity && normalizeForRules(embeddedCity) !== normalizeForRules(schoolCity)) return true

  return false
}

const hasSchoolProgramMismatch = (school, program) => {
  if (getStepType(school) !== 'ETABLISSEMENT' || getStepType(program) !== 'FILIERE') return false
  const schoolFamily = stepFamily(school)
  const programFamily = stepFamily(program)
  const programText = normalizeForRules(`${getStepCode(program)} ${getStepName(program)}`)

  if (hasEmbeddedSchoolMismatch(school, program)) return true
  if (schoolFamily && programFamily && schoolFamily !== programFamily && !['UNIVERSITE', 'FS'].includes(schoolFamily)) return true
  if (schoolFamily === 'ENCG' && isBacPlus2Formation(program)) return true
  if (schoolFamily === 'ENGINEERING' && isBacPlus2Formation(program)) return true
  if (schoolFamily === 'ENGINEERING' && /\b(MARKETING|COMMERCE|RH|RESSOURCES HUMAINES)\b/.test(programText)) return true
  if (
    schoolFamily === 'ENCG' &&
    !/(\b(ENCG|COMMERCE|GESTION|MANAGEMENT|MARKETING|LOGISTIQUE|SUPPLY|RH|RESSOURCES HUMAINES|BUSINESS|ECONOM|DROIT|JURIDIQUE)\b|FINANC|COMPTABIL|COMPTA|AUDIT)/.test(programText)
  ) {
    return true
  }
  return false
}

const hasSchoolProgramCityMismatch = (school, program) => {
  if (getStepType(school) !== 'ETABLISSEMENT' || getStepType(program) !== 'FILIERE') return false
  const schoolCity = normalizeForRules(stepCity(school) || '')
  const programCity = normalizeForRules(stepCity(program) || '')
  if (!schoolCity || !programCity || schoolCity === programCity) return false

  const schoolFamily = stepFamily(school)
  const programText = normalizeForRules(`${getStepCode(program)} ${getStepName(program)}`)
  const programMentionsSchool = schoolFamily && schoolFamily !== 'UNIVERSITE' && programText.includes(schoolFamily)
  const programMentionsKnownCity = programText.includes(schoolCity) || programText.includes(programCity)

  return Boolean(programMentionsSchool || programMentionsKnownCity)
}

const isFinanceJob = (step) =>
  /\b(AUDITEUR|FINANCIER|COMPTABLE|COMPTABILITE|CONTROLEUR DE GESTION|EXPERT COMPTABLE|ANALYSTE FINANCIER)\b/.test(
    normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`),
  ) &&
  !/\b(AUDITEUR SI|AUDITEUR QUALITE|QUALITE|SYSTEME D INFORMATION)\b/.test(normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`).replace(/_/g, ' '))

const isFinanceProgram = (step) =>
  /(\b(ENCG|ISCAE|ACCOUNTING|DAF|FISCAL)\b|FINANC|COMPTABIL|COMPTA|AUDIT|CONTROLE DE GESTION|GESTION COMPTABLE|BANQUE|ASSURANCE|EXPERTISE COMPTABLE|GENIE FINANCIER|ECONOM)/.test(
    normalizeForRules(`${getStepCode(step)} ${getStepName(step)} ${step?.secteur || ''}`),
  )

const isTechJob = (step) =>
  /\b(DATA|DEVELOPPEUR|INFORMATIQUE|CYBER|RESEAUX|LOGICIEL|FULL STACK|GENIE INFORMATIQUE|SECURITE INFORMATIQUE|AUDITEUR SI|SYSTEME D INFORMATION)\b/.test(
    normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`),
  )

const isTechProgram = (step) =>
  /\b(INFORMATIQUE|DATA|CYBER|RESEAUX|LOGICIEL|SYSTEME D INFORMATION|INTELLIGENCE ARTIFICIELLE|GENIE INFORMATIQUE|DIGITAL|TELECOM|STATISTIQUE|MATHEMATIQUE|ENSIAS|ENSA|EMSI|INPT|DEVELOPPEMENT|MULTIMEDIA|NUMERIQUE|ELECTRONIQUE|PROGRAMMATION|CLOUD)\b/.test(
    normalizeForRules(`${getStepCode(step)} ${getStepName(step)} ${step?.secteur || ''}`),
  )

const isLifeScienceProgram = (step) =>
  /\b(SVT|SCIENCES DE LA VIE|BIOLOGIE|BIOTECH|SANTE|MEDECINE|PHARMACIE|DENTAIRE|VETERINAIRE|INFIRMIER|KINESITHERAPIE|ORTHOPHONIE)\b/.test(
    normalizeForRules(`${getStepCode(step)} ${getStepName(step)} ${step?.secteur || ''}`),
  )

const isBioTechBridgeProgram = (step) =>
  /\b(BIOINFORMATIQUE|BIOSTATISTIQUE|BIOMEDICAL|INFORMATIQUE MEDICALE|DATA SANTE|HEALTH DATA)\b/.test(
    normalizeForRules(`${getStepCode(step)} ${getStepName(step)} ${step?.secteur || ''}`),
  )

const isAdvancedAiOrDataProgram = (step) =>
  isMasterFormation(step) &&
  /\b(DATA|INTELLIGENCE ARTIFICIELLE|IA|MACHINE LEARNING|BIG DATA|GENIE INFORMATIQUE|INFORMATIQUE|CYBER|LOGICIEL)\b/.test(
    normalizeForRules(`${getStepCode(step)} ${getStepName(step)} ${step?.secteur || ''}`),
  )

const hasProgramDomainMismatch = (source, target) => {
  if (getStepType(source) !== 'FILIERE' || getStepType(target) !== 'FILIERE') return false
  if (isLifeScienceProgram(source) && isAdvancedAiOrDataProgram(target) && !isBioTechBridgeProgram(source) && !isBioTechBridgeProgram(target)) return true
  return false
}

const hasIncompatibleLifeScienceBefore = (steps, index) => {
  const target = steps[index]
  if (!isAdvancedAiOrDataProgram(target) || isBioTechBridgeProgram(target)) return false

  return steps
    .slice(0, index)
    .some((step) => {
      if (getStepType(step) !== 'FILIERE') return false
      if (isBacSeriesStep(step)) return false
      return isLifeScienceProgram(step) && !isBioTechBridgeProgram(step)
    })
}

const isLawJob = (step) =>
  /\b(AVOCAT|JURISTE|MAGISTRAT|NOTAIRE|JUGE|HUISSIER)\b/.test(
    normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`).replace(/_/g, ' '),
  )

const isLawProgram = (step) =>
  /(\b(DROIT|JURIDIQUE|JUDICIAIRE|SCIENCES JURIDIQUES|FSJES)\b|DROIT PRIVE|DROIT PUBLIC|DROIT DES AFFAIRES|DROIT PENAL|SCIENCES POLITIQUES ET JURIDIQUES)/.test(
    normalizeForRules(`${getStepCode(step)} ${getStepName(step)} ${step?.secteur || ''}`),
  )

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN_RULES : règles génériques par domaine (job keywords → program keywords)
// Ajouter un domaine ici suffit pour étendre la validation à tous ses métiers.
// Les mots-clés sont en MAJUSCULES sans accents (format normalizeForRules).
// ─────────────────────────────────────────────────────────────────────────────
export const DOMAIN_RULES = {
  sante: {
    jobKeywords: [
      'INFIRMIER', 'KINESITHERA', 'SAGE FEMME', 'SAGE_FEMME',
      'AIDE SOIGNANT', 'AIDE_SOIGNANT', 'CADRE DE SANTE', 'ORTHOPHONISTE',
      'AMBULANCIER', 'VETERINAIRE', 'BIOMEDICAL', 'BIOMEDICALE',
      'PSYCHOLOGUE', 'PSYCHIATRE', 'OPHTALMOLOGUE', 'CARDIOLOGUE',
      'RADIOLOGUE', 'CHIRURGIEN', 'DERMATOLOGUE', 'PEDIATRE',
      'ERGOTHERAPEUTE', 'PSYCHOMOTRICIEN', 'ORTHOPTISTE',
      'BIOLOGISTE', 'BIOCHIMISTE',
    ],
    programKeywords: [
      'MEDECINE', 'PHARMACIE', 'DENTAIRE', 'SANTE', 'INFIRMIER',
      'KINESITHERAPIE', 'BIOLOGIE', 'VETERINAIRE', 'ORTHOPHONIE',
      'SAGE FEMME', 'RADIOLOGIE', 'PSYCHOMOTRICITE', 'ERGOTHERAPIE',
      'BIOMEDICAL', 'PSYCHOLOGIE', 'PSYCHIATRIE',
    ],
  },
  informatique: {
    jobKeywords: [
      'DEVELOPPEUR', 'DATA', 'CYBER', 'RESEAUX', 'LOGICIEL',
      'FULL STACK', 'GENIE INFORMATIQUE', 'SECURITE INFORMATIQUE',
      'AUDITEUR SI', 'SYSTEME D INFORMATION', 'ANALYSTE SOC',
      'BUSINESS ANALYST', 'CHEF DE PROJET SI', 'CONSULTANT BI',
      'ADMINISTRATEUR BASE', 'ADMINISTRATEUR SYSTEME', 'CLOUD',
      'DEVOPS', 'SCRUM', 'TESTEUR LOGICIEL', 'ARCHITECTE LOGICIEL',
      'INGENIEUR INFORMATIQUE', 'INGENIEUR RESEAUX', 'INGENIEUR DATA',
      'INGENIEUR CLOUD', 'INGENIEUR SYSTEME', 'INGENIEUR SECURITE',
    ],
    programKeywords: [
      'INFORMATIQUE', 'DATA', 'CYBER', 'RESEAUX', 'LOGICIEL',
      'SYSTEME D INFORMATION', 'INTELLIGENCE ARTIFICIELLE',
      'GENIE INFORMATIQUE', 'DIGITAL', 'TELECOM', 'STATISTIQUE',
      'MATHEMATIQUE APPLIQUEE', 'ENSIAS', 'EMSI', 'INPT', 'CLOUD',
      'SECURITE NUMERIQUE', 'DEVELOPPEMENT WEB', 'PROGRAMMATION',
    ],
  },
  finance: {
    jobKeywords: [
      'COMPTABLE', 'COMPTABILITE', 'EXPERT COMPTABLE', 'AUDITEUR',
      'FINANCIER', 'CONTROLEUR DE GESTION', 'ANALYSTE FINANCIER',
      'TRESORIER', 'DIRECTEUR FINANCIER', 'DAF', 'FISCAL',
      'COMMISSAIRE AUX COMPTES', 'ACTUAIRE', 'BANQUIER', 'CREDIT',
      'ANALYSTE CREDIT', 'AGENT D ASSURANCE', 'AGENT DES FINANCES',
      'CAISSIER', 'GESTIONNAIRE DE PATRIMOINE',
    ],
    programKeywords: [
      'FINANCE', 'COMPTABILITE', 'COMPTA', 'AUDIT', 'EXPERTISE COMPTABLE',
      'CONTROLE DE GESTION', 'GESTION FINANCIERE', 'BANQUE', 'ASSURANCE',
      'FISCALITE', 'ACTUARIAT', 'ENCG', 'ISCAE', 'GESTION COMPTABLE',
      'SCIENCES DE GESTION', 'GENIE FINANCIER', 'TRESORERIE',
      'ECONOMIE', 'SCIENCES ECONOMIQUES', 'ECONOMIE APPLIQUEE',
    ],
  },
  droit: {
    jobKeywords: [
      'AVOCAT', 'JURISTE', 'MAGISTRAT', 'NOTAIRE', 'JUGE', 'HUISSIER',
      'ADMINISTRATEUR JUDICIAIRE', 'GREFFIER', 'CONSEILLER JURIDIQUE',
      'ASSISTANT JURIDIQUE', 'DIRECTEUR JURIDIQUE',
    ],
    programKeywords: [
      'DROIT', 'JURIDIQUE', 'SCIENCES JURIDIQUES', 'JUDICIAIRE',
      'DROIT PRIVE', 'DROIT PUBLIC', 'DROIT DES AFFAIRES', 'DROIT PENAL',
      'SCIENCES POLITIQUES', 'FSJES', 'NOTARIAT',
    ],
  },
  ingenierie: {
    jobKeywords: [
      'INGENIEUR GENIE', 'INGENIEUR CIVIL', 'INGENIEUR MECANIQUE',
      'INGENIEUR ELECTRIQUE', 'INGENIEUR CHIMIQUE', 'INGENIEUR INDUSTRIEL',
      'INGENIEUR PROCEDES', 'INGENIEUR QUALITE', 'INGENIEUR PRODUCTION',
      'INGENIEUR AERONAUTIQUE', 'INGENIEUR AUTOMOBILE', 'INGENIEUR ENERGIE',
      'GENIE CIVIL', 'GENIE MECANIQUE', 'GENIE ELECTRIQUE', 'GENIE CHIMIQUE',
    ],
    programKeywords: [
      'GENIE CIVIL', 'GENIE MECANIQUE', 'GENIE ELECTRIQUE', 'GENIE CHIMIQUE',
      'GENIE INDUSTRIEL', 'GENIE PROCEDES', 'INGENIERIE', 'ENSA', 'ENSAM',
      'EHTP', 'EMI', 'IAV', 'CYCLE INGENIEUR', 'CPGE',
      'AERONAUTIQUE', 'AUTOMOBILE', 'ENERGETIQUE',
    ],
  },
  commerce: {
    jobKeywords: [
      'COMMERCIAL', 'MARKETING', 'CHEF DE PRODUIT', 'DIRECTEUR COMMERCIAL',
      'CHARGE D AFFAIRES', 'ACHETEUR', 'GESTIONNAIRE COMMERCIAL',
      'MANAGER COMMERCIAL', 'CHEF DES VENTES', 'ANIMATEUR COMMERCIAL',
      'ADMINISTRATEUR DES VENTES', 'RESPONSABLE MARKETING',
      'CHARGE EVENEMENTIEL', 'ATTACHE COMMERCIAL',
    ],
    programKeywords: [
      'COMMERCE', 'MARKETING', 'VENTE', 'BUSINESS', 'MANAGEMENT',
      'GESTION COMMERCIALE', 'TECHNIQUES DE COMMERCIALISATION',
      'ECOLE DE COMMERCE', 'MBA', 'ENCG', 'ISCAE',
    ],
  },
  tourisme: {
    jobKeywords: [
      'TOURISME', 'GUIDE TOURISTIQUE', 'ACCOMPAGNATEUR', 'HOTELIER',
      'AGENT DE VOYAGE', 'AGENT DE RESERVATION', 'AGENT D ESCALE',
      'BARMAN', 'CUISINIER', 'CHEF CUISINIER', 'RESTAURATEUR',
      'RECEPTIONNISTE', 'CONCIERGE', 'DIRECTEUR HOTEL',
      'RESPONSABLE HOTELIER', 'AGENT THERMAL',
    ],
    programKeywords: [
      'TOURISME', 'HOTELLERIE', 'RESTAURATION', 'ACCUEIL', 'HEBERGEMENT',
      'ARTS CULINAIRES', 'ISIT', 'GESTION HOTELIERE',
    ],
  },
  agriculture: {
    jobKeywords: [
      'AGRICULTEUR', 'AGRONOME', 'INGENIEUR AGRONOME', 'ELEVEUR',
      'VITICULTEUR', 'MARAICHER', 'PISCICULTEUR', 'AQUACULTEUR',
      'FORESTIER', 'COMMERCIAL AGRICOLE', 'CONSULTANT AGRICOLE',
      'TECHNICIEN AGRICOLE', 'BIOLOGISTE MARIN',
    ],
    programKeywords: [
      'AGRICULTURE', 'AGRONOMIE', 'AGROALIMENTAIRE', 'FORESTIER',
      'PECHE', 'IAV', 'INRA', 'ENAM', 'ZOOTECHNIE', 'AQUACULTURE',
      'BIOLOGIE VEGETALE',
    ],
  },
  industrie: {
    jobKeywords: [
      'AUTOMATICIEN', 'CHAUDRONNIER', 'SOUDEUR',
      'CONTROLEUR QUALITE', 'RESPONSABLE PRODUCTION', 'CHEF D ATELIER',
      'OPERATEUR', 'TECHNICIEN DE MAINTENANCE', 'MECANICIEN',
      'ELECTRONICIEN', 'CONDUCTEUR D ENGINS',
    ],
    programKeywords: [
      'INDUSTRIE', 'PRODUCTION', 'QUALITE', 'MAINTENANCE',
      'ELECTROTECHNIQUE', 'ELECTRONIQUE', 'MECANIQUE', 'AUTOMATISME',
      'GENIE INDUSTRIEL', 'ISTA', 'BTS INDUSTRIE',
    ],
  },
  architecture: {
    jobKeywords: [
      'ARCHITECTE', 'URBANISTE', 'PAYSAGISTE', 'DESIGNER INTERIEUR',
      'DECORATEUR INTERIEUR', 'BIM MANAGER', 'CONDUCTEUR DE TRAVAUX BTP',
      'CHEF DE CHANTIER', 'GEOMETRE', 'TOPOGRAPHE',
    ],
    programKeywords: [
      'ARCHITECTURE', 'URBANISME', 'DESIGN INTERIEUR', 'DECORATION',
      'ECOLE NATIONALE D ARCHITECTURE', 'AMENAGEMENT',
      'GENIE CIVIL', 'BTP', 'INBA',
    ],
  },
  art: {
    jobKeywords: [
      'DESIGNER', 'GRAPHISTE', 'ILLUSTRATEUR', 'PHOTOGRAPHE',
      'CAMERAMAN', 'CADREUR', 'MONTEUR', 'REALISATEUR', 'SCENOGRAPHE',
      'JOURNALISTE', 'REDACTEUR', 'ATTACHE DE PRESSE',
      'CHARGE COMMUNICATION', 'ARTISAN', 'BIJOUTIER',
      'CHEF MONTEUR', 'ASSISTANT MONTEUR', 'ASSISTANT CAMERA',
    ],
    programKeywords: [
      'ARTS', 'DESIGN', 'GRAPHISME', 'AUDIOVISUEL', 'CINEMA',
      'COMMUNICATION', 'JOURNALISME', 'MEDIAS', 'PHOTOGRAPHIE',
      'ANIMATION', 'ILLUSTRATION', 'ARTISANAT', 'BEAUX ARTS',
      'INBA', 'ISMAC', 'ISADAC',
    ],
  },
  enseignement: {
    jobKeywords: [
      'ENSEIGNANT', 'PROFESSEUR', 'FORMATEUR', 'EDUCATEUR SPECIALISE',
      'DIRECTEUR ETABLISSEMENT SCOLAIRE', 'INSPECTEUR ENSEIGNEMENT',
      'CONSEILLER PEDAGOGIQUE',
    ],
    programKeywords: [
      'ENSEIGNEMENT', 'EDUCATION', 'PEDAGOGIE', 'DIDACTIQUE',
      'CRMEF', 'CPR', 'FORMATION DES ENSEIGNANTS',
      'LETTRES', 'LANGUE', 'ARABE', 'FRANCAIS', 'ANGLAIS',
      'HISTOIRE', 'GEOGRAPHIE', 'SCIENCES DE L EDUCATION',
    ],
  },
  sport: {
    jobKeywords: [
      'COACH SPORTIF', 'COACH DE VIE', 'ENTRAINEUR', 'EDUCATEUR SPORTIF',
      'ANIMATEUR SPORTIF', 'PREPARATEUR PHYSIQUE', 'MONITEUR SPORT',
    ],
    programKeywords: [
      'SPORT', 'EPS', 'STAPS', 'COACHING', 'SCIENCES DU SPORT',
      'ACTIVITES PHYSIQUES', 'EDUCATION PHYSIQUE',
    ],
  },
  social: {
    jobKeywords: [
      'ASSISTANT SOCIAL', 'TRAVAILLEUR SOCIAL', 'ANIMATEUR SOCIAL',
      'CONSEILLER INSERTION', 'SOCIOLOGUE', 'ANTHROPOLOGUE',
    ],
    programKeywords: [
      'SOCIAL', 'TRAVAIL SOCIAL', 'ACTION SOCIALE', 'PSYCHOLOGIE',
      'SOCIOLOGIE', 'INAS', 'SCIENCES HUMAINES', 'ANTHROPOLOGIE',
    ],
  },
}

// Retourne la clé de domaine du métier, ou null si non reconnu
const getJobDomain = (step) => {
  const text = normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`).replace(/_/g, ' ')
  for (const [domain, rules] of Object.entries(DOMAIN_RULES)) {
    if (rules.jobKeywords.some((kw) => text.includes(kw))) return domain
  }
  return null
}

// Vérifie qu'au moins un programme du parcours correspond au domaine attendu
const programsMatchDomain = (programs, rule) =>
  programs.some((program) => {
    const text = normalizeForRules(`${getStepCode(program)} ${getStepName(program)} ${program?.secteur || ''}`)
      .replace(/_/g, ' ')
    return rule.programKeywords.some((kw) => text.includes(kw))
  })

const hasCompatibleProgramForJob = (steps, job) => {
  const programs = steps.filter((step) => getStepType(step) === 'FILIERE')

  // Vérifications précises pour les métiers médicaux réglementés (diplômes d'État spécifiques)
  if (isGeneralDoctorJob(job)) return programs.some(isGeneralMedicineProgram)
  if (isDentistJob(job)) return programs.some(isDentalProgram)
  if (isPharmacistJob(job)) return programs.some(isPharmacyProgram)

  // Vérification générique par domaine via DOMAIN_RULES (couvre 13 domaines)
  const domain = getJobDomain(job)
  // L'enseignement est cross-domaine : un PROFESSEUR enseigne la matière qu'il a étudiée
  if (domain === 'enseignement') return true
  if (domain) return programsMatchDomain(programs, DOMAIN_RULES[domain])

  // Domaine non encore référencé : aucune restriction appliquée
  return true
}

const isTeachingJob = (step) => /\b(ENSEIGNANT|PROFESSEUR)\b/.test(normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`))
const isResearchJob = (step) =>
  /\b(CHERCHEUR|RECHERCHE|PROFESSEUR UNIVERSITAIRE|ENSEIGNANT CHERCHEUR|SCIENTIFIQUE)\b/.test(
    normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`).replace(/_/g, ' '),
  )
const isEngineerJob = (step) =>
  /\b(INGENIEUR|ENGINEER|ARCHITECTE LOGICIEL|DATA SCIENTIST|DATA ENGINEER)\b/.test(
    normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`).replace(/_/g, ' '),
  )

const isSeniorFinanceJob = (step) =>
  /\b(EXPERT COMPTABLE|CHEF COMPTABLE|DIRECTEUR ADMINISTRATIF|DAF|AUDITEUR FINANCIER|COMMISSAIRE AUX COMPTES|CONTROLEUR DE GESTION|ANALYSTE FINANCIER)\b/.test(
    normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`).replace(/_/g, ' '),
  )


const isGeneralDoctorJob = (step) =>
  /\bMEDECIN_GENERALISTE\b|MEDECIN GENERALISTE/.test(normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`))

const isDentistJob = (step) =>
  /\b(DENTISTE|CHIRURGIEN DENTISTE|MEDECIN DENTISTE)\b/.test(normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`).replace(/_/g, ' '))

const isPharmacistJob = (step) =>
  /\b(PHARMACIEN|PHARMACIEN INDUSTRIEL)\b/.test(normalizeForRules(`${getStepCode(step)} ${getStepName(step)}`).replace(/_/g, ' '))

const isGeneralMedicineProgram = (step) => {
  const programName = String(getStepName(step)).split(/\s+-\s+/)[0]
  const text = normalizeForRules(`${getStepCode(step)} ${programName} ${step?.secteur || ''}`)
  return (
    /DOCTORAT_MEDECINE|DOCTORAT EN MEDECINE|DOCTEUR EN MEDECINE|DIPLOME DE DOCTEUR EN MEDECINE|DIPLOME D ETAT DE DOCTEUR EN MEDECINE/.test(text) &&
    !/VETERINAIRE|DENTAIRE|PHARMACIE|BIOTECH|LICENCE|MASTER|INFIRMIER|KINESITHERAPIE|ORTHOPHONIE|SAGE FEMME/.test(text)
  )
}

const isDentalProgram = (step) => {
  const programName = String(getStepName(step)).split(/\s+-\s+/)[0]
  const text = normalizeForRules(`${getStepCode(step)} ${programName} ${step?.secteur || ''}`).replace(/_/g, ' ')
  return /MEDECINE DENTAIRE|DOCTEUR EN MEDECINE DENTAIRE|CHIRURGIE DENTAIRE/.test(text) && !/PROTHESE|ASSISTANT|HYGIENE/.test(text)
}

const isPharmacyProgram = (step) => {
  const programName = String(getStepName(step)).split(/\s+-\s+/)[0]
  const text = normalizeForRules(`${getStepCode(step)} ${programName} ${step?.secteur || ''}`).replace(/_/g, ' ')
  return /(DOCTORAT|DOCTEUR|DIPLOME).{0,30}PHARMACIE|PHARMACIEN/.test(text) && !/PREPARATEUR|ASSISTANT/.test(text)
}

const isResearchDoctorateProgram = (step) => {
  const programName = String(getStepName(step)).split(/\s+-\s+/)[0]
  const text = normalizeForRules(`${getStepCode(step)} ${programName} ${step?.secteur || ''}`).replace(/_/g, ' ')
  return /\b(DOCTORAT|DOCTEUR|PHD|DBA)\b/.test(text) && !isGeneralMedicineProgram(step) && !isDentalProgram(step) && !isPharmacyProgram(step)
}

const isExpertiseComptableProgram = (step) =>
  /\b(EXPERTISE COMPTABLE|DNEC|D N E C|CYCLE D EXPERTISE)\b/.test(
    normalizeForRules(`${getStepCode(step)} ${getStepName(step)} ${step?.description || ''}`).replace(/_/g, ' '),
  )

const hasSchoolContext = (steps, index) => {
  const step = steps[index]
  if (getStepType(step) !== 'FILIERE') return true
  if (isBacSeriesStep(step) || isSchoolFormationStep(step)) return true
  if (splitEmbeddedSchool(step)) return true

  const previous = steps[index - 1]
  const next = steps[index + 1]
  return getStepType(previous) === 'ETABLISSEMENT' || getStepType(next) === 'ETABLISSEMENT'
}

const hasJobMismatch = (program, job) => {
  if (getStepType(program) !== 'FILIERE' || getStepType(job) !== 'METIER') return false
  if (/\bEXPERT COMPTABLE\b/.test(normalizeForRules(`${getStepCode(job)} ${getStepName(job)}`).replace(/_/g, ' ')) && !isExpertiseComptableProgram(program)) return true
  if (isGeneralDoctorJob(job) && !isGeneralMedicineProgram(program)) return true
  if (isDentistJob(job) && !isDentalProgram(program)) return true
  if (isPharmacistJob(job) && !isPharmacyProgram(program)) return true
  if (isResearchDoctorateProgram(program) && !isResearchJob(job) && !isTeachingJob(job)) return true
  if (isBacPlus2Formation(program) && isEngineerJob(job)) return true
  if (isFinanceJob(job) && !isFinanceProgram(program)) return true
  if (isTechJob(job) && !isTechProgram(program)) return true
  if (isLawJob(job) && !isLawProgram(program)) return true
  return false
}

export const isCoherentPath = (path) => {
  const steps = getSteps(path)
  const finalStep = steps[steps.length - 1]
  const hasMedicalPath = steps.some((step) => isGeneralMedicineProgram(step) || isDentalProgram(step) || isPharmacyProgram(step))
  const hasResearchDoctorate = steps.some(isResearchDoctorateProgram)
  const displaySteps = getDisplaySteps(path)
  const postBacSteps = displaySteps.filter((step) => getStepType(step) !== 'NIVEAU' && !isSchoolFormationStep(step))
  const displayDuration = getDisplayDuration(path)

  if (postBacSteps.length > 5 && !hasMedicalPath && !isSeniorFinanceJob(finalStep)) return false
  if (postBacSteps.length > 7 && !hasMedicalPath) return false
  if (displayDuration > 96 && !hasMedicalPath && !isResearchJob(finalStep) && !isSeniorFinanceJob(finalStep)) return false
  if (displayDuration > 168 && !hasMedicalPath) return false
  if (hasResearchDoctorate && !isResearchJob(finalStep) && !isTeachingJob(finalStep)) return false
  if (!hasCompatibleProgramForJob(steps, finalStep)) return false
  if (!displaySteps.every((step, index) => hasSchoolContext(displaySteps, index))) return false

  if (/\bEXPERT COMPTABLE\b/.test(normalizeForRules(`${getStepCode(finalStep)} ${getStepName(finalStep)}`).replace(/_/g, ' '))) {
    if (!steps.some(isExpertiseComptableProgram)) return false
    if (displayDuration < 96) return false
  }

  const hasPreMasterTrainingBefore = (index) =>
    steps.slice(0, index).some((candidate, candidateIndex) => candidateIndex > 0 && (isBacPlus2Formation(candidate) || isBacPlus3Formation(candidate)))

  return steps.every((step, index) => {
    const previous = steps[index - 1]
    const beforePrevious = steps[index - 2]
    const next = steps[index + 1]

    if (previous && getStepType(previous) === 'ETABLISSEMENT' && getStepType(step) === 'ETABLISSEMENT') return false
    if (previous && hasBacProgressionMismatch(previous, step)) return false

    if (isBtsFormation(step)) {
      return !isUniversityOrGrandeEcole(previous) && !isGrandeEcoleIngenieur(next)
    }

    if (previous && isBacSeriesStep(previous) && isMasterFormation(step)) return false
    if (isMasterFormation(step) && beforePrevious && isBacSeriesStep(beforePrevious) && getStepType(previous) === 'ETABLISSEMENT') return false
    if (isMasterFormation(step) && !hasPreMasterTrainingBefore(index)) return false
    if (hasIncompatibleLifeScienceBefore(steps, index)) return false
    if (previous && hasSchoolProgramMismatch(previous, step)) return false
    if (next && hasSchoolProgramMismatch(step, next)) return false
    if (previous && hasSchoolProgramCityMismatch(previous, step)) return false
    if (next && hasSchoolProgramCityMismatch(step, next)) return false
    if (previous && hasProgramDomainMismatch(previous, step)) return false
    if (previous && hasJobMismatch(previous, step)) return false

    return true
  })
}

export const getStepDuration = (step) =>
  Number(firstDefined(step?.duree, step?.dureeMois, step?.duree_mois, step?.duration, 0))

export const getScore = (path) => {
  const backendScore = firstDefined(path?.scoreComposite, path?.score_composite, path?.score, path?.scoreGlobal, path?.score_global, path?.rank)
  const rawScore = backendScore !== undefined ? Number(backendScore) || 0 : null

  const rates = getSteps(path)
    .map(getStepSuccessRate)
    .filter((rate) => rate !== undefined)
    .map(Number)
    .filter((rate) => Number.isFinite(rate))

  const baseScore = rawScore ?? (rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : 0)
  const steps = getSteps(path)
  const finalStep = steps[steps.length - 1]
  const maxProgramDuration = steps
    .filter((step) => getStepType(step) === 'FILIERE')
    .reduce((max, step) => Math.max(max, getStepDuration(step), inferDiplomaDurationAfterBac(step)), 0)

  let adjustment = 0
  if (isSeniorFinanceJob(finalStep)) {
    if (maxProgramDuration < 36) adjustment -= 28
    else if (maxProgramDuration < 60) adjustment -= 10
    else adjustment += 6
  }
  if (/\bEXPERT COMPTABLE\b/.test(normalizeForRules(`${getStepCode(finalStep)} ${getStepName(finalStep)}`).replace(/_/g, ' '))) {
    adjustment += steps.some(isExpertiseComptableProgram) ? 12 : -40
  }

  const displaySteps = getDisplaySteps(path)
  if (displaySteps.some(isPublicEducationStep)) adjustment += 7
  if (displaySteps.some(isPrivateEducationStep)) adjustment -= Math.min(22, Math.ceil(getCost(path) / 50000))
  const concreteCityCount = new Set(
    displaySteps
      .filter((step) => !['NIVEAU', 'METIER'].includes(getStepType(step)))
      .map(stepCity)
      .filter(Boolean)
      .map(normalizeForRules),
  ).size
  if (concreteCityCount > 1) adjustment -= Math.min(20, (concreteCityCount - 1) * 10)

  return Math.max(0, Math.min(100, Math.round(baseScore + adjustment)))
}

export const getDuration = (path) =>
  firstDefined(path?.dureeTotale, path?.duree_totale, path?.durationTotal, path?.duration_total) ??
  getSteps(path).reduce((sum, step) => sum + getStepDuration(step), 0)

const inferDiplomaDurationAfterBac = (step) => {
  const name = normalizeForRules(getStepName(step))
  const code = normalizeForRules(getStepCode(step))
  const text = `${name} ${code}`

  if (text.includes('MEDECINE DENTAIRE') || text.includes('DOCTORAT_PHARMACIE') || text.includes('DOCTORAT EN PHARMACIE')) return 72
  if (text.includes('DOCTORAT_MEDECINE') || text.includes('DOCTORAT EN MEDECINE') || text.includes('DOCTEUR EN MEDECINE')) return 84
  if (text.includes('DOCTORAT')) return 0
  if (text.includes('BAC+5') || isMasterFormation(step) || text.includes('INGENIEUR') || text.includes('DIPLOME ENCG')) return 60
  if (text.includes('BAC+4') || text.includes('BACHELOR')) return 48
  if (text.includes('BAC+3') || text.includes('LICENCE')) return 36
  if (text.includes('BAC+2') || text.includes('DUT') || text.includes('BTS') || text.includes('CPGE')) return 24

  return 0
}

export const getDisplayDuration = (path) => {
  const backendDuration = Number(getDuration(path) || 0)
  const inferredDuration = getSteps(path).reduce((max, step) => Math.max(max, inferDiplomaDurationAfterBac(step)), 0)
  return Math.max(backendDuration, inferredDuration)
}

export const formatStepDuration = (step, index = 0) => {
  if (index === 0 && isBacFormation(step)) return 'Niveau actuel'
  if (getStepType(step) === 'METIER') return 'Metier vise'
  if (getStepType(step) === 'ETABLISSEMENT' && getStepDuration(step) <= 0) return 'Campus'

  const duration = getStepDuration(step)
  const inferred = inferDiplomaDurationAfterBac(step)

  if (inferred > duration && inferred >= 36) {
    return `${formatDuration(inferred)} apres bac`
  }

  return formatDuration(duration)
}

const canonicalStepName = (step) => {
  const type = getStepType(step)
  const text = normalizeForRules(getStepName(step))
    .split(' - ')[0]
    .replace(/DIPLOME D ETAT DE/g, '')
    .replace(/DIPLOME DE/g, '')
    .replace(/DOCTEUR EN/g, '')
    .replace(/DOCTORAT EN/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (type === 'ETABLISSEMENT') {
    const city = normalizeForRules(stepCity(step) || '')
    if (/ENSIAS|ECOLE NATIONALE SUPERIEURE D INFORMATIQUE/.test(text)) return `ENSIAS:${city}`
    if (/ECOLE NATIONALE D.?ARCHITECTURE|\bENA\b/.test(text)) return `ENA:${city}`
    if (/AIAC|AVIATION CIVILE/.test(text)) return `AIAC:${city}`
    if (/\bFM6MD\b|FACULTE MOHAMMED VI DE MEDECINE DENTAIRE|MOHAMMED VI DE MEDECINE DENTAIRE/.test(text)) return `FM6MD:${city}`
    if (/\bFM6P\b|FACULTE MOHAMMED VI DE PHARMACIE|MOHAMMED VI DE PHARMACIE/.test(text)) return `FM6P:${city}`
    if (/\b(FMD|FMDS|FMDC)\b|FACULTE DE MEDECINE DENTAIRE/.test(text)) return `FMD:${city}`
    if (/\b(FMP|FMPR|FMPC|FMPO|FMPK|FMPM|FMPB)\b|FACULTE DE MEDECINE ET DE PHARMACIE|FACULTE DE MEDECINE\b/.test(text)) return `FMP:${city}`
    if (/UM6SS|MOHAMMED VI DES SCIENCES DE LA SANTE/.test(text)) return `UM6SS:${city}`
    if (/ENSC|ECOLE NATIONALE SUPERIEURE DE CHIMIE/.test(text)) return `ENSC:${city}`
    if (/ENSEM|ECOLE NATIONALE SUPERIEURE D ELECTRICITE/.test(text)) return `ENSEM:${city}`
    if (/ENSIAS|ECOLE NATIONALE SUPERIEURE D INFORMATIQUE/.test(text)) return `ENSIAS:${city}`
    if (/ECOLE MOHAMMADIA D INGENIEURS|\bEMI\b/.test(text)) return `EMI:${city}`
    if (/INPT|INSTITUT NATIONAL DES POSTES/.test(text)) return `INPT:${city}`
    if (/ENSAM|ECOLE NATIONALE SUPERIEURE D ARTS ET METIERS/.test(text)) return `ENSAM:${city}`
    if (/EHTP|ECOLE HASSANIA DES TRAVAUX PUBLICS/.test(text)) return `EHTP:${city}`
    if (/IAV|INSTITUT AGRONOMIQUE ET VETERINAIRE/.test(text)) return `IAV:${city}`
    if (/INSEA|INSTITUT NATIONAL DE STATISTIQUE/.test(text)) return `INSEA:${city}`
    if (/\bENSA\b|ECOLE NATIONALE DES SCIENCES APPLIQUEES/.test(text)) return `ENSA:${city}`
    if (/ENCG|ECOLE NATIONALE DE COMMERCE/.test(text)) return `ENCG:${city}`
    if (/FACULTE DES SCIENCES ET TECHNIQUES|FST\b/.test(text)) return `FST:${city}`
    if (/FACULTE DES SCIENCES JURIDIQUES|FSJES/.test(text)) return `FSJES:${city}`
    if (/ECOLE SUPERIEURE DE TECHNOLOGIE|\bEST\b/.test(text)) return `EST:${city}`
  }

  if (type === 'FILIERE' && text.includes('DENTAIRE')) return 'MEDECINE_DENTAIRE'
  if (type === 'FILIERE' && text.includes('PHARMACIE')) return 'PHARMACIE'
  if (type === 'FILIERE' && text.includes('MEDECINE')) return 'MEDECINE'
  if (type === 'FILIERE' && text.includes('ARCHITECTE')) return 'ARCHITECTURE'
  if (type === 'FILIERE' && text.includes('ARCHITECTURE')) return 'ARCHITECTURE'
  if (type === 'FILIERE' && text.includes('EXPERTISE COMPTABLE')) return 'EXPERTISE_COMPTABLE'
  if (type === 'FILIERE' && /\b(INGENIEUR|INGENIERIE|GENIE)\b/.test(text) && /\b(INFORMATIQUE|SYSTEMES|RESEAUX|LOGICIEL)\b/.test(text)) return 'GENIE_INFORMATIQUE'
  if (type === 'FILIERE' && (text.includes('DATA SCIENCE') || text.includes('DATA & IA') || text.includes('INTELLIGENCE ARTIFICIELLE'))) return 'DATA_SCIENCE'
  if (type === 'FILIERE' && text.includes('DATA ENGINEERING')) return 'DATA_ENGINEERING'

  return text
}

export const getPathSignature = (path) =>
  getDisplaySteps(path)
    .map((step) => `${getStepType(step)}:${canonicalStepName(step)}`)
    .join('|')

const lastStepOfType = (steps, type) =>
  [...steps].reverse().find((step) => getStepType(step) === type)

const finalHigherProgram = (steps) =>
  [...steps]
    .reverse()
    .find((step) => getStepType(step) === 'FILIERE' && !isSchoolFormationStep(step))

const finalEstablishment = (steps, finalProgram) => {
  const programIndex = finalProgram ? steps.indexOf(finalProgram) : -1
  if (programIndex > 0) {
    const beforeProgram = steps
      .slice(0, programIndex)
      .reverse()
      .find((step) => getStepType(step) === 'ETABLISSEMENT')
    if (beforeProgram) return beforeProgram
  }

  return lastStepOfType(steps, 'ETABLISSEMENT')
}

const finalPathCity = (establishment, program) =>
  normalizeForRules(stepCity(establishment) || stepCity(program) || '')

const finalProgramSignature = (program, job) => {
  const programKey = canonicalStepName(program)
  const jobKey = canonicalStepName(job)
  const combined = normalizeForRules(`${programKey} ${jobKey}`)

  if (combined.includes('ARCHITECT')) return 'ARCHITECTURE'
  if (combined.includes('DENTAIRE') || combined.includes('DENTISTE')) return 'MEDECINE_DENTAIRE'
  if (combined.includes('PHARMACIE') || combined.includes('PHARMACIEN')) return 'PHARMACIE'
  if (combined.includes('EXPERTISE COMPTABLE') || combined.includes('EXPERT COMPTABLE')) return 'EXPERTISE_COMPTABLE'
  if (combined.includes('GENIE_INFORMATIQUE') || combined.includes('INGENIEUR GENIE INFORMATIQUE')) return 'GENIE_INFORMATIQUE'

  return programKey
}

const finalJobSignature = (job, program) => {
  const combined = normalizeForRules(`${canonicalStepName(job)} ${canonicalStepName(program)}`)
  if (combined.includes('ARCHITECT')) return 'ARCHITECTE'
  if (combined.includes('DENTAIRE') || combined.includes('DENTISTE')) return 'DENTISTE'
  if (combined.includes('PHARMACIE') || combined.includes('PHARMACIEN')) return 'PHARMACIEN'
  if (combined.includes('EXPERT COMPTABLE') || combined.includes('EXPERTISE COMPTABLE')) return 'EXPERT_COMPTABLE'
  if (combined.includes('GENIE_INFORMATIQUE') || combined.includes('INGENIEUR GENIE INFORMATIQUE')) return 'INGENIEUR_INFORMATIQUE'
  return canonicalStepName(job)
}

const finalEstablishmentSignature = (establishment) => {
  const family = stepFamily(establishment)
  const city = normalizeForRules(stepCity(establishment) || '')
  const canonical = canonicalStepName(establishment)
  if (family) return `${family}:${city || 'NON_PRECISEE'}`
  return canonical
}

const compactFinalPathSignature = (path) => {
  const steps = getDisplaySteps(path)
  const job = lastStepOfType(steps, 'METIER')
  const program = finalHigherProgram(steps)
  const establishment = finalEstablishment(steps, program)
  const city = finalPathCity(establishment, program)

  if (!job || !program || !establishment) return getPathSignature(path)

  return [
    `ETABLISSEMENT:${finalEstablishmentSignature(establishment)}`,
    `VILLE:${city || 'NON_PRECISEE'}`,
    `FORMATION:${finalProgramSignature(program, job)}`,
    `METIER:${finalJobSignature(job, program)}`,
  ].join('|')
}

const visibleFinalPathSignature = (path) => {
  const steps = getDisplaySteps(path)
  const job = lastStepOfType(steps, 'METIER')
  const program = finalHigherProgram(steps)
  const establishment = finalEstablishment(steps, program)
  const city = finalPathCity(establishment, program)

  if (job && program && establishment) {
    return [
      `DESTINATION:${finalEstablishmentSignature(establishment)}`,
      `VILLE:${city || 'NON_PRECISEE'}`,
      `DIPLOME:${finalProgramSignature(program, job)}`,
      `METIER:${finalJobSignature(job, program)}`,
    ].join('|')
  }

  return steps
    .filter((step) => getStepType(step) !== 'NIVEAU' && !isSchoolFormationStep(step))
    .map((step) => `${getStepType(step)}:${canonicalStepName(step)}`)
    .join('|')
}

const visibleOutcomeSignature = (path) => {
  const steps = getDisplaySteps(path)
  const job = lastStepOfType(steps, 'METIER')
  const program = finalHigherProgram(steps)
  const establishment = finalEstablishment(steps, program)

  if (job && program && establishment) {
    return [
      `ETABLISSEMENT:${finalEstablishmentSignature(establishment)}`,
      `DIPLOME:${finalProgramSignature(program, job)}`,
      `METIER:${finalJobSignature(job, program)}`,
    ].join('|')
  }

  return visibleFinalPathSignature(path)
}

const broadCareerFromText = (text) => {
  const combined = normalizeForRules(text)
  if (/DENTAIRE|DENTISTE/.test(combined)) return 'MEDECINE_DENTAIRE'
  if (/PHARMACIE|PHARMACIEN/.test(combined)) return 'PHARMACIE'
  if (/MEDECINE|MEDECIN/.test(combined)) return 'MEDECINE'
  if (/ARCHITECT/.test(combined)) return 'ARCHITECTURE'
  if (/EXPERT COMPTABLE|EXPERTISE COMPTABLE/.test(combined)) return 'EXPERTISE_COMPTABLE'
  if (/DATA|INTELLIGENCE ARTIFICIELLE|\bIA\b|MACHINE LEARNING|DEEP LEARNING|BIG DATA/.test(combined)) {
    return 'DATA_IA'
  }
  if (/CYBER|SECURITE/.test(combined)) return 'CYBERSECURITE'
  if (/INFORMATIQUE|SYSTEMES|RESEAUX|LOGICIEL|DEVELOPPEUR|CLOUD|TELECOM/.test(combined)) {
    return 'INGENIERIE_NUMERIQUE'
  }
  if (/ELECTRIQUE|ELECTRICITE|ELECTROTECHNIQUE/.test(combined)) return 'GENIE_ELECTRIQUE'
  if (/MECANIQUE|MECATRONIQUE/.test(combined)) return 'GENIE_MECANIQUE'
  if (/INDUSTRIEL/.test(combined)) return 'GENIE_INDUSTRIEL'
  if (/FINANC|COMPTA|AUDIT|GESTION/.test(combined)) return 'FINANCE_GESTION'

  return ''
}

const broadCareerSignature = (program, job) => {
  const combined = [
    getStepCode(program),
    getStepName(program),
    canonicalStepName(program),
    getStepCode(job),
    getStepName(job),
    canonicalStepName(job),
  ].join(' ')
  const broad = broadCareerFromText(combined)
  if (broad) return broad

  return `${finalProgramSignature(program, job)}:${finalJobSignature(job, program)}`
}

const pathStatusSignature = (steps) => {
  if (steps.some(isPrivateEducationStep)) return 'PRIVE'
  if (steps.some(isPublicEducationStep)) return 'PUBLIC'
  return 'INCONNU'
}

const broadOutcomeSignature = (path) => {
  const steps = getDisplaySteps(path)
  const job = lastStepOfType(steps, 'METIER')
  const program = finalHigherProgram(steps)
  const establishment = finalEstablishment(steps, program)
  const city = finalPathCity(establishment, program)

  if (!job || !program || !establishment) return visibleOutcomeSignature(path)

  return [
    `ETABLISSEMENT:${finalEstablishmentSignature(establishment)}`,
    `VILLE:${city || 'NON_PRECISEE'}`,
    `STATUT:${pathStatusSignature(steps)}`,
    `DOMAINE:${broadCareerSignature(program, job)}`,
  ].join('|')
}

const visibleDestinationCareerSignature = (path) => {
  const steps = getDisplaySteps(path)
  const job = lastStepOfType(steps, 'METIER')
  const establishment = lastStepOfType(steps, 'ETABLISSEMENT')

  if (!job || !establishment) return broadOutcomeSignature(path)

  const careerText = steps
    .filter((step) => getStepType(step) !== 'NIVEAU')
    .map((step) => `${getStepCode(step)} ${getStepName(step)} ${canonicalStepName(step)}`)
    .join(' ')

  const broad = broadCareerFromText(careerText) || finalJobSignature(job, finalHigherProgram(steps))
  const city = normalizeForRules(stepCity(establishment) || '')

  return [
    `ETABLISSEMENT:${finalEstablishmentSignature(establishment)}`,
    `VILLE:${city || 'NON_PRECISEE'}`,
    `STATUT:${pathStatusSignature(steps)}`,
    `DOMAINE:${broad}`,
  ].join('|')
}

const bacLabelByCode = {
  BAC_SM: 'Bac Sciences Mathematiques',
  BAC_SM_A: 'Bac Sciences Mathematiques A',
  BAC_SM_B: 'Bac Sciences Mathematiques B',
  BAC_PC: 'Bac Sciences Physiques-Chimie',
  BAC_SVT: 'Bac Sciences de la Vie et de la Terre',
  BAC_SE: 'Bac Sciences Experimentales',
  BAC_ECO: 'Bac Sciences Economiques',
  BAC_GC: 'Bac Sciences de Gestion Comptable',
  BAC_SGC: 'Bac Sciences de Gestion Comptable',
  BAC_LETTRES: 'Bac Lettres',
  BAC_SH: 'Bac Sciences Humaines',
  BAC_TECH_ELEC: 'Bac Technologies Electriques',
  BAC_TECH_MECA: 'Bac Technologies Mecaniques',
  BAC_TECH_CIVIL: 'Bac Genie Civil',
  BAC_ARTS: 'Bac Arts Appliques',
  BAC_ARTS_APPLIQUES: 'Bac Arts Appliques',
}

const terminalBacOrder = [
  'BAC_SM_A',
  'BAC_SM_B',
  'BAC_SM',
  'BAC_PC',
  'BAC_SVT',
  'BAC_SE',
  'BAC_ECO',
  'BAC_GC',
  'BAC_SGC',
  'BAC_LETTRES',
  'BAC_SH',
  'BAC_TECH_ELEC',
  'BAC_TECH_MECA',
  'BAC_TECH_CIVIL',
  'BAC_ARTS',
  'BAC_ARTS_APPLIQUES',
]

const collectTerminalBacs = (path) =>
  getDisplaySteps(path)
    .filter(isBacSeriesStep)
    .map((step) => {
      const code = normalizeForRules(getStepCode(step))
      return {
        code,
        label: bacLabelByCode[code] || getStepName(step),
      }
    })

const mergeAcceptedBacs = (paths) => {
  const byCode = new Map()

  paths
    .flatMap((path) => [
      ...collectTerminalBacs(path),
      ...(path?.acceptedBacs || path?.bacsAcceptes || []),
    ])
    .forEach((bac) => {
      const code = normalizeForRules(bac?.code || bac)
      const label = bac?.label || bacLabelByCode[code] || String(bac || '').trim()
      if (code && label) byCode.set(code, { code, label })
    })

  return Array.from(byCode.values()).sort((a, b) => {
    const indexA = terminalBacOrder.indexOf(a.code)
    const indexB = terminalBacOrder.indexOf(b.code)
    if (indexA !== -1 || indexB !== -1) return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
    return a.label.localeCompare(b.label, 'fr')
  })
}

const withMergedAlternatives = (path, alternatives) => {
  const acceptedBacs = mergeAcceptedBacs(alternatives)
  const mergedAlternativeCount = alternatives.reduce(
    (count, alternative) => count + Number(alternative?.mergedAlternativeCount || 1),
    0,
  )
  if (acceptedBacs.length <= 1) return path
  return {
    ...path,
    acceptedBacs,
    bacsAcceptes: acceptedBacs,
    mergedAlternativeCount,
  }
}

const dedupeBySignature = (paths = [], signatureForPath = compactFinalPathSignature) => {
  const bestBySignature = new Map()
  const alternativesBySignature = new Map()

  paths.forEach((path) => {
    const signature = signatureForPath(path)
    const existing = bestBySignature.get(signature)
    if (!existing || getScore(path) > getScore(existing) || (getScore(path) === getScore(existing) && getDisplayDuration(path) <= getDisplayDuration(existing))) {
      bestBySignature.set(signature, path)
    }
    alternativesBySignature.set(signature, [...(alternativesBySignature.get(signature) || []), path])
  })

  return Array.from(bestBySignature.entries()).map(([signature, path]) =>
    withMergedAlternatives(path, alternativesBySignature.get(signature) || [path]),
  )
}

export const dedupePaths = (paths = []) =>
  dedupeBySignature(
    dedupeBySignature(
      dedupeBySignature(
        dedupeBySignature(
          dedupeBySignature(paths, compactFinalPathSignature),
          visibleFinalPathSignature,
        ),
        visibleOutcomeSignature,
      ),
      broadOutcomeSignature,
    ),
    visibleDestinationCareerSignature,
  )

export const getAcceptedBacs = (path) => path?.acceptedBacs || path?.bacsAcceptes || []

export const sortPathsForDisplay = (paths = []) =>
  [...paths].sort((a, b) => {
    const scoreDiff = getScore(b) - getScore(a)
    if (scoreDiff) return scoreDiff

    const qualityA = getPathQualityRank(a)
    const qualityB = getPathQualityRank(b)
    if (qualityA !== qualityB) return qualityA - qualityB

    const durationDiff = getDisplayDuration(a) - getDisplayDuration(b)
    if (durationDiff) return durationDiff

    const costDiff = getCost(a) - getCost(b)
    if (costDiff) return costDiff

    return getPathSignature(a).localeCompare(getPathSignature(b), 'fr')
  })

const getPathQualityRank = (path) => {
  const steps = getDisplaySteps(path)
  const hasPublic = steps.some(isPublicEducationStep)
  const hasPrivate = steps.some(isPrivateEducationStep)
  if (hasPublic && !hasPrivate) return 0
  if (hasPublic && hasPrivate) return 1
  if (hasPrivate) return 2
  return 3
}

export const getPathEtabStatus = (path) => {
  const steps = getDisplaySteps(path)
  const hasPublic = steps.some(isPublicEducationStep)
  const hasPrivate = steps.some(isPrivateEducationStep)
  if (hasPrivate) return 'PRIVE'
  if (hasPublic) return 'PUBLIC'
  return ''
}

const backendInterpretation = (path) =>
  firstDefined(path?.interpretationIa, path?.aiInterpretation, path?.interpretation)

export const getPathInterpretation = (path) => {
  const steps = getDisplaySteps(path)
  const start = steps[0]
  const end = steps[steps.length - 1]
  const schools = steps.filter((step) => getStepType(step) === 'ETABLISSEMENT').map(getStepName)
  const formations = steps.filter((step) => getStepType(step) === 'FILIERE').slice(1).map(getStepName)
  const accessSteps = steps
    .map((step, index) => ({ step, index }))
    .filter(({ index }) => index > 0)
    .map(({ step }) => {
      const access = getStepAccess(step)
      const average = getStepMinAverage(step)
      const success = getStepSuccessRate(step)
      return [access && `acces ${access}`, average && `moyenne minimale ${average}`, success && `taux estime ${success}%`]
        .filter(Boolean)
        .join(', ')
    })
    .filter(Boolean)

  const generated = [
    `Ce parcours part de ${getStepName(start)} et vise le metier ${getStepName(end)}. Il dure environ ${formatDuration(getDisplayDuration(path))}, avec un score de ${getScore(path)}.`,
    schools.length
      ? `L'etablissement principal identifie est ${schools.join(', ')}. C'est important pour verifier la ville, les conditions d'acces et les dates de candidature.`
      : "Aucun etablissement precis n'est encore fourni pour ce chemin. Il faut confirmer l'ecole ou la faculte avant de considerer ce parcours comme complet.",
    formations.length
      ? `La progression proposee passe par ${formations.join(' puis ')}.`
      : "Les formations intermediaires ne sont pas encore suffisamment detaillees.",
    accessSteps.length
      ? `Points d'attention: ${accessSteps.join(' ; ')}.`
      : "Les conditions d'acces, moyennes minimales et taux de reussite ne sont pas encore suffisamment renseignes pour toutes les etapes.",
    "Conseil: compare ce parcours avec au moins deux alternatives, surtout si la mobilite, la moyenne ou le type d'acces changent.",
  ].join('\n\n')

  const backendText = backendInterpretation(path)
  if (backendText && backendText.length > 180 && !backendText.startsWith('Ce parcours dure')) {
    return `${backendText}\n\n${generated}`
  }

  return generated
}

const isPrivateEducationStep = (step) => {
  const text = normalizeForRules(`${getStepCode(step)} ${getStepName(step)} ${step?.description || ''}`)
  return /\b(PRIVE|PRIVEE|PRIVATE)\b/.test(text)
    || /INSTITUT .* PRIVE|ECOLE .* PRIVEE|UNIVERSITE .* PRIVEE|POLYTECHNIQUE PRIVE/.test(text)
    || /\b(UM6SS|UM6P|FM6P|FM6MD|FM6SS|FACULTE MOHAMMED VI DE MEDECINE DENTAIRE|MOHAMMED VI DE MEDECINE DENTAIRE|AUI|MUNDIAPOLIS|ISGA|IGA|EMSI|HEM|SUP\s*RH|SUPRH|VATEL|ADALIA|MATCI|OSTELEA|ISIAM|ESCA|HECI|UIR|UPM|UNIVERSITE INTERNATIONALE DE RABAT|UNIVERSITE PRIVEE|ECOLE PRIVEE|INSTITUT PRIVE|ECOLE MOHAMMED VI DE MEDECINE VETERINAIRE|EM6MV|EGE|ECOLE DE GUERRE ECONOMIQUE|ABULCASIS|FPMM|ESGB|IHE PARIS|SUPMTI|HESTIM|ISFORT|UIC|GROUPE IGS|EUROMED|UEMF|ESIG|ESISA|ESMS|ESP|SUPDECO|AL AKHAWAYN|HEC|ART\s*COM|ARTCOM|POLYPREPAS|POLY\s*PREPAS|SUP\s*H|SUPH|SUPINFO|BIOMEDTECH)\b/.test(text)
    || /\bEURO MEDITERR/.test(text)
}

const isPublicEducationStep = (step) => {
  if (isPrivateEducationStep(step)) return false
  const text = normalizeForRules(`${getStepCode(step)} ${getStepName(step)} ${step?.description || ''}`)
  return /\b(FSJES|FLSH|FST|FSBM|FMP|FMPR|FMPO|FMPC|FMPK|FMPM|FMPB|FMD|FMDS|FMDC|ENCG|ENSA|ENSAM|ENSIAS|ENSEM|ENSC|ENSAD|EMI|EHTP|INPT|INSEA|ISCAE|IAV|ISPITS|AIAC|ENS|ENSET|CFI|CRMEF|CPR)\b/.test(text)
    || /FACULTE DE MEDECINE ET DE PHARMACIE|FACULTE DE MEDECINE DENTAIRE|FACULTE DE MEDECINE|FACULTE DES SCIENCES ET TECHNIQUES|FACULTE DES SCIENCES|FACULTE DES LETTRES|FACULTE D ECONOMIE ET DE GESTION|FACULTE D ECONOMIE|FACULTE CHARIAA|FACULTE DE LA LANGUE ARABE|FACULTE DE DROIT ET DES SCIENCES|FACULTE DES SCIENCES JURIDIQUES/.test(text)
    || /ECOLE HASSANIA DES TRAVAUX PUBLICS|ECOLE NATIONALE D ARCHITECTURE|ECOLE NATIONALE DES SCIENCES APPLIQUEES|ECOLE NATIONALE SUPERIEURE D ELECTRICITE|ECOLE NATIONALE SUPERIEURE D INFORMATIQUE|ECOLE NATIONALE SUPERIEURE D ARTS ET METIERS|ECOLE NATIONALE SUPERIEURE DE CHIMIE|ECOLE NATIONALE DE COMMERCE ET DE GESTION|ECOLE SUPERIEURE DE TECHNOLOGIE|ECOLE NATIONALE D ADMINISTRATION|ECOLE NORMALE SUPERIEURE|ECOLE NATIONALE SUPERIEURE DE L ENSEIGNEMENT TECHNIQUE/.test(text)
    || /UNIVERSITE HASSAN|UNIVERSITE MOHAMMED V(?!I)|UNIVERSITE IBN TOFAIL|UNIVERSITE IBN ZOHR|UNIVERSITE IBN KHALDOUN|UNIVERSITE SIDI MOHAMMED|UNIVERSITE CADI AYYAD|UNIVERSITE ABDELMALEK ESSAADI|UNIVERSITE SULTAN MOULAY SLIMANE|UNIVERSITE MOULAY ISMAIL|UNIVERSITE CHOUAIB DOUKKALI|UNIVERSITE MOHAMMED PREMIER/.test(text)
}

const privateAnnualCost = (step) => {
  const text = normalizeForRules(`${getStepCode(step)} ${getStepName(step)} ${step?.secteur || ''} ${step?.description || ''}`)
  if (/MEDECINE|DENTAIRE|PHARMACIE/.test(text)) return 90000
  if (/SANTE|INFIRMIER|KINESITHERAPIE|ORTHOPHONIE|ORTHOPTIE|PSYCHOMOTRICITE|SAGE FEMME|RADIOLOGIE/.test(text)) return 60000
  if (/ART\s*COM|ARTCOM|COMMUNICATION VISUELLE|ARCHITECTURE D INTERIEUR/.test(text)) return 50000
  if (/INGENIEUR|INFORMATIQUE|DATA|CYBER|RESEAUX|GENIE|EMSI|HESTIM|SUPMTI/.test(text)) return 55000
  if (/BUSINESS|MANAGEMENT|COMMERCE|MARKETING|FINANCE|COMPTA|AUDIT|MBA|HEM|ISGA|IGA|MUNDIAPOLIS|ESCA/.test(text)) return 45000
  return 35000
}

const inferPrivatePathCost = (path) => {
  const privateSteps = getDisplaySteps(path).filter(isPrivateEducationStep)
  if (!privateSteps.length) return 0
  const years = Math.max(1, Math.ceil(getDisplayDuration(path) / 12))
  const annual = Math.max(...privateSteps.map(privateAnnualCost))
  return annual * years
}

export const getCost = (path) => {
  const displaySteps = getDisplaySteps(path)
  const privateCost = inferPrivatePathCost(path)
  if (!privateCost && displaySteps.some(isPublicEducationStep)) return 0

  const backendCost =
    firstDefined(path?.coutTotal, path?.cout_total, path?.costTotal, path?.cost_total) ??
    getSteps(path).reduce((sum, step) => sum + Number(firstDefined(step?.cout, step?.coutEstime, step?.cout_estime, step?.cost, 0)), 0)

  return Math.max(Number(backendCost || 0), privateCost)
}

export const typeStyles = {
  NIVEAU: 'bg-sky-100 text-sky-950 border-sky-200 dark:bg-sky-950/70 dark:text-sky-100 dark:border-sky-800',
  FILIERE: 'bg-emerald-100 text-emerald-950 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-100 dark:border-emerald-800',
  ETABLISSEMENT: 'bg-blue-900 text-white border-blue-800 dark:bg-blue-950 dark:border-blue-700',
  METIER: 'bg-amber-100 text-amber-950 border-amber-200 dark:bg-amber-950/70 dark:text-amber-100 dark:border-amber-800',
}

export const formatMoney = (value) =>
  new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(Number(value || 0))

export const formatDuration = (months) => {
  const value = Number(months || 0)
  if (value >= 12) {
    const years = value / 12
    return `${Number.isInteger(years) ? years : years.toFixed(1)} an(s)`
  }
  return `${value} mois`
}
