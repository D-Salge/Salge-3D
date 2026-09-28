'use server'

import db from '@/lib/db'
import { criarHashSenha, hashConfigurado, validarForcaSenha, verificarSenha } from '@/lib/password.mjs'
import { autenticacaoConfigurada, criarSessao, encerrarSessao } from '@/lib/session'
import { redirect } from 'next/navigation'

export interface AuthResult { success: boolean; message: string }

const normalizarEmail = (email: string) => email.trim().toLowerCase()

export async function configurarPrimeiroAcesso(data: {
  nome: string
  email: string
  senha: string
  confirmarSenha: string
}): Promise<AuthResult> {
  try {
    if (autenticacaoConfigurada()) return { success: false, message: 'O acesso inicial já foi configurado.' }
    if (!data.nome.trim() || data.nome.trim().length > 120) return { success: false, message: 'Informe seu nome.' }
    const email = normalizarEmail(data.email)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, message: 'Informe um e-mail válido.' }
    if (data.senha !== data.confirmarSenha) return { success: false, message: 'As senhas não conferem.' }
    const erroSenha = validarForcaSenha(data.senha)
    if (erroSenha) return { success: false, message: erroSenha }
    const hash = await criarHashSenha(data.senha)
    const usuario = db.prepare(`SELECT id, tenant_id FROM usuarios WHERE perfil = 'admin' ORDER BY id LIMIT 1`)
      .get() as { id: number; tenant_id: number } | undefined
    if (!usuario) return { success: false, message: 'Usuário administrador inicial não encontrado.' }
    const configurar = db.transaction(() => {
      db.prepare(`
        UPDATE usuarios SET nome = ?, email = ?, senha_hash = ?, senha_alterada_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ativo = 1
        WHERE id = ?
      `).run(data.nome.trim(), email, hash, usuario.id)
      db.prepare('DELETE FROM sessoes').run()
    })
    configurar.immediate()
    await criarSessao({ id: usuario.id, tenant_id: usuario.tenant_id })
    return { success: true, message: 'Acesso protegido configurado.' }
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { success: false, message: 'Este e-mail já está em uso.' }
    }
    console.error('[configurarPrimeiroAcesso]', error)
    return { success: false, message: 'Não foi possível configurar o acesso.' }
  }
}

export async function entrar(data: { email: string; senha: string }): Promise<AuthResult> {
  try {
    if (!autenticacaoConfigurada()) return { success: false, message: 'Conclua primeiro a configuração inicial.' }
    const email = normalizarEmail(data.email)
    const tentativa = db.prepare('SELECT tentativas, bloqueado_ate FROM tentativas_login WHERE chave = ?').get(email) as { tentativas: number; bloqueado_ate: string | null } | undefined
    if (tentativa?.bloqueado_ate && new Date(tentativa.bloqueado_ate).getTime() > Date.now()) {
      return { success: false, message: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' }
    }
    const usuario = db.prepare(`
      SELECT id, tenant_id, senha_hash FROM usuarios WHERE LOWER(email) = ? AND ativo = 1 LIMIT 1
    `).get(email) as { id: number; tenant_id: number; senha_hash: string } | undefined
    const senhaOk = usuario && hashConfigurado(usuario.senha_hash)
      ? await verificarSenha(data.senha, usuario.senha_hash)
      : false
    if (!usuario || !senhaOk) {
      const total = (tentativa?.tentativas ?? 0) + 1
      const bloqueado = total >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null
      db.prepare(`
        INSERT INTO tentativas_login (chave, tentativas, bloqueado_ate) VALUES (?, ?, ?)
        ON CONFLICT(chave) DO UPDATE SET tentativas = excluded.tentativas,
          bloqueado_ate = excluded.bloqueado_ate, atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      `).run(email, total >= 5 ? 0 : total, bloqueado)
      return { success: false, message: bloqueado ? 'Acesso bloqueado por 15 minutos após cinco tentativas.' : 'E-mail ou senha incorretos.' }
    }
    db.prepare('DELETE FROM tentativas_login WHERE chave = ?').run(email)
    db.prepare(`UPDATE usuarios SET ultimo_acesso_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`).run(usuario.id)
    db.prepare(`DELETE FROM sessoes WHERE datetime(expira_em) <= datetime('now')`).run()
    await criarSessao(usuario)
    return { success: true, message: 'Login realizado.' }
  } catch (error) {
    console.error('[entrar]', error)
    return { success: false, message: 'Não foi possível entrar.' }
  }
}

export async function sair() {
  await encerrarSessao()
  redirect('/login')
}
