import { estado } from './estado.js';
import { destruirGraficos, toast, esc } from './util.js';
import { abrirFormTransacao } from './views/transacoes.js';

const ROTAS = {
  dashboard: { titulo: 'Painel', carregar: () => import('./views/dashboard.js') },
  transacoes: { titulo: 'Transações', carregar: () => import('./views/transacoes.js') },
  contas: { titulo: 'Contas', carregar: () => import('./views/contas.js') },
  categorias: { titulo: 'Categorias', carregar: () => import('./views/categorias.js') },
  orcamentos: { titulo: 'Orçamentos', carregar: () => import('./views/orcamentos.js') },
  metas: { titulo: 'Metas', carregar: () => import('./views/metas.js') },
  importar: { titulo: 'Importar extrato', carregar: () => import('./views/importar.js') },
  relatorios: { titulo: 'Relatórios', carregar: () => import('./views/relatorios.js') },
  configuracoes: { titulo: 'Dados e backup', carregar: () => import('./views/configuracoes.js') },
};

const conteudo = document.getElementById('conteudo');
const sidebar = document.getElementById('sidebar');

function rotaAtual() {
  const [nome, query] = location.hash.replace(/^#\/?/, '').split('?');
  return { nome: ROTAS[nome] ? nome : 'dashboard', params: new URLSearchParams(query || '') };
}

let renderizacao = 0;

async function renderizar() {
  const { nome, params } = rotaAtual();
  const rota = ROTAS[nome];
  const id = ++renderizacao;

  document.getElementById('titulo-pagina').textContent = rota.titulo;
  document.title = `${rota.titulo} · Minhas Finanças`;
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === nome));
  sidebar.classList.remove('aberta');

  try {
    const modulo = await rota.carregar();
    const el = document.createElement('div');
    await modulo.render(el, params);
    if (id !== renderizacao) return; // o usuário já navegou para outra página
    destruirGraficos();
    conteudo.replaceChildren(el);
    modulo.depoisDeMontar?.(el);
  } catch (err) {
    console.error(err);
    if (id === renderizacao) {
      conteudo.innerHTML = `<div class="card vazio"><div class="grande">⚠️</div>Não foi possível carregar a página.<br><span class="pequeno">${esc(err.message)}</span></div>`;
    }
  }
}

estado.recarregar = renderizar;

// ---------- Tema ----------
function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  try { localStorage.setItem('tema', tema); } catch { /* armazenamento indisponível */ }
}
let temaSalvo = null;
try { temaSalvo = localStorage.getItem('tema'); } catch { /* armazenamento indisponível */ }
aplicarTema(temaSalvo || (matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'));

document.getElementById('btn-tema').addEventListener('click', () => {
  aplicarTema(document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro');
  renderizar(); // redesenha os gráficos com as novas cores
});

// ---------- Eventos globais ----------
document.getElementById('btn-menu').addEventListener('click', () => sidebar.classList.toggle('aberta'));
document.getElementById('btn-nova-transacao').addEventListener('click', () => abrirFormTransacao());
window.addEventListener('hashchange', renderizar);
window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || 'Erro inesperado.', 'erro'));

renderizar();
