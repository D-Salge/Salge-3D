import Database from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = new Database(join(raiz, 'database', 'salge3d.sqlite'))
db.pragma('foreign_keys = ON')

try {
  const reconciliar = db.transaction(() => {
    const filamentos = db.prepare(`
      SELECT f.id, f.tenant_id, f.usuario_id, f.peso_rolo_gramas, f.preco_rolo,
        COALESCE(f.estoque_gramas, f.peso_rolo_gramas) AS estoque,
        COALESCE((SELECT SUM(l.saldo_gramas) FROM lotes_filamento l
          WHERE l.filamento_id = f.id AND l.tenant_id = f.tenant_id AND l.ativo = 1), 0) AS saldo_lotes
      FROM filamentos f
      WHERE f.ativo = 1
    `).all()
    const inserirLote = db.prepare(`
      INSERT INTO lotes_filamento (
        tenant_id, filamento_id, codigo, peso_inicial_gramas,
        saldo_gramas, preco_compra, aberto_em
      ) VALUES (?, ?, ?, ?, ?, ?, date('now'))
    `)
    const inserirMovimento = db.prepare(`
      INSERT INTO movimentos_estoque (
        tenant_id, usuario_id, tipo_item, item_id, lote_filamento_id,
        tipo, quantidade, saldo_anterior, saldo_posterior, motivo
      ) VALUES (?, ?, 'Filamento', ?, ?, 'Entrada', ?, ?, ?, 'Reconciliação de saldo sem lote')
    `)
    let criados = 0
    for (const item of filamentos) {
      const diferenca = Math.round((item.estoque - item.saldo_lotes) * 1000) / 1000
      if (diferenca <= 0) continue
      const codigo = `REC-${item.id}-${Date.now()}-${criados + 1}`
      const lote = inserirLote.run(
        item.tenant_id, item.id, codigo,
        Math.max(diferenca, item.peso_rolo_gramas), diferenca, item.preco_rolo,
      )
      inserirMovimento.run(
        item.tenant_id, item.usuario_id, item.id, Number(lote.lastInsertRowid),
        diferenca, item.saldo_lotes, item.estoque,
      )
      criados += 1
    }
    return criados
  })
  console.log(`Reconciliação de lotes concluída: ${reconciliar()} lote(s) criado(s).`)
} finally {
  db.close()
}
