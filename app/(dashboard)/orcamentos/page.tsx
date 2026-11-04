import type { Metadata } from 'next'
import { StudioPageHeading } from '@/app/components/StudioPageHeading'
import { getClientesLista } from '@/app/actions/clientes'
import { getFilamentosLista } from '@/app/actions/filamentos'
import { getInsumosLista } from '@/app/actions/insumos'
import { getConfiguracoes } from '@/app/actions/configuracoes'
import { OrcamentoPage } from '@/app/components/OrcamentoPage'
import { getPedidosRecentes, getReferenciasPrecos } from '@/app/actions/pedidos'
import { TabelaPedidos } from '@/app/components/TabelaPedidos'
import { getImpressoras } from '@/app/actions/operacao'
import { getModelosOrcamento } from '@/app/actions/modelos-orcamento'
import { ModelosOrcamento } from '@/app/components/ModelosOrcamento'
import { getPendenciasWhatsApp } from '@/app/actions/whatsapp'
import { PendenciasWhatsApp } from '@/app/components/PendenciasWhatsApp'
import { getProdutosAcabadosParaVenda } from '@/app/actions/producao-estoque'

export const metadata: Metadata = { title: 'Novo Orçamento - Salge 3D' }

export default async function Page({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente } = await searchParams
  const clienteInicialId = Number(cliente)
  const [clientes, filamentos, insumos, config, pedidos, impressoras, modelos, referenciasPrecos, pendenciasWhatsApp, produtosAcabados] = await Promise.all([
    getClientesLista(),
    getFilamentosLista(),
    getInsumosLista(),
    getConfiguracoes(),
    getPedidosRecentes(500),
    getImpressoras(),
    getModelosOrcamento(),
    getReferenciasPrecos(),
    getPendenciasWhatsApp(),
    getProdutosAcabadosParaVenda(),
  ])

  return (
    <div className="studio-page mx-auto max-w-[1200px] shrink-0 px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
      <StudioPageHeading eyebrow="Seu próximo projeto" title="Novo orçamento" description="Organize as peças, os materiais e a entrega em um só lugar." />
      <div className="studio-support-tools">
        <details className="studio-disclosure"><summary>Modelos de orçamento <span>{modelos.length}</span></summary><div><ModelosOrcamento modelos={modelos}/></div></details>
        <details className="studio-disclosure"><summary>Acompanhamentos pelo WhatsApp <span>{pendenciasWhatsApp.length}</span></summary><div><PendenciasWhatsApp pendencias={pendenciasWhatsApp}/></div></details>
      </div>

      <OrcamentoPage 
        clientes={clientes}
        filamentos={filamentos}
        insumosList={insumos}
        impressoras={impressoras}
        custoHoraMaquina={config.custo_hora_maquina}
        tarifaEnergia={config.tarifa_energia_kwh}
        potenciaW={config.potencia_impressora_w}
        margemPerdasPadrao={config.margem_perdas_padrao}
        taxaVenda={config.taxa_venda_padrao}
        valorHoraTrabalho={config.valor_hora_trabalho}
        fatorB2CPersonalizado={config.fator_b2c_personalizado}
        fatorB2BPiloto={config.fator_b2b_piloto}
        fatorB2BRecorrente={config.fator_b2b_recorrente}
        pedidoMinimoB2B={config.pedido_minimo_b2b}
        referenciasPrecos={referenciasPrecos}
        produtosAcabados={produtosAcabados}
        clienteInicialId={Number.isSafeInteger(clienteInicialId) && clienteInicialId > 0 ? clienteInicialId : null}
      />

      <div className="mt-10 rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="text-sm font-semibold">Gestão de orçamentos</h2>
          <p className="mt-1 text-xs text-muted-foreground">Rascunhos, aprovações, pagamentos e pedidos.</p>
        </div>
        <TabelaPedidos pedidos={pedidos} />
      </div>
    </div>
  )
}
