import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodes = JSON.parse(await fs.readFile(path.join(dataDir, 'nodes_all.json'), 'utf8'))
const edges = JSON.parse(await fs.readFile(path.join(dataDir, 'edges.json'), 'utf8'))

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/_/g, ' ')
    .replace(/[^A-Z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const byId = new Map(nodes.map((node) => [node.id, node]))
const byCode = new Map(nodes.map((node) => [node.code, node]))
const edgeKey = (edge) => `${edge.source_id}|${edge.target_id}|${edge.type_lien}`

const isProgram = (node) => node?.type === 'FILIERE'
const isSchool = (node) => node?.type === 'ETABLISSEMENT'
const isJob = (node) => node?.type === 'METIER'
const textOf = (node) => normalize(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.secteur || ''}`)

const isLicence = (node) => /\b(LICENCE|BAC\+3|BACHELOR)\b/.test(textOf(node))
const isBacPlus2 = (node) => /\b(DUT|BTS|DEUST|CPGE)\b/.test(textOf(node))
const isEngineerJob = (node) => /\b(INGENIEUR|ENGINEER|DATA SCIENTIST|DATA ENGINEER|ARCHITECTE LOGICIEL)\b/.test(textOf(node))
const isGeneralDoctorJob = (node) => /\bMEDECIN GENERALISTE\b/.test(textOf(node))
const programNameOnly = (node) => normalize(String(node?.nom_fr || '').split(/\s+-\s+/)[0] || String(node?.nom_fr || ''))
const isGeneralMedicineProgram = (node) =>
  /\b(DOCTORAT EN MEDECINE|DOCTEUR EN MEDECINE|DIPLOME D ETAT DE DOCTEUR EN MEDECINE|DIPLOME DE DOCTEUR EN MEDECINE)\b/.test(programNameOnly(node)) &&
  !/\b(VETERINAIRE|DENTAIRE|PHARMACIE|BIOTECH|LICENCE|MASTER)\b/.test(programNameOnly(node))
const isFinanceJob = (node) => /\b(AUDITEUR|FINANCIER|COMPTABLE|EXPERT COMPTABLE|CONTROLEUR DE GESTION|ANALYSTE FINANCIER)\b/.test(textOf(node))
const isFinanceProgram = (node) => /\b(FINANC|COMPTA|AUDIT|CONTROLE DE GESTION|BANQUE|ASSURANCE|ISCAE|ENCG|FISCAL|EXPERTISE COMPTABLE)\b/.test(textOf(node))
const isTechJob = (node) => /\b(DATA|DEVELOPPEUR|INFORMATIQUE|CYBER|RESEAUX|LOGICIEL|GENIE INFORMATIQUE|SYSTEME D INFORMATION)\b/.test(textOf(node))
const isTechProgram = (node) => /\b(INFORMATIQUE|DATA|CYBER|RESEAUX|LOGICIEL|INTELLIGENCE ARTIFICIELLE|GENIE INFORMATIQUE|DIGITAL|TELECOM|STATISTIQUE|MATHEMATIQUE)\b/.test(textOf(node))
const isIavSchool = (node) => /\b(IAV|AGRONOMIQUE|VETERINAIRE)\b/.test(textOf(node))
const isIavProgram = (node) => /\b(APESA|VETERINAIRE|AGRONOMIE|AGRONOME|AGRONOMIQUE|AGRO|HALIEUTIQUE|FOREST|EAU|ENVIRONNEMENT|RURAL|HORTICOLE|ZOOTECHNIE|PROTECTION DES PLANTES|INDUSTRIES AGRICOLES)\b/.test(textOf(node))
const isPrivateSchool = (node) =>
  /\b(UM6SS|UM6P|MUNDIAPOLIS|ISGA|IGA|EMSI|HEM|ESCA|SUPMTI|HESTIM|ISFORT|UIC|GROUPE IGS|UNIVERSITE PRIVEE|ECOLE PRIVEE)\b/.test(textOf(node))

const offersByProgram = new Map()
const recruitmentsByJob = new Map()
for (const edge of edges) {
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  if (edge.type_lien === 'OFFERTE_PAR' && isProgram(source) && isSchool(target)) {
    if (!offersByProgram.has(source.id)) offersByProgram.set(source.id, [])
    offersByProgram.get(source.id).push(target)
  }
  if (edge.type_lien === 'RECRUTEMENT' && isProgram(source) && isJob(target)) {
    if (!recruitmentsByJob.has(target.id)) recruitmentsByJob.set(target.id, [])
    recruitmentsByJob.get(target.id).push(source)
  }
}

const duplicateCodes = nodes.length - new Set(nodes.map((node) => node.code)).size
const duplicateEdges = edges.length - new Set(edges.map(edgeKey)).size
const orphanEdges = edges.filter((edge) => !byId.has(edge.source_id) || !byId.has(edge.target_id))

const issues = {
  duplicateCodes,
  duplicateEdges,
  orphanEdges: orphanEdges.length,
  encodedLabels: nodes.filter((node) => /%25|%[0-9A-F]{2}/i.test(`${node.code} ${node.nom_fr || ''}`)).length,
  scrapeLabelsVisible: nodes.filter((node) => /^SCRAPE_/i.test(node.nom_fr || '')).length,
  schoolAsSourceToSchool: edges.filter((edge) => isSchool(byId.get(edge.source_id)) && isSchool(byId.get(edge.target_id))).length,
  jobsAsSource: edges.filter((edge) => isJob(byId.get(edge.source_id))).length,
  programsWithoutSchool: nodes.filter((node) => isProgram(node) && !/^1BAC_|^BAC_/.test(node.code || '') && !offersByProgram.has(node.id)).length,
  privateSchoolZeroCostPrograms: 0,
  licenceToEngineerRecruitments: 0,
  bacPlus2ToEngineerRecruitments: 0,
  badGeneralDoctorRecruitments: 0,
  financeDomainMismatches: 0,
  techDomainMismatches: 0,
  iavOfferMismatches: 0,
  jobsWithoutRecruitment: nodes.filter((node) => isJob(node) && !recruitmentsByJob.has(node.id)).length,
}

for (const edge of edges) {
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  if (edge.type_lien === 'OFFERTE_PAR' && isProgram(source) && isSchool(target)) {
    if (isPrivateSchool(target) && Number(source.cout_estime || 0) <= 0) issues.privateSchoolZeroCostPrograms += 1
    if (isIavSchool(target) && !isIavProgram(source)) issues.iavOfferMismatches += 1
  }
  if (edge.type_lien === 'RECRUTEMENT' && isProgram(source) && isJob(target)) {
    const sourceText = textOf(source)
    const targetText = textOf(target)
    if (isLicence(source) && isEngineerJob(target)) issues.licenceToEngineerRecruitments += 1
    if (isBacPlus2(source) && isEngineerJob(target)) issues.bacPlus2ToEngineerRecruitments += 1
    if (isGeneralDoctorJob(target) && !isGeneralMedicineProgram(source)) issues.badGeneralDoctorRecruitments += 1
    if (!/SYSTEMES D INFORMATION.*FINANCE.*CONTROLE|FINANCE.*CONTROLE/.test(sourceText) || !/CONTROLEUR DE GESTION|AUDITEUR SI/.test(targetText)) {
      if (isFinanceJob(target) && !isFinanceProgram(source)) issues.financeDomainMismatches += 1
      if (isTechJob(target) && !isTechProgram(source)) issues.techDomainMismatches += 1
    }
  }
}

const blockingChecks = [
  'duplicateCodes',
  'duplicateEdges',
  'orphanEdges',
  'encodedLabels',
  'scrapeLabelsVisible',
  'schoolAsSourceToSchool',
  'jobsAsSource',
  'privateSchoolZeroCostPrograms',
  'licenceToEngineerRecruitments',
  'iavOfferMismatches',
].filter((key) => issues[key] > 0)

const heuristicWarnings = [
  'bacPlus2ToEngineerRecruitments',
  'badGeneralDoctorRecruitments',
  'financeDomainMismatches',
  'techDomainMismatches',
].filter((key) => issues[key] > 0)

const report = {
  totals: {
    nodes: nodes.length,
    edges: edges.length,
    schools: nodes.filter(isSchool).length,
    programs: nodes.filter(isProgram).length,
    jobs: nodes.filter(isJob).length,
  },
  blockingPassed: blockingChecks.length === 0,
  blockingChecks,
  heuristicWarnings,
  issues,
  notes: [
    'programsWithoutSchool and jobsWithoutRecruitment are informational: imported catalogs may include entries not yet used in a path.',
    'heuristicWarnings are broad text checks. Confirm final path quality with audit-path-coherence, audit-duration-rules and audit-costs-and-health.',
    'Backend should still guard path transitions, because reversing OFFERTE_PAR can let a path jump between unrelated programs in the same establishment.',
  ],
}

console.log(JSON.stringify(report, null, 2))
