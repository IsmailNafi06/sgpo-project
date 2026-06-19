import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodesPath = path.join(dataDir, 'nodes_all.json')
const edgesPath = path.join(dataDir, 'edges.json')

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

const idFrom = (value) => {
  const hex = crypto.createHash('sha1').update(`sgpo:${value}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const titleToCode = (value) =>
  normalize(value)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 110)

const readJson = async (file) => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))

const nodes = await readJson(nodesPath)
const edges = await readJson(edgesPath)
const report = {
  nodesBefore: nodes.length,
  edgesBefore: edges.length,
  nodesAdded: 0,
  edgesAdded: 0,
  durationsCorrected: 0,
  edgesRemoved: 0,
  nodesMerged: 0,
  schoolNodesMerged: 0,
  edgeReferencesUpdated: 0,
  duplicateEdgesMerged: 0,
}

const nodesByCode = new Map(nodes.map((node) => [node.code, node]))
const nodesById = new Map(nodes.map((node) => [node.id, node]))
const edgeKeys = new Set(edges.map((edge) => `${edge.source_id}|${edge.target_id}|${edge.type_lien}`))

const addNode = ({
  type,
  code,
  nom_fr,
  nom_ar = '',
  description = '',
  duree_mois = 0,
  cout_estime = 0,
  secteur = '',
  ville = null,
  score_ia = 0,
}) => {
  const existing = nodesByCode.get(code)
  if (existing) {
    let changed = false
    for (const [key, value] of Object.entries({ nom_fr, description, duree_mois, cout_estime, secteur, ville })) {
      if ((existing[key] === null || existing[key] === '' || existing[key] === 0) && value !== null && value !== '' && value !== 0) {
        existing[key] = value
        changed = true
      }
    }
    if (changed) nodesById.set(existing.id, existing)
    return existing
  }

  const node = {
    id: idFrom(`node:${code}`),
    type,
    code,
    nom_fr,
    nom_ar,
    description,
    duree_mois,
    cout_estime,
    secteur,
    ville,
    score_ia,
    actif: true,
  }
  nodes.push(node)
  nodesByCode.set(code, node)
  nodesById.set(node.id, node)
  report.nodesAdded += 1
  return node
}

const addEdge = ({
  source,
  target,
  type_lien,
  taux_reussite = 72,
  cout_supplementaire = 0,
  duree_supplementaire_mois = 0,
  prerequis_notes = '',
  moyenne_minimale = null,
  type_acces = 'DOSSIER',
}) => {
  const sourceNode = nodesByCode.get(source)
  const targetNode = nodesByCode.get(target)
  if (!sourceNode || !targetNode) return null

  const key = `${sourceNode.id}|${targetNode.id}|${type_lien}`
  if (edgeKeys.has(key)) return null

  const edge = {
    id: idFrom(`edge:${key}`),
    source_id: sourceNode.id,
    target_id: targetNode.id,
    type_lien,
    taux_reussite,
    cout_supplementaire,
    duree_supplementaire_mois,
    prerequis_notes,
    moyenne_minimale,
    type_acces,
  }
  edges.push(edge)
  edgeKeys.add(key)
  report.edgesAdded += 1
  return edge
}

const durationFor = (node) => {
  if (node.type !== 'FILIERE') return node.duree_mois
  const text = normalize(`${node.code} ${node.nom_fr} ${node.description} ${node.secteur}`)
  const programText = normalize(`${node.code} ${String(node.nom_fr || '').split(' - ')[0]} ${node.secteur}`)

  if (programText.includes('MEDECINE DENTAIRE') || programText.includes('DOCTORAT_PHARMACIE') || programText.includes('DOCTORAT EN PHARMACIE') || programText.includes('DOCTEUR EN PHARMACIE')) return 72
  if (programText.includes('DOCTORAT_MEDECINE') || programText.includes('DOCTORAT EN MEDECINE') || programText.includes('DIPLOME DE DOCTEUR EN MEDECINE')) return 84
  if (text.includes('BAC+2') || text.includes('BAC_2') || text.includes('DUT') || text.includes('BTS') || text.includes('CPGE')) return 24
  if (text.includes('BAC+3') || text.includes('BAC_3') || text.includes('LICENCE')) return 36
  if (text.includes('BAC+4') || text.includes('BAC_4') || text.includes('BACHELOR')) return 48
  if (text.includes('BAC+5') || text.includes('BAC_5') || text.includes('MASTER') || text.includes('MASTERE') || text.includes('INGENIEUR') || text.includes('DIPLOME ENCG')) return 60

  return node.duree_mois
}

for (const node of nodes) {
  const corrected = durationFor(node)
  if (Number.isFinite(corrected) && corrected !== node.duree_mois) {
    node.duree_mois = corrected
    report.durationsCorrected += 1
  }
}

const isBts = (node) => normalize(`${node?.code || ''} ${node?.nom_fr || ''}`).includes('BTS')
const isClearlyBtsHost = (node) => /LYCEE|BTS|EST|CENTRE|INSTITUT|ISTA|OFPPT/.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''}`))
const cleanedEdges = edges.filter((edge) => {
  if (edge.type_lien !== 'OFFERTE_PAR') return true
  const source = nodesById.get(edge.source_id)
  const target = nodesById.get(edge.target_id)
  if (isBts(source) && target?.type === 'ETABLISSEMENT' && !isClearlyBtsHost(target)) {
    report.edgesRemoved += 1
    return false
  }
  return true
})
edges.length = 0
edges.push(...cleanedEdges)

const publicSourcesNote =
  'Donnee consolidee depuis referentiels publics marocains: diplomes nationaux bac+2/bac+5/bac+7, CPGE, ENCG et etablissements publics. Duree exprimee en mois apres bac pour rester compatible avec le moteur de parcours.'

const ensureJob = (code, name, secteur) =>
  addNode({
    type: 'METIER',
    code,
    nom_fr: name,
    description: `Metier cible du secteur ${secteur}.`,
    secteur,
  })

const ensureSchool = (code, name, ville, secteur = 'Enseignement superieur') =>
  addNode({
    type: 'ETABLISSEMENT',
    code,
    nom_fr: name,
    description: publicSourcesNote,
    secteur,
    ville,
  })

const ensureProgram = (code, name, duree, secteur, description = publicSourcesNote, cout_estime = 0) =>
  addNode({
    type: 'FILIERE',
    code,
    nom_fr: name,
    description,
    duree_mois: duree,
    cout_estime,
    secteur,
  })

const bacAdmission = (bacs, target, min, access = 'CONCOURS') => {
  for (const bac of bacs) {
    addEdge({
      source: bac,
      target,
      type_lien: 'DONNE_ACCES',
      taux_reussite: 72,
      moyenne_minimale: min,
      type_acces: access,
      prerequis_notes: 'Acces selon dossier, concours ou seuils nationaux selon la filiere et l annee.',
    })
  }
}

const offer = (program, school) =>
  addEdge({
    source: program,
    target: school,
    type_lien: 'OFFERTE_PAR',
    taux_reussite: 100,
    type_acces: 'OUVERT',
  })

const recruit = (program, jobs, rate = 72) => {
  for (const job of jobs) {
    addEdge({
      source: program,
      target: job,
      type_lien: 'RECRUTEMENT',
      taux_reussite: rate,
      type_acces: 'OUVERT',
    })
  }
}

const scientificBacs = ['BAC_SM', 'BAC_PC', 'BAC_SVT', 'BAC_SE']
const engineeringBacs = ['BAC_SM', 'BAC_PC', 'BAC_SE', 'BAC_TECH_ELEC', 'BAC_TECH_MECA']
const economyBacs = ['BAC_ECO', 'BAC_GC', 'BAC_SM', 'BAC_SE']
const literatureBacs = ['BAC_LETTRES', 'BAC_SH']

ensureJob('AUDITEUR_FINANCIER', 'Auditeur financier', 'Finance')
ensureJob('ANALYSTE_FINANCIER', 'Analyste financier', 'Finance')
ensureJob('RESPONSABLE_MARKETING_DIGITAL', 'Responsable marketing digital', 'Marketing')
ensureJob('RESPONSABLE_LOGISTIQUE', 'Responsable logistique', 'Logistique')
ensureJob('RESPONSABLE_RH', 'Responsable ressources humaines', 'Gestion')
ensureJob('INGENIEUR_ELECTRIQUE', 'Ingenieur electrique', 'Ingenierie')
ensureJob('INGENIEUR_MECANIQUE', 'Ingenieur mecanique', 'Ingenierie')
ensureJob('INGENIEUR_INDUSTRIEL', 'Ingenieur industriel', 'Ingenierie')
ensureJob('TECHNICIEN_SUPERIEUR_INFORMATIQUE', 'Technicien superieur en informatique', 'Informatique')
ensureJob('TECHNICIEN_SUPERIEUR_RESEAUX', 'Technicien superieur reseaux', 'Informatique')
ensureJob('TECHNICIEN_GENIE_ELECTRIQUE', 'Technicien genie electrique', 'Ingenierie')
ensureJob('TECHNICIEN_GENIE_MECANIQUE', 'Technicien genie mecanique', 'Industrie')
ensureJob('JURISTE_D_AFFAIRES', 'Juriste d affaires', 'Droit')
ensureJob('ENSEIGNANT_SECONDAIRE', 'Enseignant secondaire', 'Education')
ensureJob('ADMINISTRATEUR_SYSTEMES_RESEAUX', 'Administrateur systemes et reseaux', 'Informatique')
ensureJob('BUSINESS_ANALYST', 'Business analyst', 'Finance')
ensureJob('CONSULTANT_BI', 'Consultant Business Intelligence', 'Informatique')
ensureJob('INGENIEUR_TELECOMS', 'Ingenieur telecoms', 'Informatique')
ensureJob('INGENIEUR_ENERGIES_RENOUVELABLES', 'Ingenieur energies renouvelables', 'Ingenierie')
ensureJob('TECHNICIEN_MAINTENANCE_INDUSTRIELLE', 'Technicien maintenance industrielle', 'Industrie')
ensureJob('ASSISTANT_COMMERCIAL', 'Assistant commercial', 'Commerce')
ensureJob('GESTIONNAIRE_BANQUE_ASSURANCE', 'Gestionnaire banque assurance', 'Finance')
ensureJob('TECHNICIEN_AGROINDUSTRIE', 'Technicien agro-industrie', 'Agroalimentaire')
ensureJob('TECHNICIEN_QHSE', 'Technicien QHSE', 'Qualite')
ensureJob('DENTISTE', 'Dentiste', 'Sante')
ensureJob('CHIRURGIEN_DENTISTE', 'Chirurgien dentiste', 'Sante')
ensureJob('VETERINAIRE', 'Veterinaire', 'Sante')
ensureJob('INFIRMIER_POLYVALENT', 'Infirmier polyvalent', 'Sante')
ensureJob('SAGE_FEMME', 'Sage-femme', 'Sante')
ensureJob('KINESITHERAPEUTE', 'Kinesitherapeute', 'Sante')
ensureJob('PSYCHOLOGUE', 'Psychologue', 'Sante')
ensureJob('ARCHITECTE', 'Architecte', 'Architecture')
ensureJob('URBANISTE', 'Urbaniste', 'Architecture')
ensureJob('AVOCAT', 'Avocat', 'Droit')
ensureJob('NOTAIRE', 'Notaire', 'Droit')

const popularJobs = [
  ['TECHNICIEN_RADIOLOGIE', 'Technicien en radiologie', 'Sante'],
  ['INGENIEUR_CYBERSECURITE', 'Ingenieur cybersecurite', 'Informatique'],
  ['INGENIEUR_CLOUD', 'Ingenieur cloud', 'Informatique'],
  ['CHEF_PROJET_DIGITAL', 'Chef de projet digital', 'Digital'],
  ['UX_UI_DESIGNER', 'UX UI designer', 'Design'],
  ['DESIGNER_GRAPHIQUE', 'Designer graphique', 'Design'],
  ['SPECIALISTE_SEO', 'Specialiste SEO', 'Marketing digital'],
  ['CONTENT_MANAGER', 'Content manager', 'Marketing digital'],
  ['COMPTABLE', 'Comptable', 'Finance'],
  ['RESPONSABLE_MARKETING', 'Responsable marketing', 'Marketing'],
  ['CHEF_DE_PRODUIT', 'Chef de produit', 'Marketing'],
  ['CONSULTANT_MANAGEMENT', 'Consultant en management', 'Conseil'],
  ['ENTREPRENEUR', 'Entrepreneur', 'Entrepreneuriat'],
  ['GESTIONNAIRE_STOCK', 'Gestionnaire de stock', 'Logistique'],
  ['ACHETEUR', 'Acheteur', 'Achats'],
  ['CHARGE_AFFAIRES_BANCAIRES', "Charge d affaires bancaires", 'Finance'],
  ['RESPONSABLE_IMPORT_EXPORT', 'Responsable import export', 'Commerce international'],
  ['ARCHITECTE_INTERIEUR', 'Architecte d interieur', 'Architecture et design'],
  ['INGENIEUR_AUTOMOBILE', 'Ingenieur automobile', 'Industrie automobile'],
  ['INGENIEUR_AERONAUTIQUE', 'Ingenieur aeronautique', 'Aeronautique'],
  ['TECHNICIEN_ELECTRICIEN', 'Technicien electricien', 'Electricite'],
  ['MECANICIEN_AUTOMOBILE', 'Mecanicien automobile', 'Automobile'],
  ['RESPONSABLE_QUALITE', 'Responsable qualite', 'Qualite'],
  ['INGENIEUR_AGRONOME', 'Ingenieur agronome', 'Agronomie'],
  ['ENSEIGNANT_PRIMAIRE', 'Enseignant primaire', 'Education'],
  ['PROFESSEUR_UNIVERSITAIRE', 'Professeur universitaire', 'Education superieure'],
  ['EDUCATEUR_SPECIALISE', 'Educateur specialise', 'Social'],
  ['TRADUCTEUR_INTERPRETE', 'Traducteur interprete', 'Langues'],
  ['PHOTOGRAPHE', 'Photographe', 'Arts et medias'],
  ['VIDEASTE_MONTEUR', 'Videaste monteur', 'Audiovisuel'],
  ['PRODUCTEUR_AUDIOVISUEL', 'Producteur audiovisuel', 'Audiovisuel'],
  ['GUIDE_TOURISTIQUE', 'Guide touristique', 'Tourisme'],
  ['RECEPTIONNISTE_HOTEL', 'Receptionniste hotel', 'Hotellerie'],
  ['MANAGER_HOTELIER', 'Manager hotelier', 'Hotellerie'],
  ['CHEF_CUISINIER', 'Chef cuisinier', 'Restauration'],
  ['PERSONNEL_NAVIGANT_COMMERCIAL', "Hotesse de l air steward", 'Aeronautique'],
  ['POLICIER', 'Policier', 'Securite publique'],
  ['GENDARME', 'Gendarme', 'Securite publique'],
  ['OFFICIER_MILITAIRE', 'Officier militaire', 'Defense'],
  ['DOUANIER', 'Douanier', 'Administration publique'],
  ['POMPIER', 'Pompier', 'Protection civile'],
  ['ASSISTANT_SOCIAL', 'Assistant social', 'Social'],
  ['EDUCATEUR_SPORTIF', 'Educateur sportif', 'Sport'],
  ['BIOLOGISTE', 'Biologiste', 'Sciences'],
  ['CHIMISTE', 'Chimiste', 'Sciences'],
  ['GEOLOGUE', 'Geologue', 'Sciences'],
  ['STATISTICIEN', 'Statisticien', 'Statistique'],
  ['ECONOMISTE', 'Economiste', 'Economie'],
  ['CHERCHEUR_SCIENTIFIQUE', 'Chercheur scientifique', 'Recherche'],
  ['AGENT_IMMOBILIER', 'Agent immobilier', 'Commerce'],
  ['CONSEILLER_COMMERCIAL', 'Conseiller commercial', 'Commerce'],
  ['TECHNICIEN_FROID_CLIMATISATION', 'Technicien froid et climatisation', 'Industrie'],
]

