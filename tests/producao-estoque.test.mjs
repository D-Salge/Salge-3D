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
  reconciliarPedidoEstoqueAposEstornoNoBanco,
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

function estornarEntregaNoTeste(db, pedidoId, entregaId, operacaoId) {
  return db.transaction(() => {
    const resultado = devolverSaidaProdutosAcabadosNoBanco(db, contexto, { pedidoId, entregaId, operacaoId })
    db.prepare(`UPDATE entregas_pedido SET cancelada_em = COALESCE(cancelada_em, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      WHERE id = ? AND tenant_id = ?`).run(entregaId, contexto.tenantId)
    reconciliarPedidoEstoqueAposEstornoNoBanco(db, contexto, pedidoId)
    return resultado
  }).immediate()
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

test('cancelamento só ocorre antes do consumo e falha exige registro dos valores reais', t => {
  const f = ambiente(t)
  const cancelada = f.criarOrdem('CANCELADA')
  assert.throws(() => atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, cancelada.ordemId, 'Conferência'), /INVALID_TRANSITION/)
  assert.equal(atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, cancelada.ordemId, 'Cancelada'), 'UPDATED')
  assert.throws(() => atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, cancelada.ordemId, 'Em produção'), /INVALID_TRANSITION/)
  const falha = f.criarOrdem('FALHA')
  atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, falha.ordemId, 'Em produção')
  assert.throws(() => atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, falha.ordemId, 'Falhou'), /INVALID_TRANSITION/)
  assert.throws(() => atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, falha.ordemId, 'Cancelada'), /INVALID_TRANSITION/)
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

test('perda total consome materiais e guarda custo real uma única vez sem criar estoque vendável', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem('PERDA-TOTAL')
  atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, ordem.ordemId, 'Em produção')
  const dados = {
    ordemId: ordem.ordemId, operacaoId: 'perda-total-teste-0001', quantidadeFabricada: 24,
    quantidadeAprovada: 0, quantidadeReprovada: 24, tempoRealHoras: 8.5, horasTrabalhoReal: 1.25,
    falhas: 1, custosAdicionais: 3.75, desperdiciosObservacoes: 'Falha após consumo real',
    filamentos: [{ filamentoId: f.filamentoPreto, gramasReais: 210 }, { filamentoId: f.filamentoBranco, gramasReais: 110 }],
    insumos: [{ insumoId: f.insumoId, quantidadeReal: 24 }],
  }
  const primeiro = concluirOrdemProducaoEstoqueNoBanco(f.db, contexto, dados)
  const movimentos = f.db.prepare('SELECT COUNT(*) AS n FROM movimentos_estoque WHERE ordem_producao_estoque_id = ?').get(ordem.ordemId).n
  const saldos = f.db.prepare('SELECT estoque_gramas FROM filamentos WHERE id IN (?, ?) ORDER BY id').all(f.filamentoPreto, f.filamentoBranco)
  const segundo = concluirOrdemProducaoEstoqueNoBanco(f.db, contexto, dados)
  assert.equal(primeiro.loteId, null)
  assert.equal(segundo.resultado, 'UNCHANGED')
  assert.deepEqual(f.db.prepare(`SELECT status, quantidade_aprovada, quantidade_reprovada, tempo_real_horas,
      horas_trabalho_real, custo_total_real, custo_unitario_real FROM ordens_producao_estoque WHERE id = ?`).get(ordem.ordemId), {
    status: 'Falhou', quantidade_aprovada: 0, quantidade_reprovada: 24, tempo_real_horas: 8.5,
    horas_trabalho_real: 1.25, custo_total_real: primeiro.custoTotal, custo_unitario_real: null,
  })
  assert.ok(primeiro.custoTotal > 0)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM lotes_produtos_acabados WHERE ordem_id = ?').get(ordem.ordemId).n, 0)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM movimentos_estoque WHERE ordem_producao_estoque_id = ?').get(ordem.ordemId).n, movimentos)
  assert.deepEqual(f.db.prepare('SELECT estoque_gramas FROM filamentos WHERE id IN (?, ?) ORDER BY id').all(f.filamentoPreto, f.filamentoBranco), saldos)
})

