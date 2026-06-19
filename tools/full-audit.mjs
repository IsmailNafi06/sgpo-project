// Corrected audit using source_id/target_id (UUIDs)
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'backend', 'src', 'main', 'resources', 'data');
const nodes = JSON.parse(readFileSync(join(dataDir, 'nodes_all.json'), 'utf8'));
const edges = JSON.parse(readFileSync(join(dataDir, 'edges.json'), 'utf8'));

const byId = new Map(nodes.map(n => [n.id, n]));
const byCode = new Map(nodes.map(n => [n.code, n]));
const byType = (type) => nodes.filter(n => n.type === type);

// Build edge indices using IDs
const edgesFromId = new Map();
const edgesToId = new Map();
edges.forEach(e => {
  const src = e.source_id || e.sourceId;
  const tgt = e.target_id || e.targetId;
  if (!edgesFromId.has(src)) edgesFromId.set(src, []);
  edgesFromId.get(src).push(e);
  if (!edgesToId.has(tgt)) edgesToId.set(tgt, []);
  edgesToId.get(tgt).push(e);
});

const typeLien = e => e.type_lien || e.typeLien || '';
const srcId = e => e.source_id || e.sourceId;
const tgtId = e => e.target_id || e.targetId;

console.log('=== AUDIT COMPLET (UUID-based) ===');
console.log(`Noeuds: ${nodes.length} | Aretes: ${edges.length}`);
console.log(`Metiers: ${byType('METIER').length} | Filieres: ${byType('FILIERE').length} | Etablissements: ${byType('ETABLISSEMENT').length}`);

// 1. Orphan edges
const orphanEdges = edges.filter(e => !byId.has(srcId(e)) || !byId.has(tgtId(e)));
console.log(`\nAretes orphelines (source/target inexistant): ${orphanEdges.length}`);

// 2. Métiers sans RECRUTEMENT
const metiersNoRecruitment = byType('METIER').filter(m => {
  const incoming = edgesToId.get(m.id) || [];
  return !incoming.some(e => typeLien(e) === 'RECRUTEMENT');
});
console.log(`Metiers sans RECRUTEMENT: ${metiersNoRecruitment.length} / ${byType('METIER').length}`);

// 3. Métiers complètement orphelins (0 arêtes)
const metiersOrphan = byType('METIER').filter(m => {
  return !(edgesToId.get(m.id) || []).length && !(edgesFromId.get(m.id) || []).length;
});
console.log(`Metiers orphelins (0 aretes): ${metiersOrphan.length}`);

// 4. Filières sans école
const filieresNoSchool = byType('FILIERE').filter(f => {
  const code = f.code.toUpperCase();
  if (code.startsWith('BAC_') || code.startsWith('1BAC') || code === 'TC' || code === '3AC') return false;
  const outgoing = edgesFromId.get(f.id) || [];
  const incoming = edgesToId.get(f.id) || [];
  const all = [...outgoing, ...incoming];
  return !all.some(e => {
    const otherId = srcId(e) === f.id ? tgtId(e) : srcId(e);
    const other = byId.get(otherId);
    return other && other.type === 'ETABLISSEMENT';
  });
});
console.log(`Filieres sans ecole rattachee: ${filieresNoSchool.length}`);

// 5. Filières orphelines
const filieresOrphan = byType('FILIERE').filter(f => {
  return !(edgesToId.get(f.id) || []).length && !(edgesFromId.get(f.id) || []).length;
});
console.log(`Filieres orphelines (0 aretes): ${filieresOrphan.length}`);

// 6. Key métiers status
const keyMetiers = [
  'EXPERT_COMPTABLE', 'AVOCAT', 'MEDECIN_GENERALISTE', 'PHARMACIEN',
  'CHIRURGIEN_DENTISTE', 'INGENIEUR_GENIE_INFORMATIQUE', 'DATA_SCIENTIST',
  'DEVELOPPEUR_FULL_STACK', 'ARCHITECTE', 'ENSEIGNANT', 'PILOTE_DE_LIGNE',
  'CONTROLEUR_DE_GESTION', 'AUDITEUR_FINANCIER', 'JOURNALISTE',
  'INGENIEUR_CYBERSECURITE', 'INGENIEUR_AGRONOME', 'INFIRMIER_POLYVALENT',
  'COMPTABLE', 'DATA_ENGINEER', 'ARCHITECTE_CLOUD', 'ANALYSTE_SOC',
  'DESIGNER', 'NOTAIRE', 'MAGISTRAT', 'VETERINAIRE', 'KINESITHERAPEUTE',
  'SAGE_FEMME', 'RESPONSABLE_MARKETING_DIGITAL', 'DEEP_LEARNING_ENGINEER',
  'ANALYSTE_FINANCIER', 'PHARMACIEN_INDUSTRIEL',
];

