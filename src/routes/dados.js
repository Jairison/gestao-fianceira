const express = require('express');
const { db, transaction } = require('../db');
const v = require('../validacao');
const { montarFiltros, SQL_SELECT } = require('./transacoes');

const router = express.Router();
const TABELAS = ['contas', 'categorias', 'transacoes', 'orcamentos', 'metas'];
const TIPO_LABEL = { receita: 'Receita', despesa: 'Despesa', transferencia: 'Transferência' };

function celulaCsv(valor) {
  if (valor === null || valor === undefined) return '';
  const s = String(valor);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSV com ";" e vírgula decimal, que abre corretamente no Excel em português.
router.get('/exportar/csv', (req, res) => {
  const { sql, params } = montarFiltros(req.query);
  const linhas = db.prepare(`${SQL_SELECT} ${sql} ORDER BY t.data, t.id`).all(...params);

  const cabecalho = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Conta destino', 'Valor', 'Situação', 'Parcela', 'Observação'];
  const corpo = linhas.map((t) => [
    t.data.split('-').reverse().join('/'),
    TIPO_LABEL[t.tipo],
    t.descricao,
    t.categoria_nome,
    t.conta_nome,
    t.conta_destino_nome,
    ((t.tipo === 'despesa' ? -t.valor : t.valor) / 100).toFixed(2).replace('.', ','),
    t.pago ? 'Pago' : 'Pendente',
    t.parcela_total ? `${t.parcela_num}/${t.parcela_total}` : '',
    t.observacao,
  ].map(celulaCsv).join(';'));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="transacoes-${v.hoje()}.csv"`);
  res.send(`﻿${[cabecalho.join(';'), ...corpo].join('\r\n')}`);
});

router.get('/backup', (req, res) => {
  const dados = { versao: 1, gerado_em: new Date().toISOString() };
  for (const tabela of TABELAS) dados[tabela] = db.prepare(`SELECT * FROM ${tabela}`).all();
  res.setHeader('Content-Disposition', `attachment; filename="backup-financas-${v.hoje()}.json"`);
  res.json(dados);
});

// Restaura um backup, substituindo TODOS os dados atuais.
router.post('/backup', (req, res) => {
  const dados = req.body;
  if (!dados || dados.versao !== 1 || !TABELAS.every((t) => Array.isArray(dados[t]))) {
    throw new v.ErroValidacao('Arquivo de backup inválido.');
  }

  const colunas = {};
  for (const tabela of TABELAS) {
    colunas[tabela] = db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
  }

  transaction(() => {
    // Ordem inversa por causa das chaves estrangeiras.
    for (const tabela of [...TABELAS].reverse()) db.exec(`DELETE FROM ${tabela}`);
    db.exec("DELETE FROM sqlite_sequence");
    for (const tabela of TABELAS) {
      const cols = colunas[tabela];
      const ins = db.prepare(`INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
      for (const linha of dados[tabela]) {
        ins.run(...cols.map((c) => (linha[c] === undefined ? null : linha[c])));
      }
    }
  });

  res.json({ ok: true, registros: Object.fromEntries(TABELAS.map((t) => [t, dados[t].length])) });
});

module.exports = { router };
