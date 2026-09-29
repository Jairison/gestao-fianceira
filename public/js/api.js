async function requisicao(metodo, url, corpo) {
  const opcoes = { method: metodo, headers: {} };
  if (corpo !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo);
  }
  const resp = await fetch(`/api${url}`, opcoes);
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(dados.erro || `Erro ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return dados;
}

/** Monta query string ignorando valores vazios. */
export function qs(params = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const api = {
  get: (url) => requisicao('GET', url),
  post: (url, corpo) => requisicao('POST', url, corpo ?? {}),
  put: (url, corpo) => requisicao('PUT', url, corpo ?? {}),
  patch: (url, corpo) => requisicao('PATCH', url, corpo ?? {}),
  del: (url) => requisicao('DELETE', url),
};
