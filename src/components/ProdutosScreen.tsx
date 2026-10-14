import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api, type ProdutoRow } from '../lib/api';
import { processProductsCSV, downloadProductsCSV } from '../utils/csvProcessor';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Tag,
  Search,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  X,
  Package,
  DollarSign,
  Boxes,
  TrendingUp,
  PackageX,
} from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const normalize = (str: string) =>
  (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Busca inteligente: ref, descrição, fornecedor e valores (preço/custo/lucro)
// aceita "25,9", "25.9", "2590" ou "25" para o produto de R$ 25,90
const matchesSearch = (p: ProdutoRow, rawQuery: string): boolean => {
  const q = normalize(rawQuery);
  if (!q) return true;

  if (normalize(p.referencia).includes(q)) return true;
  if (normalize(p.descricao).includes(q)) return true;
  if (normalize(p.fornecedor || '').includes(q)) return true;

  const qLimpo = q.replace(/^r\$\s*/, '').replace(/\s/g, '');
  const qNum = Number(qLimpo.replace(',', '.'));
  if (Number.isFinite(qNum) && qNum >= 0) {
    const valores = [Number(p.preco_venda) || 0, Number(p.custo) || 0, Number(p.lucro) || 0];
    for (const v of valores) {
      const str = v.toFixed(2);
      // tolerância para arredondamento na comparação numérica
      if (Math.abs(v - qNum) < 0.005) return true;
      // substring no formato "25.90" ("25.9", "25", "2590"...)
      if (str.includes(qLimpo.replace(',', '.'))) return true;
      const semPonto = str.replace('.', '');
      const qSemSeparador = qLimpo.replace(/[.,]/g, '');
      if (qSemSeparador.length > 0 && semPonto.includes(qSemSeparador)) return true;
    }
  }
  return false;
};

interface ProdutoForm {
  referencia: string;
  descricao: string;
  preco_venda: string;
  custo: string;
  estoque_atual: string;
  estoque_minimo: string;
  fornecedor: string;
}

const emptyForm: ProdutoForm = {
  referencia: '',
  descricao: '',
  preco_venda: '',
  custo: '',
  estoque_atual: '0',
  estoque_minimo: '5',
  fornecedor: '',
};

export default function ProdutosScreen({ showToast }: { showToast: (msg: string) => void }) {
  const [produtos, setProdutos] = useState<ProdutoRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [formModal, setFormModal] = useState<{ open: boolean; editId: string | null }>({ open: false, editId: null });
  const [form, setForm] = useState<ProdutoForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<ProdutoRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ products: any[]; warnings: string[]; filename: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProdutos = async () => {
    setIsLoading(true);
    try {
      const data = await api.getProdutos();
      setProdutos(data || []);
    } catch (err: any) {
      console.error('Erro ao carregar produtos:', err);
      showToast(`Erro ao carregar produtos: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProdutos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () => produtos.filter((p) => matchesSearch(p, searchQuery)),
    [produtos, searchQuery]
  );

  const dashboard = useMemo(() => {
    const totalSkus = produtos.length;
    const unidades = produtos.reduce((acc, p) => acc + (Number(p.estoque_atual) || 0), 0);
    const valorCusto = produtos.reduce((acc, p) => acc + (Number(p.estoque_atual) || 0) * (Number(p.custo) || 0), 0);
    const valorVenda = produtos.reduce((acc, p) => acc + (Number(p.estoque_atual) || 0) * (Number(p.preco_venda) || 0), 0);
    const abaixoMinimo = produtos.filter((p) => (Number(p.estoque_atual) || 0) <= (Number(p.estoque_minimo) || 5)).length;
    return { totalSkus, unidades, valorCusto, valorVenda, abaixoMinimo };
  }, [produtos]);

  // Preview de lucro enquanto digita
  const previewLucro = useMemo(() => {
    const preco = Number(form.preco_venda.replace(',', '.')) || 0;
    const custo = Number(form.custo.replace(',', '.')) || 0;
    const lucro = Math.round((preco - custo) * 100) / 100;
    const pct = custo > 0 ? Math.round(((preco - custo) / custo) * 10000) / 100 : 0;
    return { lucro, pct };
  }, [form.preco_venda, form.custo]);

  const openCreate = () => {
    setForm(emptyForm);
    setFormModal({ open: true, editId: null });
  };

  const openEdit = (p: ProdutoRow) => {
    setForm({
      referencia: p.referencia || '',
      descricao: p.descricao || '',
      preco_venda: String(p.preco_venda ?? ''),
      custo: String(p.custo ?? ''),
      estoque_atual: String(p.estoque_atual ?? 0),
      estoque_minimo: String(p.estoque_minimo ?? 5),
      fornecedor: p.fornecedor || '',
    });
    setFormModal({ open: true, editId: p.id });
  };

  const handleSave = async () => {
    if (!form.referencia.trim() || !form.descricao.trim()) {
      showToast('⚠️ Referência e Descrição são obrigatórias.');
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      const payload = {
        referencia: form.referencia.trim().toUpperCase(),
        descricao: form.descricao.trim(),
        preco_venda: Number(form.preco_venda.replace(',', '.')) || 0,
        custo: Number(form.custo.replace(',', '.')) || 0,
        estoque_atual: Math.max(0, Number(form.estoque_atual) || 0),
        estoque_minimo: Math.max(0, Number(form.estoque_minimo) || 0),
        fornecedor: form.fornecedor.trim() || null,
      };

      if (formModal.editId) {
        await api.updateProduto(formModal.editId, payload);
        showToast(`✅ Produto ${payload.referencia} atualizado.`);
      } else {
        await api.createProduto(payload);
        showToast(`✅ Produto ${payload.referencia} cadastrado.`);
      }
      setFormModal({ open: false, editId: null });
      await loadProdutos();
    } catch (err: any) {
      showToast(`⚠️ ${err.message || 'Erro ao salvar produto.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal || isDeleting) return;
    setIsDeleting(true);
    try {
      await api.deleteProduto(deleteModal.id);
      showToast(`🗑️ Produto ${deleteModal.referencia} excluído.`);
      setDeleteModal(null);
      await loadProdutos();
    } catch (err: any) {
      showToast(`⚠️ ${err.message || 'Erro ao excluir produto.'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const result = await processProductsCSV(file);
      setImportSummary({ products: result.products, warnings: result.warnings, filename: file.name });
    } catch (err: any) {
      showToast(`Erro ao processar CSV: ${err.message}`);
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const confirmImport = async () => {
    if (!importSummary || importSummary.products.length === 0) return;
    setIsImporting(true);
    try {
      await api.upsertProdutos(importSummary.products);
      showToast(`✅ ${importSummary.products.length} produto(s) importado(s).`);
      setImportSummary(null);
      await loadProdutos();
    } catch (err: any) {
      showToast(`⚠️ Erro na importação: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = produtos.length > 0 ? produtos : await api.getProdutos();
      if (!data || data.length === 0) {
        showToast('Nenhum produto cadastrado para exportar.');
        return;
      }
      downloadProductsCSV(data);
    } catch (err: any) {
      showToast(`Erro ao exportar: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-[#111] border border-[#ccff00]/20 p-3 rounded-lg">
          <div className="flex items-center gap-2 text-[#ccff00]/60 mb-1">
            <Tag className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">SKUs</span>
          </div>
          <div className="text-2xl font-black text-white">{dashboard.totalSkus}</div>
        </div>
        <div className="bg-[#111] border border-[#ccff00]/20 p-3 rounded-lg">
          <div className="flex items-center gap-2 text-[#ccff00]/60 mb-1">
            <Boxes className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Unidades</span>
          </div>
          <div className="text-2xl font-black text-white">{dashboard.unidades}</div>
        </div>
        <div className="bg-[#111] border border-[#ccff00]/20 p-3 rounded-lg">
          <div className="flex items-center gap-2 text-[#ccff00]/60 mb-1">
            <DollarSign className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Valor a Custo</span>
          </div>
          <div className="text-2xl font-black text-white">{brl(dashboard.valorCusto)}</div>
        </div>
        <div className="bg-[#111] border border-[#ccff00]/20 p-3 rounded-lg">
          <div className="flex items-center gap-2 text-[#ccff00]/60 mb-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Potencial de Venda</span>
          </div>
          <div className="text-2xl font-black text-[#ccff00]">{brl(dashboard.valorVenda)}</div>
        </div>
        <div className={cn(
          "p-3 rounded-lg border",
          dashboard.abaixoMinimo > 0
            ? "bg-yellow-500/10 border-yellow-500/30"
            : "bg-[#111] border-[#ccff00]/20"
        )}>
          <div className={cn("flex items-center gap-2 mb-1", dashboard.abaixoMinimo > 0 ? "text-yellow-500" : "text-[#ccff00]/60")}>
            <PackageX className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Abaixo do Mínimo</span>
          </div>
          <div className={cn("text-2xl font-black", dashboard.abaixoMinimo > 0 ? "text-yellow-500" : "text-white")}>
            {dashboard.abaixoMinimo}
          </div>
        </div>
      </div>

      {/* Barra de ações */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#ccff00]/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="buscar ref, descrição, fornecedor ou valor (ex: 25,9)..."
            className="w-full bg-[#111] border border-[#ccff00]/20 focus:border-[#ccff00] pl-9 pr-3 py-2 rounded-lg outline-none text-sm font-bold text-white placeholder:text-white/25 transition-colors"
          />
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-2 px-3 py-2 bg-white/5 text-white/60 border border-white/10 rounded-lg font-black text-[11px] uppercase tracking-widest hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 bg-white/5 text-white/60 border border-white/10 rounded-lg font-black text-[11px] uppercase tracking-widest hover:bg-white/10 hover:text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-[#ccff00] text-black rounded-lg font-black text-[11px] uppercase tracking-widest hover:shadow-[0_0_20px_rgba(204,255,0,0.3)] transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Novo Produto
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-[#111] border border-[#ccff00]/20 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-black/30">
                <th className="text-left px-3 py-2 text-[10px] font-black text-[#ccff00]/60 uppercase tracking-widest">Ref</th>
                <th className="text-left px-3 py-2 text-[10px] font-black text-[#ccff00]/60 uppercase tracking-widest">Descrição</th>
                <th className="text-right px-3 py-2 text-[10px] font-black text-[#ccff00]/60 uppercase tracking-widest">Preço Venda</th>
                <th className="text-right px-3 py-2 text-[10px] font-black text-[#ccff00]/60 uppercase tracking-widest">Estoque</th>
                <th className="text-right px-3 py-2 text-[10px] font-black text-[#ccff00]/60 uppercase tracking-widest hidden md:table-cell">Custo</th>
                <th className="text-right px-3 py-2 text-[10px] font-black text-[#ccff00]/60 uppercase tracking-widest hidden md:table-cell">Lucro</th>
                <th className="text-right px-3 py-2 text-[10px] font-black text-[#ccff00]/60 uppercase tracking-widest hidden lg:table-cell">Lucro %</th>
                <th className="text-left px-3 py-2 text-[10px] font-black text-[#ccff00]/60 uppercase tracking-widest hidden lg:table-cell">Fornecedor</th>
                <th className="text-center px-3 py-2 text-[10px] font-black text-[#ccff00]/60 uppercase tracking-widest">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-white/40 text-xs font-bold uppercase tracking-widest">
                    Carregando produtos...
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-white/30 text-xs font-bold uppercase tracking-widest">
                    {searchQuery ? 'Nenhum produto encontrado para essa busca.' : 'Nenhum produto cadastrado. Cadastre o primeiro!'}
                  </td>
                </tr>
              )}
              {!isLoading && filtered.map((p) => {
                const estoque = Number(p.estoque_atual) || 0;
                const minimo = Number(p.estoque_minimo) || 5;
                const baixo = estoque <= minimo;
                return (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-[#ccff00]/5 transition-colors">
                    <td className="px-3 py-2 font-black text-[#ccff00] whitespace-nowrap">{p.referencia}</td>
                    <td className="px-3 py-2 text-white/80 max-w-[260px] truncate" title={p.descricao}>{p.descricao}</td>
                    <td className="px-3 py-2 text-right font-bold text-white whitespace-nowrap">{brl(p.preco_venda)}</td>
                    <td className={cn("px-3 py-2 text-right font-black whitespace-nowrap", baixo ? "text-red-500" : "text-white")}>
                      {estoque}
                      {baixo && <span className="ml-1 text-[9px] uppercase">▼ mín {minimo}</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-white/60 whitespace-nowrap hidden md:table-cell">{brl(p.custo)}</td>
                    <td className={cn("px-3 py-2 text-right font-bold whitespace-nowrap hidden md:table-cell", (Number(p.lucro) || 0) >= 0 ? "text-emerald-400" : "text-red-500")}>
                      {brl(p.lucro)}
                    </td>
                    <td className={cn("px-3 py-2 text-right font-bold whitespace-nowrap hidden lg:table-cell", (Number(p.lucro_percentual) || 0) >= 0 ? "text-emerald-400" : "text-red-500")}>
                      {Number(p.lucro_percentual || 0).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-white/50 text-xs hidden lg:table-cell max-w-[140px] truncate" title={p.fornecedor || ''}>
                      {p.fornecedor || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          title="Editar produto"
                          className="p-1.5 rounded-md text-white/40 hover:text-[#ccff00] hover:bg-[#ccff00]/10 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteModal(p)}
                          title="Excluir produto"
                          className="p-1.5 rounded-md text-white/40 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!isLoading && filtered.length > 0 && (
          <div className="px-3 py-2 border-t border-white/5 text-[10px] font-bold text-white/30 uppercase tracking-widest">
            {filtered.length} de {produtos.length} produto(s)
          </div>
        )}
      </div>

      {/* Modal Cadastro/Edição */}
      <AnimatePresence>
        {formModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111] border border-[#ccff00]/30 rounded-xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3 text-[#ccff00]">
                  <Tag className="w-6 h-6" />
                  <h3 className="text-lg font-black uppercase tracking-widest">
                    {formModal.editId ? 'Editar Produto' : 'Novo Produto'}
                  </h3>
                </div>
                <button
                  onClick={() => setFormModal({ open: false, editId: null })}
                  className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest">Referência *</label>
                    <input
                      type="text"
                      value={form.referencia}
                      onChange={(e) => setForm({ ...form, referencia: e.target.value })}
                      className="w-full bg-[#222] border border-white/10 focus:border-[#ccff00] p-2.5 rounded-lg outline-none text-sm font-bold text-[#ccff00] uppercase transition-colors"
                      placeholder="Ex: REF01"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest">Fornecedor</label>
                    <input
                      type="text"
                      value={form.fornecedor}
                      onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                      className="w-full bg-[#222] border border-white/10 focus:border-[#ccff00] p-2.5 rounded-lg outline-none text-sm font-bold text-white transition-colors"
                      placeholder="Nome do fornecedor"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest">Descrição *</label>
                  <input
                    type="text"
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    className="w-full bg-[#222] border border-white/10 focus:border-[#ccff00] p-2.5 rounded-lg outline-none text-sm font-bold text-white transition-colors"
                    placeholder="Descrição da mercadoria"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest">Preço Venda (R$) *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.preco_venda}
                      onChange={(e) => setForm({ ...form, preco_venda: e.target.value })}
                      className="w-full bg-[#222] border border-white/10 focus:border-[#ccff00] p-2.5 rounded-lg outline-none text-sm font-bold text-[#ccff00] transition-colors"
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest">Custo (R$) *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.custo}
                      onChange={(e) => setForm({ ...form, custo: e.target.value })}
                      className="w-full bg-[#222] border border-white/10 focus:border-[#ccff00] p-2.5 rounded-lg outline-none text-sm font-bold text-white transition-colors"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                {/* Preview de lucro */}
                <div className="flex items-center gap-4 bg-black/40 border border-white/5 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest block">Lucro</span>
                    <span className={cn("text-sm font-black", previewLucro.lucro >= 0 ? "text-emerald-400" : "text-red-500")}>
                      {brl(previewLucro.lucro)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest block">Lucro %</span>
                    <span className={cn("text-sm font-black", previewLucro.pct >= 0 ? "text-emerald-400" : "text-red-500")}>
                      {previewLucro.pct.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest">Estoque Atual</label>
                    <input
                      type="number"
                      min={0}
                      value={form.estoque_atual}
                      onChange={(e) => setForm({ ...form, estoque_atual: e.target.value })}
                      className="w-full bg-[#222] border border-white/10 focus:border-[#ccff00] p-2.5 rounded-lg outline-none text-sm font-bold text-white transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest">Estoque Mínimo</label>
                    <input
                      type="number"
                      min={0}
                      value={form.estoque_minimo}
                      onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })}
                      className="w-full bg-[#222] border border-white/10 focus:border-[#ccff00] p-2.5 rounded-lg outline-none text-sm font-bold text-white transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/10">
                <button
                  onClick={() => setFormModal({ open: false, editId: null })}
                  className="px-5 py-2.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm font-bold"
                >
                  CANCELAR
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  autoFocus
                  className="px-5 py-2.5 rounded-lg bg-[#ccff00] text-black font-black text-sm uppercase tracking-widest hover:shadow-[0_0_20px_rgba(204,255,0,0.3)] transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? (
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {formModal.editId ? 'Salvar' : 'Cadastrar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Exclusão */}
      <AnimatePresence>
        {deleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111] border border-red-500/30 rounded-xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-3 text-red-500 mb-4">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-lg font-black uppercase tracking-widest">Excluir Produto?</h3>
              </div>
              <p className="text-white/70 text-sm mb-2 leading-relaxed">
                Excluir <strong className="text-white">{deleteModal.referencia}</strong> — {deleteModal.descricao}?
              </p>
              <p className="text-white/40 text-xs mb-6 leading-relaxed">
                O histórico de movimentações de estoque deste produto também será apagado. O histórico de vendas das lives não é afetado.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteModal(null)}
                  className="px-4 py-2 rounded-md text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm font-bold"
                >
                  CANCELAR
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  autoFocus
                  className="px-4 py-2 rounded-md bg-red-500 text-white font-black text-sm hover:bg-red-600 transition-colors shadow-[0_0_15px_rgba(239,68,68,0.3)] disabled:opacity-50 flex items-center gap-2"
                >
                  {isDeleting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  SIM, EXCLUIR
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Resumo Importação CSV */}
      <AnimatePresence>
        {importSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111] border border-[#58a6ff]/30 rounded-xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-3 text-[#58a6ff] mb-4">
                <Package className="w-6 h-6" />
                <h3 className="text-lg font-black uppercase tracking-widest">Importar Estoque</h3>
              </div>
              <p className="text-white/70 text-sm mb-4">
                Arquivo: <strong className="text-white">{importSummary.filename}</strong>
                <br />
                Produtos encontrados: <strong className="text-[#58a6ff]">{importSummary.products.length}</strong>
              </p>
              {importSummary.warnings.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg mb-4 max-h-32 overflow-y-auto">
                  <h4 className="text-xs font-bold text-yellow-500 flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Alertas ({importSummary.warnings.length})
                  </h4>
                  <ul className="list-disc pl-4 text-[11px] text-yellow-500/80 space-y-0.5">
                    {importSummary.warnings.map((warn, i) => (
                      <li key={i}>{warn}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-white/40 mb-6">
                Produtos existentes com a mesma referência serão <strong>atualizados</strong> (preço, custo e estoque).
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setImportSummary(null)}
                  disabled={isImporting}
                  className="px-4 py-2 rounded-md text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm font-bold"
                >
                  CANCELAR
                </button>
                <button
                  onClick={confirmImport}
                  disabled={isImporting || importSummary.products.length === 0}
                  className="px-4 py-2 rounded-md bg-[#58a6ff] text-black font-black text-sm hover:bg-[#79b8ff] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isImporting ? (
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Confirmar Importação
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
