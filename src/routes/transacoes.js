const express = require('express');
const crypto = require('node:crypto');
const { db, transaction } = require('../db');
const v = require('../validacao');

const router = express.Router();
const TIPOS = ['receita', 'despesa', 'transferencia'];
const MAX_REPETICOES = 120;

const SQL_SELECT = `
  SELECT t.*,
         c.nome  AS conta_nome,   c.cor  AS conta_cor,
         cd.nome AS conta_destino_nome,
         cat.nome AS categoria_nome, cat.cor AS categoria_cor
  FROM transacoes t
  JOIN contas c            ON c.id = t.conta_id
  LEFT JOIN contas cd      ON cd.id = t.conta_destino_id
  LEFT JOIN categorias cat ON cat.id = t.categoria_id
`;

/** Monta cláusula WHERE a partir dos filtros da query string. */
function montarFiltros(q) {
  const where = [];
  const params = [];

  if (q.mes) {
    const m = v.mes(q.mes);
    where.push('t.data BETWEEN ? AND ?');
    params.push(`${m}-01`, v.fimDoMes(m));
  }
  if (q.inicio) { where.push('t.data >= ?'); params.push(v.data(q.inicio, 'inicio')); }
  if (q.fim) { where.push('t.data <= ?'); params.push(v.data(q.fim, 'fim')); }
  if (q.conta_id) {
    const id = v.id(q.conta_id, 'conta_id');
    where.push('(t.conta_id = ? OR t.conta_destino_id = ?)');
    params.push(id, id);
  }
  if (q.categoria_id) {
    if (q.categoria_id === 'nenhuma') where.push("t.categoria_id IS NULL AND t.tipo <> 'transferencia'");
    else { where.push('t.categoria_id = ?'); params.push(v.id(q.categoria_id, 'categoria_id')); }
  }
  if (q.tipo) { where.push('t.tipo = ?'); params.push(v.opcao(q.tipo, 'tipo', TIPOS)); }
  if (q.pago === '0' || q.pago === '1') { where.push('t.pago = ?'); params.push(Number(q.pago)); }
  if (q.busca) {
    where.push('(t.descricao LIKE ? OR t.observacao LIKE ?)');
    const termo = `%${String(q.busca).trim()}%`;
    params.push(termo, termo);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/** Valida o corpo de uma transação e retorna os campos normalizados. */
function lerCorpo(body) {
  const t = {
    tipo: v.opcao(body.tipo, 'tipo', TIPOS),
    descricao: v.texto(body.descricao, 'descrição', { max: 120 }),
    valor: v.centavos(body.valor, 'valor'),
    data: v.data(body.data, 'data'),
    conta_id: v.id(body.conta_id, 'conta'),
    conta_destino_id: null,
    categoria_id: null,
    pago: body.pago === false || body.pago === 0 || body.pago === '0' ? 0 : 1,
    observacao: v.texto(body.observacao, 'observação', { obrigatorio: false, max: 500 }),
  };

  if (!db.prepare('SELECT 1 FROM contas WHERE id = ?').get(t.conta_id)) throw v.naoEncontrado('Conta');

  if (t.tipo === 'transferencia') {
    t.conta_destino_id = v.id(body.conta_destino_id, 'conta de destino');
    if (t.conta_destino_id === t.conta_id) throw new v.ErroValidacao('A conta de destino deve ser diferente da conta de origem.');
    if (!db.prepare('SELECT 1 FROM contas WHERE id = ?').get(t.conta_destino_id)) throw v.naoEncontrado('Conta de destino');
  } else {
    t.categoria_id = v.id(body.categoria_id, 'categoria', { obrigatorio: false });
    if (t.categoria_id) {
      const cat = db.prepare('SELECT tipo FROM categorias WHERE id = ?').get(t.categoria_id);
      if (!cat) throw v.naoEncontrado('Categoria');
      if (cat.tipo !== t.tipo) throw new v.ErroValidacao(`A categoria escolhida não é de ${t.tipo}.`);
    }
  }
  return t;
}

router.get('/', (req, res) => {
  const { sql, params } = montarFiltros(req.query);
  const itens = db.prepare(`${SQL_SELECT} ${sql} ORDER BY t.data DESC, t.id DESC`).all(...params);
  const totais = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN t.tipo = 'receita' THEN t.valor END), 0) AS receitas,
      COALESCE(SUM(CASE WHEN t.tipo = 'despesa' THEN t.valor END), 0) AS despesas
    FROM transacoes t ${sql}
  `).get(...params);
  res.json({ itens, totais: { ...totais, saldo: totais.receitas - totais.despesas } });
});

router.get('/:id', (req, res) => {
  const t = db.prepare(`${SQL_SELECT} WHERE t.id = ?`).get(v.id(req.params.id));
  if (!t) throw v.naoEncontrado('Transação');
  res.json(t);
});

/**
 * Cria uma transação. Aceita opcionalmente `repeticao: { modo, vezes }`:
 *  - modo "parcelado": divide o valor total em N parcelas mensais;
 *  - modo "fixo": repete o mesmo valor por N meses (ex.: aluguel, assinatura).
 * Parcelas com data futura são criadas como pendentes.
 */
router.post('/', (req, res) => {
  const base = lerCorpo(req.body);
  const rep = req.body.repeticao;
  let vezes = 1;
  let modo = null;

  if (rep && Number(rep.vezes) > 1) {
    modo = v.opcao(rep.modo, 'modo de repetição', ['parcelado', 'fixo']);
    vezes = Number(rep.vezes);
    if (!Number.isInteger(vezes) || vezes > MAX_REPETICOES) {
      throw new v.ErroValidacao(`O número de repetições deve ser um inteiro entre 2 e ${MAX_REPETICOES}.`);
    }
    if (modo === 'parcelado' && base.valor < vezes) {
      throw new v.ErroValidacao('O valor é pequeno demais para ser dividido nesse número de parcelas.');
    }
  }

  const hoje = v.hoje();
  const grupo = vezes > 1 ? crypto.randomUUID() : null;
  const valorParcela = modo === 'parcelado' ? Math.floor(base.valor / vezes) : base.valor;
  const resto = modo === 'parcelado' ? base.valor - valorParcela * vezes : 0;

  const ins = db.prepare(`
    INSERT INTO transacoes (tipo, descricao, valor, data, conta_id, conta_destino_id, categoria_id,
                            pago, observacao, grupo, parcela_num, parcela_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const ids = transaction(() => {
    const criados = [];
    for (let i = 0; i < vezes; i++) {
      const dataParcela = v.somarMeses(base.data, i);
      const pago = i === 0 ? base.pago : (dataParcela <= hoje ? base.pago : 0);
      const r = ins.run(
        base.tipo, base.descricao, valorParcela + (i === 0 ? resto : 0), dataParcela,
        base.conta_id, base.conta_destino_id, base.categoria_id, pago, base.observacao,
        grupo, grupo ? i + 1 : null, grupo ? vezes : null,
      );
      criados.push(Number(r.lastInsertRowid));
    }
    return criados;
  });

  res.status(201).json({ id: ids[0], ids });
});

router.put('/:id', (req, res) => {
  const id = v.id(req.params.id);
  const t = lerCorpo(req.body);
  const r = db.prepare(`
    UPDATE transacoes SET tipo = ?, descricao = ?, valor = ?, data = ?, conta_id = ?, conta_destino_id = ?,
                          categoria_id = ?, pago = ?, observacao = ?
    WHERE id = ?
  `).run(t.tipo, t.descricao, t.valor, t.data, t.conta_id, t.conta_destino_id, t.categoria_id, t.pago, t.observacao, id);
  if (!r.changes) throw v.naoEncontrado('Transação');
  res.json({ ok: true });
});

router.patch('/:id/pago', (req, res) => {
  const r = db.prepare('UPDATE transacoes SET pago = ? WHERE id = ?')
    .run(req.body.pago ? 1 : 0, v.id(req.params.id));
  if (!r.changes) throw v.naoEncontrado('Transação');
  res.json({ ok: true });
});

/** escopo: "unica" (padrão), "futuras" (esta e as próximas do grupo) ou "todas" (todo o grupo). */
router.delete('/:id', (req, res) => {
  const id = v.id(req.params.id);
  const escopo = v.opcao(req.query.escopo || 'unica', 'escopo', ['unica', 'futuras', 'todas']);
  const t = db.prepare('SELECT grupo, parcela_num FROM transacoes WHERE id = ?').get(id);
  if (!t) throw v.naoEncontrado('Transação');

  let r;
  if (escopo === 'unica' || !t.grupo) r = db.prepare('DELETE FROM transacoes WHERE id = ?').run(id);
  else if (escopo === 'futuras') r = db.prepare('DELETE FROM transacoes WHERE grupo = ? AND parcela_num >= ?').run(t.grupo, t.parcela_num);
  else r = db.prepare('DELETE FROM transacoes WHERE grupo = ?').run(t.grupo);

  res.json({ ok: true, removidas: Number(r.changes) });
});

module.exports = { router, montarFiltros, lerCorpo, SQL_SELECT };
