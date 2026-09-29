'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { exigirSessao } from '@/lib/session'
import { revalidatePath } from 'next/cache'

type ActionResult = { success: boolean; message: string }

export async function ativarVersaoArquivo(id: number, pedidoId: number): Promise<ActionResult> {
  try {
    const sessao = await exigirSessao()
    if (sessao.perfil === 'visualizador') return { success: false, message: 'Perfil somente leitura.' }
    const arquivo = db.prepare(`SELECT ap.id, ap.produto_id, ap.nome_chave, ap.nome_logico, ap.versao
      FROM arquivos_producao ap
      JOIN pedidos p ON p.id = ? AND p.tenant_id = ap.tenant_id
      WHERE ap.id = ? AND ap.tenant_id = ?
        AND (ap.pedido_id = p.id OR (p.produto_id IS NOT NULL AND ap.produto_id = p.produto_id))`
    ).get(pedidoId, id, sessao.tenantId) as { id: number; produto_id: number | null; nome_chave: string; nome_logico: string; versao: number } | undefined
    if (!arquivo) return { success: false, message: 'Arquivo não encontrado.' }
    db.transaction(() => {
      if (arquivo.produto_id) {
        db.prepare(`UPDATE arquivos_producao SET ativo = 0 WHERE tenant_id = ? AND produto_id = ? AND nome_chave = ?`)
          .run(sessao.tenantId, arquivo.produto_id, arquivo.nome_chave)
      } else {
        db.prepare(`UPDATE arquivos_producao SET ativo = 0 WHERE tenant_id = ? AND pedido_id = ? AND nome_chave = ?`)
          .run(sessao.tenantId, pedidoId, arquivo.nome_chave)
      }
      db.prepare('UPDATE arquivos_producao SET ativo = 1 WHERE id = ? AND tenant_id = ?').run(id, sessao.tenantId)
      registrarAuditoria(db, { tenantId: sessao.tenantId, usuarioId: sessao.usuarioId,
        entidade: 'ArquivoProducao', entidadeId: id, acao: 'ATIVAR_VERSAO',
        descricao: `${arquivo.nome_logico} · v${arquivo.versao}` })
    })()
    revalidatePath(`/pedidos/${pedidoId}`)
    return { success: true, message: `Versão ${arquivo.versao} definida como atual.` }
  } catch (error) {
    console.error('[ativarVersaoArquivo]', error)
    return { success: false, message: 'Não foi possível ativar a versão.' }
  }
}

export async function removerArquivoProducao(id: number, pedidoId: number): Promise<ActionResult> {
  try {
    const sessao = await exigirSessao()
    if (sessao.perfil !== 'admin') return { success: false, message: 'Somente o administrador pode excluir arquivos armazenados.' }
    const arquivo = db.prepare(`SELECT ap.nome_logico, ap.nome_chave, ap.versao, ap.ativo,
        ap.pedido_id, ap.produto_id
      FROM arquivos_producao ap
      JOIN pedidos p ON p.id = ? AND p.tenant_id = ap.tenant_id
      WHERE ap.id = ? AND ap.tenant_id = ?
        AND (ap.pedido_id = p.id OR (p.produto_id IS NOT NULL AND ap.produto_id = p.produto_id))`
    ).get(pedidoId, id, sessao.tenantId) as {
      nome_logico: string; nome_chave: string; versao: number; ativo: number
      pedido_id: number; produto_id: number | null
    } | undefined
    if (!arquivo) return { success: false, message: 'Arquivo não encontrado.' }
    db.transaction(() => {
      db.prepare('DELETE FROM arquivos_producao WHERE id = ? AND tenant_id = ?').run(id, sessao.tenantId)
      if (arquivo.ativo) {
        if (arquivo.produto_id) {
          db.prepare(`UPDATE arquivos_producao SET ativo = 1 WHERE id = (
            SELECT id FROM arquivos_producao
            WHERE tenant_id = ? AND produto_id = ? AND nome_chave = ?
            ORDER BY versao DESC, id DESC LIMIT 1
          )`).run(sessao.tenantId, arquivo.produto_id, arquivo.nome_chave)
        } else {
          db.prepare(`UPDATE arquivos_producao SET ativo = 1 WHERE id = (
            SELECT id FROM arquivos_producao
            WHERE tenant_id = ? AND pedido_id = ? AND nome_chave = ?
            ORDER BY versao DESC, id DESC LIMIT 1
          )`).run(sessao.tenantId, arquivo.pedido_id, arquivo.nome_chave)
        }
      }
      registrarAuditoria(db, { tenantId: sessao.tenantId, usuarioId: sessao.usuarioId,
        entidade: 'ArquivoProducao', entidadeId: id, acao: 'EXCLUIR',
        descricao: `${arquivo.nome_logico} · v${arquivo.versao}` })
    })()
    revalidatePath(`/pedidos/${pedidoId}`)
    return { success: true, message: 'Arquivo removido permanentemente.' }
  } catch (error) {
    console.error('[removerArquivoProducao]', error)
    return { success: false, message: 'Não foi possível remover o arquivo.' }
  }
}