for (const [code, name, sector] of popularJobs) {
  ensureJob(code, name, sector)
}

const ensias = ensureSchool('ENSIAS_RABAT', "Ecole Nationale Superieure d'Informatique et d'Analyse des Systemes Rabat", 'Rabat', 'Informatique')
const inpt = ensureSchool('INPT_RABAT', 'Institut National des Postes et Telecommunications Rabat', 'Rabat', 'Informatique')
const emi = ensureSchool('EMI_RABAT', 'Ecole Mohammadia d Ingenieurs Rabat', 'Rabat', 'Ingenierie')
const ehtp = ensureSchool('EHTP_CASABLANCA', 'Ecole Hassania des Travaux Publics Casablanca', 'Casablanca', 'BTP')
const ensaCasablanca = ensureSchool('ENSA_CASABLANCA', 'Ecole Nationale des Sciences Appliquees Casablanca', 'Casablanca', 'Ingenierie')
const ensem = ensureSchool("ENSEM_CASABLANCA", "Ecole Nationale Superieure d'Electricite et de Mecanique Casablanca", 'Casablanca', 'Ingenierie')

const engineeringPrograms = [
  ['F9R_INGENIERIE_DATA_IA_ENSIAS_RABAT', 'Ingenierie Data & IA - ENSIAS Rabat', ensias.code, ['DATA_ENGINEER', 'DATA_SCIENTIST', 'INGENIEUR_GENIE_INFORMATIQUE']],
  ['F9R_INGENIERIE_CYBERSECURITE_ENSIAS_RABAT', 'Ingenierie Cybersecurite - ENSIAS Rabat', ensias.code, ['INGENIEUR_CYBERSECURITE', 'ARCHITECTE_LOGICIEL']],
  ['F9R_CYCLE_INGENIEUR_GENIE_LOGICIEL_ENSIAS_RABAT', 'Cycle Ingenieur Genie Logiciel - ENSIAS Rabat', ensias.code, ['DEVELOPPEUR_FULL_STACK', 'ARCHITECTE_LOGICIEL']],
  ['F9R_INGENIERIE_BUSINESS_INTELLIGENCE_ENSIAS_RABAT', 'Ingenierie Business Intelligence - ENSIAS Rabat', ensias.code, ['CONSULTANT_BI', 'DATA_ENGINEER', 'DATA_SCIENTIST']],
  ['F9R_INGENIERIE_TELECOMS_RESEAUX_ENSIAS_RABAT', 'Ingenierie Telecommunications et Reseaux - ENSIAS Rabat', ensias.code, ['INGENIEUR_TELECOMS', 'ADMINISTRATEUR_SYSTEMES_RESEAUX']],
  ['F9R_INGENIERIE_SYSTEMES_EMBARQUES_ENSIAS_RABAT', 'Ingenierie Systemes Embarques et Mobiles - ENSIAS Rabat', ensias.code, ['INGENIEUR_GENIE_INFORMATIQUE', 'ARCHITECTE_LOGICIEL']],
  ['F9R_INGENIERIE_RESEAUX_TELECOMS_INPT_RABAT', 'Ingenierie Reseaux et Telecoms - INPT Rabat', inpt.code, ['INGENIEUR_RESEAU_ET_TELECOMS', 'INGENIEUR_SUPPORT_TELECOM']],
  ['F9R_INGENIEUR_GENIE_CIVIL_EHTP_CASABLANCA', 'Ingenieur Genie Civil - EHTP Casablanca', ehtp.code, ['INGENIEUR_GENIE_CIVIL', 'INGENIEUR_BTP']],
  ['F9R_INGENIEUR_GENIE_CIVIL_EMI_RABAT', 'Ingenieur Genie Civil - EMI Rabat', emi.code, ['INGENIEUR_GENIE_CIVIL', 'INGENIEUR_BTP']],
  ['F9R_INGENIEUR_GENIE_ELECTRIQUE_EMI_RABAT', 'Ingenieur Genie Electrique - EMI Rabat', emi.code, ['INGENIEUR_ELECTRIQUE']],
  ['F9R_INGENIEUR_GENIE_ELECTRIQUE_ENSEM_CASABLANCA', 'Ingenieur Genie Electrique - ENSEM Casablanca', ensem.code, ['INGENIEUR_ELECTRIQUE']],
  ['F9R_INGENIEUR_GENIE_MECANIQUE_ENSEM_CASABLANCA', 'Ingenieur Genie Mecanique - ENSEM Casablanca', ensem.code, ['INGENIEUR_MECANIQUE']],
  ['F9R_INGENIEUR_GENIE_INFORMATIQUE_ENSA_CASABLANCA', 'Ingenieur Genie Informatique - ENSA Casablanca', ensaCasablanca.code, ['INGENIEUR_GENIE_INFORMATIQUE', 'DEVELOPPEUR_FULL_STACK']],
  ['F9R_INGENIEUR_GENIE_INDUSTRIEL_ENSA_CASABLANCA', 'Ingenieur Genie Industriel - ENSA Casablanca', ensaCasablanca.code, ['INGENIEUR_INDUSTRIEL']],
]

for (const [code, name, school, jobs] of engineeringPrograms) {
  ensureProgram(code, name, 60, 'Ingenierie')
  offer(code, school)
  bacAdmission(engineeringBacs, school, 14, 'CONCOURS')
  recruit(code, jobs, 76)
}

const ensaCampuses = [
  ['ENSA_AGADIR', 'ENSA Agadir', 'Agadir'],
  ['ENSA_MARRAKECH', 'ENSA Marrakech', 'Marrakech'],
  ['ENSA_FES', 'ENSA Fes', 'Fes'],
  ['ENSA_TANGER', 'ENSA Tanger', 'Tanger'],
  ['ENSA_OUJDA', 'ENSA Oujda', 'Oujda'],
  ['ENSA_EL_JADIDA', 'ENSA El Jadida', 'El Jadida'],
  ['ENSA_AL_HOCEIMA', 'ENSA Al Hoceima', 'Al Hoceima'],
  ['ENSA_SAFI', 'ENSA Safi', 'Safi'],
  ['ENSA_BERRECHID', 'ENSA Berrechid', 'Berrechid'],
  ['ENSA_KENITRA', 'ENSA Kenitra', 'Kenitra'],
  ['ENSA_KHOURIBGA', 'ENSA Khouribga', 'Khouribga'],
  ['ENSA_BENI_MELLAL', 'ENSA Beni Mellal', 'Beni Mellal'],
  ['ENSA_TETOUAN', 'ENSA Tetouan', 'Tetouan'],
]

const ensaSpecialties = [
  ['GENIE_INFORMATIQUE', 'Ingenieur Genie Informatique', 'Informatique', ['INGENIEUR_GENIE_INFORMATIQUE', 'DEVELOPPEUR_FULL_STACK']],
  ['GENIE_CIVIL', 'Ingenieur Genie Civil', 'BTP', ['INGENIEUR_GENIE_CIVIL', 'INGENIEUR_BTP']],
  ['GENIE_ELECTRIQUE', 'Ingenieur Genie Electrique', 'Ingenierie', ['INGENIEUR_ELECTRIQUE']],
  ['GENIE_INDUSTRIEL', 'Ingenieur Genie Industriel', 'Industrie', ['INGENIEUR_INDUSTRIEL']],
  ['RESEAUX_TELECOMS', 'Ingenierie Reseaux et Telecommunications', 'Informatique', ['INGENIEUR_TELECOMS', 'ADMINISTRATEUR_SYSTEMES_RESEAUX']],
]

for (const [schoolCode, schoolName, ville] of ensaCampuses) {
  ensureSchool(schoolCode, schoolName, ville, 'Ingenierie')
  bacAdmission(engineeringBacs, schoolCode, 13.5, 'CONCOURS')
  for (const [suffix, label, sector, jobs] of ensaSpecialties) {
    const code = `F9R_${suffix}_${schoolCode}`
    ensureProgram(code, `${label} - ${schoolName}`, 60, sector)
    offer(code, schoolCode)
    recruit(code, jobs, 74)
  }
}

const encgCampuses = [
  ['ENCG_AGADIR', 'ENCG Agadir', 'Agadir'],
  ['ENCG_BENI_MELLAL', 'ENCG Beni Mellal', 'Beni Mellal'],
  ['ENCG_CASABLANCA', 'ENCG Casablanca', 'Casablanca'],
  ['ENCG_DAKHLA', 'ENCG Dakhla', 'Dakhla'],
  ['ENCG_EL_JADIDA', 'ENCG El Jadida', 'El Jadida'],
  ['ENCG_SETTAT', 'ENCG Settat', 'Settat'],
  ['ENCG_MARRAKECH', 'ENCG Marrakech', 'Marrakech'],
  ['ENCG_TANGER', 'ENCG Tanger', 'Tanger'],
  ['ENCG_KENITRA', 'ENCG Kenitra', 'Kenitra'],
  ['ENCG_FES', 'ENCG Fes', 'Fes'],
  ['ENCG_MEKNES', 'ENCG Meknes', 'Meknes'],
  ['ENCG_OUJDA', 'ENCG Oujda', 'Oujda'],
]

const encgPrograms = [
  ['MANAGEMENT', 'Diplome ENCG Management', ['RESPONSABLE_RH', 'RESPONSABLE_MARKETING_DIGITAL']],
  ['FINANCE_COMPTABILITE', 'Diplome ENCG Finance et Comptabilite', ['COMPTABLE', 'EXPERT_COMPTABLE', 'AUDITEUR_FINANCIER', 'ANALYSTE_FINANCIER']],
  ['MARKETING_DIGITAL', 'Diplome ENCG Marketing Digital', ['RESPONSABLE_MARKETING_DIGITAL']],
  ['LOGISTIQUE_SUPPLY_CHAIN', 'Diplome ENCG Logistique & Supply Chain', ['RESPONSABLE_LOGISTIQUE']],
]

for (const [schoolCode, schoolName, ville] of encgCampuses) {
  ensureSchool(schoolCode, schoolName, ville, 'Commerce et gestion')
  bacAdmission(economyBacs, schoolCode, 13, 'CONCOURS')
  for (const [suffix, label, jobs] of encgPrograms) {
    const code = `F9R_DIPLOME_ENCG_${suffix}_${schoolCode}`
    ensureProgram(code, `${label} - ${schoolName}`, 60, 'Finance')
    offer(code, schoolCode)
    recruit(code, jobs, 78)
  }
}

const estSchools = [
  ['EST_SALE', 'Ecole Superieure de Technologie Sale', 'Sale'],
  ['EST_CASABLANCA', 'Ecole Superieure de Technologie Casablanca', 'Casablanca'],
  ['EST_FES', 'Ecole Superieure de Technologie Fes', 'Fes'],
  ['EST_MARRAKECH', 'Ecole Superieure de Technologie Marrakech', 'Marrakech'],
  ['EST_AGADIR', 'Ecole Superieure de Technologie Agadir', 'Agadir'],
  ['EST_BENI_MELLAL', 'Ecole Superieure de Technologie Beni Mellal', 'Beni Mellal'],
  ['EST_ESSAOUIRA', 'Ecole Superieure de Technologie Essaouira', 'Essaouira'],
  ['EST_GUELMIM', 'Ecole Superieure de Technologie Guelmim', 'Guelmim'],
  ['EST_KENITRA', 'Ecole Superieure de Technologie Kenitra', 'Kenitra'],
  ['EST_KHENIFRA', 'Ecole Superieure de Technologie Khenifra', 'Khenifra'],
  ['EST_KHOURIBGA', 'Ecole Superieure de Technologie Khouribga', 'Khouribga'],
  ['EST_MEKNES', 'Ecole Superieure de Technologie Meknes', 'Meknes'],
  ['EST_OUJDA', 'Ecole Superieure de Technologie Oujda', 'Oujda'],
  ['EST_SAFI', 'Ecole Superieure de Technologie Safi', 'Safi'],
  ['EST_SIDI_BENNOUR', 'Ecole Superieure de Technologie Sidi Bennour', 'Sidi Bennour'],
  ['EST_LAAYOUNE', 'Ecole Superieure de Technologie Laayoune', 'Laayoune'],
]

const dutPrograms = [
  ['DUT_GENIE_INFORMATIQUE', 'DUT Genie Informatique', 'Informatique', engineeringBacs, ['TECHNICIEN_SUPERIEUR_INFORMATIQUE', 'DEVELOPPEUR_FULL_STACK']],
  ['DUT_RESEAUX_TELECOMS', 'DUT Reseaux et Telecommunications', 'Informatique', engineeringBacs, ['TECHNICIEN_SUPERIEUR_RESEAUX']],
  ['DUT_GENIE_ELECTRIQUE', 'DUT Genie Electrique', 'Ingenierie', engineeringBacs, ['TECHNICIEN_GENIE_ELECTRIQUE', 'TECHNICIEN_MAINTENANCE_INDUSTRIELLE']],
  ['DUT_GENIE_MECANIQUE_PRODUCTIQUE', 'DUT Genie Mecanique et Productique', 'Industrie', engineeringBacs, ['TECHNICIEN_GENIE_MECANIQUE', 'TECHNICIEN_MAINTENANCE_INDUSTRIELLE']],
  ['DUT_MAINTENANCE_INDUSTRIELLE', 'DUT Maintenance Industrielle', 'Industrie', engineeringBacs, ['TECHNICIEN_MAINTENANCE_INDUSTRIELLE']],
  ['DUT_LOGISTIQUE_TRANSPORT', 'DUT Logistique et Transport', 'Logistique', [...engineeringBacs, ...economyBacs], ['RESPONSABLE_LOGISTIQUE']],
  ['DUT_FINANCE_COMPTABILITE', 'DUT Finance Comptabilite', 'Finance', economyBacs, ['ASSISTANT_COMPTABLE', 'COMPTABLE']],
  ['DUT_MANAGEMENT_ENTREPRISES', 'DUT Management des Entreprises', 'Gestion', economyBacs, ['ASSISTANT_COMMERCIAL', 'RESPONSABLE_RH']],
  ['DUT_GESTION_BANQUE_ASSURANCE', 'DUT Gestion Banques et Assurances', 'Finance', economyBacs, ['GESTIONNAIRE_BANQUE_ASSURANCE', 'ANALYSTE_FINANCIER']],
  ['DUT_AGRO_INDUSTRIE', 'DUT Agro-industrie', 'Agroalimentaire', scientificBacs, ['TECHNICIEN_AGROINDUSTRIE']],
  ['DUT_QHSE', 'DUT Qualite Hygiene Securite Environnement', 'Qualite', scientificBacs, ['TECHNICIEN_QHSE']],
]

