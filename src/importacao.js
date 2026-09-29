const crypto = require('node:crypto');
const { db } = require('./db');
const { ErroValidacao } = require('./validacao');

// ---------- Leitura de valores e datas ----------

/** "1.234,56", "-45.90", "R$ 10,00" -> centavos (com sinal). Retorna NaN se inválido. */
function lerValor(texto) {
  let s = String(texto ?? '').replace(/R\$|\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** "31/12/2026", "2026-12-31" ou "20261231..." (OFX) -> "2026-12-31". Retorna null se inválida. */
function lerData(texto) {
  const s = String(texto ?? '').trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return validarData(`${m[3]}-${m[2]}-${m[1]}`);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validarData(`${m[1]}-${m[2]}-${m[3]}`);
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return validarData(`${m[1]}-${m[2]}-${m[3]}`);
  return null;
}

function validarData(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- Formatos de arquivo ----------

/** OFX (SGML ou XML): lê os blocos <STMTTRN>. */
function lerOfx(texto) {
  const tag = (bloco, nome) => {
    const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1].trim() : '';
  };
  return texto.split(/<STMTTRN>/i).slice(1).map((bloco) => ({
    data: lerData(tag(bloco, 'DTPOSTED')),
    valor: lerValor(tag(bloco, 'TRNAMT')),
    descricao: tag(bloco, 'MEMO') || tag(bloco, 'NAME'),
    id: tag(bloco, 'FITID'),
  }));
}

/** Divide o CSV em linhas e células, respeitando aspas. */
function dividirCsv(texto, sep) {
  const linhas = [];
  let linha = [];
  let celula = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { celula += '"'; i++; }
      else if (c === '"') aspas = false;
      else celula += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(celula); celula = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(celula); celula = '';
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
    } else celula += c;
  }
  linha.push(celula);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  return linhas;
}

/** CSV do extrato da conta Nubank (Data,Valor,Identificador,Descrição) ou formato parecido. */
function lerCsv(texto) {
  const primeira = texto.split(/\r?\n/, 1)[0];
  const sep = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ';' : ',';
  const [cabecalho, ...linhas] = dividirCsv(texto, sep);
  const nomes = cabecalho.map((c) => semAcento(c).trim());
  const coluna = (...opcoes) => nomes.findIndex((n) => opcoes.some((o) => n === o || n.startsWith(o)));

  const iData = coluna('data', 'date');
  const iValor = coluna('valor', 'amount', 'quantia');
  const iDesc = coluna('descri', 'historico', 'lancamento', 'title');
  const iId = coluna('identificador', 'id');
  if (iData < 0 || iValor < 0 || iDesc < 0) {
    throw new ErroValidacao('CSV não reconhecido: são necessárias as colunas Data, Valor e Descrição.');
  }
  return linhas.map((l) => ({
    data: lerData(l[iData]),
    valor: lerValor(l[iValor]),
    descricao: (l[iDesc] || '').trim(),
    id: iId >= 0 ? (l[iId] || '').trim() : '',
  }));
}

// ---------- Descrição e categoria ----------

/** Encurta as descrições longas do Nubank mantendo o essencial. */
function limparDescricao(original) {
  const partes = original.split(' - ').map((p) => p.trim()).filter(Boolean);
  const [inicio, nome] = partes;
  const t = semAcento(inicio || '');
  let limpa = original;
  if (t.startsWith('transferencia enviada pelo pix')) limpa = `Pix enviado - ${nome || ''}`;
  else if (t.startsWith('transferencia recebida pelo pix')) limpa = `Pix recebido - ${nome || ''}`;
  else if (t.startsWith('transferencia enviada')) limpa = `Transferência enviada - ${nome || ''}`;
  else if (t.startsWith('transferencia recebida')) limpa = `Transferência recebida - ${nome || ''}`;
  else if (t.startsWith('compra no debito')) limpa = partes.slice(1).join(' - ') || inicio;
  else if (t.startsWith('pagamento de boleto')) limpa = `Boleto - ${nome || ''}`;
  return limpa.replace(/\s+-\s*$/, '').slice(0, 120) || 'Sem descrição';
}

// Palavras-chave -> nome da categoria padrão. A regra só vale se a categoria existir e for do tipo certo.
const REGRAS = [
  [/ifood|rappi|restaurante|lanchonete|padaria|panificadora|mercado|supermercado|atacad|acougue|hortifruti|pizza|burger|lanches|cafe/, 'Alimentação'],
  [/uber|\b99\b|99app|99 pop|cabify|posto|combustiv|ipiranga|estacionamento|metro|onibus|bilhete unico|pedagio|sem parar/, 'Transporte'],
  [/farmacia|drogaria|drogasil|raia|pague menos|hospital|clinica|laboratorio|medic|odonto|dentista|unimed|hapvida/, 'Saúde'],
  [/netflix|spotify|disney|prime video|amazon prime|hbo|youtube|deezer|globoplay|apple\.com|google one|icloud/, 'Assinaturas'],
  [/aluguel|condominio|iptu/, 'Moradia'],
  [/energia|enel|cemig|copel|coelba|celpe|equatorial|sabesp|saneamento|agua e esgoto|internet|telefon|vivo|claro/, 'Contas e serviços'],
  [/escola|faculdade|universidade|curso|udemy|alura|livraria/, 'Educação'],
  [/cinema|ingresso|steam|playstation|xbox|hotel|airbnb|booking/, 'Lazer'],
  [/\biof\b|tarifa|imposto|darf|\bdas\b|multa|juros/, 'Impostos e taxas'],
  [/salario|folha de pag|proventos/, 'Salário'],
  [/rendimento/, 'Investimentos'],
];

