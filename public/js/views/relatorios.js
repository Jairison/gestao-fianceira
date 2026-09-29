import { api, qs } from '../api.js';
import { estado } from '../estado.js';
import {
  barraProgresso, brl, brlCompacto, corVar, criarGrafico, dataBR, esc, fimDoMes, hojeISO, mesAtual,
  mesCurto, pct, somarMes, tagCategoria, vazio,
} from '../util.js';

const PERIODOS = {
  mes: { rotulo: 'Este mês', intervalo: () => [`${mesAtual()}-01`, fimDoMes(mesAtual())] },
  '3m': { rotulo: 'Últimos 3 meses', intervalo: () => [`${somarMes(mesAtual(), -2)}-01`, fimDoMes(mesAtual())] },
  '6m': { rotulo: 'Últimos 6 meses', intervalo: () => [`${somarMes(mesAtual(), -5)}-01`, fimDoMes(mesAtual())] },
  '12m': { rotulo: 'Últimos 12 meses', intervalo: () => [`${somarMes(mesAtual(), -11)}-01`, fimDoMes(mesAtual())] },
  ano: { rotulo: 'Este ano', intervalo: () => [`${hojeISO().slice(0, 4)}-01-01`, `${hojeISO().slice(0, 4)}-12-31`] },
  anoPassado: {
    rotulo: 'Ano passado',
    intervalo: () => { const a = Number(hojeISO().slice(0, 4)) - 1; return [`${a}-01-01`, `${a}-12-31`]; },
  },
  personalizado: { rotulo: 'Personalizado' },
};

const selecao = { periodo: '6m', inicio: '', fim: '' };
let dados = null;

function tabelaCategorias(itens, total, tipo) {
  if (!itens.length) return vazio(tipo === 'despesa' ? '🧾' : '💵', `Nenhuma ${tipo} no período.`);
  return `<ul class="lista">${itens.map((c) => `
    <li style="display:block">
      <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px">
        ${tagCategoria(c.nome, c.cor)}
        <span class="num pequeno"><strong>${brl(c.total)}</strong> <span class="suave">· ${pct(c.total / total)} · ${c.quantidade}x</span></span>
      </div>
      ${barraProgresso(c.total / itens[0].total, c.cor)}
    </li>`).join('')}</ul>`;
}

export async function render(el) {
  if (selecao.periodo !== 'personalizado') [selecao.inicio, selecao.fim] = PERIODOS[selecao.periodo].intervalo();
  dados = await api.get(`/relatorios${qs({ inicio: selecao.inicio, fim: selecao.fim })}`);
  const { totais } = dados;

  el.innerHTML = `
    <div class="barra-ferramentas">
      <select name="periodo">
        ${Object.entries(PERIODOS).map(([k, p]) => `<option value="${k}" ${selecao.periodo === k ? 'selected' : ''}>${p.rotulo}</option>`).join('')}
      </select>
      <input type="date" name="inicio" value="${selecao.inicio}" aria-label="Data inicial">
      <span class="suave">até</span>
      <input type="date" name="fim" value="${selecao.fim}" aria-label="Data final">
      <span class="espaco"></span>
      <a class="btn" href="/api/exportar/csv${qs({ inicio: selecao.inicio, fim: selecao.fim })}">⬇️ Exportar CSV do período</a>
    </div>

    <div class="pilha">
      <div class="grid grid-4">
        <div class="card"><div class="kpi-rotulo">Receitas</div><div class="kpi-valor receita">${brl(totais.receitas)}</div>
          <div class="kpi-sub">Média ${brl(totais.media_mensal_receitas)}/mês</div></div>
        <div class="card"><div class="kpi-rotulo">Despesas</div><div class="kpi-valor despesa">${brl(totais.despesas)}</div>
          <div class="kpi-sub">Média ${brl(totais.media_mensal_despesas)}/mês</div></div>
        <div class="card"><div class="kpi-rotulo">Balanço</div><div class="kpi-valor ${totais.balanco < 0 ? 'despesa' : 'receita'}">${brl(totais.balanco)}</div>
          <div class="kpi-sub">${dataBR(dados.inicio)} a ${dataBR(dados.fim)}</div></div>
        <div class="card"><div class="kpi-rotulo">Taxa de poupança</div>
          <div class="kpi-valor ${totais.taxa_poupanca < 0 ? 'despesa' : ''}">${pct(totais.taxa_poupanca)}</div>
          <div class="kpi-sub">Quanto das receitas sobrou</div></div>
      </div>

      <div class="card">
        <div class="card-cab"><h2>Evolução mensal</h2></div>
        <div class="grafico"><canvas data-grafico="mensal" role="img" aria-label="Receitas, despesas e balanço por mês"></canvas></div>
      </div>

      <div class="grid grid-2">
        <div class="card"><div class="card-cab"><h2 class="despesa">Despesas por categoria</h2></div>
          ${tabelaCategorias(dados.despesas_por_categoria, totais.despesas, 'despesa')}</div>
        <div class="card"><div class="card-cab"><h2 class="receita">Receitas por categoria</h2></div>
          ${tabelaCategorias(dados.receitas_por_categoria, totais.receitas, 'receita')}</div>
      </div>

      <div class="card" style="padding:18px 8px 8px">
        <div class="card-cab" style="padding:0 12px"><h2>10 maiores despesas</h2></div>
        ${dados.maiores_despesas.length ? `<div class="tabela-wrap"><table>
          <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="valor">Valor</th></tr></thead>
          <tbody>${dados.maiores_despesas.map((t) => `
            <tr><td class="num">${dataBR(t.data)}</td><td>${esc(t.descricao)}</td>
            <td>${tagCategoria(t.categoria_nome, t.categoria_cor)}</td><td class="valor despesa">${brl(t.valor)}</td></tr>`).join('')}
          </tbody></table></div>` : vazio('🧾', 'Nenhuma despesa no período.')}
      </div>
    </div>`;

  const barra = el.querySelector('.barra-ferramentas');
  barra.addEventListener('change', (e) => {
    const { name, value } = e.target;
    if (name === 'periodo') {
      selecao.periodo = value;
      if (value === 'personalizado') return;
    } else if (name === 'inicio' || name === 'fim') {
      selecao.periodo = 'personalizado';
      selecao[name] = value;
      if (!selecao.inicio || !selecao.fim) return;
    } else return;
    estado.recarregar();
  });
}

export function depoisDeMontar(el) {
  const mensal = dados.mensal;
  criarGrafico(el.querySelector('[data-grafico="mensal"]'), {
    type: 'bar',
    data: {
      labels: mensal.map((m) => mesCurto(m.mes)),
      datasets: [
        { type: 'line', label: 'Balanço', data: mensal.map((m) => (m.receitas - m.despesas) / 100),
          borderColor: corVar('--texto-suave'), backgroundColor: corVar('--texto-suave'), borderWidth: 2,
          pointRadius: 4, pointHoverRadius: 6, tension: 0.25, order: 0 },
        { label: 'Receitas', data: mensal.map((m) => m.receitas / 100), backgroundColor: corVar('--grafico-receita'), order: 1 },
        { label: 'Despesas', data: mensal.map((m) => m.despesas / 100), backgroundColor: corVar('--grafico-despesa'), order: 1 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      datasets: { bar: { borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22, categoryPercentage: 0.7, barPercentage: 0.9 } },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: (v) => brlCompacto(v) } },
      },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2 } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${brl(Math.round(c.raw * 100))}` } },
      },
    },
  });
}
