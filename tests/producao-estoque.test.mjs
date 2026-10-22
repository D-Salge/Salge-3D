import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { applyMigrations } from '../lib/migrations.mjs'
import { finalizarPedidoNoBanco } from '../lib/fechamento-pedido.mjs'
import { registrarEntregaParcialNoBanco } from '../lib/registro-entrega.mjs'
import {
  atualizarStatusOrdemProducaoEstoqueNoBanco,
  ajustarEstoqueProdutoAcabadoNoBanco,
  concluirOrdemProducaoEstoqueNoBanco,
  confirmarSaidaProdutosAcabadosNoBanco,
  consultarSaldoProdutoAcabadoNoBanco,
  criarOrdemProducaoEstoqueNoBanco,
  devolverSaidaProdutosAcabadosNoBanco,
  liberarOuDevolverPedidoEstoqueNoBanco,
  reservarProdutosAcabadosParaPedidoNoBanco,
} from '../lib/producao-estoque.mjs'

const contexto = { tenantId: 1, usuarioId: 1, perfil: 'admin' }

function ambiente(t, caminho = ':memory:', registrarLimpeza = true) {
  const db = new Database(caminho)
  if (registrarLimpeza) t.after(() => db.close())
  db.pragma('foreign_keys = ON')
  db.exec(readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8')
    .split('\n').filter(linha => !linha.trim().toUpperCase().startsWith('PRAGMA')).join('\n'))
  applyMigrations(db)
  const clienteId = Number(db.prepare("INSERT INTO clientes (tenant_id, usuario_id, nome) VALUES (1, 1, 'Cliente estoque')").run().lastInsertRowid)
  const produtoId = Number(db.prepare(`INSERT INTO produtos_catalogo
    (tenant_id, usuario_id, codigo, nome, nome_chave) VALUES (1, 1, 'PROD-TESTE', 'Jesus Sentado AMS', 'jesus sentado ams')`).run().lastInsertRowid)
  const versaoId = Number(db.prepare(`INSERT INTO produto_versoes
    (produto_id, versao, preco_base_unitario, tempo_impressao_horas_unidade, ativa, unidades_por_placa, impressora_preferida_id)
    VALUES (?, 1, 25, 0.5, 1, 24, 1)`).run(produtoId).lastInsertRowid)
  const filamentoPreto = criarFilamento(db, 'Preto', 1000, 100)
  const filamentoBranco = criarFilamento(db, 'Branco', 1000, 120)
  const insumoId = Number(db.prepare(`INSERT INTO insumos
    (tenant_id, usuario_id, nome, unidade, estoque_atual, custo_unitario)
    VALUES (1, 1, 'Ímã', 'unid', 100, 2)`).run().lastInsertRowid)
  db.prepare(`INSERT INTO produto_versao_itens (versao_id, tipo_item, item_id, quantidade_por_unidade)
    VALUES (?, 'Filamento', ?, 10), (?, 'Filamento', ?, 5), (?, 'Insumo', ?, 1)`
  ).run(versaoId, filamentoPreto, versaoId, filamentoBranco, versaoId, insumoId)

  function criarOrdem(sufixo = 'A') {
    return criarOrdemProducaoEstoqueNoBanco(db, contexto, {
      produtoId, produtoVersaoId: versaoId, quantidadePlanejada: 24,
      impressoraId: 1, dataPrevista: '2026-11-01', identificacaoLote: `FAB-TESTE-${sufixo}`,
      quantidadePorPlate: 24, execucoesPlanejadas: 1, tempoEstimadoExecucaoHoras: 12,
      filamentos: [
        { filamentoId: filamentoPreto, gramasPrevistas: 240 },
        { filamentoId: filamentoBranco, gramasPrevistas: 120 },
      ],
      insumos: [{ insumoId, quantidadePrevista: 24 }],
      observacoes: 'AMS com purga incluída', arquivosReferencia: 'plate-jesus.3mf',
    })
  }

  function concluir(ordemId, { aprovadas = 24, reprovadas = 0, operacao = 'conclusao-teste-0001' } = {}) {
    atualizarStatusOrdemProducaoEstoqueNoBanco(db, contexto, ordemId, 'Em produção')
    atualizarStatusOrdemProducaoEstoqueNoBanco(db, contexto, ordemId, 'Conferência')
    return concluirOrdemProducaoEstoqueNoBanco(db, contexto, {
      ordemId, operacaoId: operacao, quantidadeFabricada: aprovadas + reprovadas,
      quantidadeAprovada: aprovadas, quantidadeReprovada: reprovadas,
      tempoRealHoras: 12, horasTrabalhoReal: 1, falhas: reprovadas ? 1 : 0,
      custosAdicionais: 5, desperdiciosObservacoes: reprovadas ? 'Duas peças reprovadas' : '',
      filamentos: [
        { filamentoId: filamentoPreto, gramasReais: 260 },
        { filamentoId: filamentoBranco, gramasReais: 140 },
      ],
      insumos: [{ insumoId, quantidadeReal: aprovadas + reprovadas }],
    })
  }

  function criarPedidoEstoque(quantidade) {
    return Number(db.prepare(`INSERT INTO pedidos (
      tenant_id, usuario_id, cliente_id, produto_id, produto_versao_id,
      nome_da_peca, tempo_impressao_horas, valor_total_cobrado, status,
      orcamento_status, quantidade, atendimento_tipo
    ) VALUES (1, 1, ?, ?, ?, 'Jesus Sentado AMS', 0.000001, ?, 'Acabamento', 'Aprovado', ?, 'Estoque')`
    ).run(clienteId, produtoId, versaoId, quantidade * 25, quantidade).lastInsertRowid)
  }
  return { db, clienteId, produtoId, versaoId, filamentoPreto, filamentoBranco, insumoId, criarOrdem, concluir, criarPedidoEstoque }
}

