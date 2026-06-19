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
    .replace(/_/g, ' ')

const nodes = await readJson(nodesPath)
const edges = await readJson(edgesPath)
const byId = new Map(nodes.map((node) => [node.id, node]))

const expectedDuration = (node) => {
  if (node?.type !== 'FILIERE') return null
  const text = normalize(`${node.code || ''} ${node.nom_fr || ''} ${node.secteur || ''}`)
  const programName = normalize(String(node.nom_fr || '').split(' - ')[0])

  if (/\b(EXPERTISE COMPTABLE|DNEC|D N E C|CYCLE D EXPERTISE)\b/.test(text)) return 36
  if (/\b(DUT|BTS|DEUST|CPGE)\b/.test(text)) return 24
  if (/\b(LICENCE|LICENCES|LST|BAC\+3)\b/.test(text)) return 36
  if (/MEDECINE DENTAIRE|PHARMACIE/.test(programName)) return 72
  if (/DOCTORAT.*MEDECINE|DOCTEUR EN MEDECINE|DIPLOME DE DOCTEUR EN MEDECINE/.test(programName)) return 84
  if (/\b(MASTER|MASTERE|MBA)\b/.test(text)) return 24
  if (/\b(BAC\+5|DIPLOME ENCG|INGENIEUR)\b/.test(text)) return 60
  return null
}

const isBac = (node) => node?.type === 'FILIERE' && /^BAC_/i.test(node.code || '')
const isMaster = (node) => node?.type === 'FILIERE' && /\b(MASTER|MASTERE|MBA)\b/.test(normalize(`${node.code || ''} ${node.nom_fr || ''}`))
const isBacPlus2 = (node) => node?.type === 'FILIERE' && /\b(DUT|BTS|DEUST|CPGE)\b/.test(normalize(`${node.code || ''} ${node.nom_fr || ''}`))
const isEngineerJob = (node) =>
  node?.type === 'METIER' &&
  /\b(INGENIEUR|ENGINEER|ARCHITECTE LOGICIEL|DATA SCIENTIST|DATA ENGINEER)\b/.test(normalize(`${node.code || ''} ${node.nom_fr || ''}`))

const badDurations = nodes
  .map((node) => ({ node, expected: expectedDuration(node) }))
  .filter(({ node, expected }) => expected !== null && Number(node.duree_mois || 0) !== expected)
  .map(({ node, expected }) => ({
    code: node.code,
    nom_fr: node.nom_fr,
    duree_mois: node.duree_mois,
    expected,
  }))

const directBacToMaster = edges
  .filter((edge) => edge.type_lien === 'DONNE_ACCES' && isBac(byId.get(edge.source_id)) && isMaster(byId.get(edge.target_id)))
  .map((edge) => ({
    source: byId.get(edge.source_id)?.code,
    target: byId.get(edge.target_id)?.code,
  }))

const bacPlus2ToEngineer = edges
  .filter((edge) => edge.type_lien === 'RECRUTEMENT' && isBacPlus2(byId.get(edge.source_id)) && isEngineerJob(byId.get(edge.target_id)))
  .map((edge) => ({
    source: byId.get(edge.source_id)?.code,
    sourceName: byId.get(edge.source_id)?.nom_fr,
    target: byId.get(edge.target_id)?.code,
    targetName: byId.get(edge.target_id)?.nom_fr,
  }))

const report = {
  badDurations: badDurations.length,
  directBacToMaster: directBacToMaster.length,
  bacPlus2ToEngineer: bacPlus2ToEngineer.length,
  samples: {
    badDurations: badDurations.slice(0, 20),
    directBacToMaster: directBacToMaster.slice(0, 20),
    bacPlus2ToEngineer: bacPlus2ToEngineer.slice(0, 20),
  },
}

console.log(JSON.stringify(report, null, 2))
