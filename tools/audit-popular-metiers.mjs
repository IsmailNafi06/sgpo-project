import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const nodesPath = path.join(root, 'backend', 'src', 'main', 'resources', 'data', 'nodes_all.json')
const edgesPath = path.join(root, 'backend', 'src', 'main', 'resources', 'data', 'edges.json')
const outputPath = path.join(root, 'tools', 'popular-metiers-audit.json')

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const compact = (value = '') => normalize(value).replace(/\s+/g, '')

const popularMetiers = [
  ['Medecin generaliste', ['Medecin', 'Docteur en medecine']],
  ['Dentiste', ['Chirurgien dentiste', 'Medecin dentiste']],
  ['Pharmacien', ['Docteur en pharmacie']],
  ['Infirmier polyvalent', ['Infirmier']],
  ['Sage-femme', ['Sage femme']],
  ['Kinesitherapeute', ['Kine']],
  ['Psychologue', ['Psychologue clinicien']],
  ['Veterinaire', ['Docteur veterinaire']],
  ['Technicien de laboratoire medical', ['Technicien laboratoire', 'Laborantin']],
  ['Technicien en radiologie', ['Manipulateur radio', 'Technicien radiologie']],
  ['Developpeur web', ['Developpeur full stack', 'Developpeur logiciel']],
  ['Ingenieur genie informatique', ['Ingenieur informatique']],
  ['Data scientist', ['Scientifique des donnees']],
  ['Data analyst', ['Analyste donnees']],
  ['Data engineer', ['Ingenieur data']],
  ['Ingenieur intelligence artificielle', ['Ingenieur IA', 'Machine learning engineer']],
  ['Ingenieur cybersecurite', ['Analyste cybersecurite']],
  ['Administrateur systemes et reseaux', ['Administrateur reseaux']],
  ['Ingenieur reseaux et telecoms', ['Ingenieur telecoms']],
  ['Cloud engineer', ['Ingenieur cloud']],
  ['DevOps engineer', ['Ingenieur DevOps']],
  ['Chef de projet digital', ['Chef de projet informatique']],
  ['UX UI designer', ['Designer UX', 'Designer UI']],
  ['Designer graphique', ['Infographiste']],
  ['Community manager', ['Social media manager']],
  ['Responsable marketing digital', ['Specialiste marketing digital']],
  ['Specialiste SEO', ['Consultant SEO']],
  ['Content manager', ['Redacteur web']],
  ['Comptable', ['Assistant comptable']],
  ['Expert comptable', ['Commissaire aux comptes']],
  ['Auditeur financier', ['Auditeur interne']],
  ['Analyste financier', ['Analyste investissement']],
  ['Controleur de gestion', ['Controleuse de gestion']],
  ['Actuaire', ['Actuariat']],
  ['Gestionnaire banque assurance', ['Charge de clientele banque']],
  ['Charge d affaires bancaires', ['Charge d affaires banque']],
  ['Juriste d affaires', ['Juriste']],
  ['Avocat', ['Avocate']],
  ['Notaire', ['Clerc de notaire']],
  ['Manager commercial', ['Responsable commercial']],
  ['Assistant commercial', ['Commercial']],
  ['Responsable marketing', ['Chef de produit marketing']],
  ['Chef de produit', ['Product manager']],
  ['Responsable ressources humaines', ['Responsable RH']],
  ['Gestionnaire RH', ['Charge de recrutement']],
  ['Business analyst', ['Analyste metier']],
  ['Consultant en management', ['Consultant strategie']],
  ['Entrepreneur', ['Createur entreprise']],
  ['Responsable logistique', ['Supply chain manager']],
  ['Gestionnaire de stock', ['Magasinier']],
  ['Acheteur', ['Responsable achats']],
  ['Responsable import export', ['Transit et douane']],
  ['Ingenieur genie civil', ['Ingenieur BTP']],
  ['Conducteur de travaux BTP', ['Chef de chantier']],
  ['Architecte', ['Architecte batiment']],
  ['Urbaniste', ['Amenagement urbain']],
  ['Architecte d interieur', ['Decorateur interieur']],
  ['Ingenieur electrique', ['Ingenieur genie electrique']],
  ['Ingenieur mecanique', ['Ingenieur genie mecanique']],
  ['Ingenieur industriel', ['Ingenieur genie industriel']],
  ['Ingenieur automobile', ['Genie automobile']],
  ['Ingenieur aeronautique', ['Genie aeronautique']],
  ['Ingenieur energies renouvelables', ['Ingenieur energie solaire']],
  ['Technicien maintenance industrielle', ['Maintenance industrielle']],
  ['Technicien electricien', ['Electricien']],
  ['Mecanicien automobile', ['Technicien automobile']],
  ['Technicien QHSE', ['Qualite hygiene securite environnement']],
  ['Responsable qualite', ['Quality manager']],
  ['Ingenieur agronome', ['Agronome']],
  ['Technicien agro-industrie', ['Agroalimentaire']],
  ['Enseignant primaire', ['Professeur primaire']],
  ['Enseignant secondaire', ['Professeur secondaire']],
  ['Professeur universitaire', ['Enseignant chercheur']],
  ['Educateur specialise', ['Educatrice specialisee']],
  ['Traducteur interprete', ['Traducteur']],
  ['Journaliste', ['Reporter']],
  ['Photographe', ['Photographe professionnel']],
  ['Videaste monteur', ['Monteur video']],
  ['Producteur audiovisuel', ['Audiovisuel']],
  ['Guide touristique', ['Guide de tourisme']],
  ['Receptionniste hotel', ['Receptionniste']],
  ['Manager hotelier', ['Directeur hotel']],
  ['Chef cuisinier', ['Cuisinier']],
  ['Pilote de ligne', ['Pilote avion']],
  ['Hotesse de l air steward', ['Personnel navigant commercial']],
  ['Policier', ['Police']],
  ['Gendarme', ['Gendarmerie']],
  ['Officier militaire', ['Militaire']],
  ['Douanier', ['Inspecteur des douanes']],
  ['Pompier', ['Protection civile']],
  ['Assistant social', ['Travailleur social']],
  ['Educateur sportif', ['Coach sportif']],
  ['Biologiste', ['Biologie']],
  ['Chimiste', ['Ingenieur chimiste']],
  ['Geologue', ['Geosciences']],
  ['Statisticien', ['Data statisticien']],
  ['Economiste', ['Analyste economique']],
  ['Chercheur scientifique', ['Recherche scientifique']],
  ['Agent immobilier', ['Conseiller immobilier']],
  ['Technicien froid et climatisation', ['Frigoriste']],
]

