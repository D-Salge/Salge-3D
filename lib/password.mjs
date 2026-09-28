import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

export function validarForcaSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 8) return 'A senha deve ter pelo menos 8 caracteres.'
  if (senha.length > 128) return 'A senha deve ter no máximo 128 caracteres.'
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return 'Use pelo menos uma letra e um número.'
  return null
}

export async function criarHashSenha(senha) {
  const erro = validarForcaSenha(senha)
  if (erro) throw new Error(erro)
  const salt = randomBytes(16).toString('hex')
  const derivada = await scrypt(senha, salt, 64)
  return `scrypt$${salt}$${Buffer.from(derivada).toString('hex')}`
}

export async function verificarSenha(senha, armazenada) {
  if (typeof armazenada !== 'string' || !armazenada.startsWith('scrypt$')) return false
  const [, salt, hashHex] = armazenada.split('$')
  if (!salt || !/^[a-f0-9]{128}$/i.test(hashHex ?? '')) return false
  const derivada = Buffer.from(await scrypt(senha, salt, 64))
  const esperada = Buffer.from(hashHex, 'hex')
  return derivada.length === esperada.length && timingSafeEqual(derivada, esperada)
}

export function hashConfigurado(valor) {
  return typeof valor === 'string' && /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/i.test(valor)
}
