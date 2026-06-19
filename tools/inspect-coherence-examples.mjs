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

const wanted = /ENCG|DUT FINANCE|SCIENCES POLITIQUES|SYSTEME D'INFORMATION|ISGA EL JADIDA|AUDITEUR_FINANCIER|AUDITEUR FINANCIER/i

const rows = []
for (const edge of edges) {
  const source = byId.get(edge.source_id)
  const target = byId.get(edge.target_id)
  if (!source || !target) continue
  const text = `${source.code} ${source.nom_fr} ${target.code} ${target.nom_fr}`
  if (!wanted.test(text)) continue
  rows.push({
    type: edge.type_lien,
    fromType: source.type,
    from: source.code,
    fromName: source.nom_fr,
    fromCity: source.ville,
    toType: target.type,
    to: target.code,
    toName: target.nom_fr,
    toCity: target.ville,
  })
}

console.log(JSON.stringify({ count: rows.length, rows: rows.slice(0, 300) }, null, 2))
