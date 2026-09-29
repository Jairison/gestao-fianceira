class ErroValidacao extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MES_RE = /^\d{4}-\d{2}$/;
const COR_RE = /^#[0-9a-fA-F]{6}$/;

function texto(valor, campo, { obrigatorio = true, max = 200 } = {}) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    if (obrigatorio) throw new ErroValidacao(`O campo "${campo}" é obrigatório.`);
    return null;
  }
  const s = String(valor).trim();
  if (s.length > max) throw new ErroValidacao(`O campo "${campo}" deve ter no máximo ${max} caracteres.`);
  return s;
}

/** Valida um valor em centavos (inteiro). */
function centavos(valor, campo, { positivo = true } = {}) {
  const n = Number(valor);
  if (!Number.isInteger(n)) throw new ErroValidacao(`O campo "${campo}" deve ser um valor válido.`);
  if (positivo && n <= 0) throw new ErroValidacao(`O campo "${campo}" deve ser maior que zero.`);
  return n;
}

function data(valor, campo, { obrigatorio = true } = {}) {
  if (!valor) {
    if (obrigatorio) throw new ErroValidacao(`O campo "${campo}" é obrigatório.`);
    return null;
  }
  if (!DATA_RE.test(valor) || Number.isNaN(Date.parse(valor))) {
    throw new ErroValidacao(`O campo "${campo}" deve ser uma data válida (AAAA-MM-DD).`);
  }
  return valor;
}

function mes(valor, campo = 'mes') {
  if (!MES_RE.test(valor || '')) throw new ErroValidacao(`O parâmetro "${campo}" deve estar no formato AAAA-MM.`);
  return valor;
}

function opcao(valor, campo, opcoes) {
  if (!opcoes.includes(valor)) throw new ErroValidacao(`O campo "${campo}" deve ser um de: ${opcoes.join(', ')}.`);
  return valor;
}

function cor(valor, padrao) {
  if (!valor) return padrao;
  if (!COR_RE.test(valor)) throw new ErroValidacao('Cor inválida (use o formato #RRGGBB).');
  return valor;
}

function id(valor, campo = 'id', { obrigatorio = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) throw new ErroValidacao(`O campo "${campo}" é obrigatório.`);
    return null;
  }
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new ErroValidacao(`O campo "${campo}" é inválido.`);
  return n;
}

function naoEncontrado(recurso) {
  return new ErroValidacao(`${recurso} não encontrado(a).`, 404);
}

/** Retorna o último dia (AAAA-MM-DD) de um mês AAAA-MM. */
function fimDoMes(m) {
  const [a, mm] = m.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, mm, 0)).getUTCDate();
  return `${m}-${String(ultimo).padStart(2, '0')}`;
}

/** Soma n meses a uma data AAAA-MM-DD, ajustando o dia ao fim do mês quando necessário. */
function somarMeses(dataStr, n) {
  const [a, m, d] = dataStr.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/** Data de hoje (AAAA-MM-DD) no fuso horário local, e não em UTC. */
function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = {
  hoje, ErroValidacao, texto, centavos, data, mes, opcao, cor, id, naoEncontrado, fimDoMes, somarMeses,
};
