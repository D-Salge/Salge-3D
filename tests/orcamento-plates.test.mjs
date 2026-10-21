import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'

import { applyMigrations } from '../lib/migrations.mjs'
import { calcularPrecoPlanilha } from '../lib/orcamento.mjs'
import {
  obterPlatesPedidoNoBanco,
  substituirPlatesPedidoNoBanco,
  validarEDimensionarPlatesAutomaticamente,
  validarEAgruparPlates,
} from '../lib/orcamento-plates.mjs'
import {
  aplicarAlteracaoQuantidade,
  converterPlatesParaTradicional,
  invalidarParciaisIncompativeis,
  resolverAtivacaoModoPlates,
} from '../lib/orcamento-formulario.mjs'

function abrirBanco() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  const schema = readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().toUpperCase().startsWith('PRAGMA'))
    .join('\n')
  db.exec(schema)
  applyMigrations(db)
  return db
}

function fixture() {
  const db = abrirBanco()
  const usuarioId = 1
  const clienteId = Number(db.prepare(`INSERT INTO clientes (tenant_id, usuario_id, nome)
    VALUES (1, ?, 'Cliente plates')`).run(usuarioId).lastInsertRowid)
  const filamentoPreto = Number(db.prepare(`INSERT INTO filamentos
    (tenant_id, usuario_id, material, cor, peso_rolo_gramas, preco_rolo)
    VALUES (1, ?, 'PLA', 'Preto', 1000, 100)`).run(usuarioId).lastInsertRowid)
  const filamentoBranco = Number(db.prepare(`INSERT INTO filamentos
    (tenant_id, usuario_id, material, cor, peso_rolo_gramas, preco_rolo)
    VALUES (1, ?, 'PLA', 'Branco', 1000, 120)`).run(usuarioId).lastInsertRowid)
  const pedidoId = Number(db.prepare(`INSERT INTO pedidos
    (tenant_id, usuario_id, cliente_id, nome_da_peca, tempo_impressao_horas,
     valor_total_cobrado, quantidade, modo_calculo)
    VALUES (1, ?, ?, 'Kit pote e tampa', 4, 100, 23, 'Plates')`)
    .run(usuarioId, clienteId).lastInsertRowid)
  return {
    db, pedidoId, filamentoPreto, filamentoBranco,
    contexto: { tenantId: 1, usuarioId, perfil: 'operador' },
  }
}

const parametrosPreco = {
  tipoPedido: 'B2C lote (4+)', quantidade: 23, potenciaW: 100,
  tarifaEnergiaKwh: 1, custoHoraMaquina: 2, custoInsumos: 0,
  materiaisAvulsosPorUnidade: 0, horasTrabalhoAtivo: 0, valorHoraTrabalho: 25,
  custoEmbalagem: 0, fretePago: 0, setupProjeto: 0, margemPerdas: 0.1,
  taxaVenda: 0.05, fatorB2CPersonalizado: 2, fatorB2BPiloto: 1.8,
  fatorB2BRecorrente: 1.5, pedidoMinimoB2B: 80,
}

const referenciasKit = [
  { nome: 'Potes', quantidade_pecas: 14, capacidade_comercial: 14, repeticoes: 99,
    tempo_execucao_minutos: 1087,
    filamentos: [{ filamento_id: 1, gramas_por_execucao: 334.31 }] },
  { nome: 'Tampas', quantidade_pecas: 14, capacidade_comercial: 14, repeticoes: 99,
    tempo_execucao_minutos: 635,
    filamentos: [{ filamento_id: 1, gramas_por_execucao: 192.41 }] },
]

