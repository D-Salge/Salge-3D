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
  const inserirFilamento = db.prepare(`
    INSERT INTO filamentos (
      tenant_id, usuario_id, material, cor, peso_rolo_gramas, preco_rolo, estoque_gramas
    ) VALUES (?, ?, 'PLA', ?, 1000, 100, 1000)
  `)
  const filamentoA = Number(inserirFilamento.run(administradorA.tenant_id, administradorA.id, 'Preto').lastInsertRowid)
  const filamentoB = Number(inserirFilamento.run(tenantB, administradorB, 'Branco').lastInsertRowid)

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
    clienteA,
    clienteB,
    filamentoA,
    filamentoB,
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

function idDaAction(manifesto, nome, arquivoAction = 'portal.ts') {
  const entrada = Object.entries(manifesto.node).find(([, valor]) => {
    const arquivo = valor.filename.replaceAll('\\', '/').replace(/^\.\//, '')
    return valor.exportedName === nome &&
      (arquivo === `app/actions/${arquivoAction}` || arquivo.endsWith(`/app/actions/${arquivoAction}`))
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

async function executarTestesPlates(baseUrl, db, dados, actions) {
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
  const payload = (sobrescritas = {}) => ({
    nome_da_peca: 'Kit por plates', cliente_id: dados.clienteA,
    tempo_impressao_horas: 0.01, quantidade: 23, tipo_pedido: 'B2C lote (4+)',
    materials: [{ filamento_id: dados.filamentoB, peso_gasto_gramas: 0.01 }],
    insumos: [], custo_embalagem: 0, desconto: 0, frete_cobrado: 0, frete_pago: 0,
    materiais_avulsos_por_unidade: 0, horas_trabalho_ativo: 0, setup_projeto: 0,
    margem_perdas: 0.1, modo_calculo: 'Plates', plates_quantidade_revisada: 23,
    plates: [
      { nome: 'Potes', quantidade_pecas: 23, repeticoes: 1, tempo_execucao_minutos: 180,
        filamentos: [{ filamento_id: dados.filamentoA, gramas_por_execucao: 220 }] },
      { nome: 'Tampas', quantidade_pecas: 23, repeticoes: 1, tempo_execucao_minutos: 90,
        filamentos: [{ filamento_id: dados.filamentoA, gramas_por_execucao: 80 }] },
    ],
    ...sobrescritas,
  })
  const contar = () => ({
    pedidos: db.prepare(`SELECT COUNT(*) AS total FROM pedidos WHERE nome_da_peca = 'Kit por plates'`).get().total,
    plates: db.prepare('SELECT COUNT(*) AS total FROM pedido_plates').get().total,
  })

  const antes = contar()
  const anonimo = await chamarAction(actions.criarPedido, [payload()])
  assert.equal(anonimo.status, 200)
  assert.deepEqual(contar(), antes)
  const visualizador = await chamarAction(actions.criarPedido, [payload()], dados.sessoes.visualizadorA)
  assert.equal(visualizador.status, 200)
  assert.deepEqual(contar(), antes)

  const cruzado = await chamarAction(actions.criarPedido, [payload({ cliente_id: dados.clienteB })], dados.sessoes.adminA)
  assert.equal(cruzado.status, 200)
  assert.deepEqual(contar(), antes)

  const criado = await chamarAction(actions.criarPedido, [payload()], dados.sessoes.operadorA)
  assert.equal(criado.status, 200)
  const pedido = db.prepare(`SELECT id, tenant_id, usuario_id, quantidade, tempo_impressao_horas,
    modo_calculo FROM pedidos WHERE nome_da_peca = 'Kit por plates' ORDER BY id DESC LIMIT 1`).get()
  assert.deepEqual({ ...pedido, tempo_impressao_horas: Number(pedido.tempo_impressao_horas.toFixed(2)) }, {
    id: pedido.id, tenant_id: dados.tenantA, usuario_id: dados.operadorA,
    quantidade: 23, tempo_impressao_horas: 4.5, modo_calculo: 'Plates',
  })
  assert.deepEqual(db.prepare(`SELECT filamento_id, peso_gasto_gramas FROM pedido_filamentos
    WHERE pedido_id = ?`).all(pedido.id), [{ filamento_id: dados.filamentoA, peso_gasto_gramas: 300 }])
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM pedido_plates WHERE pedido_id = ?').get(pedido.id).total, 2)
  assert.deepEqual(db.prepare(`SELECT tenant_id, usuario_id FROM auditoria
    WHERE entidade = 'Pedido' AND entidade_id = ? AND acao = 'CRIAR'`).get(pedido.id), {
    tenant_id: dados.tenantA, usuario_id: dados.operadorA,
  })

  const semRevisao = await chamarAction(actions.atualizarOrcamento, [pedido.id, payload({
    quantidade: 50, plates_quantidade_revisada: 23,
  })], dados.sessoes.operadorA)
  assert.equal(semRevisao.status, 200)
  assert.deepEqual(db.prepare('SELECT quantidade, tempo_impressao_horas FROM pedidos WHERE id = ?').get(pedido.id), {
    quantidade: 23, tempo_impressao_horas: 4.5,
  })

  const invalidoAntes = contar()
  const invalido = await chamarAction(actions.criarPedido, [payload({
    plates: [{ nome: 'Inválida', quantidade_pecas: 1, repeticoes: 1, tempo_execucao_minutos: 10,
      filamentos: [{ filamento_id: dados.filamentoB, gramas_por_execucao: 5 }] }],
  })], dados.sessoes.adminA)
  assert.equal(invalido.status, 200)
  assert.deepEqual(contar(), invalidoAntes)

  const editado = await chamarAction(actions.atualizarOrcamento, [pedido.id, payload({
    nome_da_peca: 'Kit por plates editado', quantidade: 50, plates_quantidade_revisada: 50,
    plates: [
      { nome: 'Potes', quantidade_pecas: 23, repeticoes: 2, tempo_execucao_minutos: 180,
        filamentos: [{ filamento_id: dados.filamentoA, gramas_por_execucao: 220 }] },
      { nome: 'Potes — parcial', quantidade_pecas: 4, repeticoes: 1, tempo_execucao_minutos: 57,
        filamentos: [{ filamento_id: dados.filamentoA, gramas_por_execucao: 51 }] },
    ],
  })], dados.sessoes.operadorA)
  assert.equal(editado.status, 200)
  assert.deepEqual(db.prepare('SELECT quantidade, tempo_impressao_horas FROM pedidos WHERE id = ?').get(pedido.id), {
    quantidade: 50, tempo_impressao_horas: 6.95,
  })
  assert.deepEqual(db.prepare('SELECT nome, repeticoes FROM pedido_plates WHERE pedido_id = ? ORDER BY ordem').all(pedido.id), [
    { nome: 'Potes', repeticoes: 2 }, { nome: 'Potes — parcial', repeticoes: 1 },
  ])

  const payloadAutomatico = (sobrescritas = {}) => payload({
    nome_da_peca: 'Kit automático', quantidade: 20,
    tempo_impressao_horas: 0.01,
    materials: [{ filamento_id: dados.filamentoB, peso_gasto_gramas: 0.01 }],
    plates_dimensionamento: 'Automatico', plates_quantidade_revisada: 1,
    plates: [
      { nome: 'Potes', quantidade_pecas: 14, capacidade_comercial: 14, repeticoes: 999,
        tempo_execucao_minutos: 1087,
        filamentos: [{ filamento_id: dados.filamentoA, gramas_por_execucao: 334.31 }] },
      { nome: 'Tampas', quantidade_pecas: 14, capacidade_comercial: 14, repeticoes: 999,
        tempo_execucao_minutos: 635,
        filamentos: [{ filamento_id: dados.filamentoA, gramas_por_execucao: 192.41 }] },
    ],
    ...sobrescritas,
  })
  const automaticosAntes = db.prepare(`SELECT COUNT(*) AS total FROM pedidos
    WHERE nome_da_peca = 'Kit automático'`).get().total
  assert.equal((await chamarAction(actions.criarPedido, [payloadAutomatico()], dados.sessoes.visualizadorA)).status, 200)
  assert.equal((await chamarAction(actions.criarPedido, [payloadAutomatico({ cliente_id: dados.clienteB })], dados.sessoes.adminA)).status, 200)
  assert.equal(db.prepare(`SELECT COUNT(*) AS total FROM pedidos
    WHERE nome_da_peca = 'Kit automático'`).get().total, automaticosAntes)
  const automatico = await chamarAction(actions.criarPedido, [payloadAutomatico()], dados.sessoes.operadorA)
  assert.equal(automatico.status, 200)
  const pedidoAutomatico = db.prepare(`SELECT id, tenant_id, usuario_id, quantidade,
    tempo_impressao_horas, modo_calculo, plates_dimensionamento
    FROM pedidos WHERE nome_da_peca = 'Kit automático'`).get()
  assert.equal(pedidoAutomatico.tenant_id, dados.tenantA)
  assert.equal(pedidoAutomatico.usuario_id, dados.operadorA)
  assert.equal(pedidoAutomatico.quantidade, 20)
  assert.equal(pedidoAutomatico.modo_calculo, 'Plates')
  assert.equal(pedidoAutomatico.plates_dimensionamento, 'Automatico')
  const segundosEsperados = (1087 + 635) * 60 + Math.round(1087 * 60 * 6 / 14) + Math.round(635 * 60 * 6 / 14)
  assert.ok(Math.abs(pedidoAutomatico.tempo_impressao_horas - segundosEsperados / 3600) < 1e-9)
  const materialAutomatico = db.prepare(`SELECT filamento_id, peso_gasto_gramas
    FROM pedido_filamentos WHERE pedido_id = ?`).get(pedidoAutomatico.id)
  assert.equal(materialAutomatico.filamento_id, dados.filamentoA)
  assert.ok(Math.abs(materialAutomatico.peso_gasto_gramas - (334.31 + 192.41) * 20 / 14) < 1e-9)
  assert.deepEqual(db.prepare(`SELECT capacidade_comercial, repeticoes
    FROM pedido_plates WHERE pedido_id = ? ORDER BY ordem`).all(pedidoAutomatico.id), [
    { capacidade_comercial: 14, repeticoes: 1 },
    { capacidade_comercial: 14, repeticoes: 1 },
  ])

  const automaticoTrinta = await chamarAction(actions.atualizarOrcamento, [pedidoAutomatico.id, payloadAutomatico({
    quantidade: 30,
  })], dados.sessoes.operadorA)
  assert.equal(automaticoTrinta.status, 200)
  assert.equal(db.prepare('SELECT quantidade, tempo_impressao_horas FROM pedidos WHERE id = ?')
    .get(pedidoAutomatico.id).tempo_impressao_horas, 61.5)
  assert.deepEqual(db.prepare('SELECT repeticoes FROM pedido_plates WHERE pedido_id = ? ORDER BY ordem')
    .all(pedidoAutomatico.id), [{ repeticoes: 1 }, { repeticoes: 1 }])

  const snapshotAutomatico = () => ({
    pedido: db.prepare(`SELECT quantidade, tempo_impressao_horas, modo_calculo, plates_dimensionamento
      FROM pedidos WHERE id = ?`).get(pedidoAutomatico.id),
    plates: db.prepare(`SELECT ordem, nome, repeticoes, capacidade_comercial,
      parcial_quantidade_comercial, parcial_tempo_segundos
      FROM pedido_plates WHERE pedido_id = ? ORDER BY ordem`).all(pedidoAutomatico.id),
    materiais: db.prepare(`SELECT filamento_id, peso_gasto_gramas
      FROM pedido_filamentos WHERE pedido_id = ? ORDER BY id`).all(pedidoAutomatico.id),
    auditoria: db.prepare(`SELECT COUNT(*) AS total FROM auditoria
      WHERE entidade = 'Pedido' AND entidade_id = ?`).get(pedidoAutomatico.id).total,
  })
  const antesDaTrocaManual = snapshotAutomatico()
  const manualSemRevisao = await chamarAction(actions.atualizarOrcamento, [pedidoAutomatico.id, payloadAutomatico({
    quantidade: 30, plates_dimensionamento: 'Manual', plates_quantidade_revisada: null,
  })], dados.sessoes.operadorA)
  assert.equal(manualSemRevisao.status, 200)
  assert.match(manualSemRevisao.corpo, /Revise as plates para a quantidade comercial informada/)
  assert.deepEqual(snapshotAutomatico(), antesDaTrocaManual)

  const automaticoVinte = await chamarAction(actions.atualizarOrcamento, [pedidoAutomatico.id, payloadAutomatico()], dados.sessoes.operadorA)
  assert.equal(automaticoVinte.status, 200)
  assert.deepEqual(db.prepare('SELECT quantidade, tempo_impressao_horas FROM pedidos WHERE id = ?')
    .get(pedidoAutomatico.id), { quantidade: 20, tempo_impressao_horas: 41 })
  const antesDaParcialInvalida = snapshotAutomatico()
  const referenciaComParcial = (sobrescritasParcial) => ({
    nome: 'Potes', quantidade_pecas: 14, capacidade_comercial: 14, repeticoes: 1,
    tempo_execucao_minutos: 1087, parcial_quantidade_comercial: 6,
    parcial_tempo_segundos: 1,
    filamentos: [{ filamento_id: dados.filamentoA, gramas_por_execucao: 334.31, gramas_parcial: 1 }],
    ...sobrescritasParcial,
  })
  for (const plateInvalida of [
    referenciaComParcial({ parcial_tempo_segundos: null }),
    referenciaComParcial({ filamentos: [{ filamento_id: dados.filamentoA, gramas_por_execucao: 334.31, gramas_parcial: 0 }] }),
  ]) {
    const tentativa = await chamarAction(actions.atualizarOrcamento, [pedidoAutomatico.id, payloadAutomatico({
      plates: [plateInvalida],
    })], dados.sessoes.operadorA)
    assert.equal(tentativa.status, 200)
    assert.match(tentativa.corpo, /Revise as refer.ncias, capacidades, tempos e filamentos das plates/)
    assert.deepEqual(snapshotAutomatico(), antesDaParcialInvalida)
  }

  const totalAntesManipulacao = db.prepare(`SELECT COUNT(*) AS total FROM pedidos
    WHERE nome_da_peca = 'Kit automático inválido'`).get().total
  const manipulado = await chamarAction(actions.criarPedido, [payloadAutomatico({
    nome_da_peca: 'Kit automático inválido',
    plates: [{
      nome: 'Potes', quantidade_pecas: 14, capacidade_comercial: 14, repeticoes: 1,
      tempo_execucao_minutos: 1087, parcial_quantidade_comercial: 2,
      parcial_tempo_segundos: 1,
      filamentos: [{ filamento_id: dados.filamentoA, gramas_por_execucao: 334.31, gramas_parcial: 1 }],
    }],
  })], dados.sessoes.operadorA)
  assert.equal(manipulado.status, 200)
  assert.equal(db.prepare(`SELECT COUNT(*) AS total FROM pedidos
    WHERE nome_da_peca = 'Kit automático inválido'`).get().total, totalAntesManipulacao)
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
    criarPedido: idDaAction(manifesto, 'criarPedido', 'pedidos.ts'),
    atualizarOrcamento: idDaAction(manifesto, 'atualizarOrcamento', 'pedidos.ts'),
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
  await executarTestesPlates(baseUrl, db, dados, actions)
  console.log('OK: autorização, isolamento entre empresas, portal público e orçamento por plates validados por HTTP.')
} finally {
  if (db) db.close()
  await encerrarServidor(servidor)
  if (temporario) await rm(temporario, { recursive: true, force: true })
}