function criarFilamento(db, cor, saldo, preco) {
  const id = Number(db.prepare(`INSERT INTO filamentos
    (tenant_id, usuario_id, material, cor, peso_rolo_gramas, preco_rolo, estoque_gramas)
    VALUES (1, 1, 'PLA', ?, 1000, ?, ?)`).run(cor, preco, saldo).lastInsertRowid)
  db.prepare(`INSERT INTO lotes_filamento
    (tenant_id, filamento_id, codigo, peso_inicial_gramas, saldo_gramas, preco_compra, aberto_em)
    VALUES (1, ?, ?, 1000, ?, ?, '2026-01-01')`).run(id, `MAT-${cor}`, saldo, preco)
  return id
}

test('ordem interna nasce sem venda, cliente ou efeitos financeiros', t => {
  const f = ambiente(t)
  const antes = {
    pedidos: f.db.prepare('SELECT COUNT(*) AS n FROM pedidos').get().n,
    recebimentos: f.db.prepare('SELECT COUNT(*) AS n FROM recebimentos').get().n,
    receitas: f.db.prepare('SELECT COUNT(*) AS n FROM receitas_fiscais').get().n,
  }
  const ordem = f.criarOrdem()
  assert.ok(ordem.ordemId > 0)
  assert.deepEqual({
    pedidos: f.db.prepare('SELECT COUNT(*) AS n FROM pedidos').get().n,
    recebimentos: f.db.prepare('SELECT COUNT(*) AS n FROM recebimentos').get().n,
    receitas: f.db.prepare('SELECT COUNT(*) AS n FROM receitas_fiscais').get().n,
  }, antes)
})

test('transições de produção impedem atalhos e cancelamento/falha não geram estoque', t => {
  const f = ambiente(t)
  const cancelada = f.criarOrdem('CANCELADA')
  assert.throws(() => atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, cancelada.ordemId, 'Conferência'), /INVALID_TRANSITION/)
  assert.equal(atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, cancelada.ordemId, 'Cancelada'), 'UPDATED')
  assert.throws(() => atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, cancelada.ordemId, 'Em produção'), /INVALID_TRANSITION/)
  const falha = f.criarOrdem('FALHA')
  atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, falha.ordemId, 'Em produção')
  assert.equal(atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, falha.ordemId, 'Falhou'), 'UPDATED')
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM lotes_produtos_acabados').get().n, 0)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM movimentos_estoque WHERE ordem_producao_estoque_id IN (?, ?)').get(cancelada.ordemId, falha.ordemId).n, 0)
})