test('interrupção com consumo real pode registrar perda total mesmo sem peça finalizada', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem('INTERROMPIDA')
  atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, ordem.ordemId, 'Em produção')
  const resultado = concluirOrdemProducaoEstoqueNoBanco(f.db, contexto, {
    ordemId: ordem.ordemId, operacaoId: 'interrupcao-total-0001', quantidadeFabricada: 0,
    quantidadeAprovada: 0, quantidadeReprovada: 0, tempoRealHoras: 2, horasTrabalhoReal: 0.5,
    falhas: 1, custosAdicionais: 0, desperdiciosObservacoes: 'Interrompida antes de finalizar uma peça',
    filamentos: [{ filamentoId: f.filamentoPreto, gramasReais: 30 }, { filamentoId: f.filamentoBranco, gramasReais: 10 }],
    insumos: [{ insumoId: f.insumoId, quantidadeReal: 0 }],
  })
  assert.equal(resultado.loteId, null)
  assert.ok(resultado.custoTotal > 0)
  assert.deepEqual(f.db.prepare(`SELECT status, quantidade_fabricada, quantidade_aprovada, quantidade_reprovada
    FROM ordens_producao_estoque WHERE id = ?`).get(ordem.ordemId),
    { status: 'Falhou', quantidade_fabricada: 0, quantidade_aprovada: 0, quantidade_reprovada: 0 })
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM lotes_produtos_acabados WHERE ordem_id = ?').get(ordem.ordemId).n, 0)
})