test('dimensiona o caso real sem confundir peças físicas com kits comerciais', () => {
  const esperados = new Map([
    [1, { execucoes: 2, segundos: Math.round((1087 + 635) * 60 / 14), gramas: (334.31 + 192.41) / 14 }],
    [14, { execucoes: 2, segundos: (1087 + 635) * 60, gramas: 334.31 + 192.41 }],
    [20, { execucoes: 4, segundos: (1087 + 635) * 60 + Math.round(1087 * 60 * 6 / 14) + Math.round(635 * 60 * 6 / 14), gramas: (334.31 + 192.41) * (1 + 6 / 14) }],
    [28, { execucoes: 4, segundos: (1087 + 635) * 60 * 2, gramas: (334.31 + 192.41) * 2 }],
    [30, { execucoes: 6, segundos: (1087 + 635) * 60 * 2 + Math.round(1087 * 60 * 2 / 14) + Math.round(635 * 60 * 2 / 14), gramas: (334.31 + 192.41) * (2 + 2 / 14) }],
    [42, { execucoes: 6, segundos: (1087 + 635) * 60 * 3, gramas: (334.31 + 192.41) * 3 }],
  ])
  for (const [quantidade, esperado] of esperados) {
    const resultado = validarEDimensionarPlatesAutomaticamente(referenciasKit, quantidade)
    assert.equal(resultado.totalExecucoes, esperado.execucoes, `${quantidade} kits`)
    assert.equal(resultado.tempoTotalSegundos, esperado.segundos, `${quantidade} kits`)
    assert.ok(Math.abs(resultado.materiais[0].peso_gasto_gramas - esperado.gramas) < 1e-9)
    assert.equal(resultado.execucoes.some((item) => item.parcial !== null), quantidade % 14 !== 0)
  }
})

test('agrega vários filamentos e o mesmo filamento entre referências', () => {
  const resultado = validarEDimensionarPlatesAutomaticamente([
    { ...referenciasKit[0], filamentos: [
      { filamento_id: 1, gramas_por_execucao: 300 },
      { filamento_id: 2, gramas_por_execucao: 34.31 },
    ] },
    referenciasKit[1],
  ], 20)
  assert.ok(Math.abs(resultado.materiais.find((item) => item.filamento_id === 1).peso_gasto_gramas - 703.4428571428572) < 1e-9)
  assert.ok(Math.abs(resultado.materiais.find((item) => item.filamento_id === 2).peso_gasto_gramas - 49.01428571428571) < 1e-9)
})

test('parcial real substitui somente a estimativa atual e não altera a referência cheia', () => {
  const entrada = [{
    ...referenciasKit[0],
    parcial_quantidade_comercial: 6,
    parcial_tempo_segundos: 25_200,
    filamentos: [{ filamento_id: 1, gramas_por_execucao: 334.31, gramas_parcial: 140 }],
  }]
  const resultado = validarEDimensionarPlatesAutomaticamente(entrada, 20)
  assert.equal(resultado.execucoes[0].parcial.estimada, false)
  assert.equal(resultado.execucoes[0].parcial.tempo_segundos, 25_200)
  assert.equal(resultado.materiais[0].peso_gasto_gramas, 474.31)
  assert.equal(resultado.plates[0].tempo_execucao_minutos, 1087)
  assert.equal(resultado.plates[0].filamentos[0].gramas_por_execucao, 334.31)
  assert.throws(() => validarEDimensionarPlatesAutomaticamente(entrada, 30), /INVALID_PARTIAL_OVERRIDE/)
  assert.throws(() => validarEDimensionarPlatesAutomaticamente(entrada, 28), /INVALID_PARTIAL_OVERRIDE/)
})

test('recalcula sempre das referências sem acumular escala e não zera tempo positivo', () => {
  const inicial = validarEDimensionarPlatesAutomaticamente(referenciasKit, 14)
  validarEDimensionarPlatesAutomaticamente(referenciasKit, 20)
  validarEDimensionarPlatesAutomaticamente(referenciasKit, 30)
  const retorno = validarEDimensionarPlatesAutomaticamente(referenciasKit, 14)
  assert.deepEqual(retorno.materiais, inicial.materiais)
  assert.equal(retorno.tempoTotalSegundos, inicial.tempoTotalSegundos)
  const minimo = validarEDimensionarPlatesAutomaticamente([{
    nome: 'Microscópica', quantidade_pecas: 1, capacidade_comercial: 100_000,
    tempo_execucao_minutos: 1, filamentos: [{ filamento_id: 1, gramas_por_execucao: 1 }],
  }], 1)
  assert.equal(minimo.tempoTotalSegundos, 1)
})