// Movimentações para Caixinhas/RDB do Nubank não são gasto nem ganho: sugerimos ignorar.
const RE_CAIXINHA = /\brdb\b|caixinha|aplicacao|resgate/;

/** Chave usada para reconhecer descrições já categorizadas pelo usuário. */
const chaveDescricao = (d) => semAcento(d).replace(/[\d•.*]+/g, ' ').replace(/\s+/g, ' ').trim();

function criarSugestor() {
  const categorias = db.prepare('SELECT id, nome, tipo FROM categorias').all();
  const porNome = new Map(categorias.map((c) => [`${c.tipo}:${semAcento(c.nome)}`, c.id]));

  // Histórico: a categoria mais recente usada para cada descrição.
  const historico = new Map();
  for (const t of db.prepare(`SELECT descricao, tipo, categoria_id FROM transacoes
                               WHERE categoria_id IS NOT NULL ORDER BY data, id`).all()) {
    historico.set(`${t.tipo}:${chaveDescricao(t.descricao)}`, t.categoria_id);
  }

  return (tipo, descricao, original) => {
    const doHistorico = historico.get(`${tipo}:${chaveDescricao(descricao)}`);
    if (doHistorico) return doHistorico;
    const texto = semAcento(`${descricao} ${original}`);
    for (const [re, nome] of REGRAS) {
      const id = re.test(texto) && porNome.get(`${tipo}:${semAcento(nome)}`);
      if (id) return id;
    }
    return null;
  };
}

// ---------- Prévia ----------

/**
 * Lê o arquivo e devolve os lançamentos prontos para revisão, marcando duplicatas.
 * @param {string} conteudo texto do arquivo
 * @param {string} nomeArquivo usado para detectar o formato
 * @param {number} contaId conta de destino
 */
function gerarPrevia(conteudo, nomeArquivo, contaId) {
  const texto = String(conteudo || '').replace(/^﻿/, '');
  if (!texto.trim()) throw new ErroValidacao('O arquivo está vazio.');
  const ehOfx = /\.ofx$/i.test(nomeArquivo || '') || /<OFX>|<STMTTRN>/i.test(texto);
  const brutos = ehOfx ? lerOfx(texto) : lerCsv(texto);

  const sugerir = criarSugestor();
  const jaImportada = db.prepare('SELECT 1 FROM transacoes WHERE conta_id = ? AND id_externo = ?');
  const lancadaManual = db.prepare(`SELECT 1 FROM transacoes WHERE conta_id = ? AND data = ? AND valor = ?
                                    AND tipo = ? AND id_externo IS NULL`);
  const repeticoes = new Map();
  const itens = [];
  let invalidas = 0;

  for (const b of brutos) {
    if (!b.data || !Number.isFinite(b.valor) || b.valor === 0) { invalidas++; continue; }
    const tipo = b.valor > 0 ? 'receita' : 'despesa';
    const valor = Math.abs(b.valor);
    const original = b.descricao || 'Sem descrição';
    const descricao = limparDescricao(original);

    // Sem identificador no arquivo, cria um a partir do conteúdo (numerando linhas idênticas).
    let idExterno = b.id;
    if (!idExterno) {
      const base = `${b.data}|${b.valor}|${original}`;
      const n = (repeticoes.get(base) || 0) + 1;
      repeticoes.set(base, n);
      idExterno = `h:${crypto.createHash('sha1').update(`${base}|${n}`).digest('hex').slice(0, 20)}`;
    }

    let aviso = null;
    if (jaImportada.get(contaId, idExterno)) aviso = 'Já importada';
    else if (lancadaManual.get(contaId, b.data, valor, tipo)) aviso = 'Possível duplicata (mesma data e valor já lançados)';
    else if (RE_CAIXINHA.test(semAcento(original))) aviso = 'Movimentação de Caixinha/investimento';

    itens.push({
      id_externo: idExterno,
      data: b.data,
      tipo,
      valor,
      descricao,
      observacao: descricao !== original ? original.slice(0, 500) : null,
      categoria_id: sugerir(tipo, descricao, original),
      aviso,
      duplicada: aviso === 'Já importada',
      selecionada: !aviso,
    });
  }

  itens.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  return { formato: ehOfx ? 'OFX' : 'CSV', itens, invalidas };
}

module.exports = { gerarPrevia, lerValor, lerData, limparDescricao };
