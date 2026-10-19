import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VERIFICADOR = join(ROOT, 'scripts', 'verify-ci.mjs')
const CONTEUDO_EXTERNO = 'banco externo que deve permanecer intacto'

function executarVerificador(env) {
  return new Promise((resolvePromise, reject) => {
    const processo = spawn(process.execPath, [VERIFICADOR], {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    processo.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    processo.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    processo.once('error', reject)
    processo.once('exit', (codigo, sinal) => {
      resolvePromise({ codigo, sinal, stdout, stderr })
    })
  })
}

async function prepararExecucao(falharEm) {
  const pastaTeste = await mkdtemp(join(tmpdir(), 'salge-verify-ci-test-'))
  const pastaExterna = join(pastaTeste, 'externo')
  const raizTemporaria = join(pastaTeste, 'temporarios')
  const bancoExterno = join(pastaExterna, 'salge3d.sqlite')
  const arquivoPreservado = join(raizTemporaria, 'nao-pertence-a-execucao.txt')
  const log = join(pastaTeste, 'processos-filhos.jsonl')
  const npmFalso = join(pastaTeste, 'npm-falso.mjs')

  await Promise.all([
    mkdir(pastaExterna, { recursive: true }),
    mkdir(raizTemporaria, { recursive: true }),
  ])
  await Promise.all([
    writeFile(bancoExterno, CONTEUDO_EXTERNO),
    writeFile(`${bancoExterno}-wal`, `${CONTEUDO_EXTERNO}-wal`),
    writeFile(`${bancoExterno}-shm`, `${CONTEUDO_EXTERNO}-shm`),
    writeFile(arquivoPreservado, 'preservar'),
    writeFile(npmFalso, `
      import { appendFile, mkdir, writeFile } from 'node:fs/promises'
      import { dirname, join } from 'node:path'

      const etapa = process.argv.slice(2).join(' ')
      const banco = process.env.SALGE_DB_PATH
      const temporario = process.env.SALGE_CI_TEMP_ROOT
      await mkdir(dirname(banco), { recursive: true })
      await appendFile(process.env.SALGE_TEST_LOG, JSON.stringify({ etapa, banco, temporario }) + '\\n')
      await writeFile(banco, 'descartavel')
      await writeFile(banco + '-wal', 'descartavel-wal')
      await writeFile(banco + '-shm', 'descartavel-shm')
      await writeFile(join(temporario, 'recurso-da-execucao.tmp'), 'descartavel')
      if (process.env.SALGE_TEST_FALHAR_EM === etapa) process.exit(23)
    `),
  ])

  const resultado = await executarVerificador({
    ...process.env,
    npm_execpath: npmFalso,
    SALGE_CI_TEMP_ROOT: raizTemporaria,
    SALGE_DB_PATH: bancoExterno,
    SALGE_TEST_LOG: log,
    SALGE_TEST_FALHAR_EM: falharEm ?? '',
  })

  return {
    arquivoPreservado,
    bancoExterno,
    log,
    pastaTeste,
    raizTemporaria,
    resultado,
  }
}

async function verificarIsolamento(cenario) {
  assert.equal(await readFile(cenario.bancoExterno, 'utf8'), CONTEUDO_EXTERNO)
  assert.equal(await readFile(`${cenario.bancoExterno}-wal`, 'utf8'), `${CONTEUDO_EXTERNO}-wal`)
  assert.equal(await readFile(`${cenario.bancoExterno}-shm`, 'utf8'), `${CONTEUDO_EXTERNO}-shm`)
  await access(cenario.arquivoPreservado)

  const invocacoes = (await readFile(cenario.log, 'utf8'))
    .trim()
    .split('\n')
    .map((linha) => JSON.parse(linha))
  assert.ok(invocacoes.length > 0)
  const bancos = new Set(invocacoes.map(({ banco }) => banco))
  const temporarios = new Set(invocacoes.map(({ temporario }) => temporario))
  assert.equal(bancos.size, 1)
  assert.equal(temporarios.size, 1)

  const [bancoDescartavel] = bancos
  const [temporarioDaExecucao] = temporarios
  assert.notEqual(resolve(bancoDescartavel), resolve(cenario.bancoExterno))
  assert.equal(resolve(dirname(bancoDescartavel)), resolve(temporarioDaExecucao))
  assert.equal(resolve(dirname(temporarioDaExecucao)), resolve(cenario.raizTemporaria))
  await assert.rejects(access(temporarioDaExecucao))
  assert.deepEqual(await readdir(cenario.raizTemporaria), ['nao-pertence-a-execucao.txt'])
}

test('preserva SALGE_DB_PATH externo e limpa somente seus temporários após falha', async () => {
  const cenario = await prepararExecucao('run lint')
  try {
    assert.equal(cenario.resultado.codigo, 1)
    assert.match(cenario.resultado.stderr, /npm run lint falhou \(23\)/)
    await verificarIsolamento(cenario)
  } finally {
    await rm(cenario.pastaTeste, { recursive: true, force: true })
  }
})

test('preserva SALGE_DB_PATH externo e limpa somente seus temporários após sucesso', async () => {
  const cenario = await prepararExecucao()
  try {
    assert.equal(cenario.resultado.codigo, 0)
    assert.equal(cenario.resultado.sinal, null)
    await verificarIsolamento(cenario)
  } finally {
    await rm(cenario.pastaTeste, { recursive: true, force: true })
  }
})