test('rejeita capacidades, quantidades, parciais e limites numéricos inválidos', () => {
  assert.throws(() => validarEDimensionarPlatesAutomaticamente(referenciasKit, 0), /INVALID_COMMERCIAL_QUANTITY/)
  assert.throws(() => validarEDimensionarPlatesAutomaticamente([{ ...referenciasKit[0], capacidade_comercial: 0 }], 14), /INVALID_PLATE_COMMERCIAL_CAPACITY/)
  assert.throws(() => validarEDimensionarPlatesAutomaticamente([{ ...referenciasKit[0], capacidade_comercial: 1 }], 100_000), /PLATES_TOTAL_TOO_LARGE/)
  assert.throws(() => validarEDimensionarPlatesAutomaticamente([{
    ...referenciasKit[0], parcial_quantidade_comercial: 6, parcial_tempo_segundos: 10,
  }], 20), /INVALID_PARTIAL_FILAMENT_WEIGHT/)
})

test('uma plate equivalente produz os mesmos totais e preço do modo tradicional', () => {
  const agregado = validarEAgruparPlates([{
    nome: 'Plate única', quantidade_pecas: 23, repeticoes: 1,
    tempo_execucao_minutos: 240,
    filamentos: [{ filamento_id: 7, gramas_por_execucao: 310 }],
  }])
  assert.equal(agregado.tempoTotalHoras, 4)
  assert.deepEqual(agregado.materiais, [{ filamento_id: 7, peso_gasto_gramas: 310 }])
  const tradicional = calcularPrecoPlanilha({
    ...parametrosPreco, tempoImpressaoHoras: 4,
    materiais: [{ pesoGramas: 310, custoPorGrama: 0.1 }],
  })
  const porPlates = calcularPrecoPlanilha({
    ...parametrosPreco, tempoImpressaoHoras: agregado.tempoTotalHoras,
    materiais: agregado.materiais.map((item) => ({ pesoGramas: item.peso_gasto_gramas, custoPorGrama: 0.1 })),
  })
  assert.deepEqual(porPlates, tradicional)
})

test('pote e tampa mantêm 23 kits e agrupam o mesmo filamento sem dupla contagem', () => {
  const agregado = validarEAgruparPlates([
    { nome: 'Potes', quantidade_pecas: 23, repeticoes: 1, tempo_execucao_minutos: 180,
      filamentos: [{ filamento_id: 1, gramas_por_execucao: 220 }] },
    { nome: 'Tampas', quantidade_pecas: 23, repeticoes: 1, tempo_execucao_minutos: 90,
      filamentos: [{ filamento_id: 1, gramas_por_execucao: 80 }] },
  ])
  assert.equal(agregado.totalExecucoes, 2)
  assert.equal(agregado.tempoTotalMinutos, 270)
  assert.deepEqual(agregado.materiais, [{ filamento_id: 1, peso_gasto_gramas: 300 }])
  assert.equal(23, 23, 'a quantidade comercial é entrada independente da soma de peças')
})

test('repetições e plates parciais usam os valores reais sem proporcionalidade', () => {
  const agregado = validarEAgruparPlates([
    { nome: 'Potes', quantidade_pecas: 23, repeticoes: 2, tempo_execucao_minutos: 180,
      filamentos: [{ filamento_id: 1, gramas_por_execucao: 220 }] },
    { nome: 'Tampas', quantidade_pecas: 23, repeticoes: 2, tempo_execucao_minutos: 90,
      filamentos: [{ filamento_id: 2, gramas_por_execucao: 80 }] },
    { nome: 'Potes — parcial', quantidade_pecas: 4, repeticoes: 1, tempo_execucao_minutos: 57,
      filamentos: [{ filamento_id: 1, gramas_por_execucao: 51 }] },
    { nome: 'Tampas — parcial', quantidade_pecas: 4, repeticoes: 1, tempo_execucao_minutos: 31,
      filamentos: [{ filamento_id: 2, gramas_por_execucao: 19 }] },
  ])
  assert.equal(agregado.totalExecucoes, 6)
  assert.equal(agregado.tempoTotalMinutos, 628)
  assert.deepEqual(agregado.materiais, [
    { filamento_id: 1, peso_gasto_gramas: 491 },
    { filamento_id: 2, peso_gasto_gramas: 179 },
  ])
})

