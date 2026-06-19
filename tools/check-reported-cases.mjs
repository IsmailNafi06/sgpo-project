import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodes = JSON.parse((await fs.readFile(path.join(dataDir, 'nodes_all.json'), 'utf8')).replace(/^\uFEFF/, ''))
const edges = JSON.parse((await fs.readFile(path.join(dataDir, 'edges.json'), 'utf8')).replace(/^\uFEFF/, ''))
const byId = new Map(nodes.map((node) => [node.id, node]))

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

const cases = {
  encgToDutFinance: 0,
  encgToIsgaElJadida: 0,
  sciencesPolitiquesToAuditeurFinancier: 0,
  directBacToMaster: 0,
  publicIngenieurInfoCasablancaPrograms: [],
  deepLearningCasablancaPrograms: [],
  auditeurRabatPrograms: [],
  licenceDroitPrivePublicCostIssues: [],
  expertiseComptableBadDurations: [],
  expertComptableNonCecRecruitments: [],
  programsWithoutSchoolOffers: [],
}

const outgoing = new Map()
const incoming = new Map()
for (const edge of edges) {
  if (!outgoing.has(edge.source_id)) outgoing.set(edge.source_id, [])
  if (!incoming.has(edge.target_id)) incoming.set(edge.target_id, [])
  outgoing.get(edge.source_id).push(edge)
  incoming.get(edge.target_id).push(edge)
}

const offeredSchools = (program) =>
  (outgoing.get(program.id) || [])
    .filter((edge) => edge.type_lien === 'OFFERTE_PAR')
    .map((edge) => byId.get(edge.target_id))
    .filter(Boolean)

const recruitsTo = (program, jobPattern) =>
  (outgoing.get(program.id) || []).some((edge) => {
    const target = byId.get(edge.target_id)
    return edge.type_lien === 'RECRUTEMENT' && target?.type === 'METIER' && jobPattern.test(normalize(`${target.code || ''} ${target.nom_fr || ''}`))
  })

const isPublicSchool = (school) =>
  /(FSJES|FACULTE|UNIVERSITE HASSAN|UNIVERSITE MOHAMMED|UNIVERSITE IBN|UNIVERSITE SIDI|UNIVERSITE CADI|UNIVERSITE ABDELMALEK|ENCG|ENSA|ENSAM|ENSIAS|ENSEM|EMI|EHTP|INPT|INSEA|IAV|EST|FST|FLSH|ISCAE)/.test(
    normalize(`${school?.code || ''} ${school?.nom_fr || ''}`),
  ) &&
  !/(UM6SS|UM6P|MUNDIAPOLIS|ISGA|IGA|EMSI|HEM|ESCA|UIR|UPM|PRIVE|PRIVEE|PRIVATE|UIC|GROUPE IGS)/.test(normalize(`${school?.code || ''} ${school?.nom_fr || ''}`))

const isCecProgram = (program) => /EXPERTISE COMPTABLE|DNEC|CYCLE D EXPERTISE/.test(normalize(`${program?.code || ''} ${program?.nom_fr || ''}`))

for (const edge of edges) {
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  if (!source || !target) continue
  const text = normalize(`${source.code} ${source.nom_fr} ${target.code} ${target.nom_fr}`)

  if (edge.type_lien === 'OFFERTE_PAR' && /DUT.*FINANCE.*COMPT/.test(text) && /ENCG|ECOLE NATIONALE DE COMMERCE/.test(text)) {
    cases.encgToDutFinance += 1
  }
  if (edge.type_lien === 'OFFERTE_PAR' && /ISGA.*EL JADIDA/.test(text) && /ENCG|ECOLE NATIONALE DE COMMERCE/.test(text)) {
    cases.encgToIsgaElJadida += 1
  }
  if (edge.type_lien === 'RECRUTEMENT' && /SCIENCES POLITIQUES/.test(text) && /AUDITEUR FINANCIER|AUDITEUR_FINANCIER/.test(text)) {
    cases.sciencesPolitiquesToAuditeurFinancier += 1
  }
  if (edge.type_lien === 'DONNE_ACCES' && /^BAC_/i.test(source.code || '') && /\b(MASTER|MASTERE|MBA)\b/i.test(`${target.code} ${target.nom_fr}`)) {
    cases.directBacToMaster += 1
  }
}

