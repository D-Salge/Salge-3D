import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'
import { getPedidoDetalhes } from '@/app/actions/operacao'
import { exigirSessao } from '@/lib/session'

export const runtime = 'nodejs'

function dataBr(data: string | null) {
  if (!data) return 'Não informada'
  return new Date(`${data.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
}

function numero(valor: number, casas = 2) {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas })
}

function limpar(texto: string) {
  return texto.replace(/\s+/g, ' ').trim()
}

export async function GET(_request: Request, context: RouteContext<'/api/pedidos/[id]/ordem-producao'>) {
  try {
    await exigirSessao()
    const { id } = await context.params
    const pedidoId = Number(id)
    if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) {
      return Response.json({ error: 'Pedido inválido.' }, { status: 400 })
    }
    const pedido = await getPedidoDetalhes(pedidoId)
    if (!pedido) return Response.json({ error: 'Pedido não encontrado.' }, { status: 404 })

    const document = await PDFDocument.create()
    const regular = await document.embedFont(StandardFonts.Helvetica)
    const bold = await document.embedFont(StandardFonts.HelveticaBold)
    const dark = rgb(0.08, 0.09, 0.1)
    const muted = rgb(0.38, 0.39, 0.42)
    const accent = rgb(0.42, 0.52, 0.05)
    let page: PDFPage
    let y = 0

    const novaPagina = () => {
      page = document.addPage([595.28, 841.89])
      y = 790
      page.drawText('SALGE 3D', { x: 42, y, size: 18, font: bold, color: accent })
      page.drawText('ORDEM INTERNA DE PRODUÇÃO', { x: 286, y: y + 2, size: 10, font: bold, color: dark })
      page.drawText(pedido.numero_orcamento, { x: 458, y: y + 2, size: 9, font: regular, color: muted })
      y -= 42
    }
    const garantir = (altura = 20) => {
      if (y - altura < 58) novaPagina()
    }
    const secao = (titulo: string) => {
      garantir(34)
      y -= 8
      page.drawText(titulo.toUpperCase(), { x: 42, y, size: 10, font: bold, color: accent })
      page.drawLine({ start: { x: 42, y: y - 5 }, end: { x: 553, y: y - 5 }, thickness: 0.6, color: rgb(0.82, 0.84, 0.78) })
      y -= 22
    }
    const linha = (rotulo: string, valor: string) => {
      garantir()
      page.drawText(limpar(rotulo).slice(0, 34), { x: 42, y, size: 8.5, font: regular, color: muted })
      page.drawText(limpar(valor).slice(0, 82), { x: 184, y, size: 9, font: regular, color: dark })
      y -= 17
    }
    const item = (texto: string) => {
      garantir()
      page.drawText(`- ${limpar(texto).slice(0, 100)}`, { x: 50, y, size: 8.5, font: regular, color: dark })
      y -= 15
    }

    novaPagina()
    secao('Pedido')
    linha('Projeto', pedido.nome_da_peca)
    linha('Cliente', pedido.cliente_nome)
    linha('Quantidade', `${numero(pedido.quantidade)} unidade(s)`)
    linha('Entrega prevista', dataBr(pedido.data_entrega))
    linha('Tempo estimado', `${numero(pedido.tempo_impressao_horas)} hora(s)`)
    if (pedido.descricao) linha('Descrição', pedido.descricao)

    secao('Perfil técnico fixado no pedido')
    if (pedido.perfil_tecnico) {
      const perfil = pedido.perfil_tecnico
      linha('Versão da ficha', `v${perfil.versao}`)
      linha('Impressora', perfil.impressora_nome || pedido.impressora_nome || 'Definir antes de produzir')
      linha('Bico / camada', `${perfil.diametro_bico_mm ? `${numero(perfil.diametro_bico_mm)} mm` : '—'} / ${perfil.altura_camada_mm ? `${numero(perfil.altura_camada_mm)} mm` : '—'}`)
      linha('Capacidade por placa', perfil.unidades_por_placa ? `${perfil.unidades_por_placa} unidade(s)` : 'Não definida')
      linha('Perfil do fatiador', perfil.perfil_fatiamento || 'Não definido')
      linha('Placa / arquivo padrão', perfil.placa_referencia || 'Não definido')
      if (perfil.observacoes) linha('Observações', perfil.observacoes)
    } else {
      item('Pedido sem ficha técnica vinculada. Conferir o setup manualmente antes de iniciar.')
    }

    secao('Materiais previstos')
    if (pedido.materiais.length === 0 && pedido.insumos.length === 0) item('Nenhum material cadastrado.')
    for (const material of pedido.materiais) {
      item(`${material.nome}: ${numero(material.peso_gasto_gramas)} g`)
    }
    for (const insumo of pedido.insumos) {
      item(`${insumo.nome}: ${numero(insumo.quantidade)} ${insumo.unidade}`)
    }

    secao('Arquivos de produção ativos')
    const arquivosDaVersao = pedido.perfil_tecnico
      ? pedido.arquivos_producao.filter(arquivo => arquivo.produto_versao === pedido.perfil_tecnico?.versao)
      : pedido.arquivos_producao.filter(arquivo => arquivo.ativo)
    const arquivosAtivos = arquivosDaVersao.filter((arquivo, indice, lista) =>
      lista.findIndex(outro => outro.nome_logico === arquivo.nome_logico) === indice)
    if (arquivosAtivos.length === 0) item('Nenhum arquivo ativo armazenado.')
    for (const arquivo of arquivosAtivos) {
      item(`${arquivo.nome_logico} · arquivo v${arquivo.versao}${arquivo.produto_versao ? ` · ficha v${arquivo.produto_versao}` : ''}`)
    }

    secao('Checklist')
    if (pedido.checklist.length === 0) item('Nenhum item de checklist configurado.')
    for (const checklist of pedido.checklist) {
      item(`[${checklist.concluido ? 'x' : ' '}] ${checklist.etapa}: ${checklist.texto}`)
    }

    secao('Apontamento de produção')
    linha('Operador', '____________________________________________')
    linha('Início / fim', '____________________________________________')
    linha('Quantidade aprovada', '____________________________________________')
    linha('Falhas / reimpressões', '____________________________________________')
    linha('Observações', '____________________________________________')

    const bytes = await document.save()
    return new Response(bytes as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ordem-producao-${pedido.numero_orcamento}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Sessão expirada.' }, { status: 401 })
    }
    console.error('[ordem-producao-pdf]', error)
    return Response.json({ error: 'Não foi possível gerar a ordem de produção.' }, { status: 500 })
  }
}
