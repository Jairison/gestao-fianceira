import { api, qs } from '../api.js';
import { estado } from '../estado.js';
import {
  abrirModal, brl, confirmar, dataBR, esc, hojeISO, lerValor, mesLabel, parseValor, seloSituacao, sinalValor,
  somarMes, tagCategoria, toast, valorInput, vazio,
} from '../util.js';

// Filtros persistem enquanto a página estiver aberta.
const filtros = { tipo: '', conta_id: '', categoria_id: '', pago: '', busca: '' };

// ---------- Formulário ----------
function opcoesCategorias(categorias, tipo, selecionada) {
  return ['<option value="">Sem categoria</option>',
    ...categorias.filter((c) => c.tipo === tipo)
      .map((c) => `<option value="${c.id}" ${c.id === selecionada ? 'selected' : ''}>${esc(c.nome)}</option>`),
  ].join('');
}

function opcoesContas(contas, selecionada) {
  return contas
    .filter((c) => !c.arquivada || c.id === selecionada)
    .map((c) => `<option value="${c.id}" ${c.id === selecionada ? 'selected' : ''}>${esc(c.nome)}</option>`)
    .join('');
}

/**
 * Abre o formulário de transação.
 * @param {object} [t] transação existente (edição) ou valores iniciais
 */
export async function abrirFormTransacao(t = {}) {
  const [contas, categorias] = await Promise.all([api.get('/contas'), api.get('/categorias')]);
  const ativas = contas.filter((c) => !c.arquivada);
  if (!ativas.length && !t.id) {
    toast('Cadastre uma conta antes de lançar transações.', 'erro');
    location.hash = '#/contas';
    return;
  }

  const edicao = Boolean(t.id);
  const tipo = t.tipo || 'despesa';
  const contaPadrao = t.conta_id || ativas[0]?.id;
  const destinoPadrao = t.conta_destino_id || ativas.find((c) => c.id !== contaPadrao)?.id;

  abrirModal({
    titulo: edicao ? 'Editar transação' : 'Nova transação',
    corpo: `
      <div class="segmentado">
        <label class="op-despesa"><input type="radio" name="tipo" value="despesa" ${tipo === 'despesa' ? 'checked' : ''}>Despesa</label>
        <label class="op-receita"><input type="radio" name="tipo" value="receita" ${tipo === 'receita' ? 'checked' : ''}>Receita</label>
        <label><input type="radio" name="tipo" value="transferencia" ${tipo === 'transferencia' ? 'checked' : ''}>Transferência</label>
      </div>
      ${t.parcela_total ? `<p class="pequeno suave" style="margin-top:0">Parcela ${t.parcela_num}/${t.parcela_total} — as alterações afetam apenas esta parcela.</p>` : ''}
      <div class="campo">
        <label for="f-desc">Descrição</label>
        <input id="f-desc" name="descricao" maxlength="120" required value="${esc(t.descricao)}" placeholder="Ex.: Supermercado, Salário...">
      </div>
      <div class="linha-campos">
        <div class="campo">
          <label for="f-valor">Valor (R$)</label>
          <input id="f-valor" name="valor" inputmode="decimal" required placeholder="0,00" value="${t.valor ? valorInput(t.valor) : ''}">
        </div>
        <div class="campo">
          <label for="f-data">Data</label>
          <input id="f-data" name="data" type="date" required value="${t.data || hojeISO()}">
        </div>
      </div>
      <div class="linha-campos">
        <div class="campo">
          <label for="f-conta" data-rotulo-conta>Conta</label>
          <select id="f-conta" name="conta_id">${opcoesContas(contas, contaPadrao)}</select>
        </div>
        <div class="campo" data-so="categoria">
          <label for="f-cat">Categoria</label>
          <select id="f-cat" name="categoria_id"></select>
        </div>
        <div class="campo" data-so="transferencia">
          <label for="f-destino">Conta de destino</label>
          <select id="f-destino" name="conta_destino_id">${opcoesContas(contas, destinoPadrao)}</select>
        </div>
      </div>
      ${edicao ? '' : `
      <div class="linha-campos">
        <div class="campo">
          <label for="f-rep">Repetição</label>
          <select id="f-rep" name="modo">
            <option value="">Não repetir</option>
            <option value="parcelado">Parcelado (divide o valor)</option>
            <option value="fixo">Repetir todo mês (mesmo valor)</option>
          </select>
        </div>
        <div class="campo" data-so="repeticao">
          <label for="f-vezes">Nº de meses/parcelas</label>
          <input id="f-vezes" name="vezes" type="number" min="2" max="120" value="2">
        </div>
      </div>
      <p class="pequeno suave" data-so="repeticao" style="margin-top:-6px"></p>`}
      <div class="campo">
        <label class="check"><input type="checkbox" name="pago" ${t.pago === 0 ? '' : 'checked'}> <span data-rotulo-pago>Pago</span></label>
      </div>
      <div class="campo">
        <label for="f-obs">Observação</label>
        <textarea id="f-obs" name="observacao" rows="2" maxlength="500">${esc(t.observacao)}</textarea>
      </div>`,

    aoMontar(form) {
      const el = form.elements;
      const atualizar = () => {
        const tipoAtual = el.tipo.value;
        const transf = tipoAtual === 'transferencia';
        form.querySelector('[data-so="categoria"]').hidden = transf;
        form.querySelector('[data-so="transferencia"]').hidden = !transf;
        form.querySelector('[data-rotulo-conta]').textContent = transf ? 'Conta de origem' : 'Conta';
        form.querySelector('[data-rotulo-pago]').textContent = { receita: 'Recebido', despesa: 'Pago', transferencia: 'Efetivada' }[tipoAtual];
        if (!transf) {
          const atual = Number(el.categoria_id.value) || (tipoAtual === tipo ? t.categoria_id : null);
          el.categoria_id.innerHTML = opcoesCategorias(categorias, tipoAtual, atual);
        }
        if (!edicao) {
          const modo = el.modo.value;
          form.querySelectorAll('[data-so="repeticao"]').forEach((n) => { n.hidden = !modo; });
          const vezes = Number(el.vezes.value);
          const centavos = parseValor(el.valor.value) || 0;
          const dica = form.querySelector('p[data-so="repeticao"]');
          if (modo && vezes >= 2 && centavos > 0) {
            dica.textContent = modo === 'parcelado'
              ? `${vezes}x de aprox. ${brl(Math.floor(centavos / vezes))} — parcelas futuras ficam como pendentes.`
              : `${vezes} lançamentos de ${brl(centavos)} (total ${brl(centavos * vezes)}) — meses futuros ficam como pendentes.`;
          } else dica.textContent = '';
        }
      };
      form.addEventListener('input', atualizar);
      form.addEventListener('change', atualizar);
      atualizar();
    },

    async aoEnviar(form) {
      const el = form.elements;
      const corpo = {
        tipo: el.tipo.value,
        descricao: el.descricao.value,
        valor: lerValor(form, 'valor', 'Valor'),
        data: el.data.value,
        conta_id: Number(el.conta_id.value),
        pago: el.pago.checked,
        observacao: el.observacao.value,
      };
      if (corpo.tipo === 'transferencia') corpo.conta_destino_id = Number(el.conta_destino_id.value);
      else corpo.categoria_id = el.categoria_id.value ? Number(el.categoria_id.value) : null;
      if (!edicao && el.modo.value) corpo.repeticao = { modo: el.modo.value, vezes: Number(el.vezes.value) };

      if (edicao) await api.put(`/transacoes/${t.id}`, corpo);
      else await api.post('/transacoes', corpo);
      toast(edicao ? 'Transação atualizada.' : 'Transação registrada.');
      estado.recarregar();
    },
  });
}