export async function salvarChecklistProduto(data: {
  produtoId: number
  producao: string[]
  qualidade: string[]
}): Promise<ActionResult> {
  try {
    const sessao = await exigirSessao()
    if (sessao.perfil === 'visualizador') return { success: false, message: 'Perfil somente leitura.' }
    const limpar = (itens: string[]) => itens.map((item) => item.trim()).filter(Boolean)
    const producao = limpar(data.producao)
    const qualidade = limpar(data.qualidade)
    const todos = [...producao, ...qualidade]
    if (!Number.isSafeInteger(data.produtoId) || data.produtoId <= 0 || todos.length > 40 || todos.some((item) => item.length > 240)) {
      return { success: false, message: 'Checklist inválido: use até 40 itens de 240 caracteres.' }
    }
    if (new Set(todos.map((item) => item.toLocaleLowerCase('pt-BR'))).size !== todos.length) {
      return { success: false, message: 'Remova itens duplicados do checklist.' }
    }
    const produto = db.prepare('SELECT nome FROM produtos_catalogo WHERE id = ? AND tenant_id = ? AND ativo = 1')
      .get(data.produtoId, sessao.tenantId) as { nome: string } | undefined
    if (!produto) return { success: false, message: 'Produto não encontrado.' }
    db.transaction(() => {
      db.prepare('UPDATE produto_checklist_itens SET ativo = 0 WHERE produto_id = ? AND tenant_id = ?')
        .run(data.produtoId, sessao.tenantId)
      const inserir = db.prepare(`INSERT INTO produto_checklist_itens
        (tenant_id, produto_id, etapa, texto, ordem) VALUES (?, ?, ?, ?, ?)`)
      producao.forEach((texto, indice) => inserir.run(sessao.tenantId, data.produtoId, 'Produção', texto, indice + 1))
      qualidade.forEach((texto, indice) => inserir.run(sessao.tenantId, data.produtoId, 'Qualidade', texto, indice + 1))
      registrarAuditoria(db, { tenantId: sessao.tenantId, usuarioId: sessao.usuarioId,
        entidade: 'ProdutoCatalogo', entidadeId: data.produtoId, acao: 'CHECKLIST',
        descricao: `${produto.nome} · ${todos.length} item(ns)` })
    })()
    revalidatePath('/produtos')
    return { success: true, message: 'Checklist reutilizável atualizado.' }
  } catch (error) {
    console.error('[salvarChecklistProduto]', error)
    return { success: false, message: 'Não foi possível salvar o checklist.' }
  }
}

export async function atualizarChecklistPedido(data: {
  pedidoId: number
  itemId: number
  concluido: boolean
}): Promise<ActionResult> {
  try {
    const sessao = await exigirSessao()
    if (sessao.perfil === 'visualizador') return { success: false, message: 'Perfil somente leitura.' }
    const item = db.prepare(`SELECT pci.id, pci.texto, pci.etapa
      FROM produto_checklist_itens pci JOIN pedidos p ON p.produto_id = pci.produto_id
      WHERE pci.id = ? AND pci.tenant_id = ? AND pci.ativo = 1
        AND p.id = ? AND p.tenant_id = ?`
    ).get(data.itemId, sessao.tenantId, data.pedidoId, sessao.tenantId) as { id: number; texto: string; etapa: string } | undefined
    if (!item) return { success: false, message: 'Item do checklist não encontrado para este pedido.' }
    db.prepare(`INSERT INTO pedido_checklist_respostas
        (tenant_id, pedido_id, checklist_item_id, usuario_id, concluido, concluido_em)
      VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ELSE NULL END)
      ON CONFLICT(pedido_id, checklist_item_id) DO UPDATE SET
        usuario_id = excluded.usuario_id, concluido = excluded.concluido,
        concluido_em = excluded.concluido_em,
        atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`
    ).run(sessao.tenantId, data.pedidoId, data.itemId, sessao.usuarioId,
      data.concluido ? 1 : 0, data.concluido ? 1 : 0)
    revalidatePath(`/pedidos/${data.pedidoId}`)
    return { success: true, message: data.concluido ? `${item.etapa}: item concluído.` : `${item.etapa}: item reaberto.` }
  } catch (error) {
    console.error('[atualizarChecklistPedido]', error)
    return { success: false, message: 'Não foi possível atualizar o checklist.' }
  }
}
