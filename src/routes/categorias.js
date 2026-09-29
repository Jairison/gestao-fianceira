const express = require('express');
const { db } = require('../db');
const v = require('../validacao');

const router = express.Router();

function lerCorpo(body) {
  return {
    nome: v.texto(body.nome, 'nome', { max: 60 }),
    tipo: v.opcao(body.tipo, 'tipo', ['receita', 'despesa']),
    cor: v.cor(body.cor, '#64748b'),
  };
}

function tratarDuplicada(err) {
  if (String(err.message).includes('UNIQUE')) {
    throw new v.ErroValidacao('Já existe uma categoria com esse nome e tipo.', 409);
  }
  throw err;
}

router.get('/', (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM transacoes t WHERE t.categoria_id = c.id) AS total_transacoes
    FROM categorias c ORDER BY c.tipo DESC, c.nome
  `).all());
});

router.post('/', (req, res) => {
  const c = lerCorpo(req.body);
  try {
    const r = db.prepare('INSERT INTO categorias (nome, tipo, cor) VALUES (?, ?, ?)').run(c.nome, c.tipo, c.cor);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch (err) { tratarDuplicada(err); }
});

router.put('/:id', (req, res) => {
  const id = v.id(req.params.id);
  const c = lerCorpo(req.body);
  const atual = db.prepare('SELECT tipo FROM categorias WHERE id = ?').get(id);
  if (!atual) throw v.naoEncontrado('Categoria');
  if (atual.tipo !== c.tipo) {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM transacoes WHERE categoria_id = ?').get(id);
    if (n > 0) throw new v.ErroValidacao('Não é possível alterar o tipo de uma categoria que já possui transações.');
  }
  try {
    db.prepare('UPDATE categorias SET nome = ?, tipo = ?, cor = ? WHERE id = ?').run(c.nome, c.tipo, c.cor, id);
    res.json({ ok: true });
  } catch (err) { tratarDuplicada(err); }
});

// Transações da categoria excluída ficam "sem categoria" (ON DELETE SET NULL).
router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM categorias WHERE id = ?').run(v.id(req.params.id));
  if (!r.changes) throw v.naoEncontrado('Categoria');
  res.json({ ok: true });
});

module.exports = { router };
