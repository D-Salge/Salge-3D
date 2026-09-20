import assert from 'node:assert/strict'
import test from 'node:test'

import {
  arredondarMoeda,
  arredondarMoedaParaCima,
  aplicarPisoHistorico,
  calcularOrcamento,
  calcularPrecoPlanilha,
  calcularValorVenda,
  obterFatorPedido,
  normalizarChaveTexto,
} from '../lib/orcamento.mjs'

test('arredonda valores monetários em centavos', () => {
  assert.equal(arredondarMoeda(10.005), 10.01)
})

test('calcula material, máquina, taxa e total', () => {
  const total = calcularOrcamento({
    tempoImpressaoHoras: 2.5,
    custoHoraMaquina: 8.5,
    taxaOperacional: 18,
    materiais: [
      { pesoGramas: 100, custoPorGrama: 0.09 },
      { pesoGramas: 50, custoPorGrama: 0.12 },
    ],
  })

  assert.deepEqual(total, {
    materialCost: 15,
    machineReserve: 21.25,
    operationalFee: 18,
    total: 54.25,
  })
})

test('rejeita números inválidos ou negativos', () => {
  assert.throws(
    () => calcularOrcamento({
      tempoImpressaoHoras: -1,
      custoHoraMaquina: 8.5,
      taxaOperacional: 18,
      materiais: [],
    }),
    /tempoImpressaoHoras/,
  )

  assert.throws(() => arredondarMoeda(Number.NaN), /inválido/)
})

test('preserva o preço unitário comercial ao duplicar e alterar a quantidade', () => {
  assert.equal(calcularValorVenda({
    custoCalculado: 31.5,
    quantidade: 3,
    precoUnitario: 19,
  }), 57)
  assert.equal(calcularValorVenda({
    custoCalculado: 52.5,
    quantidade: 5,
    precoUnitario: 19,
  }), 95)
})

test('permite prévia ainda sem preço automático calculado', () => {
  assert.equal(aplicarPisoHistorico(0, null), 0)
  assert.equal(calcularValorVenda({
    custoCalculado: 0,
    quantidade: 1,
    precoUnitario: null,
  }), 0)
})

test('replica a precificação da planilha para B2C personalizado', () => {
  const resultado = calcularPrecoPlanilha({
    tipoPedido: 'B2C personalizado (1-3)',
    quantidade: 1,
    tempoImpressaoHoras: 1.666,
    potenciaW: 100,
    tarifaEnergiaKwh: 1.1,
    custoHoraMaquina: 2.5,
    materiais: [{ pesoGramas: 34.7, custoPorGrama: 3.71 / 34.7 }],
    custoInsumos: 0,
    materiaisAvulsosPorUnidade: 0,
    horasTrabalhoAtivo: 0,
    valorHoraTrabalho: 25,
    custoEmbalagem: 0,
    fretePago: 0,
    setupProjeto: 0,
    margemPerdas: 0.1,
    taxaVenda: 0,
    fatorB2CPersonalizado: 2,
    fatorB2BPiloto: 1.8,
    fatorB2BRecorrente: 1.5,
    pedidoMinimoB2B: 80,
  })

  assert.equal(resultado.fatorAplicado, 2)
  assert.equal(resultado.custoCompleto, 8.43)
  assert.equal(resultado.precoSugerido, 16.86)
  assert.equal(resultado.precoUnitarioArredondado, 16.86)
  assert.equal(resultado.totalArredondado, 16.86)
  assert.ok(Math.abs(resultado.margemEstimada - 0.5) < 0.001)
})

test('arredonda o preço unitário para cima e aplica taxa de venda', () => {
  assert.equal(arredondarMoedaParaCima(19.0077104), 19.01)
  const resultado = calcularPrecoPlanilha({
    tipoPedido: 'B2C personalizado (1-3)', quantidade: 3,
    tempoImpressaoHoras: 0, potenciaW: 100, tarifaEnergiaKwh: 1.1, custoHoraMaquina: 2.5,
    materiais: [], custoInsumos: 27, materiaisAvulsosPorUnidade: 0,
    horasTrabalhoAtivo: 0, valorHoraTrabalho: 25, custoEmbalagem: 0,
    fretePago: 0, setupProjeto: 0, margemPerdas: 0, taxaVenda: 0.1,
    fatorB2CPersonalizado: 2, fatorB2BPiloto: 1.8, fatorB2BRecorrente: 1.5,
    pedidoMinimoB2B: 80,
  })
  assert.equal(resultado.precoMinimo, 30)
  assert.equal(resultado.precoUnitarioArredondado, 20)
  assert.equal(resultado.totalArredondado, 60)
  assert.equal(resultado.taxasEstimadas, 6)
})

test('usa os mesmos degraus de lote da fórmula da planilha', () => {
  const fatores = { b2cPersonalizado: 2, b2bPiloto: 1.8, b2bRecorrente: 1.5 }
  assert.equal(obterFatorPedido('B2C lote (4+)', 4, fatores), 2)
  assert.equal(obterFatorPedido('B2C lote (4+)', 50, fatores), 1.9)
  assert.equal(obterFatorPedido('B2C lote (4+)', 80, fatores), 1.85)
  assert.equal(obterFatorPedido('B2C lote (4+)', 100, fatores), 1.87)
})

test('protege o preço anterior do cliente sem limitar aumentos', () => {
  assert.equal(aplicarPisoHistorico(16.86, 19), 19)
  assert.equal(aplicarPisoHistorico(21.5, 19), 21.5)
  assert.equal(aplicarPisoHistorico(16.86, null), 16.86)
  assert.equal(normalizarChaveTexto('  Espremedor de PÁSTA   de Dente '), 'espremedor de pasta de dente')
})
