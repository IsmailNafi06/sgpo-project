import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const nodesPath = path.join(root, 'backend', 'src', 'main', 'resources', 'data', 'nodes_all.json')
const edgesPath = path.join(root, 'backend', 'src', 'main', 'resources', 'data', 'edges.json')
const outputPath = path.join(root, 'tools', 'common-300-metiers-audit.json')

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const compact = (value = '') => normalize(value).replace(/\s+/g, '')

const parseLine = (line) => {
  const [name, aliases = ''] = line.split('|').map((part) => part.trim())
  return {
    name,
    aliases: aliases
      .split(',')
      .map((alias) => alias.trim())
      .filter(Boolean),
  }
}

const commonMetiers = `
Medecin generaliste|Medecin, Docteur en medecine
Dentiste|Chirurgien dentiste, Medecin dentiste
Pharmacien|Docteur en pharmacie
Infirmier polyvalent|Infirmier
Sage-femme|Sage femme
Kinesitherapeute|Kine
Psychologue|Psychologue clinicien
Veterinaire|Docteur veterinaire
Technicien de laboratoire medical|Technicien laboratoire, Laborantin
Technicien en radiologie|Manipulateur radio, Technicien radiologie
Aide soignant|Auxiliaire de soins
Ambulancier|Conducteur ambulancier
Preparateur en pharmacie|Assistant pharmacie
Orthophoniste|Logopediste
Orthoptiste|
Psychomotricien|
Nutritionniste|Dieteticien
Opticien lunetier|Opticien
Prothesiste dentaire|
Assistant dentaire|
Developpeur web|Developpeur full stack, Developpeur logiciel
Ingenieur genie informatique|Ingenieur informatique
Data scientist|Scientifique des donnees
Data analyst|Analyste donnees
Data engineer|Ingenieur data
Ingenieur intelligence artificielle|Ingenieur IA, Machine learning engineer
Ingenieur cybersecurite|Analyste cybersecurite
Administrateur systemes et reseaux|Administrateur reseaux
Ingenieur reseaux et telecoms|Ingenieur telecoms
Cloud engineer|Ingenieur cloud
DevOps engineer|Ingenieur DevOps
Chef de projet digital|Chef de projet informatique
UX UI designer|Designer UX, Designer UI
Designer graphique|Infographiste
Community manager|Social media manager
Responsable marketing digital|Specialiste marketing digital
Specialiste SEO|Consultant SEO
Content manager|Redacteur web
Testeur logiciel|QA tester
Technicien support informatique|Support IT
Technicien reseaux informatiques|
Administrateur base de donnees|DBA
Architecte logiciel|
Architecte cloud|
Analyste SOC|
Developpeur mobile|
Developpeur jeux video|
Integrateur web|
Webmaster|
Product owner|
Scrum master|
Comptable|Assistant comptable
Expert comptable|Commissaire aux comptes
Auditeur financier|Auditeur interne
Analyste financier|Analyste investissement
Controleur de gestion|Controleuse de gestion
Actuaire|Actuariat
Gestionnaire banque assurance|Charge de clientele banque
Charge d affaires bancaires|Charge d affaires banque
Fiscaliste|
Tresorier|Gestionnaire tresorerie
Credit manager|
Agent d assurance|Conseiller assurance
Courtier en assurance|
Guichetier bancaire|Agent bancaire
Caissier|Caissiere
Gestionnaire paie|
Assistant administratif et financier|
Juriste d affaires|Juriste
Avocat|Avocate
Notaire|Clerc de notaire
Huissier de justice|
Magistrat|Juge
Greffier|
Conseiller juridique|
Fiscaliste juridique|
Manager commercial|Responsable commercial
Assistant commercial|Commercial
Responsable marketing|Chef de produit marketing
Chef de produit|Product manager
Responsable ressources humaines|Responsable RH
Gestionnaire RH|Charge de recrutement
Business analyst|Analyste metier
Consultant en management|Consultant strategie
Entrepreneur|Createur entreprise
Responsable logistique|Supply chain manager
Gestionnaire de stock|Magasinier
Acheteur|Responsable achats
Responsable import export|Transit et douane
Vendeur|Conseiller de vente
Chef de rayon|
Responsable magasin|
Teleconseiller|Conseiller client
Charge de clientele|
Assistant de direction|Secretaire de direction
Secretaire bureautique|
Office manager|
Agent immobilier|Conseiller immobilier
Gestionnaire de copropriete|Syndic
Ingenieur genie civil|Ingenieur BTP
Conducteur de travaux BTP|Chef de chantier
Architecte|Architecte batiment
Urbaniste|Amenagement urbain
Architecte d interieur|Decorateur interieur
Ingenieur electrique|Ingenieur genie electrique
Ingenieur mecanique|Ingenieur genie mecanique
Ingenieur industriel|Ingenieur genie industriel
Ingenieur automobile|Genie automobile
Ingenieur aeronautique|Genie aeronautique
Ingenieur energies renouvelables|Ingenieur energie solaire
Technicien maintenance industrielle|Maintenance industrielle
Technicien electricien|Electricien
Mecanicien automobile|Technicien automobile
Technicien QHSE|Qualite hygiene securite environnement
Responsable qualite|Quality manager
Ingenieur agronome|Agronome
Technicien agro-industrie|Agroalimentaire
Technicien froid et climatisation|Frigoriste
Technicien genie civil|
Technicien topographe|Geometre topographe
Metreur|Economiste de la construction
Dessinateur projeteur|Dessin batiment
Conducteur d engins BTP|
Chef de chantier|
Plombier|
Menuisier aluminium|
Soudeur|
Chaudronnier|
Tourneur fraiseur|
Technicien methodes|
Technicien production|
Automaticien|
Electromecanicien|
Mecatronicien|
Technicien textile|
Operateur machine|
Responsable production|
Responsable maintenance|
Ingenieur process|
Ingenieur qualite|
Ingenieur HSE|
Ingenieur environnement|
Technicien environnement|
Technicien traitement des eaux|
Technicien energie solaire|
Installateur panneaux solaires|
Enseignant primaire|Professeur primaire
Enseignant secondaire|Professeur secondaire
Professeur universitaire|Enseignant chercheur
Educateur specialise|Educatrice specialisee
Traducteur interprete|Traducteur
Journaliste|Reporter
Photographe|Photographe professionnel
Videaste monteur|Monteur video
Producteur audiovisuel|Audiovisuel
Guide touristique|Guide de tourisme
Receptionniste hotel|Receptionniste
Manager hotelier|Directeur hotel
Chef cuisinier|Cuisinier
Pilote de ligne|Pilote avion
Hotesse de l air steward|Personnel navigant commercial
Policier|Police
Gendarme|Gendarmerie
Officier militaire|Militaire
Douanier|Inspecteur des douanes
Pompier|Protection civile
Assistant social|Travailleur social
Educateur sportif|Coach sportif
Biologiste|Biologie
Chimiste|Ingenieur chimiste
Geologue|Geosciences
Statisticien|Data statisticien
Economiste|Analyste economique
Chercheur scientifique|Recherche scientifique
Professeur de langues|
Conseiller d orientation|
Formateur professionnel|
Bibliothecaire|
Archiviste|
Documentaliste|
Animateur socioculturel|
Moniteur auto ecole|
Assistant pedagogique|
Coach scolaire|
Technicien audiovisuel|
Regisseur son|
Regisseur lumiere|
Designer produit|
Styliste modéliste|Styliste, Modeliste
Decorateur|
Artisan bijoutier|Bijoutier
Coiffeur|
Estheticienne|Estheticien
Maquilleur professionnel|
Patissier|
Boulanger|
Boucher|
Serveur restaurant|
Barman|
Agent de voyage|
Agent d escale|
Agent de reservation|
Steward maritime|
Responsable restauration|
Gouvernante hotel|
Concierge hotel|
Agent securite|
Agent de nettoyage|
Agent de maintenance batiment|
Agriculteur|
Technicien agricole|
Eleveur|
Technicien irrigation|
Technicien horticulture|
Technicien peche maritime|
Technicien aquaculture|
Responsable exploitation agricole|
Veterinaire rural|
Technicien forestier|
Commercial agricole|
Ingenieur agroalimentaire|
Responsable laboratoire agroalimentaire|
Technicien controle qualite alimentaire|
Responsable achats agricoles|
Consultant agricole|
Ingenieur hydraulique|
Ingenieur mines|
Technicien mines|
Technicien geologie|
Responsable securite industrielle|
Gestionnaire transport|
Chauffeur livreur|
Chauffeur poids lourd|
Conducteur bus|
Declarant en douane|
Transitaire|
Agent maritime|
Gestionnaire entrepot|
Planificateur production|
Assistant achats|
Merchandiser|
E merchandiser|
Responsable e commerce|
Traffic manager|
Media buyer|
Charge communication|
Responsable communication|
Attaché de presse|Attache de presse
Charge evenementiel|
Commercial export|
Key account manager|
Customer success manager|
Responsable relation client|
Animateur commercial|
Merchandiser visuel|
Courtier immobilier|
Promoteur immobilier|
Gestionnaire locatif|
Administrateur des ventes|
Assistant import export|
Gestionnaire de projet|
Consultant ERP|
Consultant fonctionnel|
Consultant SAP|
Consultant CRM|
Responsable SI|Directeur systemes information
Chef de projet SI|
Ingenieur biomedical|
Technicien biomedical|
Ingenieur materiaux|
Ingenieur chimie industrielle|
Ingenieur petrochimie|
Ingenieur plasturgie|
Technicien plasturgie|
Technicien laboratoire chimie|
Responsable R&D|
Technicien R&D|
Technicien metrologie|
Controleur qualite|
Auditeur qualite|
Responsable securite informatique|
Consultant cybersécurité|Consultant cybersecurite
Forensic analyst|
Data privacy officer|DPO
Risk manager|
Compliance officer|
Auditeur SI|
Analyste credit|
Gestionnaire patrimoine|
Conseiller financier|
Trader|
Courtier bourse|
Responsable recouvrement|
Conseiller fiscal|
Chef comptable|
Directeur administratif et financier|DAF
Controleur interne|
Assistant juridique|
Clerc de notaire|
Médiateur|Mediateur
Diplomate|
Administrateur public|
Inspecteur des impots|
Inspecteur du travail|
Agent communal|
Redacteur territorial|
Conservateur foncier|
Officier d etat civil|
`.trim()