test('24 aprovadas entram no estoque com baixa AMS e custo histórico dos lotes', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem()
  const resultado = f.concluir(ordem.ordemId)
  assert.equal(resultado.resultado, 'CREATED')
  assert.equal(consultarSaldoProdutoAcabadoNoBanco(f.db, 1, f.produtoId, f.versaoId).disponivel, 24)
  assert.equal(f.db.prepare('SELECT estoque_gramas FROM filamentos WHERE id = ?').get(f.filamentoPreto).estoque_gramas, 740)
  assert.equal(f.db.prepare('SELECT estoque_gramas FROM filamentos WHERE id = ?').get(f.filamentoBranco).estoque_gramas, 860)
  assert.equal(f.db.prepare('SELECT estoque_atual FROM insumos WHERE id = ?').get(f.insumoId).estoque_atual, 76)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM movimentos_estoque WHERE ordem_producao_estoque_id = ?').get(ordem.ordemId).n, 3)
  const custoAntes = resultado.custoUnitario
  f.db.prepare('UPDATE filamentos SET preco_rolo = 999 WHERE id IN (?, ?)').run(f.filamentoPreto, f.filamentoBranco)
  assert.equal(f.db.prepare('SELECT custo_unitario FROM lotes_produtos_acabados WHERE ordem_id = ?').get(ordem.ordemId).custo_unitario, custoAntes)
})

test('duas reprovações rateiam todo o custo somente entre 22 aprovadas', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem()
  const resultado = f.concluir(ordem.ordemId, { aprovadas: 22, reprovadas: 2 })
  const lote = f.db.prepare('SELECT quantidade_produzida, quantidade_aprovada, quantidade_reprovada, custo_total, custo_unitario FROM lotes_produtos_acabados WHERE ordem_id = ?').get(ordem.ordemId)
  assert.equal(lote.quantidade_produzida, 24)
  assert.equal(lote.quantidade_aprovada, 22)
  assert.equal(lote.quantidade_reprovada, 2)
  assert.equal(lote.custo_unitario, Math.round((lote.custo_total / 22 + Number.EPSILON) * 100) / 100)
  assert.equal(resultado.custoUnitario, lote.custo_unitario)
})

test('conclusão repetida não duplica baixa, entrada, histórico ou auditoria', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem()
  const primeiro = f.concluir(ordem.ordemId)
  const movimentosAntes = f.db.prepare('SELECT COUNT(*) AS n FROM movimentos_estoque').get().n
  const auditoriaAntes = f.db.prepare('SELECT COUNT(*) AS n FROM auditoria').get().n
  const segundo = concluirOrdemProducaoEstoqueNoBanco(f.db, contexto, {
    ordemId: ordem.ordemId, operacaoId: 'conclusao-teste-0001', quantidadeFabricada: 24,
    quantidadeAprovada: 24, quantidadeReprovada: 0, tempoRealHoras: 12, horasTrabalhoReal: 1,
    falhas: 0, custosAdicionais: 5, desperdiciosObservacoes: '',
    filamentos: [{ filamentoId: f.filamentoPreto, gramasReais: 260 }, { filamentoId: f.filamentoBranco, gramasReais: 140 }],
    insumos: [{ insumoId: f.insumoId, quantidadeReal: 24 }],
  })
  assert.equal(primeiro.resultado, 'CREATED')
  assert.equal(segundo.resultado, 'UNCHANGED')
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM movimentos_estoque').get().n, movimentosAntes)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM movimentos_produtos_acabados').get().n, 1)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM auditoria').get().n, auditoriaAntes)
})

