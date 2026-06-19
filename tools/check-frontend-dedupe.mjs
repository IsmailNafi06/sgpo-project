import { dedupePaths, getAcceptedBacs, getPathEtabStatus, getScore, sortPathsForDisplay } from '../frontend/src/utils/pathUtils.js'

const step = (code, nom_fr, type, ville = '', duree_mois = 0) => ({
  code,
  nom_fr,
  type,
  ville,
  duree_mois,
})

const architecte = step('METIER_ARCHITECTE', 'Architecte', 'METIER')
const enaCasablanca = step('ENA_CASABLANCA', 'Ecole Nationale d Architecture Casablanca', 'ETABLISSEMENT', 'Casablanca')

const variants = [
  {
    score: 81,
    steps: [
      step('TC', 'Tronc Commun', 'NIVEAU'),
      step('1BAC_TECH', '1ere Bac Technologique', 'FILIERE', '', 12),
      step('BAC_TECH_CIVIL', 'Bac Sciences et Technologies du Genie Civil', 'FILIERE', '', 12),
      enaCasablanca,
      step('DIP_ARCHITECTE_ENA_CASA', 'Diplome National Architecte', 'FILIERE', 'Casablanca', 72),
      architecte,
    ],
  },
  {
    score: 74,
    steps: [
      step('BAC_PC', 'Bac Sciences Physiques-Chimie', 'FILIERE', '', 12),
      step('ENA_CASA_ALT', "Ecole Nationale d'Architecture Casablanca", 'ETABLISSEMENT', 'Casablanca'),
      step('ARCHITECTE_ALT', 'Diplome Architecte', 'FILIERE', 'Casablanca', 72),
      architecte,
    ],
  },
  {
    score: 88,
    steps: [
      step('TC', 'Tronc Commun', 'NIVEAU'),
      step('1BAC_SE', '1ere Bac Sciences Experimentales', 'FILIERE', '', 12),
      step('BAC_PC', 'Bac Sciences Physiques-Chimie', 'FILIERE', '', 12),
      enaCasablanca,
      step('DIP_ARCHITECTE', 'Diplome Architecte', 'FILIERE', 'Casablanca', 72),
      architecte,
    ],
  },
]

const deduped = dedupePaths(variants)
const sortedScores = sortPathsForDisplay([
  { score: 30, steps: [enaCasablanca, architecte] },
  { score: 89, steps: [enaCasablanca, architecte] },
  { score: 40, steps: [enaCasablanca, architecte] },
]).map(getScore)

const summary = {
  variantsBefore: variants.length,
  cardsAfterDedupe: deduped.length,
  keptScore: getScore(deduped[0]),
  acceptedBacs: getAcceptedBacs(deduped[0]).map((bac) => bac.label),
  sortedScores,
}

const dentiste = step('METIER_DENTISTE', 'Dentiste', 'METIER')
const pharmacie = step('METIER_PHARMACIEN', 'Pharmacien', 'METIER')

