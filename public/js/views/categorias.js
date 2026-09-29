import { api } from '../api.js';
import { estado } from '../estado.js';
import { abrirModal, confirmar, esc, toast, vazio } from '../util.js';

function abrirForm(c = {}) {
  const edicao = Boolean(c.id);
  const tipo = c.tipo || 'despesa';
  abrirModal({
    titulo: edicao ? 'Editar categoria' : 'Nova categoria',
    corpo: `
      <div class="segmentado">
        <label class="op-despesa"><input type="radio" name="tipo" value="despesa" ${tipo === 'despesa' ? 'checked' : ''}>Despesa</label>
        <label class="op-receita"><input type="radio" name="tipo" value="receita" ${tipo === 'receita' ? 'checked' : ''}>Receita</label>
      </div>
      <div class="linha-campos" style="grid-template-columns:1fr 90px">
        <div class="campo">
          <label for="k-nome">Nome</label>
          <input id="k-nome" name="nome" maxlength="60" required value="${esc(c.nome)}">
        </div>
        <div class="campo">
          <label for="k-cor">Cor</label>
          <input id="k-cor" name="cor" type="color" value="${esc(c.cor || '#64748b')}">
        </div>
      </div>`,
    async aoEnviar(form) {
      const el = form.elements;
      const corpo = { nome: el.nome.value, tipo: el.tipo.value, cor: el.cor.value };
      if (edicao) await api.put(`/categorias/${c.id}`, corpo);
      else await api.post('/categorias', corpo);
      toast(edicao ? 'Categoria atualizada.' : 'Categoria criada.');
      estado.recarregar();
    },
  });
}

function coluna(titulo, classe, itens) {
  return `
    <div class="card">
      <div class="card-cab"><h2 class="${classe}">${titulo}</h2><span class="suave pequeno">${itens.length}</span></div>
      ${itens.length ? `<ul class="lista">${itens.map((c) => `
        <li data-id="${c.id}">
          <span class="bolinha" style="background:${esc(c.cor)};width:14px;height:14px"></span>
          <div class="cresce">
            <div class="titulo">${esc(c.nome)}</div>
            <div class="pequeno suave">${c.total_transacoes} transação(ões)</div>
          </div>
          <a class="btn btn-icone" href="#/transacoes?categoria_id=${c.id}" title="Ver transações">🔍</a>
          <button class="btn btn-icone" data-acao="editar" title="Editar">✏️</button>
          <button class="btn btn-icone" data-acao="excluir" title="Excluir">🗑️</button>
        </li>`).join('')}</ul>` : vazio('🏷️', 'Nenhuma categoria.')}
    </div>`;
}

export async function render(el) {
  const categorias = await api.get('/categorias');
  el.innerHTML = `
    <div class="barra-ferramentas">
      <span class="suave">Organize seus lançamentos. Categorias de despesa podem ter orçamento mensal.</span>
      <span class="espaco"></span>
      <button class="btn btn-primario" data-nova>+ Nova categoria</button>
    </div>
    <div class="grid grid-2">
      ${coluna('Despesas', 'despesa', categorias.filter((c) => c.tipo === 'despesa'))}
      ${coluna('Receitas', 'receita', categorias.filter((c) => c.tipo === 'receita'))}
    </div>`;

  el.querySelector('[data-nova]').addEventListener('click', () => abrirForm());
  el.addEventListener('click', async (e) => {
    const botao = e.target.closest('[data-acao]');
    if (!botao) return;
    const c = categorias.find((x) => x.id === Number(botao.closest('[data-id]').dataset.id));
    if (botao.dataset.acao === 'editar') abrirForm(c);
    if (botao.dataset.acao === 'excluir') {
      const aviso = c.total_transacoes ? `<br><span class="suave">${c.total_transacoes} transação(ões) ficarão sem categoria.</span>` : '';
      if (await confirmar(`Excluir a categoria <strong>${esc(c.nome)}</strong>?${aviso}`)) {
        await api.del(`/categorias/${c.id}`);
        toast('Categoria excluída.');
        estado.recarregar();
      }
    }
  });
}