for (const [schoolCode, schoolName, ville] of estSchools) {
  ensureSchool(schoolCode, schoolName, ville, 'Technologie')
  for (const [suffix, label, sector, bacs, jobs] of dutPrograms) {
    const code = `F9R_${suffix}_${schoolCode}`
    ensureProgram(code, `${label} - ${schoolName}`, 24, sector)
    offer(code, schoolCode)
    bacAdmission(bacs, code, 11, 'DOSSIER')
    recruit(code, jobs, 70)
  }
}

const btsCenters = [
  ['BTS_CENTRE_CASABLANCA', 'Centre BTS Casablanca', 'Casablanca'],
  ['BTS_CENTRE_RABAT', 'Centre BTS Rabat', 'Rabat'],
  ['BTS_CENTRE_FES', 'Centre BTS Fes', 'Fes'],
  ['BTS_CENTRE_MARRAKECH', 'Centre BTS Marrakech', 'Marrakech'],
  ['ENSET_MOHAMMEDIA', 'ENSET Mohammedia', 'Mohammedia'],
]

const btsPrograms = [
  ['BTS_COMPTABILITE_GESTION', 'BTS Comptabilite et Gestion', 'Finance', economyBacs, ['ASSISTANT_COMPTABLE', 'COMPTABLE']],
  ['BTS_SYSTEMES_NUMERIQUES_IR', 'BTS Systemes Numeriques option Informatique et Reseaux', 'Informatique', scientificBacs, ['TECHNICIEN_SUPERIEUR_INFORMATIQUE', 'ADMINISTRATEUR_SYSTEMES_RESEAUX']],
  ['BTS_ELECTROTECHNIQUE', 'BTS Electrotechnique', 'Ingenierie', engineeringBacs, ['TECHNICIEN_GENIE_ELECTRIQUE', 'TECHNICIEN_MAINTENANCE_INDUSTRIELLE']],
  ['BTS_MAINTENANCE_SYSTEMES_PRODUCTION', 'BTS Maintenance des Systemes de Production', 'Industrie', engineeringBacs, ['TECHNICIEN_MAINTENANCE_INDUSTRIELLE']],
  ['BTS_COMMERCE_INTERNATIONAL', 'BTS Commerce International', 'Commerce', economyBacs, ['ASSISTANT_COMMERCIAL', 'RESPONSABLE_MARKETING_DIGITAL']],
  ['BTS_GESTION_PME', 'BTS Gestion de la PME', 'Gestion', economyBacs, ['ASSISTANT_COMMERCIAL', 'RESPONSABLE_RH']],
]

for (const [schoolCode, schoolName, ville] of btsCenters) {
  ensureSchool(schoolCode, schoolName, ville, 'BTS')
  for (const [suffix, label, sector, bacs, jobs] of btsPrograms) {
    const code = `F9R_${suffix}_${schoolCode}`
    ensureProgram(code, `${label} - ${schoolName}`, 24, sector)
    offer(code, schoolCode)
    bacAdmission(bacs, code, 11, 'DOSSIER')
    recruit(code, jobs, 68)
  }
}

const medicalSchools = [
  ['FMPR_RABAT', 'Faculte de Medecine et de Pharmacie Rabat', 'Rabat'],
  ['FMP_CASABLANCA', 'Faculte de Medecine et de Pharmacie Casablanca', 'Casablanca'],
  ['FMP_MARRAKECH', 'Faculte de Medecine et de Pharmacie Marrakech', 'Marrakech'],
  ['FMP_FES', 'Faculte de Medecine, de Pharmacie et de Medecine Dentaire Fes', 'Fes'],
  ['FMP_OUJDA', 'Faculte de Medecine et de Pharmacie Oujda', 'Oujda'],
  ['FMP_TANGER', 'Faculte de Medecine et de Pharmacie Tanger', 'Tanger'],
  ['FMP_AGADIR', 'Faculte de Medecine et de Pharmacie Agadir', 'Agadir'],
  ['FMP_BENI_MELLAL', 'Faculte de Medecine et de Pharmacie Beni Mellal', 'Beni Mellal'],
  ['FMP_GUELMIM', 'Faculte de Medecine et de Pharmacie Guelmim', 'Guelmim'],
  ['FMP_ERRACHIDIA', 'Faculte de Medecine et de Pharmacie Errachidia', 'Errachidia'],
  ['FMP_LAAYOUNE', 'Faculte de Medecine et de Pharmacie Laayoune', 'Laayoune'],
]

for (const [schoolCode, schoolName, ville] of medicalSchools) {
  ensureSchool(schoolCode, schoolName, ville, 'Sante')
  const med = `F9R_DOCTORAT_MEDECINE_${schoolCode}`
  const pharma = `F9R_DOCTORAT_PHARMACIE_${schoolCode}`
  ensureProgram(med, `Diplome de Docteur en Medecine - ${schoolName}`, 84, 'Sante')
  ensureProgram(pharma, `Diplome de Docteur en Pharmacie - ${schoolName}`, 72, 'Sante')
  offer(med, schoolCode)
  offer(pharma, schoolCode)
  bacAdmission(scientificBacs, schoolCode, 15, 'CONCOURS')
  recruit(med, ['MEDECIN_GENERALISTE'], 72)
  recruit(pharma, ['PHARMACIEN', 'PHARMACIEN_INDUSTRIEL'], 70)
}

const dentalSchools = [
  ['FMD_RABAT', 'Faculte de Medecine Dentaire Rabat', 'Rabat', 0],
  ['FMD_CASABLANCA', 'Faculte de Medecine Dentaire Casablanca', 'Casablanca', 0],
  ['FMPD_FES', 'Faculte de Medecine, de Pharmacie et de Medecine Dentaire Fes', 'Fes', 0],
  ['FM6MD_RABAT', 'Faculte Mohammed VI de Medecine Dentaire Rabat', 'Rabat', 540000],
  ['FM6MD_CASABLANCA', 'Faculte Mohammed VI de Medecine Dentaire Casablanca', 'Casablanca', 540000],
]

for (const [schoolCode, schoolName, ville, cost] of dentalSchools) {
  ensureSchool(schoolCode, schoolName, ville, 'Sante')
  const dental = `F9R_DOCTORAT_MEDECINE_DENTAIRE_${schoolCode}`
  ensureProgram(dental, `Diplome de Docteur en Medecine Dentaire - ${schoolName}`, 72, 'Sante', publicSourcesNote, cost)
  offer(dental, schoolCode)
  bacAdmission(scientificBacs, schoolCode, 15, 'CONCOURS')
  recruit(dental, ['DENTISTE', 'CHIRURGIEN_DENTISTE'], 70)
}

const universitySchools = [
  ['FS_RABAT', 'Faculte des Sciences Rabat', 'Rabat'],
  ['FS_CASABLANCA', 'Faculte des Sciences Casablanca', 'Casablanca'],
  ['FST_MOHAMMEDIA', 'Faculte des Sciences et Techniques Mohammedia', 'Mohammedia'],
  ['FST_TANGER', 'Faculte des Sciences et Techniques Tanger', 'Tanger'],
  ['FST_FES', 'Faculte des Sciences et Techniques Fes', 'Fes'],
  ['FST_MARRAKECH', 'Faculte des Sciences et Techniques Marrakech', 'Marrakech'],
  ['FSJES_CASABLANCA', 'Faculte des Sciences Juridiques, Economiques et Sociales Casablanca', 'Casablanca'],
  ['FLSH_RABAT', 'Faculte des Lettres et Sciences Humaines Rabat', 'Rabat'],
]

for (const [schoolCode, schoolName, ville] of universitySchools) {
  ensureSchool(schoolCode, schoolName, ville, 'Universite')
}

const universityPrograms = [
  ['F9R_LICENCE_INFORMATIQUE_FS_RABAT', 'Licence Informatique - Faculte des Sciences Rabat', 'FS_RABAT', 36, 'Informatique', scientificBacs, ['DEVELOPPEUR_FULL_STACK', 'TECHNICIEN_SUPERIEUR_INFORMATIQUE']],
  ['F9R_LICENCE_MATHEMATIQUES_FS_RABAT', 'Licence Mathematiques - Faculte des Sciences Rabat', 'FS_RABAT', 36, 'Sciences', scientificBacs, ['DATA_SCIENTIST', 'ENSEIGNANT_SECONDAIRE']],
  ['F9R_MASTER_DATA_SCIENCE_FS_CASABLANCA', 'Master Data Science - Faculte des Sciences Casablanca', 'FS_CASABLANCA', 60, 'Informatique', scientificBacs, ['DATA_SCIENTIST', 'DATA_ENGINEER']],
  ['F9R_LICENCE_DROIT_PRIVE_FSJES_CASABLANCA', 'Licence Droit Prive - FSJES Casablanca', 'FSJES_CASABLANCA', 36, 'Droit', [...literatureBacs, ...economyBacs], ['JURISTE_D_AFFAIRES']],
  ['F9R_LICENCE_ECONOMIE_GESTION_FSJES_CASABLANCA', 'Licence Economie et Gestion - FSJES Casablanca', 'FSJES_CASABLANCA', 36, 'Economie', economyBacs, ['COMPTABLE', 'ANALYSTE_FINANCIER']],
  ['F9R_MASTER_DROIT_AFFAIRES_FSJES_CASABLANCA', 'Master Droit des Affaires - FSJES Casablanca', 'FSJES_CASABLANCA', 60, 'Droit', [...literatureBacs, ...economyBacs], ['JURISTE_D_AFFAIRES']],
  ['F9R_LICENCE_ETUDES_FRANCAISES_FLSH_RABAT', 'Licence Etudes Francaises - FLSH Rabat', 'FLSH_RABAT', 36, 'Lettres', literatureBacs, ['ENSEIGNANT_SECONDAIRE']],
  ['F9R_LST_GENIE_INFORMATIQUE_FST_MOHAMMEDIA', 'Licence Sciences et Techniques Genie Informatique - FST Mohammedia', 'FST_MOHAMMEDIA', 36, 'Informatique', scientificBacs, ['DEVELOPPEUR_FULL_STACK', 'ADMINISTRATEUR_SYSTEMES_RESEAUX']],
  ['F9R_LST_GENIE_INDUSTRIEL_FST_TANGER', 'Licence Sciences et Techniques Genie Industriel - FST Tanger', 'FST_TANGER', 36, 'Industrie', scientificBacs, ['INGENIEUR_INDUSTRIEL']],
  ['F9R_MST_RESEAUX_SYSTEMES_FST_FES', 'Master Sciences et Techniques Reseaux et Systemes - FST Fes', 'FST_FES', 60, 'Informatique', scientificBacs, ['ADMINISTRATEUR_SYSTEMES_RESEAUX', 'INGENIEUR_TELECOMS']],
  ['F9R_MST_ENERGIES_RENOUVELABLES_FST_MARRAKECH', 'Master Sciences et Techniques Energies Renouvelables - FST Marrakech', 'FST_MARRAKECH', 60, 'Ingenierie', scientificBacs, ['INGENIEUR_ENERGIES_RENOUVELABLES']],
]

for (const [code, name, school, duration, sector, bacs, jobs] of universityPrograms) {
  ensureProgram(code, name, duration, sector)
  offer(code, school)
  if (!normalize(code).includes('MASTER') && !normalize(name).includes('MASTER')) {
    bacAdmission(bacs, code, 10, 'OUVERT')
  }
  recruit(code, jobs, 68)
}

const fstCampuses = [
  ['FST_MOHAMMEDIA', 'Faculte des Sciences et Techniques Mohammedia', 'Mohammedia'],
  ['FST_SETTAT', 'Faculte des Sciences et Techniques Settat', 'Settat'],
  ['FST_TANGER', 'Faculte des Sciences et Techniques Tanger', 'Tanger'],
  ['FST_FES', 'Faculte des Sciences et Techniques Fes', 'Fes'],
  ['FST_MARRAKECH', 'Faculte des Sciences et Techniques Marrakech', 'Marrakech'],
  ['FST_BENI_MELLAL', 'Faculte des Sciences et Techniques Beni Mellal', 'Beni Mellal'],
  ['FST_ERRACHIDIA', 'Faculte des Sciences et Techniques Errachidia', 'Errachidia'],
  ['FST_AL_HOCEIMA', 'Faculte des Sciences et Techniques Al Hoceima', 'Al Hoceima'],
]

const fstPrograms = [
  ['LST_GENIE_INFORMATIQUE', 'Licence Sciences et Techniques Genie Informatique', 'Informatique', ['DEVELOPPEUR_FULL_STACK', 'ADMINISTRATEUR_SYSTEMES_RESEAUX']],
  ['LST_GENIE_ELECTRIQUE', 'Licence Sciences et Techniques Genie Electrique', 'Ingenierie', ['INGENIEUR_ELECTRIQUE']],
  ['LST_GENIE_INDUSTRIEL', 'Licence Sciences et Techniques Genie Industriel', 'Industrie', ['INGENIEUR_INDUSTRIEL']],
  ['MST_RESEAUX_SYSTEMES', 'Master Sciences et Techniques Reseaux et Systemes', 'Informatique', ['ADMINISTRATEUR_SYSTEMES_RESEAUX', 'INGENIEUR_TELECOMS']],
  ['MST_DATA_SCIENCE', 'Master Sciences et Techniques Data Science', 'Informatique', ['DATA_SCIENTIST', 'DATA_ENGINEER']],
]

for (const [schoolCode, schoolName, ville] of fstCampuses) {
  ensureSchool(schoolCode, schoolName, ville, 'Sciences et techniques')
  bacAdmission(scientificBacs, schoolCode, 12, 'DOSSIER')
  const campusLstCodes = []
  for (const [suffix, label, sector, jobs] of fstPrograms) {
    const duration = suffix.startsWith('MST') ? 60 : 36
    const code = `F9R_${suffix}_${schoolCode}`
    ensureProgram(code, `${label} - ${schoolName}`, duration, sector)
    offer(code, schoolCode)
    if (suffix.startsWith('MST')) {
      for (const lstCode of campusLstCodes) {
        addEdge({
          source: lstCode,
          target: code,
          type_lien: 'DONNE_ACCES',
          taux_reussite: 70,
          moyenne_minimale: 12,
          type_acces: 'DOSSIER',
          prerequis_notes: 'Acces master apres deux ou trois annees universitaires validees selon la filiere et le dossier.',
        })
      }
    } else {
      campusLstCodes.push(code)
      bacAdmission(scientificBacs, code, 10, 'DOSSIER')
    }
    recruit(code, jobs, 70)
  }
}

const fsCampuses = [
  ['FS_RABAT', 'Faculte des Sciences Rabat', 'Rabat'],
  ['FS_CASABLANCA', 'Faculte des Sciences Casablanca', 'Casablanca'],
  ['FS_FES', 'Faculte des Sciences Fes', 'Fes'],
  ['FS_MARRAKECH', 'Faculte des Sciences Semlalia Marrakech', 'Marrakech'],
  ['FS_AGADIR', 'Faculte des Sciences Agadir', 'Agadir'],
  ['FS_TETOUAN', 'Faculte des Sciences Tetouan', 'Tetouan'],
  ['FS_MEKNES', 'Faculte des Sciences Meknes', 'Meknes'],
  ['FS_OUJDA', 'Faculte des Sciences Oujda', 'Oujda'],
]

