import { mesAtual } from './util.js';

/** Estado compartilhado entre as páginas. */
export const estado = {
  mes: mesAtual(),
  recarregar: () => {}, // substituído pelo roteador em app.js
};
