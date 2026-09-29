// ---------- Formatação ----------
const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

/** Formata centavos como moeda (R$). */
export const brl = (centavos) => fmtMoeda.format((centavos || 0) / 100);
export const pct = (fracao) => fmtPct.format(fracao || 0);

export function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export function mesLabel(mes, formato = 'long') {
  const [a, m] = mes.split('-').map(Number);
  const texto = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: formato, year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function mesCurto(mes) {
  const [a, m] = mes.split('-').map(Number);
  const nome = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return `${nome}/${String(a).slice(2)}`;
}

export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const mesAtual = () => hojeISO().slice(0, 7);

export function somarMes(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function fimDoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
}

/** Converte texto digitado ("1.234,56", "1234.56", "R$ 10") em centavos. Retorna NaN se inválido. */
export function parseValor(texto) {
  let s = String(texto ?? '').replace(/[R$\s]/g, '');
  if (!s) return NaN;
  const negativo = s.startsWith('-');
  s = s.replace(/^-/, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
  const c = Math.round(parseFloat(s) * 100);
  return negativo ? -c : c;
}

/** Centavos -> texto para campo de formulário ("1234,56"). */
export const valorInput = (centavos) => (centavos / 100).toFixed(2).replace('.', ',');

/** Escapa texto para interpolação segura em HTML. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const TIPOS_CONTA = {
  corrente: 'Conta corrente',
  poupanca: 'Poupança',
  carteira: 'Carteira / dinheiro',
  cartao: 'Cartão de crédito',
  investimento: 'Investimento',
};

export const ICONE_CONTA = { corrente: '🏦', poupanca: '🐖', carteira: '👛', cartao: '💳', investimento: '📈' };

export function sinalValor(t) {
  if (t.tipo === 'receita') return `<span class="receita num">+ ${brl(t.valor)}</span>`;
  if (t.tipo === 'despesa') return `<span class="despesa num">− ${brl(t.valor)}</span>`;
  return `<span class="transferencia num">⇄ ${brl(t.valor)}</span>`;
}

export function seloSituacao(t) {
  if (t.pago) return '<span class="selo selo-pago">Pago</span>';
  return t.data < hojeISO()
    ? '<span class="selo selo-atrasado">Atrasado</span>'
    : '<span class="selo selo-pendente">Pendente</span>';
}

export function tagCategoria(nome, cor) {
  if (!nome) return '<span class="suave pequeno">—</span>';
  return `<span class="tag"><span class="bolinha" style="background:${esc(cor)}"></span>${esc(nome)}</span>`;
}

export function barraProgresso(fracao, cor) {
  const largura = Math.max(0, Math.min(1, fracao)) * 100;
  return `<div class="progresso"><div style="width:${largura}%;background:${esc(cor)}"></div></div>`;
}

// ---------- Toasts ----------
export function toast(mensagem, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${tipo === 'erro' ? 'erro' : ''}`;
  el.textContent = mensagem;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 5000 : 2800);
}

// ---------- Modais ----------
/**
 * Abre um modal com formulário.
 * `aoEnviar(form)` pode lançar erro: a mensagem é exibida no modal e ele permanece aberto.
 * `aoMontar(form)` permite ligar eventos aos campos após renderizar.
 */
export function abrirModal({ titulo, corpo, textoBotao = 'Salvar', classeBotao = 'btn-primario', aoEnviar, aoMontar, largura }) {
  const raiz = document.getElementById('modal-raiz');
  raiz.innerHTML = `
    <div class="modal-fundo">
      <form class="modal" novalidate ${largura ? `style="max-width:${largura}px"` : ''}>
        <div class="modal-cab">
          <h2>${esc(titulo)}</h2>
          <button type="button" class="btn btn-icone" data-fechar aria-label="Fechar">✕</button>
        </div>
        <div class="modal-corpo">
          <div class="erro-form" hidden></div>
          ${corpo}
        </div>
        <div class="modal-rodape">
          <button type="button" class="btn" data-fechar>Cancelar</button>
          <button type="submit" class="btn ${classeBotao}">${esc(textoBotao)}</button>
        </div>
      </form>
    </div>`;

  const fundo = raiz.firstElementChild;
  const form = fundo.querySelector('form');
  const erroEl = form.querySelector('.erro-form');
  const fechar = () => { raiz.innerHTML = ''; document.removeEventListener('keydown', aoTeclar); };
  const aoTeclar = (e) => { if (e.key === 'Escape') fechar(); };

  document.addEventListener('keydown', aoTeclar);
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
  form.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', fechar));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    erroEl.hidden = true;
    try {
      await aoEnviar(form);
      fechar();
    } catch (err) {
      erroEl.textContent = err.message;
      erroEl.hidden = false;
    } finally {
      botao.disabled = false;
    }
  });

  aoMontar?.(form);
  form.querySelector('input:not([type="hidden"]):not([type="radio"]), select, textarea')?.focus();
  return { form, fechar };
}

/** Modal de confirmação. Resolve com true se confirmado. */
export function confirmar(mensagem, { titulo = 'Confirmar', textoBotao = 'Excluir', perigo = true } = {}) {
  return new Promise((resolve) => {
    let confirmado = false;
    const { form } = abrirModal({
      titulo,
      corpo: `<p style="margin:0 0 12px">${mensagem}</p>`,
      textoBotao,
      classeBotao: perigo ? 'btn-perigo' : 'btn-primario',
      aoEnviar: () => { confirmado = true; },
    });
    new MutationObserver((_, obs) => {
      if (!document.body.contains(form)) { obs.disconnect(); resolve(confirmado); }
    }).observe(document.getElementById('modal-raiz'), { childList: true });
  });
}

/** Lê um campo de valor monetário do formulário, lançando erro amigável se inválido. */
export function lerValor(form, nome, rotulo, { permitirZero = false, permitirNegativo = false } = {}) {
  const c = parseValor(form.elements[nome].value);
  if (Number.isNaN(c)) throw new Error(`Informe um valor válido para "${rotulo}".`);
  if (!permitirNegativo && c < 0) throw new Error(`"${rotulo}" não pode ser negativo.`);
  if (!permitirZero && c === 0) throw new Error(`"${rotulo}" deve ser maior que zero.`);
  return c;
}

// ---------- Gráficos ----------
const graficos = [];

/** Cria um gráfico Chart.js registrado para ser destruído ao trocar de página. */
export function criarGrafico(canvas, config) {
  const estilo = getComputedStyle(document.documentElement);
  Chart.defaults.color = estilo.getPropertyValue('--texto-suave').trim();
  Chart.defaults.borderColor = estilo.getPropertyValue('--borda').trim();
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  const g = new Chart(canvas, config);
  graficos.push(g);
  return g;
}

export function destruirGraficos() {
  while (graficos.length) graficos.pop().destroy();
}

export const corVar = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();

/** Formatação compacta para eixos: R$ 1,2 mil */
export const brlCompacto = (reais) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(reais);

export function vazio(icone, texto) {
  return `<div class="vazio"><div class="grande">${icone}</div>${texto}</div>`;
}