test('falha de material reverte ordem, saldos, movimentos e entrada acabada', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem()
  atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, ordem.ordemId, 'Em produção')
  atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, ordem.ordemId, 'Conferência')
  f.db.prepare('UPDATE lotes_filamento SET saldo_gramas = 1 WHERE filamento_id = ?').run(f.filamentoBranco)
  assert.throws(() => concluirOrdemProducaoEstoqueNoBanco(f.db, contexto, {
    ordemId: ordem.ordemId, operacaoId: 'conclusao-falha-0001', quantidadeFabricada: 24,
    quantidadeAprovada: 24, quantidadeReprovada: 0, tempoRealHoras: 12, horasTrabalhoReal: 0,
    falhas: 0, custosAdicionais: 0, desperdiciosObservacoes: '',
    filamentos: [{ filamentoId: f.filamentoPreto, gramasReais: 260 }, { filamentoId: f.filamentoBranco, gramasReais: 140 }],
    insumos: [{ insumoId: f.insumoId, quantidadeReal: 24 }],
  }), /INSUFFICIENT_STOCK/)
  assert.equal(f.db.prepare('SELECT estoque_gramas FROM filamentos WHERE id = ?').get(f.filamentoPreto).estoque_gramas, 1000)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM movimentos_estoque WHERE ordem_producao_estoque_id = ?').get(ordem.ordemId).n, 0)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM lotes_produtos_acabados').get().n, 0)
  assert.equal(f.db.prepare('SELECT status FROM ordens_producao_estoque WHERE id = ?').get(ordem.ordemId).status, 'Conferência')
})

test('vendas sucessivas reservam e baixam 1 e depois 5 sem novo consumo de filamento', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); f.concluir(ordem.ordemId)
  const saldoMaterial = f.db.prepare('SELECT estoque_gramas FROM filamentos WHERE id = ?').get(f.filamentoPreto).estoque_gramas
  const pedido1 = f.criarPedidoEstoque(1)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido1)
  confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, { pedidoId: pedido1, quantidade: 1, operacaoId: 'venda-pedido-0001' })
  assert.equal(consultarSaldoProdutoAcabadoNoBanco(f.db, 1, f.produtoId, f.versaoId).fisico, 23)
  const pedido2 = f.criarPedidoEstoque(5)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido2)
  confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, { pedidoId: pedido2, quantidade: 5, operacaoId: 'venda-pedido-0002' })
  assert.equal(consultarSaldoProdutoAcabadoNoBanco(f.db, 1, f.produtoId, f.versaoId).fisico, 18)
  assert.equal(f.db.prepare('SELECT estoque_gramas FROM filamentos WHERE id = ?').get(f.filamentoPreto).estoque_gramas, saldoMaterial)
  assert.equal(f.db.prepare('SELECT custo_produto_acabado_real FROM pedidos WHERE id = ?').get(pedido2).custo_produto_acabado_real,
    f.db.prepare("SELECT custo_total FROM movimentos_produtos_acabados WHERE pedido_id = ? AND tipo = 'Saída'").get(pedido2).custo_total)
})

test('reserva e custo da venda seguem FIFO entre lotes de fabricação', t => {
  const f = ambiente(t)
  const primeira = f.criarOrdem('FIFO-1'); const lote1 = f.concluir(primeira.ordemId, { operacao: 'conclusao-fifo-0001' })
  f.db.prepare('UPDATE filamentos SET estoque_gramas = estoque_gramas + 500, preco_rolo = 200 WHERE id IN (?, ?)').run(f.filamentoPreto, f.filamentoBranco)
  f.db.prepare('UPDATE lotes_filamento SET saldo_gramas = saldo_gramas + 500, preco_compra = 200 WHERE filamento_id IN (?, ?)').run(f.filamentoPreto, f.filamentoBranco)
  f.db.prepare('UPDATE insumos SET estoque_atual = estoque_atual + 50 WHERE id = ?').run(f.insumoId)
  const segunda = f.criarOrdem('FIFO-2'); const lote2 = f.concluir(segunda.ordemId, { operacao: 'conclusao-fifo-0002' })
  const pedido = f.criarPedidoEstoque(30)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  const reservas = f.db.prepare(`SELECT lote_id, quantidade_reservada FROM reservas_produtos_acabados
    WHERE pedido_id = ? ORDER BY id`).all(pedido)
  assert.deepEqual(reservas, [{ lote_id: lote1.loteId, quantidade_reservada: 24 }, { lote_id: lote2.loteId, quantidade_reservada: 6 }])
  confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, { pedidoId: pedido, quantidade: 30, operacaoId: 'saida-fifo-0001' })
  const custoMovimentos = f.db.prepare("SELECT SUM(custo_total) AS total FROM movimentos_produtos_acabados WHERE pedido_id = ? AND tipo = 'Saída'").get(pedido).total
  assert.equal(f.db.prepare('SELECT custo_produto_acabado_real FROM pedidos WHERE id = ?').get(pedido).custo_produto_acabado_real,
    Math.round((custoMovimentos + Number.EPSILON) * 100) / 100)
})