// ---------- Exclusão ----------
export async function excluirTransacao(t) {
  if (!t.grupo) {
    if (await confirmar(`Excluir a transação <strong>${esc(t.descricao)}</strong> de ${brl(t.valor)}?`)) {
      await api.del(`/transacoes/${t.id}`);
      toast('Transação excluída.');
      estado.recarregar();
    }
    return;
  }

  abrirModal({
    titulo: 'Excluir transação parcelada',
    textoBotao: 'Excluir',
    classeBotao: 'btn-perigo',
    corpo: `
      <p style="margin-top:0"><strong>${esc(t.descricao)}</strong> é a parcela ${t.parcela_num} de ${t.parcela_total}. O que deseja excluir?</p>
      <div class="campo"><label class="check"><input type="radio" name="escopo" value="unica" checked> Somente esta parcela</label></div>
      <div class="campo"><label class="check"><input type="radio" name="escopo" value="futuras"> Esta e as próximas parcelas</label></div>
      <div class="campo"><label class="check"><input type="radio" name="escopo" value="todas"> Todas as parcelas</label></div>`,
    async aoEnviar(form) {
      const r = await api.del(`/transacoes/${t.id}?escopo=${form.elements.escopo.value}`);
      toast(`${r.removidas} transação(ões) excluída(s).`);
      estado.recarregar();
    },
  });
}

