import { api } from '../api.js';
import { estado } from '../estado.js';
import {
  barraProgresso, brl, brlCompacto, corVar, criarGrafico, dataBR, esc, ICONE_CONTA, mesCurto, mesLabel,
  pct, somarMes, vazio,
} from '../util.js';

let dados = null;

function kpi(rotulo, valor, classe = '', sub = '') {
  return `<div class="card">
    <div class="kpi-rotulo">${rotulo}</div>
    <div class="kpi-valor ${classe}">${brl(valor)}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
  </div>`;
}

function blocoPendentes(pendentes, hoje) {
  if (!pendentes.length) return vazio('✅', 'Nenhuma conta pendente nos próximos 30 dias.');
  return `<ul class="lista">${pendentes.map((t) => {
    const atrasado = t.data < hoje;
    return `<li>
      <span class="bolinha" style="background:${esc(t.categoria_cor || '#94a3b8')}"></span>
      <div class="cresce">
        <div class="titulo">${esc(t.descricao)}${t.parcela_total ? ` <span class="suave pequeno">(${t.parcela_num}/${t.parcela_total})</span>` : ''}</div>
        <div class="pequeno ${atrasado ? 'despesa' : 'suave'}">${atrasado ? '⚠️ Venceu em' : 'Vence em'} ${dataBR(t.data)} · ${esc(t.conta_nome)}</div>
      </div>
      <strong class="num ${t.tipo === 'receita' ? 'receita' : 'despesa'}">${brl(t.valor)}</strong>
      <button class="btn btn-sm" data-pagar="${t.id}" title="Marcar como ${t.tipo === 'receita' ? 'recebido' : 'pago'}">✓</button>
    </li>`;
  }).join('')}</ul>`;
}

function blocoOrcamentos(orcamentos) {
  if (!orcamentos.length) return vazio('🎯', 'Nenhum orçamento definido. <a href="#/orcamentos">Criar orçamentos</a>');
  return `<ul class="lista">${orcamentos.map((o) => {
    const fracao = o.gasto / o.limite;
    const cor = fracao > 1 ? corVar('--despesa') : fracao > 0.8 ? corVar('--alerta') : o.categoria_cor;
    return `<li style="display:block">
      <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px">
        <span>${esc(o.categoria_nome)}${fracao > 1 ? ' <span class="selo selo-atrasado">Estourado</span>' : ''}</span>
        <span class="num pequeno"><strong>${brl(o.gasto)}</strong> <span class="suave">de ${brl(o.limite)} (${pct(fracao)})</span></span>
      </div>
      ${barraProgresso(fracao, cor)}
    </li>`;
  }).join('')}</ul>`;
}

function blocoContas(contas) {
  if (!contas.length) return vazio('🏦', 'Nenhuma conta cadastrada.');
  return `<ul class="lista">${contas.map((c) => `
    <li>
      <span style="font-size:1.3rem">${ICONE_CONTA[c.tipo]}</span>
      <div class="cresce"><a class="titulo" href="#/transacoes?conta_id=${c.id}" style="color:inherit;text-decoration:none">${esc(c.nome)}</a></div>
      <strong class="num ${c.saldo_atual < 0 ? 'despesa' : ''}">${brl(c.saldo_atual)}</strong>
    </li>`).join('')}</ul>`;
}

function blocoMetas(metas) {
  if (!metas.length) return vazio('🐷', 'Nenhuma meta em andamento. <a href="#/metas">Criar meta</a>');
  return `<ul class="lista">${metas.map((m) => `
    <li style="display:block">
      <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px">
        <span>${esc(m.nome)}${m.prazo ? ` <span class="suave pequeno">até ${dataBR(m.prazo)}</span>` : ''}</span>
        <span class="num pequeno">${brl(m.valor_atual)} <span class="suave">de ${brl(m.valor_alvo)}</span></span>
      </div>
      ${barraProgresso(m.valor_atual / m.valor_alvo, m.cor)}
    </li>`).join('')}</ul>`;
}

