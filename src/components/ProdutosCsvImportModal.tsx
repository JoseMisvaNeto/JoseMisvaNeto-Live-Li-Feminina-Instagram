import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { api, type ProdutoImportMode, type ProdutoRow } from '../lib/api';
import { parseProductCsv, type ProductCsvParseResult } from '../utils/productCsvImport';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MODOS: { id: ProdutoImportMode; titulo: string; descricao: string }[] = [
  {
    id: 'cadastro',
    titulo: 'Atualizar cadastro sem alterar estoque',
    descricao: 'Atualiza descrição e preço unitário. O estoque atual fica como está.',
  },
  {
    id: 'somar',
    titulo: 'Somar quantidade ao estoque',
    descricao: 'Adiciona a quantidade do CSV ao estoque existente. Reimportar o mesmo arquivo soma de novo.',
  },
  {
    id: 'substituir',
    titulo: 'Substituir quantidade pelo CSV',
    descricao: 'Define o estoque do produto como a quantidade do CSV.',
  },
];

interface Props {
  open: boolean;
  produtos: ProdutoRow[];
  showToast: (msg: string) => void;
  onClose: () => void;
  onImported: () => void | Promise<void>;
}

export default function ProdutosCsvImportModal({ open, produtos, showToast, onClose, onImported }: Props) {
  const [resultado, setResultado] = useState<ProductCsvParseResult | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [modo, setModo] = useState<ProdutoImportMode>('cadastro');
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setResultado(null);
    setNomeArquivo('');
    setModo('cadastro');
    setLendo(false);
    setSalvando(false);
    setArrastando(false);
  }, [open]);

  const referenciasExistentes = useMemo(
    () => new Set(produtos.map((p) => String(p.referencia || '').trim().toUpperCase())),
    [produtos]
  );

  const novos = useMemo(
    () => (resultado ? resultado.rows.filter((r) => !referenciasExistentes.has(r.referencia)).length : 0),
    [resultado, referenciasExistentes]
  );
  const existentes = resultado ? resultado.rows.length - novos : 0;

  const podeConfirmar =
    !!resultado &&
    !resultado.cabecalhoInvalido &&
    !resultado.bloqueado &&
    resultado.rows.length > 0 &&
    !lendo &&
    !salvando;

  const lerArquivo = async (file: File) => {
    if (!/\.csv$/i.test(file.name)) {
      showToast('⚠️ Selecione um arquivo com extensão .csv');
      return;
    }
    setLendo(true);
    try {
      // file.text() decodifica UTF-8; o BOM é removido pelo parser
      const texto = await file.text();
      setResultado(parseProductCsv(texto));
      setNomeArquivo(file.name);
    } catch (err: any) {
      showToast(`⚠️ Erro ao ler o CSV: ${err?.message || err}`);
    } finally {
      setLendo(false);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void lerArquivo(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastando(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void lerArquivo(file);
  };

  const handleConfirmar = async () => {
    if (!resultado || !podeConfirmar) return;
    setSalvando(true);
    try {
      const res = await api.importarProdutosCSV(
        resultado.rows.map((row) => ({
          referencia: row.referencia,
          descricao: row.descricao,
          quantidade: row.quantidade,
          valor_unitario: row.valor_unitario,
        })),
        modo
      );
      const complemento = modo === 'cadastro' ? 'sem alterar estoque' : modo === 'somar' ? 'estoque somado' : 'estoque substituído';
      showToast(
        `✅ ${res.criados} novo(s), ${res.atualizados} atualizado(s) — ${res.unidades} unidade(s), ${complemento}.`
      );
      onClose();
      await onImported();
    } catch (err: any) {
      showToast(`⚠️ Importação não gravada: ${err?.message || err}`);
    } finally {
      setSalvando(false);
    }
  };

  const trocarArquivo = () => {
    setResultado(null);
    setNomeArquivo('');
    setModo('cadastro');
    inputRef.current?.click();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-[#111] border border-[#58a6ff]/30 rounded-xl p-5 sm:p-6 max-w-4xl w-full shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 text-[#58a6ff]">
                <FileSpreadsheet className="w-6 h-6" />
                <div>
                  <h3 className="text-lg font-black uppercase tracking-widest leading-none">Importar produtos CSV</h3>
                  {nomeArquivo && (
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1 truncate max-w-[320px]">
                      {nomeArquivo}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                disabled={salvando}
                className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={handleInput} className="hidden" />

            {!resultado && (
              <div
                onClick={() => !lendo && inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={handleDrop}
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                  arrastando
                    ? 'border-[#58a6ff] bg-[#58a6ff]/10'
                    : 'border-white/15 hover:border-[#58a6ff]/60 hover:bg-[#58a6ff]/5'
                )}
              >
                <Upload className={cn('w-8 h-8 mx-auto mb-3', lendo ? 'text-white/30' : 'text-[#58a6ff]')} />
                <p className="text-sm font-black text-white uppercase tracking-widest">
                  {lendo ? 'Lendo arquivo...' : 'Arraste o CSV aqui ou clique para selecionar'}
                </p>
                <p className="text-xs text-white/40 mt-2 leading-relaxed">
                  Colunas obrigatórias: <strong className="text-white/60">referencia</strong>,{' '}
                  <strong className="text-white/60">descricao</strong>,{' '}
                  <strong className="text-white/60">quantidade</strong>,{' '}
                  <strong className="text-white/60">valor_unitario</strong>
                  <br />
                  Aceita UTF-8 (com ou sem BOM), separador <strong className="text-white/60">;</strong> ou{' '}
                  <strong className="text-white/60">,</strong> e decimal com vírgula (139,90).
                </p>
              </div>
            )}

            {resultado && (
              <div className="space-y-3">
                {resultado.cabecalhoInvalido && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-400 leading-relaxed">
                    <div className="flex items-center gap-2 font-black uppercase tracking-widest mb-1">
                      <AlertTriangle className="w-4 h-4" /> Arquivo não reconhecido
                    </div>
                    {resultado.cabecalhoInvalido}
                  </div>
                )}

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <div className="bg-black/40 border border-white/10 rounded-lg p-2.5">
                    <div className="text-[9px] font-black text-white/40 uppercase tracking-widest">Registros válidos</div>
                    <div className="text-xl font-black text-[#58a6ff]">{resultado.totalValidos}</div>
                  </div>
                  <div className="bg-black/40 border border-white/10 rounded-lg p-2.5">
                    <div className="text-[9px] font-black text-white/40 uppercase tracking-widest">Com erro</div>
                    <div className={cn('text-xl font-black', resultado.totalErros > 0 ? 'text-red-400' : 'text-white')}>
                      {resultado.totalErros}
                    </div>
                  </div>
                  <div className="bg-black/40 border border-white/10 rounded-lg p-2.5">
                    <div className="text-[9px] font-black text-white/40 uppercase tracking-widest">Soma das quantidades</div>
                    <div className="text-xl font-black text-white">{resultado.somaQuantidades}</div>
                  </div>
                  <div className="bg-black/40 border border-white/10 rounded-lg p-2.5">
                    <div className="text-[9px] font-black text-white/40 uppercase tracking-widest">Referências repetidas</div>
                    <div className={cn('text-xl font-black', resultado.duplicadas.length > 0 ? 'text-yellow-400' : 'text-white')}>
                      {resultado.duplicadas.length}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  <span>{resultado.totalLinhas} linha(s) de dados</span>
                  <span className="text-emerald-400">{novos} novo(s)</span>
                  <span className="text-[#58a6ff]">{existentes} já cadastrado(s)</span>
                </div>

                {resultado.bloqueado && resultado.conflitos.length > 0 && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-red-400 font-black text-xs uppercase tracking-widest mb-1">
                      <AlertTriangle className="w-4 h-4" /> Importação bloqueada — revise o arquivo
                    </div>
                    <p className="text-[11px] text-red-300/80 mb-2 leading-relaxed">
                      A mesma referência aparece com descrição ou valor unitário diferentes. Nada será gravado até corrigir e
                      reenviar o arquivo.
                    </p>
                    <ul className="list-disc pl-4 text-[11px] text-red-300/90 space-y-0.5 max-h-28 overflow-y-auto">
                      {resultado.conflitos.map((c) => (
                        <li key={c.referencia}>
                          <strong>{c.referencia}</strong> — linhas {c.linhas.join(', ')} divergem em {c.motivo}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {resultado.totalErros > 0 && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-yellow-500 font-black text-xs uppercase tracking-widest mb-1">
                      <AlertTriangle className="w-4 h-4" /> Linhas com erro ({resultado.totalErros})
                    </div>
                    <ul className="text-[11px] text-yellow-500/80 space-y-0.5 max-h-32 overflow-y-auto">
                      {resultado.errors.map((erro) => (
                        <li key={`${erro.linha}-${erro.motivo}`}>
                          Linha {erro.linha}
                          {erro.referencia ? ` (${erro.referencia})` : ''}: {erro.motivo}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {resultado.duplicadas.length > 0 && (
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                    <div className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">
                      Referências consolidadas ({resultado.duplicadas.length})
                    </div>
                    <div className="max-h-24 overflow-y-auto text-[11px] text-white/60 space-y-0.5">
                      {resultado.duplicadas.map((dup) => (
                        <div key={dup.referencia}>
                          <strong className="text-[#ccff00]">{dup.referencia}</strong> — linhas {dup.linhas.join(', ')}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {resultado.rows.length > 0 && (
                  <div className="border border-white/10 rounded-lg overflow-hidden">
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#161616]">
                          <tr>
                            <th className="text-left px-2 py-1.5 text-[9px] font-black text-white/40 uppercase tracking-widest">Referência</th>
                            <th className="text-left px-2 py-1.5 text-[9px] font-black text-white/40 uppercase tracking-widest">Descrição</th>
                            <th className="text-right px-2 py-1.5 text-[9px] font-black text-white/40 uppercase tracking-widest">Quantidade</th>
                            <th className="text-right px-2 py-1.5 text-[9px] font-black text-white/40 uppercase tracking-widest">Valor unitário</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resultado.rows.map((row) => (
                            <tr key={row.referencia} className="border-t border-white/5">
                              <td className="px-2 py-1.5 font-black text-[#ccff00] whitespace-nowrap">
                                {row.referencia}
                                {row.linhas.length > 1 && (
                                  <span className="ml-1.5 text-[9px] font-bold text-white/30">×{row.linhas.length}</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-white/70 max-w-[380px] truncate" title={row.descricao}>
                                {row.descricao}
                              </td>
                              <td className="px-2 py-1.5 text-right text-white font-bold">{row.quantidade}</td>
                              <td className="px-2 py-1.5 text-right text-white font-bold whitespace-nowrap">
                                {brl(row.valor_unitario)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {resultado.rows.length > 0 && (
                  <div className="bg-black/40 border border-white/10 rounded-lg p-3 space-y-2">
                    <div className="text-[10px] font-black text-white/50 uppercase tracking-widest">
                      Produtos já cadastrados ({existentes})
                    </div>
                    {MODOS.map((opcao) => (
                      <label
                        key={opcao.id}
                        className={cn(
                          'flex items-start gap-2.5 p-2 rounded-md border cursor-pointer transition-colors',
                          modo === opcao.id
                            ? 'border-[#58a6ff]/60 bg-[#58a6ff]/10'
                            : 'border-white/10 hover:bg-white/5'
                        )}
                      >
                        <input
                          type="radio"
                          name="produto-csv-modo"
                          checked={modo === opcao.id}
                          onChange={() => setModo(opcao.id)}
                          className="mt-0.5 accent-[#58a6ff]"
                        />
                        <span>
                          <span className="block text-xs font-black text-white">{opcao.titulo}</span>
                          <span className="block text-[11px] text-white/40 leading-snug">{opcao.descricao}</span>
                        </span>
                      </label>
                    ))}
                    {modo === 'somar' && (
                      <p className="text-[11px] text-yellow-500 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Reimportar o mesmo arquivo vai duplicar o estoque.
                      </p>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-white/30 leading-relaxed">
                  Nada é gravado antes de confirmar. A referência é o identificador do produto: nenhum produto é criado em
                  duplicidade e produtos fora do CSV não são removidos.
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between gap-3 mt-5 pt-4 border-t border-white/10">
              <button
                onClick={trocarArquivo}
                disabled={lendo || salvando}
                className="px-4 py-2.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm font-bold disabled:opacity-50"
              >
                {resultado ? 'Escolher outro arquivo' : 'Selecionar arquivo'}
              </button>
              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  disabled={salvando}
                  className="px-4 py-2.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm font-bold disabled:opacity-50"
                >
                  CANCELAR
                </button>
                <button
                  onClick={handleConfirmar}
                  disabled={!podeConfirmar}
                  className="px-5 py-2.5 rounded-lg bg-[#58a6ff] text-black font-black text-sm uppercase tracking-widest hover:bg-[#79b8ff] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {salvando ? (
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Confirmar importação
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
