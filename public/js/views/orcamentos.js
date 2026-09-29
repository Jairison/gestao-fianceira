import { api } from '../api.js';
import { estado } from '../estado.js';
import {
  abrirModal, barraProgresso, brl, confirmar, corVar, esc, lerValor, mesLabel, pct, somarMes, toast,
  valorInput, vazio,
} from '../util.js';

function abrirForm(categorias, orcamento) {
  const edicao = Boolean(orcamento);
  abrirModal({
    titulo: edicao ? `Orçamento: ${orcamento.categoria_nome}` : 'Novo orçamento',
    corpo: `
      ${edicao ? '' : `
      <div class="campo">
        <label for="o-cat">Categoria de despesa</label>
        <select id="o-cat" name="categoria_id">
          ${categorias.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}
        </select>
      </div>`}
      <div class="campo">
        <label for="o-valor">Limite mensal (R$)</label>
        <input id="o-valor" name="valor" inputmode="decimal" required placeholder="0,00" value="${edicao ? valorInput(orcamento.limite) : ''}">
      </div>
      <p class="pequeno suave">O limite vale para todos os meses. O gasto considera despesas pagas e pendentes do mês.</p>`,
    async aoEnviar(form) {
      const categoriaId = edicao ? orcamento.categoria_id : form.elements.categoria_id.value;
      await api.put(`/orcamentos/${categoriaId}`, { valor: lerValor(form, 'valor', 'Limite mensal') });
      toast('Orçamento salvo.');
      estado.recarregar();
    },
  });
}

export async function render(el) {
  const [orcamentos, categorias] = await Promise.all([
    api.get(`/orcamentos?mes=${estado.mes}`),
    api.get('/categorias'),
  ]);
  const comOrcamento = new Set(orcamentos.map((o) => o.categoria_id));
  const disponiveis = categorias.filter((c) => c.tipo === 'despesa' && !comOrcamento.has(c.id));
  const totalLimite = orcamentos.reduce((s, o) => s + o.limite, 0);
  const totalGasto = orcamentos.reduce((s, o) => s + o.gasto, 0);
  const estourados = orcamentos.filter((o) => o.gasto > o.limite).length;

  el.innerHTML = `
    <div class="barra-ferramentas">
      <div class="seletor-mes">
        <button class="btn btn-ghost btn-sm" data-mes="-1" aria-label="Mês anterior">‹</button>
        <strong>${mesLabel(estado.mes)}</strong>
        <button class="btn btn-ghost btn-sm" data-mes="1" aria-label="Próximo mês">›</button>
      </div>
      <span class="espaco"></span>
      <button class="btn btn-primario" data-novo ${disponiveis.length ? '' : 'disabled title="Todas as categorias de despesa já têm orçamento"'}>+ Novo orçamento</button>
    </div>

    ${orcamentos.length ? `
    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card"><div class="kpi-rotulo">Total orçado</div><div class="kpi-valor">${brl(totalLimite)}</div></div>
      <div class="card"><div class="kpi-rotulo">Total gasto</div><div class="kpi-valor ${totalGasto > totalLimite ? 'despesa' : ''}">${brl(totalGasto)}</div>
        <div class="kpi-sub">${pct(totalLimite ? totalGasto / totalLimite : 0)} do orçado</div></div>
      <div class="card"><div class="kpi-rotulo">Disponível</div><div class="kpi-valor ${totalLimite - totalGasto < 0 ? 'despesa' : 'receita'}">${brl(totalLimite - totalGasto)}</div>
        <div class="kpi-sub">${estourados ? `⚠️ ${estourados} categoria(s) estourada(s)` : 'Nenhuma categoria estourada'}</div></div>
    </div>
    <div class="grid grid-3">
      ${orcamentos.map((o) => {
        const fracao = o.gasto / o.limite;
        const cor = fracao > 1 ? corVar('--despesa') : fracao > 0.8 ? corVar('--alerta') : o.categoria_cor;
        const restante = o.limite - o.gasto;
        return `
        <div class="card" data-id="${o.categoria_id}">
          <div class="card-cab" style="margin-bottom:10px">
            <h2><span class="bolinha" style="background:${esc(o.categoria_cor)}"></span> ${esc(o.categoria_nome)}</h2>
            <div style="white-space:nowrap">
              <button class="btn btn-icone" data-acao="editar" title="Editar limite">✏️</button>
              <button class="btn btn-icone" data-acao="excluir" title="Remover orçamento">🗑️</button>
            </div>
          </div>
          <div class="num" style="display:flex;justify-content:space-between;margin-bottom:6px">
            <strong>${brl(o.gasto)}</strong><span class="suave">de ${brl(o.limite)}</span>
          </div>
          ${barraProgresso(fracao, cor)}
          <div class="pequeno" style="margin-top:8px">
            ${restante >= 0
              ? `<span class="suave">Restam</span> <strong class="num">${brl(restante)}</strong> <span class="suave">(${pct(fracao)} usado)</span>`
              : `<span class="despesa">⚠️ Excedeu em <strong class="num">${brl(-restante)}</strong></span>`}
          </div>
          <div style="margin-top:8px"><a class="pequeno" href="#/transacoes?categoria_id=${o.categoria_id}&tipo=despesa">Ver despesas →</a></div>
        </div>`;
      }).join('')}
    </div>` : `<div class="card">${vazio('🎯', 'Defina limites mensais de gasto por categoria para controlar seu orçamento.')}</div>`}`;

  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => {
    estado.mes = somarMes(estado.mes, Number(b.dataset.mes));
    estado.recarregar();
  }));
  el.querySelector('[data-novo]').addEventListener('click', () => abrirForm(disponiveis));
  el.addEventListener('click', async (e) => {
    const botao = e.target.closest('[data-acao]');
    if (!botao) return;
    const o = orcamentos.find((x) => x.categoria_id === Number(botao.closest('[data-id]').dataset.id));
    if (botao.dataset.acao === 'editar') abrirForm(disponiveis, o);
    if (botao.dataset.acao === 'excluir' && await confirmar(`Remover o orçamento de <strong>${esc(o.categoria_nome)}</strong>?`, { textoBotao: 'Remover' })) {
      await api.del(`/orcamentos/${o.categoria_id}`);
      toast('Orçamento removido.');
      estado.recarregar();
    }
  });
}