const fsPrograms = [
  ['LICENCE_INFORMATIQUE', 'Licence Informatique', 'Informatique', ['DEVELOPPEUR_FULL_STACK', 'ADMINISTRATEUR_SYSTEMES_RESEAUX']],
  ['LICENCE_MATHEMATIQUES', 'Licence Mathematiques', 'Sciences', ['DATA_SCIENTIST', 'ENSEIGNANT_SECONDAIRE']],
  ['LICENCE_PHYSIQUE_CHIMIE', 'Licence Physique Chimie', 'Sciences', ['ENSEIGNANT_SECONDAIRE']],
  ['LICENCE_SCIENCES_VIE_TERRE', 'Licence Sciences de la Vie et de la Terre', 'Sciences', ['ENSEIGNANT_SECONDAIRE']],
  ['MASTER_DATA_SCIENCE', 'Master Data Science', 'Informatique', ['DATA_SCIENTIST', 'DATA_ENGINEER']],
]

for (const [schoolCode, schoolName, ville] of fsCampuses) {
  ensureSchool(schoolCode, schoolName, ville, 'Sciences')
  const campusLicenceCodes = []
  for (const [suffix, label, sector, jobs] of fsPrograms) {
    const duration = suffix.startsWith('MASTER') ? 60 : 36
    const code = `F9R_${suffix}_${schoolCode}`
    ensureProgram(code, `${label} - ${schoolName}`, duration, sector)
    offer(code, schoolCode)
    if (suffix.startsWith('MASTER')) {
      for (const licenceCode of campusLicenceCodes) {
        addEdge({
          source: licenceCode,
          target: code,
          type_lien: 'DONNE_ACCES',
          taux_reussite: 66,
          moyenne_minimale: 12,
          type_acces: 'DOSSIER',
          prerequis_notes: 'Acces master apres licence ou equivalence bac+3 selon dossier.',
        })
      }
    } else {
      campusLicenceCodes.push(code)
      bacAdmission(scientificBacs, code, 10, 'OUVERT')
    }
    recruit(code, jobs, 66)
  }
}

const fsjesCampuses = [
  ['FSJES_CASABLANCA', 'Faculte des Sciences Juridiques, Economiques et Sociales Casablanca', 'Casablanca'],
  ['FSJES_RABAT_AGDAL', 'Faculte des Sciences Juridiques, Economiques et Sociales Rabat Agdal', 'Rabat'],
  ['FSJES_FES', 'Faculte des Sciences Juridiques, Economiques et Sociales Fes', 'Fes'],
  ['FSJES_MARRAKECH', 'Faculte des Sciences Juridiques, Economiques et Sociales Marrakech', 'Marrakech'],
  ['FSJES_AGADIR', 'Faculte des Sciences Juridiques, Economiques et Sociales Agadir', 'Agadir'],
  ['FSJES_TANGER', 'Faculte des Sciences Juridiques, Economiques et Sociales Tanger', 'Tanger'],
  ['FSJES_OUJDA', 'Faculte des Sciences Juridiques, Economiques et Sociales Oujda', 'Oujda'],
  ['FSJES_SETTAT', 'Faculte des Sciences Juridiques, Economiques et Sociales Settat', 'Settat'],
  ['FSJES_MEKNES', 'Faculte des Sciences Juridiques, Economiques et Sociales Meknes', 'Meknes'],
]

const fsjesPrograms = [
  ['LICENCE_DROIT_PRIVE', 'Licence Droit Prive', 'Droit', [...literatureBacs, ...economyBacs], ['JURISTE_D_AFFAIRES', 'AVOCAT', 'NOTAIRE']],
  ['LICENCE_DROIT_PUBLIC', 'Licence Droit Public', 'Droit', [...literatureBacs, ...economyBacs], ['JURISTE_D_AFFAIRES']],
  ['LICENCE_ECONOMIE_GESTION', 'Licence Economie et Gestion', 'Economie', economyBacs, ['COMPTABLE', 'ANALYSTE_FINANCIER', 'BUSINESS_ANALYST']],
  ['MASTER_AUDIT_CONTROLE_GESTION', 'Master Audit et Controle de Gestion', 'Finance', economyBacs, ['AUDITEUR_FINANCIER', 'CONTROLEUR_DE_GESTION']],
  ['MASTER_DROIT_AFFAIRES', 'Master Droit des Affaires', 'Droit', [...literatureBacs, ...economyBacs], ['JURISTE_D_AFFAIRES', 'AVOCAT']],
]

for (const [schoolCode, schoolName, ville] of fsjesCampuses) {
  ensureSchool(schoolCode, schoolName, ville, 'Droit et economie')
  for (const [suffix, label, sector, bacs, jobs] of fsjesPrograms) {
    const duration = suffix.startsWith('MASTER') ? 60 : 36
    const code = `F9R_${suffix}_${schoolCode}`
    ensureProgram(code, `${label} - ${schoolName}`, duration, sector)
    offer(code, schoolCode)
    bacAdmission(bacs, code, 10, 'OUVERT')
    recruit(code, jobs, 66)
  }
}

const cpgeCenters = [
  ['CPGE_CENTRE_CASABLANCA', 'Centre CPGE Casablanca', 'Casablanca'],
  ['CPGE_CENTRE_RABAT', 'Centre CPGE Rabat', 'Rabat'],
  ['CPGE_CENTRE_FES', 'Centre CPGE Fes', 'Fes'],
  ['CPGE_CENTRE_MARRAKECH', 'Centre CPGE Marrakech', 'Marrakech'],
  ['CPGE_CENTRE_TANGER', 'Centre CPGE Tanger', 'Tanger'],
]

const cpgePrograms = [
  ['CPGE_MPSI_MP', 'CPGE MPSI MP', ['BAC_SM', 'BAC_PC'], ['ENSIAS_RABAT', 'EMI_RABAT', 'EHTP_CASABLANCA', 'INPT_RABAT']],
  ['CPGE_PCSI_PSI', 'CPGE PCSI PSI', ['BAC_SM', 'BAC_PC'], ['EMI_RABAT', 'EHTP_CASABLANCA', 'ENSA_CASABLANCA', 'ENSEM_CASABLANCA']],
  ['CPGE_TSI', 'CPGE TSI', ['BAC_TECH_ELEC', 'BAC_TECH_MECA'], ['ENSEM_CASABLANCA', 'ENSA_CASABLANCA']],
  ['CPGE_ECT', 'CPGE ECT', ['BAC_ECO', 'BAC_GC'], ['ENCG_CASABLANCA', 'ENCG_SETTAT', 'ENCG_TANGER']],
]

for (const [schoolCode, schoolName, ville] of cpgeCenters) {
  ensureSchool(schoolCode, schoolName, ville, 'Classes preparatoires')
  for (const [suffix, label, bacs, targets] of cpgePrograms) {
    const code = `F9R_${suffix}_${schoolCode}`
    ensureProgram(code, `${label} - ${schoolName}`, 24, 'Classes preparatoires')
    offer(code, schoolCode)
    bacAdmission(bacs, code, 14, 'DOSSIER')
    for (const target of targets) {
      if (nodesByCode.has(target)) {
        addEdge({
          source: code,
          target,
          type_lien: 'DONNE_ACCES',
          taux_reussite: 64,
          moyenne_minimale: 14,
          type_acces: 'CONCOURS',
          prerequis_notes: 'Acces aux grandes ecoles apres concours national ou concours specifique.',
        })
      }
    }
  }
}

const architectureSchools = [
  ['ENA_RABAT', 'Ecole Nationale d Architecture Rabat', 'Rabat'],
  ['ENA_CASABLANCA', 'Ecole Nationale d Architecture Casablanca', 'Casablanca'],
  ['ENA_FES', 'Ecole Nationale d Architecture Fes', 'Fes'],
  ['ENA_MARRAKECH', 'Ecole Nationale d Architecture Marrakech', 'Marrakech'],
  ['ENA_TETOUAN', 'Ecole Nationale d Architecture Tetouan', 'Tetouan'],
  ['ENA_AGADIR', 'Ecole Nationale d Architecture Agadir', 'Agadir'],
  ['ENA_OUJDA', 'Ecole Nationale d Architecture Oujda', 'Oujda'],
]

for (const [schoolCode, schoolName, ville] of architectureSchools) {
  ensureSchool(schoolCode, schoolName, ville, 'Architecture')
  const code = `F9R_DIPLOME_ARCHITECTE_${schoolCode}`
  ensureProgram(code, `Diplome Architecte - ${schoolName}`, 72, 'Architecture')
  offer(code, schoolCode)
  bacAdmission([...scientificBacs, ...economyBacs, ...literatureBacs], schoolCode, 13, 'CONCOURS')
  recruit(code, ['ARCHITECTE', 'URBANISTE'], 72)
}

ensureSchool('IAV_RABAT', 'Institut Agronomique et Veterinaire Hassan II Rabat', 'Rabat', 'Agronomie et veterinaire')
ensureProgram('F9R_DOCTORAT_MEDECINE_VETERINAIRE_IAV_RABAT', 'Diplome de Docteur Veterinaire - IAV Hassan II Rabat', 72, 'Sante')
offer('F9R_DOCTORAT_MEDECINE_VETERINAIRE_IAV_RABAT', 'IAV_RABAT')
bacAdmission(scientificBacs, 'IAV_RABAT', 14, 'CONCOURS')
recruit('F9R_DOCTORAT_MEDECINE_VETERINAIRE_IAV_RABAT', ['VETERINAIRE'], 72)

const ispitsCampuses = [
  ['ISPITS_RABAT', 'ISPITS Rabat', 'Rabat'],
  ['ISPITS_CASABLANCA', 'ISPITS Casablanca', 'Casablanca'],
  ['ISPITS_FES', 'ISPITS Fes', 'Fes'],
  ['ISPITS_MARRAKECH', 'ISPITS Marrakech', 'Marrakech'],
  ['ISPITS_AGADIR', 'ISPITS Agadir', 'Agadir'],
  ['ISPITS_OUJDA', 'ISPITS Oujda', 'Oujda'],
  ['ISPITS_TANGER', 'ISPITS Tanger', 'Tanger'],
  ['ISPITS_LAAYOUNE', 'ISPITS Laayoune', 'Laayoune'],
  ['ISPITS_BENI_MELLAL', 'ISPITS Beni Mellal', 'Beni Mellal'],
]

const ispitsPrograms = [
  ['LICENCE_INFIRMIER_POLYVALENT', 'Licence Infirmier Polyvalent', ['INFIRMIER_POLYVALENT']],
  ['LICENCE_SAGE_FEMME', 'Licence Sage Femme', ['SAGE_FEMME']],
  ['LICENCE_KINESITHERAPIE', 'Licence Kinesitherapie', ['KINESITHERAPEUTE']],
]

for (const [schoolCode, schoolName, ville] of ispitsCampuses) {
  ensureSchool(schoolCode, schoolName, ville, 'Sante')
  for (const [suffix, label, jobs] of ispitsPrograms) {
    const code = `F9R_${suffix}_${schoolCode}`
    ensureProgram(code, `${label} - ${schoolName}`, 36, 'Sante')
    offer(code, schoolCode)
    bacAdmission(scientificBacs, code, 12, 'CONCOURS')
    recruit(code, jobs, 72)
  }
}

const allGeneralBacs = [...new Set([...scientificBacs, ...engineeringBacs, ...economyBacs, ...literatureBacs])]

const extraRecruit = (programCodes, jobs, rate = 70) => {
  for (const programCode of programCodes) {
    recruit(programCode, jobs, rate)
  }
}

for (const [schoolCode, schoolName] of ispitsCampuses) {
  const code = `F9R_LICENCE_TECHNIQUES_RADIOLOGIE_${schoolCode}`
  ensureProgram(code, `Licence Techniques de Radiologie - ${schoolName}`, 36, 'Sante')
  offer(code, schoolCode)
  bacAdmission(scientificBacs, code, 12, 'CONCOURS')
  recruit(code, ['TECHNICIEN_RADIOLOGIE'], 72)
}

for (const [schoolCode] of encgCampuses) {
  extraRecruit([`F9R_DIPLOME_ENCG_MARKETING_DIGITAL_${schoolCode}`], [
    'RESPONSABLE_MARKETING',
    'CHEF_DE_PRODUIT',
    'CHEF_PROJET_DIGITAL',
    'SPECIALISTE_SEO',
    'CONTENT_MANAGER',
    'UX_UI_DESIGNER',
    'CONSEILLER_COMMERCIAL',
  ], 76)
  extraRecruit([`F9R_DIPLOME_ENCG_MANAGEMENT_${schoolCode}`], [
    'CONSULTANT_MANAGEMENT',
    'ENTREPRENEUR',
    'CHEF_DE_PRODUIT',
    'CONSEILLER_COMMERCIAL',
  ], 74)
  extraRecruit([`F9R_DIPLOME_ENCG_FINANCE_COMPTABILITE_${schoolCode}`], [
    'CHARGE_AFFAIRES_BANCAIRES',
    'GESTIONNAIRE_BANQUE_ASSURANCE',
  ], 74)
  extraRecruit([`F9R_DIPLOME_ENCG_LOGISTIQUE_SUPPLY_CHAIN_${schoolCode}`], [
    'GESTIONNAIRE_STOCK',
    'ACHETEUR',
    'RESPONSABLE_IMPORT_EXPORT',
  ], 74)
}

const informationTechnologyPrograms = [
  'F9R_INGENIERIE_DATA_IA_ENSIAS_RABAT',
  'F9R_CYCLE_INGENIEUR_GENIE_LOGICIEL_ENSIAS_RABAT',
  'F9R_INGENIERIE_BUSINESS_INTELLIGENCE_ENSIAS_RABAT',
  ...ensaCampuses.map(([schoolCode]) => `F9R_GENIE_INFORMATIQUE_${schoolCode}`),
  ...fstCampuses.map(([schoolCode]) => `F9R_LST_GENIE_INFORMATIQUE_${schoolCode}`),
  ...fstCampuses.map(([schoolCode]) => `F9R_MST_DATA_SCIENCE_${schoolCode}`),
  ...fsCampuses.map(([schoolCode]) => `F9R_LICENCE_INFORMATIQUE_${schoolCode}`),
  ...fsCampuses.map(([schoolCode]) => `F9R_MASTER_DATA_SCIENCE_${schoolCode}`),
]

extraRecruit(informationTechnologyPrograms, ['INGENIEUR_CLOUD', 'INGENIEUR_DEVOPS', 'CHEF_PROJET_DIGITAL'], 72)
extraRecruit([
  'F9R_INGENIERIE_CYBERSECURITE_ENSIAS_RABAT',
  ...ensaCampuses.map(([schoolCode]) => `F9R_RESEAUX_TELECOMS_${schoolCode}`),
  ...fstCampuses.map(([schoolCode]) => `F9R_MST_RESEAUX_SYSTEMES_${schoolCode}`),
], ['ANALYSTE_CYBERSECURITE', 'INGENIEUR_CYBERSECURITE'], 72)

