const express = require('express');
const { db } = require('../db');
const v = require('../validacao');

const router = express.Router();

function lerCorpo(body) {
  return {
    nome: v.texto(body.nome, 'nome', { max: 80 }),
    valor_alvo: v.centavos(body.valor_alvo, 'valor alvo'),
    valor_atual: v.centavos(body.valor_atual ?? 0, 'valor atual', { positivo: false }),
    prazo: v.data(body.prazo, 'prazo', { obrigatorio: false }),
    cor: v.cor(body.cor, '#10b981'),
  };
}

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM metas ORDER BY (valor_atual >= valor_alvo), prazo IS NULL, prazo, nome').all());
});

router.post('/', (req, res) => {
  const m = lerCorpo(req.body);
  const r = db.prepare('INSERT INTO metas (nome, valor_alvo, valor_atual, prazo, cor) VALUES (?, ?, ?, ?, ?)')
    .run(m.nome, m.valor_alvo, m.valor_atual, m.prazo, m.cor);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

router.put('/:id', (req, res) => {
  const m = lerCorpo(req.body);
  const r = db.prepare('UPDATE metas SET nome = ?, valor_alvo = ?, valor_atual = ?, prazo = ?, cor = ? WHERE id = ?')
    .run(m.nome, m.valor_alvo, m.valor_atual, m.prazo, m.cor, v.id(req.params.id));
  if (!r.changes) throw v.naoEncontrado('Meta');
  res.json({ ok: true });
});

// Aporte (valor positivo) ou resgate (valor negativo). O saldo da meta não fica negativo.
router.post('/:id/aporte', (req, res) => {
  const id = v.id(req.params.id);
  const valor = v.centavos(req.body.valor, 'valor', { positivo: false });
  if (valor === 0) throw new v.ErroValidacao('Informe um valor diferente de zero.');
  const meta = db.prepare('SELECT valor_atual FROM metas WHERE id = ?').get(id);
  if (!meta) throw v.naoEncontrado('Meta');
  if (meta.valor_atual + valor < 0) throw new v.ErroValidacao('O resgate é maior que o valor guardado na meta.');
  db.prepare('UPDATE metas SET valor_atual = valor_atual + ? WHERE id = ?').run(valor, id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM metas WHERE id = ?').run(v.id(req.params.id));
  if (!r.changes) throw v.naoEncontrado('Meta');
  res.json({ ok: true });
});

module.exports = { router };