test('reserva acima do disponível falha inteira e empresa diferente não acessa o estoque', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); f.concluir(ordem.ordemId)
  const pedido = f.criarPedidoEstoque(25)
  assert.throws(() => reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido), /INSUFFICIENT_FINISHED_STOCK/)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM reservas_produtos_acabados WHERE pedido_id = ?').get(pedido).n, 0)
  assert.deepEqual(consultarSaldoProdutoAcabadoNoBanco(f.db, 2, f.produtoId, f.versaoId), { fisico: 0, reservado: 0, disponivel: 0 })
})

test('repetição da saída não duplica e uma operação distinta legítima continua permitida', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); f.concluir(ordem.ordemId)
  const pedido = f.criarPedidoEstoque(6)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  assert.equal(confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, { pedidoId: pedido, quantidade: 1, operacaoId: 'saida-idempotente-0001' }).resultado, 'CREATED')
  assert.equal(confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, { pedidoId: pedido, quantidade: 1, operacaoId: 'saida-idempotente-0001' }).resultado, 'UNCHANGED')
  assert.equal(confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, { pedidoId: pedido, quantidade: 5, operacaoId: 'saida-idempotente-0002' }).resultado, 'CREATED')
  assert.equal(f.db.prepare("SELECT SUM(quantidade) AS n FROM movimentos_produtos_acabados WHERE pedido_id = ? AND tipo = 'Saída'").get(pedido).n, 6)
})

test('entrega parcial confirma saída acabada de forma atômica e idempotente', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); f.concluir(ordem.ordemId)
  const pedido = f.criarPedidoEstoque(4)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  const dados = { operacaoId: '11111111-1111-4111-8111-111111111111', pedidoId: pedido,
    quantidade: 2, entregueEm: '2026-10-21', observacao: '', registrarPagamento: false,
    valorRecebido: 0, formaPagamento: 'Pix' }
  assert.equal(registrarEntregaParcialNoBanco(f.db, contexto, dados).resultado, 'CREATED')
  assert.equal(registrarEntregaParcialNoBanco(f.db, contexto, dados).resultado, 'UNCHANGED')
  assert.equal(f.db.prepare("SELECT SUM(quantidade) AS total FROM movimentos_produtos_acabados WHERE pedido_id = ? AND tipo = 'Saída'").get(pedido).total, 2)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS total FROM entregas_pedido WHERE pedido_id = ?').get(pedido).total, 1)
  assert.deepEqual(
    f.db.prepare('SELECT status, quantidade_produzida FROM pedidos WHERE id = ?').get(pedido),
    { status: 'Acabamento', quantidade_produzida: 0 },
  )

  const entregaFinal = { ...dados, operacaoId: '22222222-2222-4222-8222-222222222222' }
  assert.equal(registrarEntregaParcialNoBanco(f.db, contexto, entregaFinal).resultado, 'CREATED')
  assert.equal(registrarEntregaParcialNoBanco(f.db, contexto, entregaFinal).resultado, 'UNCHANGED')
  assert.deepEqual(
    f.db.prepare('SELECT status, quantidade_produzida FROM pedidos WHERE id = ?').get(pedido),
    { status: 'Finalizado', quantidade_produzida: 0 },
  )
  assert.equal(f.db.prepare("SELECT SUM(quantidade) AS total FROM movimentos_produtos_acabados WHERE pedido_id = ? AND tipo = 'Saída'").get(pedido).total, 4)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS total FROM entregas_pedido WHERE pedido_id = ?').get(pedido).total, 2)
})