test('clique no modo plates ativo não confirma revisão pendente', () => {
  const transicao = resolverAtivacaoModoPlates({
    modoAtual: 'Plates', possuiPlates: true, quantidade: 50, quantidadeRevisada: 23,
  })
  assert.deepEqual(transicao, {
    alterarModo: false, inicializarPlates: false, quantidadeRevisada: 23,
  })
})

test('ida e volta entre modos preserva a revisão pendente quando já existem plates', () => {
  const retorno = resolverAtivacaoModoPlates({
    modoAtual: 'Tradicional', possuiPlates: true, quantidade: 50, quantidadeRevisada: 23,
  })
  assert.deepEqual(retorno, {
    alterarModo: true, inicializarPlates: false, quantidadeRevisada: 23,
  })
})

test('insumos acompanham a quantidade sem multiplicar tempos, gramagens ou repetições das plates', () => {
  const plates = [{ nome: 'Potes', repeticoes: 2, tempoMinutos: 180, gramas: 220 }]
  const resultado = aplicarAlteracaoQuantidade({
    modoCalculo: 'Plates', quantidadeAtual: 23, novaQuantidade: 46, tempoHoras: 4.5,
    materiais: [{ id: 'filamento-1', filamentoId: '1', pesoGasto: 300 }],
    insumos: [{ id: 'insumo-1', insumoId: '1', quantidade: 23 }],
  })
  assert.equal(resultado.quantidade, 46)
  assert.equal(resultado.tempoHoras, 4.5)
  assert.equal(resultado.materiais[0].pesoGasto, 300)
  assert.equal(resultado.insumos[0].quantidade, 46)
  assert.deepEqual(plates, [{ nome: 'Potes', repeticoes: 2, tempoMinutos: 180, gramas: 220 }])
})

test('conversão para tradicional preserva tempo, materiais e preço agregado', () => {
  const agregado = validarEAgruparPlates([
    { nome: 'Potes', quantidade_pecas: 23, repeticoes: 1, tempo_execucao_minutos: 180,
      filamentos: [{ filamento_id: 1, gramas_por_execucao: 220 }] },
    { nome: 'Tampas', quantidade_pecas: 23, repeticoes: 1, tempo_execucao_minutos: 90,
      filamentos: [{ filamento_id: 1, gramas_por_execucao: 80 }] },
  ])
  const conversao = converterPlatesParaTradicional({
    quantidade: 23, agregacao: agregado, assinaturaAnterior: null,
    tempoHoras: 99, materiais: [{ id: 'antigo', filamentoId: '2', pesoGasto: 999 }],
  })
  assert.equal(conversao.tempoHoras, 4.5)
  assert.deepEqual(conversao.materiais, [{
    id: 'plate-total-1', filamentoId: '1', pesoGasto: 300,
  }])
  const porPlates = calcularPrecoPlanilha({
    ...parametrosPreco, tempoImpressaoHoras: agregado.tempoTotalHoras,
    materiais: agregado.materiais.map((item) => ({ pesoGramas: item.peso_gasto_gramas, custoPorGrama: 0.1 })),
  })
  const tradicional = calcularPrecoPlanilha({
    ...parametrosPreco, tempoImpressaoHoras: conversao.tempoHoras,
    materiais: conversao.materiais.map((item) => ({ pesoGramas: item.pesoGasto, custoPorGrama: 0.1 })),
  })
  assert.deepEqual(tradicional, porPlates)
})

