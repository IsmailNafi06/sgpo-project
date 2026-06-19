import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const nodesPath = path.join(root, 'backend', 'src', 'main', 'resources', 'data', 'nodes_all.json')
const outputPath = path.join(root, 'frontend', 'src', 'data', 'backendMetiers.js')

const readJson = async (file) => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))

const normalizeAlias = (value = '') =>
  cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const cleanText = (value = '') =>
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
    .replace(/â€“/g, '-')
    .replace(/â€”/g, '-')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'Oe')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const hasEncodedGarbage = (value = '') => /%[0-9a-f]{2}|25D8|25D9|25EF|25BA|25BB/i.test(String(value))

const isReadableJob = (node) => {
  const label = cleanText(node.nom_fr)
  if (!node.code || !label) return false
  if (hasEncodedGarbage(`${node.code} ${label}`)) return false
  if (!/[A-Za-z]{3}/.test(label)) return false
  if (/^(metiers?|fiches metiers?|tests metiers?|formations?|secteurs? de formation|orientation)$/i.test(label)) return false
  return true
}

const manualAliases = {
  DATA_ANALYST_SUPPLY_CHAIN: ['data analyst', 'analyste data', 'business intelligence', 'bi'],
  DATA_SCIENTIST: ['data science', 'scientifique des donnees'],
  DATA_ENGINEER: ['ingenieur data', 'big data', 'data engineering'],
  INGENIEUR_CYBERSECURITE: ['cyber', 'cybersecurite', 'securite informatique'],
  PILOTE_DE_LIGNE: ['pilote', 'aviation'],
  ADMINISTRATEUR_SYSTEMES_RESEAUX: ['admin reseau', 'systemes reseaux', 'reseaux'],
  DEVELOPPEUR_FULL_STACK: ['developpeur web', 'full stack', 'web'],
  MEDECIN_GENERALISTE: ['medecin', 'medecine', 'docteur'],
  PHARMACIEN: ['pharmacie'],
  DENTISTE: ['medecine dentaire', 'chirurgien dentiste'],
  ENSEIGNANT: ['professeur', 'prof', 'education'],
  ENSEIGNANT_SECONDAIRE: ['professeur secondaire', 'enseignant'],
  COMPTABLE: ['comptabilite'],
  EXPERT_COMPTABLE: ['expertise comptable'],
  CONTROLEUR_DE_GESTION: ['controle gestion'],
  INGENIEUR_GENIE_INFORMATIQUE: ['ingenieur informatique'],
  INGENIEUR_RESEAU_ET_TELECOMS: ['reseaux telecoms', 'telecom'],
  ARCHITECTE: ['architecture'],
  AVOCAT: ['droit', 'juriste'],
  JURISTE_D_AFFAIRES: ['juriste', 'droit affaires'],
}

const nodes = await readJson(nodesPath)
const metiers = nodes
  .filter((node) => node.type === 'METIER' && isReadableJob(node))
  .map((node) => {
    const aliases = new Set([
      ...(manualAliases[node.code] || []),
      normalizeAlias(node.nom_fr),
      normalizeAlias(node.code.replace(/_/g, ' ')),
      normalizeAlias(node.secteur),
    ].filter(Boolean))

    return {
      code: node.code,
      label: cleanText(node.nom_fr),
      secteur: cleanText(node.secteur || ''),
      aliases: Array.from(aliases).filter((alias) => alias && alias !== normalizeAlias(node.nom_fr)),
    }
  })
  .sort((a, b) => a.label.localeCompare(b.label, 'fr'))

const file = `// Generated from backend/src/main/resources/data/nodes_all.json.
// Run: node tools/sync-frontend-metiers.mjs

export const backendMetiers = ${JSON.stringify(metiers, null, 2)}
`

await fs.writeFile(outputPath, file, 'utf8')
console.log(JSON.stringify({ metiers: metiers.length, output: outputPath }, null, 2))