test('duas reprovações rateiam todo o custo somente entre 22 aprovadas', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem()
  const resultado = f.concluir(ordem.ordemId, { aprovadas: 22, reprovadas: 2 })
  const lote = f.db.prepare('SELECT quantidade_produzida, quantidade_aprovada, quantidade_reprovada, custo_total, custo_unitario FROM lotes_produtos_acabados WHERE ordem_id = ?').get(ordem.ordemId)
  assert.equal(lote.quantidade_produzida, 24)
  assert.equal(lote.quantidade_aprovada, 22)
  assert.equal(lote.quantidade_reprovada, 2)
  assert.equal(lote.custo_unitario, lote.custo_total / 22)
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

test('edição reutiliza reservas liberadas e suporta manter, aumentar, reduzir e alternar modalidade', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); f.concluir(ordem.ordemId)
  const pedido = f.criarPedidoEstoque(4)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)

  const editarQuantidade = quantidade => f.db.transaction(() => {
    f.db.prepare(`UPDATE reservas_produtos_acabados SET liberada_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE pedido_id = ? AND tenant_id = ? AND liberada_em IS NULL`).run(pedido, contexto.tenantId)
    f.db.prepare(`UPDATE pedidos SET quantidade = ?, valor_total_cobrado = ? WHERE id = ? AND tenant_id = ?`)
      .run(quantidade, quantidade * 25, pedido, contexto.tenantId)
    return reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  }).immediate()

  assert.equal(editarQuantidade(4).resultado, 'CREATED')
  assert.equal(editarQuantidade(7).resultado, 'CREATED')
  assert.equal(f.db.prepare(`SELECT COUNT(*) AS n FROM reservas_produtos_acabados
    WHERE pedido_id = ? AND liberada_em IS NULL`).get(pedido).n, 1)
  assert.equal(f.db.prepare(`SELECT quantidade_reservada FROM reservas_produtos_acabados
    WHERE pedido_id = ? AND liberada_em IS NULL`).get(pedido).quantidade_reservada, 7)
  assert.equal(editarQuantidade(2).resultado, 'CREATED')

  f.db.transaction(() => {
    f.db.prepare(`UPDATE reservas_produtos_acabados SET liberada_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE pedido_id = ? AND tenant_id = ?`).run(pedido, contexto.tenantId)
    f.db.prepare(`UPDATE pedidos SET atendimento_tipo = 'Encomenda', custo_produto_acabado_estimado = 0
      WHERE id = ? AND tenant_id = ?`).run(pedido, contexto.tenantId)
  }).immediate()
  assert.equal(consultarSaldoProdutoAcabadoNoBanco(f.db, 1, f.produtoId, f.versaoId).reservado, 0)
  f.db.prepare(`UPDATE pedidos SET atendimento_tipo = 'Estoque', quantidade = 3 WHERE id = ? AND tenant_id = ?`)
    .run(pedido, contexto.tenantId)
  assert.equal(reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido).resultado, 'CREATED')
  assert.equal(f.db.prepare(`SELECT quantidade_reservada FROM reservas_produtos_acabados
    WHERE pedido_id = ? AND liberada_em IS NULL`).get(pedido).quantidade_reservada, 3)

  const produtoAlternativo = Number(f.db.prepare(`INSERT INTO produtos_catalogo
    (tenant_id, usuario_id, codigo, nome, nome_chave) VALUES (1, 1, 'PROD-ALT', 'Produto alternativo', 'produto alternativo')`).run().lastInsertRowid)
  const versaoAlternativa = Number(f.db.prepare(`INSERT INTO produto_versoes
    (produto_id, versao, preco_base_unitario, tempo_impressao_horas_unidade, ativa, unidades_por_placa)
    VALUES (?, 1, 15, 0.1, 1, 10)`).run(produtoAlternativo).lastInsertRowid)
  const ordemAlternativa = criarOrdemProducaoEstoqueNoBanco(f.db, contexto, {
    produtoId: produtoAlternativo, produtoVersaoId: versaoAlternativa, quantidadePlanejada: 10,
    impressoraId: null, dataPrevista: '', identificacaoLote: 'FAB-ALTERNATIVO', quantidadePorPlate: 10,
    execucoesPlanejadas: 1, tempoEstimadoExecucaoHoras: 0, filamentos: [], insumos: [], observacoes: '', arquivosReferencia: '',
  })
  atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, ordemAlternativa.ordemId, 'Em produção')
  atualizarStatusOrdemProducaoEstoqueNoBanco(f.db, contexto, ordemAlternativa.ordemId, 'Conferência')
  concluirOrdemProducaoEstoqueNoBanco(f.db, contexto, {
    ordemId: ordemAlternativa.ordemId, operacaoId: 'conclusao-alternativa-0001', quantidadeFabricada: 10,
    quantidadeAprovada: 10, quantidadeReprovada: 0, tempoRealHoras: 0, horasTrabalhoReal: 0,
    falhas: 0, custosAdicionais: 10, desperdiciosObservacoes: '', filamentos: [], insumos: [],
  })
  f.db.transaction(() => {
    f.db.prepare(`UPDATE reservas_produtos_acabados SET liberada_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE pedido_id = ? AND tenant_id = ? AND liberada_em IS NULL`).run(pedido, contexto.tenantId)
    f.db.prepare(`UPDATE pedidos SET produto_id = ?, produto_versao_id = ?, quantidade = 2
      WHERE id = ? AND tenant_id = ?`).run(produtoAlternativo, versaoAlternativa, pedido, contexto.tenantId)
    reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  }).immediate()
  assert.deepEqual(f.db.prepare(`SELECT l.produto_id, r.quantidade_reservada FROM reservas_produtos_acabados r
    JOIN lotes_produtos_acabados l ON l.id = r.lote_id WHERE r.pedido_id = ? AND r.liberada_em IS NULL`).get(pedido),
    { produto_id: produtoAlternativo, quantidade_reservada: 2 })
})

test('falha ao aumentar reserva durante edição reverte quantidade, custo e reserva anteriores', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); f.concluir(ordem.ordemId)
  const pedido = f.criarPedidoEstoque(4)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  const antes = {
    pedido: f.db.prepare('SELECT quantidade, custo_produto_acabado_estimado FROM pedidos WHERE id = ?').get(pedido),
    reserva: f.db.prepare(`SELECT quantidade_reservada, quantidade_saida, liberada_em FROM reservas_produtos_acabados
      WHERE pedido_id = ?`).get(pedido),
  }
  assert.throws(() => f.db.transaction(() => {
    f.db.prepare(`UPDATE reservas_produtos_acabados SET liberada_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE pedido_id = ? AND tenant_id = ?`).run(pedido, contexto.tenantId)
    f.db.prepare('UPDATE pedidos SET quantidade = 25 WHERE id = ? AND tenant_id = ?').run(pedido, contexto.tenantId)
    reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  }).immediate(), /INSUFFICIENT_FINISHED_STOCK/)
  assert.deepEqual(f.db.prepare('SELECT quantidade, custo_produto_acabado_estimado FROM pedidos WHERE id = ?').get(pedido), antes.pedido)
  assert.deepEqual(f.db.prepare(`SELECT quantidade_reservada, quantidade_saida, liberada_em FROM reservas_produtos_acabados
    WHERE pedido_id = ?`).get(pedido), antes.reserva)
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

