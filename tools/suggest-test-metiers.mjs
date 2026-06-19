import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodes = JSON.parse(await fs.readFile(path.join(dataDir, 'nodes_all.json'), 'utf8'))
const edges = JSON.parse(await fs.readFile(path.join(dataDir, 'edges.json'), 'utf8'))

const byId = new Map(nodes.map((node) => [node.id, node]))
const incomingRecruit = new Map()
const offeredByProgram = new Map()
const accessTo = new Map()

for (const edge of edges) {
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  if (!source || !target) continue

  if (edge.type_lien === 'RECRUTEMENT' && source.type === 'FILIERE' && target.type === 'METIER') {
    if (!incomingRecruit.has(target.code)) incomingRecruit.set(target.code, [])
    incomingRecruit.get(target.code).push({ program: source, job: target })
  }

  if (edge.type_lien === 'OFFERTE_PAR' && source.type === 'FILIERE' && target.type === 'ETABLISSEMENT') {
    if (!offeredByProgram.has(source.id)) offeredByProgram.set(source.id, [])
    offeredByProgram.get(source.id).push(target)
  }

  if (edge.type_lien === 'DONNE_ACCES') {
    if (!accessTo.has(target.id)) accessTo.set(target.id, [])
    accessTo.get(target.id).push(source)
  }
}

const bacLabel = (node) => String(node?.nom_fr || node?.code || '').replace(/^Bac\s+/i, '')

const rows = []
for (const [jobCode, recruitments] of incomingRecruit.entries()) {
  const job = recruitments[0].job
  const programs = new Map()
  const schools = new Map()
  const bacs = new Map()

  for (const { program } of recruitments) {
    programs.set(program.code, program)

    for (const school of offeredByProgram.get(program.id) || []) {
      schools.set(school.code, school)
      for (const bac of accessTo.get(school.id) || []) {
        if (/^BAC_/.test(bac.code || '')) bacs.set(bac.code, bac)
      }
    }

    for (const bac of accessTo.get(program.id) || []) {
      if (/^BAC_/.test(bac.code || '')) bacs.set(bac.code, bac)
    }
  }

  rows.push({
    metier: job.nom_fr,
    code: jobCode,
    secteur: job.secteur,
    formations: programs.size,
    etablissements: schools.size,
    seriesBac: [...bacs.values()].map(bacLabel).slice(0, 5),
    score: recruitments.length + programs.size + schools.size + bacs.size,
  })
}

const preferred = [
  'MEDECIN_GENERALISTE',
  'DATA_ENGINEER',
  'DATA_SCIENTIST',
  'DEVELOPPEUR_FULL_STACK',
  'INGENIEUR_GENIE_INFORMATIQUE',
  'INGENIEUR_CYBERSECURITE',
  'AUDITEUR_FINANCIER',
  'COMPTABLE',
  'EXPERT_COMPTABLE',
  'RESPONSABLE_MARKETING_DIGITAL',
  'RESPONSABLE_LOGISTIQUE',
  'INGENIEUR_GENIE_CIVIL',
  'JURISTE_D_AFFAIRES',
  'ENSEIGNANT_SECONDAIRE',
  'PHARMACIEN',
  'DENTISTE',
  'ARCHITECTE',
  'INGENIEUR_ELECTRIQUE',
  'ADMINISTRATEUR_SYSTEMES_RESEAUX',
  'BUSINESS_ANALYST',
]

const byCode = new Map(rows.map((row) => [row.code, row]))
const suggestions = preferred.map((code) => byCode.get(code)).filter(Boolean)
const already = new Set(suggestions.map((row) => row.code))

suggestions.push(
  ...rows
    .filter((row) => !already.has(row.code))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10),
)

console.log(JSON.stringify(suggestions.slice(0, 25), null, 2))
