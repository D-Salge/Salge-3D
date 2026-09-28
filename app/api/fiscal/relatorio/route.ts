import db from '@/lib/db'
import { getSessaoAtual } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

function csvCampo(valor: unknown) {
  const texto = String(valor ?? '')
  return `"${texto.replaceAll('"', '""')}"`
}

export async function GET(request: NextRequest) {
  const sessao = await getSessaoAtual()
  if (!sessao) return new NextResponse('Não autorizado', { status: 401 })
  const ano = Number(request.nextUrl.searchParams.get('ano') || new Date().getFullYear())
  if (!Number.isSafeInteger(ano) || ano < 2020 || ano > 2100) return new NextResponse('Ano inválido', { status: 400 })
  const itens = db.prepare(`SELECT data_competencia, natureza, origem, descricao, valor,
      nota_fiscal_emitida, numero_documento
    FROM receitas_fiscais WHERE tenant_id = ? AND cancelada_em IS NULL
      AND strftime('%Y', data_competencia) = ? ORDER BY data_competencia, id`
  ).all(sessao.tenantId, String(ano)) as Array<Record<string, string | number | null>>
  const cabecalho = ['Data', 'Natureza', 'Origem', 'Descrição', 'Valor', 'Nota emitida', 'Documento']
  const linhas = itens.map((item) => [
    item.data_competencia, item.natureza, item.origem, item.descricao,
    Number(item.valor).toFixed(2).replace('.', ','), item.nota_fiscal_emitida ? 'Sim' : 'Não', item.numero_documento,
  ].map(csvCampo).join(';'))
  const conteudo = `\uFEFF${cabecalho.map(csvCampo).join(';')}\r\n${linhas.join('\r\n')}`
  return new NextResponse(conteudo, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="relatorio-mei-${ano}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}