test('cancelamento libera só a reserva e não presume devolução de unidade já entregue', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); f.concluir(ordem.ordemId)
  const pedido = f.criarPedidoEstoque(3)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, { pedidoId: pedido, quantidade: 3, operacaoId: 'saida-cancelar-0001' })
  liberarOuDevolverPedidoEstoqueNoBanco(f.db, contexto, pedido, 'cancelar-estoque-0001')
  assert.equal(consultarSaldoProdutoAcabadoNoBanco(f.db, 1, f.produtoId, f.versaoId).disponivel, 21)
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM movimentos_produtos_acabados WHERE pedido_id = ? AND tipo = 'Devolução'").get(pedido).n, 0)
  assert.ok(f.db.prepare('SELECT custo_produto_acabado_real FROM pedidos WHERE id = ?').get(pedido).custo_produto_acabado_real > 0)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM movimentos_estoque WHERE ordem_producao_estoque_id = ?').get(ordem.ordemId).n, 3)
})

test('estorno recompõe a reserva, corrige status e permite nova entrega sem liberar peças a outro pedido', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); f.concluir(ordem.ordemId)
  const pedido = f.criarPedidoEstoque(2)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  const entregaId = Number(f.db.prepare(`INSERT INTO entregas_pedido
    (tenant_id, usuario_id, pedido_id, quantidade, valor_referente, entregue_em)
    VALUES (1, 1, ?, 2, 50, '2026-10-21')`).run(pedido).lastInsertRowid)
  confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, { pedidoId: pedido, quantidade: 2, operacaoId: 'entrega-estoque-0001', entregaId })
  f.db.prepare(`UPDATE pedidos SET status = 'Finalizado', data_conclusao = '2026-10-21T10:00:00Z' WHERE id = ?`).run(pedido)
  assert.equal(estornarEntregaNoTeste(f.db, pedido, entregaId, 'devolucao-estoque-0001').resultado, 'CREATED')
  assert.equal(estornarEntregaNoTeste(f.db, pedido, entregaId, 'devolucao-estoque-0001').resultado, 'UNCHANGED')
  assert.equal(consultarSaldoProdutoAcabadoNoBanco(f.db, 1, f.produtoId, f.versaoId).fisico, 24)
  assert.deepEqual(f.db.prepare('SELECT status, data_conclusao FROM pedidos WHERE id = ?').get(pedido),
    { status: 'Acabamento', data_conclusao: null })
  assert.deepEqual(f.db.prepare(`SELECT quantidade_reservada, quantidade_saida, liberada_em
    FROM reservas_produtos_acabados WHERE pedido_id = ?`).get(pedido),
    { quantidade_reservada: 2, quantidade_saida: 0, liberada_em: null })

  const concorrente = f.criarPedidoEstoque(23)
  assert.throws(() => reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, concorrente), /INSUFFICIENT_FINISHED_STOCK/)
  const novaEntregaId = Number(f.db.prepare(`INSERT INTO entregas_pedido
    (tenant_id, usuario_id, pedido_id, quantidade, valor_referente, entregue_em)
    VALUES (1, 1, ?, 2, 50, '2026-10-22')`).run(pedido).lastInsertRowid)
  assert.equal(confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, {
    pedidoId: pedido, quantidade: 2, operacaoId: 'entrega-estoque-0002', entregaId: novaEntregaId,
  }).resultado, 'CREATED')
  assert.equal(f.db.prepare("SELECT SUM(quantidade) AS n FROM movimentos_produtos_acabados WHERE pedido_id = ? AND tipo = 'Saída'").get(pedido).n, 4)
  assert.equal(f.db.prepare("SELECT SUM(quantidade) AS n FROM movimentos_produtos_acabados WHERE pedido_id = ? AND tipo = 'Devolução'").get(pedido).n, 2)
})