test('finalização de pedido de estoque baixa somente acabados e repetição não duplica', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); f.concluir(ordem.ordemId)
  const pedido = f.criarPedidoEstoque(3)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  const movimentosMateriais = f.db.prepare('SELECT COUNT(*) AS n FROM movimentos_estoque').get().n
  assert.equal(finalizarPedidoNoBanco(f.db, contexto, pedido), 'UPDATED')
  assert.equal(finalizarPedidoNoBanco(f.db, contexto, pedido), 'UNCHANGED')
  assert.equal(f.db.prepare("SELECT SUM(quantidade) AS total FROM movimentos_produtos_acabados WHERE pedido_id = ? AND tipo = 'Saída'").get(pedido).total, 3)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM movimentos_estoque').get().n, movimentosMateriais)
})

test('cancelamento libera reserva e devolve saída sem desfazer a fabricação', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); f.concluir(ordem.ordemId)
  const pedido = f.criarPedidoEstoque(3)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, { pedidoId: pedido, quantidade: 3, operacaoId: 'saida-cancelar-0001' })
  liberarOuDevolverPedidoEstoqueNoBanco(f.db, contexto, pedido, 'cancelar-estoque-0001')
  assert.equal(consultarSaldoProdutoAcabadoNoBanco(f.db, 1, f.produtoId, f.versaoId).disponivel, 24)
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM movimentos_produtos_acabados WHERE pedido_id = ? AND tipo = 'Devolução'").get(pedido).n, 1)
  assert.equal(f.db.prepare('SELECT custo_produto_acabado_real FROM pedidos WHERE id = ?').get(pedido).custo_produto_acabado_real, 0)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM movimentos_estoque WHERE ordem_producao_estoque_id = ?').get(ordem.ordemId).n, 3)
})

test('devolução de entrega é rastreável e idempotente', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); f.concluir(ordem.ordemId)
  const pedido = f.criarPedidoEstoque(2)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  const entregaId = Number(f.db.prepare(`INSERT INTO entregas_pedido
    (tenant_id, usuario_id, pedido_id, quantidade, valor_referente, entregue_em)
    VALUES (1, 1, ?, 2, 50, '2026-10-21')`).run(pedido).lastInsertRowid)
  confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, { pedidoId: pedido, quantidade: 2, operacaoId: 'entrega-estoque-0001', entregaId })
  assert.equal(devolverSaidaProdutosAcabadosNoBanco(f.db, contexto, { pedidoId: pedido, entregaId, operacaoId: 'devolucao-estoque-0001' }).resultado, 'CREATED')
  assert.equal(devolverSaidaProdutosAcabadosNoBanco(f.db, contexto, { pedidoId: pedido, entregaId, operacaoId: 'devolucao-estoque-0001' }).resultado, 'UNCHANGED')
  assert.equal(consultarSaldoProdutoAcabadoNoBanco(f.db, 1, f.produtoId, f.versaoId).fisico, 24)
})

test('visualizador e tenant diferente não criam, concluem ou reservam', t => {
  const f = ambiente(t)
  const dados = {
    produtoId: f.produtoId, produtoVersaoId: f.versaoId, quantidadePlanejada: 1,
    impressoraId: null, dataPrevista: '', identificacaoLote: 'SEM-PERMISSAO', quantidadePorPlate: 1,
    execucoesPlanejadas: 1, tempoEstimadoExecucaoHoras: 1, filamentos: [], insumos: [], observacoes: '', arquivosReferencia: '',
  }
  assert.throws(() => criarOrdemProducaoEstoqueNoBanco(f.db, { ...contexto, perfil: 'visualizador' }, dados), /FORBIDDEN/)
  assert.throws(() => criarOrdemProducaoEstoqueNoBanco(f.db, { ...contexto, tenantId: 2 }, dados), /PRODUCT_NOT_FOUND/)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM ordens_producao_estoque').get().n, 0)
})