const healthDuplicates = dedupePaths([
  {
    score: 88,
    steps: [
      step('BAC_PC', 'Bac Sciences Physiques-Chimie', 'FILIERE', '', 12),
      step('FMD_RABAT', 'FMD Rabat', 'ETABLISSEMENT', 'Rabat'),
      step('DENT_RABAT', 'Doctorat en Medecine dentaire', 'FILIERE', 'Rabat', 72),
      dentiste,
    ],
  },
  {
    score: 74,
    steps: [
      step('BAC_PC_ALT', 'Bac Sciences Physiques-Chimie', 'FILIERE', '', 12),
      step('FMD_RABAT_FULL', 'Faculte de Medecine Dentaire Rabat', 'ETABLISSEMENT', 'Rabat'),
      step('DENT_RABAT_ALT', 'Diplome de Docteur en Medecine Dentaire', 'FILIERE', 'Rabat', 72),
      dentiste,
    ],
  },
  {
    score: 90,
    steps: [
      step('BAC_SVT', 'Bac Sciences de la Vie et de la Terre', 'FILIERE', '', 12),
      step('FMP_RABAT', 'FMP Rabat', 'ETABLISSEMENT', 'Rabat'),
      step('PHARM_RABAT', 'Doctorat en Pharmacie', 'FILIERE', 'Rabat', 72),
      pharmacie,
    ],
  },
  {
    score: 87,
    steps: [
      step('BAC_SVT_ALT', 'Bac Sciences de la Vie et de la Terre', 'FILIERE', '', 12),
      step('FMP_RABAT_FULL', 'Faculte de Medecine et de Pharmacie de Rabat', 'ETABLISSEMENT', 'Rabat'),
      step('PHARM_RABAT_ALT', 'Doctorat en Pharmacie', 'FILIERE', 'Rabat', 72),
      pharmacie,
    ],
  },
  {
    score: 38,
    steps: [
      step('BAC_SM', 'Bac Sciences Mathematiques', 'FILIERE', '', 12),
      step('FM6P_RABAT', 'FM6P Rabat', 'ETABLISSEMENT', 'Rabat'),
      step('PHARM_PRIV_RABAT', 'Doctorat en Pharmacie', 'FILIERE', 'Rabat', 72),
      pharmacie,
    ],
  },
  {
    score: 35,
    steps: [
      step('BAC_SM_ALT', 'Bac Sciences Mathematiques', 'FILIERE', '', 12),
      step('FM6P_RABAT_FULL', 'Faculte Mohammed VI de Pharmacie Rabat - UM6SS', 'ETABLISSEMENT', 'Rabat'),
      step('PHARM_PRIV_RABAT_ALT', 'Doctorat en Pharmacie', 'FILIERE', 'Rabat', 72),
      pharmacie,
    ],
  },
])

summary.healthCardsAfterDedupe = healthDuplicates.length
summary.healthScores = healthDuplicates.map(getScore)

const informatique = step('METIER_ING_INFO', 'Ingenieur genie informatique', 'METIER')
const ensemDuplicates = dedupePaths([
  {
    score: 97,
    steps: [
      step('TC', 'Tronc Commun', 'NIVEAU', '', 12),
      step('1BAC_SE', '1ere Bac Sciences Experimentales', 'FILIERE', '', 12),
      step('BAC_PC', 'Bac Sciences Physiques-Chimie', 'FILIERE', '', 12),
      step('ECOLE_NATIONALE_SUPERIEURE_ELECTRICITE_MECANIQUE_CASABLANCA', "Ecole Nationale Superieure d'Electricite et de Mecanique Casablanca", 'ETABLISSEMENT', 'Casablanca'),
      step('CYCLE_INFO_ENSEM', 'Cycle Ingenieur Informatique et Systemes - ENSEM Casablanca', 'FILIERE', 'Casablanca', 60),
      informatique,
    ],
  },
  {
    score: 88,
    steps: [
      step('TC_ALT', 'Tronc Commun', 'NIVEAU', '', 12),
      step('1BAC_ST', '1ere Bac Sciences et Technologies', 'FILIERE', '', 12),
      step('BAC_TECH_ELEC', 'Bac Sciences et Technologies Electriques', 'FILIERE', '', 12),
      step('SCRAPE_9RAYTI_ECOLE_ENSEM_CASABLANCA', 'ENSEM Casablanca', 'ETABLISSEMENT', 'Casablanca'),
      step('ING_INFO_ENSEM', 'Ingenieur en Genie informatique - ENSEM Casablanca', 'FILIERE', 'Casablanca', 60),
      informatique,
    ],
  },
  {
    score: 81,
    steps: [
      step('TC_ALT_2', 'Tronc Commun', 'NIVEAU', '', 12),
      step('1BAC_ST_ALT', '1ere Bac Sciences et Technologies', 'FILIERE', '', 12),
      step('BAC_TECH_ELEC_ALT', 'Bac Sciences et Technologies Electriques', 'FILIERE', '', 12),
      step('ENSEM_CASA_SHORT', 'ENSEM Casablanca', 'ETABLISSEMENT', 'Casablanca'),
      step('ING_RESEAUX_ENSEM', 'Ingenieur en Genie Reseaux et Telecommunications - ENSEM Casablanca', 'FILIERE', 'Casablanca', 60),
      informatique,
    ],
  },
])

