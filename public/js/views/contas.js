import { api } from '../api.js';
import { estado } from '../estado.js';
import {
  abrirModal, brl, confirmar, esc, ICONE_CONTA, lerValor, TIPOS_CONTA, toast, valorInput, vazio,
} from '../util.js';

function abrirForm(c = {}) {
  const edicao = Boolean(c.id);
  abrirModal({
    titulo: edicao ? 'Editar conta' : 'Nova conta',
    corpo: `
      <div class="campo">
        <label for="c-nome">Nome</label>
        <input id="c-nome" name="nome" maxlength="60" required value="${esc(c.nome)}" placeholder="Ex.: Nubank, Itaú, Carteira">
      </div>
      <div class="linha-campos">
        <div class="campo">
          <label for="c-tipo">Tipo</label>
          <select id="c-tipo" name="tipo">
            ${Object.entries(TIPOS_CONTA).map(([k, v]) => `<option value="${k}" ${c.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label for="c-cor">Cor</label>
          <input id="c-cor" name="cor" type="color" value="${esc(c.cor || '#6366f1')}">
        </div>
      </div>
      <div class="campo">
        <label for="c-saldo">Saldo inicial (R$)</label>
        <input id="c-saldo" name="saldo_inicial" inputmode="decimal" value="${valorInput(c.saldo_inicial || 0)}">
        <div class="pequeno suave" style="margin-top:4px">Saldo da conta antes do primeiro lançamento no sistema. Pode ser negativo (ex.: fatura de cartão).</div>
      </div>
      ${edicao ? `<div class="campo"><label class="check"><input type="checkbox" name="arquivada" ${c.arquivada ? 'checked' : ''}> Arquivada (oculta nos formulários e no saldo total)</label></div>` : ''}`,
    async aoEnviar(form) {
      const el = form.elements;
      const corpo = {
        nome: el.nome.value,
        tipo: el.tipo.value,
        cor: el.cor.value,
        saldo_inicial: lerValor(form, 'saldo_inicial', 'Saldo inicial', { permitirZero: true, permitirNegativo: true }),
        arquivada: el.arquivada?.checked || false,
      };
      if (edicao) await api.put(`/contas/${c.id}`, corpo);
      else await api.post('/contas', corpo);
      toast(edicao ? 'Conta atualizada.' : 'Conta criada.');
      estado.recarregar();
    },
  });
}

async function excluir(c) {
  if (!await confirmar(`Excluir a conta <strong>${esc(c.nome)}</strong>?`)) return;
  try {
    await api.del(`/contas/${c.id}`);
  } catch (err) {
    if (err.status !== 409) throw err;
    const forcar = await confirmar(
      `${esc(err.message)}<br><br><strong>Todas as transações desta conta serão excluídas permanentemente.</strong>`,
      { titulo: 'Conta com transações', textoBotao: 'Excluir conta e transações' },
    );
    if (!forcar) return;
    await api.del(`/contas/${c.id}?forcar=1`);
  }
  toast('Conta excluída.');
  estado.recarregar();
}

function cartao(c) {
  return `
    <div class="card" data-id="${c.id}" style="border-top:4px solid ${esc(c.cor)};${c.arquivada ? 'opacity:.6' : ''}">
      <div class="card-cab" style="margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          <span style="font-size:1.5rem">${ICONE_CONTA[c.tipo]}</span>
          <div style="min-width:0">
            <h2 style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.nome)}</h2>
            <div class="pequeno suave">${TIPOS_CONTA[c.tipo]}${c.arquivada ? ' · Arquivada' : ''}</div>
          </div>
        </div>
        <div style="white-space:nowrap">
          <button class="btn btn-icone" data-acao="editar" title="Editar">✏️</button>
          <button class="btn btn-icone" data-acao="excluir" title="Excluir">🗑️</button>
        </div>
      </div>
      <div class="kpi-rotulo">Saldo atual</div>
      <div class="kpi-valor ${c.saldo_atual < 0 ? 'despesa' : ''}">${brl(c.saldo_atual)}</div>
      <div style="margin-top:10px"><a class="pequeno" href="#/transacoes?conta_id=${c.id}">Ver extrato →</a></div>
    </div>`;
}

export async function render(el) {
  const contas = await api.get('/contas');
  const ativas = contas.filter((c) => !c.arquivada);
  const total = ativas.reduce((s, c) => s + c.saldo_atual, 0);

  el.innerHTML = `
    <div class="barra-ferramentas">
      <div class="card" style="padding:10px 16px">
        <span class="kpi-rotulo">Saldo total (contas ativas): </span>
        <strong class="num ${total < 0 ? 'despesa' : ''}">${brl(total)}</strong>
      </div>
      <span class="espaco"></span>
      <button class="btn" data-transferir>⇄ Transferir</button>
      <button class="btn btn-primario" data-nova>+ Nova conta</button>
    </div>
    ${contas.length ? `<div class="grid grid-3">${contas.map(cartao).join('')}</div>`
      : `<div class="card">${vazio('🏦', 'Nenhuma conta cadastrada ainda.')}</div>`}`;

  el.querySelector('[data-nova]').addEventListener('click', () => abrirForm());
  el.querySelector('[data-transferir]').addEventListener('click', async () => {
    const { abrirFormTransacao } = await import('./transacoes.js');
    abrirFormTransacao({ tipo: 'transferencia', descricao: 'Transferência entre contas' });
  });
  el.addEventListener('click', (e) => {
    const botao = e.target.closest('[data-acao]');
    if (!botao) return;
    const c = contas.find((x) => x.id === Number(botao.closest('[data-id]').dataset.id));
    if (botao.dataset.acao === 'editar') abrirForm(c);
    if (botao.dataset.acao === 'excluir') excluir(c);
  });
}