const requested = commonMetiers
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map(parseLine)

const uniqueRequested = []
const seenRequested = new Set()
for (const item of requested) {
  const key = normalize(item.name)
  if (seenRequested.has(key)) continue
  seenRequested.add(key)
  uniqueRequested.push(item)
}

const top300 = uniqueRequested.slice(0, 300)

const nodes = JSON.parse((await fs.readFile(nodesPath, 'utf8')).replace(/^\uFEFF/, ''))
const edges = JSON.parse((await fs.readFile(edgesPath, 'utf8')).replace(/^\uFEFF/, ''))
const jobs = nodes.filter((node) => node.type === 'METIER')
const nodesById = new Map(nodes.map((node) => [node.id, node]))

const jobSearch = jobs.map((job) => ({
  id: job.id,
  code: job.code,
  nom_fr: job.nom_fr,
  secteur: job.secteur,
  normalized: normalize(`${job.code} ${job.nom_fr} ${job.secteur || ''}`),
  compacted: compact(`${job.code} ${job.nom_fr} ${job.secteur || ''}`),
}))

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

const matchOne = ({ name, aliases }) => {
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

const rows = top300.map(matchOne).map((row) => {
  if (!row.match) return { ...row, recruitmentPrograms: 0, hasJourney: false }
  return {
    ...row,
    recruitmentPrograms: incomingRecruitmentCount(row.match.id),
    hasJourney: hasJourneyToJob(row.match.id),
  }
})

const compactRow = ({ requested: name, aliases, status, recruitmentPrograms, hasJourney, match }) => ({
  requested: name,
  aliases,
  status,
  recruitmentPrograms,
  hasJourney,
  match: match ? { code: match.code, nom_fr: match.nom_fr, secteur: match.secteur } : null,
})

const report = {
  summary: {
    checked: rows.length,
    exact: rows.filter((row) => row.status === 'exact').length,
    near: rows.filter((row) => row.status === 'near').length,
    missing: rows.filter((row) => row.status === 'missing').length,
    withRecruitment: rows.filter((row) => row.recruitmentPrograms > 0).length,
    withJourney: rows.filter((row) => row.hasJourney).length,
  },
  missing: rows.filter((row) => row.status === 'missing').map(compactRow),
  near: rows.filter((row) => row.status === 'near').map(compactRow),
  noJourney: rows.filter((row) => row.status !== 'missing' && !row.hasJourney).map(compactRow),
  lowCoverage: rows.filter((row) => row.hasJourney && row.recruitmentPrograms > 0 && row.recruitmentPrograms < 2).map(compactRow),
}

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
