import fs from 'node:fs'
import crypto from 'node:crypto'

const nodesPath = 'backend/src/main/resources/data/nodes_all.json'
const edgesPath = 'backend/src/main/resources/data/edges.json'
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'))
const writeJson = (path, data) => fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()

const cityAliases = new Map([
  ['CASA', 'CASABLANCA'],
  ['CASABLANCA', 'CASABLANCA'],
  ['RABAT', 'RABAT'],
  ['SALE', 'SALE'],
  ['KENITRA', 'KENITRA'],
  ['TANGER', 'TANGER'],
  ['TETOUAN', 'TETOUAN'],
  ['MARRAKECH', 'MARRAKECH'],
  ['MARRAKESH', 'MARRAKECH'],
  ['FES', 'FES'],
  ['FEZ', 'FES'],
  ['MEKNES', 'MEKNES'],
  ['OUJDA', 'OUJDA'],
  ['AGADIR', 'AGADIR'],
  ['EL JADIDA', 'EL JADIDA'],
  ['SETTAT', 'SETTAT'],
  ['MOHAMMEDIA', 'MOHAMMEDIA'],
  ['BENI MELLAL', 'BENI MELLAL'],
  ['KHOURIBGA', 'KHOURIBGA'],
  ['SAFI', 'SAFI'],
  ['ESSAOUIRA', 'ESSAOUIRA'],
  ['LAAYOUNE', 'LAAYOUNE'],
  ['DAKHLA', 'DAKHLA'],
])

const canonicalCity = (value = '') => {
  const text = normalize(value)
  if (!text) return ''
  if (cityAliases.has(text)) return cityAliases.get(text)
  for (const [alias, city] of cityAliases) {
    if (text.includes(alias)) return city
  }
  return text
}

const nodeName = (node) => node?.nom_fr || node?.nom || node?.label || ''
const nodeText = (node) => normalize(`${node?.code || ''} ${nodeName(node)} ${node?.ville || ''}`)
const nodeCity = (node) => canonicalCity(node?.ville || nodeText(node))

const isNodeType = (node, type) => node?.type === type

const hasImpossibleDuration = (node) => {
  const text = nodeText(node)
  const rawCode = String(node.code || '')
  if (!isNodeType(node, 'FILIERE')) return false
  if (/^(BAC|1BAC)_/.test(rawCode)) return Number(node.duree_mois || 0) !== 12
  if (/\b(BTS|DUT|DEUST|CPGE)\b/.test(text)) return Number(node.duree_mois || 0) > 30
  if (/\b(LICENCE|BAC 3|BAC\+3)\b/.test(text)) return Number(node.duree_mois || 0) !== 36
  if (/\b(MASTER|BAC 5|BAC\+5|INGENIEUR|CYCLE INGENIEUR|DIPLOME ENCG)\b/.test(text)) return Number(node.duree_mois || 0) < 48
  if (/\b(MEDECINE|DOCTEUR EN MEDECINE)\b/.test(text) && !/\bDENTAIRE|PHARMACIE|VETERINAIRE\b/.test(text)) return Number(node.duree_mois || 0) < 84
  if (/\b(PHARMACIE|MEDECINE DENTAIRE|DENTAIRE)\b/.test(text)) return Number(node.duree_mois || 0) < 72
  return false
}

const correctDuration = (node) => {
  const text = nodeText(node)
  const rawCode = String(node.code || '')
  if (/^(BAC|1BAC)_/.test(rawCode)) return 12
  if (/\b(BTS|DUT|DEUST|CPGE)\b/.test(text)) return 24
  if (/\b(LICENCE|BAC 3|BAC\+3)\b/.test(text)) return 36
  if (/\b(MEDECINE|DOCTEUR EN MEDECINE)\b/.test(text) && !/\bDENTAIRE|PHARMACIE|VETERINAIRE\b/.test(text)) return 84
  if (/\b(PHARMACIE|MEDECINE DENTAIRE|DENTAIRE)\b/.test(text)) return 72
  if (/\b(MASTER|BAC 5|BAC\+5|INGENIEUR|CYCLE INGENIEUR|DIPLOME ENCG)\b/.test(text)) return 60
  return node.duree_mois
}

const sameCampusEdgeIsImpossible = (edge, byId) => {
  if (edge.type_lien !== 'OFFERTE_PAR') return false
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  if (!source || !target) return true
  const hasEstablishment = isNodeType(source, 'ETABLISSEMENT') || isNodeType(target, 'ETABLISSEMENT')
  const hasFormation = isNodeType(source, 'FILIERE') || isNodeType(target, 'FILIERE')
  if (!hasEstablishment || !hasFormation) return false

  const sourceCity = nodeCity(source)
  const targetCity = nodeCity(target)
  if (!sourceCity || !targetCity) return false
  return sourceCity !== targetCity
}

const needsCleanCodeLabel = (node) => /^SCRAPE_|^F9R_/.test(String(node.code || '')) && !nodeName(node)

