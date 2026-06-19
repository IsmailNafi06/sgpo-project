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

const privatePattern =
  /\b(UM6SS|UM6P|MUNDIAPOLIS|ISGA|IGA|EMSI|HEM|SUP'?RH|VATEL|ADALIA|MATCI|OSTELEA|ISIAM|ESCA|HECI|UIR|UPM|UNIVERSITE INTERNATIONALE DE RABAT|UNIVERSITE PRIVEE|ECOLE PRIVEE|INSTITUT PRIVE|ECOLE MOHAMMED VI DE MEDECINE VETERINAIRE|EM6MV|EGE|ECOLE DE GUERRE ECONOMIQUE|ABULCASIS|FPMM|ESGB|IHE PARIS|SUPMTI|HESTIM|ISFORT|UIC|GROUPE IGS)\b/

const isPrivate = (node) => privatePattern.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''} ${node?.description || ''}`))
const isGeneralDoctor = (node) => /\bMEDECIN_GENERALISTE\b|MEDECIN GENERALISTE/.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''}`))
const isDentist = (node) => /\b(DENTISTE|CHIRURGIEN DENTISTE|MEDECIN DENTISTE)\b/.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''}`).replace(/_/g, ' '))
const isPharmacist = (node) => /\b(PHARMACIEN|PHARMACIEN INDUSTRIEL)\b/.test(normalize(`${node?.code || ''} ${node?.nom_fr || ''}`).replace(/_/g, ' '))
const programNameOnly = (node) => String(node?.nom_fr || '').split(/\s+-\s+/)[0] || String(node?.nom_fr || '')
const isGeneralMedicine = (node) => {
  const text = normalize(`${programNameOnly(node)} ${node?.secteur || ''}`)
  return (
    /DOCTORAT MEDECINE|DOCTORAT EN MEDECINE|DOCTEUR EN MEDECINE|DIPLOME DE DOCTEUR EN MEDECINE|DIPLOME D ETAT DE DOCTEUR EN MEDECINE/.test(text) &&
    !/VETERINAIRE|DENTAIRE|PHARMACIE|BIOTECH|LICENCE|MASTER|INFIRMIER|KINESITHERAPIE|ORTHOPHONIE|SAGE FEMME/.test(text)
  )
}
const isDental = (node) => {
  const text = normalize(`${node?.code || ''} ${programNameOnly(node)} ${node?.secteur || ''}`).replace(/_/g, ' ')
  return /MEDECINE DENTAIRE|DOCTEUR EN MEDECINE DENTAIRE|CHIRURGIE DENTAIRE/.test(text) && !/PROTHESE|ASSISTANT|HYGIENE/.test(text)
}
const isPharmacy = (node) => {
  const text = normalize(`${node?.code || ''} ${programNameOnly(node)} ${node?.secteur || ''}`).replace(/_/g, ' ')
  return /(DOCTORAT|DOCTEUR|DIPLOME).{0,30}PHARMACIE|PHARMACIEN/.test(text) && !/PREPARATEUR|ASSISTANT/.test(text)
}

const privateProgramZeroCost = nodes
  .filter((node) => node.type === 'FILIERE' && isPrivate(node) && Number(node.cout_estime || 0) <= 0)
  .map((node) => ({ code: node.code, nom: node.nom_fr }))

const privateOfferedZeroCost = []
const badGeneralDoctorEdges = []
const badDentistEdges = []
const badPharmacistEdges = []
for (const edge of edges) {
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  if (!source || !target) continue

  if (edge.type_lien === 'OFFERTE_PAR' && source.type === 'FILIERE' && target.type === 'ETABLISSEMENT' && isPrivate(target) && Number(source.cout_estime || 0) <= 0) {
    privateOfferedZeroCost.push({ formation: source.code, formationName: source.nom_fr, school: target.nom_fr })
  }

  if (edge.type_lien === 'RECRUTEMENT' && source.type === 'FILIERE' && target.type === 'METIER' && isGeneralDoctor(target) && !isGeneralMedicine(source)) {
    badGeneralDoctorEdges.push({ formation: source.code, formationName: source.nom_fr, job: target.nom_fr })
  }

  if (edge.type_lien === 'RECRUTEMENT' && source.type === 'FILIERE' && target.type === 'METIER' && isDentist(target) && !isDental(source)) {
    badDentistEdges.push({ formation: source.code, formationName: source.nom_fr, job: target.nom_fr })
  }

  if (edge.type_lien === 'RECRUTEMENT' && source.type === 'FILIERE' && target.type === 'METIER' && isPharmacist(target) && !isPharmacy(source)) {
    badPharmacistEdges.push({ formation: source.code, formationName: source.nom_fr, job: target.nom_fr })
  }
}

console.log(
  JSON.stringify(
    {
      privateProgramZeroCost: privateProgramZeroCost.length,
      privateOfferedZeroCost: privateOfferedZeroCost.length,
      badGeneralDoctorEdges: badGeneralDoctorEdges.length,
      badDentistEdges: badDentistEdges.length,
      badPharmacistEdges: badPharmacistEdges.length,
      samples: {
        privateProgramZeroCost: privateProgramZeroCost.slice(0, 10),
        privateOfferedZeroCost: privateOfferedZeroCost.slice(0, 10),
        badGeneralDoctorEdges: badGeneralDoctorEdges.slice(0, 10),
        badDentistEdges: badDentistEdges.slice(0, 10),
        badPharmacistEdges: badPharmacistEdges.slice(0, 10),
      },
    },
    null,
    2,
  ),
)
