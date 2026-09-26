const ORDEM = { Critica: 0, Alta: 1, Media: 2 }

export function priorizarPendencias(pendencias, limite = 12) {
  return [...pendencias]
    .sort((a, b) => {
      const prioridade = (ORDEM[a.prioridade] ?? 9) - (ORDEM[b.prioridade] ?? 9)
      if (prioridade !== 0) return prioridade
      return String(a.dataReferencia ?? '9999-12-31').localeCompare(String(b.dataReferencia ?? '9999-12-31'))
    })
    .slice(0, Math.max(0, limite))
}
