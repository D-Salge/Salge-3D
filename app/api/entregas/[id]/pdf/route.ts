import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getComprovanteEntrega } from '@/app/actions/entregas'

export const runtime = 'nodejs'

function moeda(valor: number) {
  return `R$ ${valor.toFixed(2).replace('.', ',')}`
}

function dataBr(data: string) {
  return new Date(`${data.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
}

export async function GET(_request: Request, context: RouteContext<'/api/entregas/[id]/pdf'>) {
  const { id } = await context.params
  const entrega = await getComprovanteEntrega(Number(id))
  if (!entrega) return Response.json({ error: 'Entrega não encontrada.' }, { status: 404 })

  const documento = await PDFDocument.create()
  const pagina = documento.addPage([595.28, 841.89])
  const regular = await documento.embedFont(StandardFonts.Helvetica)
  const bold = await documento.embedFont(StandardFonts.HelveticaBold)
  const escuro = rgb(0.08, 0.09, 0.1)
  const destaque = rgb(0.42, 0.52, 0.05)
  let y = 790

  pagina.drawText('SALGE 3D', { x: 46, y, size: 22, font: bold, color: destaque })
  pagina.drawText('Comprovante de entrega parcial', { x: 46, y: y - 25, size: 11, font: regular, color: escuro })
  pagina.drawText(entrega.numero_orcamento, { x: 410, y, size: 10, font: bold, color: escuro })
  y -= 78

  const linha = (rotulo: string, valor: string, forte = false) => {
    pagina.drawText(rotulo, { x: 46, y, size: 9, font: regular, color: rgb(0.38, 0.38, 0.38) })
    pagina.drawText(valor, { x: 205, y, size: forte ? 12 : 10, font: forte ? bold : regular, color: forte ? destaque : escuro })
    y -= forte ? 26 : 20
  }

  linha('Cliente', entrega.cliente_nome)
  linha('Pedido', entrega.nome_da_peca)
  linha('Data da entrega', dataBr(entrega.entregue_em))
  y -= 10
  linha('Quantidade desta entrega', `${entrega.quantidade} unidade(s)`, true)
  linha('Total entregue até agora', `${entrega.quantidade_entregue_acumulada} de ${entrega.quantidade_total}`)
  linha('Quantidade ainda pendente', `${entrega.quantidade_restante} unidade(s)`)
  linha('Valor proporcional', moeda(entrega.valor_referente))
  linha('Pagamento nesta entrega', entrega.valor_recebido !== null
    ? `${moeda(entrega.valor_recebido)} · ${entrega.forma_pagamento ?? ''}`
    : 'Não registrado')
  linha('Valor total do pedido', moeda(entrega.valor_total_cobrado))

  if (entrega.observacao) {
    y -= 14
    pagina.drawText('Observação', { x: 46, y, size: 9, font: bold, color: escuro })
    y -= 18
    pagina.drawText(entrega.observacao.slice(0, 100), { x: 46, y, size: 9, font: regular, color: escuro })
  }

  pagina.drawLine({ start: { x: 70, y: 180 }, end: { x: 260, y: 180 }, thickness: 0.6, color: rgb(0.45, 0.45, 0.45) })
  pagina.drawLine({ start: { x: 335, y: 180 }, end: { x: 525, y: 180 }, thickness: 0.6, color: rgb(0.45, 0.45, 0.45) })
  pagina.drawText('Salge 3D', { x: 136, y: 164, size: 8, font: regular, color: escuro })
  pagina.drawText('Cliente', { x: 417, y: 164, size: 8, font: regular, color: escuro })
  pagina.drawText('Este comprovante registra somente a remessa descrita acima; o saldo de unidades permanece vinculado ao pedido.', {
    x: 46, y: 90, size: 7.5, font: regular, color: rgb(0.4, 0.4, 0.4), maxWidth: 500,
  })

  const bytes = await documento.save()
  return new Response(bytes as BodyInit, { headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="entrega-${entrega.numero_orcamento}-${entrega.id}.pdf"`,
    'Cache-Control': 'no-store',
  } })
}
