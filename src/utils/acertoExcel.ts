import type * as ExcelJS from 'exceljs';

// Tipos espelhados dos grupos da tela Acerto (evitamos importar App.tsx para não criar ciclo)
export interface AcertoItem {
  reference: string;
  value: number;
  quantity: number;
  paid: boolean;
}

export interface AcertoGroup {
  customerId: number;
  username: string;
  nome_completo: string;
  telefone?: string;
  items: AcertoItem[];
  total: number;
  paid: boolean;
  delivered: boolean;
  codigo_cliente?: number | null;
}

export interface AcertoProductInfo {
  descricao?: string;
  preco_venda?: number;
}

export interface AcertoExcelInput {
  groups: AcertoGroup[];
  totalValue: number;
  totalPaidValue: number;
  dataLive: string;
  productsByRef: Record<string, AcertoProductInfo>;
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF111111' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFCCFF00' },
  size: 11,
};
const SUBTOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8F5C8' },
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFCCFF00' },
};
const MONEY_FMT = '"R$" #,##0.00';
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
  left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
  bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
  right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
};

const normalizeRef = (ref: string) => (ref || '').toUpperCase().trim();

const round2 = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

const styleHeaderRow = (row: ExcelJS.Row) => {
  row.eachCell(cell => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDER;
  });
};

/**
 * Gera uma planilha .xlsx completa da live:
 *  Aba 1 "Vendas da Live" - uma linha por item de sacola, com subtotal por sacola e total geral.
 *  Aba 2 "Resumo por Referência" - agregação por referência (qtd, preço médio, receita).
 */
