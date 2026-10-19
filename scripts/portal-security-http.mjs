import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import Database from 'better-sqlite3'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NEXT_BIN = join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
const TOKEN_VALIDO = 'a'.repeat(48)
const TOKEN_EXPIRADO = 'b'.repeat(48)
const TOKEN_REVOGADO = 'c'.repeat(48)
const TOKEN_SEM_VINCULO = 'd'.repeat(48)
const TOKEN_INEXISTENTE = 'e'.repeat(48)

function executarNode(args, cwd, { capturar = false, env = {} } = {}) {
  return new Promise((resolvePromise, reject) => {
    let saida = ''
    const processo = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...env },
      stdio: capturar ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    if (capturar) {
      processo.stdout.on('data', (chunk) => { saida += chunk.toString() })
      processo.stderr.on('data', (chunk) => { saida += chunk.toString() })
    }
    processo.once('error', reject)
    processo.once('exit', (codigo) => {
      if (codigo === 0) resolvePromise({ processo, saida })
      else reject(new Error(`Comando falhou (${codigo}): node ${args.join(' ')}\n${saida}`))
    })
  })
}

async function portaLivre() {
  const servidor = createServer()
  servidor.listen(0, '127.0.0.1')
  await once(servidor, 'listening')
  const endereco = servidor.address()
  assert.ok(endereco && typeof endereco === 'object')
  await new Promise((resolvePromise) => servidor.close(resolvePromise))
  return endereco.port
}

function criarSessao(db, tenantId, usuarioId, marcador) {
  const token = marcador.repeat(64)
  const tokenHash = createHash('sha256').update(token).digest('hex')
  db.prepare(`
    INSERT INTO sessoes (tenant_id, usuario_id, token_hash, expira_em)
    VALUES (?, ?, ?, '2099-12-31T23:59:59Z')
  `).run(tenantId, usuarioId, tokenHash)
  return token
}