const nodes = JSON.parse((await fs.readFile(nodesPath, 'utf8')).replace(/^\uFEFF/, ''))
const edges = JSON.parse((await fs.readFile(edgesPath, 'utf8')).replace(/^\uFEFF/, ''))
const jobs = nodes.filter((node) => node.type === 'METIER')
const nodesById = new Map(nodes.map((node) => [node.id, node]))
const journeyAdjacency = new Map()

const connect = (from, to) => {
  if (!from || !to) return
  if (!journeyAdjacency.has(from)) journeyAdjacency.set(from, new Set())
  journeyAdjacency.get(from).add(to)
}

for (const edge of edges) {
  if (edge.type_lien === 'ADMISSION') connect(edge.source_id, edge.target_id)
  if (edge.type_lien === 'DONNE_ACCES') connect(edge.source_id, edge.target_id)
  if (edge.type_lien === 'OFFERTE_PAR') connect(edge.target_id, edge.source_id)
  if (edge.type_lien === 'RECRUTEMENT') connect(edge.source_id, edge.target_id)
}

const bacSourceIds = nodes
  .filter((node) => node.type === 'FILIERE' && /^BAC_/i.test(node.code || ''))
  .map((node) => node.id)

const hasJourneyToJob = (jobId) => {
  const queue = bacSourceIds.map((id) => [id, 0])
  const seen = new Set(bacSourceIds)

  while (queue.length) {
    const [current, depth] = queue.shift()
    if (current === jobId) return true
    if (depth >= 7) continue

    for (const next of journeyAdjacency.get(current) || []) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push([next, depth + 1])
    }
  }

  return false
}

