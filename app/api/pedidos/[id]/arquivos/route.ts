import { createHash } from 'node:crypto'
import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { exigirSessao } from '@/lib/session'
import { normalizarNomeArquivo, TAMANHO_MAXIMO_ARQUIVO, validarArquivoProducao } from '@/lib/arquivos-producao.mjs'

export const runtime = 'nodejs'

export async function POST(request: Request, context: RouteContext<'/api/pedidos/[id]/arquivos'>) {
  try {
    const sessao = await exigirSessao()
    if (sessao.perfil === 'visualizador') return Response.json({ message: 'Perfil somente leitura.' }, { status: 403 })
    const { id } = await context.params
    const pedidoId = Number(id)
    if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) return Response.json({ message: 'Pedido inválido.' }, { status: 400 })

    const form = await request.formData()
    const arquivo = form.get('arquivo')
    const nomeInformado = String(form.get('nomeLogico') || '').trim()
    const observacoes = String(form.get('observacoes') || '').trim()
    if (!(arquivo instanceof File) || arquivo.size === 0) return Response.json({ message: 'Selecione um arquivo.' }, { status: 400 })
    if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) return Response.json({ message: 'O arquivo deve ter no máximo 25 MB.' }, { status: 413 })
    if (arquivo.name.length > 220 || nomeInformado.length > 160 || observacoes.length > 500) {
      return Response.json({ message: 'Nome ou observações muito longos.' }, { status: 400 })
    }
    const bytes = Buffer.from(await arquivo.arrayBuffer())
    const validacao = validarArquivoProducao({ nome: arquivo.name, tamanho: arquivo.size, primeirosBytes: bytes.subarray(0, 128) })
    if (!validacao.valido) return Response.json({ message: validacao.erro }, { status: 400 })
    const nomeLogico = nomeInformado || arquivo.name.replace(/\.[^.]+$/, '')
    const nomeChave = normalizarNomeArquivo(nomeLogico)
    if (!nomeChave) return Response.json({ message: 'Informe um nome identificável para o arquivo.' }, { status: 400 })
    const sha256 = createHash('sha256').update(bytes).digest('hex')

    const pedido = db.prepare(`SELECT p.id, p.produto_id, COALESCE(p.produto_versao_id,
        (SELECT pv.id FROM produto_versoes pv WHERE pv.produto_id = p.produto_id AND pv.ativa = 1
          ORDER BY pv.versao DESC LIMIT 1)) AS produto_versao_id
      FROM pedidos p WHERE p.id = ? AND p.tenant_id = ?`
    ).get(pedidoId, sessao.tenantId) as { id: number; produto_id: number | null; produto_versao_id: number | null } | undefined
    if (!pedido) return Response.json({ message: 'Pedido não encontrado.' }, { status: 404 })

    let arquivoId = 0
    let versao = 1
    const salvar = db.transaction(() => {
      const duplicado = pedido.produto_id
        ? db.prepare(`SELECT 1 FROM arquivos_producao WHERE tenant_id = ? AND produto_id = ? AND nome_chave = ? AND sha256 = ?`).get(sessao.tenantId, pedido.produto_id, nomeChave, sha256)
        : db.prepare(`SELECT 1 FROM arquivos_producao WHERE tenant_id = ? AND pedido_id = ? AND nome_chave = ? AND sha256 = ?`).get(sessao.tenantId, pedidoId, nomeChave, sha256)
      if (duplicado) throw new Error('DUPLICATE')

      const ultima = pedido.produto_id
        ? db.prepare(`SELECT COALESCE(MAX(versao), 0) AS valor FROM arquivos_producao WHERE tenant_id = ? AND produto_id = ? AND nome_chave = ?`).get(sessao.tenantId, pedido.produto_id, nomeChave) as { valor: number }
        : db.prepare(`SELECT COALESCE(MAX(versao), 0) AS valor FROM arquivos_producao WHERE tenant_id = ? AND pedido_id = ? AND nome_chave = ?`).get(sessao.tenantId, pedidoId, nomeChave) as { valor: number }
      versao = ultima.valor + 1
      if (pedido.produto_id) {
        db.prepare(`UPDATE arquivos_producao SET ativo = 0 WHERE tenant_id = ? AND produto_id = ? AND nome_chave = ? AND ativo = 1`)
          .run(sessao.tenantId, pedido.produto_id, nomeChave)
      } else {
        db.prepare(`UPDATE arquivos_producao SET ativo = 0 WHERE tenant_id = ? AND pedido_id = ? AND nome_chave = ? AND ativo = 1`)
          .run(sessao.tenantId, pedidoId, nomeChave)
      }
      const result = db.prepare(`INSERT INTO arquivos_producao (
          tenant_id, usuario_id, pedido_id, produto_id, produto_versao_id,
          nome_logico, nome_chave, nome_original, extensao, mime_type,
          tamanho_bytes, sha256, versao, observacoes, conteudo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        sessao.tenantId, sessao.usuarioId, pedidoId, pedido.produto_id, pedido.produto_versao_id,
        nomeLogico.slice(0, 160), nomeChave, arquivo.name, validacao.extensao,
        arquivo.type || 'application/octet-stream', arquivo.size, sha256, versao,
        observacoes || null, bytes,
      )
      arquivoId = Number(result.lastInsertRowid)
      db.prepare(`INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, ?, 'Arquivo de produção', ?)`
      ).run(sessao.tenantId, pedidoId, sessao.usuarioId, `${nomeLogico} · versão ${versao}`)
      registrarAuditoria(db, { tenantId: sessao.tenantId, usuarioId: sessao.usuarioId,
        entidade: 'ArquivoProducao', entidadeId: arquivoId, acao: 'UPLOAD',
        descricao: `${nomeLogico} · v${versao}`, detalhes: { pedidoId, sha256, tamanho: arquivo.size } })
    })
    salvar.immediate()
    return Response.json({ success: true, message: `Arquivo salvo como versão ${versao}.`, id: arquivoId })
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'UNAUTHORIZED') return Response.json({ message: 'Sessão expirada.' }, { status: 401 })
    if (code === 'DUPLICATE') return Response.json({ message: 'Esta mesma versão do arquivo já foi armazenada.' }, { status: 409 })
    console.error('[upload-arquivo-producao]', error)
    return Response.json({ message: 'Não foi possível armazenar o arquivo.' }, { status: 500 })
  }
}