function prepararCenarios(db) {
  const administradorA = db.prepare('SELECT id, tenant_id FROM usuarios ORDER BY id LIMIT 1').get()
  assert.ok(administradorA)
  db.prepare(`UPDATE usuarios SET perfil = 'admin', ativo = 1 WHERE id = ?`).run(administradorA.id)

  const tenantB = Number(db.prepare(`INSERT INTO tenants (nome, plano) VALUES ('Empresa B', 'pro')`).run().lastInsertRowid)
  const inserirUsuario = db.prepare(`
    INSERT INTO usuarios (tenant_id, nome, email, senha_hash, perfil)
    VALUES (?, ?, ?, 'scrypt$teste', ?)
  `)
  const operadorA = Number(inserirUsuario.run(administradorA.tenant_id, 'Operador A', 'operador-a@teste.local', 'operador').lastInsertRowid)
  const visualizadorA = Number(inserirUsuario.run(administradorA.tenant_id, 'Visualizador A', 'visualizador-a@teste.local', 'visualizador').lastInsertRowid)
  const administradorB = Number(inserirUsuario.run(tenantB, 'Administrador B', 'admin-b@teste.local', 'admin').lastInsertRowid)

  const inserirCliente = db.prepare(`
    INSERT INTO clientes (tenant_id, usuario_id, nome, origem) VALUES (?, ?, ?, 'Outro')
  `)
  const clienteA = Number(inserirCliente.run(administradorA.tenant_id, administradorA.id, 'Cliente A').lastInsertRowid)
  const clienteB = Number(inserirCliente.run(tenantB, administradorB, 'Cliente B').lastInsertRowid)

  const inserirPedido = db.prepare(`
    INSERT INTO pedidos (
      tenant_id, usuario_id, cliente_id, nome_da_peca, tempo_impressao_horas,
      valor_total_cobrado, numero_orcamento, orcamento_status,
      validade_orcamento, vencimento_em, parcelas, quantidade, preco_unitario
    ) VALUES (?, ?, ?, ?, 1, ?, ?, 'Rascunho', '2099-12-31', '2030-01-10', 2, 2, ?)
  `)
  const novoPedido = (tenantId, usuarioId, clienteId, nome, numero, valor = 120) => Number(
    inserirPedido.run(tenantId, usuarioId, clienteId, nome, valor, numero, valor / 2).lastInsertRowid,
  )
  const pedidoPublico = novoPedido(administradorA.tenant_id, administradorA.id, clienteA, 'Peca Publica', 'ORC-A-001')
  const pedidoOperador = novoPedido(administradorA.tenant_id, operadorA, clienteA, 'Peca Operador', 'ORC-A-002')
  const pedidoAdministrador = novoPedido(administradorA.tenant_id, administradorA.id, clienteA, 'Peca Admin', 'ORC-A-003')
  const pedidoExpirado = novoPedido(administradorA.tenant_id, administradorA.id, clienteA, 'Peca Expirada', 'ORC-A-004')
  const pedidoRevogado = novoPedido(administradorA.tenant_id, administradorA.id, clienteA, 'Peca Revogada', 'ORC-A-005')
  const pedidoB = novoPedido(tenantB, administradorB, clienteB, 'Segredo Empresa B', 'ORC-B-001')

  const inserirLink = db.prepare(`
    INSERT INTO portal_links (tenant_id, usuario_id, pedido_id, token, expira_em, revogado_em)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  inserirLink.run(administradorA.tenant_id, administradorA.id, pedidoPublico, TOKEN_VALIDO, '2099-12-31T23:59:59Z', null)
  inserirLink.run(administradorA.tenant_id, administradorA.id, pedidoExpirado, TOKEN_EXPIRADO, '2000-01-01T00:00:00Z', null)
  inserirLink.run(administradorA.tenant_id, administradorA.id, pedidoRevogado, TOKEN_REVOGADO, '2099-12-31T23:59:59Z', '2026-01-01T00:00:00Z')
  // O esquema aceita FKs sem vínculo composto. A aplicação deve recusar este elo forjado.
  inserirLink.run(tenantB, administradorB, pedidoPublico, TOKEN_SEM_VINCULO, '2099-12-31T23:59:59Z', null)

  return {
    tenantA: administradorA.tenant_id,
    tenantB,
    administradorA: administradorA.id,
    operadorA,
    administradorB,
    pedidoPublico,
    pedidoOperador,
    pedidoAdministrador,
    pedidoB,
    sessoes: {
      adminA: criarSessao(db, administradorA.tenant_id, administradorA.id, '1'),
      operadorA: criarSessao(db, administradorA.tenant_id, operadorA, '2'),
      visualizadorA: criarSessao(db, administradorA.tenant_id, visualizadorA, '3'),
      adminB: criarSessao(db, tenantB, administradorB, '4'),
    },
  }
}

function idDaAction(manifesto, nome) {
  const entrada = Object.entries(manifesto.node).find(([, valor]) => {
    const arquivo = valor.filename.replaceAll('\\', '/').replace(/^\.\//, '')
    return valor.exportedName === nome &&
      (arquivo === 'app/actions/portal.ts' || arquivo.endsWith('/app/actions/portal.ts'))
  })
  assert.ok(entrada, `Server Action ${nome} não encontrada no manifesto`)
  return entrada[0]
}

async function esperarServidor(baseUrl, processo, saidaServidor) {
  const limite = Date.now() + 30_000
  while (Date.now() < limite) {
    if (processo.exitCode !== null) throw new Error(`Servidor encerrou antes de iniciar.\n${saidaServidor()}`)
    try {
      const resposta = await fetch(`${baseUrl}/api/health`)
      if (resposta.ok) return
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150))
  }
  throw new Error(`Servidor não ficou pronto.\n${saidaServidor()}`)
}

async function encerrarServidor(processo) {
  if (!processo || processo.exitCode !== null) return
  const encerrado = once(processo, 'exit').then(() => true)
  processo.kill('SIGTERM')
  const saiu = await Promise.race([
    encerrado,
    new Promise((resolvePromise) => setTimeout(() => resolvePromise(false), 5_000)),
  ])
  if (!saiu && processo.exitCode === null) {
    const forcado = once(processo, 'exit')
    processo.kill('SIGKILL')
    await forcado
  }
}

async function executarTestesHttp(baseUrl, db, dados, actions) {
  const chamarAction = async (id, argumentos, tokenSessao) => {
    const resposta = await fetch(`${baseUrl}/portal/teste-de-autorizacao`, {
      method: 'POST',
      headers: {
        Accept: 'text/x-component',
        'Content-Type': 'text/plain;charset=UTF-8',
        'Next-Action': id,
        ...(tokenSessao ? { Cookie: `salge_session=${tokenSessao}` } : {}),
      },
      body: JSON.stringify(argumentos),
    })
    return { status: resposta.status, corpo: await resposta.text() }
  }
  const efeitosDaEmissao = () => ({
    links: db.prepare('SELECT COUNT(*) AS total FROM portal_links').get().total,
    auditorias: db.prepare('SELECT COUNT(*) AS total FROM auditoria').get().total,
  })

  const efeitosAntes = efeitosDaEmissao()
  const anonimo = await chamarAction(actions.gerar, [dados.pedidoPublico])
  assert.equal(anonimo.status, 200)
  assert.match(anonimo.corpo, /Fa[cç]a login/)
  assert.doesNotMatch(anonimo.corpo, new RegExp(TOKEN_VALIDO))
  assert.deepEqual(efeitosDaEmissao(), efeitosAntes)

  const visualizador = await chamarAction(actions.gerar, [dados.pedidoPublico], dados.sessoes.visualizadorA)
  assert.equal(visualizador.status, 200)
  assert.match(visualizador.corpo, /perfil n[aã]o permite/)
  assert.doesNotMatch(visualizador.corpo, new RegExp(TOKEN_VALIDO))
  assert.deepEqual(efeitosDaEmissao(), efeitosAntes)

  const recuperado = await chamarAction(actions.gerar, [dados.pedidoPublico], dados.sessoes.adminA)
  assert.equal(recuperado.status, 200)
  assert.match(recuperado.corpo, new RegExp(`/portal/${TOKEN_VALIDO}`))
  assert.deepEqual(efeitosDaEmissao(), efeitosAntes)

  const criadoOperador = await chamarAction(actions.gerar, [dados.pedidoOperador], dados.sessoes.operadorA)
  assert.equal(criadoOperador.status, 200)
  assert.match(criadoOperador.corpo, /Link seguro criado/)
  const linkOperador = db.prepare('SELECT * FROM portal_links WHERE pedido_id = ?').get(dados.pedidoOperador)
  assert.equal(linkOperador.tenant_id, dados.tenantA)
  assert.equal(linkOperador.usuario_id, dados.operadorA)
  const auditoriaOperador = db.prepare(`
    SELECT tenant_id, usuario_id FROM auditoria
    WHERE entidade = 'PortalCliente' AND entidade_id = ? AND acao = 'CRIAR_LINK'
  `).get(linkOperador.id)
  assert.deepEqual(auditoriaOperador, { tenant_id: dados.tenantA, usuario_id: dados.operadorA })

  const criadoAdmin = await chamarAction(actions.gerar, [dados.pedidoAdministrador], dados.sessoes.adminA)
  assert.equal(criadoAdmin.status, 200)
  assert.match(criadoAdmin.corpo, /Link seguro criado/)
  const linkAdmin = db.prepare('SELECT tenant_id, usuario_id FROM portal_links WHERE pedido_id = ?').get(dados.pedidoAdministrador)
  assert.deepEqual(linkAdmin, { tenant_id: dados.tenantA, usuario_id: dados.administradorA })

  const linksBAntes = db.prepare('SELECT COUNT(*) AS total FROM portal_links WHERE tenant_id = ?').get(dados.tenantB).total
  const cruzado = await chamarAction(actions.gerar, [dados.pedidoB], dados.sessoes.adminA)
  assert.equal(cruzado.status, 200)
  assert.match(cruzado.corpo, /Pedido n[aã]o encontrado/)
  assert.doesNotMatch(cruzado.corpo, /\/portal\/[a-f0-9]{48}/)
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM portal_links WHERE tenant_id = ?').get(dados.tenantB).total, linksBAntes)

  const proprioB = await chamarAction(actions.gerar, [dados.pedidoB], dados.sessoes.adminB)
  assert.equal(proprioB.status, 200)
  assert.match(proprioB.corpo, /Link seguro criado/)
  const linkB = db.prepare('SELECT tenant_id, usuario_id FROM portal_links WHERE pedido_id = ?').get(dados.pedidoB)
  assert.deepEqual(linkB, { tenant_id: dados.tenantB, usuario_id: dados.administradorB })

  const paginaValida = await fetch(`${baseUrl}/portal/${TOKEN_VALIDO}`)
  assert.equal(paginaValida.status, 200)
  assert.match(await paginaValida.text(), /Peca Publica/)
  assert.ok(db.prepare('SELECT visualizado_em FROM portal_links WHERE token = ?').get(TOKEN_VALIDO).visualizado_em)

  for (const token of [TOKEN_INEXISTENTE, TOKEN_EXPIRADO, TOKEN_REVOGADO, TOKEN_SEM_VINCULO]) {
    const pagina = await fetch(`${baseUrl}/portal/${token}`)
    assert.equal(pagina.status, 404, `token deveria ser recusado: ${token.charAt(0)}`)
    const resposta = await chamarAction(actions.responder, [token, 'Aprovado'])
    assert.equal(resposta.status, 200)
    assert.match(resposta.corpo, /expirou ou foi revogado/)
  }

  const respostaPublica = await chamarAction(actions.responder, [TOKEN_VALIDO, 'Aprovado'])
  assert.equal(respostaPublica.status, 200)
  assert.match(respostaPublica.corpo, /aprovado com sucesso/)
  const linkRespondido = db.prepare('SELECT tenant_id, resposta, respondido_em FROM portal_links WHERE token = ?').get(TOKEN_VALIDO)
  assert.equal(linkRespondido.tenant_id, dados.tenantA)
  assert.equal(linkRespondido.resposta, 'Aprovado')
  assert.ok(linkRespondido.respondido_em)
  assert.equal(db.prepare('SELECT orcamento_status FROM pedidos WHERE id = ? AND tenant_id = ?').get(dados.pedidoPublico, dados.tenantA).orcamento_status, 'Aprovado')
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM parcelas_receber WHERE pedido_id = ? AND tenant_id = ?').get(dados.pedidoPublico, dados.tenantA).total, 2)
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM auditoria WHERE acao = 'RESPOSTA_PORTAL'").get().total, 0)
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM historico_pedidos WHERE evento = 'Resposta pelo portal'").get().total, 0)
}

let temporario
let servidor
let db
try {
  const raizTemporaria = process.env.SALGE_CI_TEMP_ROOT
    ? resolve(process.env.SALGE_CI_TEMP_ROOT)
    : tmpdir()
  await mkdir(raizTemporaria, { recursive: true })
  temporario = await mkdtemp(join(raizTemporaria, 'portal-security-'))
  const caminhoBanco = join(temporario, 'salge3d.sqlite')
  const ambienteTeste = { SALGE_DB_PATH: caminhoBanco }

  console.log(`Banco descartável: ${caminhoBanco}`)
  await executarNode([join(ROOT, 'scripts', 'init-db.mjs'), '--reset'], ROOT, { env: ambienteTeste })
  db = new Database(caminhoBanco)
  db.pragma('foreign_keys = ON')
  const dados = prepararCenarios(db)
  db.close()
  db = undefined

  await executarNode([NEXT_BIN, 'build', '--webpack'], ROOT, { env: ambienteTeste })
  const manifesto = JSON.parse(await readFile(join(ROOT, '.next', 'server', 'server-reference-manifest.json'), 'utf8'))
  const actions = {
    gerar: idDaAction(manifesto, 'gerarLinkPortal'),
    responder: idDaAction(manifesto, 'responderOrcamentoPortal'),
  }

  const porta = await portaLivre()
  let saidaServidor = ''
  servidor = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(porta)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      AUTH_COOKIE_SECURE: 'false',
      ...ambienteTeste,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  servidor.stdout.on('data', (chunk) => { saidaServidor += chunk.toString() })
  servidor.stderr.on('data', (chunk) => { saidaServidor += chunk.toString() })
  const baseUrl = `http://127.0.0.1:${porta}`
  await esperarServidor(baseUrl, servidor, () => saidaServidor)

  db = new Database(caminhoBanco)
  db.pragma('foreign_keys = ON')
  await executarTestesHttp(baseUrl, db, dados, actions)
  console.log('OK: autorização, isolamento entre empresas e portal público validados por HTTP.')
} finally {
  if (db) db.close()
  await encerrarServidor(servidor)
  if (temporario) await rm(temporario, { recursive: true, force: true })
}
