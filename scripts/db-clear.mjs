import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.resolve(__dirname, '../database/salge3d.sqlite')

console.log(`\n🧹 Iniciando limpeza do banco de dados para produção...`)
console.log(`🔌 Conectando ao banco: ${dbPath}`)

const db = new Database(dbPath)

// Habilita chaves estrangeiras para garantir integridade,
// mas para limpar, vamos apagar as filhas primeiro.
db.pragma('foreign_keys = ON')

try {
  const clearDatabase = db.transaction(() => {
    // 1. Apaga os dados operacionais em ordem (filhos -> pais)
    db.prepare('DELETE FROM recebimento_alocacoes').run()
    db.prepare('DELETE FROM recebimentos').run()
    db.prepare('DELETE FROM parcelas_receber').run()
    db.prepare('DELETE FROM anexos_pedido').run()
    db.prepare('DELETE FROM historico_pedidos').run()
    db.prepare('DELETE FROM pedido_insumos').run()
    db.prepare('DELETE FROM pedido_filamentos').run()
    db.prepare('DELETE FROM movimentos_estoque').run()
    db.prepare('DELETE FROM despesas').run()
    db.prepare('DELETE FROM fluxo_capital').run()
    db.prepare('DELETE FROM pedidos').run()
    db.prepare('DELETE FROM lotes_filamento').run()
    db.prepare('DELETE FROM clientes').run()
    db.prepare('DELETE FROM insumos').run()
    db.prepare('DELETE FROM filamentos').run()
    db.prepare('DELETE FROM importacao_linhas').run()
    db.prepare('DELETE FROM importacoes_planilha').run()
    db.prepare('DELETE FROM auditoria').run()

    // 2. Reseta a contagem de IDs automáticos para essas tabelas
    const resetStmt = db.prepare(`
      UPDATE sqlite_sequence 
      SET seq = 0 
      WHERE name IN (
        'pedido_insumos',
        'pedido_filamentos',
        'recebimento_alocacoes',
        'recebimentos',
        'parcelas_receber',
        'anexos_pedido',
        'historico_pedidos',
        'movimentos_estoque',
        'pedidos',
        'lotes_filamento',
        'clientes',
        'insumos',
        'filamentos',
        'despesas',
        'fluxo_capital',
        'importacao_linhas',
        'importacoes_planilha',
        'auditoria'
      )
    `)
    resetStmt.run()

    console.log(`✅ Registros de teste (pedidos, clientes, filamentos, insumos, despesas, fluxo) removidos com sucesso.`)
    console.log(`✅ Sequências de ID resetadas (próximos cadastros receberão ID #1).`)
    console.log(`🛡️ Estrutura do banco, tenants e usuários preservados.\n`)
  })

  clearDatabase()
  console.log(`🎉 Limpeza cirúrgica concluída! O sistema está pronto para o mundo real.`)
} catch (error) {
  console.error(`\n❌ Erro durante a limpeza:`, error)
  process.exit(1)
} finally {
  db.close()
}