ensureSchool('INSEA_RABAT', 'Institut National de Statistique et d Economie Appliquee Rabat', 'Rabat', 'Statistique')
ensureProgram('F9R_INGENIEUR_STATISTIQUE_INSEA_RABAT', 'Ingenieur Statistique et Economie Appliquee - INSEA Rabat', 60, 'Statistique')
offer('F9R_INGENIEUR_STATISTIQUE_INSEA_RABAT', 'INSEA_RABAT')
bacAdmission(engineeringBacs, 'INSEA_RABAT', 14, 'CONCOURS')
recruit('F9R_INGENIEUR_STATISTIQUE_INSEA_RABAT', ['STATISTICIEN', 'DATA_SCIENTIST', 'ECONOMISTE'], 76)
ensureProgram('F9R_INGENIEUR_ACTUARIAT_INSEA_RABAT', 'Ingenieur Actuariat Finance - INSEA Rabat', 60, 'Finance')
offer('F9R_INGENIEUR_ACTUARIAT_INSEA_RABAT', 'INSEA_RABAT')
bacAdmission([...engineeringBacs, ...economyBacs], 'INSEA_RABAT', 14, 'CONCOURS')
recruit('F9R_INGENIEUR_ACTUARIAT_INSEA_RABAT', ['ACTUAIRE', 'ANALYSTE_FINANCIER', 'STATISTICIEN'], 74)

ensureProgram('F9R_INGENIEUR_AGRONOMIE_IAV_RABAT', 'Ingenieur Agronome - IAV Hassan II Rabat', 60, 'Agronomie')
offer('F9R_INGENIEUR_AGRONOMIE_IAV_RABAT', 'IAV_RABAT')
bacAdmission(scientificBacs, 'IAV_RABAT', 14, 'CONCOURS')
bacAdmission(scientificBacs, 'F9R_INGENIEUR_AGRONOMIE_IAV_RABAT', 14, 'CONCOURS')
recruit('F9R_INGENIEUR_AGRONOMIE_IAV_RABAT', ['INGENIEUR_AGRONOME', 'TECHNICIEN_AGROINDUSTRIE'], 74)

const ensamCampuses = [
  ['ENSAM_CASABLANCA', 'Ecole Nationale Superieure d Arts et Metiers Casablanca', 'Casablanca'],
  ['ENSAM_MEKNES', 'Ecole Nationale Superieure d Arts et Metiers Meknes', 'Meknes'],
]

for (const [schoolCode, schoolName, ville] of ensamCampuses) {
  ensureSchool(schoolCode, schoolName, ville, 'Ingenierie')
  bacAdmission(engineeringBacs, schoolCode, 13.5, 'CONCOURS')
  const autoCode = `F9R_INGENIEUR_AUTOMOBILE_${schoolCode}`
  const aeroCode = `F9R_INGENIEUR_AERONAUTIQUE_${schoolCode}`
  ensureProgram(autoCode, `Ingenieur Genie Automobile - ${schoolName}`, 60, 'Industrie automobile')
  ensureProgram(aeroCode, `Ingenieur Aeronautique et Systemes Mecaniques - ${schoolName}`, 60, 'Aeronautique')
  offer(autoCode, schoolCode)
  offer(aeroCode, schoolCode)
  recruit(autoCode, ['INGENIEUR_AUTOMOBILE', 'INGENIEUR_MECANIQUE'], 72)
  recruit(aeroCode, ['INGENIEUR_AERONAUTIQUE', 'INGENIEUR_MECANIQUE'], 70)
}

ensureSchool('AIAC_CASABLANCA', "Academie Internationale Mohammed VI de l Aviation Civile Casablanca", 'Casablanca', 'Aeronautique')
ensureProgram('F9R_INGENIERIE_AERONAUTIQUE_AIAC_CASABLANCA', 'Ingenierie Aeronautique - AIAC Casablanca', 60, 'Aeronautique')
ensureProgram('F9R_FORMATION_PNC_AIAC_CASABLANCA', 'Formation Personnel Navigant Commercial - AIAC Casablanca', 12, 'Aeronautique')
offer('F9R_INGENIERIE_AERONAUTIQUE_AIAC_CASABLANCA', 'AIAC_CASABLANCA')
offer('F9R_FORMATION_PNC_AIAC_CASABLANCA', 'AIAC_CASABLANCA')
bacAdmission(engineeringBacs, 'AIAC_CASABLANCA', 13.5, 'CONCOURS')
bacAdmission(allGeneralBacs, 'F9R_FORMATION_PNC_AIAC_CASABLANCA', 11, 'CONCOURS')
recruit('F9R_INGENIERIE_AERONAUTIQUE_AIAC_CASABLANCA', ['INGENIEUR_AERONAUTIQUE', 'PILOTE_DE_LIGNE'], 68)
recruit('F9R_FORMATION_PNC_AIAC_CASABLANCA', ['PERSONNEL_NAVIGANT_COMMERCIAL'], 70)

const extraSciencePrograms = [
  ['F9R_LICENCE_BIOLOGIE_FS_CASABLANCA', 'Licence Biologie - Faculte des Sciences Casablanca', 'FS_CASABLANCA', 36, 'Sciences', ['BIOLOGISTE', 'ENSEIGNANT_SECONDAIRE']],
  ['F9R_LICENCE_CHIMIE_FS_RABAT', 'Licence Chimie - Faculte des Sciences Rabat', 'FS_RABAT', 36, 'Sciences', ['CHIMISTE', 'ENSEIGNANT_SECONDAIRE']],
  ['F9R_LICENCE_GEOLOGIE_FS_MARRAKECH', 'Licence Geologie - Faculte des Sciences Semlalia Marrakech', 'FS_MARRAKECH', 36, 'Sciences', ['GEOLOGUE', 'ENSEIGNANT_SECONDAIRE']],
  ['F9R_MASTER_BIOLOGIE_SANTE_FS_CASABLANCA', 'Master Biologie Sante - Faculte des Sciences Casablanca', 'FS_CASABLANCA', 60, 'Sciences', ['BIOLOGISTE', 'CHERCHEUR_SCIENTIFIQUE']],
  ['F9R_MASTER_CHIMIE_APPLIQUEE_FS_RABAT', 'Master Chimie Appliquee - Faculte des Sciences Rabat', 'FS_RABAT', 60, 'Sciences', ['CHIMISTE', 'CHERCHEUR_SCIENTIFIQUE']],
  ['F9R_MASTER_GEOSCIENCES_FS_MARRAKECH', 'Master Geosciences - Faculte des Sciences Semlalia Marrakech', 'FS_MARRAKECH', 60, 'Sciences', ['GEOLOGUE', 'CHERCHEUR_SCIENTIFIQUE']],
]

for (const [code, name, school, duration, sector, jobs] of extraSciencePrograms) {
  ensureProgram(code, name, duration, sector)
  offer(code, school)
  bacAdmission(scientificBacs, code, 10, 'OUVERT')
  recruit(code, jobs, 68)
}

for (const [source, target] of [
  ['F9R_LICENCE_CHIMIE_FS_RABAT', 'F9R_MASTER_CHIMIE_APPLIQUEE_FS_RABAT'],
  ['F9R_LICENCE_GEOLOGIE_FS_MARRAKECH', 'F9R_MASTER_GEOSCIENCES_FS_MARRAKECH'],
  ['F9R_LICENCE_SCIENCES_VIE_TERRE_FS_CASABLANCA', 'F9R_MASTER_BIOLOGIE_SANTE_FS_CASABLANCA'],
]) {
  addEdge({
    source,
    target,
    type_lien: 'DONNE_ACCES',
    taux_reussite: 66,
    moyenne_minimale: 12,
    type_acces: 'DOSSIER',
    prerequis_notes: 'Acces apres licence compatible, selon dossier.',
  })
}

ensureProgram('F9R_DOCTORAT_SCIENCES_FS_RABAT', 'Doctorat Sciences - Faculte des Sciences Rabat', 96, 'Recherche')
offer('F9R_DOCTORAT_SCIENCES_FS_RABAT', 'FS_RABAT')
for (const source of ['F9R_MASTER_DATA_SCIENCE_FS_CASABLANCA', 'F9R_MASTER_BIOLOGIE_SANTE_FS_CASABLANCA', 'F9R_MASTER_CHIMIE_APPLIQUEE_FS_RABAT', 'F9R_MASTER_GEOSCIENCES_FS_MARRAKECH']) {
  addEdge({
    source,
    target: 'F9R_DOCTORAT_SCIENCES_FS_RABAT',
    type_lien: 'DONNE_ACCES',
    taux_reussite: 62,
    moyenne_minimale: 12,
    type_acces: 'DOSSIER',
    prerequis_notes: 'Acces apres master ou diplome equivalent selon dossier de recherche.',
  })
}
recruit('F9R_DOCTORAT_SCIENCES_FS_RABAT', ['PROFESSEUR_UNIVERSITAIRE', 'CHERCHEUR_SCIENTIFIQUE', 'STATISTICIEN'], 66)

ensureProgram('F9R_LICENCE_PSYCHOLOGIE_FLSH_RABAT', 'Licence Psychologie - FLSH Rabat', 36, 'Psychologie')
ensureProgram('F9R_MASTER_PSYCHOLOGIE_CLINIQUE_FLSH_RABAT', 'Master Psychologie Clinique - FLSH Rabat', 60, 'Psychologie')
offer('F9R_LICENCE_PSYCHOLOGIE_FLSH_RABAT', 'FLSH_RABAT')
offer('F9R_MASTER_PSYCHOLOGIE_CLINIQUE_FLSH_RABAT', 'FLSH_RABAT')
bacAdmission([...literatureBacs, ...scientificBacs, ...economyBacs], 'F9R_LICENCE_PSYCHOLOGIE_FLSH_RABAT', 10, 'OUVERT')
bacAdmission([...literatureBacs, ...scientificBacs], 'F9R_MASTER_PSYCHOLOGIE_CLINIQUE_FLSH_RABAT', 12, 'DOSSIER')
addEdge({
  source: 'F9R_LICENCE_PSYCHOLOGIE_FLSH_RABAT',
  target: 'F9R_MASTER_PSYCHOLOGIE_CLINIQUE_FLSH_RABAT',
  type_lien: 'DONNE_ACCES',
  taux_reussite: 68,
  moyenne_minimale: 12,
  type_acces: 'DOSSIER',
  prerequis_notes: 'Acces apres licence en psychologie ou diplome equivalent.',
})
recruit('F9R_MASTER_PSYCHOLOGIE_CLINIQUE_FLSH_RABAT', ['PSYCHOLOGUE'], 68)

ensureProgram('F9R_DOCTORAT_RECHERCHE_ENSEIGNEMENT_SUPERIEUR_FS_RABAT', 'Doctorat Recherche et Enseignement Superieur - Faculte des Sciences Rabat', 96, 'Enseignement et recherche')
offer('F9R_DOCTORAT_RECHERCHE_ENSEIGNEMENT_SUPERIEUR_FS_RABAT', 'FS_RABAT')
for (const source of ['F9R_MASTER_CHIMIE_APPLIQUEE_FS_RABAT', 'F9R_MASTER_GEOSCIENCES_FS_MARRAKECH', 'F9R_MASTER_BIOLOGIE_SANTE_FS_CASABLANCA']) {
  addEdge({
    source,
    target: 'F9R_DOCTORAT_RECHERCHE_ENSEIGNEMENT_SUPERIEUR_FS_RABAT',
    type_lien: 'DONNE_ACCES',
    taux_reussite: 60,
    moyenne_minimale: 12,
    type_acces: 'DOSSIER',
    prerequis_notes: 'Acces apres master ou diplome equivalent, selon dossier et projet de recherche.',
  })
}
recruit('F9R_DOCTORAT_RECHERCHE_ENSEIGNEMENT_SUPERIEUR_FS_RABAT', ['PROFESSEUR_UNIVERSITAIRE', 'CHERCHEUR_SCIENTIFIQUE'], 64)

ensureProgram('F9R_LICENCE_GESTION_IMMOBILIERE_FSJES_CASABLANCA', 'Licence Gestion Immobiliere - FSJES Casablanca', 36, 'Commerce')
offer('F9R_LICENCE_GESTION_IMMOBILIERE_FSJES_CASABLANCA', 'FSJES_CASABLANCA')
bacAdmission([...economyBacs, ...literatureBacs], 'F9R_LICENCE_GESTION_IMMOBILIERE_FSJES_CASABLANCA', 10, 'OUVERT')
recruit('F9R_LICENCE_GESTION_IMMOBILIERE_FSJES_CASABLANCA', ['AGENT_IMMOBILIER', 'CONSEILLER_COMMERCIAL'], 68)

const istaCenters = [
  ['ISTA_CASABLANCA', 'ISTA Casablanca', 'Casablanca'],
  ['ISTA_RABAT', 'ISTA Rabat', 'Rabat'],
  ['ISTA_FES', 'ISTA Fes', 'Fes'],
  ['ISTA_MARRAKECH', 'ISTA Marrakech', 'Marrakech'],
  ['ISTA_TANGER', 'ISTA Tanger', 'Tanger'],
  ['ISTA_AGADIR', 'ISTA Agadir', 'Agadir'],
]

const istaPrograms = [
  ['TS_LOGISTIQUE', 'Technicien Specialise Logistique', 'Logistique', allGeneralBacs, ['GESTIONNAIRE_STOCK', 'RESPONSABLE_LOGISTIQUE']],
  ['TS_COMMERCE_INTERNATIONAL', 'Technicien Specialise Commerce International', 'Commerce international', economyBacs, ['RESPONSABLE_IMPORT_EXPORT', 'ACHETEUR', 'CONSEILLER_COMMERCIAL']],
  ['TS_ELECTRICITE_MAINTENANCE', 'Technicien Specialise Electricite et Maintenance', 'Electricite', engineeringBacs, ['TECHNICIEN_ELECTRICIEN', 'TECHNICIEN_MAINTENANCE_INDUSTRIELLE', 'TECHNICIEN_FROID_CLIMATISATION']],
  ['TS_DIAGNOSTIC_AUTOMOBILE', 'Technicien Specialise Diagnostic Automobile', 'Automobile', engineeringBacs, ['MECANICIEN_AUTOMOBILE', 'TECHNICIEN_MAINTENANCE_INDUSTRIELLE']],
  ['TS_HOTELLERIE_RECEPTION', 'Technicien Specialise Reception et Hotellerie', 'Hotellerie', allGeneralBacs, ['RECEPTIONNISTE_HOTEL', 'MANAGER_HOTELIER']],
  ['TS_CUISINE_RESTAURATION', 'Technicien Specialise Cuisine et Restauration', 'Restauration', allGeneralBacs, ['CHEF_CUISINIER']],
  ['TS_INFOGRAPHIE_AUDIOVISUEL', 'Technicien Specialise Infographie et Audiovisuel', 'Audiovisuel', allGeneralBacs, ['PHOTOGRAPHE', 'VIDEASTE_MONTEUR', 'DESIGNER_GRAPHIQUE']],
]

for (const [schoolCode, schoolName, ville] of istaCenters) {
  ensureSchool(schoolCode, schoolName, ville, 'Formation professionnelle')
  for (const [suffix, label, sector, bacs, jobs] of istaPrograms) {
    const code = `F9R_${suffix}_${schoolCode}`
    ensureProgram(code, `${label} - ${schoolName}`, 24, sector)
    offer(code, schoolCode)
    bacAdmission(bacs, code, 10, 'DOSSIER')
    recruit(code, jobs, 68)
  }
}

extraRecruit(estSchools.map(([schoolCode]) => `F9R_DUT_QHSE_${schoolCode}`), ['RESPONSABLE_QUALITE'], 68)
extraRecruit(istaCenters.map(([schoolCode]) => `F9R_TS_ELECTRICITE_MAINTENANCE_${schoolCode}`), ['RESPONSABLE_QUALITE'], 64)