test('alternâncias repetidas não duplicam materiais nem aplicam escalonamento cumulativo', () => {
  const agregado = validarEAgruparPlates([{ nome: 'Única', quantidade_pecas: 23, repeticoes: 2,
    tempo_execucao_minutos: 120, filamentos: [{ filamento_id: 1, gramas_por_execucao: 100 }] }])
  const primeira = converterPlatesParaTradicional({
    quantidade: 23, agregacao: agregado, assinaturaAnterior: null,
    tempoHoras: 1, materiais: [],
  })
  const rascunhoTradicional = primeira.materiais.map((item) => ({ ...item, pesoGasto: 210 }))
  const repetida = converterPlatesParaTradicional({
    quantidade: 23, agregacao: agregado, assinaturaAnterior: primeira.assinatura,
    tempoHoras: 4.25, materiais: rascunhoTradicional,
  })
  assert.equal(repetida.sincronizou, false)
  assert.equal(repetida.tempoHoras, 4.25)
  assert.deepEqual(repetida.materiais, rascunhoTradicional)
  assert.equal(repetida.materiais.length, 1)

  const alterada = aplicarAlteracaoQuantidade({
    modoCalculo: 'Plates', quantidadeAtual: 23, novaQuantidade: 46,
    tempoHoras: repetida.tempoHoras, materiais: repetida.materiais,
    insumos: [{ id: 'insumo', insumoId: '1', quantidade: 2 }],
  })
  assert.equal(alterada.tempoHoras, 4.25)
  assert.equal(alterada.materiais[0].pesoGasto, 210)
  assert.equal(alterada.insumos[0].quantidade, 4)
})

test('insumos automáticos usam uma referência estável e parciais reais são invalidadas só quando necessário', () => {
  const inicial = [{ id: 'insumo', insumoId: '1', quantidade: 1,
    quantidadeReferencia: 1, quantidadeComercialReferencia: 14 }]
  const vinte = aplicarAlteracaoQuantidade({
    modoCalculo: 'Plates', quantidadeAtual: 14, novaQuantidade: 20,
    tempoHoras: 1, materiais: [], insumos: inicial,
  })
  const trinta = aplicarAlteracaoQuantidade({
    modoCalculo: 'Plates', quantidadeAtual: 20, novaQuantidade: 30,
    tempoHoras: 1, materiais: [], insumos: vinte.insumos,
  })
  const retorno = aplicarAlteracaoQuantidade({
    modoCalculo: 'Plates', quantidadeAtual: 30, novaQuantidade: 14,
    tempoHoras: 1, materiais: [], insumos: trinta.insumos,
  })
  assert.equal(retorno.insumos[0].quantidade, 1)

  const plate = [{ capacidadeComercial: 14, parcialQuantidadeComercial: 6, tempoParcialSegundos: 100,
    filamentos: [{ gramasParcial: 12 }] }]
  assert.equal(invalidarParciaisIncompativeis(plate, 34).invalidou, false)
  const invalidada = invalidarParciaisIncompativeis(plate, 30)
  assert.equal(invalidada.invalidou, true)
  assert.equal(invalidada.plates[0].parcialQuantidadeComercial, null)
  assert.equal(invalidada.plates[0].tempoParcialSegundos, '')
  assert.equal(invalidada.plates[0].filamentos[0].gramasParcial, '')
})

