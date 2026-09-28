'use server'

import db from '@/lib/db'
import { criarHashSenha, validarForcaSenha } from '@/lib/password.mjs'
import { exigirPerfil, type PerfilUsuario } from '@/lib/session'
import { registrarAuditoria } from '@/lib/auditoria'
import { revalidatePath } from 'next/cache'

export interface UsuarioSistema {
  id: number
  nome: string
  email: string
  perfil: PerfilUsuario
  ativo: number
  ultimo_acesso_em: string | null
  criado_em: string
}

export async function getUsuarios(): Promise<UsuarioSistema[]> {
  const sessao = await exigirPerfil(['admin'])
  return db.prepare(`
    SELECT id, nome, email, perfil, ativo, ultimo_acesso_em, criado_em
    FROM usuarios WHERE tenant_id = ? ORDER BY ativo DESC, nome
  `).all(sessao.tenantId) as UsuarioSistema[]
}

export async function salvarUsuario(data: {
  id: number | null
  nome: string
  email: string
  perfil: PerfilUsuario
  senha: string
  ativo: boolean
}): Promise<{ success: boolean; message: string }> {
  try {
    const sessao = await exigirPerfil(['admin'])
    const perfis: PerfilUsuario[] = ['admin', 'operador', 'visualizador']
    const email = data.email.trim().toLowerCase()
    if (!data.nome.trim() || data.nome.length > 120) return { success: false, message: 'Informe o nome do usuário.' }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, message: 'Informe um e-mail válido.' }
    if (!perfis.includes(data.perfil)) return { success: false, message: 'Perfil inválido.' }
    if (data.id === sessao.usuarioId && !data.ativo) return { success: false, message: 'Você não pode desativar o próprio acesso.' }
    if (data.id && (!data.ativo || data.perfil !== 'admin')) {
      const atual = db.prepare('SELECT perfil FROM usuarios WHERE id = ? AND tenant_id = ?').get(data.id, sessao.tenantId) as { perfil: PerfilUsuario } | undefined
      const admins = (db.prepare(`SELECT COUNT(*) AS total FROM usuarios WHERE tenant_id = ? AND perfil = 'admin' AND ativo = 1`).get(sessao.tenantId) as { total: number }).total
      if (atual?.perfil === 'admin' && admins <= 1) return { success: false, message: 'O sistema precisa manter pelo menos um administrador ativo.' }
    }
    if (!data.id || data.senha) {
      const erro = validarForcaSenha(data.senha)
      if (erro) return { success: false, message: erro }
    }
    const novoHash = data.senha ? await criarHashSenha(data.senha) : null
    let usuarioId = data.id
    const salvar = db.transaction(() => {
      if (data.id) {
        const result = db.prepare(`
          UPDATE usuarios SET nome = ?, email = ?, perfil = ?, ativo = ?
          WHERE id = ? AND tenant_id = ?
        `).run(data.nome.trim(), email, data.perfil, data.ativo ? 1 : 0, data.id, sessao.tenantId)
        if (result.changes !== 1) throw new Error('NOT_FOUND')
      } else {
        const result = db.prepare(`
          INSERT INTO usuarios (tenant_id, nome, email, senha_hash, perfil, ativo, senha_alterada_em)
          VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(sessao.tenantId, data.nome.trim(), email, novoHash, data.perfil, data.ativo ? 1 : 0)
        usuarioId = Number(result.lastInsertRowid)
      }
      registrarAuditoria(db, {
        tenantId: sessao.tenantId, usuarioId: sessao.usuarioId,
        entidade: 'Usuario', entidadeId: usuarioId, acao: data.id ? 'ATUALIZAR' : 'CRIAR',
        descricao: `${data.nome.trim()} · ${data.perfil} · ${data.ativo ? 'ativo' : 'inativo'}`,
      })
    })
    salvar.immediate()
    if (novoHash && data.id && usuarioId) {
      db.prepare(`UPDATE usuarios SET senha_hash = ?, senha_alterada_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND tenant_id = ?`)
        .run(novoHash, usuarioId, sessao.tenantId)
      db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(usuarioId)
    }
    revalidatePath('/configuracoes/usuarios')
    return { success: true, message: data.id ? 'Usuário atualizado.' : 'Usuário criado.' }
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return { success: false, message: 'Apenas administradores podem gerenciar usuários.' }
    if (error instanceof Error && error.message === 'NOT_FOUND') return { success: false, message: 'Usuário não encontrado.' }
    if (typeof error === 'object' && error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') return { success: false, message: 'Este e-mail já está em uso.' }
    console.error('[salvarUsuario]', error)
    return { success: false, message: 'Não foi possível salvar o usuário.' }
  }
}
