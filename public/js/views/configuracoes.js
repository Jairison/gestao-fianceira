import { api } from '../api.js';
import { confirmar, toast } from '../util.js';

export async function render(el) {
  el.innerHTML = `
    <div class="pilha" style="max-width:760px">
      <div class="card">
        <h2 style="margin-bottom:6px">📄 Exportar transações (CSV)</h2>
        <p class="suave" style="margin-top:0">Planilha com todas as transações, pronta para abrir no Excel ou Google Planilhas.
          Para exportar só um período ou com filtros, use o botão na página de Transações ou Relatórios.</p>
        <a class="btn" href="/api/exportar/csv">⬇️ Exportar todas as transações</a>
      </div>

      <div class="card">
        <h2 style="margin-bottom:6px">💾 Backup completo</h2>
        <p class="suave" style="margin-top:0">Baixe um arquivo com <strong>todos</strong> os seus dados (contas, categorias, transações,
          orçamentos e metas). Faça backups regularmente e guarde em local seguro.</p>
        <a class="btn btn-primario" href="/api/backup">⬇️ Baixar backup</a>
      </div>

      <div class="card">
        <h2 style="margin-bottom:6px">♻️ Restaurar backup</h2>
        <p class="suave" style="margin-top:0">Substitui <strong>todos os dados atuais</strong> pelos dados do arquivo de backup.
          Recomendamos baixar um backup atual antes de restaurar.</p>
        <label class="btn" style="display:inline-flex;color:var(--texto);margin:0">
          📂 Escolher arquivo de backup
          <input type="file" accept="application/json,.json" data-arquivo hidden>
        </label>
      </div>

      <div class="card">
        <h2 style="margin-bottom:6px">ℹ️ Onde ficam meus dados?</h2>
        <p class="suave" style="margin:0">Os dados ficam salvos apenas no seu computador, no arquivo
          <code>data/financas.db</code> dentro da pasta do sistema. Nada é enviado para a internet.</p>
      </div>
    </div>`;

  el.querySelector('[data-arquivo]').addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;

    let dados;
    try {
      dados = JSON.parse(await arquivo.text());
    } catch {
      toast('O arquivo selecionado não é um backup válido.', 'erro');
      return;
    }
    const resumo = `${dados.transacoes?.length ?? 0} transações, ${dados.contas?.length ?? 0} contas`;
    const ok = await confirmar(
      `Restaurar o backup <strong>${arquivo.name.replace(/</g, '&lt;')}</strong> (${resumo})?<br><br>Todos os dados atuais serão substituídos.`,
      { titulo: 'Restaurar backup', textoBotao: 'Restaurar' },
    );
    if (!ok) return;
    try {
      const r = await api.post('/backup', dados);
      toast(`Backup restaurado: ${r.registros.transacoes} transações.`);
      location.hash = '#/dashboard'; // a troca de rota recarrega a página
    } catch (err) {
      toast(err.message, 'erro');
    }
  });
}
