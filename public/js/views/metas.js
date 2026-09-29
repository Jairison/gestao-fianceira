import { api } from '../api.js';
import { estado } from '../estado.js';
import {
  abrirModal, barraProgresso, brl, confirmar, dataBR, esc, hojeISO, lerValor, pct, toast, valorInput, vazio,
} from '../util.js';

function abrirForm(m = {}) {
  const edicao = Boolean(m.id);
  abrirModal({
    titulo: edicao ? 'Editar meta' : 'Nova meta',
    corpo: `
      <div class="linha-campos" style="grid-template-columns:1fr 90px">
        <div class="campo">
          <label for="m-nome">Nome</label>
          <input id="m-nome" name="nome" maxlength="80" required value="${esc(m.nome)}" placeholder="Ex.: Reserva de emergência, Viagem">
        </div>
        <div class="campo">
          <label for="m-cor">Cor</label>
          <input id="m-cor" name="cor" type="color" value="${esc(m.cor || '#10b981')}">
        </div>
      </div>
      <div class="linha-campos">
        <div class="campo">
          <label for="m-alvo">Valor alvo (R$)</label>
          <input id="m-alvo" name="valor_alvo" inputmode="decimal" required placeholder="0,00" value="${m.valor_alvo ? valorInput(m.valor_alvo) : ''}">
        </div>
        <div class="campo">
          <label for="m-atual">Já guardado (R$)</label>
          <input id="m-atual" name="valor_atual" inputmode="decimal" value="${valorInput(m.valor_atual || 0)}">
        </div>
      </div>
      <div class="campo">
        <label for="m-prazo">Prazo (opcional)</label>
        <input id="m-prazo" name="prazo" type="date" value="${esc(m.prazo)}">
      </div>`,
    async aoEnviar(form) {
      const corpo = {
        nome: form.elements.nome.value,
        cor: form.elements.cor.value,
        valor_alvo: lerValor(form, 'valor_alvo', 'Valor alvo'),
        valor_atual: lerValor(form, 'valor_atual', 'Já guardado', { permitirZero: true }),
        prazo: form.elements.prazo.value || null,
      };
      if (edicao) await api.put(`/metas/${m.id}`, corpo);
      else await api.post('/metas', corpo);
      toast(edicao ? 'Meta atualizada.' : 'Meta criada.');
      estado.recarregar();
    },
  });
}

function abrirAporte(m, resgate = false) {
  abrirModal({
    titulo: `${resgate ? 'Resgatar de' : 'Guardar em'}: ${m.nome}`,
    textoBotao: resgate ? 'Resgatar' : 'Guardar',
    corpo: `
      <div class="campo">
        <label for="a-valor">Valor (R$)</label>
        <input id="a-valor" name="valor" inputmode="decimal" required placeholder="0,00">
      </div>
      <p class="pequeno suave">Guardado hoje: ${brl(m.valor_atual)} de ${brl(m.valor_alvo)}.</p>`,
    async aoEnviar(form) {
      const valor = lerValor(form, 'valor', 'Valor');
      await api.post(`/metas/${m.id}/aporte`, { valor: resgate ? -valor : valor });
      toast(resgate ? 'Resgate registrado.' : 'Valor guardado! 🎉');
      estado.recarregar();
    },
  });
}

/** Quanto guardar por mês até o prazo para atingir a meta. */
function sugestaoMensal(m) {
  if (!m.prazo || m.valor_atual >= m.valor_alvo) return '';
  const hoje = hojeISO();
  if (m.prazo < hoje) return '<span class="despesa">⚠️ Prazo vencido</span>';
  const [a1, m1] = hoje.split('-').map(Number);
  const [a2, m2] = m.prazo.split('-').map(Number);
  const meses = Math.max(1, (a2 - a1) * 12 + (m2 - m1));
  return `Guarde <strong class="num">${brl(Math.ceil((m.valor_alvo - m.valor_atual) / meses))}</strong>/mês por ${meses} mês(es)`;
}

function cartao(m) {
  const fracao = m.valor_atual / m.valor_alvo;
  const concluida = fracao >= 1;
  return `
    <div class="card" data-id="${m.id}">
      <div class="card-cab" style="margin-bottom:10px">
        <div style="min-width:0">
          <h2>${concluida ? '🏆' : '🐷'} ${esc(m.nome)}</h2>
          <div class="pequeno suave">${m.prazo ? `Prazo: ${dataBR(m.prazo)}` : 'Sem prazo'}</div>
        </div>
        <div style="white-space:nowrap">
          <button class="btn btn-icone" data-acao="editar" title="Editar">✏️</button>
          <button class="btn btn-icone" data-acao="excluir" title="Excluir">🗑️</button>
        </div>
      </div>
      <div class="num" style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <strong style="font-size:1.25rem">${brl(m.valor_atual)}</strong>
        <span class="suave pequeno">de ${brl(m.valor_alvo)} · ${pct(fracao)}</span>
      </div>
      ${barraProgresso(fracao, m.cor)}
      <div class="pequeno" style="margin:10px 0">${concluida ? '<span class="receita">Meta atingida! 🎉</span>' : `<span class="suave">Faltam</span> <strong class="num">${brl(m.valor_alvo - m.valor_atual)}</strong>`}</div>
      <div class="pequeno suave" style="margin-bottom:12px;min-height:1.2em">${sugestaoMensal(m)}</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primario btn-sm" data-acao="aporte">+ Guardar</button>
        <button class="btn btn-sm" data-acao="resgate" ${m.valor_atual ? '' : 'disabled'}>− Resgatar</button>
      </div>
    </div>`;
}

export async function render(el) {
  const metas = await api.get('/metas');
  const guardado = metas.reduce((s, m) => s + m.valor_atual, 0);
  const alvo = metas.reduce((s, m) => s + m.valor_alvo, 0);

  el.innerHTML = `
    <div class="barra-ferramentas">
      ${metas.length ? `<div class="card" style="padding:10px 16px"><span class="kpi-rotulo">Total guardado: </span>
        <strong class="num">${brl(guardado)}</strong> <span class="suave pequeno">de ${brl(alvo)}</span></div>` : ''}
      <span class="espaco"></span>
      <button class="btn btn-primario" data-nova>+ Nova meta</button>
    </div>
    ${metas.length ? `<div class="grid grid-3">${metas.map(cartao).join('')}</div>`
      : `<div class="card">${vazio('🐷', 'Crie metas para juntar dinheiro: reserva de emergência, viagem, carro...')}</div>`}`;

  el.querySelector('[data-nova]').addEventListener('click', () => abrirForm());
  el.addEventListener('click', async (e) => {
    const botao = e.target.closest('[data-acao]');
    if (!botao) return;
    const m = metas.find((x) => x.id === Number(botao.closest('[data-id]').dataset.id));
    const acao = botao.dataset.acao;
    if (acao === 'editar') abrirForm(m);
    if (acao === 'aporte') abrirAporte(m);
    if (acao === 'resgate') abrirAporte(m, true);
    if (acao === 'excluir' && await confirmar(`Excluir a meta <strong>${esc(m.nome)}</strong>?`)) {
      await api.del(`/metas/${m.id}`);
      toast('Meta excluída.');
      estado.recarregar();
    }
  });
}