test('cancelamento e estorno em qualquer ordem não devolvem a mesma entrega duas vezes', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); f.concluir(ordem.ordemId)

  const preparar = (quantidade, sufixo) => {
    const pedido = f.criarPedidoEstoque(quantidade)
    reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
    const entregaId = Number(f.db.prepare(`INSERT INTO entregas_pedido
      (tenant_id, usuario_id, pedido_id, quantidade, valor_referente, entregue_em)
      VALUES (1, 1, ?, ?, 50, '2026-10-21')`).run(pedido, quantidade).lastInsertRowid)
    confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, {
      pedidoId: pedido, quantidade, operacaoId: `saida-ordem-${sufixo}`, entregaId,
    })
    return { pedido, entregaId }
  }

  const primeiro = preparar(2, 'cancelar-primeiro')
  liberarOuDevolverPedidoEstoqueNoBanco(f.db, contexto, primeiro.pedido, 'cancelar-primeiro-0001')
  f.db.prepare("UPDATE pedidos SET status = 'Cancelado' WHERE id = ?").run(primeiro.pedido)
  assert.equal(estornarEntregaNoTeste(f.db, primeiro.pedido, primeiro.entregaId, 'estornar-depois-0001').resultado, 'CREATED')
  assert.equal(estornarEntregaNoTeste(f.db, primeiro.pedido, primeiro.entregaId, 'estornar-depois-0002').resultado, 'UNCHANGED')

  const segundo = preparar(3, 'estornar-primeiro')
  assert.equal(estornarEntregaNoTeste(f.db, segundo.pedido, segundo.entregaId, 'estornar-primeiro-0001').resultado, 'CREATED')
  liberarOuDevolverPedidoEstoqueNoBanco(f.db, contexto, segundo.pedido, 'cancelar-depois-0001')
  f.db.prepare("UPDATE pedidos SET status = 'Cancelado' WHERE id = ?").run(segundo.pedido)
  assert.equal(estornarEntregaNoTeste(f.db, segundo.pedido, segundo.entregaId, 'estornar-primeiro-0002').resultado, 'UNCHANGED')

  assert.equal(consultarSaldoProdutoAcabadoNoBanco(f.db, 1, f.produtoId, f.versaoId).disponivel, 24)
  assert.equal(f.db.prepare("SELECT SUM(quantidade) AS n FROM movimentos_produtos_acabados WHERE tipo = 'Devolução'").get().n, 5)
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

test('rateio em centavos entrega o residual e reconcilia o custo ao esgotar o lote', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); const conclusao = f.concluir(ordem.ordemId)
  const lote = f.db.prepare(`SELECT custo_total_centavos, quantidade_aprovada, custo_unitario
    FROM lotes_produtos_acabados WHERE id = ?`).get(conclusao.loteId)
  assert.equal(lote.custo_unitario, lote.custo_total_centavos / 100 / lote.quantidade_aprovada)

  const pedido = f.criarPedidoEstoque(24)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  for (let indice = 1; indice <= 24; indice++) {
    confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, {
      pedidoId: pedido, quantidade: 1, operacaoId: `saida-centavos-${String(indice).padStart(4, '0')}`,
    })
  }
  const saidas = f.db.prepare(`SELECT SUM(custo_total_centavos) AS centavos,
      SUM(custo_total) AS total FROM movimentos_produtos_acabados
    WHERE pedido_id = ? AND tipo = 'Saída'`).get(pedido)
  assert.equal(saidas.centavos, lote.custo_total_centavos)
  assert.equal(Math.round(saidas.total * 100), lote.custo_total_centavos)
  assert.equal(Math.round(f.db.prepare('SELECT custo_produto_acabado_real AS custo FROM pedidos WHERE id = ?').get(pedido).custo * 100), lote.custo_total_centavos)
  assert.equal(consultarSaldoProdutoAcabadoNoBanco(f.db, 1, f.produtoId, f.versaoId).fisico, 0)
})