const ensiasDuplicates = dedupePaths([
  {
    score: 100,
    steps: [
      step('TC_ENSIAS', 'Tronc Commun', 'NIVEAU', '', 12),
      step('1BAC_SE_ENSIAS', '1ere Bac Sciences Experimentales', 'FILIERE', '', 12),
      step('BAC_PC', 'Bac Sciences Physiques-Chimie', 'FILIERE', '', 12),
      step('ENSIAS_RABAT_SHORT', 'ENSIAS Rabat', 'ETABLISSEMENT', 'Rabat'),
      step('CYCLE_INFO_ENSIAS', 'Cycle Ingenieur Genie Informatique', 'FILIERE', 'Rabat', 60),
      informatique,
    ],
  },
  {
    score: 81,
    steps: [
      step('TC_ENSIAS_ALT', 'Tronc Commun', 'NIVEAU', '', 12),
      step('1BAC_ST_ENSIAS', '1ere Bac Sciences et Technologies', 'FILIERE', '', 12),
      step('BAC_TECH_ELEC', 'Bac Sciences et Technologies Electriques', 'FILIERE', '', 12),
      step(
        'ECOLE_NATIONALE_SUPERIEURE_INFORMATIQUE_ANALYSE_SYSTEMES_RABAT',
        "Ecole Nationale Superieure d'Informatique et d'Analyse des Systemes Rabat",
        'ETABLISSEMENT',
        'Rabat',
      ),
      step('ING_INFO_ENSIAS', 'Ingenieur Genie Informatique - ENSIAS Rabat', 'FILIERE', 'Rabat', 60),
      informatique,
    ],
  },
])

const privatePolytechnicPath = {
  score: 80,
  steps: [
    step('BAC_SM', 'Bac Sciences Mathematiques', 'FILIERE', '', 12),
    step('SCRAPE_9RAYTI_ECOLE_INSTITUT_POLYTECHNIQUE_PRIVE_DE_CASABLANCA', 'Institut Polytechnique Prive de Casablanca', 'ETABLISSEMENT', 'Casablanca'),
    step('IPPC_INFO', 'Ingenieur en genie informatique - Institut Polytechnique Prive de Casablanca', 'FILIERE', 'Casablanca', 60),
    informatique,
  ],
}

summary.ensemCardsAfterDedupe = ensemDuplicates.length
summary.ensemScore = getScore(ensemDuplicates[0])
summary.ensiasCardsAfterDedupe = ensiasDuplicates.length
summary.ensiasScore = getScore(ensiasDuplicates[0])
summary.privatePolytechnicStatus = getPathEtabStatus(privatePolytechnicPath)

console.log(JSON.stringify(summary, null, 2))

if (summary.cardsAfterDedupe !== 1) {
  throw new Error('La deduplication frontend n a pas fusionne les variantes de bac.')
}

if (!summary.acceptedBacs.includes('Bac Sciences Physiques-Chimie') || !summary.acceptedBacs.includes('Bac Genie Civil')) {
  throw new Error('Les bacs acceptes n ont pas ete conserves apres fusion.')
}

if (summary.keptScore < 88) {
  throw new Error('La carte fusionnee ne conserve pas le meilleur score.')
}

if (summary.sortedScores[0] < summary.sortedScores[1]) {
  throw new Error('Le tri frontend ne place pas le meilleur score en premier.')
}

if (summary.healthCardsAfterDedupe !== 3) {
  throw new Error('La deduplication sante doit fusionner FMD/FMP/FM6P sans melanger public et prive.')
}

if (summary.healthScores.some((score) => typeof score !== 'number') || Math.max(...summary.healthScores) < 90) {
  throw new Error('La deduplication sante ne conserve pas un score exploitable.')
}

if (summary.ensemCardsAfterDedupe !== 1 || summary.ensemScore < 97) {
  throw new Error('La deduplication ENSEM doit fusionner le sigle et le nom complet en conservant le meilleur score.')
}

if (summary.ensiasCardsAfterDedupe !== 1 || summary.ensiasScore < 100) {
  throw new Error('La deduplication ENSIAS doit fusionner le sigle et le nom complet en conservant le meilleur score.')
}

if (summary.privatePolytechnicStatus !== 'PRIVE') {
  throw new Error('Un etablissement contenant Prive doit etre classe PRIVE.')
}