test('criação, edição, duplicação e reabertura preservam a composição', (t) => {
  const f = fixture()
  t.after(() => f.db.close())
  const entrada = validarEAgruparPlates([
    { nome: 'Potes', quantidade_pecas: 23, repeticoes: 1, tempo_execucao_minutos: 180,
      filamentos: [{ filamento_id: f.filamentoPreto, gramas_por_execucao: 220 }] },
    { nome: 'Tampas', quantidade_pecas: 23, repeticoes: 1, tempo_execucao_minutos: 90,
      filamentos: [{ filamento_id: f.filamentoBranco, gramas_por_execucao: 80 }] },
  ]).plates
  f.db.transaction(() => substituirPlatesPedidoNoBanco(f.db, f.contexto, f.pedidoId, entrada)).immediate()
  assert.deepEqual(obterPlatesPedidoNoBanco(f.db, f.contexto, f.pedidoId).map((plate) => ({
    ordem: plate.ordem,
    nome: plate.nome,
    quantidade_pecas: plate.quantidade_pecas,
    repeticoes: plate.repeticoes,
    tempo_execucao_minutos: plate.tempo_execucao_minutos,
    filamentos: plate.filamentos,
  })), entrada)

  const editada = validarEAgruparPlates([{ ...entrada[0], nome: 'Potes revisados', repeticoes: 2 }]).plates
  f.db.transaction(() => substituirPlatesPedidoNoBanco(f.db, f.contexto, f.pedidoId, editada)).immediate()
  assert.equal(obterPlatesPedidoNoBanco(f.db, f.contexto, f.pedidoId)[0].nome, 'Potes revisados')

  const duplicadoId = Number(f.db.prepare(`INSERT INTO pedidos
    (tenant_id, usuario_id, cliente_id, nome_da_peca, tempo_impressao_horas,
     valor_total_cobrado, quantidade, modo_calculo)
    SELECT tenant_id, usuario_id, cliente_id, nome_da_peca, tempo_impressao_horas,
      valor_total_cobrado, quantidade, modo_calculo FROM pedidos WHERE id = ?`).run(f.pedidoId).lastInsertRowid)
  substituirPlatesPedidoNoBanco(f.db, f.contexto, duplicadoId, obterPlatesPedidoNoBanco(f.db, f.contexto, f.pedidoId))
  assert.equal(obterPlatesPedidoNoBanco(f.db, f.contexto, duplicadoId)[0].nome, 'Potes revisados')
})

test('persistência automática preserva referências e valores reais da parcial ao reabrir e duplicar', (t) => {
  const f = fixture()
  t.after(() => f.db.close())
  const entrada = validarEDimensionarPlatesAutomaticamente([{
    nome: 'Potes', quantidade_pecas: 14, capacidade_comercial: 14,
    tempo_execucao_minutos: 1087, parcial_quantidade_comercial: 6,
    parcial_tempo_segundos: 25_200,
    filamentos: [{ filamento_id: f.filamentoPreto, gramas_por_execucao: 334.31, gramas_parcial: 140 }],
  }], 20).plates
  f.db.prepare(`UPDATE pedidos SET quantidade = 20, plates_dimensionamento = 'Automatico' WHERE id = ?`).run(f.pedidoId)
  substituirPlatesPedidoNoBanco(f.db, f.contexto, f.pedidoId, entrada)
  const reaberta = obterPlatesPedidoNoBanco(f.db, f.contexto, f.pedidoId)
  const semIds = (plates) => plates.map((plate) => {
    const copia = { ...plate }
    delete copia.id
    return copia
  })
  assert.deepEqual(semIds(reaberta), entrada)

  const duplicadoId = Number(f.db.prepare(`INSERT INTO pedidos
    (tenant_id, usuario_id, cliente_id, nome_da_peca, tempo_impressao_horas,
     valor_total_cobrado, quantidade, modo_calculo, plates_dimensionamento)
    SELECT tenant_id, usuario_id, cliente_id, nome_da_peca, tempo_impressao_horas,
      valor_total_cobrado, quantidade, modo_calculo, plates_dimensionamento FROM pedidos WHERE id = ?`)
    .run(f.pedidoId).lastInsertRowid)
  substituirPlatesPedidoNoBanco(f.db, f.contexto, duplicadoId, reaberta)
  assert.deepEqual(semIds(obterPlatesPedidoNoBanco(f.db, f.contexto, duplicadoId)), entrada)
})

test('totais fornecidos pelo cliente não participam da agregação e dados inválidos são rejeitados', () => {
  const payload = {
    tempo_impressao_horas: 0.01,
    materials: [{ filamento_id: 1, peso_gasto_gramas: 0.01 }],
    plates: [{ nome: 'Real', quantidade_pecas: 23, repeticoes: 2, tempo_execucao_minutos: 120,
      filamentos: [{ filamento_id: 1, gramas_por_execucao: 100 }] }],
  }
  const agregado = validarEAgruparPlates(payload.plates)
  assert.equal(agregado.tempoTotalHoras, 4)
  assert.equal(agregado.materiais[0].peso_gasto_gramas, 200)
  assert.throws(() => validarEAgruparPlates([{ ...payload.plates[0], repeticoes: 1.5 }]), /INVALID_PLATE_REPETITIONS/)
  assert.throws(() => validarEAgruparPlates([{ ...payload.plates[0], tempo_execucao_minutos: 0 }]), /INVALID_PLATE_TIME/)
})

