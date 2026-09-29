import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizarNomeArquivo, tipoArquivoProducao, validarArquivoProducao } from '../lib/arquivos-producao.mjs'

test('normaliza o nome lógico e reconhece formatos permitidos', () => {
  assert.equal(normalizarNomeArquivo('Ímã Geladeira – Final'), 'ima-geladeira-final')
  assert.equal(tipoArquivoProducao('modelo.3mf'), 'Modelo 3MF')
  assert.equal(tipoArquivoProducao('programa.exe'), null)
})

test('valida extensão, tamanho e assinatura de arquivo', () => {
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04])
  assert.equal(validarArquivoProducao({ nome: 'peca.3mf', tamanho: 100, primeirosBytes: zip }).valido, true)
  assert.equal(validarArquivoProducao({ nome: 'peca.pdf', tamanho: 100, primeirosBytes: zip }).valido, false)
  assert.equal(validarArquivoProducao({ nome: 'peca.exe', tamanho: 100, primeirosBytes: zip }).valido, false)
})

test('confere a estrutura básica de arquivos STL', () => {
  const binario = Buffer.alloc(84)
  binario.writeUInt32LE(1, 80)
  assert.equal(validarArquivoProducao({ nome: 'peca.stl', tamanho: 134, primeirosBytes: binario }).valido, true)
  assert.equal(validarArquivoProducao({ nome: 'peca.stl', tamanho: 200, primeirosBytes: Buffer.alloc(128) }).valido, false)
  assert.equal(validarArquivoProducao({ nome: 'peca.stl', tamanho: 100, primeirosBytes: Buffer.from('solid peca\nfacet normal') }).valido, true)
})
