"use client";

import { useId, useState } from "react";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });

export function DashboardChart({
  dias,
}: {
  dias: Array<{ dia: string; valor: number }>;
}) {
  const [periodo, setPeriodo] = useState(7);
  const gradiente = useId().replaceAll(":", "");
  const pontos = dias.slice(-periodo);
  const total = pontos.reduce((soma, ponto) => soma + ponto.valor, 0);
  const maximo = Math.max(1, ...pontos.map((ponto) => ponto.valor));
  const coords = pontos.map((ponto, i) => ({
    x: (i * 520) / Math.max(1, pontos.length - 1),
    y: 104 - (ponto.valor / maximo) * 96,
  }));
  const linha = coords
    .map((ponto, i) => {
      if (!i) return `M${ponto.x},${ponto.y}`;
      const anterior = coords[i - 1];
      const meio = (anterior.x + ponto.x) / 2;
      return `C${meio},${anterior.y} ${meio},${ponto.y} ${ponto.x},${ponto.y}`;
    })
    .join(" ");
  const labels = pontos.filter(
    (_, i) =>
      i === 0 ||
      i === pontos.length - 1 ||
      i % Math.ceil(pontos.length / 6) === 0,
  );

  return (
    <section
      className="studio-card studio-chart"
      aria-labelledby="recebimentos-title"
    >
      <div className="studio-card-heading">
        <div>
          <h2 id="recebimentos-title">Seu ateliê em números</h2>
          <p>Recebimentos ao longo do período</p>
        </div>
        <select
          aria-label="Período do gráfico"
          value={periodo}
          onChange={(event) => setPeriodo(Number(event.target.value))}
          className="studio-select"
        >
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
        </select>
      </div>
      <div className="studio-chart-total">
        <strong>{moeda(total)}</strong>
        <span>
          <i />
          Recebido
        </span>
      </div>
      <div className="studio-chart-body">
        <div className="studio-chart-axis">
          <span>{moeda(maximo)}</span>
          <span>{moeda(maximo / 2)}</span>
          <span>R$ 0</span>
        </div>
        <svg
          viewBox="0 0 520 110"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Recebimentos nos últimos ${periodo} dias: ${moeda(total)}`}
        >
          <defs>
            <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity=".2" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 8H520 M0 56H520 M0 104H520"
            stroke="var(--border)"
            strokeDasharray="3 5"
            strokeWidth=".7"
          />
          {coords.length > 0 && (
            <>
              <path d={`${linha} L520 110H0Z`} fill={`url(#${gradiente})`} />
              <path
                d={linha}
                stroke="var(--accent)"
                strokeWidth="2"
                fill="none"
              />
              <circle
                cx={coords[coords.length - 1].x}
                cy={coords[coords.length - 1].y}
                r="3"
                fill="var(--card)"
                stroke="var(--accent)"
                strokeWidth="1.5"
              />
            </>
          )}
        </svg>
      </div>
      <div className="studio-chart-labels">
        {labels.map((ponto) => (
          <span key={ponto.dia}>{data(ponto.dia)}</span>
        ))}
      </div>
      {total === 0 && (
        <p className="studio-chart-empty">
          Nenhum recebimento registrado neste período.
        </p>
      )}
      <details className="studio-chart-data">
        <summary>Ver valores por dia</summary>
        <table>
          <caption className="sr-only">
            Recebimentos registrados por dia
          </caption>
          <thead>
            <tr>
              <th>Data</th>
              <th>Recebido</th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((ponto) => (
              <tr key={ponto.dia}>
                <td>{data(ponto.dia)}</td>
                <td>{moeda(ponto.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