const crmefCenters = [
  ['CRMEF_RABAT', 'CRMEF Rabat', 'Rabat'],
  ['CRMEF_CASABLANCA', 'CRMEF Casablanca', 'Casablanca'],
  ['CRMEF_FES', 'CRMEF Fes', 'Fes'],
  ['CRMEF_MARRAKECH', 'CRMEF Marrakech', 'Marrakech'],
]

const teachingSourcePrograms = [
  'F9R_LICENCE_ETUDES_FRANCAISES_FLSH_RABAT',
  'F9R_LICENCE_MATHEMATIQUES_FS_RABAT',
  'F9R_LICENCE_PHYSIQUE_CHIMIE_FS_RABAT',
  'F9R_LICENCE_SCIENCES_VIE_TERRE_FS_RABAT',
  ...fsCampuses.map(([schoolCode]) => `F9R_LICENCE_MATHEMATIQUES_${schoolCode}`),
  ...fsCampuses.map(([schoolCode]) => `F9R_LICENCE_PHYSIQUE_CHIMIE_${schoolCode}`),
  ...fsCampuses.map(([schoolCode]) => `F9R_LICENCE_SCIENCES_VIE_TERRE_${schoolCode}`),
]

for (const [schoolCode, schoolName, ville] of crmefCenters) {
  ensureSchool(schoolCode, schoolName, ville, 'Education')
  const primary = `F9R_FORMATION_CRMEF_PRIMAIRE_${schoolCode}`
  const secondary = `F9R_FORMATION_CRMEF_SECONDAIRE_${schoolCode}`
  ensureProgram(primary, `Formation Enseignement Primaire - ${schoolName}`, 12, 'Education')
  ensureProgram(secondary, `Formation Enseignement Secondaire - ${schoolName}`, 12, 'Education')
  offer(primary, schoolCode)
  offer(secondary, schoolCode)
  for (const source of teachingSourcePrograms) {
    addEdge({
      source,
      target: primary,
      type_lien: 'DONNE_ACCES',
      taux_reussite: 65,
      moyenne_minimale: 10,
      type_acces: 'CONCOURS',
      prerequis_notes: 'Acces au CRMEF apres licence ou diplome equivalent selon concours.',
    })
    addEdge({
      source,
      target: secondary,
      type_lien: 'DONNE_ACCES',
      taux_reussite: 65,
      moyenne_minimale: 10,
      type_acces: 'CONCOURS',
      prerequis_notes: 'Acces au CRMEF apres licence ou diplome equivalent selon concours.',
    })
  }
  recruit(primary, ['ENSEIGNANT_PRIMAIRE'], 72)
  recruit(secondary, ['ENSEIGNANT_SECONDAIRE'], 72)
}

ensureSchool('INAS_TANGER', 'Institut National de l Action Sociale Tanger', 'Tanger', 'Social')
ensureProgram('F9R_LICENCE_ACTION_SOCIALE_INAS_TANGER', 'Licence Action Sociale - INAS Tanger', 36, 'Social')
offer('F9R_LICENCE_ACTION_SOCIALE_INAS_TANGER', 'INAS_TANGER')
bacAdmission(allGeneralBacs, 'F9R_LICENCE_ACTION_SOCIALE_INAS_TANGER', 11, 'CONCOURS')
recruit('F9R_LICENCE_ACTION_SOCIALE_INAS_TANGER', ['ASSISTANT_SOCIAL', 'EDUCATEUR_SPECIALISE'], 70)

ensureSchool('IRFC_RABAT', 'Institut Royal de Formation des Cadres Rabat', 'Rabat', 'Sport')
ensureProgram('F9R_LICENCE_EDUCATION_PHYSIQUE_IRFC_RABAT', 'Licence Education Physique et Sportive - IRFC Rabat', 36, 'Sport')
offer('F9R_LICENCE_EDUCATION_PHYSIQUE_IRFC_RABAT', 'IRFC_RABAT')
bacAdmission(allGeneralBacs, 'F9R_LICENCE_EDUCATION_PHYSIQUE_IRFC_RABAT', 11, 'CONCOURS')
recruit('F9R_LICENCE_EDUCATION_PHYSIQUE_IRFC_RABAT', ['EDUCATEUR_SPORTIF'], 70)

ensureSchool('ISIC_RABAT', 'Institut Superieur de l Information et de la Communication Rabat', 'Rabat', 'Journalisme')
ensureProgram('F9R_LICENCE_JOURNALISME_COMMUNICATION_ISIC_RABAT', 'Licence Journalisme et Communication - ISIC Rabat', 36, 'Journalisme')
offer('F9R_LICENCE_JOURNALISME_COMMUNICATION_ISIC_RABAT', 'ISIC_RABAT')
bacAdmission(allGeneralBacs, 'F9R_LICENCE_JOURNALISME_COMMUNICATION_ISIC_RABAT', 11, 'CONCOURS')
recruit('F9R_LICENCE_JOURNALISME_COMMUNICATION_ISIC_RABAT', ['JOURNALISTE', 'CONTENT_MANAGER', 'COMMUNITY_MANAGER'], 70)

ensureSchool('ISMAC_RABAT', 'Institut Superieur des Metiers de l Audiovisuel et du Cinema Rabat', 'Rabat', 'Audiovisuel')
ensureProgram('F9R_LICENCE_AUDIOVISUEL_CINEMA_ISMAC_RABAT', 'Licence Audiovisuel et Cinema - ISMAC Rabat', 36, 'Audiovisuel')
offer('F9R_LICENCE_AUDIOVISUEL_CINEMA_ISMAC_RABAT', 'ISMAC_RABAT')
bacAdmission(allGeneralBacs, 'F9R_LICENCE_AUDIOVISUEL_CINEMA_ISMAC_RABAT', 11, 'CONCOURS')
recruit('F9R_LICENCE_AUDIOVISUEL_CINEMA_ISMAC_RABAT', ['VIDEASTE_MONTEUR', 'PRODUCTEUR_AUDIOVISUEL', 'PHOTOGRAPHE'], 70)

ensureSchool('ISIT_TANGER', 'Institut Superieur International du Tourisme Tanger', 'Tanger', 'Tourisme')
ensureProgram('F9R_LICENCE_TOURISME_HOTELLERIE_ISIT_TANGER', 'Licence Tourisme et Hotellerie - ISIT Tanger', 36, 'Tourisme')
offer('F9R_LICENCE_TOURISME_HOTELLERIE_ISIT_TANGER', 'ISIT_TANGER')
bacAdmission(allGeneralBacs, 'F9R_LICENCE_TOURISME_HOTELLERIE_ISIT_TANGER', 11, 'CONCOURS')
recruit('F9R_LICENCE_TOURISME_HOTELLERIE_ISIT_TANGER', ['GUIDE_TOURISTIQUE', 'MANAGER_HOTELIER', 'RECEPTIONNISTE_HOTEL'], 70)

ensureSchool('INBA_TETOUAN', 'Institut National des Beaux-Arts Tetouan', 'Tetouan', 'Arts et design')
ensureProgram('F9R_LICENCE_DESIGN_INTERIEUR_INBA_TETOUAN', 'Licence Design d Interieur - INBA Tetouan', 36, 'Arts et design')
offer('F9R_LICENCE_DESIGN_INTERIEUR_INBA_TETOUAN', 'INBA_TETOUAN')
bacAdmission(allGeneralBacs, 'F9R_LICENCE_DESIGN_INTERIEUR_INBA_TETOUAN', 11, 'CONCOURS')
recruit('F9R_LICENCE_DESIGN_INTERIEUR_INBA_TETOUAN', ['ARCHITECTE_INTERIEUR', 'UX_UI_DESIGNER', 'PHOTOGRAPHE'], 68)

ensureProgram('F9R_LICENCE_TRADUCTION_FLSH_RABAT', 'Licence Langues et Traduction - FLSH Rabat', 36, 'Langues')
offer('F9R_LICENCE_TRADUCTION_FLSH_RABAT', 'FLSH_RABAT')
bacAdmission([...literatureBacs, ...economyBacs], 'F9R_LICENCE_TRADUCTION_FLSH_RABAT', 10, 'OUVERT')
recruit('F9R_LICENCE_TRADUCTION_FLSH_RABAT', ['TRADUCTEUR_INTERPRETE', 'CONTENT_MANAGER', 'ENSEIGNANT_SECONDAIRE'], 68)

const publicServiceTracks = [
  ['POLICE_INSTITUT_KENITRA', 'Institut Royal de Police Kenitra', 'Kenitra', 'F9R_CONCOURS_POLICE_KENITRA', 'Concours Police - Institut Royal de Police Kenitra', ['POLICIER']],
  ['GENDARMERIE_ROYALE_RABAT', 'Gendarmerie Royale Rabat', 'Rabat', 'F9R_CONCOURS_GENDARMERIE_RABAT', 'Concours Gendarmerie Royale', ['GENDARME']],
  ['ARM_MEKNESS', 'Academie Royale Militaire Meknes', 'Meknes', 'F9R_CONCOURS_OFFICIER_ARM_MEKNESS', 'Concours Officier Militaire - ARM Meknes', ['OFFICIER_MILITAIRE']],
  ['DOUANES_RABAT', 'Administration des Douanes Rabat', 'Rabat', 'F9R_CONCOURS_DOUANES_RABAT', 'Concours Douanes', ['DOUANIER']],
  ['PROTECTION_CIVILE_CASABLANCA', 'Ecole Nationale de Protection Civile Casablanca', 'Casablanca', 'F9R_CONCOURS_PROTECTION_CIVILE_CASABLANCA', 'Concours Protection Civile', ['POMPIER']],
]

for (const [schoolCode, schoolName, ville, programCode, programName, jobs] of publicServiceTracks) {
  ensureSchool(schoolCode, schoolName, ville, 'Service public')
  ensureProgram(programCode, programName, 12, 'Service public')
  offer(programCode, schoolCode)
  bacAdmission(allGeneralBacs, programCode, 10, 'CONCOURS')
  recruit(programCode, jobs, 68)
}

const codeForJob = (name) => titleToCode(name)
const ensureJobNames = (names, sector) => {
  for (const name of names) ensureJob(codeForJob(name), name, sector)
}

const ensureCommonTrack = ({ schoolCode, schoolName, city, programCode, programName, duration = 24, sector, bacs = allGeneralBacs, jobs, access = 'DOSSIER', min = 10, rate = 67 }) => {
  ensureSchool(schoolCode, schoolName, city, sector)
  ensureProgram(programCode, programName, duration, sector)
  offer(programCode, schoolCode)
  bacAdmission(bacs, programCode, min, access)
  recruit(programCode, jobs.map(codeForJob), rate)
}

const healthAssistantJobs = [
  'Aide soignant',
  'Ambulancier',
  'Preparateur en pharmacie',
  'Assistant dentaire',
]
const healthLicenseJobs = [
  'Orthophoniste',
  'Orthoptiste',
  'Psychomotricien',
  'Nutritionniste',
  'Opticien lunetier',
  'Prothesiste dentaire',
  'Ingenieur biomedical',
  'Technicien biomedical',
]
ensureJobNames([...healthAssistantJobs, ...healthLicenseJobs], 'Sante')
ensureCommonTrack({
  schoolCode: 'IFPS_CASABLANCA',
  schoolName: 'Institut de Formation Professionnelle Sante Casablanca',
  city: 'Casablanca',
  programCode: 'F9R_TS_ASSISTANCE_SANTE_IFPS_CASABLANCA',
  programName: 'Technicien Specialise Assistance Sante - IFPS Casablanca',
  duration: 24,
  sector: 'Sante',
  bacs: scientificBacs,
  jobs: healthAssistantJobs,
})
ensureCommonTrack({
  schoolCode: 'ISPITS_RABAT',
  schoolName: 'ISPITS Rabat',
  city: 'Rabat',
  programCode: 'F9R_LICENCE_PARAMEDICAL_SPECIALISE_ISPITS_RABAT',
  programName: 'Licence Professions Paramedicales Specialisees - ISPITS Rabat',
  duration: 36,
  sector: 'Sante',
  bacs: scientificBacs,
  jobs: healthLicenseJobs,
  access: 'CONCOURS',
  min: 12,
  rate: 70,
})

const digitalJobs = [
  'Testeur logiciel',
  'Technicien support informatique',
  'Technicien reseaux informatiques',
  'Developpeur mobile',
  'Developpeur jeux video',
  'Integrateur web',
  'Webmaster',
  'Product owner',
  'Scrum master',
  'Analyste SOC',
  'Consultant cybersecurite',
  'Responsable securite informatique',
  'Forensic analyst',
  'Data privacy officer',
  'Consultant ERP',
  'Consultant fonctionnel',
  'Consultant SAP',
  'Consultant CRM',
  'Responsable SI',
  'Chef de projet SI',
  'Auditeur SI',
]
ensureJobNames(digitalJobs, 'Informatique')
ensureCommonTrack({
  schoolCode: 'ENSIAS_RABAT',
  schoolName: "Ecole Nationale Superieure d'Informatique et d'Analyse des Systemes Rabat",
  city: 'Rabat',
  programCode: 'F9R_INGENIERIE_SYSTEMES_DIGITAUX_ENSIAS_RABAT',
  programName: 'Ingenierie Systemes Digitaux et Cybersecurite - ENSIAS Rabat',
  duration: 60,
  sector: 'Informatique',
  bacs: engineeringBacs,
  jobs: digitalJobs,
  access: 'CONCOURS',
  min: 14,
  rate: 74,
})
ensureCommonTrack({
  schoolCode: 'ISTA_CASABLANCA',
  schoolName: 'ISTA Casablanca',
  city: 'Casablanca',
  programCode: 'F9R_TS_DEVELOPPEMENT_DIGITAL_ISTA_CASABLANCA',
  programName: 'Technicien Specialise Developpement Digital - ISTA Casablanca',
  duration: 24,
  sector: 'Informatique',
  bacs: engineeringBacs,
  jobs: ['Testeur logiciel', 'Developpeur mobile', 'Integrateur web', 'Webmaster', 'Technicien support informatique', 'Technicien reseaux informatiques'],
})

const financeExtraJobs = [
  'Credit manager',
  'Tresorier',
  'Agent d assurance',
  'Courtier en assurance',
  'Guichetier bancaire',
  'Caissier',
  'Gestionnaire paie',
  'Assistant administratif et financier',
  'Risk manager',
  'Compliance officer',
  'Analyste credit',
  'Gestionnaire patrimoine',
  'Conseiller financier',
  'Trader',
  'Courtier bourse',
  'Responsable recouvrement',
  'Conseiller fiscal',
  'Chef comptable',
  'Directeur administratif et financier',
  'Controleur interne',
]
ensureJobNames(financeExtraJobs, 'Finance')
ensureCommonTrack({
  schoolCode: 'FSJES_CASABLANCA',
  schoolName: 'Faculte des Sciences Juridiques, Economiques et Sociales Casablanca',
  city: 'Casablanca',
  programCode: 'F9R_LICENCE_FINANCE_BANQUE_ASSURANCE_FSJES_CASABLANCA',
  programName: 'Licence Finance Banque Assurance - FSJES Casablanca',
  duration: 36,
  sector: 'Finance',
  bacs: economyBacs,
  jobs: financeExtraJobs,
  access: 'OUVERT',
  rate: 68,
})
ensureCommonTrack({
  schoolCode: 'ISTA_RABAT',
  schoolName: 'ISTA Rabat',
  city: 'Rabat',
  programCode: 'F9R_TS_GESTION_COMPTABLE_PAIE_ISTA_RABAT',
  programName: 'Technicien Specialise Gestion Comptable et Paie - ISTA Rabat',
  duration: 24,
  sector: 'Finance',
  bacs: economyBacs,
  jobs: ['Caissier', 'Gestionnaire paie', 'Assistant administratif et financier', 'Chef comptable', 'Assistant comptable', 'Comptable'],
})

