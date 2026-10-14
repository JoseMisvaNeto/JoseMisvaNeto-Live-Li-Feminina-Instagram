import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { getDb, toBool, fromBool, plainRow } from './db';

const router = Router();

type Row = Record<string, any>;

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// LIVE (auto-detecção + sync completo)
// ---------------------------------------------------------------------------

router.get(
  '/live-ativa',
  wrap(async (_req, res) => {
    const db = getDb();
    const r = await db.execute({
      sql: `SELECT data_live FROM live_vendas WHERE status = 'pendente' ORDER BY data_live DESC LIMIT 1`,
      args: [],
    });
    res.json({ data_live: r.rows.length > 0 ? plainRow(r.rows[0]).data_live : null });
  })
);

router.get(
  '/vendas-completas',
  wrap(async (req, res) => {
    const db = getDb();
    const dataLive = String(req.query.data_live || '');
    if (!dataLive) {
      res.status(400).json({ error: 'data_live obrigatório' });
      return;
    }

    const vendasRes = await db.execute({
      sql: 'SELECT * FROM live_vendas WHERE data_live = ? ORDER BY id',
      args: [dataLive],
    });
    const vendas = vendasRes.rows.map((r) => plainRow<Row>(r));
    if (vendas.length === 0) {
      res.json([]);
      return;
    }

    const vendaIds = vendas.map((v) => Number(v.id));
    const itens: Row[] = [];
    for (let i = 0; i < vendaIds.length; i += 500) {
      const chunk = vendaIds.slice(i, i + 500);
      const ph = chunk.map(() => '?').join(',');
      const r = await db.execute({
        sql: `SELECT * FROM live_vendas_itens WHERE venda_id IN (${ph}) ORDER BY id`,
        args: chunk,
      });
      itens.push(...r.rows.map((x) => plainRow<Row>(x)));
    }

    const clienteIds = [...new Set(vendas.map((v) => Number(v.cliente_id)))];
    const clientesMap = new Map<number, Row>();
    for (let i = 0; i < clienteIds.length; i += 500) {
      const chunk = clienteIds.slice(i, i + 500);
      const ph = chunk.map(() => '?').join(',');
      const r = await db.execute({
        sql: `SELECT id, username, nome_completo, codigo_cliente FROM live_clientes WHERE id IN (${ph})`,
        args: chunk,
      });
      for (const c of r.rows) {
        const cr = plainRow<Row>(c);
        clientesMap.set(Number(cr.id), cr);
      }
    }

    const result = vendas.map((v) => ({
      ...v,
      pago: toBool(v.pago),
      entregue: toBool(v.entregue),
      mensagem_enviada: toBool(v.mensagem_enviada),
      live_vendas_itens: itens
        .filter((it) => Number(it.venda_id) === Number(v.id))
        .map((it) => ({ ...it })),
      live_clientes: clientesMap.get(Number(v.cliente_id)) || null,
    }));

    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// VENDAS
// ---------------------------------------------------------------------------

router.post(
  '/vendas/upsert',
  wrap(async (req, res) => {
    const db = getDb();
    const b = req.body || {};
    const clienteId = Number(b.cliente_id);
    const dataLive = String(b.data_live || '');
    if (!clienteId || !dataLive) {
      res.status(400).json({ error: 'cliente_id e data_live obrigatórios' });
      return;
    }

    const cols: string[] = [];
    const vals: any[] = [];
    if (b.qtd_live !== undefined) {
      cols.push('qtd_live = excluded.qtd_live');
      vals.push(Number(b.qtd_live) || 0);
    }
    if (b.pago !== undefined) {
      cols.push('pago = excluded.pago');
      vals.push(fromBool(b.pago));
    }
    if (b.status !== undefined) {
      cols.push('status = excluded.status');
      vals.push(String(b.status));
    }
    if (b.entregue !== undefined) {
      cols.push('entregue = excluded.entregue');
      vals.push(fromBool(b.entregue));
    }
    if (b.valor_ajuste !== undefined) {
      cols.push('valor_ajuste = excluded.valor_ajuste');
      vals.push(Number(b.valor_ajuste) || 0);
    }
    if (b.mensagem_enviada !== undefined) {
      cols.push('mensagem_enviada = excluded.mensagem_enviada');
      vals.push(fromBool(b.mensagem_enviada));
    }

    const insertCols = ['cliente_id', 'data_live'];
    const insertVals: any[] = [clienteId, dataLive];
    if (b.qtd_live !== undefined) {
      insertCols.push('qtd_live');
      insertVals.push(Number(b.qtd_live) || 0);
    }
    if (b.pago !== undefined) {
      insertCols.push('pago');
      insertVals.push(fromBool(b.pago));
    }
    insertCols.push('status');
    insertVals.push(String(b.status ?? 'pendente'));
    if (b.entregue !== undefined) {
      insertCols.push('entregue');
      insertVals.push(fromBool(b.entregue));
    }
    if (b.valor_ajuste !== undefined) {
      insertCols.push('valor_ajuste');
      insertVals.push(Number(b.valor_ajuste) || 0);
    }
    if (b.mensagem_enviada !== undefined) {
      insertCols.push('mensagem_enviada');
      insertVals.push(fromBool(b.mensagem_enviada));
    }

    const ph = insertCols.map(() => '?').join(',');
    const setClause = cols.length > 0 ? ` DO UPDATE SET ${cols.join(', ')}` : ' DO NOTHING';
    const sql = `INSERT INTO live_vendas (${insertCols.join(',')}) VALUES (${ph}) ON CONFLICT(cliente_id, data_live)${setClause} RETURNING id`;
    const r = await db.execute({ sql, args: insertVals });
    const id = r.rows.length > 0 ? Number(plainRow(r.rows[0]).id) : null;
    res.json({ id });
  })
);

router.post(
  '/vendas',
  wrap(async (req, res) => {
    const db = getDb();
    const b = req.body || {};
    const r = await db.execute({
      sql: `INSERT INTO live_vendas (cliente_id, data_live, pago, valor_ajuste, mensagem_enviada, status, qtd_live, entregue)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      args: [
        Number(b.cliente_id),
        String(b.data_live),
        fromBool(b.pago),
        Number(b.valor_ajuste) || 0,
        fromBool(b.mensagem_enviada),
        String(b.status ?? 'pendente'),
        Number(b.qtd_live) || 0,
        fromBool(b.entregue),
      ],
    });
    const row = plainRow<Row>(r.rows[0]);
    row.pago = toBool(row.pago);
    row.entregue = toBool(row.entregue);
    row.mensagem_enviada = toBool(row.mensagem_enviada);
    res.json(row);
  })
);

router.get(
  '/vendas/buscar',
  wrap(async (req, res) => {
    const db = getDb();
    const clienteId = Number(req.query.cliente_id);
    const dataLive = String(req.query.data_live || '');
    const r = await db.execute({
      sql: 'SELECT id FROM live_vendas WHERE cliente_id = ? AND data_live = ? LIMIT 1',
      args: [clienteId, dataLive],
    });
    res.json({ id: r.rows.length > 0 ? Number(plainRow(r.rows[0]).id) : null });
  })
);

router.get(
  '/vendas/totais',
  wrap(async (req, res) => {
    const db = getDb();
    const dataLive = String(req.query.data_live || '');
    const r = await db.execute({
      sql: 'SELECT valor_ajuste, pago FROM live_vendas WHERE data_live = ?',
      args: [dataLive],
    });
    res.json(r.rows.map((x) => {
      const row = plainRow<Row>(x);
      return { valor_ajuste: row.valor_ajuste, pago: toBool(row.pago) };
    }));
  })
);

router.get(
  '/vendas/ids',
  wrap(async (req, res) => {
    const db = getDb();
    const dataLive = String(req.query.data_live || '');
    const r = await db.execute({
      sql: 'SELECT id FROM live_vendas WHERE data_live = ?',
      args: [dataLive],
    });
    res.json(r.rows.map((x) => Number(plainRow(x).id)));
  })
);

router.patch(
  '/vendas/:id',
  wrap(async (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const b = req.body || {};
    const sets: string[] = [];
    const vals: any[] = [];
    if (b.pago !== undefined) {
      sets.push('pago = ?');
      vals.push(fromBool(b.pago));
    }
    if (b.entregue !== undefined) {
      sets.push('entregue = ?');
      vals.push(fromBool(b.entregue));
    }
    if (b.valor_ajuste !== undefined) {
      sets.push('valor_ajuste = ?');
      vals.push(Number(b.valor_ajuste) || 0);
    }
    if (b.mensagem_enviada !== undefined) {
      sets.push('mensagem_enviada = ?');
      vals.push(fromBool(b.mensagem_enviada));
    }
    if (b.status !== undefined) {
      sets.push('status = ?');
      vals.push(String(b.status));
    }
    if (b.qtd_live !== undefined) {
      sets.push('qtd_live = ?');
      vals.push(Number(b.qtd_live) || 0);
    }
    if (sets.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }
    vals.push(id);
    await db.execute({ sql: `UPDATE live_vendas SET ${sets.join(', ')} WHERE id = ?`, args: vals });
    res.json({ ok: true });
  })
);

router.patch(
  '/vendas/by-cliente',
  wrap(async (req, res) => {
    const db = getDb();
    const clienteId = Number(req.query.cliente_id);
    const dataLive = String(req.query.data_live || '');
    const b = req.body || {};
    const sets: string[] = [];
    const vals: any[] = [];
    if (b.pago !== undefined) {
      sets.push('pago = ?');
      vals.push(fromBool(b.pago));
    }
    if (b.entregue !== undefined) {
      sets.push('entregue = ?');
      vals.push(fromBool(b.entregue));
    }
    if (sets.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }
    vals.push(clienteId, dataLive);
    await db.execute({
      sql: `UPDATE live_vendas SET ${sets.join(', ')} WHERE cliente_id = ? AND data_live = ?`,
      args: vals,
    });
    res.json({ ok: true });
  })
);

router.delete(
  '/vendas/pendentes',
  wrap(async (req, res) => {
    const db = getDb();
    const dataLive = String(req.query.data_live || '');
    const idsRes = await db.execute({
      sql: 'SELECT id FROM live_vendas WHERE data_live = ? AND pago = 0',
      args: [dataLive],
    });
    const ids = idsRes.rows.map((x) => Number(plainRow(x).id));
    if (ids.length > 0) {
      const ph = ids.map(() => '?').join(',');
      await db.batch(
        [
          { sql: `DELETE FROM live_vendas_itens WHERE venda_id IN (${ph})`, args: ids },
          { sql: `DELETE FROM live_vendas WHERE id IN (${ph})`, args: ids },
        ],
        'write'
      );
    }
    res.json({ ok: true, deleted: ids.length });
  })
);

router.delete(
  '/vendas/ids',
  wrap(async (req, res) => {
    const db = getDb();
    const raw = String(req.query.ids || '');
    const ids = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    if (ids.length > 0) {
      const ph = ids.map(() => '?').join(',');
      await db.batch(
        [
          { sql: `DELETE FROM live_vendas_itens WHERE venda_id IN (${ph})`, args: ids },
          { sql: `DELETE FROM live_vendas WHERE id IN (${ph})`, args: ids },
        ],
        'write'
      );
    }
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// ITENS
// ---------------------------------------------------------------------------

router.post(
  '/itens',
  wrap(async (req, res) => {
    const db = getDb();
    const b = req.body || {};
    const r = await db.execute({
      sql: `INSERT INTO live_vendas_itens (venda_id, referencia, preco, quantidade)
            VALUES (?, ?, ?, ?) RETURNING id`,
      args: [Number(b.venda_id), String(b.referencia), Number(b.preco), Number(b.quantidade)],
    });
    res.json({ id: Number(plainRow(r.rows[0]).id) });
  })
);

router.patch(
  '/itens/:id',
  wrap(async (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const b = req.body || {};
    if (b.quantidade === undefined) {
      res.status(400).json({ error: 'quantidade obrigatória' });
      return;
    }
    await db.execute({
      sql: 'UPDATE live_vendas_itens SET quantidade = ? WHERE id = ?',
      args: [Number(b.quantidade), id],
    });
    res.json({ ok: true });
  })
);

router.delete(
  '/itens/:id',
  wrap(async (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    await db.execute({ sql: 'DELETE FROM live_vendas_itens WHERE id = ?', args: [id] });
    res.json({ ok: true });
  })
);

router.delete(
  '/itens',
  wrap(async (req, res) => {
    const db = getDb();
    const raw = String(req.query.ids || '');
    const ids = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    if (ids.length > 0) {
      const ph = ids.map(() => '?').join(',');
      await db.execute({ sql: `DELETE FROM live_vendas_itens WHERE id IN (${ph})`, args: ids });
    }
    res.json({ ok: true });
  })
);

router.delete(
  '/itens/vendas',
  wrap(async (req, res) => {
    const db = getDb();
    const raw = String(req.query.ids || '');
    const ids = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    if (ids.length > 0) {
      const ph = ids.map(() => '?').join(',');
      await db.execute({ sql: `DELETE FROM live_vendas_itens WHERE venda_id IN (${ph})`, args: ids });
    }
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// CLIENTES
// ---------------------------------------------------------------------------

router.get(
  '/clientes',
  wrap(async (req, res) => {
    const db = getDb();
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const limit = Math.min(10000, Math.max(1, Number(req.query.limit) || 1000));
    const r = await db.execute({
      sql: `SELECT id, username, nome_completo, codigo_cliente, telefone, observacoes, bloqueada
            FROM live_clientes ORDER BY username ASC LIMIT ? OFFSET ?`,
      args: [limit, offset],
    });
    res.json(
      r.rows.map((x) => {
        const row = plainRow<Row>(x);
        return { ...row, bloqueada: toBool(row.bloqueada) };
      })
    );
  })
);

router.get(
  '/clientes/ids',
  wrap(async (_req, res) => {
    const db = getDb();
    const r = await db.execute({ sql: 'SELECT id, username FROM live_clientes', args: [] });
    res.json(r.rows.map((x) => plainRow<Row>(x)));
  })
);

router.post(
  '/clientes',
  wrap(async (req, res) => {
    const db = getDb();
    const b = req.body || {};
    await db.execute({
      sql: `INSERT INTO live_clientes (id, codigo_cliente, username, nome_completo) VALUES (?, ?, ?, ?)`,
      args: [Number(b.id), b.codigo_cliente != null ? Number(b.codigo_cliente) : null, String(b.username || ''), String(b.nome_completo || '')],
    });
    res.json({ ok: true });
  })
);

router.post(
  '/clientes/upsert-username',
  wrap(async (req, res) => {
    const db = getDb();
    const rows: Row[] = Array.isArray(req.body) ? req.body : req.body?.rows || [];
    if (rows.length === 0) {
      res.json({ ok: true, count: 0 });
      return;
    }
    const stmts = rows.map((p) => ({
      sql: `INSERT INTO live_clientes (id, username, nome_completo, codigo_cliente)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
              id = excluded.id,
              nome_completo = excluded.nome_completo,
              codigo_cliente = COALESCE(excluded.codigo_cliente, live_clientes.codigo_cliente)`,
      args: [
        Number(p.id),
        String(p.username || ''),
        String(p.nome_completo || ''),
        p.codigo_cliente != null ? Number(p.codigo_cliente) : null,
      ],
    }));
    for (let i = 0; i < stmts.length; i += 500) {
      await db.batch(stmts.slice(i, i + 500), 'write');
    }
    res.json({ ok: true, count: rows.length });
  })
);

router.post(
  '/clientes/upsert-id',
  wrap(async (req, res) => {
    const db = getDb();
    const b = req.body || {};
    await db.execute({
      sql: `INSERT INTO live_clientes (id, username, nome_completo, codigo_cliente)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              username = excluded.username,
              nome_completo = excluded.nome_completo,
              codigo_cliente = excluded.codigo_cliente`,
      args: [Number(b.id), String(b.username || ''), String(b.nome_completo || ''), b.codigo_cliente != null ? Number(b.codigo_cliente) : null],
    });
    res.json({ ok: true });
  })
);

router.patch(
  '/clientes/:id',
  wrap(async (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const b = req.body || {};
    const sets: string[] = [];
    const vals: any[] = [];
    if (b.codigo_cliente !== undefined) {
      sets.push('codigo_cliente = ?');
      vals.push(b.codigo_cliente != null ? Number(b.codigo_cliente) : null);
    }
    if (b.telefone !== undefined) {
      sets.push('telefone = ?');
      vals.push(b.telefone != null ? String(b.telefone) : null);
    }
    if (b.observacoes !== undefined) {
      sets.push('observacoes = ?');
      vals.push(b.observacoes != null ? String(b.observacoes) : null);
    }
    if (b.bloqueada !== undefined) {
      sets.push('bloqueada = ?');
      vals.push(fromBool(b.bloqueada));
    }
    if (b.nome_completo !== undefined) {
      sets.push('nome_completo = ?');
      vals.push(String(b.nome_completo));
    }
    if (sets.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }
    vals.push(id);
    await db.execute({ sql: `UPDATE live_clientes SET ${sets.join(', ')} WHERE id = ?`, args: vals });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// PRODUTOS
// ---------------------------------------------------------------------------

router.get(
  '/produtos',
  wrap(async (_req, res) => {
    const db = getDb();
    const r = await db.execute({ sql: 'SELECT * FROM produtos ORDER BY referencia', args: [] });
    res.json(r.rows.map((x) => plainRow<Row>(x)));
  })
);

router.get(
  '/produtos/by-ref/:ref',
  wrap(async (req, res) => {
    const db = getDb();
    const ref = String(req.params.ref || '').trim().toUpperCase();
    const r = await db.execute({
      sql: 'SELECT id FROM produtos WHERE referencia = ? LIMIT 1',
      args: [ref],
    });
    res.json({ id: r.rows.length > 0 ? String(plainRow(r.rows[0]).id) : null });
  })
);

router.post(
  '/produtos/upsert',
  wrap(async (req, res) => {
    const db = getDb();
    const rows: Row[] = Array.isArray(req.body) ? req.body : req.body?.rows || [];
    if (rows.length === 0) {
      res.json({ ok: true, count: 0 });
      return;
    }
    const stmts = rows.map((p) => ({
      sql: `INSERT INTO produtos (id, referencia, descricao, preco_venda, estoque_atual, fornecedor, custo, lucro, lucro_percentual, data_cadastro)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(referencia) DO UPDATE SET
              descricao = excluded.descricao,
              preco_venda = excluded.preco_venda,
              estoque_atual = excluded.estoque_atual,
              fornecedor = excluded.fornecedor,
              custo = excluded.custo,
              lucro = excluded.lucro,
              lucro_percentual = excluded.lucro_percentual`,
      args: [
        p.id ? String(p.id) : randomUUID(),
        String(p.referencia || ''),
        String(p.descricao || ''),
        Number(p.preco_venda) || 0,
        Number(p.estoque_atual) || 0,
        p.fornecedor != null ? String(p.fornecedor) : null,
        Number(p.custo) || 0,
        Number(p.lucro) || 0,
        Number(p.lucro_percentual) || 0,
        p.data_cadastro ? String(p.data_cadastro) : new Date().toISOString(),
      ],
    }));
    for (let i = 0; i < stmts.length; i += 200) {
      await db.batch(stmts.slice(i, i + 200), 'write');
    }
    res.json({ ok: true, count: rows.length });
  })
);

// ---------------------------------------------------------------------------
// MOVIMENTAÇÕES (trigger atualiza estoque)
// ---------------------------------------------------------------------------

router.post(
  '/movimentacoes',
  wrap(async (req, res) => {
    const db = getDb();
    const b = req.body || {};
    await db.execute({
      sql: `INSERT INTO movimentacoes_estoque (id, produto_id, tipo, quantidade, descricao, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        String(b.produto_id),
        String(b.tipo),
        Number(b.quantidade) || 0,
        b.descricao != null ? String(b.descricao) : null,
        b.data ? String(b.data) : new Date().toISOString(),
      ],
    });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// HISTÓRICO
// ---------------------------------------------------------------------------

router.get(
  '/historico',
  wrap(async (_req, res) => {
    const db = getDb();
    const r = await db.execute({
      sql: 'SELECT * FROM live_historico ORDER BY data_live DESC LIMIT 15',
      args: [],
    });
    res.json(r.rows.map((x) => plainRow<Row>(x)));
  })
);

router.post(
  '/historico',
  wrap(async (req, res) => {
    const db = getDb();
    const b = req.body || {};
    await db.execute({
      sql: `INSERT INTO live_historico (data_live, dia_semana, qtd_sacolas, valor_total, observacoes)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        String(b.data_live),
        b.dia_semana != null ? String(b.dia_semana) : null,
        Number(b.qtd_sacolas) || 0,
        Number(b.valor_total) || 0,
        b.observacoes != null ? String(b.observacoes) : null,
      ],
    });
    res.json({ ok: true });
  })
);

router.post(
  '/historico/save',
  wrap(async (req, res) => {
    const db = getDb();
    const b = req.body || {};
    const r = await db.execute({
      sql: `INSERT INTO live_historico (data_live, dia_semana, qtd_sacolas, valor_total, observacoes)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(data_live) DO UPDATE SET
              valor_total = excluded.valor_total,
              qtd_sacolas = excluded.qtd_sacolas
            RETURNING id`,
      args: [
        String(b.data_live),
        b.dia_semana != null ? String(b.dia_semana) : null,
        Number(b.qtd_sacolas) || 0,
        Number(b.valor_total) || 0,
        b.observacoes != null ? String(b.observacoes) : null,
      ],
    });
    res.json({ id: Number(plainRow(r.rows[0]).id) });
  })
);

router.patch(
  '/historico/:id',
  wrap(async (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const b = req.body || {};
    const sets: string[] = [];
    const vals: any[] = [];
    if (b.observacoes !== undefined) {
      sets.push('observacoes = ?');
      vals.push(b.observacoes != null ? String(b.observacoes) : null);
    }
    if (b.valor_total !== undefined) {
      sets.push('valor_total = ?');
      vals.push(Number(b.valor_total) || 0);
    }
    if (b.qtd_sacolas !== undefined) {
      sets.push('qtd_sacolas = ?');
      vals.push(Number(b.qtd_sacolas) || 0);
    }
    if (sets.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }
    vals.push(id);
    await db.execute({ sql: `UPDATE live_historico SET ${sets.join(', ')} WHERE id = ?`, args: vals });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// DANGER ZONE
// ---------------------------------------------------------------------------

router.delete(
  '/tudo',
  wrap(async (_req, res) => {
    const db = getDb();
    await db.batch(
      [
        { sql: 'DELETE FROM live_vendas_itens', args: [] },
        { sql: 'DELETE FROM live_vendas', args: [] },
        { sql: 'DELETE FROM live_historico', args: [] },
      ],
      'write'
    );
    res.json({ ok: true });
  })
);

export { router as apiRouter };
