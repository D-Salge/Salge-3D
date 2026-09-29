import db from '@/lib/db'
import { exigirSessao } from '@/lib/session'

export const runtime = 'nodejs'

function nomeDownload(nome: string) {
  return nome.replace(/[\r\n"\\/]/g, '_').slice(0, 220)
}

export async function GET(_request: Request, context: RouteContext<'/api/arquivos/[id]'>) {
  try {
    const sessao = await exigirSessao()
    const { id } = await context.params
    const arquivoId = Number(id)
    if (!Number.isSafeInteger(arquivoId) || arquivoId <= 0) return Response.json({ error: 'Arquivo inválido.' }, { status: 400 })
    const arquivo = db.prepare(`SELECT nome_original, mime_type, tamanho_bytes, conteudo
      FROM arquivos_producao WHERE id = ? AND tenant_id = ?`
    ).get(arquivoId, sessao.tenantId) as { nome_original: string; mime_type: string; tamanho_bytes: number; conteudo: Buffer } | undefined
    if (!arquivo) return Response.json({ error: 'Arquivo não encontrado.' }, { status: 404 })
    return new Response(new Uint8Array(arquivo.conteudo), {
      headers: {
        'Content-Type': arquivo.mime_type,
        'Content-Length': String(arquivo.tamanho_bytes),
        'Content-Disposition': `attachment; filename="${nomeDownload(arquivo.nome_original)}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return Response.json({ error: 'Não autorizado.' }, { status: 401 })
    console.error('[download-arquivo-producao]', error)
    return Response.json({ error: 'Não foi possível baixar o arquivo.' }, { status: 500 })
  }
}