const legalExtraJobs = [
  'Huissier de justice',
  'Magistrat',
  'Greffier',
  'Conseiller juridique',
  'Fiscaliste juridique',
  'Assistant juridique',
  'Clerc de notaire',
  'Mediateur',
  'Diplomate',
  'Administrateur public',
  'Inspecteur des impots',
  'Inspecteur du travail',
  'Agent communal',
  'Redacteur territorial',
  'Conservateur foncier',
  'Officier d etat civil',
]
ensureJobNames(legalExtraJobs, 'Droit et administration')
ensureCommonTrack({
  schoolCode: 'FSJES_RABAT_AGDAL',
  schoolName: 'Faculte des Sciences Juridiques, Economiques et Sociales Rabat Agdal',
  city: 'Rabat',
  programCode: 'F9R_LICENCE_DROIT_ADMINISTRATION_FSJES_RABAT',
  programName: 'Licence Droit et Administration Publique - FSJES Rabat',
  duration: 36,
  sector: 'Droit et administration',
  bacs: [...literatureBacs, ...economyBacs],
  jobs: legalExtraJobs,
  access: 'OUVERT',
  rate: 66,
})

const commerceAdminJobs = [
  'Vendeur',
  'Chef de rayon',
  'Responsable magasin',
  'Teleconseiller',
  'Charge de clientele',
  'Assistant de direction',
  'Secretaire bureautique',
  'Office manager',
  'Assistant achats',
  'Merchandiser',
  'E merchandiser',
  'Responsable e commerce',
  'Traffic manager',
  'Commercial export',
  'Key account manager',
  'Customer success manager',
  'Responsable relation client',
  'Animateur commercial',
  'Merchandiser visuel',
  'Administrateur des ventes',
  'Gestionnaire de projet',
]
ensureJobNames(commerceAdminJobs, 'Commerce et administration')
ensureCommonTrack({
  schoolCode: 'ISTA_FES',
  schoolName: 'ISTA Fes',
  city: 'Fes',
  programCode: 'F9R_TS_COMMERCE_ADMINISTRATION_ISTA_FES',
  programName: 'Technicien Specialise Commerce et Administration - ISTA Fes',
  duration: 24,
  sector: 'Commerce et administration',
  bacs: allGeneralBacs,
  jobs: commerceAdminJobs,
})

const realEstateJobs = [
  'Gestionnaire de copropriete',
  'Courtier immobilier',
  'Promoteur immobilier',
  'Gestionnaire locatif',
]
ensureJobNames(realEstateJobs, 'Immobilier')
ensureCommonTrack({
  schoolCode: 'FSJES_CASABLANCA',
  schoolName: 'Faculte des Sciences Juridiques, Economiques et Sociales Casablanca',
  city: 'Casablanca',
  programCode: 'F9R_LICENCE_GESTION_IMMOBILIERE_AVANCEE_FSJES_CASABLANCA',
  programName: 'Licence Gestion Immobiliere et Patrimoine - FSJES Casablanca',
  duration: 36,
  sector: 'Immobilier',
  bacs: [...economyBacs, ...literatureBacs],
  jobs: realEstateJobs,
  access: 'OUVERT',
  rate: 66,
})

const btpExtraJobs = [
  'Technicien genie civil',
  'Technicien topographe',
  'Metreur',
  'Dessinateur projeteur',
  'Conducteur d engins BTP',
  'Chef de chantier',
  'Plombier',
  'Menuisier aluminium',
]
ensureJobNames(btpExtraJobs, 'BTP')
ensureCommonTrack({
  schoolCode: 'ISTA_MARRAKECH',
  schoolName: 'ISTA Marrakech',
  city: 'Marrakech',
  programCode: 'F9R_TS_BTP_CHANTIER_ISTA_MARRAKECH',
  programName: 'Technicien Specialise BTP et Chantier - ISTA Marrakech',
  duration: 24,
  sector: 'BTP',
  bacs: [...engineeringBacs, ...allGeneralBacs],
  jobs: btpExtraJobs,
})

const industryExtraJobs = [
  'Chaudronnier',
  'Tourneur fraiseur',
  'Technicien methodes',
  'Technicien production',
  'Automaticien',
  'Electromecanicien',
  'Mecatronicien',
  'Technicien textile',
  'Operateur machine',
  'Responsable production',
  'Responsable maintenance',
  'Ingenieur process',
  'Ingenieur qualite',
  'Ingenieur HSE',
  'Responsable securite industrielle',
  'Planificateur production',
  'Ingenieur materiaux',
  'Ingenieur chimie industrielle',
  'Ingenieur petrochimie',
  'Ingenieur plasturgie',
  'Technicien plasturgie',
  'Technicien laboratoire chimie',
  'Responsable R&D',
  'Technicien R&D',
  'Technicien metrologie',
  'Controleur qualite',
  'Auditeur qualite',
]
ensureJobNames(industryExtraJobs, 'Industrie')
ensureCommonTrack({
  schoolCode: 'ISTA_TANGER',
  schoolName: 'ISTA Tanger',
  city: 'Tanger',
  programCode: 'F9R_TS_INDUSTRIE_PRODUCTION_ISTA_TANGER',
  programName: 'Technicien Specialise Industrie et Production - ISTA Tanger',
  duration: 24,
  sector: 'Industrie',
  bacs: engineeringBacs,
  jobs: industryExtraJobs,
})
ensureCommonTrack({
  schoolCode: 'ENSAM_CASABLANCA',
  schoolName: 'Ecole Nationale Superieure d Arts et Metiers Casablanca',
  city: 'Casablanca',
  programCode: 'F9R_INGENIERIE_INDUSTRIE_QUALITE_ENSAM_CASABLANCA',
  programName: 'Ingenierie Industrie Qualite et Process - ENSAM Casablanca',
  duration: 60,
  sector: 'Industrie',
  bacs: engineeringBacs,
  jobs: industryExtraJobs.filter((job) => /^Ingenieur|Responsable|Planificateur|Auditeur|Controleur/.test(job)),
  access: 'CONCOURS',
  min: 13.5,
  rate: 72,
})

const environmentEnergyJobs = [
  'Ingenieur environnement',
  'Technicien environnement',
  'Technicien traitement des eaux',
  'Technicien energie solaire',
  'Installateur panneaux solaires',
  'Ingenieur hydraulique',
  'Ingenieur mines',
  'Technicien mines',
  'Technicien geologie',
]
ensureJobNames(environmentEnergyJobs, 'Environnement et energies')
ensureCommonTrack({
  schoolCode: 'FST_MARRAKECH',
  schoolName: 'Faculte des Sciences et Techniques Marrakech',
  city: 'Marrakech',
  programCode: 'F9R_LICENCE_ENVIRONNEMENT_ENERGIES_FST_MARRAKECH',
  programName: 'Licence Environnement Energies et Mines - FST Marrakech',
  duration: 36,
  sector: 'Environnement et energies',
  bacs: scientificBacs,
  jobs: environmentEnergyJobs,
  access: 'DOSSIER',
  min: 11,
})

const educationExtraJobs = [
  'Professeur de langues',
  'Conseiller d orientation',
  'Formateur professionnel',
  'Bibliothecaire',
  'Archiviste',
  'Documentaliste',
  'Animateur socioculturel',
  'Moniteur auto ecole',
  'Assistant pedagogique',
  'Coach scolaire',
]
ensureJobNames(educationExtraJobs, 'Education et culture')
ensureCommonTrack({
  schoolCode: 'FLSH_RABAT',
  schoolName: 'Faculte des Lettres et Sciences Humaines Rabat',
  city: 'Rabat',
  programCode: 'F9R_LICENCE_EDUCATION_CULTURE_FLSH_RABAT',
  programName: 'Licence Education Culture et Documentation - FLSH Rabat',
  duration: 36,
  sector: 'Education et culture',
  bacs: [...literatureBacs, ...economyBacs],
  jobs: educationExtraJobs,
  access: 'OUVERT',
})

const mediaArtJobs = [
  'Technicien audiovisuel',
  'Regisseur son',
  'Regisseur lumiere',
  'Designer produit',
  'Styliste modeliste',
  'Decorateur',
  'Artisan bijoutier',
  'Coiffeur',
  'Estheticienne',
  'Maquilleur professionnel',
  'Charge communication',
  'Responsable communication',
  'Attache de presse',
  'Charge evenementiel',
]
ensureJobNames(mediaArtJobs, 'Arts communication et services')
ensureCommonTrack({
  schoolCode: 'ISMAC_RABAT',
  schoolName: 'Institut Superieur des Metiers de l Audiovisuel et du Cinema Rabat',
  city: 'Rabat',
  programCode: 'F9R_TS_AUDIOVISUEL_COMMUNICATION_ISMAC_RABAT',
  programName: 'Technicien Audiovisuel Communication et Evenementiel - ISMAC Rabat',
  duration: 36,
  sector: 'Arts communication et services',
  bacs: allGeneralBacs,
  jobs: mediaArtJobs.filter((job) => !['Coiffeur', 'Estheticienne', 'Maquilleur professionnel'].includes(job)),
  access: 'CONCOURS',
})
ensureCommonTrack({
  schoolCode: 'ISTA_AGADIR',
  schoolName: 'ISTA Agadir',
  city: 'Agadir',
  programCode: 'F9R_TS_ARTISANAT_BEAUTE_ISTA_AGADIR',
  programName: 'Technicien Artisanat Beaute et Services - ISTA Agadir',
  duration: 24,
  sector: 'Arts communication et services',
  bacs: allGeneralBacs,
  jobs: ['Coiffeur', 'Estheticienne', 'Maquilleur professionnel', 'Styliste modeliste', 'Artisan bijoutier', 'Decorateur'],
})

const hospitalityExtraJobs = [
  'Patissier',
  'Boulanger',
  'Boucher',
  'Serveur restaurant',
  'Barman',
  'Agent de voyage',
  'Agent d escale',
  'Agent de reservation',
  'Steward maritime',
  'Responsable restauration',
  'Gouvernante hotel',
  'Concierge hotel',
]
ensureJobNames(hospitalityExtraJobs, 'Hotellerie tourisme et restauration')
ensureCommonTrack({
  schoolCode: 'ISIT_TANGER',
  schoolName: 'Institut Superieur International du Tourisme Tanger',
  city: 'Tanger',
  programCode: 'F9R_TS_TOURISME_RESTAURATION_ISIT_TANGER',
  programName: 'Technicien Tourisme Hotellerie et Restauration - ISIT Tanger',
  duration: 36,
  sector: 'Hotellerie tourisme et restauration',
  bacs: allGeneralBacs,
  jobs: hospitalityExtraJobs,
  access: 'CONCOURS',
})

const serviceJobs = [
  'Agent securite',
  'Agent de nettoyage',
  'Agent de maintenance batiment',
]
ensureJobNames(serviceJobs, 'Services')
ensureCommonTrack({
  schoolCode: 'ISTA_CASABLANCA',
  schoolName: 'ISTA Casablanca',
  city: 'Casablanca',
  programCode: 'F9R_QUALIFICATION_SERVICES_BATIMENT_ISTA_CASABLANCA',
  programName: 'Qualification Services Securite et Maintenance Batiment - ISTA Casablanca',
  duration: 12,
  sector: 'Services',
  bacs: allGeneralBacs,
  jobs: serviceJobs,
})

const agricultureJobs = [
  'Agriculteur',
  'Technicien agricole',
  'Eleveur',
  'Technicien irrigation',
  'Technicien horticulture',
  'Technicien peche maritime',
  'Technicien aquaculture',
  'Responsable exploitation agricole',
  'Veterinaire rural',
  'Technicien forestier',
  'Commercial agricole',
  'Consultant agricole',
  'Responsable laboratoire agroalimentaire',
  'Technicien controle qualite alimentaire',
  'Responsable achats agricoles',
]
ensureJobNames(agricultureJobs, 'Agriculture agroalimentaire et peche')
ensureCommonTrack({
  schoolCode: 'IAV_RABAT',
  schoolName: 'Institut Agronomique et Veterinaire Hassan II Rabat',
  city: 'Rabat',
  programCode: 'F9R_TECHNIQUES_AGRICOLES_IAV_RABAT',
  programName: 'Techniques Agricoles Agroalimentaires et Peche - IAV Rabat',
  duration: 36,
  sector: 'Agriculture agroalimentaire et peche',
  bacs: scientificBacs,
  jobs: agricultureJobs,
  access: 'CONCOURS',
  min: 12,
  rate: 70,
})

const logisticsTransportJobs = [
  'Gestionnaire transport',
  'Chauffeur livreur',
  'Chauffeur poids lourd',
  'Conducteur bus',
  'Declarant en douane',
  'Transitaire',
  'Agent maritime',
  'Gestionnaire entrepot',
  'Assistant import export',
]
ensureJobNames(logisticsTransportJobs, 'Logistique et transport')
ensureCommonTrack({
  schoolCode: 'ISTA_CASABLANCA',
  schoolName: 'ISTA Casablanca',
  city: 'Casablanca',
  programCode: 'F9R_TS_TRANSPORT_DOUANE_ISTA_CASABLANCA',
  programName: 'Technicien Specialise Transport Douane et Transit - ISTA Casablanca',
  duration: 24,
  sector: 'Logistique et transport',
  bacs: allGeneralBacs,
  jobs: logisticsTransportJobs,
})

const mergeCityAliases = [
  ['CASABLANCA', ['CASABLANCA']],
  ['RABAT', ['RABAT', 'FMPR']],
  ['MARRAKECH', ['MARRAKECH']],
  ['FES', ['FES', 'FEZ', 'FÈS']],
  ['BENI_MELLAL', ['BENI MELLAL', 'BENI_MELLAL', 'BÉNI MELLAL']],
  ['OUJDA', ['OUJDA']],
  ['AGADIR', ['AGADIR']],
  ['LAAYOUNE', ['LAAYOUNE', 'LAAOUNE', 'LAÂYOUNE']],
  ['GUELMIM', ['GUELMIM']],
  ['TANGER', ['TANGER']],
  ['ERRACHIDIA', ['ERRACHIDIA']],
  ['MEKNES', ['MEKNES']],
  ['SETTAT', ['SETTAT']],
  ['KENITRA', ['KENITRA']],
  ['EL_JADIDA', ['EL JADIDA', 'JADIDA']],
  ['DAKHLA', ['DAKHLA']],
  ['TETOUAN', ['TETOUAN']],
  ['SAFI', ['SAFI']],
  ['AL_HOCEIMA', ['AL HOCEIMA']],
  ['BERRECHID', ['BERRECHID']],
]

const cityFromNode = (node) => {
  const text = normalize(`${node.code} ${node.nom_fr} ${node.ville || ''}`)
  const match = mergeCityAliases.find(([, aliases]) => aliases.some((alias) => text.includes(normalize(alias))))
  return match?.[0] || null
}

