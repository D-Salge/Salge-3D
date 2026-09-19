import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getPedidoDetalhes } from '@/app/actions/operacao'

export const runtime = 'nodejs'

function moeda(valor: number) {
  return `R$ ${valor.toFixed(2).replace('.', ',')}`
}

function dataBr(data: string | null) {
  if (!data) return 'Não informada'
  return new Date(`${data.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
}

export async function GET(_request: Request, context: RouteContext<'/api/orcamentos/[id]/pdf'>) {
  const { id } = await context.params
  const pedidoId = Number(id)
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) {
    return Response.json({ error: 'Orçamento inválido.' }, { status: 400 })
  }
  const pedido = await getPedidoDetalhes(pedidoId)
  if (!pedido) return Response.json({ error: 'Orçamento não encontrado.' }, { status: 404 })

  const document = await PDFDocument.create()
  const page = document.addPage([595.28, 841.89])
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const dark = rgb(0.08, 0.09, 0.1)
  const accent = rgb(0.42, 0.52, 0.05)
  let y = 790

  page.drawText('SALGE 3D', { x: 46, y, size: 22, font: bold, color: accent })
  page.drawText('Orçamento de impressão 3D', { x: 46, y: y - 24, size: 10, font: regular, color: dark })
  page.drawText(pedido.numero_orcamento, { x: 410, y, size: 11, font: bold, color: dark })
  y -= 70

  const linha = (rotulo: string, valor: string, destaque = false) => {
    page.drawText(rotulo, { x: 46, y, size: 9, font: regular, color: rgb(0.35, 0.35, 0.35) })
    page.drawText(valor, { x: 190, y, size: destaque ? 13 : 10, font: destaque ? bold : regular, color: destaque ? accent : dark })
    y -= destaque ? 25 : 19
  }

  linha('Cliente', pedido.cliente_nome)
  linha('Projeto', pedido.nome_da_peca)
  linha('Data', dataBr(pedido.data_pedido))
  linha('Validade', dataBr(pedido.validade_orcamento))
  linha('Previsão de entrega', dataBr(pedido.data_entrega))
  linha('Pagamento', `${pedido.condicao_pagamento || 'A combinar'} · ${pedido.parcelas}x`)
  y -= 14

  page.drawText('Composição', { x: 46, y, size: 13, font: bold, color: dark })
  y -= 26
  for (const item of pedido.materiais) {
    linha(`${item.nome} (${item.peso_gasto_gramas} g)`, moeda(item.custo_calculado))
  }
  for (const item of pedido.insumos) {
    linha(`${item.nome} (${item.quantidade} ${item.unidade})`, moeda(item.custo_calculado))
  }
  linha('Tempo estimado', `${pedido.tempo_impressao_horas} horas`)
  linha('Embalagem', moeda(pedido.custo_embalagem))
  y -= 10
  linha('VALOR TOTAL', moeda(pedido.valor_total_cobrado), true)

  page.drawLine({ start: { x: 46, y: 90 }, end: { x: 549, y: 90 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  page.drawText('Este documento é um orçamento. A produção começa após a aprovação.', {
    x: 46, y: 70, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4),
  })
  page.drawText('Salge 3D · Peças impressas com precisão.', {
    x: 46, y: 54, size: 8, font: bold, color: accent,
  })

  const bytes = await document.save()
  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pedido.numero_orcamento}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