// ---------- Tabela ----------
export function linhaTransacao(t, { mostrarConta = true } = {}) {
  const conta = t.tipo === 'transferencia'
    ? `${esc(t.conta_nome)} → ${esc(t.conta_destino_nome)}`
    : esc(t.conta_nome);
  return `
    <tr class="${t.pago ? '' : 'pendente'}" data-id="${t.id}">
      <td class="num" style="white-space:nowrap">${dataBR(t.data)}</td>
      <td>
        <div>${esc(t.descricao)}${t.parcela_total ? ` <span class="suave pequeno">(${t.parcela_num}/${t.parcela_total})</span>` : ''}</div>
        ${t.observacao ? `<div class="suave pequeno">${esc(t.observacao)}</div>` : ''}
      </td>
      <td class="esconde-mobile">${t.tipo === 'transferencia' ? '<span class="tag">Transferência</span>' : tagCategoria(t.categoria_nome, t.categoria_cor)}</td>
      ${mostrarConta ? `<td class="esconde-mobile pequeno">${conta}</td>` : ''}
      <td class="valor">${sinalValor(t)}</td>
      <td><button class="btn btn-icone" data-acao="pago" title="Alternar situação">${seloSituacao(t)}</button></td>
      <td class="acoes">
        <button class="btn btn-icone" data-acao="editar" title="Editar">✏️</button>
        <button class="btn btn-icone" data-acao="excluir" title="Excluir">🗑️</button>
      </td>
    </tr>`;
}

/**
 * Liga os botões de ação (editar, excluir, alternar pago) de uma tabela de transações.
 * @param {() => object[]} obterItens retorna as transações exibidas no momento
 * @param {() => void} aoAlterarSituacao chamado após alternar pago/pendente
 */
export function ligarAcoesTabela(container, obterItens, aoAlterarSituacao = () => estado.recarregar()) {
  container.addEventListener('click', async (e) => {
    const botao = e.target.closest('[data-acao]');
    if (!botao) return;
    const t = obterItens().find((i) => i.id === Number(botao.closest('tr').dataset.id));
    if (!t) return;
    if (botao.dataset.acao === 'editar') abrirFormTransacao(t);
    if (botao.dataset.acao === 'excluir') excluirTransacao(t);
    if (botao.dataset.acao === 'pago') {
      await api.patch(`/transacoes/${t.id}/pago`, { pago: !t.pago });
      aoAlterarSituacao();
    }
  });
}

