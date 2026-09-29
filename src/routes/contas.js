const express = require('express');
const { db } = require('../db');
const v = require('../validacao');

const router = express.Router();
const TIPOS = ['corrente', 'poupanca', 'carteira', 'cartao', 'investimento'];

// Saldo = saldo inicial + receitas - despesas - transferências enviadas + transferências recebidas (apenas pagas).
const SQL_SALDO = `
  c.saldo_inicial
  + COALESCE((SELECT SUM(CASE WHEN t.tipo = 'receita' THEN t.valor ELSE -t.valor END)
              FROM transacoes t WHERE t.conta_id = c.id AND t.pago = 1), 0)
  + COALESCE((SELECT SUM(t.valor) FROM transacoes t
              WHERE t.conta_destino_id = c.id AND t.tipo = 'transferencia' AND t.pago = 1), 0)
`;

function listarContas({ incluirArquivadas = true } = {}) {
  return db.prepare(`
    SELECT c.*, (${SQL_SALDO}) AS saldo_atual
    FROM contas c
    ${incluirArquivadas ? '' : 'WHERE c.arquivada = 0'}
    ORDER BY c.arquivada, c.nome
  `).all();
}

function lerCorpo(body) {
  return {
    nome: v.texto(body.nome, 'nome', { max: 60 }),
    tipo: v.opcao(body.tipo, 'tipo', TIPOS),
    saldo_inicial: v.centavos(body.saldo_inicial ?? 0, 'saldo inicial', { positivo: false }),
    cor: v.cor(body.cor, '#6366f1'),
    arquivada: body.arquivada ? 1 : 0,
  };
}

router.get('/', (req, res) => {
  res.json(listarContas({ incluirArquivadas: req.query.arquivadas !== '0' }));
});

router.post('/', (req, res) => {
  const c = lerCorpo(req.body);
  const r = db.prepare('INSERT INTO contas (nome, tipo, saldo_inicial, cor, arquivada) VALUES (?, ?, ?, ?, ?)')
    .run(c.nome, c.tipo, c.saldo_inicial, c.cor, c.arquivada);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

router.put('/:id', (req, res) => {
  const id = v.id(req.params.id);
  const c = lerCorpo(req.body);
  const r = db.prepare('UPDATE contas SET nome = ?, tipo = ?, saldo_inicial = ?, cor = ?, arquivada = ? WHERE id = ?')
    .run(c.nome, c.tipo, c.saldo_inicial, c.cor, c.arquivada, id);
  if (!r.changes) throw v.naoEncontrado('Conta');
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = v.id(req.params.id);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM transacoes WHERE conta_id = ? OR conta_destino_id = ?').get(id, id);
  if (n > 0 && req.query.forcar !== '1') {
    throw new v.ErroValidacao(
      `Esta conta possui ${n} transação(ões). Arquive a conta ou confirme a exclusão de todas as transações.`, 409,
    );
  }
  const r = db.prepare('DELETE FROM contas WHERE id = ?').run(id);
  if (!r.changes) throw v.naoEncontrado('Conta');
  res.json({ ok: true });
});

module.exports = { router, listarContas, SQL_SALDO };
