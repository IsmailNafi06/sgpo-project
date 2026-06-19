import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'backend', 'src', 'main', 'resources', 'data')
const nodes = JSON.parse((await fs.readFile(path.join(dataDir, 'nodes_all.json'), 'utf8')).replace(/^\uFEFF/, ''))
const edges = JSON.parse((await fs.readFile(path.join(dataDir, 'edges.json'), 'utf8')).replace(/^\uFEFF/, ''))

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()

const compact = (value = '') => normalize(value).replace(/\s+/g, '')
const compactLoose = (value = '') =>
  normalize(value)
    .split(/\s+/)
    .filter((word) => !['DE', 'DES', 'DU', 'ET', 'LA', 'LE', 'L', 'D', 'UNIVERSITE', 'ECOLE'].includes(word))
    .join('')

const schools = nodes.filter((node) => node.type === 'ETABLISSEMENT')
const programs = nodes.filter((node) => node.type === 'FILIERE')
const byId = new Map(nodes.map((node) => [node.id, node]))

const offeredBySchool = new Map()
for (const edge of edges) {
  if (edge.type_lien !== 'OFFERTE_PAR') continue
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  if (source?.type !== 'FILIERE' || target?.type !== 'ETABLISSEMENT') continue
  const list = offeredBySchool.get(target.id) || []
  list.push(source)
  offeredBySchool.set(target.id, list)
}

const expectedGroups = [
  {
    group: 'Medecine pharmacie dentaire',
    minPrograms: 1,
    entries: [
      ['Faculte de Medecine et de Pharmacie Casablanca', ['FACULTE MEDECINE PHARMACIE CASABLANCA', 'FMP CASABLANCA']],
      ['Faculte de Medecine et de Pharmacie Rabat', ['FACULTE MEDECINE PHARMACIE RABAT', 'FMP RABAT']],
      ['Faculte de Medecine et de Pharmacie Fes', ['FACULTE MEDECINE PHARMACIE FES', 'FMP FES']],
      ['Faculte de Medecine et de Pharmacie Marrakech', ['FACULTE MEDECINE PHARMACIE MARRAKECH', 'FMP MARRAKECH']],
      ['Faculte de Medecine et de Pharmacie Oujda', ['FACULTE MEDECINE PHARMACIE OUJDA', 'FMP OUJDA']],
      ['Faculte de Medecine et de Pharmacie Tanger', ['FACULTE MEDECINE PHARMACIE TANGER', 'FMP TANGER']],
      ['Faculte de Medecine et de Pharmacie Agadir', ['FACULTE MEDECINE PHARMACIE AGADIR', 'FMP AGADIR']],
      ['Faculte de Medecine et de Pharmacie Laayoune', ['FACULTE MEDECINE PHARMACIE LAAYOUNE', 'FMP LAAYOUNE']],
      ['Faculte de Medecine Dentaire Rabat', ['FACULTE MEDECINE DENTAIRE RABAT', 'FMD RABAT']],
      ['Faculte de Medecine Dentaire Casablanca', ['FACULTE MEDECINE DENTAIRE CASABLANCA', 'FMD CASABLANCA']],
      ['Faculte de Medecine Dentaire Fes', ['FACULTE MEDECINE DENTAIRE FES', 'FMD FES']],
    ],
  },
  {
    group: 'ENCG',
    minPrograms: 3,
    entries: ['Agadir', 'Beni Mellal', 'Casablanca', 'Dakhla', 'El Jadida', 'Fes', 'Kenitra', 'Marrakech', 'Oujda', 'Settat', 'Tanger'].map((city) => [
      `ENCG ${city}`,
      [`ENCG ${city}`, `ECOLE NATIONALE COMMERCE GESTION ${city}`, `ECOLE NATIONALE DE COMMERCE ET DE GESTION ${city}`],
    ]),
  },
  {
    group: 'ENSA',
    minPrograms: 2,
    entries: ['Agadir', 'Al Hoceima', 'Beni Mellal', 'Berrechid', 'El Jadida', 'Fes', 'Kenitra', 'Khouribga', 'Marrakech', 'Oujda', 'Safi', 'Tanger', 'Tetouan'].map((city) => [
      `ENSA ${city}`,
      [`ENSA ${city}`, `ECOLE NATIONALE SCIENCES APPLIQUEES ${city}`, `ECOLE NATIONALE DES SCIENCES APPLIQUEES ${city}`],
    ]),
  },
  {
    group: 'FST',
    minPrograms: 2,
    entries: ['Beni Mellal', 'Errachidia', 'Fes', 'Marrakech', 'Mohammedia', 'Settat', 'Tanger'].map((city) => [
      `FST ${city}`,
      [`FST ${city}`, `FACULTE SCIENCES TECHNIQUES ${city}`, `FACULTE DES SCIENCES ET TECHNIQUES ${city}`],
    ]),
  },
  {
    group: 'EST',
    minPrograms: 2,
    entries: ['Agadir', 'Beni Mellal', 'Casablanca', 'Essaouira', 'Fes', 'Guelmim', 'Kenitra', 'Khenifra', 'Laayoune', 'Meknes', 'Oujda', 'Safi', 'Sale', 'Sidi Bennour'].map((city) => [
      `EST ${city}`,
      [`EST ${city}`, `ECOLE SUPERIEURE TECHNOLOGIE ${city}`, `ECOLE SUPERIEURE DE TECHNOLOGIE ${city}`],
    ]),
  },
  {
    group: 'Grandes ecoles publiques specialisees',
    minPrograms: 1,
    entries: [
      ['ENSIAS Rabat', ['ENSIAS RABAT', 'ECOLE NATIONALE SUPERIEURE INFORMATIQUE ANALYSE SYSTEMES RABAT']],
      ['EMI Rabat', ['EMI RABAT', 'ECOLE MOHAMMADIA INGENIEURS RABAT']],
      ['EHTP Casablanca', ['EHTP CASABLANCA', 'ECOLE HASSANIA TRAVAUX PUBLICS CASABLANCA']],
      ['INPT Rabat', ['INPT RABAT', 'INSTITUT NATIONAL POSTES TELECOMMUNICATIONS RABAT']],
      ['INSEA Rabat', ['INSEA RABAT', 'INSTITUT NATIONAL STATISTIQUE ECONOMIE APPLIQUEE RABAT']],
      ['IAV Hassan II Rabat', ['IAV HASSAN II RABAT', 'INSTITUT AGRONOMIQUE VETERINAIRE HASSAN II RABAT']],
      ['ENA Rabat', ['ENA RABAT', 'ECOLE NATIONALE ARCHITECTURE RABAT']],
      ['ISCAE Casablanca', ['ISCAE CASABLANCA', 'INSTITUT SUPERIEUR COMMERCE ADMINISTRATION ENTREPRISES CASABLANCA']],
      ['ISCAE Rabat', ['ISCAE RABAT', 'INSTITUT SUPERIEUR COMMERCE ADMINISTRATION ENTREPRISES RABAT']],
      ['ENSAM Casablanca', ['ENSAM CASABLANCA', 'ECOLE NATIONALE SUPERIEURE ARTS METIERS CASABLANCA']],
      ['ENSAM Meknes', ['ENSAM MEKNES', 'ECOLE NATIONALE SUPERIEURE ARTS METIERS MEKNES']],
    ],
  },
  {
    group: 'Prive reconnu ou populaire',
    minPrograms: 1,
    entries: [
      ['UIR Rabat', ['UNIVERSITE INTERNATIONALE RABAT', 'UIR RABAT']],
      ['UM6P Benguerir', ['UNIVERSITE MOHAMMED VI POLYTECHNIQUE', 'UM6P']],
      ['UM6SS Casablanca', ['UNIVERSITE MOHAMMED VI SCIENCES SANTE', 'UM6SS']],
      ['UIC Casablanca', ['UNIVERSITE INTERNATIONALE CASABLANCA', 'UIC CASABLANCA']],
      ['Mundiapolis Casablanca', ['MUNDIAPOLIS CASABLANCA']],
      ['EMSI Casablanca', ['EMSI CASABLANCA', 'ECOLE MAROCAINE SCIENCES INGENIEUR CASABLANCA']],
      ['HEM Casablanca', ['HEM CASABLANCA', 'HAUTES ETUDES MANAGEMENT CASABLANCA']],
      ['ESCA Casablanca', ['ESCA CASABLANCA', 'ECOLE DE MANAGEMENT ESCA CASABLANCA']],
      ['ISGA Casablanca', ['ISGA CASABLANCA']],
      ['IGA Casablanca', ['IGA CASABLANCA']],
    ],
  },
]