for (const node of nodes) {
  if (node.type !== 'FILIERE') continue
  const text = normalize(`${node.code || ''} ${node.nom_fr || ''} ${node.secteur || ''}`)
  const schools = offeredSchools(node)
  const schoolText = normalize(schools.map((school) => `${school.code || ''} ${school.nom_fr || ''} ${school.ville || ''}`).join(' '))

  if (
    recruitsTo(node, /INGENIEUR GENIE INFORMATIQUE|INGENIEUR_GENIE_INFORMATIQUE/) &&
    /CASABLANCA/.test(`${text} ${schoolText}`) &&
    schools.some(isPublicSchool)
  ) {
    cases.publicIngenieurInfoCasablancaPrograms.push({
      code: node.code,
      nom_fr: node.nom_fr,
      schools: schools.map((school) => school.nom_fr),
    })
  }

  if (
    recruitsTo(node, /DEEP LEARNING|DEEP_LEARNING|MACHINE LEARNING|DATA SCIENTIST|DATA ENGINEER/) &&
    /CASABLANCA/.test(`${text} ${schoolText}`) &&
    schools.length
  ) {
    cases.deepLearningCasablancaPrograms.push({
      code: node.code,
      nom_fr: node.nom_fr,
      schools: schools.map((school) => school.nom_fr),
    })
  }

  if (recruitsTo(node, /AUDITEUR\b|AUDITEUR_FINANCIER/) && /RABAT/.test(`${text} ${schoolText}`) && schools.length) {
    cases.auditeurRabatPrograms.push({
      code: node.code,
      nom_fr: node.nom_fr,
      schools: schools.map((school) => school.nom_fr),
    })
  }

  if (/DROIT PRIVE/.test(text) && /(FSJES|FACULTE|UNIVERSITE)/.test(`${text} ${schoolText}`) && Number(node.cout_estime || 0) > 0) {
    cases.licenceDroitPrivePublicCostIssues.push({
      code: node.code,
      nom_fr: node.nom_fr,
      cout_estime: node.cout_estime,
      schools: schools.map((school) => school.nom_fr),
    })
  }

  if (isCecProgram(node) && Number(node.duree_mois || 0) !== 36) {
    cases.expertiseComptableBadDurations.push({
      code: node.code,
      nom_fr: node.nom_fr,
      duree_mois: node.duree_mois,
    })
  }

  if (!/^BAC_/i.test(node.code || '') && !schools.length && !isCecProgram(node)) {
    cases.programsWithoutSchoolOffers.push({ code: node.code, nom_fr: node.nom_fr })
  }
}

for (const edge of edges) {
  if (edge.type_lien !== 'RECRUTEMENT') continue
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  if (/EXPERT_COMPTABLE|EXPERT COMPTABLE/.test(normalize(`${target?.code || ''} ${target?.nom_fr || ''}`)) && !isCecProgram(source)) {
    cases.expertComptableNonCecRecruitments.push({
      source: source?.code,
      sourceName: source?.nom_fr,
    })
  }
}

cases.publicIngenieurInfoCasablancaPrograms = cases.publicIngenieurInfoCasablancaPrograms.slice(0, 8)
cases.deepLearningCasablancaPrograms = cases.deepLearningCasablancaPrograms.slice(0, 8)
cases.auditeurRabatPrograms = cases.auditeurRabatPrograms.slice(0, 8)
cases.programsWithoutSchoolOffers = cases.programsWithoutSchoolOffers.slice(0, 20)

console.log(JSON.stringify(cases, null, 2))