export const buildAcertoWorkbook = async (input: AcertoExcelInput): Promise<ArrayBuffer> => {
  // Import dinâmico: o exceljs só é carregado quando o usuário pede a planilha
  const mod: any = await import('exceljs');
  const Workbook = mod.Workbook || mod.default?.Workbook || mod['module.exports']?.Workbook;
  const { groups, totalValue, totalPaidValue, dataLive, productsByRef } = input;

  const workbook = new Workbook();
  workbook.creator = 'Live Li Feminina';
  workbook.created = new Date();

  // ---------- Aba 1: Vendas da Live ----------
  const ws = workbook.addWorksheet('Vendas da Live', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { header: 'Cód. Sacola', key: 'codigo', width: 11 },
    { header: 'Nome', key: 'nome', width: 26 },
    { header: 'Referência', key: 'ref', width: 14 },
    { header: 'Descrição', key: 'descricao', width: 34 },
    { header: 'Qtd Peças', key: 'qtd', width: 10 },
    { header: 'Preço Original', key: 'precoOriginal', width: 15 },
    { header: 'Valor Pago (un)', key: 'valorPago', width: 17 },
    { header: 'Subtotal', key: 'subtotal', width: 15 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  styleHeaderRow(ws.getRow(1));

  const groupsWithItems = groups.filter(g => g.items.length > 0);
  let currentRow = 2;
  let grandTotal = 0;

  for (const group of groupsWithItems) {
    const nome =
      group.nome_completo && group.nome_completo !== 'N/A'
        ? group.nome_completo
        : group.username || 'N/A';
    let groupTotal = 0;

    group.items.forEach((item, idx) => {
      const ref = normalizeRef(item.reference);
      const product = productsByRef[ref];
      const subtotal = round2(Number(item.value) * Number(item.quantity));
      groupTotal += subtotal;

      const row = ws.getRow(currentRow++);
      row.values = [
        idx === 0 ? (group.codigo_cliente ?? group.customerId) : '',
        idx === 0 ? nome : '',
        ref,
        product?.descricao || '',
        Number(item.quantity) || 0,
        product?.preco_venda != null ? Number(product.preco_venda) : '',
        Number(item.value) || 0,
        subtotal,
        idx === 0 ? (group.paid ? 'Pago' : 'Pendente') : '',
      ];
      row.eachCell((cell, colNumber) => {
        cell.border = BORDER;
        cell.alignment = { vertical: 'middle' };
        if (colNumber === 5) cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (colNumber === 6 || colNumber === 7 || colNumber === 8) {
          cell.numFmt = MONEY_FMT;
          if (colNumber === 6 && cell.value === '') cell.value = '—';
        }
        if (colNumber === 9) cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
    });

    grandTotal += groupTotal;

    // Linha de subtotal por sacola
    const subRow = ws.getRow(currentRow++);
    subRow.values = [
      '',
      `Total sacola ${group.codigo_cliente ?? group.customerId} - ${nome}`,
      '',
      '',
      group.items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0),
      '',
      '',
      round2(groupTotal),
      '',
    ];
    subRow.eachCell((cell, colNumber) => {
      cell.fill = SUBTOTAL_FILL;
      cell.font = { bold: true, size: 10 };
      cell.border = BORDER;
      if (colNumber === 8) cell.numFmt = MONEY_FMT;
      if (colNumber === 5) cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
  }

  // Linha de total geral
  const totalRow = ws.getRow(currentRow++);
  const totalQtd = groupsWithItems.reduce(
    (acc, g) => acc + g.items.reduce((a, it) => a + (Number(it.quantity) || 0), 0),
    0
  );
  totalRow.values = ['', 'TOTAL GERAL DA LIVE', '', '', totalQtd, '', '', round2(grandTotal), ''];
  totalRow.eachCell((cell, colNumber) => {
    cell.fill = TOTAL_FILL;
    cell.font = { bold: true, size: 11 };
    cell.border = BORDER;
    if (colNumber === 8) cell.numFmt = MONEY_FMT;
    if (colNumber === 5) cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Linha com resumo de pago/não pago
  const paidRow = ws.getRow(currentRow);
  const paidTotal = round2(groupsWithItems.filter(g => g.paid).reduce((acc, g) => acc + g.total, 0));
  paidRow.values = [
    '',
    `Pago: R$ ${paidTotal.toFixed(2)}  |  Pendente: R$ ${(grandTotal - paidTotal).toFixed(2)}`,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
  paidRow.eachCell(cell => {
    cell.font = { italic: true, size: 10, color: { argb: 'FF555555' } };
  });

  // ---------- Aba 2: Resumo por Referência ----------
  const ws2 = workbook.addWorksheet('Resumo por Referência', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws2.columns = [
    { header: 'Referência', key: 'ref', width: 14 },
    { header: 'Descrição', key: 'descricao', width: 36 },
    { header: 'Qtd Vendida', key: 'qtd', width: 12 },
    { header: 'Preço Original', key: 'precoOriginal', width: 15 },
    { header: 'Preço Médio Pago', key: 'precoMedio', width: 18 },
    { header: 'Receita Total', key: 'receita', width: 16 },
    { header: 'Sacolas', key: 'sacolas', width: 10 },
  ];
  styleHeaderRow(ws2.getRow(1));

  const summary = new Map<string, { qty: number; revenue: number; bags: Set<string> }>();
  for (const group of groupsWithItems) {
    for (const item of group.items) {
      const ref = normalizeRef(item.reference);
      if (!ref) continue;
      const entry = summary.get(ref) || { qty: 0, revenue: 0, bags: new Set<string>() };
      entry.qty += Number(item.quantity) || 0;
      entry.revenue = round2(entry.revenue + Number(item.value) * Number(item.quantity));
      entry.bags.add(String(group.codigo_cliente ?? group.customerId));
      summary.set(ref, entry);
    }
  }

  let rowIdx = 2;
  let summaryQty = 0;
  let summaryRevenue = 0;
  for (const ref of Array.from(summary.keys()).sort((a, b) => a.localeCompare(b))) {
    const entry = summary.get(ref)!;
    const product = productsByRef[ref];
    summaryQty += entry.qty;
    summaryRevenue = round2(summaryRevenue + entry.revenue);
    const row = ws2.getRow(rowIdx++);
    row.values = [
      ref,
      product?.descricao || '',
      entry.qty,
      product?.preco_venda != null ? Number(product.preco_venda) : '',
      entry.qty > 0 ? round2(entry.revenue / entry.qty) : 0,
      entry.revenue,
      entry.bags.size,
    ];
    row.eachCell((cell, colNumber) => {
      cell.border = BORDER;
      if (colNumber === 3 || colNumber === 7) cell.alignment = { horizontal: 'center' };
      if (colNumber === 4 && cell.value === '') cell.value = '—';
      if (colNumber >= 4 && colNumber <= 6) cell.numFmt = MONEY_FMT;
    });
  }

  const sumRow = ws2.getRow(rowIdx);
  sumRow.values = ['', 'TOTAL', summaryQty, '', '', round2(summaryRevenue), ''];
  sumRow.eachCell((cell, colNumber) => {
    cell.fill = TOTAL_FILL;
    cell.font = { bold: true };
    cell.border = BORDER;
    if (colNumber === 3) cell.alignment = { horizontal: 'center' };
    if (colNumber === 6) cell.numFmt = MONEY_FMT;
  });

  return workbook.xlsx.writeBuffer();
};

/** Gera o arquivo .xlsx e dispara o download no navegador. */
export const downloadAcertoXlsx = async (input: AcertoExcelInput): Promise<void> => {
  const buffer = await buildAcertoWorkbook(input);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `acerto_live_${input.dataLive || 'live'}.xlsx`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