const healthProgramKind = (node) => {
  if (node.type !== 'FILIERE') return null
  const code = normalize(node.code)
  const programName = normalize(String(node.nom_fr || '').split(' - ')[0])
  const text = `${code} ${programName}`
  const isDoctoralHealth =
    text.includes('DOCTORAT') ||
    text.includes('DOCTEUR') ||
    text.includes('MEDECINE') ||
    text.includes('PHARMACIE')

  if (!isDoctoralHealth) return null
  if (text.includes('MEDECINE VETERINAIRE')) return null
  if (text.includes('MEDECINE DENTAIRE') || text.includes('DENTAIRE')) return 'MEDECINE_DENTAIRE'
  if (text.includes('PHARMACIE')) return 'PHARMACIE'
  if (text.includes('MEDECINE')) return 'MEDECINE'
  return null
}

const mergeKeyForNode = (node) => {
  const kind = healthProgramKind(node)
  const city = cityFromNode(node)
  if (!kind || !city) return null
  const privateMarker = /UM6SS|FM6MD|MOHAMMED VI|UIC|UPF|UNIVERSITE PRIVEE|ECOLE PRIVEE|INSTITUT PRIVE/.test(normalize(`${node.code} ${node.nom_fr} ${node.description || ''}`))
  return `FILIERE:${kind}:${city}:${privateMarker ? 'PRIVATE' : 'PUBLIC'}`
}

const expectedDurationForMergeKey = (key) => {
  if (key.includes(':MEDECINE_DENTAIRE:')) return 72
  if (key.includes(':PHARMACIE:')) return 72
  if (key.includes(':MEDECINE:')) return 84
  return null
}

const canonicalScore = (node, key) => {
  const expectedDuration = expectedDurationForMergeKey(key)
  const text = normalize(`${node.code} ${node.nom_fr}`)
  let score = 0

  if (node.duree_mois === expectedDuration) score += 1000
  if (text.includes('_FMP') || text.includes('FMPR')) score += 120
  if (text.includes('DIPLOME') || text.includes('DOCTEUR')) score += 80
  if (node.description && !node.description.startsWith('Donnee consolidee')) score += Math.min(node.description.length, 300) / 10
  if (!/_\d+$/.test(node.code)) score += 10

  return score
}

const mergeDuplicateNodes = () => {
  const groups = new Map()
  for (const node of nodes) {
    const key = mergeKeyForNode(node)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(node)
  }

  const replacementById = new Map()
  const removedIds = new Set()

  for (const [key, group] of groups.entries()) {
    if (group.length < 2) continue

    const expectedDuration = expectedDurationForMergeKey(key)
    const canonical = [...group].sort((a, b) => canonicalScore(b, key) - canonicalScore(a, key))[0]
    canonical.duree_mois = expectedDuration
    if (!canonical.secteur) canonical.secteur = 'Sante'

    for (const candidate of group) {
      if (candidate.id === canonical.id) continue

      if ((!canonical.description || canonical.description.startsWith('Donnee consolidee')) && candidate.description) {
        canonical.description = candidate.description
      }
      if (!canonical.ville && candidate.ville) canonical.ville = candidate.ville
      if (!canonical.nom_ar && candidate.nom_ar) canonical.nom_ar = candidate.nom_ar

      replacementById.set(candidate.id, canonical.id)
      removedIds.add(candidate.id)
      report.nodesMerged += 1
    }
  }

  if (!replacementById.size) return

  for (const edge of edges) {
    const sourceReplacement = replacementById.get(edge.source_id)
    const targetReplacement = replacementById.get(edge.target_id)
    if (sourceReplacement) {
      edge.source_id = sourceReplacement
      report.edgeReferencesUpdated += 1
    }
    if (targetReplacement) {
      edge.target_id = targetReplacement
      report.edgeReferencesUpdated += 1
    }
  }

  const compactedEdges = new Map()
  for (const edge of edges) {
    if (edge.source_id === edge.target_id) {
      report.edgesRemoved += 1
      continue
    }

    const key = `${edge.source_id}|${edge.target_id}|${edge.type_lien}`
    const existing = compactedEdges.get(key)
    if (!existing) {
      compactedEdges.set(key, edge)
      continue
    }

    existing.taux_reussite = Math.max(Number(existing.taux_reussite || 0), Number(edge.taux_reussite || 0)) || null
    existing.cout_supplementaire = Math.min(Number(existing.cout_supplementaire || 0), Number(edge.cout_supplementaire || 0))
    existing.duree_supplementaire_mois = Math.max(Number(existing.duree_supplementaire_mois || 0), Number(edge.duree_supplementaire_mois || 0))
    existing.moyenne_minimale = Math.max(Number(existing.moyenne_minimale || 0), Number(edge.moyenne_minimale || 0)) || existing.moyenne_minimale || edge.moyenne_minimale || null
    if (edge.type_acces === 'CONCOURS' || (!existing.type_acces && edge.type_acces)) existing.type_acces = edge.type_acces
    if ((edge.prerequis_notes || '').length > (existing.prerequis_notes || '').length) existing.prerequis_notes = edge.prerequis_notes
    report.duplicateEdgesMerged += 1
  }

  nodes.length = 0
  nodes.push(...Array.from(nodesByCode.values()).filter((node) => !removedIds.has(node.id)))

  edges.length = 0
  edges.push(...compactedEdges.values())

  nodesByCode.clear()
  nodesById.clear()
  edgeKeys.clear()
  nodes.forEach((node) => {
    nodesByCode.set(node.code, node)
    nodesById.set(node.id, node)
  })
  edges.forEach((edge) => edgeKeys.add(`${edge.source_id}|${edge.target_id}|${edge.type_lien}`))
}

mergeDuplicateNodes()

const schoolFamilyForMerge = (node) => {
  if (node.type !== 'ETABLISSEMENT') return null
  const text = normalize(`${node.code} ${node.nom_fr}`)

  if (/ENSIAS|ECOLE NATIONALE SUPERIEURE D INFORMATIQUE/.test(text)) return 'ENSIAS'
  if (/ENSEM|ECOLE NATIONALE SUPERIEURE D ELECTRICITE/.test(text)) return 'ENSEM'
  if (/ENCG|ECOLE NATIONALE DE COMMERCE/.test(text)) return 'ENCG'
  if (/ENSA|ECOLE NATIONALE DES SCIENCES APPLIQUEES/.test(text)) return 'ENSA'
  if (/ECOLE SUPERIEURE DE TECHNOLOGIE|\bEST\b/.test(text)) return 'EST'
  if (/FACULTE DE MEDECINE DENTAIRE|\bFMD\b|MEDECINE DENTAIRE/.test(text)) return 'FMD'
  if (/FACULTE DE MEDECINE ET DE PHARMACIE|\bFMP\b|\bFMPR\b/.test(text)) return 'FMP'

  return null
}

const schoolMergeKey = (node) => {
  const family = schoolFamilyForMerge(node)
  const city = cityFromNode(node)
  if (!family || !city) return null
  const privateMarker = /UM6SS|FM6MD|MOHAMMED VI|UIC|UPF|UNIVERSITE PRIVEE|ECOLE PRIVEE|INSTITUT PRIVE/.test(normalize(`${node.code} ${node.nom_fr} ${node.description || ''}`))
  return `ETABLISSEMENT:${family}:${city}:${privateMarker ? 'PRIVATE' : 'PUBLIC'}`
}

const canonicalSchoolScore = (node) => {
  const text = normalize(`${node.code} ${node.nom_fr}`)
  let score = 0
  if (!/^SCRAPE_/i.test(node.code || '')) score += 1000
  if (!/_\d+$/.test(node.code || '')) score += 100
  if (/ECOLE NATIONALE|FACULTE|INSTITUT NATIONAL/.test(text)) score += 60
  if (!/G_GESTION|8217|CENTRE_D_ORIENTATION/.test(text)) score += 40
  if (node.description && !String(node.description).startsWith('Donnee consolidee')) score += Math.min(node.description.length, 300) / 10
  score -= String(node.code || '').length / 10
  return score
}

const mergeDuplicateSchools = () => {
  const groups = new Map()
  for (const node of nodes) {
    const key = schoolMergeKey(node)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(node)
  }

  const replacementById = new Map()
  const removedIds = new Set()

  for (const group of groups.values()) {
    if (group.length < 2) continue

    const canonical = [...group].sort((a, b) => canonicalSchoolScore(b) - canonicalSchoolScore(a))[0]
    if (!canonical.secteur) canonical.secteur = 'Enseignement superieur'

    for (const candidate of group) {
      if (candidate.id === canonical.id) continue

      if ((!canonical.description || canonical.description.startsWith('Donnee consolidee')) && candidate.description) {
        canonical.description = candidate.description
      }
      if (!canonical.ville && candidate.ville) canonical.ville = candidate.ville
      if (!canonical.nom_ar && candidate.nom_ar) canonical.nom_ar = candidate.nom_ar

      replacementById.set(candidate.id, canonical.id)
      removedIds.add(candidate.id)
      report.schoolNodesMerged += 1
    }
  }

  if (!replacementById.size) return

  for (const edge of edges) {
    const sourceReplacement = replacementById.get(edge.source_id)
    const targetReplacement = replacementById.get(edge.target_id)
    if (sourceReplacement) {
      edge.source_id = sourceReplacement
      report.edgeReferencesUpdated += 1
    }
    if (targetReplacement) {
      edge.target_id = targetReplacement
      report.edgeReferencesUpdated += 1
    }
  }

  const compactedEdges = new Map()
  for (const edge of edges) {
    if (edge.source_id === edge.target_id) {
      report.edgesRemoved += 1
      continue
    }

    const key = `${edge.source_id}|${edge.target_id}|${edge.type_lien}`
    const existing = compactedEdges.get(key)
    if (!existing) {
      compactedEdges.set(key, edge)
      continue
    }

    existing.taux_reussite = Math.max(Number(existing.taux_reussite || 0), Number(edge.taux_reussite || 0)) || null
    existing.cout_supplementaire = Math.min(Number(existing.cout_supplementaire || 0), Number(edge.cout_supplementaire || 0))
    existing.duree_supplementaire_mois = Math.max(Number(existing.duree_supplementaire_mois || 0), Number(edge.duree_supplementaire_mois || 0))
    existing.moyenne_minimale = Math.max(Number(existing.moyenne_minimale || 0), Number(edge.moyenne_minimale || 0)) || existing.moyenne_minimale || edge.moyenne_minimale || null
    if (edge.type_acces === 'CONCOURS' || (!existing.type_acces && edge.type_acces)) existing.type_acces = edge.type_acces
    if ((edge.prerequis_notes || '').length > (existing.prerequis_notes || '').length) existing.prerequis_notes = edge.prerequis_notes
    report.duplicateEdgesMerged += 1
  }

  nodes.length = 0
  nodes.push(...Array.from(nodesByCode.values()).filter((node) => !removedIds.has(node.id)))

  edges.length = 0
  edges.push(...compactedEdges.values())

  nodesByCode.clear()
  nodesById.clear()
  edgeKeys.clear()
  nodes.forEach((node) => {
    nodesByCode.set(node.code, node)
    nodesById.set(node.id, node)
  })
  edges.forEach((edge) => edgeKeys.add(`${edge.source_id}|${edge.target_id}|${edge.type_lien}`))
}

mergeDuplicateSchools()

const normalizedJobLabel = (node) =>
  node.type === 'METIER'
    ? normalize(node.nom_fr || '')
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : null

const jobRecruitmentCount = (node) =>
  edges.filter((edge) => edge.type_lien === 'RECRUTEMENT' && edge.target_id === node.id).length

const canonicalJobScore = (node) => {
  let score = jobRecruitmentCount(node) * 100
  if (!/^SCRAPE_/i.test(node.code || '')) score += 1000
  if (!/_\d+$/.test(node.code || '')) score += 80
  if (node.secteur && !/Informatique/i.test(node.secteur)) score += 10
  score -= String(node.code || '').length / 20
  return score
}

const mergeDuplicateJobs = () => {
  const groups = new Map()
  for (const node of nodes) {
    const key = normalizedJobLabel(node)
    if (!key || key.length < 3) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(node)
  }

  const replacementById = new Map()
  const removedIds = new Set()

  for (const group of groups.values()) {
    if (group.length < 2) continue
    const canonical = [...group].sort((a, b) => canonicalJobScore(b) - canonicalJobScore(a))[0]

    for (const candidate of group) {
      if (candidate.id === canonical.id) continue
      if ((!canonical.description || canonical.description.length < 20) && candidate.description) canonical.description = candidate.description
      if (!canonical.secteur && candidate.secteur) canonical.secteur = candidate.secteur
      replacementById.set(candidate.id, canonical.id)
      removedIds.add(candidate.id)
      report.nodesMerged += 1
    }
  }

  if (!replacementById.size) return

  for (const edge of edges) {
    const sourceReplacement = replacementById.get(edge.source_id)
    const targetReplacement = replacementById.get(edge.target_id)
    if (sourceReplacement) {
      edge.source_id = sourceReplacement
      report.edgeReferencesUpdated += 1
    }
    if (targetReplacement) {
      edge.target_id = targetReplacement
      report.edgeReferencesUpdated += 1
    }
  }

  const compactedEdges = new Map()
  for (const edge of edges) {
    if (edge.source_id === edge.target_id) {
      report.edgesRemoved += 1
      continue
    }
    const key = `${edge.source_id}|${edge.target_id}|${edge.type_lien}`
    const existing = compactedEdges.get(key)
    if (!existing) {
      compactedEdges.set(key, edge)
      continue
    }
    existing.taux_reussite = Math.max(Number(existing.taux_reussite || 0), Number(edge.taux_reussite || 0)) || null
    existing.cout_supplementaire = Math.min(Number(existing.cout_supplementaire || 0), Number(edge.cout_supplementaire || 0))
    existing.duree_supplementaire_mois = Math.max(Number(existing.duree_supplementaire_mois || 0), Number(edge.duree_supplementaire_mois || 0))
    existing.moyenne_minimale = Math.max(Number(existing.moyenne_minimale || 0), Number(edge.moyenne_minimale || 0)) || existing.moyenne_minimale || edge.moyenne_minimale || null
    if (edge.type_acces === 'CONCOURS' || (!existing.type_acces && edge.type_acces)) existing.type_acces = edge.type_acces
    if ((edge.prerequis_notes || '').length > (existing.prerequis_notes || '').length) existing.prerequis_notes = edge.prerequis_notes
    report.duplicateEdgesMerged += 1
  }

  nodes.length = 0
  nodes.push(...Array.from(nodesByCode.values()).filter((node) => !removedIds.has(node.id)))

  edges.length = 0
  edges.push(...compactedEdges.values())

  nodesByCode.clear()
  nodesById.clear()
  edgeKeys.clear()
  nodes.forEach((node) => {
    nodesByCode.set(node.code, node)
    nodesById.set(node.id, node)
  })
  edges.forEach((edge) => edgeKeys.add(`${edge.source_id}|${edge.target_id}|${edge.type_lien}`))
}

mergeDuplicateJobs()

nodes.sort((a, b) => a.code.localeCompare(b.code))
edges.sort((a, b) => `${a.source_id}${a.target_id}${a.type_lien}`.localeCompare(`${b.source_id}${b.target_id}${b.type_lien}`))

await fs.writeFile(nodesPath, `${JSON.stringify(nodes, null, 2)}\n`, 'utf8')
await fs.writeFile(edgesPath, `${JSON.stringify(edges, null, 2)}\n`, 'utf8')

report.nodesAfter = nodes.length
report.edgesAfter = edges.length
console.log(JSON.stringify(report, null, 2))
