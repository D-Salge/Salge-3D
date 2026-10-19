import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NPM_CLI = process.env.npm_execpath
if (!NPM_CLI) throw new Error('Execute este verificador por meio de npm run ci.')
const raizTemporaria = process.env.SALGE_CI_TEMP_ROOT
  ? resolve(process.env.SALGE_CI_TEMP_ROOT)
  : tmpdir()

await mkdir(raizTemporaria, { recursive: true })
const temporario = await mkdtemp(join(raizTemporaria, 'verify-'))
const caminhoBanco = process.env.SALGE_DB_PATH
  ? resolve(process.env.SALGE_DB_PATH)
  : join(temporario, 'build.sqlite')
const ambiente = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  SALGE_CI_TEMP_ROOT: raizTemporaria,
  SALGE_DB_PATH: caminhoBanco,
}

function executar(argumentos) {
  return new Promise((resolvePromise, reject) => {
    console.log(`\n> npm ${argumentos.join(' ')}`)
    const processo = spawn(process.execPath, [NPM_CLI, ...argumentos], {
      cwd: ROOT,
      env: ambiente,
      stdio: 'inherit',
    })
    processo.once('error', reject)
    processo.once('exit', (codigo, sinal) => {
      if (codigo === 0) resolvePromise()
      else reject(new Error(`npm ${argumentos.join(' ')} falhou (${sinal ?? codigo})`))
    })
  })
}

async function limparBuild() {
  await rm(join(ROOT, '.next'), { recursive: true, force: true })
}

try {
  await limparBuild()
  console.log(`Banco descartável do build: ${caminhoBanco}`)
  await executar(['run', 'db:init'])
  await executar(['test'])
  await executar(['run', 'lint'])
  await executar(['run', 'typecheck'])
  await executar(['run', 'build'])

  // O teste HTTP executa outro build e cria seu próprio SQLite. Não permita que
  // ele reutilize os artefatos do build principal.
  await limparBuild()
  await executar(['run', 'test:portal-security'])
} finally {
  await limparBuild()
  await Promise.all([
    rm(caminhoBanco, { force: true }),
    rm(`${caminhoBanco}-wal`, { force: true }),
    rm(`${caminhoBanco}-shm`, { force: true }),
  ])
  await rm(temporario, { recursive: true, force: true })
}
