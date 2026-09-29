const express = require('express');
const { db } = require('../db');
const v = require('../validacao');
const { listarContas } = require('./contas');
const { orcamentosDoMes } = require('./orcamentos');

const router = express.Router();

/** Receitas e despesas agrupadas por mês (AAAA-MM) no intervalo. */
function porMes(inicio, fim) {
  return db.prepare(`
    SELECT substr(data, 1, 7) AS mes,
           COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor END), 0) AS receitas,
           COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor END), 0) AS despesas
    FROM transacoes
    WHERE data BETWEEN ? AND ? AND tipo <> 'transferencia'
    GROUP BY mes ORDER BY mes
  `).all(inicio, fim);
}

function porCategoria(tipo, inicio, fim) {
  return db.prepare(`
    SELECT t.categoria_id, COALESCE(c.nome, 'Sem categoria') AS nome, COALESCE(c.cor, '#94a3b8') AS cor,
           SUM(t.valor) AS total, COUNT(*) AS quantidade
    FROM transacoes t LEFT JOIN categorias c ON c.id = t.categoria_id
    WHERE t.tipo = ? AND t.data BETWEEN ? AND ?
    GROUP BY t.categoria_id ORDER BY total DESC
  `).all(tipo, inicio, fim);
}

/** Preenche meses sem movimento com zero, para gráficos contínuos. */
function completarMeses(linhas, mesInicio, quantidade) {
  const mapa = new Map(linhas.map((l) => [l.mes, l]));
  const [a, m] = mesInicio.split('-').map(Number);
  return Array.from({ length: quantidade }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 + i, 1));
    const chave = d.toISOString().slice(0, 7);
    return mapa.get(chave) || { mes: chave, receitas: 0, despesas: 0 };
  });
}

function mesesEntre(inicio, fim) {
  const [a1, m1] = inicio.split('-').map(Number);
  const [a2, m2] = fim.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1) + 1;
}

router.get('/dashboard', (req, res) => {
  const mes = v.mes(req.query.mes || v.hoje().slice(0, 7));
  const inicio = `${mes}-01`;
  const fim = v.fimDoMes(mes);
  const hoje = v.hoje();

  const contas = listarContas({ incluirArquivadas: false });
  const resumo = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor END), 0) AS receitas,
      COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor END), 0) AS despesas,
      COALESCE(SUM(CASE WHEN tipo = 'receita' AND pago = 0 THEN valor END), 0) AS receitas_pendentes,
      COALESCE(SUM(CASE WHEN tipo = 'despesa' AND pago = 0 THEN valor END), 0) AS despesas_pendentes
    FROM transacoes WHERE data BETWEEN ? AND ?
  `).get(inicio, fim);

  const inicio12 = v.somarMeses(inicio, -11);
  const evolucao = completarMeses(porMes(inicio12, fim), inicio12.slice(0, 7), 12);

  const pendentes = db.prepare(`
    SELECT t.id, t.tipo, t.descricao, t.valor, t.data, t.parcela_num, t.parcela_total,
           c.nome AS conta_nome, cat.nome AS categoria_nome, cat.cor AS categoria_cor
    FROM transacoes t
    JOIN contas c ON c.id = t.conta_id
    LEFT JOIN categorias cat ON cat.id = t.categoria_id
    WHERE t.pago = 0 AND t.data <= ?
    ORDER BY t.data, t.id LIMIT 10
  `).all(v.somarMeses(hoje, 1));

  const metas = db.prepare('SELECT * FROM metas WHERE valor_atual < valor_alvo ORDER BY prazo IS NULL, prazo LIMIT 4').all();

  res.json({
    mes,
    hoje,
    saldo_total: contas.reduce((s, c) => s + c.saldo_atual, 0),
    contas,
    resumo: { ...resumo, balanco: resumo.receitas - resumo.despesas },
    despesas_por_categoria: porCategoria('despesa', inicio, fim),
    evolucao,
    pendentes,
    orcamentos: orcamentosDoMes(mes),
    metas,
  });
});

router.get('/relatorios', (req, res) => {
  const inicio = v.data(req.query.inicio, 'inicio');
  const fim = v.data(req.query.fim, 'fim');
  if (inicio > fim) throw new v.ErroValidacao('A data inicial deve ser anterior à data final.');

  const nMeses = mesesEntre(inicio.slice(0, 7), fim.slice(0, 7));
  const mensal = completarMeses(porMes(inicio, fim), inicio.slice(0, 7), Math.min(nMeses, 120));
  const receitas = porCategoria('receita', inicio, fim);
  const despesas = porCategoria('despesa', inicio, fim);
  const totalReceitas = receitas.reduce((s, c) => s + c.total, 0);
  const totalDespesas = despesas.reduce((s, c) => s + c.total, 0);

  const maioresDespesas = db.prepare(`
    SELECT t.id, t.descricao, t.valor, t.data, cat.nome AS categoria_nome, cat.cor AS categoria_cor
    FROM transacoes t LEFT JOIN categorias cat ON cat.id = t.categoria_id
    WHERE t.tipo = 'despesa' AND t.data BETWEEN ? AND ?
    ORDER BY t.valor DESC LIMIT 10
  `).all(inicio, fim);

  res.json({
    inicio, fim,
    totais: {
      receitas: totalReceitas,
      despesas: totalDespesas,
      balanco: totalReceitas - totalDespesas,
      taxa_poupanca: totalReceitas ? (totalReceitas - totalDespesas) / totalReceitas : 0,
      media_mensal_despesas: Math.round(totalDespesas / nMeses),
      media_mensal_receitas: Math.round(totalReceitas / nMeses),
    },
    mensal,
    receitas_por_categoria: receitas,
    despesas_por_categoria: despesas,
    maiores_despesas: maioresDespesas,
  });
});

module.exports = { router };