test('devolução restaura exatamente o custo da saída e perda usa o residual do lote', t => {
  const f = ambiente(t)
  const ordem = f.criarOrdem(); const conclusao = f.concluir(ordem.ordemId)
  const custoInicial = f.db.prepare('SELECT custo_total_centavos AS custo FROM lotes_produtos_acabados WHERE id = ?').get(conclusao.loteId).custo
  ajustarEstoqueProdutoAcabadoNoBanco(f.db, contexto, {
    loteId: conclusao.loteId, tipo: 'Perda', quantidade: 1, motivo: 'Peça avariada', operacaoId: 'perda-centavos-0001',
  })
  const pedido = f.criarPedidoEstoque(23)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  const entregaId = Number(f.db.prepare(`INSERT INTO entregas_pedido
    (tenant_id, usuario_id, pedido_id, quantidade, valor_referente, entregue_em)
    VALUES (1, 1, ?, 5, 50, '2026-10-21')`).run(pedido).lastInsertRowid)
  confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, {
    pedidoId: pedido, quantidade: 5, operacaoId: 'saida-retorno-custo-0001', entregaId,
  })
  const custoSaida = f.db.prepare(`SELECT custo_total_centavos AS custo FROM movimentos_produtos_acabados
    WHERE pedido_id = ? AND entrega_id = ? AND tipo = 'Saída'`).get(pedido, entregaId).custo
  estornarEntregaNoTeste(f.db, pedido, entregaId, 'retorno-custo-0001')
  const custoRetorno = f.db.prepare(`SELECT custo_total_centavos AS custo FROM movimentos_produtos_acabados
    WHERE pedido_id = ? AND entrega_id = ? AND tipo = 'Devolução'`).get(pedido, entregaId).custo
  assert.equal(custoRetorno, custoSaida)
  const saldoCusto = f.db.prepare(`SELECT SUM(CASE tipo WHEN 'Entrada' THEN custo_total_centavos WHEN 'Devolução' THEN custo_total_centavos
      WHEN 'Ajuste entrada' THEN custo_total_centavos ELSE -custo_total_centavos END) AS custo
    FROM movimentos_produtos_acabados WHERE lote_id = ?`).get(conclusao.loteId).custo
  const custoPerda = f.db.prepare(`SELECT custo_total_centavos AS custo FROM movimentos_produtos_acabados
    WHERE lote_id = ? AND tipo = 'Perda'`).get(conclusao.loteId).custo
  assert.equal(saldoCusto + custoPerda, custoInicial)
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

test('estornos concorrentes são serializados e não duplicam devolução, custo ou reserva', t => {
  const diretorio = mkdtempSync(join(tmpdir(), 'salge-estorno-acabados-'))
  const caminho = join(diretorio, 'teste.sqlite')
  const f = ambiente(t, caminho, false)
  const ordem = f.criarOrdem(); f.concluir(ordem.ordemId)
  const pedido = f.criarPedidoEstoque(3)
  reservarProdutosAcabadosParaPedidoNoBanco(f.db, contexto, pedido)
  const entregaId = Number(f.db.prepare(`INSERT INTO entregas_pedido
    (tenant_id, usuario_id, pedido_id, quantidade, valor_referente, entregue_em)
    VALUES (1, 1, ?, 3, 75, '2026-10-21')`).run(pedido).lastInsertRowid)
  confirmarSaidaProdutosAcabadosNoBanco(f.db, contexto, {
    pedidoId: pedido, quantidade: 3, operacaoId: 'saida-concorrente-0001', entregaId,
  })
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
    assert.throws(() => devolverSaidaProdutosAcabadosNoBanco(concorrente, contexto, {
      pedidoId: pedido, entregaId, operacaoId: 'estorno-concorrente-0001',
    }), /database is locked/)
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM movimentos_produtos_acabados WHERE tipo = 'Devolução'").get().n, 0)
  } finally {
    f.db.exec('ROLLBACK')
  }
  assert.equal(devolverSaidaProdutosAcabadosNoBanco(concorrente, contexto, {
    pedidoId: pedido, entregaId, operacaoId: 'estorno-concorrente-0001',
  }).resultado, 'CREATED')
  assert.equal(devolverSaidaProdutosAcabadosNoBanco(f.db, contexto, {
    pedidoId: pedido, entregaId, operacaoId: 'estorno-concorrente-0002',
  }).resultado, 'UNCHANGED')
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM movimentos_produtos_acabados WHERE tipo = 'Devolução'").get().n, 1)
  assert.equal(f.db.prepare('SELECT quantidade_saida FROM reservas_produtos_acabados WHERE pedido_id = ?').get(pedido).quantidade_saida, 0)
  assert.equal(f.db.prepare('SELECT custo_produto_acabado_real FROM pedidos WHERE id = ?').get(pedido).custo_produto_acabado_real, 0)
})

