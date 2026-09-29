# 💰 Minhas Finanças

Sistema de gestão financeira pessoal que roda no seu computador. Os dados ficam salvos localmente em `data/financas.db` (SQLite) — nada é enviado para a internet.

## Como usar

Requisito: [Node.js](https://nodejs.org) **22.13 ou superior**.

```bash
npm install     # apenas na primeira vez
npm start       # inicia o sistema
```

Abra **http://localhost:3000** no navegador.

Para usar outra porta: `PORT=8080 npm start` (no PowerShell: `$env:PORT=8080; npm start`).

## Funcionalidades

| Módulo | O que faz |
|---|---|
| **Painel** | Saldo total, receitas/despesas/balanço do mês, gráfico dos últimos 12 meses, despesas por categoria, contas a pagar/receber (com botão "marcar como pago"), orçamentos e metas |
| **Transações** | Receitas, despesas e transferências entre contas. Parcelamento (divide o valor) ou repetição mensal (mesmo valor). Situação pago/pendente/atrasado. Filtros por mês, tipo, conta, categoria, situação e busca. Exportação CSV |
| **Contas** | Conta corrente, poupança, carteira, cartão de crédito e investimento, com saldo inicial e saldo atual calculado. Arquivamento de contas antigas |
| **Categorias** | Categorias de receita e despesa com cores (15 criadas automaticamente) |
| **Orçamentos** | Limite mensal por categoria de despesa, com alerta ao passar de 80% e ao estourar |
| **Metas** | Objetivos de economia com valor alvo, prazo, aportes/resgates e sugestão de quanto guardar por mês |
| **Importar extrato** | Importa o extrato da conta Nubank (OFX ou CSV): descrições resumidas, categorias sugeridas (aprende com suas correções), revisão antes de gravar e proteção contra duplicatas |
| **Relatórios** | Qualquer período: totais, médias mensais, taxa de poupança, evolução mensal, ranking de categorias e maiores despesas |
| **Dados e backup** | Exportação CSV (abre no Excel), backup completo em JSON e restauração |

Tema claro/escuro e layout adaptado para celular.

## Regras importantes

- **Saldo das contas** considera apenas transações marcadas como pagas.
- **Orçamentos** consideram todas as despesas do mês (pagas e pendentes).
- **Parcelas e repetições** com data futura são criadas como pendentes.
- Valores são guardados em centavos, sem erros de arredondamento.

## Estrutura

```
server.js               servidor Express
src/db.js               banco SQLite (esquema e dados iniciais)
src/validacao.js        validação e utilitários de data
src/routes/             API REST (/api/contas, /api/transacoes, ...)
public/index.html       página única
public/css/style.css    estilos (tema claro e escuro)
public/js/app.js        roteador da interface
public/js/views/        uma tela por arquivo
```

## Backup

Os dados ficam em `data/financas.db`. Use **Dados e backup → Baixar backup** regularmente, ou copie a pasta `data/` com o sistema parado.
