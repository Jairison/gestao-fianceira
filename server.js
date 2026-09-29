const path = require('node:path');
const express = require('express');
const { ErroValidacao } = require('./src/validacao');

const app = express();
const PORTA = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' })); // limite alto para restauração de backups
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist')));

app.use('/api/contas', require('./src/routes/contas').router);
app.use('/api/categorias', require('./src/routes/categorias').router);
app.use('/api/transacoes', require('./src/routes/transacoes').router);
app.use('/api/orcamentos', require('./src/routes/orcamentos').router);
app.use('/api/metas', require('./src/routes/metas').router);
app.use('/api/importacao', require('./src/routes/importacao').router);
app.use('/api', require('./src/routes/relatorios').router);
app.use('/api', require('./src/routes/dados').router);

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ErroValidacao) return res.status(err.status).json({ erro: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

app.listen(PORTA, () => {
  console.log(`Gestão financeira rodando em http://localhost:${PORTA}`);
});