console.log('\n=== METIERS CLES ===');
const metiersStatus = [];
keyMetiers.forEach(code => {
  const node = byCode.get(code);
  if (!node) { console.log(`✗ ${code}: MISSING`); metiersStatus.push({ code, status: 'MISSING' }); return; }
  const incoming = edgesToId.get(node.id) || [];
  const rec = incoming.filter(e => typeLien(e) === 'RECRUTEMENT');
  const icon = rec.length > 0 ? '✓' : '⚠';
  const sources = rec.slice(0, 3).map(e => { const s = byId.get(srcId(e)); return s ? (s.nom_fr||s.code).substring(0, 50) : srcId(e); });
  console.log(`${icon} ${code}: ${rec.length} recrutement, ${incoming.length} total. Sources: ${sources.join(', ') || 'AUCUNE'}`);
  metiersStatus.push({ code, status: rec.length > 0 ? 'OK' : 'NO_RECRUITMENT', recrutement: rec.length, total: incoming.length });
});

// 7. Pharmacy by city
console.log('\n=== PHARMACIE PAR VILLE ===');
const pharmacyFormations = byType('FILIERE').filter(n => /PHARMACIE|PHARMACIEN|DOCTORAT_PHARMACIE/i.test(n.code + ' ' + (n.nom_fr||'')));
const pharmacyCities = [...new Set(pharmacyFormations.map(n => n.ville).filter(Boolean))];
pharmacyCities.forEach(city => {
  const formsInCity = pharmacyFormations.filter(n => n.ville === city);
  const withEdges = formsInCity.filter(n => (edgesToId.get(n.id)||[]).length > 0 || (edgesFromId.get(n.id)||[]).length > 0);
  console.log(`${city}: ${formsInCity.length} formations, ${withEdges.length} avec aretes`);
});

// 8. Law formations
console.log('\n=== FORMATIONS DROIT ===');
const lawFormations = byType('FILIERE').filter(n => /DROIT|JURIDIQUE|JUDICIAIRE/i.test(n.code + ' ' + (n.nom_fr||n.nom||'')));
lawFormations.slice(0, 15).forEach(n => {
  const inc = (edgesToId.get(n.id)||[]).length;
  const out = (edgesFromId.get(n.id)||[]).length;
  console.log(`  ${n.code.substring(0,60)} | edges: ${inc+out} | ${n.ville || 'no-city'}`);
});
console.log(`  Total formations droit: ${lawFormations.length}`);

// 9. Expert comptable chain
console.log('\n=== CHAINE EXPERT COMPTABLE ===');
const ecNode = byCode.get('EXPERT_COMPTABLE');
if (ecNode) {
  const ecIncoming = edgesToId.get(ecNode.id) || [];
  console.log(`Expert Comptable (${ecNode.id}): ${ecIncoming.length} aretes entrantes`);
  ecIncoming.forEach(e => {
    const src = byId.get(srcId(e));
    console.log(`  ${typeLien(e)} <- ${src ? src.code : srcId(e)}`);
  });
}
const cycleExp = nodes.filter(n => /CYCLE.*EXPERTISE|EXPERTISE_COMPTABLE/i.test(n.code));
cycleExp.forEach(n => {
  const inc = edgesToId.get(n.id) || [];
  const out = edgesFromId.get(n.id) || [];
  console.log(`${n.code.substring(0,70)} | incoming: ${inc.length}, outgoing: ${out.length}`);
});

// 10. Check BAC series connections
console.log('\n=== SERIES BAC ===');
const bacNodes = byType('FILIERE').filter(n => /^BAC_/.test(n.code) || /^1BAC/.test(n.code));
bacNodes.forEach(n => {
  const out = (edgesFromId.get(n.id) || []).length;
  const inc = (edgesToId.get(n.id) || []).length;
  console.log(`${n.code}: outgoing=${out}, incoming=${inc}`);
});

// Save detailed report
const report = { metiersStatus, metiersNoRecruitmentCount: metiersNoRecruitment.length, 
  metiersNoRecruitmentList: metiersNoRecruitment.map(m=>m.code),
  metiersOrphanList: metiersOrphan.map(m=>m.code),
  filieresNoSchool: filieresNoSchool.length, filieresOrphan: filieresOrphan.length,
  orphanEdges: orphanEdges.length };
writeFileSync(join(__dirname, 'full-audit-report.json'), JSON.stringify(report, null, 2));
