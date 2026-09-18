import type { Metadata } from 'next'
import { getClientesLista } from '@/app/actions/clientes'
import { getFilamentosLista } from '@/app/actions/filamentos'
import { getInsumosLista } from '@/app/actions/insumos'
import { getConfiguracoes } from '@/app/actions/configuracoes'
import { OrcamentoPage } from '@/app/components/OrcamentoPage'
import { getPedidosRecentes } from '@/app/actions/pedidos'
import { TabelaPedidos } from '@/app/components/TabelaPedidos'

export const metadata: Metadata = { title: 'Novo Orçamento - Salge 3D' }

export default async function Page() {
  const [clientes, filamentos, insumos, config, pedidos] = await Promise.all([
    getClientesLista(),
    getFilamentosLista(),
    getInsumosLista(),
    getConfiguracoes(),
    getPedidosRecentes(100),
  ])

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-9 lg:px-10 shrink-0">
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2 text-xs text-white/35">
          <span>Workspace</span><span>/</span><span className="text-white/65">Orçamentos</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[34px]">
          Novo Orçamento
        </h1>
      </div>

      <OrcamentoPage 
        clientes={clientes}
        filamentos={filamentos}
        insumosList={insumos}
        taxaOperacional={config.taxa_operacional}
        custoHoraMaquina={config.custo_hora_maquina}
        tarifaEnergia={config.tarifa_energia_kwh}
        potenciaW={config.potencia_impressora_w}
      />

      <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#15171b] p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="text-sm font-semibold">Gestão de orçamentos</h2>
          <p className="mt-1 text-xs text-white/35">Rascunhos, aprovações, pagamentos e pedidos.</p>
        </div>
        <TabelaPedidos pedidos={pedidos} />
      </div>
    </div>
  )
}