const incomingRecruitmentCount = (jobId) =>
  edges.filter((edge) => edge.type_lien === 'RECRUTEMENT' && edge.target_id === jobId && nodesById.get(edge.source_id)?.type === 'FILIERE').length

const jobSearch = jobs.map((job) => ({
  id: job.id,
  code: job.code,
  nom_fr: job.nom_fr,
  secteur: job.secteur,
  normalized: normalize(`${job.code} ${job.nom_fr} ${job.secteur || ''}`),
  compacted: compact(`${job.code} ${job.nom_fr} ${job.secteur || ''}`),
}))

const matchOne = ([name, aliases]) => {
  const terms = [name, ...aliases]
  const primaryExact = jobSearch.find((job) => normalize(job.nom_fr) === normalize(name) || normalize(job.code) === normalize(name).replace(/\s+/g, '_'))
  if (primaryExact) return { requested: name, aliases, status: 'exact', match: primaryExact }

  const exact = jobSearch.find((job) => aliases.some((term) => normalize(job.nom_fr) === normalize(term) || normalize(job.code) === normalize(term).replace(/\s+/g, '_')))
  if (exact) return { requested: name, aliases, status: 'exact', match: exact }

  const compactTerms = terms.map(compact).filter((term) => term.length >= 5)
  const contains = jobSearch.find((job) => compactTerms.some((term) => job.compacted.includes(term) || term.includes(job.compacted)))
  if (contains) return { requested: name, aliases, status: 'near', match: contains }

  const tokenTerms = terms.flatMap((term) => normalize(term).split(/\s+/)).filter((token) => token.length >= 5)
  const fuzzy = jobSearch
    .map((job) => ({
      job,
      score: tokenTerms.reduce((sum, token) => sum + (job.normalized.includes(token) ? 1 : 0), 0),
    }))
    .filter((item) => item.score >= Math.min(2, tokenTerms.length))
    .sort((a, b) => b.score - a.score)[0]

  if (fuzzy) return { requested: name, aliases, status: 'near', match: fuzzy.job }

  return { requested: name, aliases, status: 'missing', match: null }
}

const rows = popularMetiers.map(matchOne)
const enrichedRows = rows.map((row) => {
  if (!row.match) return { ...row, recruitmentPrograms: 0, hasJourney: false }
  return {
    ...row,
    recruitmentPrograms: incomingRecruitmentCount(row.match.id),
    hasJourney: hasJourneyToJob(row.match.id),
  }
})
const summary = {
  checked: enrichedRows.length,
  exact: enrichedRows.filter((row) => row.status === 'exact').length,
  near: enrichedRows.filter((row) => row.status === 'near').length,
  missing: enrichedRows.filter((row) => row.status === 'missing').length,
  withRecruitment: enrichedRows.filter((row) => row.recruitmentPrograms > 0).length,
  withJourney: enrichedRows.filter((row) => row.hasJourney).length,
}

const report = {
  summary,
  noJourney: enrichedRows
    .filter((row) => row.status !== 'missing' && !row.hasJourney)
    .map(({ requested, aliases, recruitmentPrograms, match }) => ({
      requested,
      aliases,
      recruitmentPrograms,
      match: match ? { code: match.code, nom_fr: match.nom_fr, secteur: match.secteur } : null,
    })),
  missing: enrichedRows.filter((row) => row.status === 'missing').map(({ requested, aliases }) => ({ requested, aliases })),
  near: enrichedRows
    .filter((row) => row.status === 'near')
    .map(({ requested, aliases, match, recruitmentPrograms, hasJourney }) => ({
      requested,
      aliases,
      recruitmentPrograms,
      hasJourney,
      match: { code: match.code, nom_fr: match.nom_fr, secteur: match.secteur },
    })),
  exact: enrichedRows
    .filter((row) => row.status === 'exact')
    .map(({ requested, match, recruitmentPrograms, hasJourney }) => ({
      requested,
      recruitmentPrograms,
      hasJourney,
      match: { code: match.code, nom_fr: match.nom_fr, secteur: match.secteur },
    })),
}

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
