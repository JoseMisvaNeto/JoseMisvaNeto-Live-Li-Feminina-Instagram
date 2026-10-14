const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* corpo não é JSON */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export function isDbId(id: string | number): boolean {
  return /^\d+$/.test(String(id));
}

export interface ClienteRow {
  id: number;
  username: string;
  nome_completo: string;
  codigo_cliente?: number | null;
  telefone?: string | null;
  observacoes?: string | null;
  bloqueada?: boolean;
}

export interface VendaRow {
  id: number;
  cliente_id: number | null;
  data_live: string;
  pago: boolean;
  valor_ajuste: number;
  mensagem_enviada: boolean;
  status: string;
  created_at?: string;
  qtd_live: number;
  entregue: boolean;
}

export interface HistoricoRow {
  id: number;
  data_live: string;
  dia_semana?: string | null;
  qtd_sacolas: number;
  valor_total: number;
  observacoes?: string | null;
  created_at?: string;
}

export interface ProdutoRow {
  id: string;
  referencia: string;
  descricao: string;
  preco_venda: number;
  estoque_atual: number;
  custo: number;
  lucro: number;
  lucro_percentual: number;
  estoque_minimo?: number;
  data_cadastro?: string;
  fornecedor?: string | null;
}

export const api = {
  // ---- LIVES ----
  getLivesAbertas: () => request<string[]>('/lives/abertas'),

  abrirLive: (dataLive: string) =>
    request<{ ok: boolean; data_live: string }>('/lives', { method: 'POST', body: JSON.stringify({ data_live: dataLive }) }),

  fecharLive: (dataLive: string) =>
    request<{ ok: boolean }>(`/lives/${encodeURIComponent(dataLive)}/fechar`, { method: 'PATCH' }),

  // ---- LIVE ----
  getLiveAtiva: () => request<{ data_live: string | null }>('/live-ativa'),

  getVendasCompletas: (dataLive: string) =>
    request<any[]>(`/vendas-completas?data_live=${encodeURIComponent(dataLive)}`),

  // ---- VENDAS ----
  upsertVenda: (fields: {
    cliente_id: number;
    data_live: string;
    qtd_live?: number;
    pago?: boolean;
    status?: string;
    entregue?: boolean;
    valor_ajuste?: number;
    mensagem_enviada?: boolean;
  }) => request<{ id: number | null }>('/vendas/upsert', { method: 'POST', body: JSON.stringify(fields) }),

  insertVenda: (fields: Partial<VendaRow> & { cliente_id: number; data_live: string }) =>
    request<VendaRow>('/vendas', { method: 'POST', body: JSON.stringify(fields) }),

  findVendaId: (clienteId: number, dataLive: string) =>
    request<{ id: number | null }>(`/vendas/buscar?cliente_id=${clienteId}&data_live=${encodeURIComponent(dataLive)}`),

  getVendasTotais: (dataLive: string) =>
    request<{ valor_ajuste: number; pago: boolean }[]>(`/vendas/totais?data_live=${encodeURIComponent(dataLive)}`),

  getVendasIds: (dataLive: string) =>
    request<number[]>(`/vendas/ids?data_live=${encodeURIComponent(dataLive)}`),

  updateVenda: (id: number, fields: Partial<VendaRow>) =>
    request<{ ok: boolean }>(`/vendas/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),

  updateVendaByCliente: (clienteId: number, dataLive: string, fields: { pago?: boolean; entregue?: boolean }) =>
    request<{ ok: boolean }>(`/vendas/by-cliente?cliente_id=${clienteId}&data_live=${encodeURIComponent(dataLive)}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    }),

  deleteVendasPendentes: (dataLive: string) =>
    request<{ ok: boolean; deleted: number }>(`/vendas/pendentes?data_live=${encodeURIComponent(dataLive)}`, { method: 'DELETE' }),

  deleteVendasByIds: (ids: number[]) =>
    request<{ ok: boolean }>(`/vendas/ids?ids=${ids.join(',')}`, { method: 'DELETE' }),

  // ---- ITENS ----
  insertItem: (fields: { venda_id: number; referencia: string; preco: number; quantidade: number }) =>
    request<{ id: number }>('/itens', { method: 'POST', body: JSON.stringify(fields) }),

  updateItemQuantity: (id: number, quantidade: number) =>
    request<{ ok: boolean }>(`/itens/${id}`, { method: 'PATCH', body: JSON.stringify({ quantidade }) }),

  deleteItem: (id: number) => request<{ ok: boolean }>(`/itens/${id}`, { method: 'DELETE' }),

  deleteItems: (ids: number[]) => request<{ ok: boolean }>(`/itens?ids=${ids.join(',')}`, { method: 'DELETE' }),

  deleteItemsByVendas: (vendaIds: number[]) =>
    request<{ ok: boolean }>(`/itens/vendas?ids=${vendaIds.join(',')}`, { method: 'DELETE' }),

  // ---- CLIENTES ----
  getClientes: (offset: number, limit: number) =>
    request<ClienteRow[]>(`/clientes?offset=${offset}&limit=${limit}`),

  getClienteIds: () => request<{ id: number; username: string }[]>('/clientes/ids'),

  insertCliente: (c: { id: number; codigo_cliente?: number | null; username: string; nome_completo: string }) =>
    request<{ ok: boolean }>('/clientes', { method: 'POST', body: JSON.stringify(c) }),

  upsertClientesUsername: (rows: { id: number; username: string; nome_completo: string; codigo_cliente?: number | null }[]) =>
    request<{ ok: boolean; count: number }>('/clientes/upsert-username', { method: 'POST', body: JSON.stringify(rows) }),

  upsertClienteId: (c: { id: number; username: string; nome_completo: string; codigo_cliente?: number | null }) =>
    request<{ ok: boolean }>('/clientes/upsert-id', { method: 'POST', body: JSON.stringify(c) }),

  updateCliente: (id: number, fields: Partial<ClienteRow>) =>
    request<{ ok: boolean }>(`/clientes/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),

  // ---- PRODUTOS ----
  getProdutos: () => request<ProdutoRow[]>('/produtos'),

  getProdutoByRef: (ref: string) =>
    request<{ id: string | null }>(`/produtos/by-ref/${encodeURIComponent(ref)}`),

  createProduto: (p: {
    referencia: string;
    descricao: string;
    preco_venda: number;
    custo: number;
    estoque_atual?: number;
    estoque_minimo?: number;
    fornecedor?: string | null;
  }) => request<{ ok: boolean; id: string }>('/produtos', { method: 'POST', body: JSON.stringify(p) }),

  updateProduto: (id: string, p: Partial<{
    referencia: string;
    descricao: string;
    preco_venda: number;
    custo: number;
    estoque_atual: number;
    estoque_minimo: number;
    fornecedor: string | null;
  }>) => request<{ ok: boolean }>(`/produtos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(p) }),

  deleteProduto: (id: string) =>
    request<{ ok: boolean }>(`/produtos/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  upsertProdutos: (rows: Partial<ProdutoRow>[]) =>
    request<{ ok: boolean; count: number }>('/produtos/upsert', { method: 'POST', body: JSON.stringify(rows) }),

  // ---- MOVIMENTAÇÕES ----
  insertMovimentacao: (m: { produto_id: string; tipo: string; quantidade: number; descricao?: string; data?: string }) =>
    request<{ ok: boolean }>('/movimentacoes', { method: 'POST', body: JSON.stringify(m) }),

  // ---- HISTÓRICO ----
  getHistorico: () => request<HistoricoRow[]>('/historico'),

  insertHistorico: (h: { data_live: string; dia_semana?: string; qtd_sacolas: number; valor_total: number; observacoes?: string }) =>
    request<{ ok: boolean }>('/historico', { method: 'POST', body: JSON.stringify(h) }),

  saveHistorico: (h: { data_live: string; dia_semana?: string; qtd_sacolas: number; valor_total: number; observacoes?: string }) =>
    request<{ id: number }>('/historico/save', { method: 'POST', body: JSON.stringify(h) }),

  updateHistorico: (id: number, fields: { observacoes?: string | null; valor_total?: number; qtd_sacolas?: number }) =>
    request<{ ok: boolean }>(`/historico/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),

  // ---- DANGER ZONE ----
  clearAll: () => request<{ ok: boolean }>('/tudo', { method: 'DELETE' }),
};
