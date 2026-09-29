import { api } from '../api.js';
import { estado } from '../estado.js';
import { brl, dataBR, esc, toast, vazio } from '../util.js';

// Prévia em revisão; sobrevive a trocas de página até importar ou cancelar.
let previa = null; // { formato, itens, invalidas, contaId, nomeArquivo }

/** Lê o arquivo como UTF-8 e, se não for válido, como Windows-1252 (comum em OFX de bancos). */
async function lerArquivo(arquivo) {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function opcoesCategoria(categorias, tipo, selecionada) {
  return ['<option value="">Sem categoria</option>',
    ...categorias.filter((c) => c.tipo === tipo)
      .map((c) => `<option value="${c.id}" ${c.id === selecionada ? 'selected' : ''}>${esc(c.nome)}</option>`),
  ].join('');
}

function telaEnvio(contas) {
  const padrao = contas.find((c) => /nubank|\bnu\b/i.test(c.nome))
    || contas.find((c) => c.tipo === 'corrente')
    || contas[0];
  return `
    <div class="pilha" style="max-width:760px">
      <div class="card">
        <h2 style="margin-bottom:10px">📥 Importar extrato do Nubank</h2>
        <ol class="suave" style="margin:0 0 16px;padding-left:20px">
          <li>No app do Nubank, abra a área da <strong>conta</strong> e procure a opção de <strong>exportar/pedir extrato</strong>.</li>
          <li>Escolha o período e o formato <strong>OFX</strong> ou <strong>CSV</strong> (o arquivo costuma chegar por e-mail).</li>
          <li>Selecione o arquivo abaixo, revise os lançamentos e confirme.</li>
        </ol>
        <div class="linha-campos">
          <div class="campo">
            <label for="i-conta">Importar para a conta</label>
            <select id="i-conta" name="conta">
              ${contas.map((c) => `<option value="${c.id}" ${c.id === padrao?.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="campo">
            <label>Arquivo do extrato</label>
            <label class="btn btn-primario" style="display:flex;color:#fff;margin:0">
              📂 Escolher arquivo (.ofx ou .csv)
              <input type="file" accept=".ofx,.csv,text/csv,application/x-ofx" data-arquivo hidden>
            </label>
          </div>
        </div>
        <p class="pequeno suave" style="margin:0">Pode importar o mesmo extrato mais de uma vez (ou períodos que se sobrepõem):
          lançamentos já importados são reconhecidos e não são duplicados.</p>
      </div>
      <div class="card">
        <h2 style="margin-bottom:6px">💡 Dicas</h2>
        <ul class="suave pequeno" style="margin:0;padding-left:20px">
          <li>As categorias são sugeridas pelo seu histórico e por palavras-chave. Quando você corrige uma, as próximas importações aprendem.</li>
          <li>Aplicações e resgates de <strong>Caixinhas</strong> vêm desmarcados, pois não são gastos nem ganhos.</li>
          <li>Lançamentos com mesma data e valor de algo que você já digitou à mão vêm desmarcados como possível duplicata.</li>
        </ul>
      </div>
    </div>`;
}

function resumo() {
  const sel = previa.itens.filter((i) => i.selecionada);
  const receitas = sel.filter((i) => i.tipo === 'receita').reduce((s, i) => s + i.valor, 0);
  const despesas = sel.filter((i) => i.tipo === 'despesa').reduce((s, i) => s + i.valor, 0);
  return { n: sel.length, receitas, despesas };
}

function telaRevisao(contas, categorias) {
  const conta = contas.find((c) => c.id === previa.contaId);
  const linhas = previa.itens.map((it, idx) => `
    <tr data-idx="${idx}" class="${it.selecionada ? '' : 'pendente'}">
      <td><input type="checkbox" data-campo="selecionada" ${it.selecionada ? 'checked' : ''} ${it.duplicada ? 'disabled' : ''} aria-label="Importar este lançamento"></td>
      <td class="num" style="white-space:nowrap">${dataBR(it.data)}</td>
      <td style="min-width:220px">
        <input data-campo="descricao" value="${esc(it.descricao)}" maxlength="120" ${it.duplicada ? 'disabled' : ''}>
        ${it.aviso ? `<div class="pequeno" style="margin-top:4px"><span class="selo ${it.duplicada ? 'selo-pago' : 'selo-pendente'}">${esc(it.aviso)}</span></div>` : ''}
      </td>
      <td style="min-width:170px"><select data-campo="categoria_id" ${it.duplicada ? 'disabled' : ''}>${opcoesCategoria(categorias, it.tipo, it.categoria_id)}</select></td>
      <td class="valor"><span class="${it.tipo} num">${it.tipo === 'receita' ? '+' : '−'} ${brl(it.valor)}</span></td>
    </tr>`).join('');

  return `
    <div class="barra-ferramentas">
      <div class="card" style="padding:10px 16px">
        <strong>${esc(previa.nomeArquivo)}</strong> <span class="suave pequeno">· ${previa.formato} · ${previa.itens.length} lançamento(s) · conta ${esc(conta?.nome || '')}</span>
        ${previa.invalidas ? `<div class="pequeno despesa">${previa.invalidas} linha(s) ignorada(s) por data ou valor inválido.</div>` : ''}
      </div>
      <span class="espaco"></span>
      <button class="btn" data-cancelar>Cancelar</button>
      <button class="btn btn-primario" data-importar></button>
    </div>
    <div class="grid grid-4" data-resumo style="margin-bottom:16px"></div>
    <div class="card" style="padding:6px 8px">
      <div class="barra-ferramentas" style="margin:8px 8px 4px">
        <button class="btn btn-sm" data-marcar="todas">Marcar todas</button>
        <button class="btn btn-sm" data-marcar="nenhuma">Desmarcar todas</button>
        <span class="suave pequeno">Revise descrições e categorias antes de importar.</span>
      </div>
      <div class="tabela-wrap">
        <table>
          <thead><tr><th></th><th>Data</th><th>Descrição</th><th>Categoria</th><th class="valor">Valor</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </div>`;
}

function atualizarResumo(el) {
  const r = resumo();
  el.querySelector('[data-resumo]').innerHTML = `
    <div class="card"><div class="kpi-rotulo">Selecionados</div><div class="kpi-valor">${r.n} <span class="suave pequeno">de ${previa.itens.length}</span></div></div>
    <div class="card"><div class="kpi-rotulo">Entradas</div><div class="kpi-valor receita">${brl(r.receitas)}</div></div>
    <div class="card"><div class="kpi-rotulo">Saídas</div><div class="kpi-valor despesa">${brl(r.despesas)}</div></div>`;
  const botao = el.querySelector('[data-importar]');
  botao.textContent = `Importar ${r.n} lançamento(s)`;
  botao.disabled = r.n === 0;
}

export async function render(el) {
  const [todas, categorias] = await Promise.all([api.get('/contas'), api.get('/categorias')]);
  const contas = todas.filter((c) => !c.arquivada);
  if (!contas.length) {
    el.innerHTML = `<div class="card">${vazio('🏦', 'Cadastre uma conta antes de importar. <a href="#/contas">Ir para Contas</a>')}</div>`;
    return;
  }

  if (!previa) {
    el.innerHTML = telaEnvio(contas);
    el.querySelector('[data-arquivo]').addEventListener('change', async (e) => {
      const arquivo = e.target.files[0];
      e.target.value = '';
      if (!arquivo) return;
      const contaId = Number(el.querySelector('[name="conta"]').value);
      try {
        const conteudo = await lerArquivo(arquivo);
        const r = await api.post('/importacao/previa', { conta_id: contaId, nome_arquivo: arquivo.name, conteudo });
        previa = { ...r, contaId, nomeArquivo: arquivo.name };
        estado.recarregar(); // troca para a tela de revisão
      } catch (err) {
        toast(err.message, 'erro');
      }
    });
    return;
  }

  el.innerHTML = telaRevisao(contas, categorias);
  atualizarResumo(el);

  el.addEventListener('change', (e) => {
    const campo = e.target.dataset.campo;
    const linha = e.target.closest('tr[data-idx]');
    if (!campo || !linha) return;
    const item = previa.itens[Number(linha.dataset.idx)];
    if (campo === 'selecionada') {
      item.selecionada = e.target.checked;
      linha.classList.toggle('pendente', !item.selecionada);
      atualizarResumo(el);
    } else if (campo === 'categoria_id') item.categoria_id = e.target.value ? Number(e.target.value) : null;
    else if (campo === 'descricao') item.descricao = e.target.value;
  });

  el.querySelectorAll('[data-marcar]').forEach((b) => b.addEventListener('click', () => {
    const marcar = b.dataset.marcar === 'todas';
    el.querySelectorAll('tr[data-idx]').forEach((linha) => {
      const item = previa.itens[Number(linha.dataset.idx)];
      if (item.duplicada) return;
      item.selecionada = marcar;
      linha.querySelector('[data-campo="selecionada"]').checked = marcar;
      linha.classList.toggle('pendente', !marcar);
    });
    atualizarResumo(el);
  }));

  el.querySelector('[data-cancelar]').addEventListener('click', () => {
    previa = null;
    estado.recarregar();
  });

  el.querySelector('[data-importar]').addEventListener('click', async (e) => {
    const selecionados = previa.itens.filter((i) => i.selecionada);
    e.target.disabled = true;
    try {
      const r = await api.post('/importacao/confirmar', {
        conta_id: previa.contaId,
        itens: selecionados.map(({ id_externo, data, tipo, valor, descricao, observacao, categoria_id }) =>
          ({ id_externo, data, tipo, valor, descricao, observacao, categoria_id })),
      });
      toast(`${r.importadas} lançamento(s) importado(s)${r.ignoradas ? `, ${r.ignoradas} já existiam` : ''}.`);
      const maisRecente = selecionados.reduce((m, i) => (i.data > m ? i.data : m), '');
      const contaId = previa.contaId;
      previa = null;
      location.hash = `#/transacoes?mes=${maisRecente.slice(0, 7)}&conta_id=${contaId}`;
    } catch (err) {
      toast(err.message, 'erro');
      e.target.disabled = false;
    }
  });
}
