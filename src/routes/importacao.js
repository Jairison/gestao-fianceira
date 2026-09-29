const express = require('express');
const { db, transaction } = require('../db');
const v = require('../validacao');
const { gerarPrevia } = require('../importacao');
const { lerCorpo } = require('./transacoes');

const router = express.Router();
const MAX_ITENS = 5000;

function contaValida(id) {
  const contaId = v.id(id, 'conta');
  if (!db.prepare('SELECT 1 FROM contas WHERE id = ?').get(contaId)) throw v.naoEncontrado('Conta');
  return contaId;
}

// Lê o arquivo do extrato e devolve os lançamentos para revisão (nada é gravado).
router.post('/previa', (req, res) => {
  const contaId = contaValida(req.body.conta_id);
  const previa = gerarPrevia(req.body.conteudo, req.body.nome_arquivo, contaId);
  if (!previa.itens.length) throw new v.ErroValidacao('Nenhum lançamento encontrado no arquivo.');
  res.json(previa);
});

// Grava os lançamentos revisados. Itens já importados (mesmo id_externo) são ignorados.
router.post('/confirmar', (req, res) => {
  const contaId = contaValida(req.body.conta_id);
  const itens = req.body.itens;
  if (!Array.isArray(itens) || !itens.length) throw new v.ErroValidacao('Selecione ao menos um lançamento.');
  if (itens.length > MAX_ITENS) throw new v.ErroValidacao(`Importe no máximo ${MAX_ITENS} lançamentos por vez.`);

  const validados = itens.map((item, i) => {
    try {
      const t = lerCorpo({ ...item, conta_id: contaId, pago: true });
      if (t.tipo === 'transferencia') throw new v.ErroValidacao('Tipo inválido.');
      return { ...t, id_externo: v.texto(item.id_externo, 'identificador', { max: 200 }) };
    } catch (err) {
      throw new v.ErroValidacao(`Lançamento ${i + 1} (${item.descricao || 'sem descrição'}): ${err.message}`);
    }
  });

  const ins = db.prepare(`
    INSERT INTO transacoes (tipo, descricao, valor, data, conta_id, categoria_id, pago, observacao, id_externo)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT DO NOTHING
  `);
  const importadas = transaction(() => validados.reduce((n, t) => n + Number(
    ins.run(t.tipo, t.descricao, t.valor, t.data, contaId, t.categoria_id, t.observacao, t.id_externo).changes,
  ), 0));

  res.status(201).json({ importadas, ignoradas: validados.length - importadas });
});

module.exports = { router };
