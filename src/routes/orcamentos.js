const express = require('express');
const { db } = require('../db');
const v = require('../validacao');

const router = express.Router();

/**
 * Orçamentos são limites mensais recorrentes por categoria de despesa.
 * O gasto considera todas as despesas do mês (pagas e pendentes).
 */
function orcamentosDoMes(mes) {
  return db.prepare(`
    SELECT cat.id AS categoria_id, cat.nome AS categoria_nome, cat.cor AS categoria_cor,
           o.valor AS limite,
           COALESCE((SELECT SUM(t.valor) FROM transacoes t
                     WHERE t.categoria_id = cat.id AND t.tipo = 'despesa'
                       AND t.data BETWEEN ? AND ?), 0) AS gasto
    FROM orcamentos o
    JOIN categorias cat ON cat.id = o.categoria_id
    ORDER BY cat.nome
  `).all(`${mes}-01`, v.fimDoMes(mes));
}

router.get('/', (req, res) => {
  const mes = v.mes(req.query.mes || v.hoje().slice(0, 7));
  res.json(orcamentosDoMes(mes));
});

// Cria ou atualiza o limite de uma categoria.
router.put('/:categoria_id', (req, res) => {
  const categoriaId = v.id(req.params.categoria_id, 'categoria');
  const valor = v.centavos(req.body.valor, 'limite');
  const cat = db.prepare('SELECT tipo FROM categorias WHERE id = ?').get(categoriaId);
  if (!cat) throw v.naoEncontrado('Categoria');
  if (cat.tipo !== 'despesa') throw new v.ErroValidacao('Orçamentos só podem ser definidos para categorias de despesa.');

  db.prepare(`
    INSERT INTO orcamentos (categoria_id, valor) VALUES (?, ?)
    ON CONFLICT (categoria_id) DO UPDATE SET valor = excluded.valor
  `).run(categoriaId, valor);
  res.json({ ok: true });
});

router.delete('/:categoria_id', (req, res) => {
  const r = db.prepare('DELETE FROM orcamentos WHERE categoria_id = ?').run(v.id(req.params.categoria_id, 'categoria'));
  if (!r.changes) throw v.naoEncontrado('Orçamento');
  res.json({ ok: true });
});

module.exports = { router, orcamentosDoMes };
