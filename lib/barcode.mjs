const CODE39 = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', 'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw',
  'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn',
  'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn', 'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn',
  'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww',
  'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn',
  'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn', 'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw',
  'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
  '$': 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn',
}

export function codigoEstoque(tipo, id) {
  const prefixo = tipo === 'Filamento' ? 'FIL' : 'INS'
  return `${prefixo}-${String(id).padStart(6, '0')}`
}

export function barrasCode39(valor, estreita = 2, larga = 5, altura = 54) {
  const texto = `*${String(valor).toUpperCase()}*`
  if ([...texto].some((char) => !CODE39[char])) throw new Error('CODE39_INVALID')
  const barras = []
  let x = 0
  for (const char of texto) {
    const padrao = CODE39[char]
    for (let i = 0; i < padrao.length; i += 1) {
      const largura = padrao[i] === 'w' ? larga : estreita
      if (i % 2 === 0) barras.push({ x, largura, altura })
      x += largura
    }
    x += estreita
  }
  return { barras, largura: x, altura, texto: String(valor).toUpperCase() }
}
