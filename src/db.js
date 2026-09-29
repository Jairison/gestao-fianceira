const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'financas.db'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

// Valores monetários são armazenados em centavos (INTEGER) para evitar erros de ponto flutuante.
db.exec(`
CREATE TABLE IF NOT EXISTS contas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT    NOT NULL,
  tipo          TEXT    NOT NULL CHECK (tipo IN ('corrente','poupanca','carteira','cartao','investimento')),
  saldo_inicial INTEGER NOT NULL DEFAULT 0,
  cor           TEXT    NOT NULL DEFAULT '#6366f1',
  arquivada     INTEGER NOT NULL DEFAULT 0,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categorias (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  nome  TEXT NOT NULL,
  tipo  TEXT NOT NULL CHECK (tipo IN ('receita','despesa')),
  cor   TEXT NOT NULL DEFAULT '#64748b',
  UNIQUE (nome, tipo)
);

CREATE TABLE IF NOT EXISTS transacoes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo             TEXT    NOT NULL CHECK (tipo IN ('receita','despesa','transferencia')),
  descricao        TEXT    NOT NULL,
  valor            INTEGER NOT NULL CHECK (valor > 0),
  data             TEXT    NOT NULL,
  conta_id         INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  conta_destino_id INTEGER REFERENCES contas(id) ON DELETE CASCADE,
  categoria_id     INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  pago             INTEGER NOT NULL DEFAULT 1,
  observacao       TEXT,
  grupo            TEXT,
  parcela_num      INTEGER,
  parcela_total    INTEGER,
  criado_em        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transacoes_data  ON transacoes(data);
CREATE INDEX IF NOT EXISTS idx_transacoes_conta ON transacoes(conta_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_grupo ON transacoes(grupo);

CREATE TABLE IF NOT EXISTS orcamentos (
  categoria_id INTEGER PRIMARY KEY REFERENCES categorias(id) ON DELETE CASCADE,
  valor        INTEGER NOT NULL CHECK (valor > 0)
);

CREATE TABLE IF NOT EXISTS metas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT    NOT NULL,
  valor_alvo  INTEGER NOT NULL CHECK (valor_alvo > 0),
  valor_atual INTEGER NOT NULL DEFAULT 0,
  prazo       TEXT,
  cor         TEXT    NOT NULL DEFAULT '#10b981',
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);
`);

// Migração: identificador da transação no banco de origem (extratos importados), para evitar duplicatas.
const colunasTransacoes = db.prepare('PRAGMA table_info(transacoes)').all().map((c) => c.name);
if (!colunasTransacoes.includes('id_externo')) db.exec('ALTER TABLE transacoes ADD COLUMN id_externo TEXT');
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_transacoes_externo
         ON transacoes(conta_id, id_externo) WHERE id_externo IS NOT NULL`);

function seed() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM categorias').get();
  if (n > 0) return;

  const categorias = [
    ['Salário', 'receita', '#10b981'],
    ['Freelance', 'receita', '#14b8a6'],
    ['Investimentos', 'receita', '#06b6d4'],
    ['Outras receitas', 'receita', '#84cc16'],
    ['Moradia', 'despesa', '#6366f1'],
    ['Alimentação', 'despesa', '#f59e0b'],
    ['Transporte', 'despesa', '#3b82f6'],
    ['Saúde', 'despesa', '#ef4444'],
    ['Educação', 'despesa', '#8b5cf6'],
    ['Lazer', 'despesa', '#ec4899'],
    ['Compras', 'despesa', '#f97316'],
    ['Contas e serviços', 'despesa', '#0ea5e9'],
    ['Assinaturas', 'despesa', '#a855f7'],
    ['Impostos e taxas', 'despesa', '#78716c'],
    ['Outras despesas', 'despesa', '#64748b'],
  ];
  const insCat = db.prepare('INSERT INTO categorias (nome, tipo, cor) VALUES (?, ?, ?)');
  const insConta = db.prepare('INSERT INTO contas (nome, tipo, saldo_inicial, cor) VALUES (?, ?, ?, ?)');

  transaction(() => {
    for (const c of categorias) insCat.run(...c);
    insConta.run('Carteira', 'carteira', 0, '#10b981');
    insConta.run('Conta corrente', 'corrente', 0, '#6366f1');
  });
}

/** Executa fn dentro de uma transação SQL, com rollback em caso de erro. */
function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

seed();

module.exports = { db, transaction, DATA_DIR };
