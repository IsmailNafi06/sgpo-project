export const fallbackMetiers = [
  { code: 'COMPTABLE', label: 'Comptable' },
  { code: 'ASSISTANT_COMPTABLE', label: 'Assistant comptable' },
  { code: 'EXPERT_COMPTABLE', label: 'Expert comptable' },
  { code: 'COMPTABLE_FOURNISSEUR', label: 'Comptable fournisseur' },
  { code: 'MEDECIN_GENERALISTE', label: 'Medecin generaliste' },
  { code: 'INGENIEUR_GENIE_INFORMATIQUE', label: 'Ingenieur informatique' },
  { code: 'DEVELOPPEUR_FULL_STACK', label: 'Developpeur full stack' },
  { code: 'DATA_ENGINEER', label: 'Data engineer', aliases: ['ingenieur data', 'big data'] },
  { code: 'DATA_SCIENTIST', label: 'Data scientist', aliases: ['data science', 'scientifique des donnees'] },
  { code: 'DATA_ANALYST_SUPPLY_CHAIN', label: 'Data analyst', aliases: ['analyste data', 'data analyse', 'business intelligence'] },
  { code: 'INGENIEUR_CYBERSECURITE', label: 'Ingenieur cybersecurite', aliases: ['cyber', 'cybersecurite', 'securite informatique'] },
  { code: 'PILOTE_DE_LIGNE', label: 'Pilote de ligne', aliases: ['pilote', 'aviation'] },
  { code: 'ARCHITECTE', label: 'Architecte' },
  { code: 'ENSEIGNANT', label: 'Enseignant' },
  { code: 'TECHNICIEN_SPECIALISE_RESEAUX', label: 'Technicien specialise en reseaux' },
  { code: 'DESIGNER', label: 'Designer' },
  { code: 'INFIRMIER_POLYVALENT', label: 'Infirmier polyvalent' },
  { code: 'AVOCAT', label: 'Avocat' },
  { code: 'PHARMACIEN', label: 'Pharmacien' },
  { code: 'JOURNALISTE', label: 'Journaliste' },
  { code: 'CONTROLEUR_DE_GESTION', label: 'Controleur de gestion' },
]

export const samplePaths = [
  {
    id: 'demo-1',
    score: 92,
    interpretationIa:
      "Ce parcours est coherent avec votre objectif. Il privilegie une progression scientifique solide, puis une specialisation professionnalisante.",
    relatedJobs: ['Developpeur full stack', 'Data engineer', 'Chef de projet digital'],
    etapes: [
      { type: 'NIVEAU', nom: 'Bac Sciences Physiques', duree: 12, ville: 'Rabat', typeAcces: 'Selection', moyenneMinimale: 14, tauxReussite: 86 },
      { type: 'FILIERE', nom: 'Classes preparatoires MPSI', duree: 24, ville: 'Rabat', typeAcces: 'Concours', moyenneMinimale: 15, tauxReussite: 74 },
      { type: 'ETABLISSEMENT', nom: 'ENSIAS', duree: 36, ville: 'Rabat', typeAcces: 'CNC', moyenneMinimale: 13, tauxReussite: 81 },
      { type: 'METIER', nom: 'Ingenieur informatique', duree: 0, ville: 'Maroc', typeAcces: 'Diplome', moyenneMinimale: null, tauxReussite: 88 },
    ],
    dureeTotale: 72,
    coutTotal: 18000,
  },
  {
    id: 'demo-2',
    score: 84,
    interpretationIa:
      "Ce parcours est plus court et adapte si vous cherchez une insertion rapide. Il combine une formation appliquee et des certifications.",
    relatedJobs: ['Administrateur systemes', 'Technicien support', 'Consultant cloud junior'],
    etapes: [
      { type: 'NIVEAU', nom: 'Bac Sciences Mathematiques', duree: 12, ville: 'Casablanca', typeAcces: 'Ouvert', moyenneMinimale: 12, tauxReussite: 79 },
      { type: 'FILIERE', nom: 'DUT Genie informatique', duree: 24, ville: 'Casablanca', typeAcces: 'Selection', moyenneMinimale: 13, tauxReussite: 82 },
      { type: 'ETABLISSEMENT', nom: 'EST Casablanca', duree: 24, ville: 'Casablanca', typeAcces: 'Dossier', moyenneMinimale: 13, tauxReussite: 80 },
      { type: 'METIER', nom: 'Technicien specialise en reseaux', duree: 0, ville: 'Casablanca', typeAcces: 'Diplome', moyenneMinimale: null, tauxReussite: 84 },
    ],
    dureeTotale: 60,
    coutTotal: 9500,
  },
]