const findSchool = (aliases) => {
  const compactAliases = aliases.map(compact)
  const looseAliases = aliases.map(compactLoose)
  const matches = schools.filter((school) => {
    const text = compact(`${school.code || ''} ${school.nom_fr || ''} ${school.ville || ''}`)
    const looseText = compactLoose(`${school.code || ''} ${school.nom_fr || ''} ${school.ville || ''}`)
    return (
      compactAliases.some((alias) => text.includes(alias) || alias.includes(text)) ||
      looseAliases.some((alias) => looseText.includes(alias) || alias.includes(looseText))
    )
  })
  return matches.sort((a, b) => (offeredBySchool.get(b.id)?.length || 0) - (offeredBySchool.get(a.id)?.length || 0))[0]
}

const groupReports = expectedGroups.map(({ group, minPrograms, entries }) => {
  const rows = entries.map(([label, aliases]) => {
    const school = findSchool(aliases)
    const offered = school ? offeredBySchool.get(school.id) || [] : []
    return {
      label,
      found: Boolean(school),
      code: school?.code || null,
      name: school?.nom_fr || null,
      city: school?.ville || null,
      programs: offered.length,
      hasEnoughPrograms: offered.length >= minPrograms,
    }
  })

  return {
    group,
    expected: entries.length,
    found: rows.filter((row) => row.found).length,
    withEnoughPrograms: rows.filter((row) => row.hasEnoughPrograms).length,
    missing: rows.filter((row) => !row.found),
    lowProgramCoverage: rows.filter((row) => row.found && !row.hasEnoughPrograms),
  }
})

const suspiciousOfferEdges = []
for (const edge of edges) {
  if (edge.type_lien !== 'OFFERTE_PAR') continue
  const program = byId.get(edge.source_id)
  const school = byId.get(edge.target_id)
  if (!program || !school) continue
  const programText = normalize(`${program.code || ''} ${program.nom_fr || ''} ${program.secteur || ''}`)
  const schoolText = normalize(`${school.code || ''} ${school.nom_fr || ''} ${school.ville || ''}`)
  if (/DUT|BTS/.test(programText) && /ENCG|ENSA|ENSAM|ENSIAS|EMI|EHTP|INPT|INSEA/.test(schoolText)) {
    suspiciousOfferEdges.push({ program: program.nom_fr, school: school.nom_fr })
  }
  if (/MASTER|DOCTORAT/.test(programText) && /EST /.test(schoolText)) {
    suspiciousOfferEdges.push({ program: program.nom_fr, school: school.nom_fr })
  }
}

console.log(
  JSON.stringify(
    {
      schools: schools.length,
      programs: programs.length,
      groups: groupReports,
      suspiciousOfferEdges: suspiciousOfferEdges.length,
      suspiciousSamples: suspiciousOfferEdges.slice(0, 20),
    },
    null,
    2,
  ),
)
