import { useSyncExternalStore, useState } from 'react';
import { MessageCircle, Trash2, Check } from 'lucide-react';
import {
  assinarComentarios,
  getComentarios,
  getNaoLidos,
  marcarUsado,
  limparComentarios,
  zerarNaoLidos,
} from '../lib/comentariosLive';

type Props = {
  /** Preenche o campo de pesquisa da tela Live com o @username. */
  onSelecionar: (username: string) => void;
};

/**
 * Painel flutuante de comentários da live (borda direita, recolhível).
 * Assina o store externo: comentários novos re-renderizam SÓ este painel,
 * nunca a árvore inteira do App (fluidez da live é essencial).
 * Clicar numa linha só PREENCHE a busca — nenhuma gravação acontece aqui.
 */
export default function PainelComentariosLive({ onSelecionar }: Props) {
  const comentarios = useSyncExternalStore(assinarComentarios, getComentarios);
  const naoLidos = useSyncExternalStore(assinarComentarios, getNaoLidos);
  const [aberto, setAberto] = useState(false);

  const alternar = () => {
    const proximo = !aberto;
    setAberto(proximo);
    if (proximo) zerarNaoLidos();
  };

  // Botão recolhido: só o 💬 com contador de novos
  if (!aberto) {
    return (
      <button
        type="button"
        onClick={alternar}
        title="Comentários da live"
        className="fixed right-0 top-1/2 -translate-y-1/2 z-[95] flex items-center gap-1.5 pl-2.5 pr-2 py-3 bg-[#111] border border-r-0 border-[#ccff00]/40 rounded-l-xl shadow-[0_0_25px_rgba(0,0,0,0.6)] hover:bg-[#1a1a1a] transition-all"
      >
        <MessageCircle className="w-5 h-5 text-[#ccff00]" />
        {naoLidos > 0 && (
          <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-[#ccff00] text-black text-[10px] font-black rounded-full">
            {naoLidos > 99 ? '99+' : naoLidos}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed right-0 top-1/2 -translate-y-1/2 z-[95] w-[300px] max-h-[85vh] flex flex-col bg-[#111] border border-r-0 border-[#ccff00]/40 rounded-l-xl shadow-[0_0_30px_rgba(0,0,0,0.7)]">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#ccff00]/20 bg-[#151515] rounded-tl-xl">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle className="w-4 h-4 text-[#ccff00] shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-widest text-[#ccff00] truncate">
            Comentários
          </span>
          <span className="text-[10px] font-mono text-white/30 shrink-0">
            ({comentarios.length})
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={limparComentarios}
            title="Limpar lista"
            className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={alternar}
            title="Recolher"
            className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
          >
            <span className="text-xs font-black leading-none">›</span>
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {comentarios.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-white/25 text-[11px] font-mono uppercase tracking-widest leading-relaxed">
              Nenhum comentário ainda.
              <br />
              Abra o Instagram pelo botão
              <br />
              e rode o bookmarklet.
            </p>
          </div>
        ) : (
          comentarios.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                marcarUsado(c.id);
                onSelecionar(c.username);
              }}
              title="Clicar preenche o campo de pesquisa"
              className={[
                'w-full text-left px-3 py-2 border-b border-white/5 transition-colors',
                c.usado
                  ? 'opacity-35 hover:opacity-70'
                  : 'hover:bg-[#ccff00]/10',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <span className="text-[#ccff00] font-black text-[13px] truncate flex-1">
                  {c.username ? `@${c.username}` : '(sem username)'}
                </span>
                {c.usado ? (
                  <Check className="w-3.5 h-3.5 text-[#22c55e] shrink-0" />
                ) : (
                  <span className="text-white/20 text-[9px] font-mono shrink-0">
                    {new Date(c.recebidoEm).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
              {c.texto && (
                <span className="block text-white/40 text-[11px] leading-tight mt-0.5 truncate">
                  {c.texto}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Rodapé: instrução */}
      <div className="px-3 py-1.5 border-t border-[#ccff00]/20 bg-[#151515] rounded-bl-xl">
        <span className="text-[9px] font-mono uppercase tracking-widest text-white/25">
          clique = preenche a busca
        </span>
      </div>
    </div>
  );
}