test('isolamento entre empresas ocorre antes de substituir dados', (t) => {
  const f = fixture()
  t.after(() => f.db.close())
  const tenant2 = Number(f.db.prepare(`INSERT INTO tenants (nome) VALUES ('Outra empresa')`).run().lastInsertRowid)
  const user2 = Number(f.db.prepare(`INSERT INTO usuarios (tenant_id, nome, email, senha_hash, perfil)
    VALUES (?, 'Outro', 'outro@plates.test', 'x', 'operador')`).run(tenant2).lastInsertRowid)
  const contexto2 = { tenantId: tenant2, usuarioId: user2, perfil: 'operador' }
  const plates = validarEAgruparPlates([{ nome: 'Tentativa', quantidade_pecas: 1, repeticoes: 1,
    tempo_execucao_minutos: 10, filamentos: [{ filamento_id: f.filamentoPreto, gramas_por_execucao: 5 }] }]).plates
  assert.throws(() => substituirPlatesPedidoNoBanco(f.db, contexto2, f.pedidoId, plates), /NOT_FOUND/)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS total FROM pedido_plates').get().total, 0)
})

test('falha no salvamento reverte pedido, plates e materiais; pedidos antigos continuam válidos', (t) => {
  const f = fixture()
  t.after(() => f.db.close())
  f.db.prepare(`INSERT INTO pedido_filamentos
    (pedido_id, filamento_id, peso_gasto_gramas, custo_calculado) VALUES (?, ?, 300, 30)`)
    .run(f.pedidoId, f.filamentoPreto)
  const plates = validarEAgruparPlates([{ nome: 'Inicial', quantidade_pecas: 23, repeticoes: 1,
    tempo_execucao_minutos: 60, filamentos: [{ filamento_id: f.filamentoPreto, gramas_por_execucao: 50 }] }]).plates
  assert.throws(() => f.db.transaction(() => {
    f.db.prepare(`UPDATE pedidos SET quantidade = 50, tempo_impressao_horas = 1 WHERE id = ?`).run(f.pedidoId)
    f.db.prepare('DELETE FROM pedido_filamentos WHERE pedido_id = ?').run(f.pedidoId)
    f.db.prepare(`INSERT INTO pedido_filamentos
      (pedido_id, filamento_id, peso_gasto_gramas, custo_calculado) VALUES (?, ?, 999, 99)`)
      .run(f.pedidoId, f.filamentoPreto)
    substituirPlatesPedidoNoBanco(f.db, f.contexto, f.pedidoId, plates)
    throw new Error('FALHA_FORCADA')
  }).immediate(), /FALHA_FORCADA/)
  assert.deepEqual(f.db.prepare('SELECT quantidade, tempo_impressao_horas FROM pedidos WHERE id = ?').get(f.pedidoId), {
    quantidade: 23, tempo_impressao_horas: 4,
  })
  assert.equal(f.db.prepare('SELECT COUNT(*) AS total FROM pedido_plates').get().total, 0)
  assert.deepEqual(f.db.prepare(`SELECT peso_gasto_gramas, custo_calculado FROM pedido_filamentos
    WHERE pedido_id = ?`).get(f.pedidoId), { peso_gasto_gramas: 300, custo_calculado: 30 })

  const legadoId = Number(f.db.prepare(`INSERT INTO pedidos
    (tenant_id, usuario_id, cliente_id, nome_da_peca, tempo_impressao_horas, valor_total_cobrado)
    SELECT tenant_id, usuario_id, cliente_id, 'Pedido legado', 2, 20 FROM pedidos WHERE id = ?`).run(f.pedidoId).lastInsertRowid)
  assert.deepEqual(f.db.prepare('SELECT modo_calculo, plates_dimensionamento FROM pedidos WHERE id = ?').get(legadoId), {
    modo_calculo: 'Tradicional', plates_dimensionamento: 'Manual',
  })
  assert.deepEqual(obterPlatesPedidoNoBanco(f.db, f.contexto, legadoId), [])
})
