CREATE TABLE IF NOT EXISTS live_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  nome_completo TEXT NOT NULL,
  telefone TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  codigo_cliente INTEGER,
  bloqueada INTEGER NOT NULL DEFAULT 0,
  observacoes TEXT
);

CREATE TABLE IF NOT EXISTS live_vendas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER REFERENCES live_clientes(id) ON DELETE CASCADE,
  data_live TEXT NOT NULL,
  pago INTEGER NOT NULL DEFAULT 0,
  valor_ajuste REAL NOT NULL DEFAULT 0,
  mensagem_enviada INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TEXT DEFAULT (datetime('now')),
  qtd_live INTEGER NOT NULL DEFAULT 0,
  entregue INTEGER NOT NULL DEFAULT 0,
  UNIQUE (cliente_id, data_live)
);

CREATE TABLE IF NOT EXISTS live_vendas_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venda_id INTEGER REFERENCES live_vendas(id) ON DELETE CASCADE,
  referencia TEXT NOT NULL,
  preco REAL NOT NULL,
  quantidade INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS produtos (
  id TEXT PRIMARY KEY,
  referencia TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  preco_venda REAL NOT NULL DEFAULT 0,
  estoque_atual INTEGER NOT NULL DEFAULT 0,
  custo REAL NOT NULL DEFAULT 0,
  lucro REAL NOT NULL DEFAULT 0,
  lucro_percentual REAL NOT NULL DEFAULT 0,
  estoque_minimo INTEGER NOT NULL DEFAULT 5,
  data_cadastro TEXT DEFAULT (datetime('now')),
  fornecedor TEXT
);

CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
  id TEXT PRIMARY KEY,
  produto_id TEXT REFERENCES produtos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  data TEXT DEFAULT (datetime('now')),
  origem_id TEXT,
  descricao TEXT
);

CREATE TABLE IF NOT EXISTS live_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_live TEXT NOT NULL UNIQUE,
  dia_semana TEXT,
  qtd_sacolas INTEGER NOT NULL DEFAULT 0,
  valor_total REAL NOT NULL DEFAULT 0,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lives (
  data_live TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'aberta',
  aberta_em TEXT DEFAULT (datetime('now'))
);