test('migração é aditiva e cria o livro acabado sem alterar pedidos históricos', t => {
  const f = ambiente(t)
  const pedido = Number(f.db.prepare(`INSERT INTO pedidos
    (tenant_id, usuario_id, cliente_id, nome_da_peca, tempo_impressao_horas, valor_total_cobrado)
    VALUES (1, 1, ?, 'Histórico', 1, 10)`).run(f.clienteId).lastInsertRowid)
  assert.equal(f.db.prepare('SELECT atendimento_tipo FROM pedidos WHERE id = ?').get(pedido).atendimento_tipo, 'Encomenda')
  assert.ok(f.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'movimentos_produtos_acabados'").get())
  assert.ok(f.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ordens_producao_estoque'").get())
})

test('perdas e ajustes respeitam reservas, saldo e idempotência', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); const conclusao = f.concluir(ordem.ordemId)
  const loteId = conclusao.loteId
  const pedido = f.criarPedidoEstoque(20)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  assert.throws(() => ajustarEstoqueProdutoAcabadoNoBanco(f.db, contexto, {
    loteId, tipo: 'Perda', quantidade: 5, motivo: 'Avaria', operacaoId: 'perda-bloqueada-0001',
  }), /INSUFFICIENT_FINISHED_STOCK/)
  const dados = { loteId, tipo: 'Perda', quantidade: 4, motivo: 'Avaria na conferência posterior', operacaoId: 'perda-valida-0001' }
  assert.equal(ajustarEstoqueProdutoAcabadoNoBanco(f.db, contexto, dados), 'CREATED')
  assert.equal(ajustarEstoqueProdutoAcabadoNoBanco(f.db, contexto, dados), 'UNCHANGED')
  assert.equal(consultarSaldoProdutoAcabadoNoBanco(f.db, 1, f.produtoId, f.versaoId).fisico, 20)
  assert.equal(ajustarEstoqueProdutoAcabadoNoBanco(f.db, contexto, {
    loteId, tipo: 'Ajuste entrada', quantidade: 1, motivo: 'Contagem física', operacaoId: 'ajuste-entrada-0001',
  }), 'CREATED')
  assert.equal(consultarSaldoProdutoAcabadoNoBanco(f.db, 1, f.produtoId, f.versaoId).fisico, 21)
})

test('bloqueio IMMEDIATE serializa reserva concorrente sem efeitos parciais', t => {
  const diretorio = mkdtempSync(join(tmpdir(), 'salge-produtos-acabados-'))
  const caminho = join(diretorio, 'teste.sqlite')
  const f = ambiente(t, caminho, false)
  const ordem = f.criarOrdem(); f.concluir(ordem.ordemId)
  const pedido = f.criarPedidoEstoque(4)
  const concorrente = new Database(caminho)
  t.after(() => {
    concorrente.close()
    f.db.close()
    rmSync(diretorio, { recursive: true, force: true })
  })
  concorrente.pragma('foreign_keys = ON')
  concorrente.pragma('busy_timeout = 0')
  f.db.exec('BEGIN IMMEDIATE')
  try {
    assert.throws(() => reservarProdutosAcabadosParaPedidoNoBanco(concorrente, contexto, pedido), /database is locked/)
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM reservas_produtos_acabados WHERE pedido_id = ?').get(pedido).n, 0)
  } finally {
    f.db.exec('ROLLBACK')
  }
  assert.equal(reservarProdutosAcabadosParaPedidoNoBanco(concorrente, contexto, pedido).resultado, 'CREATED')
  assert.equal(concorrente.prepare('SELECT SUM(quantidade_reservada) AS n FROM reservas_produtos_acabados WHERE pedido_id = ?').get(pedido).n, 4)
})