// ---------- Página ----------
export async function render(el, params) {
  // Parâmetros da URL (ex.: vindos do painel) têm prioridade sobre os filtros atuais.
  for (const chave of Object.keys(filtros)) {
    if (params.has(chave)) filtros[chave] = params.get(chave);
  }
  if (params.has('mes')) estado.mes = params.get('mes');

  const [contas, categorias] = await Promise.all([api.get('/contas'), api.get('/categorias')]);

  el.innerHTML = `
    <div class="barra-ferramentas">
      <div class="seletor-mes">
        <button class="btn btn-ghost btn-sm" data-mes="-1" aria-label="Mês anterior">‹</button>
        <strong>${mesLabel(estado.mes)}</strong>
        <button class="btn btn-ghost btn-sm" data-mes="1" aria-label="Próximo mês">›</button>
      </div>
      <input type="search" name="busca" placeholder="🔍 Buscar..." value="${esc(filtros.busca)}" style="min-width:180px">
      <select name="tipo">
        <option value="">Todos os tipos</option>
        <option value="receita">Receitas</option>
        <option value="despesa">Despesas</option>
        <option value="transferencia">Transferências</option>
      </select>
      <select name="conta_id">
        <option value="">Todas as contas</option>
        ${contas.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}
      </select>
      <select name="categoria_id">
        <option value="">Todas as categorias</option>
        <option value="nenhuma">Sem categoria</option>
        ${categorias.map((c) => `<option value="${c.id}">${esc(c.nome)} (${c.tipo === 'receita' ? 'R' : 'D'})</option>`).join('')}
      </select>
      <select name="pago">
        <option value="">Todas as situações</option>
        <option value="1">Pagas</option>
        <option value="0">Pendentes</option>
      </select>
      <span class="espaco"></span>
      <a class="btn" data-exportar href="#">⬇️ Exportar CSV</a>
    </div>
    <div class="grid grid-4" data-totais style="margin-bottom:16px"></div>
    <div class="card" style="padding:6px 8px"><div class="tabela-wrap" data-lista></div></div>`;

  for (const nome of ['tipo', 'conta_id', 'categoria_id', 'pago']) {
    el.querySelector(`select[name="${nome}"]`).value = filtros[nome];
  }

  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => {
    estado.mes = somarMes(estado.mes, Number(b.dataset.mes));
    el.querySelector('.seletor-mes strong').textContent = mesLabel(estado.mes);
    atualizar();
  }));

  let espera;
  el.querySelector('.barra-ferramentas').addEventListener('input', (e) => {
    if (!(e.target.name in filtros)) return;
    filtros[e.target.name] = e.target.value;
    clearTimeout(espera);
    espera = setTimeout(atualizar, e.target.type === 'search' ? 250 : 0);
  });

  const listaEl = el.querySelector('[data-lista]');
  let itensAtuais = [];
  ligarAcoesTabela(listaEl, () => itensAtuais, () => atualizar());

  async function atualizar() {
    const query = qs({ mes: estado.mes, ...filtros });
    el.querySelector('[data-exportar]').href = `/api/exportar/csv${query}`;
    const { itens, totais } = await api.get(`/transacoes${query}`);
    itensAtuais = itens;

    el.querySelector('[data-totais]').innerHTML = `
      <div class="card"><div class="kpi-rotulo">Receitas</div><div class="kpi-valor receita">${brl(totais.receitas)}</div></div>
      <div class="card"><div class="kpi-rotulo">Despesas</div><div class="kpi-valor despesa">${brl(totais.despesas)}</div></div>
      <div class="card"><div class="kpi-rotulo">Resultado</div><div class="kpi-valor ${totais.saldo < 0 ? 'despesa' : 'receita'}">${brl(totais.saldo)}</div>
        <div class="kpi-sub">${itens.length} lançamento(s)</div></div>`;

    listaEl.innerHTML = itens.length
      ? `<table>
          <thead><tr><th>Data</th><th>Descrição</th><th class="esconde-mobile">Categoria</th><th class="esconde-mobile">Conta</th>
            <th class="valor">Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>${itens.map((t) => linhaTransacao(t)).join('')}</tbody>
        </table>`
      : vazio('🧾', 'Nenhuma transação encontrada para este período e filtros.');
  }

  await atualizar();
}