const nodes = readJson(nodesPath)
const edges = readJson(edgesPath)

fs.copyFileSync(nodesPath, `${nodesPath}.bak_livrable_${stamp}`)
fs.copyFileSync(edgesPath, `${edgesPath}.bak_livrable_${stamp}`)

let renamedFirstBac = 0
let durationFixes = 0
let cleanLabels = 0
let mergedDuplicateInstitutions = 0

const mergeDuplicateNodes = (canonicalCode, duplicateCodes, updates = {}) => {
  const canonical = nodes.find((node) => node.code === canonicalCode)
  if (!canonical) return

  Object.assign(canonical, updates)

  const duplicateIds = new Set(
    nodes
      .filter((node) => duplicateCodes.includes(node.code))
      .map((node) => node.id),
  )

  if (!duplicateIds.size) return

  for (const edge of edges) {
    if (duplicateIds.has(edge.source_id)) edge.source_id = canonical.id
    if (duplicateIds.has(edge.target_id)) edge.target_id = canonical.id
  }

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (duplicateIds.has(nodes[index].id)) {
      nodes.splice(index, 1)
      mergedDuplicateInstitutions += 1
    }
  }
}

mergeDuplicateNodes(
  'FM6MD_RABAT',
  ['SCRAPE_9RAYTI_ECOLE_FACULTE_MOHAMMED_VI_DE_MEDECINE_DENTAIRE_DE_RABAT_UM6SS'],
  {
    nom_fr: 'Faculte Mohammed VI de Medecine Dentaire Rabat - UM6SS',
    cout_estime: 540000,
    description: 'Faculte de medecine dentaire privee de l UM6SS a Rabat. Cout indicatif consolide pour le cycle complet.',
  },
)

mergeDuplicateNodes(
  'FM6MD_CASABLANCA',
  ['SCRAPE_9RAYTI_ECOLE_FACULTE_MOHAMMED_VI_DE_MEDECINE_DENTAIRE_DE_CASABLANCA_UM6SS'],
  {
    nom_fr: 'Faculte Mohammed VI de Medecine Dentaire Casablanca - UM6SS',
    cout_estime: 540000,
    description: 'Faculte de medecine dentaire privee de l UM6SS a Casablanca. Cout indicatif consolide pour le cycle complet.',
  },
)

for (const node of nodes) {
  if (/FM6MD|FACULTE MOHAMMED VI DE MEDECINE DENTAIRE|MOHAMMED VI DE MEDECINE DENTAIRE/.test(nodeText(node))) {
    node.secteur = 'Sante privee'
    node.cout_estime = Math.max(Number(node.cout_estime || 0), 540000)
    if (!String(node.description || '').includes('prive')) {
      node.description = `${node.description || nodeName(node)}. Etablissement prive UM6SS, cout indicatif consolide.`
    }
  }

  if (node.code === '1BAC_SE') {
    node.nom_fr = '1ere Bac Sciences Experimentales'
    node.description = 'Premiere annee du baccalaureat Sciences Experimentales. Les specialisations terminales sont precisees dans les bacs acceptes.'
    renamedFirstBac += 1
  }

  if (hasImpossibleDuration(node)) {
    node.duree_mois = correctDuration(node)
    durationFixes += 1
  }

  if (needsCleanCodeLabel(node)) {
    node.nom_fr = String(node.code)
      .replace(/^SCRAPE_9RAYTI_(FORMATION|ECOLE)_/, '')
      .replace(/^F9R_/, '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase())
    cleanLabels += 1
  }
}

const byId = new Map(nodes.map((node) => [node.id, node]))
const filteredEdges = []
let removedCrossCityOffers = 0
let removedDanglingEdges = 0
const seenEdges = new Set()
let removedDuplicateEdges = 0

for (const edge of edges) {
  if (!byId.has(edge.source_id) || !byId.has(edge.target_id)) {
    removedDanglingEdges += 1
    continue
  }
  if (sameCampusEdgeIsImpossible(edge, byId)) {
    removedCrossCityOffers += 1
    continue
  }
  const key = `${edge.source_id}|${edge.target_id}|${edge.type_lien}|${edge.type_acces || ''}`
  if (seenEdges.has(key)) {
    removedDuplicateEdges += 1
    continue
  }
  seenEdges.add(key)
  filteredEdges.push({
    ...edge,
    id: edge.id || crypto.createHash('sha1').update(key).digest('hex').slice(0, 36),
  })
}

writeJson(nodesPath, nodes)
writeJson(edgesPath, filteredEdges)

console.log(JSON.stringify({
  nodes: nodes.length,
  edgesBefore: edges.length,
  edgesAfter: filteredEdges.length,
  renamedFirstBac,
  durationFixes,
  cleanLabels,
  removedCrossCityOffers,
  removedDanglingEdges,
  removedDuplicateEdges,
  mergedDuplicateInstitutions,
  backups: [`${nodesPath}.bak_livrable_${stamp}`, `${edgesPath}.bak_livrable_${stamp}`],
}, null, 2))