export async function render(el) {
  dados = await api.get(`/dashboard?mes=${estado.mes}`);
  const { resumo } = dados;
  const pendentesMes = resumo.despesas_pendentes || resumo.receitas_pendentes
    ? `A pagar: ${brl(resumo.despesas_pendentes)} · A receber: ${brl(resumo.receitas_pendentes)}`
    : 'Tudo em dia neste mês';

  el.innerHTML = `
    <div class="barra-ferramentas">
      <div class="seletor-mes">
        <button class="btn btn-ghost btn-sm" data-mes="-1" aria-label="Mês anterior">‹</button>
        <strong>${mesLabel(dados.mes)}</strong>
        <button class="btn btn-ghost btn-sm" data-mes="1" aria-label="Próximo mês">›</button>
      </div>
    </div>

    <div class="pilha">
      <div class="grid grid-4">
        ${kpi('Saldo em contas', dados.saldo_total, dados.saldo_total < 0 ? 'despesa' : '', `${dados.contas.length} conta(s) ativa(s)`)}
        ${kpi('Receitas do mês', resumo.receitas, 'receita', resumo.receitas_pendentes ? `${brl(resumo.receitas_pendentes)} a receber` : '')}
        ${kpi('Despesas do mês', resumo.despesas, 'despesa', resumo.despesas_pendentes ? `${brl(resumo.despesas_pendentes)} a pagar` : '')}
        ${kpi('Balanço do mês', resumo.balanco, resumo.balanco < 0 ? 'despesa' : 'receita', pendentesMes)}
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-cab"><h2>Receitas × despesas (12 meses)</h2></div>
          <div class="grafico"><canvas data-grafico="evolucao" role="img" aria-label="Gráfico de receitas e despesas dos últimos 12 meses"></canvas></div>
        </div>
        <div class="card">
          <div class="card-cab"><h2>Despesas por categoria</h2><a class="pequeno" href="#/relatorios">Ver relatórios</a></div>
          ${dados.despesas_por_categoria.length
            ? '<div class="grafico"><canvas data-grafico="categorias" role="img" aria-label="Gráfico de despesas por categoria"></canvas></div>'
            : vazio('🍩', 'Sem despesas neste mês.')}
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-cab"><h2>Contas a pagar e receber</h2><a class="pequeno" href="#/transacoes?pago=0">Ver todas</a></div>
          ${blocoPendentes(dados.pendentes, dados.hoje)}
        </div>
        <div class="card">
          <div class="card-cab"><h2>Orçamentos do mês</h2><a class="pequeno" href="#/orcamentos">Gerenciar</a></div>
          ${blocoOrcamentos(dados.orcamentos)}
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-cab"><h2>Saldo por conta</h2><a class="pequeno" href="#/contas">Gerenciar</a></div>
          ${blocoContas(dados.contas)}
        </div>
        <div class="card">
          <div class="card-cab"><h2>Metas</h2><a class="pequeno" href="#/metas">Ver todas</a></div>
          ${blocoMetas(dados.metas)}
        </div>
      </div>
    </div>`;

  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => {
    estado.mes = somarMes(estado.mes, Number(b.dataset.mes));
    estado.recarregar();
  }));

  el.addEventListener('click', async (e) => {
    const botao = e.target.closest('[data-pagar]');
    if (!botao) return;
    botao.disabled = true;
    await api.patch(`/transacoes/${botao.dataset.pagar}/pago`, { pago: true });
    estado.recarregar();
  });
}

export function depoisDeMontar(el) {
  const receita = corVar('--grafico-receita');
  const despesa = corVar('--grafico-despesa');
  const superficie = corVar('--superficie');

  criarGrafico(el.querySelector('[data-grafico="evolucao"]'), {
    type: 'bar',
    data: {
      labels: dados.evolucao.map((m) => mesCurto(m.mes)),
      datasets: [
        { label: 'Receitas', data: dados.evolucao.map((m) => m.receitas / 100), backgroundColor: receita },
        { label: 'Despesas', data: dados.evolucao.map((m) => m.despesas / 100), backgroundColor: despesa },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      datasets: { bar: { borderRadius: 4, borderSkipped: 'start', maxBarThickness: 18, categoryPercentage: 0.7, barPercentage: 0.9 } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { callback: (v) => brlCompacto(v) } },
      },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2 } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${brl(Math.round(c.raw * 100))}` } },
      },
    },
  });

  const canvasCat = el.querySelector('[data-grafico="categorias"]');
  if (canvasCat) {
    const cats = dados.despesas_por_categoria;
    const total = cats.reduce((s, c) => s + c.total, 0);
    criarGrafico(canvasCat, {
      type: 'doughnut',
      data: {
        labels: cats.map((c) => c.nome),
        datasets: [{ data: cats.map((c) => c.total / 100), backgroundColor: cats.map((c) => c.cor), borderColor: superficie, borderWidth: 2 }],
      },
      options: {
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: canvasCat.parentElement.clientWidth < 480 ? 'bottom' : 'right',
            labels: {
              boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2,
              generateLabels: (chart) => chart.data.labels.map((rotulo, i) => ({
                text: `${rotulo}  ${pct(cats[i].total / total)}`,
                fillStyle: cats[i].cor, strokeStyle: cats[i].cor, fontColor: corVar('--texto-suave'),
                hidden: !chart.getDataVisibility(i), index: i,
              })),
            },
            onClick: (e, item, legend) => { legend.chart.toggleDataVisibility(item.index); legend.chart.update(); },
          },
          tooltip: { callbacks: { label: (c) => ` ${brl(cats[c.dataIndex].total)} (${pct(cats[c.dataIndex].total / total)})` } },
        },
      },
    });
  }
}
