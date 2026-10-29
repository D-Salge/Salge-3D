// Executar dentro da mesma transação IMMEDIATE que insere o produto.
export function gerarCodigoProduto(db, tenantId) {
  if (!db.inTransaction) throw new Error('Código de produto exige transação.')
  const existentes = new Set(db.prepare(
    'SELECT codigo FROM produtos_catalogo WHERE tenant_id = ?',
  ).all(tenantId).map(item => item.codigo))
  let sequencia = 1
  while (existentes.has(`PRD-${String(sequencia).padStart(6, '0')}`)) sequencia++
  return `PRD-${String(sequencia).padStart(6, '0')}`
}

export function verificarNomeProduto(db, tenantId, nomeChave, id) {
  const existente = db.prepare(`SELECT id, ativo FROM produtos_catalogo
    WHERE tenant_id = ? AND nome_chave = ? AND (? IS NULL OR id <> ?)`)
    .get(tenantId, nomeChave, id, id)
  if (existente) throw new Error(existente.ativo ? 'NOME_DUPLICADO' : 'NOME_ARQUIVADO')
}

export function mensagemConflitoProduto(error) {
  if (error?.message === 'NOME_ARQUIVADO') {
    return 'Existe um produto arquivado com esse nome. Solicite a reativação do cadastro existente ao administrador, preservando o histórico de pedidos e versões.'
  }
  if (error?.message === 'NOME_DUPLICADO') return 'Já existe um produto ativo com esse nome.'
  if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    const colunas = String(error.message).split('UNIQUE constraint failed: ')[1]?.split(',').map(coluna => coluna.trim()).sort().join(',')
    if (colunas === 'produtos_catalogo.nome_chave,produtos_catalogo.tenant_id') return 'Já existe um produto com esse nome.'
    if (colunas === 'produtos_catalogo.codigo,produtos_catalogo.tenant_id') return 'Conflito no código do produto. Tente novamente; se persistir, contate o administrador.'
    return 'Conflito de unicidade ao salvar a ficha técnica. Contate o administrador.'
  }
  if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) return 'Uma restrição de integridade impediu salvar a ficha técnica. Revise os dados ou contate o administrador.'
  return null
}
