/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Search, 
  ShoppingBag, 
  History, 
  CheckCircle2, 
  XCircle, 
  Instagram, 
  Plus, 
  DollarSign, 
  Package, 
  User,
  LayoutDashboard,
  LogOut,
  ArrowRight,
  Upload,
  FileText,
  Download,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Copy,
  Users,
  Database,
  X,
  MessageCircle,
  Settings,
  MessageSquare,
  Play,
  Check,
  CheckCheck,
  Edit2,
  Save,
  PlusCircle,
  Calendar,
  Zap,
  Truck,
  PackageCheck,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { processCSVFiles, downloadCSV, processProductsCSV, downloadProductsCSV, ProcessingResult, InstagramProfile } from './utils/csvProcessor';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Supabase Client Initialization
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

// --- Types & Mock Data ---
interface Customer {
  id: string | number;
  username: string;
  nome_completo: string;
  photo_url?: string;
  purchaseCount?: number;
  lastPurchaseTime?: string;
  codigo_cliente?: number | null;
  telefone?: string;
  observacoes?: string;
  bloqueada?: boolean;
}

interface Purchase {
  id: string;
  venda_id?: string;
  customerId: number;
  reference: string;
  value: number;
  quantity: number;
  paid: boolean;
  timestamp: Date;
}

interface GroupedPurchase {
  customerId: number;
  username: string;
  nome_completo: string;
  telefone?: string;
  items: Purchase[];
  total: number;
  paid: boolean;
  delivered: boolean;
  qtdLive: number;
  codigo_cliente?: number | null;
}

interface LiveConfig {
  isActive: boolean;
  date: string;
}

// --- Components ---

const Navbar = ({ 
  activeTab, 
  setActiveTab, 
  onOpenSettings, 
  onOpenHistory,
  liveConfig,
  setLiveConfig
}: { 
  activeTab: string, 
  setActiveTab: (t: string) => void, 
  onOpenSettings: () => void, 
  onOpenHistory: () => void,
  liveConfig: LiveConfig,
  setLiveConfig: (c: LiveConfig) => void
}) => {
  const tabs = [
    { id: 'live', label: 'LIVE', icon: ShoppingBag },
    { id: 'acerto', label: 'ACERTO', icon: LayoutDashboard },
    { id: 'sacolas', label: 'SACOLAS', icon: Package },
    { id: 'clientes', label: 'CLIENTES', icon: Users },
    { id: 'import', label: 'IMPORT', icon: Upload },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 h-12 bg-[#0a0a0a] border-b border-[#ccff00]/20 z-50 flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-[#ccff00] rounded-sm flex items-center justify-center">
          <Package className="text-black w-4 h-4" />
        </div>
        <span className="font-black tracking-tighter text-[#ccff00] text-lg">LIVE LOGISTICS</span>
      </div>
      
      <div className="hidden md:flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all duration-300 font-bold text-[10px] tracking-widest",
              activeTab === tab.id 
                ? "bg-[#ccff00] text-black shadow-[0_0_20px_rgba(204,255,0,0.4)]" 
                : "text-[#ccff00]/60 hover:text-[#ccff00] hover:bg-[#ccff00]/10"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

        <div className="flex items-center gap-4 text-[#ccff00]/40 text-xs font-mono">
          <div className="flex items-center gap-1">
            <button 
              onClick={onOpenHistory}
              className="p-1.5 hover:bg-[#ccff00]/10 rounded-md transition-colors text-[#ccff00]/60 hover:text-[#ccff00]"
              title="Histórico de Vendas"
            >
              <History className="w-4 h-4" />
            </button>
            <button 
              onClick={onOpenSettings}
              className="p-1.5 hover:bg-[#ccff00]/10 rounded-md transition-colors text-[#ccff00]/60 hover:text-[#ccff00]"
              title="Configurações de Mensagem"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
          <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md border", liveConfig.isActive ? "bg-[#ccff00]/10 border-[#ccff00]/50 shadow-[0_0_15px_rgba(204,255,0,0.2)]" : "bg-white/5 border-white/10")}>
            <div className={cn("w-2 h-2 rounded-full", liveConfig.isActive ? "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" : "bg-white/20")} />
            <span className={cn("text-sm font-black leading-none uppercase tracking-wider", liveConfig.isActive ? "text-[#ccff00]" : "text-white/40")}>
              {liveConfig.isActive ? `LIVE ${safeFormatDate(liveConfig.date)}` : 'LIVE OFF'}
            </span>
          </div>
        </div>
    </nav>
  );
};

const normalize = (str: string) => 
  (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const safeFormatDate = (dateStr: string | undefined | null) => {
  if (!dateStr) return 'Data Inválida';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return 'Data Inválida';
    return d.toLocaleDateString('pt-BR');
  } catch (e) {
    return 'Data Inválida';
  }
};

export default function App() {
  console.log('[App] Rendering started');
  const [activeTab, setActiveTab] = useState(() => window.innerWidth < 768 ? 'sacolas' : 'live');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [confirmQty, setConfirmQty] = useState(1);

  useEffect(() => {
    if (selectedCustomer) {
      setConfirmQty(1);
    }
  }, [selectedCustomer]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const customersRef = useRef(customers);
  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);
  const [isFetchingCustomers, setIsFetchingCustomers] = useState(false);
  const [shoppingList, setShoppingList] = useState<Customer[]>(() => {
    const saved = localStorage.getItem('shoppingList');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { console.error("Error parsing shoppingList:", e); }
    }
    return [];
  });
  const [timeline, setTimeline] = useState<Customer[]>(() => {
    const saved = localStorage.getItem('timeline');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { console.error("Error parsing timeline:", e); }
    }
    return [];
  });
  
  useEffect(() => {
    localStorage.setItem('shoppingList', JSON.stringify(shoppingList));
  }, [shoppingList]);

  useEffect(() => {
    localStorage.setItem('timeline', JSON.stringify(timeline));
  }, [timeline]);
  
  // Message Template State
  const [messageTemplate, setMessageTemplate] = useState(() => {
    return localStorage.getItem('messageTemplate') || '{{saudacao}}, {{nome}}! Passando para agradecer pela companhia na live de ontem, foi um sucesso graças a vocês! 😍 Deus abençoe muito.\n\nO valor total das suas comprinhas ficou em R$ {{total}}\nComo você prefere pagar?\n\nPIX: 47997125503\n\nLink de pagamento (me avise que eu te envio!)\n\nAssim que fizer o pagamento, me manda o comprovante para eu separar sua sacola.\nObrigada! ❤️';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  
  // Manual Live History State
  const [isAddingManualLive, setIsAddingManualLive] = useState(false);
  const [manualLiveDate, setManualLiveDate] = useState('');
  const [manualLiveValue, setManualLiveValue] = useState('');
  const [manualLiveObs, setManualLiveObs] = useState('');
  const [manualLiveQtdSacolas, setManualLiveQtdSacolas] = useState('');
  const [editingLiveId, setEditingLiveId] = useState<string | null>(null);
  const [editingLiveObs, setEditingLiveObs] = useState('');

  const [sentMessages, setSentMessages] = useState<string[]>(() => {
    const saved = localStorage.getItem('sentMessages');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { console.error("Error parsing sentMessages:", e); }
    }
    return [];
  });

  const [sentWhatsappMessages, setSentWhatsappMessages] = useState<string[]>(() => {
    const saved = localStorage.getItem('sentWhatsappMessages');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { console.error("Error parsing sentWhatsappMessages:", e); }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('sentMessages', JSON.stringify(sentMessages));
  }, [sentMessages]);

  useEffect(() => {
    localStorage.setItem('sentWhatsappMessages', JSON.stringify(sentWhatsappMessages));
  }, [sentWhatsappMessages]);

  // Focus Mode State
  const [isFocusModeOpen, setIsFocusModeOpen] = useState(false);
  const [isFinalizarModalOpen, setIsFinalizarModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'salvar' | 'finalizar';
    title: string;
    message: string;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [focusQueue, setFocusQueue] = useState<GroupedPurchase[]>([]);
  
  // Danger Zone State
  const [isDangerModalOpen, setIsDangerModalOpen] = useState(false);
  const [dangerInput, setDangerInput] = useState('');
  const expectedDangerText = `Live Logistics ${new Date().toLocaleDateString('pt-BR')}`;
  const [currentFocusIndex, setCurrentFocusIndex] = useState(0);

  // Produtos CSV State
  const [productImportModal, setProductImportModal] = useState<{
    products: any[];
    warnings: string[];
    count: number;
    filename: string;
  } | null>(null);
  const [isImportingProducts, setIsImportingProducts] = useState(false);

  // Acerto State
  const [acertoId, setAcertoId] = useState('');
  const [acertoRef, setAcertoRef] = useState('');
  const [acertoValue, setAcertoValue] = useState('');
  const [acertoQuantity, setAcertoQuantity] = useState('1');
  const [showRecentPurchases, setShowRecentPurchases] = useState(false);
  const [deletePurchaseModal, setDeletePurchaseModal] = useState<{ visible: boolean, purchase: Purchase | null }>({ visible: false, purchase: null });
  const [validatedRefs, setValidatedRefs] = useState<Set<string>>(new Set());
  const [pendingRefValidation, setPendingRefValidation] = useState<{ref: string, action: 'focus_price' | 'submit'} | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>(() => {
    const saved = localStorage.getItem('purchases');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          parsed.sort((a, b) => {
            const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            const validA = !isNaN(timeA) ? timeA : 0;
            const validB = !isNaN(timeB) ? timeB : 0;
            if (validB !== validA) return validB - validA;
            const idA = Number(a.id) || 0;
            const idB = Number(b.id) || 0;
            return idB - idA;
          });
          return parsed;
        }
      } catch (e) { console.error("Error parsing purchases:", e); }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('purchases', JSON.stringify(purchases));
  }, [purchases]);



  const [isSavingSale, setIsSavingSale] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [fechamentoSearch, setFechamentoSearch] = useState('');
  const [clientesSearch, setClientesSearch] = useState('');
  const [editingCustomerObservacoes, setEditingCustomerObservacoes] = useState<number | null>(null);
  const [tempObservacoes, setTempObservacoes] = useState('');
  const [editingCustomerTelefone, setEditingCustomerTelefone] = useState<number | null>(null);
  const [tempTelefone, setTempTelefone] = useState('');
  const [hoveredObs, setHoveredObs] = useState<{ text: string, x: number, y: number } | null>(null);
  const [bagFilterTab, setBagFilterTab] = useState<'todas' | 'pagas' | 'a_pagar' | 'entregues'>('todas');
  const [editingName, setEditingName] = useState('');
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

  const displayedCustomers = useMemo(() => {
    if (clientesSearch) {
      const cleanQuery = normalize(clientesSearch);
      
      const filtered = customers
        .filter(c => {
          const idStr = String(c.id || "").toLowerCase();
          const codeStr = c.codigo_cliente !== null && c.codigo_cliente !== undefined ? String(c.codigo_cliente) : "";
          const usernameStr = normalize(c.username || "");
          const nameStr = normalize(c.nome_completo || "");
          
          if (/^\d+$/.test(cleanQuery)) {
            return codeStr === cleanQuery || idStr === cleanQuery || codeStr.includes(cleanQuery);
          }

          return codeStr === cleanQuery || 
                 codeStr.includes(cleanQuery) ||
                 usernameStr.includes(cleanQuery) ||
                 nameStr.includes(cleanQuery) ||
                 (usernameStr + " " + nameStr).includes(cleanQuery);
        })
        .sort((a, b) => {
          const aCode = String(a.codigo_cliente || "").toLowerCase();
          const bCode = String(b.codigo_cliente || "").toLowerCase();
          const aId = String(a.id || "").toLowerCase();
          const bId = String(b.id || "").toLowerCase();
          const aUser = normalize(a.username || "");
          const bUser = normalize(b.username || "");
          const aName = normalize(a.nome_completo || "");
          const bName = normalize(b.nome_completo || "");

          if (aCode === cleanQuery && bCode !== cleanQuery) return -1;
          if (aCode !== cleanQuery && bCode === cleanQuery) return 1;

          if (aId === cleanQuery && bId !== cleanQuery) return -1;
          if (aId !== cleanQuery && bId === cleanQuery) return 1;

          if (aUser === cleanQuery && bUser !== cleanQuery) return -1;
          if (aUser !== cleanQuery && bUser === cleanQuery) return 1;
          
          if (aName === cleanQuery && bName !== cleanQuery) return -1;
          if (aName !== cleanQuery && bName === cleanQuery) return 1;

          const aCodeStarts = aCode.startsWith(cleanQuery);
          const bCodeStarts = bCode.startsWith(cleanQuery);
          if (aCodeStarts && !bCodeStarts) return -1;
          if (!aCodeStarts && bCodeStarts) return 1;

          const aUserStarts = aUser.startsWith(cleanQuery);
          const bUserStarts = bUser.startsWith(cleanQuery);
          if (aUserStarts && !bUserStarts) return -1;
          if (!aUserStarts && bUserStarts) return 1;
          
          const aNameStarts = aName.startsWith(cleanQuery);
          const bNameStarts = bName.startsWith(cleanQuery);
          if (aNameStarts && !bNameStarts) return -1;
          if (!aNameStarts && bNameStarts) return 1;

          return aUser.localeCompare(bUser);
        });

      return filtered.slice(0, 50); // Show top 50 results
    }
    
    // Idea 2: If no search, show recently active (from purchases) + latest added
    const activeIds = new Set(purchases.map(p => Number(p.customerId)));
    const activeCustomers = customers.filter(c => activeIds.has(Number(c.id)));
    
    if (activeCustomers.length >= 30) {
      return activeCustomers.slice(0, 30);
    }
    
    const additional = [...customers]
      .filter(c => !activeIds.has(Number(c.id)))
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, 30 - activeCustomers.length);
      
    return [...activeCustomers, ...additional].sort((a, b) => (a.codigo_cliente || 999999) - (b.codigo_cliente || 999999));
  }, [clientesSearch, customers, purchases]);
  const [processingIds, setProcessingIds] = useState<string[]>([]);

  // Live Config State
  const [liveConfig, setLiveConfig] = useState<LiveConfig>(() => {
    const saved = localStorage.getItem('liveConfig');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch (e) { console.error("Error parsing liveConfig:", e); }
    }
    return {
      isActive: false,
      date: new Date().toISOString().split('T')[0]
    };
  });
  const [dataLive, setDataLive] = useState(liveConfig.date);

  useEffect(() => {
    if (selectedCustomer) {
      if (selectedCustomer.nome_completo === 'Novo Cliente') {
        setEditingName(selectedCustomer.username.replace(/^@/, '').replace(/^"/, '').split(',')[0].trim());
      } else {
        setEditingName(selectedCustomer.nome_completo);
      }
    }
  }, [selectedCustomer]);

  useEffect(() => {
    localStorage.setItem('liveConfig', JSON.stringify(liveConfig));
    if (liveConfig.isActive) {
      setDataLive(liveConfig.date);
    }
  }, [liveConfig]);

  // Attempt to auto-sync the active live from the database when first loading or missing local state
  useEffect(() => {
    const fetchActiveLiveDate = async () => {
      if (!supabase || liveConfig.isActive) return;

      try {
        const { data, error } = await supabase
          .from('live_vendas')
          .select('data_live')
          .eq('status', 'pendente')
          .order('data_live', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          const latestLiveDate = data[0].data_live;
          console.log('Automagically connecting to active live:', latestLiveDate);
          setLiveConfig({
            isActive: true,
            date: latestLiveDate,
          });
        }
      } catch (err) {
        console.error('Failed to auto-fetch active live', err);
      }
    };

    fetchActiveLiveDate();
  }, [supabase, liveConfig.isActive]);

  const [manualPaidIds, setManualPaidIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('manualPaidIds');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { console.error("Error parsing manualPaidIds:", e); }
    }
    return [];
  });

  const [deliveredIds, setDeliveredIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('deliveredIds');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { console.error("Error parsing deliveredIds:", e); }
    }
    return [];
  });

  // Recovery/Sync logic
  const recoverData = useCallback(async (forced = false) => {
    if (!supabase || !liveConfig.isActive) return;
    
    // If not forced, optionally avoid overwriting. But we want robust sync, so default is forced = true.
    try {
      console.log('Fetching synced data from Supabase...');
      const { data: vendas, error: vError } = await supabase
        .from('live_vendas')
        .select(`
          *,
          live_vendas_itens (*),
          live_clientes (id, username, nome_completo, codigo_cliente)
        `)
        .eq('data_live', dataLive);
      
      if (vError) throw vError;

      if (vendas) {
        const recoveredPurchases: Purchase[] = [];
        const recoveredShoppingList: Customer[] = [];
        const recoveredManualPaid: string[] = [];
        const recoveredDelivered: string[] = [];

        for (const v of vendas) {
          const cidStr = String(v.cliente_id);
          
          if (v.pago) {
            recoveredManualPaid.push(cidStr);
          }
          if ((v as any).entregue) {
            recoveredDelivered.push(cidStr);
          }

          // Add to shopping list if not already there
          const clientData: any = v.live_clientes;
          let customer = customersRef.current.find(c => String(c.id) === cidStr);
          
          // Use joined client data if local customer is not loaded yet
          if (!customer && clientData) {
              customer = {
                  id: clientData.id,
                  username: clientData.username,
                  nome_completo: clientData.nome_completo,
                  codigo_cliente: clientData.codigo_cliente,
                  purchaseCount: v.qtd_live || 0
              };
          }

          if (customer && !recoveredShoppingList.some(c => String(c.id) === cidStr)) {
            recoveredShoppingList.push({
              ...customer,
              purchaseCount: v.qtd_live || 0
            });
          }

          // Add items to purchases
          if (v.live_vendas_itens) {
            for (const item of v.live_vendas_itens) {
              recoveredPurchases.push({
                id: String(item.id),
                venda_id: String(v.id),
                customerId: v.cliente_id,
                reference: item.referencia,
                value: item.preco,
                quantity: item.quantidade,
                paid: v.pago,
                timestamp: new Date(item.created_at || v.created_at)
              });
            }
          }
        }

        // Sort recovered purchases by timestamp descending (newest first)
        // If timestamps are identical, sort by ID descending (higher ID first)
        recoveredPurchases.sort((a, b) => {
          const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          const validA = !isNaN(timeA) ? timeA : 0;
          const validB = !isNaN(timeB) ? timeB : 0;
          if (validB !== validA) return validB - validA;
          const idA = Number(a.id) || 0;
          const idB = Number(b.id) || 0;
          return idB - idA;
        });

        // Always overwrite to force sync!
        setPurchases(recoveredPurchases);
        setShoppingList(recoveredShoppingList);
        setManualPaidIds(recoveredManualPaid);
        setDeliveredIds(recoveredDelivered);
        
        console.log('Sync successful:', recoveredPurchases.length, 'items loaded.');
      }
    } catch (err) {
      console.error('Error recovering data:', err);
    }
  }, [liveConfig.isActive, dataLive, supabase]);

  // Initial Sync on Load
  useEffect(() => {
    recoverData(true);
  }, [recoverData]);

  // Realtime Sync for Vendas (Pago/Entregue) and Itens (Sales additions/removals)
  useEffect(() => {
    if (!supabase || !liveConfig.isActive) return;

    console.log('[Realtime] Creating channel live_vendas_sync for', dataLive);

    const channel = supabase.channel('live_vendas_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_vendas' },
        (payload) => {
          // If a row was updated, check if it's the current live, then sync
          if (payload.new && (payload.new as any).data_live === dataLive) {
            recoverData(); 
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_vendas_itens' },
        (_payload) => {
          // An item was added, updated or deleted. Just resync everything for safety.
          recoverData();
        }
      )
      .subscribe((status, err) => {
        if (err) console.error('Error subscribing to Supabase Realtime Sync:', err);
      });

    return () => {
      console.log('[Realtime] Removing channel live_vendas_sync');
      supabase.removeChannel(channel).catch(err => console.error('Realtime removeChannel error:', err));
    };
  }, [supabase, liveConfig.isActive, dataLive, recoverData]);

  useEffect(() => {
    localStorage.setItem('manualPaidIds', JSON.stringify(manualPaidIds));
  }, [manualPaidIds]);

  useEffect(() => {
    localStorage.setItem('deliveredIds', JSON.stringify(deliveredIds));
  }, [deliveredIds]);

  const [confirmingUnpayId, setConfirmingUnpayId] = useState<string | null>(null);
  const unpayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Context Menu & Delete Modal State
  const [contextMenu, setContextMenu] = useState<{ visible: boolean, x: number, y: number, customerId: number | null } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ visible: boolean, customerId: number | null } | null>(null);
  const [blockModal, setBlockModal] = useState<{ visible: boolean, customer: Customer | null }>({ visible: false, customer: null });

  // Import State
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importResult, setImportResult] = useState<ProcessingResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [filteredResults, setFilteredResults] = useState<Customer[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedRowIndex, setSelectedRowIndex] = useState(-1);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  const refInput = useRef<HTMLInputElement>(null);
  const valueInput = useRef<HTMLInputElement>(null);
  const qtyInput = useRef<HTMLInputElement>(null);
  const idInput = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  const capitalizeWords = (str: string) => {
    return str.toLowerCase().replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
  };

  const getNextAvailableCustomerCode = (): number => {
    const codes = customers
      .map(c => Number(c.codigo_cliente))
      .filter(code => !isNaN(code) && code > 0)
      .sort((a, b) => a - b);

    if (codes.length === 0) return 1;
    if (codes[0] > 1) return 1;

    for (let i = 0; i < codes.length - 1; i++) {
      if (codes[i + 1] > codes[i] + 1) {
        return codes[i] + 1;
      }
    }

    return codes[codes.length - 1] + 1;
  };

  const getNextAvailableClientId = (): number => {
    const existingIds = customers
      .map(c => Number(c.id))
      .filter(id => !isNaN(id) && id > 0)
      .sort((a, b) => a - b);
    
    if (existingIds.length === 0 || existingIds[0] > 1) return 1;
    
    for (let i = 0; i < existingIds.length - 1; i++) {
      if (existingIds[i + 1] > existingIds[i] + 1) {
        return existingIds[i] + 1;
      }
    }
    return existingIds[existingIds.length - 1] + 1;
  };

  // Optimization: Global customers map for O(1) lookups
  const customersMap = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of customers) {
      if (c.id) map.set(String(c.id), c);
    }
    return map;
  }, [customers]);

  // Optimization: Customers in the current session (shoppingList or has purchases)
  const activeSessionCustomers = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of shoppingList) {
      if (c.id) map.set(String(c.id), c);
    }
    for (const p of purchases) {
      const cid = String(p.customerId);
      if (cid && !map.has(cid)) {
        const c = customersMap.get(cid);
        if (c) map.set(cid, c);
      }
    }
    return Array.from(map.values());
  }, [shoppingList, purchases, customersMap]);

  // Optimization: Active customer for the Acerto form validation
  const acertoActiveCustomer = useMemo(() => {
    const search = (acertoId || '').trim().toLowerCase();
    if (!search) return null;
    
    // 1. Busca APENAS na lista de compras (shoppingList)
    // Isso garante que só sejam aceitos códigos que vieram da tela "live lista de compras"
    const found = shoppingList.find(c => 
      String(c.codigo_cliente || "").toLowerCase() === search ||
      (c.username || '').toLowerCase().trim() === search
    );

    return found;
  }, [acertoId, shoppingList]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setFilteredResults([]);
        setActiveIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [activeIndex]);

  // Fetch customers from Supabase (with batching to bypass 1000 limit)
  const fetchCustomers = useCallback(async () => {
    if (!supabase) {
      console.warn('Supabase client not initialized. Cannot fetch customers.');
      return;
    }
    setIsFetchingCustomers(true);
    try {
      console.log('Fetching customers from Supabase table "live_clientes"...');
      let allData: Customer[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('live_clientes')
          .select('id, username, nome_completo, codigo_cliente, telefone, observacoes, bloqueada')
          .order('username', { ascending: true })
          .range(from, from + step - 1);
        
        if (error) {
          console.error('Supabase error fetching customers:', error);
          throw error;
        }
        
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          console.log(`Fetched batch of ${data.length} customers (Total so far: ${allData.length})`);
          from += step;
          if (data.length < step) hasMore = false;
          if (allData.length >= 20000) hasMore = false;
        } else {
          hasMore = false;
        }
      }
      
      console.log('Successfully loaded total customers:', allData.length);
      setCustomers(allData);
    } catch (err) {
      console.error('Erro ao buscar clientes:', err);
    } finally {
      setIsFetchingCustomers(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Focus search input on mount and when modal closes
  useEffect(() => {
    if (activeTab === 'live' && !selectedCustomer) {
      // Only focus if not already focused to avoid "freezing" on click
      if (document.activeElement !== searchInputRef.current) {
        searchInputRef.current?.focus();
      }
    }
  }, [activeTab, selectedCustomer]);

  // Helper to clean dirty CSV data from strings
  const cleanDisplay = (str: string) => {
    if (!str) return "";
    // If it contains a comma and quotes, it's likely a raw CSV row
    if (str.includes(',') && (str.includes('"') || str.includes("'"))) {
      // Try to extract the first part which is usually the username
      return str.split(',')[0].replace(/["']/g, "").trim();
    }
    return str.trim();
  };

  // Real-time search filtering
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredResults([]);
      return;
    }
    
    console.log(`Search triggered for: "${searchQuery}" | Customers in state: ${customers.length}`);
    
    const rawQuery = searchQuery.startsWith('@') ? searchQuery.slice(1) : searchQuery;
    const cleanQuery = normalize(rawQuery);
    
    if (!cleanQuery) {
      setFilteredResults([]);
      return;
    }

    // Filter and Sort
    const filtered = customers
      .filter(c => {
        const codeStr = c.codigo_cliente !== null && c.codigo_cliente !== undefined ? String(c.codigo_cliente) : "";
        const usernameStr = normalize(c.username || "");
        const nameStr = normalize(c.nome_completo || "");
        
        // Se a query for apenas números, busca exata no código
        if (/^\d+$/.test(cleanQuery)) {
          return codeStr === cleanQuery || codeStr.includes(cleanQuery);
        }

        // Permite busca por partes do código, username ou nome
        const matches = codeStr === cleanQuery || 
                       codeStr.includes(cleanQuery) ||
                       usernameStr.includes(cleanQuery) ||
                       nameStr.includes(cleanQuery) ||
                       (usernameStr + " " + nameStr).includes(cleanQuery);
        
        return matches;
      })
      .sort((a, b) => {
        const aCode = String(a.codigo_cliente || "").toLowerCase();
        const bCode = String(b.codigo_cliente || "").toLowerCase();
        const aUser = normalize(a.username || "");
        const bUser = normalize(b.username || "");

        // 1. Exact Code match (Sacola) - Top Priority
        if (aCode === cleanQuery && bCode !== cleanQuery) return -1;
        if (aCode !== cleanQuery && bCode === cleanQuery) return 1;

        // 2. Exact Username match
        if (aUser === cleanQuery && bUser !== cleanQuery) return -1;
        if (aUser !== cleanQuery && bUser === cleanQuery) return 1;

        // 4. Starts with Code
        const aCodeStarts = aCode.startsWith(cleanQuery);
        const bCodeStarts = bCode.startsWith(cleanQuery);
        if (aCodeStarts && !bCodeStarts) return -1;
        if (!aCodeStarts && bCodeStarts) return 1;

        // 5. Starts with Username
        const aUserStarts = aUser.startsWith(cleanQuery);
        const bUserStarts = bUser.startsWith(cleanQuery)
        if (aUserStarts && !bUserStarts) return -1;
        if (!aUserStarts && bUserStarts) return 1;

        return aUser.localeCompare(bUser);
      })
      .slice(0, 15); // Show more results for better visibility
      
    setFilteredResults(filtered);
    setActiveIndex(filtered.length > 0 ? 0 : -1);
  }, [searchQuery, customers]);

  const processCustomerSelection = async (customer: Customer | null, searchQueryText: string) => {
    if (customer) {
      if (!customer.codigo_cliente) {
        const nextCode = getNextAvailableCustomerCode();
        const updated = { ...customer, codigo_cliente: nextCode };
        
        if (supabase) {
          try {
            const { error } = await supabase.from('live_clientes').update({ codigo_cliente: nextCode }).eq('id', customer.id);
            if (error) console.error('Error updating customer code:', error);
          } catch (err) {
            console.error('Promise rejection updating customer code:', err);
          }
        }
        
        setCustomers(prev => prev.map(c => String(c.id) === String(customer.id) ? updated : c));
        setSelectedCustomer(updated);
      } else {
        setSelectedCustomer(customer);
      }
    } else {
      const cleanQuery = normalize(searchQueryText);
      const nextId = getNextAvailableClientId(); 
      const nextCode = getNextAvailableCustomerCode();
      
      const newCustomer: Customer = {
        id: nextId,
        codigo_cliente: nextCode,
        username: /^\d+$/.test(cleanQuery) ? '' : searchQueryText,
        nome_completo: 'Novo Cliente',
        purchaseCount: 0
      };

      if (supabase) {
        try {
          const { error } = await supabase.from('live_clientes').insert({
            id: nextId,
            codigo_cliente: nextCode,
            username: newCustomer.username,
            nome_completo: newCustomer.nome_completo
          });
          if (error) console.error('Error reserving new customer:', error);
        } catch (err) {
          console.error('Promise rejection reserving new customer:', err);
        }
      }
      
      setCustomers(prev => [...prev, newCustomer].sort((a, b) => (a.username || '').localeCompare(b.username || '')));
      setSelectedCustomer(newCustomer);
    }

    setSearchQuery('');
    setFilteredResults([]);
    setActiveIndex(-1);
  };
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || isSavingSale) return;

    if (filteredResults.length > 0) {
      const selected = activeIndex >= 0 ? filteredResults[activeIndex] : filteredResults[0];
      processCustomerSelection(selected, searchQuery);
      return;
    }

    const rawQuery = searchQuery.startsWith('@') ? searchQuery.slice(1) : searchQuery;
    const cleanQuery = normalize(rawQuery);
    
    const found = customers.find(c => {
      const uStr = normalize(c.username || "");
      const nStr = normalize(c.nome_completo || "");
      const codeStr = c.codigo_cliente !== null && c.codigo_cliente !== undefined ? String(c.codigo_cliente) : "";
      
      if (/^\d+$/.test(cleanQuery)) {
        return codeStr === cleanQuery;
      }
      
      return codeStr === cleanQuery || 
             uStr === cleanQuery ||
             nStr === cleanQuery ||
             (uStr + " " + nStr) === cleanQuery;
    });

    processCustomerSelection(found || null, searchQuery);
  };

  const [isConfirmingPurchase, setIsConfirmingPurchase] = useState(false);

  const confirmPurchase = useCallback(async () => {
    if (selectedCustomer && !isConfirmingPurchase) {
      if (!supabase) {
        showToast('⚠️ Erro crítico: Sem conexão com o banco de dados!');
        return;
      }
      
      setIsConfirmingPurchase(true);
      
      try {
        const finalName = (selectedCustomer.nome_completo === 'Novo Cliente' && editingName.trim()) 
          ? editingName.trim() 
          : selectedCustomer.nome_completo;

        const customerCode = selectedCustomer.codigo_cliente;
        const exists = shoppingListRef.current.find(c => String(c.id) === String(selectedCustomer.id));
        const qtdLive = exists ? (exists.purchaseCount || 0) + confirmQty : confirmQty;

        // 1. Garante de forma síncrona que o cliente existe
        const { error: cError } = await supabase
          .from('live_clientes')
          .upsert({
            id: Number(selectedCustomer.id),
            username: selectedCustomer.username,
            nome_completo: finalName,
            codigo_cliente: customerCode
          });
        
        if (cError) throw cError;

        // 2. Garante de forma síncrona a venda
        const { error: vError } = await supabase
          .from('live_vendas')
          .upsert({
            cliente_id: Number(selectedCustomer.id),
            data_live: liveConfig.date,
            qtd_live: qtdLive,
            pago: false,
            status: 'pendente'
          }, { onConflict: 'cliente_id,data_live' });

        if (vError) throw vError;

        // ATUALIZAÇÃO LOCAL APÓS SUCESSO NO BANCO:
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        let updatedCustomer: Customer;
        
        if (exists) {
          updatedCustomer = { 
            ...exists, 
            nome_completo: finalName,
            purchaseCount: qtdLive, 
            lastPurchaseTime: now 
          };
          shoppingListRef.current = shoppingListRef.current.map(c => 
            String(c.id) === String(selectedCustomer.id) ? updatedCustomer : c
          );
        } else {
          updatedCustomer = { 
            ...selectedCustomer, 
            nome_completo: finalName,
            purchaseCount: qtdLive, 
            lastPurchaseTime: now 
          };
          shoppingListRef.current = [updatedCustomer, ...shoppingListRef.current];
        }
        
        setShoppingList(shoppingListRef.current);
        setTimeline(prev => [updatedCustomer, ...prev].slice(0, 10));
        
        setCustomers(prev => {
          const existingIndex = prev.findIndex(c => String(c.id) === String(selectedCustomer.id));
          if (existingIndex >= 0) {
            const newArray = [...prev];
            newArray[existingIndex] = {
              ...newArray[existingIndex],
              nome_completo: finalName,
              codigo_cliente: customerCode
            };
            return newArray;
          } else {
            return [...prev, {
              id: Number(selectedCustomer.id),
              username: selectedCustomer.username,
              nome_completo: finalName,
              codigo_cliente: customerCode
            }].sort((a, b) => a.username.localeCompare(b.username));
          }
        });

        // Limpa o modal
        setSelectedCustomer(null);
        setEditingName('');
        
      } catch (error: any) {
        console.error('Erro bloqueante ao confirmar venda:', error);
        const msg = error.message || 'Erro de conexão';
        showToast(`⚠️ ERRO GRAVE: Venda NÃO registrada! Tente de novo. (${msg})`);
      } finally {
        setIsConfirmingPurchase(false);
      }
    }
  }, [selectedCustomer, editingName, liveConfig, supabase, isConfirmingPurchase, confirmQty]);

  // Keyboard shortcuts for the identification modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedCustomer) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedCustomer.bloqueada) {
            setSelectedCustomer(null);
            showToast('⚠️ Cliente bloqueada. Ação cancelada.');
          } else {
            confirmPurchase();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setSelectedCustomer(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCustomer, confirmPurchase]);

  // Acerto Handlers
  const validateRef = async (ref: string, actionCallback: 'focus_price' | 'submit') => {
    if (!ref || !ref.trim()) {
      return false;
    }
    
    const currentRef = ref.trim().toUpperCase();

    // Se já validou antes e confirmou, pula
    if (validatedRefs.has(currentRef)) return true;

    if (supabase) {
      try {
        const { data } = await supabase
          .from('produtos')
          .select('id')
          .eq('referencia', currentRef)
          .maybeSingle();

        if (!data) {
          setPendingRefValidation({ ref: currentRef, action: actionCallback });
          return false;
        } else {
          setValidatedRefs(prev => new Set(prev).add(currentRef));
        }
      } catch (err) {
        console.error("Erro validando referência:", err);
      }
    }
    
    return true;
  };

  const [isSubmittingAcerto, setIsSubmittingAcerto] = useState(false);

  const executeAcertoSubmit = async () => {
    if (!acertoId || !acertoRef || !acertoValue || !acertoQuantity || isSubmittingAcerto) return;

    const activeCustomer = acertoActiveCustomer;
    if (!activeCustomer) return;

    if (!supabase) {
      showToast('⚠️ Erro crítico: Sem conexão com o banco de dados!');
      return;
    }

    const val = parseFloat(acertoValue);
    const qty = parseInt(acertoQuantity);
    setIsSubmittingAcerto(true);

    try {
      // 1. Garante que a venda (header) existe de forma síncrona
      const { data: venda, error: vError } = await supabase
        .from('live_vendas')
        .upsert({
          cliente_id: Number(activeCustomer.id),
          data_live: liveConfig.date,
          pago: false,
          status: 'pendente'
        }, { onConflict: 'cliente_id,data_live' })
        .select('id')
        .single();

      if (vError) throw vError;
      if (!venda) throw new Error('Falha ao registrar cabeçalho da venda');
      
      // 2. Insere o item vinculado à venda
      const { data: insertedItem, error: iError } = await supabase
        .from('live_vendas_itens')
        .insert({
          venda_id: venda.id,
          referencia: acertoRef.trim().toUpperCase(),
          preco: val,
          quantidade: qty
        }).select('id').single();

      if (iError || !insertedItem) throw iError || new Error('Falha ao registrar o item');

      // 3. Monta e adiciona o objeto no estado APÓS sucesso no banco
      const newPurchase: Purchase = {
        id: String(insertedItem.id),
        venda_id: String(venda.id),
        customerId: Number(activeCustomer.id),
        reference: acertoRef.trim().toUpperCase(),
        value: val,
        quantity: qty,
        paid: false,
        timestamp: new Date()
      };

      setPurchases(prev => {
        const updated = [newPurchase, ...prev];
        updated.sort((a, b) => {
          const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          const validA = !isNaN(timeA) ? timeA : 0;
          const validB = !isNaN(timeB) ? timeB : 0;
          if (validB !== validA) return validB - validA;
          const idA = Number(a.id) || 0;
          const idB = Number(b.id) || 0;
          return idB - idA;
        });
        return updated;
      });
      
      // Limpa formulário apenas no sucesso
      setAcertoId('');
      setAcertoRef('');
      setAcertoValue('');
      setAcertoQuantity('1');
      idInput.current?.focus();

      showToast(`✅ Lançado: ${qty}x ${newPurchase.reference} p/ ${activeCustomer.nome_completo}`);
    } catch (error) {
      console.error('Erro bloqueante ao registrar venda:', error);
      showToast('⚠️ ERRO GRAVE CRÍTICO: Venda NÃO REGISTRADA no banco! Tente novamente.');
    } finally {
      setIsSubmittingAcerto(false);
    }
  };

  const handleAcertoSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!acertoId || !acertoRef || !acertoValue || !acertoQuantity) return;

    const activeCustomer = acertoActiveCustomer;
    if (!activeCustomer) return;
    
    if (activeCustomer.bloqueada) {
      showToast(`⚠️ Cliente BLOQUEADA não pode fazer novas compras.`);
      return;
    }

    try {
      const isValid = await validateRef(acertoRef, 'submit');
      if (!isValid) {
        refInput.current?.focus();
        return;
      }

      await executeAcertoSubmit();
    } catch (err) {
      console.error('Promise rejection during acerto submission:', err);
      showToast('⚠️ Erro ao tentar lançar o acerto.');
    }
  };

  const confirmInvalidRefModal = () => {
    if (!pendingRefValidation) return;
    const { ref, action } = pendingRefValidation;
    setValidatedRefs(prev => new Set(prev).add(ref));
    setPendingRefValidation(null);

    if (action === 'focus_price') {
      setTimeout(() => {
        valueInput.current?.focus();
        valueInput.current?.select();
      }, 150);
    } else if (action === 'submit') {
      executeAcertoSubmit();
    }
  };

  const cancelInvalidRefModal = () => {
    setPendingRefValidation(null);
    setTimeout(() => {
      refInput.current?.focus();
      refInput.current?.select();
    }, 150);
  };


  const [isRemovingItem, setIsRemovingItem] = useState(false);

  const removePurchase = async (id: string) => {
    if (isRemovingItem) return;
    setIsRemovingItem(true);

    try {
      const existing = purchasesRef.current.find(p => String(p.id) === String(id));
      if (!existing) return;

      if (supabase) {
        // Se a ID for local antiga (math.random), o Supabase pode dar erro de sintaxe,
        // então englobamos num try/catch o banco, e caso dê erro, 
        // prosseguimos com o delete local se for id sem formato válido de BD.
        if (existing.quantity > 1) {
          // Atualiza quantidade
          const { error } = await supabase
            .from('live_vendas_itens')
            .update({ quantidade: existing.quantity - 1 })
            .eq('id', id);
          if (error && !error.message.includes('uuid') && !error.message.includes('integer')) throw error;
        } else {
          // Deleta item
          const { error } = await supabase
            .from('live_vendas_itens')
            .delete()
            .eq('id', id);
          if (error && !error.message.includes('uuid') && !error.message.includes('integer')) throw error;
        }
      }

      // Sucesso ou era ID local antigo: reflete estado
      setPurchases(prev => {
        const item = prev.find(p => String(p.id) === String(id));
        if (item && item.quantity > 1) {
          return prev.map(p => 
            String(p.id) === String(id) ? { ...p, quantity: p.quantity - 1 } : p
          );
        }
        return prev.filter(p => String(p.id) !== String(id));
      });

    } catch (e: any) {
      console.error('Erro ao remover compra:', e);
      showToast('⚠️ ERRO CRÍTICO: Não foi possível remover do banco!');
    } finally {
      setIsRemovingItem(false);
    }
  };

  const removeGroup = async (customerId: number) => {
    if (isRemovingItem) return;
    setIsRemovingItem(true);
    
    try {
      if (supabase) {
        // Obter itens locais desse grupo para apagar do banco
        const groupItems = purchasesRef.current.filter(p => Number(p.customerId) === customerId);
        const itemIds = groupItems.map(p => p.id);
        
        if (itemIds.length > 0) {
          const { error } = await supabase
            .from('live_vendas_itens')
            .delete()
            .in('id', itemIds);
          // Ignoramos erro de formatação se havia IDs locais velhos
          if (error && !error.message.includes('uuid') && !error.message.includes('integer')) throw error;
        }
      }

      setPurchases(prev => prev.filter(p => Number(p.customerId) !== customerId));
      setShoppingList(prev => prev.filter(c => Number(c.id) !== customerId));
      setDeleteModal(null);
      setContextMenu(null);
    } catch (e: any) {
      console.error('Erro ao remover grupo:', e);
      showToast('⚠️ ERRO CRÍTICO: Não foi possível remover a sacola do banco!');
    } finally {
      setIsRemovingItem(false);
    }
  };

  const groupedPurchases = useMemo(() => {
    // 1. Group purchases by customerId (O(M))
    const purchasesByCustomer = new Map<number, Purchase[]>();
    for (const p of purchases) {
      const cid = Number(p.customerId);
      const list = purchasesByCustomer.get(cid) || [];
      list.push(p);
      purchasesByCustomer.set(cid, list);
    }

    // 2. Process shopping list (O(N))
    const list = shoppingList.map(customer => {
      const cid = Number(customer.id);
      const latestCustomer = customersMap.get(String(cid)) || customer;
      const customerPurchases = purchasesByCustomer.get(cid) || [];
      const isPaid = customerPurchases.length > 0 ? customerPurchases.every(p => p.paid) : manualPaidIds.includes(String(cid));
      return {
        customerId: cid,
        username: latestCustomer.username || 'N/A',
        nome_completo: latestCustomer.nome_completo || 'N/A',
        telefone: latestCustomer.telefone,
        items: customerPurchases,
        total: customerPurchases.reduce((acc, p) => acc + (p.value * p.quantity), 0),
        paid: isPaid,
        delivered: deliveredIds.includes(String(cid)),
        qtdLive: customer.purchaseCount || 0,
        codigo_cliente: latestCustomer.codigo_cliente || customer.codigo_cliente
      };
    });

    // 3. Process manual entries (O(M))
    const shoppingListIds = new Set(shoppingList.map(c => Number(c.id)));
    const manualGroups: GroupedPurchase[] = [];
    
    for (const [customerId, items] of purchasesByCustomer.entries()) {
      if (!shoppingListIds.has(customerId)) {
        const customer = customersMap.get(String(customerId));
        const isPaid = items.every(p => p.paid);
        manualGroups.push({
          customerId,
          username: customer?.username || 'N/A',
          nome_completo: customer?.nome_completo || 'N/A',
          telefone: customer?.telefone,
          items,
          total: items.reduce((acc, p) => acc + (p.value * p.quantity), 0),
          paid: isPaid,
          delivered: deliveredIds.includes(String(customerId)),
          qtdLive: customer?.purchaseCount || 0,
          codigo_cliente: customer?.codigo_cliente
        });
      }
    }

    const all = [...list, ...manualGroups];
    
    // Sort so that the last active customer (newest item timestamp) is at the top.
    all.sort((a, b) => {
      const getLatestTime = (group: any) => {
        if (!group.items || group.items.length === 0) return 0;
        let max = 0;
        for (const item of group.items) {
          const t = item.timestamp ? new Date(item.timestamp).getTime() : 0;
          if (!isNaN(t) && t > max) {
            max = t;
          }
        }
        return max;
      };
      
      const timeA = getLatestTime(a);
      const timeB = getLatestTime(b);
      
      if (timeB !== timeA) {
        return timeB - timeA; // descending (newest activity first)
      }
      
      // Secondary sort: by customerId or codigo_cliente to keep search stable
      const codeA = Number(a.codigo_cliente) || 0;
      const codeB = Number(b.codigo_cliente) || 0;
      if (codeB !== codeA) return codeA - codeB; // lowest code first
      
      return String(a.username).localeCompare(String(b.username));
    });

    const totalValue = purchases.reduce((acc, p) => acc + (p.value * p.quantity), 0);
    const totalPaidValue = all.filter(g => g.paid).reduce((acc, g) => acc + g.total, 0);
    const uniqueCustomersCount = purchasesByCustomer.size;

    return {
      groups: all,
      totalValue,
      totalPaidValue,
      uniqueCustomersCount
    };
  }, [shoppingList, purchases, customersMap, manualPaidIds, deliveredIds]);

  const filteredGroups = useMemo(() => {
    const search = (fechamentoSearch || '').toLowerCase().trim();
    
    let groups = groupedPurchases.groups;

    if (!search) return groups;
    
    return groups.filter(group => {
      const username = String(group.username || '').toLowerCase();
      const nome = String(group.nome_completo || '').toLowerCase();
      const id = String(group.customerId || '').toLowerCase();
      const code = String(group.codigo_cliente || '').toLowerCase();
      
      return username.includes(search) || 
             nome.includes(search) || 
             id.includes(search) ||
             code === search;
    });
  }, [groupedPurchases.groups, fechamentoSearch]);

  const filteredBagGroups = useMemo(() => {
    let groups = filteredGroups;

    // Apply Tab Filter Specifically for Sacolas
    if (bagFilterTab === 'pagas') {
      groups = groups.filter(g => g.paid);
    } else if (bagFilterTab === 'a_pagar') {
      groups = groups.filter(g => !g.paid);
    } else if (bagFilterTab === 'entregues') {
      groups = groups.filter(g => g.delivered);
    }

    return groups;
  }, [filteredGroups, bagFilterTab]);

  // Keyboard navigation for Acerto table
  useEffect(() => {
    setSelectedRowIndex(-1);
  }, [filteredGroups]);

  useEffect(() => {
    if (activeTab !== 'acerto') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
      const isSearchInput = document.activeElement?.id === 'fechamento-search';
      
      if (isInput && !isSearchInput) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedRowIndex(prev => {
          const next = prev + 1;
          return next >= filteredGroups.length ? prev : next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedRowIndex(prev => {
          const next = prev - 1;
          return next < 0 ? 0 : next;
        });
      } else if (e.key === 'Enter' && selectedRowIndex >= 0 && selectedRowIndex < filteredGroups.length) {
        if (isSearchInput) {
          (document.activeElement as HTMLElement).blur();
        }
        e.preventDefault();
        const group = filteredGroups[selectedRowIndex];
        setExpandedCustomerId(prev => prev === group.customerId ? null : group.customerId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, filteredGroups, selectedRowIndex]);

  useEffect(() => {
    if (selectedRowIndex >= 0 && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedRowIndex]);

  // History Fetch
  const fetchHistory = async () => {
    if (!supabase) return;
    setIsFetchingHistory(true);
    try {
      const { data, error } = await supabase
        .from('live_historico')
        .select('*')
        .order('data_live', { ascending: false })
        .limit(15);

      if (error) throw error;
      setHistoryData(data || []);
    } catch (err) {
      console.error('Erro ao buscar histórico:', err);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const handleSaveManualLive = async () => {
    if (!supabase || !manualLiveDate || !manualLiveValue) return;
    try {
      const dateObj = new Date(manualLiveDate + 'T12:00:00');
      const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      const diaSemana = dias[dateObj.getDay()];

      const { error } = await supabase.from('live_historico').insert({
        data_live: manualLiveDate,
        dia_semana: diaSemana,
        qtd_sacolas: parseInt(manualLiveQtdSacolas || '0'),
        valor_total: parseFloat(manualLiveValue),
        observacoes: manualLiveObs
      });
      if (error) throw error;
      setIsAddingManualLive(false);
      setManualLiveDate('');
      setManualLiveValue('');
      setManualLiveQtdSacolas('');
      setManualLiveObs('');
      fetchHistory();
    } catch (err: any) {
      alert('Erro ao salvar registro manual: ' + err.message);
    }
  };

  const handleSaveLiveObs = async (id: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('live_historico')
        .update({ observacoes: editingLiveObs })
        .eq('id', id);
      if (error) throw error;
      setEditingLiveId(null);
      fetchHistory();
    } catch (err: any) {
      alert('Erro ao atualizar observação: ' + err.message);
    }
  };

  useEffect(() => {
    if (isHistoryOpen) {
      fetchHistory();
    }
  }, [isHistoryOpen]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleClearAllData = async () => {
    if (!supabase) return;
    setIsSavingSale(true);
    try {
      // Delete all records from Supabase tables
      // We use .not('id', 'is', null) to match all rows
      await supabase.from('live_vendas_itens').delete().not('id', 'is', null);
      await supabase.from('live_vendas').delete().not('id', 'is', null);
      await supabase.from('live_historico').delete().not('id', 'is', null);
      
      // Clear all local state
      setPurchases([]);
      setSentMessages([]);
      setSentWhatsappMessages([]);
      setShoppingList([]);
      setTimeline([]);
      setManualPaidIds([]);
      setFechamentoSearch('');
      setSearchQuery('');
      setSelectedCustomer(null);
      setExpandedCustomerId(null);
      setAcertoId('');
      setAcertoRef('');
      setAcertoValue('');
      setAcertoQuantity('1');
      setLiveConfig({ date: new Date().toISOString().split('T')[0], isActive: false });
      setCustomers([]);
      setHistoryData([]);
      
      // Remove specific keys from Local Storage
      localStorage.removeItem('purchases');
      localStorage.removeItem('sentMessages');
      localStorage.removeItem('sentWhatsappMessages');
      localStorage.removeItem('shoppingList');
      localStorage.removeItem('timeline');
      localStorage.removeItem('manualPaidIds');
      localStorage.removeItem('liveConfig');
      // We keep 'messageTemplate' as it's a user configuration
      
      showToast('Sistema limpo com sucesso! Para resetar os IDs para 1, rode no SQL Editor do Supabase: ALTER SEQUENCE live_clientes_id_seq RESTART WITH 1;');
      
      // Re-fetch customers after clearing, as they are the master list
      fetchCustomers();
    } catch (err: any) {
      console.error('Erro ao limpar dados:', err);
      showToast(`Erro ao limpar dados: ${err.message}`);
    } finally {
      setIsSavingSale(false);
    }
  };

  const handleFinalizarAcerto = async (action: 'salvar' | 'finalizar', isAuto = false) => {
    if (!supabase || (purchases.length === 0 && shoppingList.length === 0)) return;

    if (!isAuto) setIsSavingSale(true);

    try {
      // 1. Salvar ou Atualizar Vendas e Itens
      // Se for salvar progresso (ou auto-save), salvamos TUDO para segurança
      // Se for finalizar, filtramos apenas as pagas
      const customerIds = [...new Set([
        ...purchases.map(p => p.customerId),
        ...shoppingList.map(c => c.id)
      ])];

      let targetCustomerIds = customerIds;
      
      if (action === 'finalizar') {
        targetCustomerIds = customerIds.filter(cid => {
          const customerPurchases = purchases.filter(p => Number(p.customerId) === Number(cid));
          return customerPurchases.length > 0 && customerPurchases.every(p => p.paid);
        });

        // Remover do banco qualquer venda desta live que não esteja paga (ao finalizar)
        const { error: deleteUnpaidError } = await supabase
          .from('live_vendas')
          .delete()
          .eq('data_live', dataLive)
          .eq('pago', false);
        
        if (deleteUnpaidError) throw deleteUnpaidError;
      }

      let skippedCount = 0;

      for (const rawCid of targetCustomerIds) {
        const cid = Number(rawCid);
        if (isNaN(cid)) {
          skippedCount++;
          continue;
        }

        const customerExists = customers.some(c => Number(c.id) === cid);
        if (!customerExists) {
          skippedCount++;
          continue;
        }

        const customerPurchases = purchases.filter(p => Number(p.customerId) === cid);
        const totalValue = customerPurchases.reduce((acc, p) => acc + (p.value * p.quantity), 0);
        const isPaid = customerPurchases.length > 0 && customerPurchases.every(p => p.paid);
        
        // Obter quantidade da live do shoppingList
        const shoppingItem = shoppingList.find(c => Number(c.id) === cid);
        const qtdLive = shoppingItem ? (shoppingItem.purchaseCount || 0) : 0;

        // Encontrar ou criar Venda
        const { data: existingVendas, error: fetchVendaError } = await supabase
          .from('live_vendas')
          .select('id')
          .eq('cliente_id', cid)
          .eq('data_live', dataLive)
          .limit(1);

        if (fetchVendaError) throw fetchVendaError;

        const existingVenda = existingVendas?.[0];
        let vendaId;

        if (existingVenda) {
          vendaId = existingVenda.id;
          const { error: updateVendaError } = await supabase
            .from('live_vendas')
            .update({
              pago: isPaid,
              valor_ajuste: totalValue,
              mensagem_enviada: sentMessages.includes(String(cid)),
              status: action === 'finalizar' ? 'finalizado' : 'pendente',
              qtd_live: qtdLive
            })
            .eq('id', vendaId);
          
          if (updateVendaError) throw updateVendaError;
          // Deletes e INSERTS em lote foram REMOVIDOS daqui para blindagem.
          // Agora dependemos de cada operação individual na live_vendas_itens.
        } else {
          const { data: newVenda, error: vError } = await supabase
            .from('live_vendas')
            .insert({
              cliente_id: cid,
              data_live: dataLive,
              pago: isPaid,
              valor_ajuste: totalValue,
              mensagem_enviada: sentMessages.includes(String(cid)),
              status: action === 'finalizar' ? 'finalizado' : 'pendente',
              qtd_live: qtdLive
            })
            .select()
            .single();
          if (vError) throw vError;
          vendaId = newVenda.id;
        }

        // Os itens da venda JÁ ESTÃO no banco graças às operações síncronas de executeAcertoSubmit e removePurchase.
        // Portanto, o bloco que deletava e reinseria itens foi removido.
      }

      if (skippedCount > 0 && !isAuto) {
        showToast(`Atenção: ${skippedCount} sacola(s) continham IDs antigos e foram ignoradas.`);
      }

      // 2. Atualizar Histórico (Apenas se houver vendas pagas ou se for finalizar)
      if (action === 'finalizar' || (action === 'salvar' && !isAuto)) {
        try {
          const dateObj = new Date(dataLive + 'T12:00:00');
          const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
          const diaSemana = dias[dateObj.getDay()];

          // Buscar todas as vendas da data para calcular o total real
          const { data: allVendas, error: fetchAllError } = await supabase
            .from('live_vendas')
            .select('valor_ajuste, pago')
            .eq('data_live', dataLive);
            
          if (fetchAllError) throw fetchAllError;

          const realTotalLive = allVendas?.filter(v => v.pago).reduce((acc, v) => acc + (Number(v.valor_ajuste) || 0), 0) || 0;
          const realQtdSacolas = allVendas?.filter(v => v.pago).length || 0;

          const { data: existingLives, error: fetchHistError } = await supabase
            .from('live_historico')
            .select('id')
            .eq('data_live', dataLive)
            .limit(1);

          if (fetchHistError) throw fetchHistError;

          const existingLive = existingLives?.[0];

          if (existingLive) {
            const { error: updateHistError } = await supabase
              .from('live_historico')
              .update({ 
                valor_total: realTotalLive,
                qtd_sacolas: realQtdSacolas
              })
              .eq('id', existingLive.id);
            if (updateHistError) throw updateHistError;
          } else {
            const { error: insertHistError } = await supabase
              .from('live_historico')
              .insert({
                data_live: dataLive,
                dia_semana: diaSemana,
                qtd_sacolas: realQtdSacolas,
                valor_total: realTotalLive,
                observacoes: 'Fechamento automático'
              });
            if (insertHistError) throw insertHistError;
          }
        } catch (histErr) {
          console.error('Erro ao atualizar histórico:', histErr);
          // Não interromper o processo principal por erro no histórico, mas avisar
          showToast('Aviso: Erro ao gravar histórico de lives.');
        }
      }

      // 3. Se for FINALIZAR: Registrar Movimentações (A Trigger fará o resto)
      if (action === 'finalizar') {
        try {
          // 1. Agrupar itens da lista atual (Purchases) APENAS das sacolas que foram pagas (targetCustomerIds)
          const stockToDeduct = new Map<string, number>();
          const targetIdsNum = targetCustomerIds.map(Number);
          
          for (const p of purchases) {
            if (!targetIdsNum.includes(Number(p.customerId))) continue; // Ignora se a compra não for de uma sacola paga
            const ref = p.reference.trim().toUpperCase();
            const qty = Math.abs(Number(p.quantity));
            stockToDeduct.set(ref, (stockToDeduct.get(ref) || 0) + qty);
          }

          if (stockToDeduct.size > 0) {
            let processedCount = 0;

            for (const [ref, qty] of stockToDeduct.entries()) {
              // Buscar apenas o ID do produto
              const { data: product } = await supabase
                .from('produtos')
                .select('id')
                .eq('referencia', ref)
                .single();
                
              if (product) {
                // APENAS INSERIR NA MOVIMENTAÇÃO
                // A Trigger no banco de dados atualizará o saldo automaticamente
                const { error: mError } = await supabase
                  .from('movimentacoes_estoque')
                  .insert({
                    produto_id: product.id,
                    tipo: 'SAÍDA',
                    quantidade: qty,
                    descricao: `VENDA LIVE - ${dataLive}`,
                    data: new Date().toISOString()
                  });

                if (!mError) processedCount++;
              }
            }
            console.log(`${processedCount} movimentações registradas. O banco de dados atualizou os saldos via Trigger.`);
          }

          // 2. Limpar tabelas de trabalho no banco
          const { data: currentVendas } = await supabase.from('live_vendas').select('id').eq('data_live', dataLive);
          const vendaIds = currentVendas?.map(v => v.id) || [];
          if (vendaIds.length > 0) {
            await supabase.from('live_vendas_itens').delete().in('venda_id', vendaIds);
            await supabase.from('live_vendas').delete().in('id', vendaIds);
          }

          showToast('Acerto finalizado com sucesso! Estoque atualizado via Trigger.');
          
          // Limpar estado local
          setPurchases([]);
          setSentMessages([]);
          setSentWhatsappMessages([]);
          setShoppingList([]);
          setTimeline([]);
          setManualPaidIds([]);
          setFechamentoSearch('');
          setSearchQuery('');
          setSelectedCustomer(null);
          setExpandedCustomerId(null);
          setAcertoId('');
          setAcertoRef('');
          setAcertoValue('');
          setAcertoQuantity('1');
          setLiveConfig({ isActive: false, date: new Date().toISOString().split('T')[0] });
          
          // Limpar Local Storage
          localStorage.removeItem('purchases');
          localStorage.removeItem('sentMessages');
          localStorage.removeItem('sentWhatsappMessages');
          localStorage.removeItem('shoppingList');
          localStorage.removeItem('timeline');
          localStorage.removeItem('manualPaidIds');
          
        } catch (err) {
          console.error('Erro crítico na finalização:', err);
          showToast('Erro ao finalizar acerto.');
          throw err;
        }
      } else {
        if (!isAuto) showToast('Acerto salvo com sucesso! Você pode continuar editando.');
      }

      setIsFinalizarModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao processar acerto:', err);
      if (!isAuto) showToast(`Erro ao processar acerto: ${err.message}`);
    } finally {
      setIsSavingSale(false);
      setIsAutoSaving(false);
    }
  };

  const copyExcelSummary = useCallback(() => {
    if (purchases.length === 0) {
      setToastMessage('Nenhuma venda para copiar!');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    // Agrupar por referência e somar quantidades
    const summary = purchases.reduce((acc, p) => {
      const ref = (p.reference || '').toUpperCase().trim();
      if (!ref) return acc;
      acc[ref] = (acc[ref] || 0) + Number(p.quantity);
      return acc;
    }, {} as Record<string, number>);

    // Formatar para Excel (Ref [TAB] Qtd)
    const excelText = Object.entries(summary)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ref, qty]) => `${ref}\t${qty}`)
      .join('\n');

    // Copiar para área de transferência
    navigator.clipboard.writeText(excelText).then(() => {
      setToastMessage('Resumo copiado para o Excel!');
      setTimeout(() => setToastMessage(null), 3000);
    }).catch(err => {
      console.error('Erro ao copiar:', err);
      setToastMessage('Erro ao copiar resumo.');
      setTimeout(() => setToastMessage(null), 3000);
    });
  }, [purchases]);

  const togglePaid = (id: string) => {
    setPurchases(prev => prev.map(p => String(p.id) === String(id) ? { ...p, paid: !p.paid } : p));
  };

  const lastSavedHashRef = useRef<string>('');
  const purchasesRef = useRef(purchases);
  const shoppingListRef = useRef(shoppingList);
  const liveConfigRef = useRef(liveConfig);
  const handleFinalizarAcertoRef = useRef(handleFinalizarAcerto);

  useEffect(() => {
    purchasesRef.current = purchases;
    shoppingListRef.current = shoppingList;
    liveConfigRef.current = liveConfig;
    handleFinalizarAcertoRef.current = handleFinalizarAcerto;
  }, [purchases, shoppingList, liveConfig]);

  const setGroupPaidStatus = async (customerId: number, status: boolean) => {
    // Atualização otimista
    setPurchases(prev => prev.map(p => String(p.customerId) === String(customerId) ? { ...p, paid: status } : p));
    setManualPaidIds(prev => status ? [...prev, String(customerId)] : prev.filter(id => String(id) !== String(customerId)));

    // Persistência assíncrona
    if (supabase) {
      try {
        const { error } = await supabase
          .from('live_vendas')
          .update({ pago: status })
          .eq('cliente_id', customerId)
          .eq('data_live', liveConfig.date);
        
        if (error) throw error;
      } catch (err) {
        console.error('Erro ao salvar pagamento:', err);
        showToast('⚠️ Erro ao salvar PAGAMENTO no banco!');
        // Se quisermos reverter, poderia ser feito aqui.
      }
    }
  };

  const toggleDelivered = async (customerId: number) => {
    const id = String(customerId);
    const isNowDelivered = !deliveredIds.includes(id);

    // Otimisticamente atualiza a UI
    setDeliveredIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );

    // Persiste no banco de forma assíncrona
    if (supabase) {
      try {
        const { error } = await supabase
          .from('live_vendas')
          .update({ entregue: isNowDelivered })
          .eq('cliente_id', customerId)
          .eq('data_live', liveConfig.date);
        
        if (error) {
           // Fallback gracioso se a coluna "entregue" não existir
           if (error.message && error.message.includes('entregue')) {
               console.warn('Coluna "entregue" inexistente no banco. Use o editor SQL para cria-la (boolean, default false).');
           } else {
               throw error;
           }
        }
      } catch (err: any) {
        console.error('Erro ao salvar entrega:', err);
        showToast('⚠️ Erro ao salvar ENTREGA no banco!');
        // Reverte a alteração otimista
        setDeliveredIds(prev => 
           prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
      }
    }
  };

  const saveTemplate = (newTemplate: string) => {
    setMessageTemplate(newTemplate);
    localStorage.setItem('messageTemplate', newTemplate);
  };

  const generateMessageText = useCallback((customerName: string, total: number) => {
    const hour = new Date().getHours();
    let saudacao = 'Boa noite';
    if (hour >= 0 && hour < 12) saudacao = 'Bom dia';
    else if (hour >= 12 && hour < 18) saudacao = 'Boa tarde';

    const firstName = (customerName || '').split(' ')[0] || '';

    return messageTemplate
      .replace(/\{\{saudacao\}\}/g, saudacao)
      .replace(/\{\{nome\}\}/g, firstName)
      .replace(/\{\{total\}\}/g, total.toFixed(2).replace('.', ','));
  }, [messageTemplate]);

  const generateWhatsAppMessage = (customerId: number, nome_completo: string, total: number, telefone: string) => {
    if (sentWhatsappMessages.includes(String(customerId))) {
      if (!window.confirm(`⚠️ Mensagem do WhatsApp já enviada para ${nome_completo}. Deseja gerar e enviar novamente?`)) {
        return;
      }
    }

    const message = generateMessageText(nome_completo, total);
    
    if (!telefone) {
      alert('Telefone não cadastrado para esta cliente.');
      return;
    }

    let cleanPhone = telefone.replace(/\D/g, ''); // Fix so that only numbers are sent
    
    // Add 55 if not begins with 55 and looks like brazillian mobile (10 or 11 digits)
    if (cleanPhone.length >= 10 && cleanPhone.length <= 11 && !cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    }
    
    // Send message state update
    setSentWhatsappMessages(prev => [...new Set([...prev, String(customerId)])]);
    
    // Open whatsapp
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const generateInstagramMessage = (customerId: number, username: string, nome_completo: string, total: number) => {
    if (sentMessages.includes(String(customerId))) {
      if (!window.confirm(`⚠️ Mensagem já enviada para ${nome_completo}. Deseja gerar e enviar novamente?`)) {
        return;
      }
    }

    const message = generateMessageText(nome_completo, total);
    
    if (!username || username === 'N/A') {
      navigator.clipboard.writeText(message).catch(err => console.error("Clipboard failure:", err));
      setSentMessages(prev => [...new Set([...prev, String(customerId)])]);
      alert('Mensagem copiada! (Nome de usuário não encontrado para abrir o Instagram)');
      return;
    }

    const cleanUsername = username.replace(/^@/, '').replace(/^"/, '').split(',')[0].trim();
    
    navigator.clipboard.writeText(message).then(() => {
      setSentMessages(prev => [...new Set([...prev, String(customerId)])]);
      window.open(`https://ig.me/m/${cleanUsername}`, '_blank');
    }).catch(() => {
      setSentMessages(prev => [...new Set([...prev, String(customerId)])]);
      window.open(`https://ig.me/m/${cleanUsername}`, '_blank');
    });
  };

  const startFocusMode = () => {
    // Filter customers who have items and haven't received a message (neither Whatsapp nor IG)
    let queue = filteredGroups.filter(g => g.items.length > 0 && !sentMessages.includes(String(g.customerId)) && !sentWhatsappMessages.includes(String(g.customerId)));
    if (queue.length === 0) {
      alert('Todas as mensagens já foram enviadas ou não há sacolas com itens!');
      return;
    }

    // Sort queue: Prioritize customers with phone numbers (WhatsApp) first
    queue.sort((a, b) => {
      const hasPhoneA = Boolean(a.telefone);
      const hasPhoneB = Boolean(b.telefone);
      if (hasPhoneA && !hasPhoneB) return -1;
      if (!hasPhoneA && hasPhoneB) return 1;
      return 0;
    });

    setFocusQueue(queue);
    setCurrentFocusIndex(0);
    setIsFocusModeOpen(true);
  };

  const handleFocusNext = () => {
    if (currentFocusIndex < focusQueue.length - 1) {
      setCurrentFocusIndex(prev => prev + 1);
    } else {
      setIsFocusModeOpen(false);
      alert('Fila de disparos concluída!');
    }
  };

  const handleFocusSendInstagram = () => {
    const current = focusQueue[currentFocusIndex];
    generateInstagramMessage(current.customerId, current.username, current.nome_completo, current.total);
    handleFocusNext();
  };

  const handleFocusSendWhatsApp = () => {
    const current = focusQueue[currentFocusIndex];
    if (!current.telefone) {
      alert('Telefone não cadastrado!');
      return;
    }
    generateWhatsAppMessage(current.customerId, current.nome_completo, current.total, current.telefone);
    handleFocusNext();
  };

  // Import Handlers
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setImportFiles(prev => {
        const combined = [...prev, ...newFiles];
        return combined.slice(0, 5); // Allow up to 5 files
      });
      setImportError(null);
      setImportResult(null);
    }
  };

  const removeFile = (index: number) => {
    setImportFiles(prev => prev.filter((_, i) => i !== index));
    setImportResult(null);
  };

  const handleProcessImport = async () => {
    if (importFiles.length === 0) {
      setImportError("Por favor, selecione pelo menos um arquivo CSV.");
      return;
    }
    
    setIsProcessing(true);
    setImportError(null);
    try {
      const result = await processCSVFiles(importFiles);
      setImportResult(result);
    } catch (err: any) {
      setImportError(`Erro ao processar: ${err.message}`);
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importResult || !supabase) return;
    
    setIsSaving(true);
    setImportError(null);
    try {
      // 1. Fetch all existing customers to maintain ID consistency and find current max ID
      const { data: existingCustomers, error: fetchError } = await supabase
        .from('live_clientes')
        .select('id, username');

      if (fetchError) {
        console.warn('Erro ao buscar clientes existentes:', fetchError);
      }

      const customerMap = new Map<string, number>();
      let currentMaxId = 0;

      if (existingCustomers) {
        existingCustomers.forEach(c => {
          const uname = String(c.username || '').toLowerCase();
          customerMap.set(uname, c.id);
          if (c.id > currentMaxId) currentMaxId = c.id;
        });
      }

      // 2. Prepare data with sequential IDs
      // We ignore the ID from the CSV because the user wants sequential IDs (1, 2, 3...)
      // and the CSV ID is usually the Instagram PK (large numbers).
      const dataToSave = importResult.uniqueProfiles.map((p) => {
        const usernameLower = p.username.toLowerCase();
        let id = customerMap.get(usernameLower);
        
        if (!id) {
          currentMaxId++;
          id = currentMaxId;
          // Add to map in case the CSV itself has duplicates (though uniqueProfiles should handle it)
          customerMap.set(usernameLower, id);
        }

        return {
          id,
          username: p.username,
          nome_completo: p.nome_completo,
        };
      });

      if (dataToSave.length === 0) {
        throw new Error("Nenhum dado válido para salvar.");
      }

      const { error } = await supabase
        .from('live_clientes')
        .upsert(dataToSave, { onConflict: 'username' });

      if (error) throw error;

      await fetchCustomers(); // Refresh the list
      alert(`${importResult.totalUnique} clientes processados e salvos com sucesso!`);
      
      // Clear after successful save
      setImportResult(null);
      setImportFiles([]);
    } catch (err: any) {
      console.error('Erro ao salvar importação:', err);
      setImportError(`Erro ao salvar no banco de dados: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelImport = () => {
    setImportResult(null);
    setImportFiles([]);
    setImportError(null);
  };

  // --------------------------------------------------------------------------
  // PRODUCTS / ESTOQUE CSV HANDLERS
  // --------------------------------------------------------------------------
  const handleImportProductsCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingProducts(true);
    try {
      const result = await processProductsCSV(file);
      setProductImportModal({
        products: result.products,
        warnings: result.warnings,
        count: result.count,
        filename: file.name
      });
    } catch (err: any) {
      alert(`Erro ao processar CSV de produtos: ${err.message}`);
    } finally {
      setIsImportingProducts(false);
      e.target.value = ''; // Reset input
    }
  };

  const toggleCustomerBlock = (customer: Customer) => {
    setBlockModal({ visible: true, customer });
  };

  const confirmBlockCustomer = async () => {
    const customer = blockModal.customer;
    if (!customer) return;
    
    setBlockModal({ visible: false, customer: null });

    if (!supabase) {
      setCustomers(prev => prev.map(c => 
        c.id === customer.id ? { ...c, bloqueada: !customer.bloqueada } : c
      ));
      showToast(`Cliente ${customer.bloqueada ? 'desbloqueada' : 'bloqueada'} (Modo Local)`);
      return;
    }

    try {
      const { error } = await supabase
        .from('live_clientes')
        .update({ bloqueada: !customer.bloqueada })
        .eq('id', customer.id);
        
      if (error) throw error;
      
      setCustomers(prev => prev.map(c => 
        c.id === customer.id ? { ...c, bloqueada: !customer.bloqueada } : c
      ));
      showToast(`Cliente ${customer.bloqueada ? 'desbloqueada' : 'bloqueada'} com sucesso.`);
    } catch (err: any) {
      showToast(`Erro ao atualizar status: ${err.message}`);
    }
  };

  const saveCustomerObservacoes = async (customerId: number) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('live_clientes')
        .update({ observacoes: tempObservacoes })
        .eq('id', customerId);
        
      if (error) throw error;
      
      setCustomers(prev => prev.map(c => 
        c.id === customerId ? { ...c, observacoes: tempObservacoes } : c
      ));
      setEditingCustomerObservacoes(null);
      showToast('Observações atualizadas com sucesso.');
    } catch (err: any) {
      showToast(`Erro ao salvar observação: ${err.message}`);
    }
  };

  const saveCustomerTelefone = async (customerId: number) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('live_clientes')
        .update({ telefone: tempTelefone })
        .eq('id', customerId);
        
      if (error) throw error;
      
      setCustomers(prev => prev.map(c => 
        c.id === customerId ? { ...c, telefone: tempTelefone } : c
      ));
      setEditingCustomerTelefone(null);
      showToast('Telefone atualizado com sucesso.');
    } catch (err: any) {
      showToast(`Erro ao salvar telefone: ${err.message}`);
    }
  };

  const handleExportProductsCSV = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('produtos').select('*');
      if (error) throw error;
      if (!data || data.length === 0) {
        alert('Nenhum produto cadastrado no banco de dados para exportar.');
        return;
      }
      downloadProductsCSV(data);
    } catch (err: any) {
      alert(`Erro ao exportar produtos: ${err.message}`);
    }
  };

  const confirmProductCSVImport = async () => {
    if (!productImportModal || !supabase) return;
    setIsImportingProducts(true);
    try {
      if (productImportModal.products.length === 0) {
        throw new Error('Nenhum produto válido encontrado para importar.');
      }
      
      const { error } = await supabase
        .from('produtos')
        .upsert(productImportModal.products, { onConflict: 'referencia' });

      if (error) throw error;
      
      alert(`${productImportModal.count} produtos importados/atualizados com sucesso!`);
      setProductImportModal(null);
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao salvar produtos no banco de dados: ${err.message}`);
    } finally {
      setIsImportingProducts(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-[#ccff00] selection:text-black">
      <Navbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onOpenSettings={() => setIsSettingsOpen(true)} 
        onOpenHistory={() => setIsHistoryOpen(true)}
        liveConfig={liveConfig}
        setLiveConfig={setLiveConfig}
      />

      <main className="pt-16 pb-4 px-4 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'live' ? (
            !liveConfig.isActive ? (
              <motion.div
                key="start-live"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center justify-center min-h-[70vh]"
              >
                <div className="bg-[#111] border border-[#ccff00]/30 p-8 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] w-full max-w-md flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-[#ccff00]/10 rounded-full flex items-center justify-center mb-6 border border-[#ccff00]/30">
                    <Play className="w-8 h-8 text-[#ccff00] ml-1" />
                  </div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-2">Iniciar Nova Live</h2>
                  <p className="text-white/40 text-sm mb-8">Configure os detalhes da live de hoje para começar a registrar as vendas.</p>
                  
                  <div className="w-full space-y-4 mb-8 text-left">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Data da Live</label>
                      <input
                        type="date"
                        value={liveConfig.date}
                        onChange={(e) => setLiveConfig({ ...liveConfig, date: e.target.value })}
                        className="w-full bg-[#222] border border-white/10 focus:border-[#ccff00] focus:bg-black p-3 rounded-xl outline-none text-xl font-black text-[#ccff00] transition-colors text-center"
                      />
                    </div>
                  </div>

                  <div className="flex w-full gap-3">
                    <button
                      onClick={() => setLiveConfig({ ...liveConfig, date: new Date().toISOString().split('T')[0] })}
                      className="flex-1 py-3 bg-white/5 text-white/60 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-white/10 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        setLiveConfig({ ...liveConfig, isActive: true });
                        setDataLive(liveConfig.date);
                      }}
                      className="flex-[2] py-3 bg-[#ccff00] text-black font-black text-xs uppercase tracking-widest rounded-xl hover:shadow-[0_0_30px_rgba(204,255,0,0.3)] transition-all flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-black" />
                      Iniciar Live
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
            <motion.div
              key="live-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* Giant Search (Reduced Size) */}
              <div className="flex flex-col items-center justify-center py-2 relative">
                <form onSubmit={handleSearch} className="w-full max-w-md relative group z-20">
                  <div className="absolute inset-0 bg-[#ccff00]/5 blur-xl group-focus-within:bg-[#ccff00]/10 transition-all pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setSearchQuery('');
                        setFilteredResults([]);
                        setActiveIndex(-1);
                      } else if (filteredResults.length > 0) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setActiveIndex(prev => (prev + 1) % filteredResults.length);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setActiveIndex(prev => (prev - 1 + filteredResults.length) % filteredResults.length);
                        }
                      }
                    }}
                    placeholder="buscar id, username ou nome..."
                    className="w-full bg-transparent border-b-2 border-[#ccff00]/20 focus:border-[#ccff00] text-2xl md:text-3xl font-black py-3 px-2 outline-none transition-all placeholder:text-[#ccff00]/10 tracking-tighter text-center relative z-10"
                  />
                  <div className="flex justify-center mt-1 gap-3">
                    <span className="text-[#ccff00]/40 font-mono text-[10px] tracking-[0.3em]">BUSCA EM TEMPO REAL ATIVA</span>
                    <span className="text-white/20 font-mono text-[10px] tracking-widest uppercase">
                      {isFetchingCustomers ? (
                        <span className="flex items-center gap-2">
                          <div className="w-2 h-2 border border-white/20 border-t-[#ccff00] rounded-full animate-spin" />
                          SINCRONIZANDO...
                        </span>
                      ) : (
                        `${customers.length} CLIENTES CARREGADOS`
                      )}
                    </span>
                  </div>
                </form>

                {/* Real-time Results Dropdown */}
                <AnimatePresence>
                  {filteredResults.length > 0 && (
                    <motion.div
                      ref={dropdownRef}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full left-1/2 -translate-x-1/2 w-full max-w-md bg-[#111] border border-[#ccff00]/30 rounded-xl mt-2 overflow-y-auto max-h-[500px] shadow-2xl z-30 custom-scrollbar"
                    >
                      {filteredResults.map((c, idx) => (
                        <button
                          key={c.id}
                          ref={activeIndex === idx ? activeItemRef : null}
                          onClick={() => {
                            if (isSavingSale) return;
                            processCustomerSelection(c, searchQuery);
                          }}
                          className={cn(
                            "w-full flex items-center gap-4 p-3 transition-all border-b border-white/5 last:border-0 group/item",
                            activeIndex === idx ? "bg-[#ccff00] text-black" : "hover:bg-[#ccff00]/10"
                          )}
                        >
                          <div className={cn(
                            "text-2xl font-black w-14 text-left flex items-center gap-1",
                            activeIndex === idx ? "opacity-60" : "opacity-40 group-hover/item:opacity-60"
                          )}>
                            {c.codigo_cliente || ''}
                          </div>
                          <div className="flex items-center gap-3 flex-1 text-left">
                            <div className="flex flex-col justify-center">
                              <div className={cn(
                                "font-bold text-base leading-tight transition-colors",
                                activeIndex === idx ? "text-black" : "text-white/90"
                              )}>
                                {cleanDisplay(c.username)}
                              </div>
                              <div className={cn(
                                "text-xs uppercase leading-tight tracking-wide transition-colors",
                                activeIndex === idx ? "text-black/70" : "text-white/35"
                              )}>
                                {cleanDisplay(c.nome_completo)}
                              </div>
                            </div>
                          </div>
                          <ArrowRight className={cn(
                            "w-4 h-4 transition-all",
                            activeIndex === idx ? "opacity-100" : "opacity-0 group-hover/item:opacity-100"
                          )} />
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Listagem Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left: Shopping List */}
                <div className="lg:col-span-6 space-y-2">
                  <div className="flex items-center gap-3 border-l-4 border-[#ccff00] pl-4 mb-2">
                    <ShoppingBag className="text-[#ccff00] w-5 h-5" />
                    <h2 className="text-xl font-black tracking-tight uppercase">Lista de Compras</h2>
                  </div>
                  
                  <div className="space-y-1 max-w-[70%]">
                    {shoppingList.map((customer) => (
                      <motion.div
                        layout
                        key={customer.id}
                        onClick={() => setSelectedCustomer(customer)}
                        className="bg-[#111] border border-white/5 p-1.5 rounded-md flex items-center justify-between cursor-pointer hover:border-[#ccff00]/50 hover:bg-[#151515] transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 flex justify-end">
                            <span className="text-xl font-black text-[#ccff00]/20 group-hover:text-[#ccff00]/40 transition-colors tracking-tighter">
                              {customer.codigo_cliente || ''}
                            </span>
                          </div>
                          <div className="flex flex-col justify-center border-l border-white/10 pl-4 py-0.5">
                            <div className="font-black text-xs md:text-sm leading-tight text-white/90 uppercase tracking-tight">
                              {cleanDisplay(customer.username)}
                            </div>
                            <div className="text-white/30 text-[9px] md:text-[10px] uppercase truncate max-w-[150px] md:max-w-[240px] leading-tight font-medium tracking-widest mt-0.5">
                              {cleanDisplay(customer.nome_completo || 'NOME NÃO CADASTRADO')}
                            </div>
                          </div>
                        </div>
                        <div className="text-right space-y-0.5 pr-2">
                          <div className="bg-[#ccff00]/10 px-2 py-0.5 rounded-full border border-[#ccff00]/20 text-[#ccff00] font-black text-[10px] uppercase inline-block">
                            {customer.purchaseCount} ITENS
                          </div>
                          <div className="text-white/20 text-[10px] font-mono uppercase tracking-tighter block">
                            {customer.lastPurchaseTime}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Right: Timeline */}
                <div className="lg:col-span-6 space-y-2">
                  <div className="flex items-center gap-3 border-l-4 border-[#ccff00]/40 pl-4 mb-2">
                    <History className="text-[#ccff00]/60 w-5 h-5" />
                    <h2 className="text-xl font-black tracking-tight text-white/60 uppercase">Timeline</h2>
                  </div>

                  <div className="space-y-1 max-w-[70%]">
                    {timeline.map((c, idx) => (
                      <motion.div
                        layout
                        key={`${c.id}-${idx}`}
                        onClick={() => setSelectedCustomer(c)}
                        className="bg-[#111] border border-white/5 p-1.5 rounded-md flex items-center justify-between cursor-pointer hover:border-[#ccff00]/50 hover:bg-[#151515] transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 flex justify-end">
                            <span className="text-xl font-black text-[#ccff00]/10 group-hover:text-[#ccff00]/25 transition-colors tracking-tighter">
                              {c.codigo_cliente || ''}
                            </span>
                          </div>
                          <div className="flex flex-col justify-center border-l border-white/5 pl-4 py-0.5">
                            <div className="font-black text-xs md:text-sm leading-tight text-white/70 uppercase tracking-tight">
                              {cleanDisplay(c.username)}
                            </div>
                            <div className="text-white/20 text-[9px] md:text-[10px] uppercase truncate max-w-[150px] md:max-w-[200px] leading-tight font-medium tracking-widest mt-0.5">
                              {cleanDisplay(c.nome_completo || 'NOME NÃO CADASTRADO')}
                            </div>
                          </div>
                        </div>
                        <div className="text-right space-y-0.5 pr-2">
                          <div className="bg-[#ccff00]/10 px-2 py-0.5 rounded-full border border-[#ccff00]/20 text-[#ccff00] font-black text-[10px] uppercase inline-block">
                            {c.purchaseCount} ITENS
                          </div>
                          <div className="text-white/20 text-[10px] font-mono uppercase tracking-tighter block">
                            {c.lastPurchaseTime}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
            )
          ) : activeTab === 'acerto' ? (
            <motion.div
              key="acerto-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* Painel de Lançamento Rápido */}
              <div className="bg-[#111] border-2 border-[#ccff00]/20 p-2.5 rounded-lg shadow-2xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Plus className="text-[#ccff00] w-4 h-4" />
                    <h2 className="text-lg font-black tracking-tight uppercase">Lançamento Rápido</h2>
                  </div>
                </div>

                <form onSubmit={handleAcertoSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div className="space-y-0.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[13px] font-mono text-[#ccff00]/60 uppercase tracking-widest">CÓD.</label>
                      {acertoId && (
                        <span className={cn(
                          "text-[10px] font-black truncate max-w-[180px] px-2 py-0.5 rounded-sm uppercase tracking-tight",
                          acertoActiveCustomer 
                            ? "text-[#ccff00] bg-[#ccff00]/10 border border-[#ccff00]/20 shadow-[0_0_10px_rgba(204,255,0,0.15)]" 
                            : "text-red-500 bg-red-500/10 border border-red-500/20 animate-pulse"
                        )}>
                          {acertoActiveCustomer 
                            ? (acertoActiveCustomer.nome_completo || 'VÁLIDO')
                            : 'NÃO ENCONTRADO'}
                        </span>
                      )}
                    </div>
                    <input
                      ref={idInput}
                      type="text"
                      value={acertoId}
                      onChange={(e) => setAcertoId(e.target.value)}
                      onFocus={() => setShowRecentPurchases(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (acertoActiveCustomer) {
                            refInput.current?.focus();
                          } else {
                            showToast('⚠️ Código não encontrado na lista de compras');
                          }
                        }
                      }}
                      className={cn(
                        "w-full bg-[#1a1a1a] border transition-all p-2 rounded-lg outline-none text-base font-bold placeholder:text-white/20",
                        acertoActiveCustomer 
                          ? "border-green-500/50 focus:border-green-500 bg-green-500/5" 
                          : acertoId.length > 0 
                            ? "border-red-500/50 focus:border-red-500 bg-red-500/5"
                            : "border-white/5 focus:border-[#ccff00] focus:bg-black"
                      )}
                      placeholder="CÓD. ou Username"
                    />
                  </div>
                  <div className="space-y-0.5 relative">
                    <div className="flex justify-between items-center">
                      <label className="text-[13px] font-mono text-[#ccff00]/60 uppercase tracking-widest">Referência</label>
                    </div>
                    <div className="relative">
                      <input
                        ref={refInput}
                        type="text"
                        value={acertoRef}
                        onChange={(e) => {
                          setAcertoRef(e.target.value);
                        }}
                        onFocus={() => setShowRecentPurchases(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = e.currentTarget.value;
                            validateRef(val, 'focus_price').then(isValid => {
                              if (isValid) {
                                // Foco imediato no preço se a referência for válida
                                valueInput.current?.focus();
                              }
                            }).catch(err => console.error("validateRef error:", err));
                          }
                        }}
                        className={cn(
                          "w-full bg-[#1a1a1a] border transition-all duration-300 p-2 rounded-lg outline-none text-base font-bold placeholder:text-white/20 shadow-sm",
                          "border-white/5 focus:border-[#ccff00] focus:bg-black focus:shadow-[0_0_15px_rgba(204,255,0,0.15)]"
                        )}
                        placeholder="Ex: REF01"
                      />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[13px] font-mono text-[#ccff00]/60 uppercase tracking-widest">Preço Un. (R$)</label>
                    <input
                      ref={valueInput}
                      type="number"
                      step="0.01"
                      value={acertoValue}
                      onChange={(e) => setAcertoValue(e.target.value)}
                      onFocus={() => setShowRecentPurchases(false)}
                      disabled={!acertoRef}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), qtyInput.current?.focus())}
                      className="w-full bg-[#1a1a1a] border border-white/5 focus:border-[#ccff00] focus:bg-black transition-all duration-300 p-2 rounded-lg outline-none text-base font-bold text-[#ccff00] placeholder:text-white/20 disabled:opacity-20 disabled:cursor-not-allowed shadow-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[13px] font-mono text-[#ccff00]/60 uppercase tracking-widest">Qtd</label>
                    <input
                      ref={qtyInput}
                      type="number"
                      value={acertoQuantity}
                      onChange={(e) => setAcertoQuantity(e.target.value)}
                      onFocus={() => setShowRecentPurchases(false)}
                      disabled={!acertoRef}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAcertoSubmit(e))}
                      className="w-full bg-[#1a1a1a] border border-white/5 focus:border-[#ccff00] focus:bg-black transition-all duration-300 p-2 rounded-lg outline-none text-base font-bold placeholder:text-white/20 disabled:opacity-20 disabled:cursor-not-allowed shadow-sm"
                      placeholder="1"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={!acertoRef}
                      className="w-full h-[42px] bg-[#ccff00] text-black font-black text-sm rounded-lg hover:shadow-[0_0_25px_rgba(204,255,0,0.4)] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-20 disabled:cursor-not-allowed active:scale-95"
                    >
                      LANÇAR <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>

                {purchases.length > 0 && (
                  <div className="mt-4 border-t border-white/5 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowRecentPurchases(!showRecentPurchases)}
                      className="w-full flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5"
                    >
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-white/40" />
                        <span className="text-[11px] font-black text-white/60 uppercase tracking-widest">
                          <span>ÚLTIMOS LANÇAMENTOS ({purchases.length})</span>
                        </span>
                      </div>
                      {showRecentPurchases ? (
                        <ChevronUp className="w-4 h-4 text-white/40" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-white/40" />
                      )}
                    </button>

                    <AnimatePresence>
                      {showRecentPurchases && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-1.5 mt-2 max-h-[340px] overflow-y-auto pr-2 custom-scrollbar"
                        >
                          {purchases.map((p) => {
                            const cust = customersMap.get(String(p.customerId));
                            const cleanUsername = cust?.username 
                              ? cust.username.replace(/^@/, '').replace(/^"/, '').split(',')[0].trim() 
                              : 'N/A';
                            return (
                              <div 
                                key={`recent-${p.id}`} 
                                className="bg-black/30 rounded-md p-3.5 flex items-center justify-between border border-white/5 group hover:border-white/10 transition-colors"
                              >
                                <div className="flex items-center gap-2 sm:gap-3">
                                  <div className="bg-[#ccff00]/10 text-[#ccff00] px-2.5 py-1 rounded-md text-[17px] font-black min-w-[36px] text-center">
                                    <span>{p.quantity}x</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-white font-bold text-[16.5px] uppercase tracking-tight"><span>{p.reference}</span></span>
                                    <span className="text-white/40 text-[14px] uppercase tracking-wider font-mono flex flex-wrap items-center gap-1.5 mt-1">
                                      <span className="text-[#ccff00] font-black">CÓD {cust?.codigo_cliente || ''}</span>
                                      <span className="text-white/20">•</span>
                                      <span className="text-[#00ffff] font-extrabold">{cleanUsername}</span>
                                      {cust?.nome_completo && cust.nome_completo !== 'Novo Cliente' && (
                                        <>
                                          <span className="text-white/20">•</span>
                                          <span className="text-[#5fb3f9] font-bold">{cust.nome_completo}</span>
                                        </>
                                      )}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[#ccff00] font-black text-[15px]"><span>R$ {(p.value * p.quantity).toFixed(2)}</span></span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setDeletePurchaseModal({ visible: true, purchase: p });
                                    }}
                                    className="text-red-500 hover:text-white bg-red-500/10 hover:bg-red-500 px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1.5"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span className="text-[13px] font-black uppercase tracking-wider hidden sm:inline"><span>Excluir</span></span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Tabela de Fechamento */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-l-4 border-[#ccff00] pl-4">
                  <div className="flex items-center gap-3">
                    <DollarSign className="text-[#ccff00] w-5 h-5" />
                    <h2 className="text-xl font-black tracking-tight uppercase">Fechamento</h2>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={startFocusMode}
                      className="bg-[#ccff00]/10 text-[#ccff00] border border-[#ccff00]/30 px-4 py-1.5 rounded-md font-black text-xs uppercase hover:bg-[#ccff00]/20 transition-all flex items-center gap-2 shadow-[0_0_10px_rgba(204,255,0,0.1)]"
                    >
                      <Play className="w-3 h-3" />
                      Disparo em Massa
                    </button>
                    <div className="flex flex-col items-end">
                      <div className="text-[#ccff00] font-mono text-lg leading-none">
                        TOTAL: R$ {groupedPurchases.totalValue.toFixed(2)}
                      </div>
                      <div className="text-[#ccff00]/70 font-mono text-xs mt-1">
                        TOTAL PAGO: R$ {groupedPurchases.totalPaidValue.toFixed(2)}
                      </div>
                    </div>
                    {(purchases.length > 0 || liveConfig.isActive) && (
                      <div className="flex items-center gap-2 relative">
                        <div className="relative">
                          <button
                            onClick={() => setIsFinalizarModalOpen(!isFinalizarModalOpen)}
                            disabled={isSavingSale || isAutoSaving}
                            className="bg-[#ccff00] text-black px-4 py-1.5 rounded-md font-black text-xs uppercase hover:shadow-[0_0_15px_rgba(204,255,0,0.3)] transition-all disabled:opacity-50 flex items-center gap-2"
                          >
                            <span>{isSavingSale ? 'SALVANDO...' : 'OPÇÕES DE ACERTO'}</span>
                            {!isSavingSale && <Save className="w-3 h-3" />}
                          </button>

                        <AnimatePresence>
                          {isFinalizarModalOpen && !isSavingSale && (
                            <>
                              <div 
                                className="fixed inset-0 z-40" 
                                onClick={() => setIsFinalizarModalOpen(false)}
                              />
                              <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                                className="absolute right-0 top-full mt-2 w-64 bg-[#111] border border-[#ccff00]/30 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col"
                              >
                                <button
                                  onClick={() => {
                                    setIsFinalizarModalOpen(false);
                                    copyExcelSummary();
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/5 transition-colors group"
                                >
                                  <div className="font-black text-white group-hover:text-[#ccff00] text-sm uppercase tracking-wide mb-0.5 flex items-center gap-2">
                                    Copiar Resumo para Excel
                                    <FileText className="w-3 h-3" />
                                  </div>
                                  <div className="text-[10px] text-white/50 leading-tight">
                                    Gera texto formatado com TAB para colar no Excel.
                                  </div>
                                </button>

                                <button
                                  onClick={() => {
                                    setIsFinalizarModalOpen(false);
                                    
                                    const activeGroups = groupedPurchases.groups.filter(g => g.items.length > 0);
                                    const unpaidBags = activeGroups.filter(g => !g.paid);
                                    const unsentMessages = activeGroups.filter(g => !sentMessages.includes(String(g.customerId)) && !sentWhatsappMessages.includes(String(g.customerId)));

                                    let title = 'Salvar e Finalizar';
                                    let message = 'Tem certeza que deseja salvar e finalizar? Isso gravará no histórico e limpará todas as telas para uma nova live.';

                                    if (unpaidBags.length > 0) {
                                      title = 'Atenção: Sacolas Pendentes';
                                      message = `Existem ${unpaidBags.length} sacola(s) não paga(s)${unsentMessages.length > 0 ? ` e ${unsentMessages.length} mensagem(ns) pendente(s)` : ''}. Tem certeza que deseja finalizar a live mesmo assim?`;
                                    }

                                    setConfirmAction({
                                      type: 'finalizar',
                                      title,
                                      message
                                    });
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-[#ccff00]/10 transition-colors group"
                                >
                                  <div className="font-black text-[#ccff00] text-sm uppercase tracking-wide mb-0.5">
                                    Salvar e Finalizar
                                  </div>
                                  <div className="text-[10px] text-[#ccff00]/70 leading-tight">
                                    Grava no histórico e limpa todas as telas.
                                  </div>
                                </button>
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </div>
              </div>

                {/* Filtro e Contador Estilo Screenshot */}
                <div className="flex items-center gap-4 px-1">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      id="fechamento-search"
                      type="text"
                      placeholder="Filtrar..."
                      value={fechamentoSearch}
                      onChange={(e) => setFechamentoSearch(e.target.value)}
                      className="w-full bg-[#222] border border-[#ccff00]/40 focus:border-[#ccff00] focus:bg-black h-7 pl-10 rounded-lg outline-none text-sm font-bold text-white/80 placeholder:text-white/40 shadow-[0_0_10px_rgba(204,255,0,0.1)] transition-all"
                    />
                  </div>
                  <div className="text-[14px] font-black text-white/40 uppercase tracking-[0.2em]">
                    {filteredGroups.length} SACOLAS
                  </div>
                </div>

                <div className="bg-[#0a0a0a] border border-white/5 rounded-md overflow-visible">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-[10px] font-black text-white/30 uppercase tracking-widest bg-white/5">
                        <th className="px-1 py-1 w-10">CÓD.</th>
                        <th className="px-1 py-1 w-28">SACOLA</th>
                        <th className="px-1 py-1">NOME</th>
                        <th className="px-2 py-1 w-24 text-center">QTD LIVE</th>
                        <th className="px-2 py-1 w-24 text-center">REF</th>
                        <th className="px-2 py-1 w-16 text-center">MSG</th>
                        <th className="px-2 py-1 w-28 text-center">PAGO</th>
                        <th className="px-2 py-1 w-24 text-right">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredGroups.map((group, index) => (
                        <tr 
                          key={group.customerId} 
                          ref={index === selectedRowIndex ? selectedRowRef : null}
                          className={cn(
                            "transition-colors group relative",
                            index === selectedRowIndex ? "bg-[#ccff00]/10 border-y border-[#ccff00]/30" : "hover:bg-white/5"
                          )}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({
                              visible: true,
                              x: e.clientX,
                              y: e.clientY,
                              customerId: group.customerId
                            });
                          }}
                        >
                          <td className="px-1 py-0.5">
                            <div className="flex items-center gap-1.5 min-w-[3.5rem]">
                              <span className="text-[#ccff00] font-black text-xl drop-shadow-[0_0_5px_rgba(204,255,0,0.3)]">
                                {group.codigo_cliente || ''}
                              </span>
                            </div>
                          </td>
                          <td className="px-1 py-0.5">
                            <a 
                              href={`https://instagram.com/${(group.username || '').replace(/^@/, '').replace(/^"/, '').split(',')[0].trim()}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#00ffff] font-bold text-sm underline decoration-[#00ffff]/30 underline-offset-2 cursor-pointer hover:text-[#00ffff]/80"
                            >
                              {(group.username || 'N/A').replace(/^"/, '').split(',')[0]}
                            </a>
                          </td>
                          <td className="px-1 py-0.5">
                            <span className="text-[#5fb3f9] text-sm font-bold">
                              {group.nome_completo}
                            </span>
                          </td>
                          <td className="px-2 py-0.5 text-center">
                            {(() => {
                              const currentItemsCount = group.items.reduce((sum, i) => sum + Number(i.quantity), 0);
                              const isMatch = Number(group.qtdLive) === currentItemsCount;
                              const hasItems = currentItemsCount > 0;
                              
                              return (
                                <div className={cn(
                                  "px-2 py-0.5 rounded-md font-black text-[10px] uppercase flex items-center justify-center gap-1 mx-auto w-fit border transition-all",
                                  isMatch 
                                    ? "bg-green-500/10 border-green-500/30 text-green-400 shadow-[0_0_10px_rgba(74,222,128,0.1)]" 
                                    : "bg-red-500/10 border-red-500/30 text-red-400 shadow-[0_0_10px_rgba(248,113,113,0.1)]"
                                )}>
                                  <Zap className={cn("w-2.5 h-2.5", isMatch ? "text-green-400" : "text-red-400")} />
                                  {group.qtdLive} ITENS
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-2 py-0.5 text-center relative">
                            <button
                              onClick={() => setExpandedCustomerId(expandedCustomerId === group.customerId ? null : group.customerId)}
                              className="bg-[#ccff00]/10 border border-[#ccff00]/30 px-2 py-0.5 rounded-md text-[#ccff00] font-black text-[10px] uppercase hover:bg-[#ccff00]/20 transition-all flex items-center gap-1 mx-auto"
                            >
                              <ShoppingBag className="w-2.5 h-2.5" />
                              {group.items.reduce((sum, i) => sum + Number(i.quantity), 0)} ITENS
                            </button>

                            {/* Floating List Popover */}
                            <AnimatePresence>
                              {expandedCustomerId === group.customerId && (
                                <>
                                  <div 
                                    className="fixed inset-0 z-40" 
                                    onClick={() => setExpandedCustomerId(null)} 
                                  />
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.9, y: 5 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: 5 }}
                                    className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 bg-[#111] border border-[#ccff00]/30 rounded-lg shadow-2xl z-50 p-2 overflow-hidden"
                                  >
                                    <div className="text-[9px] font-black text-[#ccff00]/60 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">
                                      Referências
                                    </div>
                                    <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                                      {group.items.map((item) => (
                                        <div key={item.id} className="flex justify-between items-center bg-white/5 px-1.5 py-1 rounded group/item border border-white/5">
                                          <div className="flex flex-col items-start gap-0.5">
                                            <span className="font-mono text-[11px] text-white/90 font-medium leading-none">{item.reference}</span>
                                            <span className="text-[9.5px] text-white/60 leading-none tracking-wide">R$ {item.value.toFixed(2)}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-[#ccff00] text-[11px]">x{item.quantity}</span>
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                removePurchase(item.id);
                                              }}
                                              className="text-red-500 hover:text-red-400 p-0.5 rounded transition-colors opacity-80 hover:opacity-100"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                      {group.items.length === 0 && (
                                        <div className="text-[9px] text-white/20 italic text-center py-2">
                                          Nenhuma referência
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                </>
                              )}
                            </AnimatePresence>
                          </td>
                          <td className="px-2 py-0.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {group.telefone && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    generateWhatsAppMessage(group.customerId, group.nome_completo, group.total, group.telefone!);
                                  }}
                                  className={cn(
                                    "p-1 rounded-md transition-all flex items-center justify-center",
                                    sentWhatsappMessages.includes(String(group.customerId))
                                      ? "text-green-500 bg-green-500/10 hover:bg-green-500/20"
                                      : "text-green-400 hover:bg-green-400/10"
                                  )}
                                  title={sentWhatsappMessages.includes(String(group.customerId)) ? "WhatsApp Enviado" : "Enviar WhatsApp"}
                                >
                                  {sentWhatsappMessages.includes(String(group.customerId)) ? (
                                    <Check className="w-4 h-4" />
                                  ) : (
                                    <MessageCircle className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  generateInstagramMessage(group.customerId, group.username, group.nome_completo, group.total);
                                }}
                                className={cn(
                                  "p-1 rounded-md transition-all flex items-center justify-center",
                                  sentMessages.includes(String(group.customerId))
                                    ? "text-green-500 bg-green-500/10 hover:bg-green-500/20"
                                    : "text-[#ccff00] hover:bg-[#ccff00]/10"
                                )}
                                title={sentMessages.includes(String(group.customerId)) ? "Mensagem Enviada" : "Enviar Mensagem Instagram"}
                              >
                                {sentMessages.includes(String(group.customerId)) ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Instagram className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-0.5 text-center">
                            <button
                              disabled={group.items.length === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                const cid = String(group.customerId);
                                
                                if (group.items.length === 0) return;

                                if (group.paid) {
                                  // Lógica de desfazer pagamento (com confirmação)
                                  if (confirmingUnpayId === cid) {
                                    setGroupPaidStatus(Number(cid), false);
                                    setConfirmingUnpayId(null);
                                    if (unpayTimeoutRef.current) clearTimeout(unpayTimeoutRef.current);
                                  } else {
                                    setConfirmingUnpayId(cid);
                                    if (unpayTimeoutRef.current) clearTimeout(unpayTimeoutRef.current);
                                    unpayTimeoutRef.current = setTimeout(() => {
                                      setConfirmingUnpayId(null);
                                    }, 3000);
                                  }
                                } else {
                                  // Lógica de pagar (Pendente -> Processando -> Pago)
                                  if (processingIds.includes(cid)) {
                                    setGroupPaidStatus(Number(cid), true);
                                    setProcessingIds(prev => prev.filter(id => id !== cid));
                                  } else {
                                    setProcessingIds(prev => [...prev, cid]);
                                  }
                                }
                              }}
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black transition-all min-w-[85px] justify-center outline-none",
                                group.items.length === 0
                                  ? "bg-white/5 text-white/20 border border-white/10 cursor-not-allowed"
                                  : group.paid 
                                    ? confirmingUnpayId === String(group.customerId)
                                      ? "bg-orange-500/20 text-orange-500 border border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.4)] scale-105"
                                      : "bg-green-500/20 text-green-500 border border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.2)]" 
                                    : processingIds.includes(String(group.customerId))
                                      ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.4)] scale-105"
                                      : "bg-red-500/20 text-red-500 border border-red-500/30"
                              )}
                            >
                              {group.items.length === 0 ? (
                                <ShoppingBag className="w-2.5 h-2.5 opacity-50" />
                              ) : group.paid ? (
                                confirmingUnpayId === String(group.customerId) ? <AlertCircle className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5" />
                              ) : processingIds.includes(String(group.customerId)) ? (
                                <AlertCircle className="w-2.5 h-2.5" />
                              ) : (
                                <XCircle className="w-2.5 h-2.5" />
                              )}
                              <span>
                                {group.items.length === 0 
                                  ? 'VAZIA' 
                                  : group.paid 
                                    ? (confirmingUnpayId === String(group.customerId) ? 'DESFAZER?' : 'PAGO') 
                                    : processingIds.includes(String(group.customerId)) 
                                      ? 'PROCESSANDO' 
                                      : 'PENDENTE'}
                              </span>
                            </button>
                          </td>
                          <td className="px-2 py-0.5 text-right">
                            <span className="font-black text-[#ccff00] text-xs">
                              R$ {group.total.toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredGroups.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-white/20 font-mono italic text-xs">
                            Nenhum lançamento encontrado para esta busca.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          ) : activeTab === 'sacolas' ? (
            <motion.div
              key="sacolas-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4 max-w-lg mx-auto pb-20"
            >
              {/* Pesquisa Fixa para Mobile */}
              <div className="sticky top-12 z-40 bg-[#0a0a0a]/95 backdrop-blur-xl py-2 -mx-4 px-4 border-b border-white/5 shadow-2xl">
                <div className="relative group">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#ccff00]/40 group-focus-within:text-[#ccff00] transition-colors" />
                  <input
                    type="text"
                    placeholder="Buscar sacola ou ID..."
                    value={fechamentoSearch}
                    onChange={(e) => setFechamentoSearch(e.target.value)}
                    className="w-full bg-[#111] border border-white/10 focus:border-[#ccff00] focus:ring-1 focus:ring-[#ccff00]/20 h-11 pl-10 pr-10 rounded-xl outline-none text-base font-bold text-white placeholder:text-white/20 transition-all"
                  />
                  {fechamentoSearch && (
                    <button 
                      onClick={() => setFechamentoSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Filtros de Aba */}
                <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar pb-1 px-0.5">
                  {[
                    { id: 'todas', label: 'Todas', activeColor: 'text-white', inactiveColor: 'text-white/50', activeBg: 'bg-white/10', inactiveBg: 'bg-white/5', activeBorder: 'border-white/30', inactiveBorder: 'border-white/5', shadow: 'shadow-[0_0_15px_rgba(255,255,255,0.15)]' },
                    { id: 'pagas', label: 'Pagas', activeColor: 'text-green-400', inactiveColor: 'text-green-400/50', activeBg: 'bg-green-500/20', inactiveBg: 'bg-green-500/5', activeBorder: 'border-green-500/50', inactiveBorder: 'border-green-500/10', shadow: 'shadow-[0_0_15px_rgba(74,222,128,0.25)]' },
                    { id: 'a_pagar', label: 'À pagar', activeColor: 'text-red-400', inactiveColor: 'text-red-400/50', activeBg: 'bg-red-500/20', inactiveBg: 'bg-red-500/5', activeBorder: 'border-red-500/50', inactiveBorder: 'border-red-500/10', shadow: 'shadow-[0_0_15px_rgba(248,113,113,0.25)]' },
                    { id: 'entregues', label: 'Entregue', activeColor: 'text-blue-400', inactiveColor: 'text-blue-400/50', activeBg: 'bg-blue-500/20', inactiveBg: 'bg-blue-500/5', activeBorder: 'border-blue-500/50', inactiveBorder: 'border-blue-500/10', shadow: 'shadow-[0_0_15px_rgba(96,165,250,0.25)]' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setBagFilterTab(tab.id as any)}
                      className={cn(
                        "flex-1 whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border",
                        bagFilterTab === tab.id 
                          ? cn(tab.activeBg, tab.activeColor, tab.activeBorder, tab.shadow, "scale-[1.02]")
                          : cn(tab.inactiveBg, tab.inactiveColor, tab.inactiveBorder, "hover:brightness-125 hover:scale-[1.01]")
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex justify-between items-center gap-2 mt-2 px-1 w-full">
                  <div className="text-[11px] min-[375px]:text-[12px] sm:text-xs font-black text-[#ccff00]/70 uppercase tracking-[0.1em] sm:tracking-[0.15em] shrink-0">
                    <span>{filteredBagGroups.length} SACOLAS</span> <span>{bagFilterTab !== 'todas' ? `(${bagFilterTab.replace('_', ' ').toUpperCase()})` : ''}</span>
                  </div>
                  <div className="flex items-center gap-1.5 min-[375px]:gap-2 sm:gap-3 text-[10px] min-[375px]:text-[11px] sm:text-[12px] font-black uppercase tracking-wider shrink-0">
                    <span className="text-white/50">Total: <span className="text-[#ccff00] text-xs min-[375px]:text-sm sm:text-base font-black">R$ {groupedPurchases.totalValue.toFixed(2)}</span></span>
                    <span className="text-white/50">Pago: <span className="text-green-400 text-xs min-[375px]:text-sm sm:text-base font-black">R$ {groupedPurchases.totalPaidValue.toFixed(2)}</span></span>
                    <span className="text-white/50">Falta: <span className="text-red-400 text-xs min-[375px]:text-sm sm:text-base font-black">R$ {(groupedPurchases.totalValue - groupedPurchases.totalPaidValue).toFixed(2)}</span></span>
                  </div>
                </div>
              </div>

              {/* Cards de Sacolas */}
              <div className="grid grid-cols-1 gap-2.5 mt-2">
                {filteredBagGroups.filter(g => g.items.length > 0).map((group) => {
                  const itemsCount = group.items.reduce((sum, i) => sum + Number(i.quantity), 0);
                  const statusColor = group.paid 
                    ? group.delivered ? "border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.15)]" : "border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                    : "border-white/5";
                  
                  const dotColor = group.paid
                    ? group.delivered ? "bg-green-500" : "bg-blue-500"
                    : "bg-red-500";

                  return (
                    <motion.div
                      key={group.customerId}
                      className={cn(
                        "bg-[#111] border-2 p-3 rounded-2xl transition-all relative overflow-hidden",
                        statusColor
                      )}
                    >
                      {/* Badge de Status Subtil */}
                      <div className="absolute top-0 right-0 p-4">
                        <div className={cn("w-2 h-2 rounded-full", dotColor, group.paid && !group.delivered && "animate-pulse")} />
                      </div>

                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                          <div className="text-xl font-black text-[#ccff00] drop-shadow-[0_0_5px_rgba(204,255,0,0.3)]">
                            {group.codigo_cliente || group.customerId}
                          </div>
                          <div className="flex flex-col">
                            <h3 className="text-[13px] font-bold text-[#00ffff] underline decoration-[#00ffff]/30 underline-offset-2 uppercase tracking-tight truncate max-w-[200px]">
                              {(group.username || 'N/A').replace(/^"/, '').split(',')[0]}
                            </h3>
                            <p className="text-[13px] font-bold text-[#5fb3f9] truncate max-w-[200px]">
                              {group.nome_completo}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-black text-white leading-none">
                            <span className="text-[10px] text-white/20 mr-1 font-mono uppercase">R$</span>
                            {group.total.toFixed(2)}
                          </div>
                          <div className="text-[11px] font-black text-white/60 uppercase mt-0.5">
                            {itemsCount} ITENS
                          </div>
                        </div>
                      </div>

                      {/* Action Bar */}
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                          onClick={() => {
                            const cid = String(group.customerId);
                            if (group.paid) {
                              if (confirmingUnpayId === cid) {
                                setGroupPaidStatus(Number(group.customerId), false);
                                setConfirmingUnpayId(null);
                              } else {
                                setConfirmingUnpayId(cid);
                                setTimeout(() => setConfirmingUnpayId(null), 3000);
                              }
                            } else {
                              // Lógica de pagar (Pendente -> Processando -> Pago)
                              if (processingIds.includes(cid)) {
                                setGroupPaidStatus(Number(group.customerId), true);
                                setProcessingIds(prev => prev.filter(id => id !== cid));
                              } else {
                                setProcessingIds(prev => [...prev, cid]);
                              }
                            }
                          }}
                          className={cn(
                            "flex items-center justify-center gap-2 py-2 rounded-xl font-black text-xs uppercase tracking-tighter transition-all",
                            group.paid 
                              ? confirmingUnpayId === String(group.customerId)
                                ? "bg-orange-500/20 text-orange-500 border border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.4)] scale-105"
                                : "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                              : processingIds.includes(String(group.customerId))
                                ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.4)] scale-105"
                                : "bg-red-500/20 text-red-500 border border-red-500/30"
                          )}
                        >
                          {group.paid ? (
                            confirmingUnpayId === String(group.customerId) ? (
                              <>
                                <AlertCircle className="w-4 h-4" />
                                DESFAZER?
                              </>
                            ) : (
                              <>
                                <CheckCheck className="w-4 h-4" />
                                PAGO
                              </>
                            )
                          ) : processingIds.includes(String(group.customerId)) ? (
                            <>
                              <AlertCircle className="w-4 h-4" />
                              PROCESSANDO
                            </>
                          ) : (
                            <>
                              <DollarSign className="w-4 h-4" />
                              MARCAR PAGO
                            </>
                          )}
                        </button>

                        <button
                          disabled={!group.paid}
                          onClick={() => toggleDelivered(group.customerId)}
                          className={cn(
                            "flex items-center justify-center gap-2 py-2 rounded-xl font-black text-xs uppercase tracking-tighter transition-all",
                            group.delivered
                              ? "bg-green-500 text-black shadow-[0_0_20px_rgba(34,197,94,0.4)]"
                              : group.paid
                                ? "bg-[#ccff00]/10 text-[#ccff00] border border-[#ccff00]/30"
                                : "bg-white/5 text-white/10 border border-white/5 opacity-50 cursor-not-allowed"
                          )}
                        >
                          {group.delivered ? (
                            <>
                              <PackageCheck className="w-4 h-4" />
                              <span>ENTREGUE</span>
                            </>
                          ) : (
                            <>
                              <Truck className="w-4 h-4" />
                              <span>{group.paid ? "ENTREGAR" : "ENTREGA BLOQ."}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}

                {filteredBagGroups.filter(g => g.items.length > 0).length === 0 && (
                  <div className="text-center py-20 bg-[#111] rounded-3xl border border-white/5">
                    <Package className="w-12 h-12 text-white/10 mx-auto mb-4" />
                    <p className="text-white/30 font-mono text-sm uppercase tracking-widest">Nenhuma sacola encontrada</p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : activeTab === 'clientes' ? (
            <motion.div
              key="clientes-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="bg-[#111] border border-white/5 p-4 rounded-xl shadow-2xl space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                    <Users className="text-[#ccff00] w-6 h-6" />
                    <h2 className="text-xl font-black tracking-tight uppercase">Gerenciamento de Clientes</h2>
                  </div>
                  
                  <div className="relative w-full md:w-96 group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#ccff00]/40 group-focus-within:text-[#ccff00] transition-colors" />
                    <input
                      type="text"
                      placeholder="Buscar por nome, username ou cód..."
                      value={clientesSearch}
                      onChange={(e) => setClientesSearch(e.target.value)}
                      className="w-full bg-black border border-white/10 focus:border-[#ccff00] h-11 pl-10 pr-4 rounded-xl outline-none text-sm font-bold text-white placeholder:text-white/20 transition-all"
                    />
                    {clientesSearch && (
                      <button 
                        onClick={() => setClientesSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-white/5">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-black/50 text-white/40 text-[10px] uppercase tracking-widest border-b border-white/5">
                        <th className="p-3 font-black whitespace-nowrap">Cód.</th>
                        <th className="p-3 font-black">Sacola (Username)</th>
                        <th className="p-3 font-black">Nome Completo</th>
                        <th className="p-3 font-black whitespace-nowrap min-w-[140px]">Telefone</th>
                        <th className="p-3 font-black w-1/3">Observações</th>
                        <th className="p-3 font-black text-center whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-sm">
                      {displayedCustomers.map((cliente) => (
                        <tr key={cliente.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="p-3 font-mono text-[#ccff00] font-black">
                            {cliente.codigo_cliente || '-'}
                          </td>
                          <td className="p-3 font-bold text-white/80">
                            {cliente.username}
                          </td>
                          <td className="p-3 text-white/60 text-xs font-medium uppercase">
                            {cliente.nome_completo || <span className="text-red-500/50">NÃO CADASTRADO</span>}
                          </td>
                          <td className="p-3 text-white/60 font-mono text-xs whitespace-nowrap">
                            {editingCustomerTelefone === cliente.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={tempTelefone}
                                  onChange={(e) => {
                                      // Only numbers, parentheses, dash, space
                                      const val = e.target.value.replace(/[^\d() -]/g, '');
                                      setTempTelefone(val);
                                  }}
                                  placeholder="(99) 99999-9999"
                                  className="w-32 bg-black border border-[#ccff00]/30 focus:border-[#ccff00] px-2 py-1 rounded text-xs text-white outline-none"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveCustomerTelefone(Number(cliente.id));
                                    if (e.key === 'Escape') setEditingCustomerTelefone(null);
                                  }}
                                />
                                <button
                                  onClick={() => saveCustomerTelefone(Number(cliente.id))}
                                  className="p-1.5 bg-[#ccff00]/20 text-[#ccff00] rounded hover:bg-[#ccff00] hover:text-black transition-colors"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => setEditingCustomerTelefone(null)}
                                  className="p-1.5 bg-white/5 text-white/40 rounded hover:bg-white/10 hover:text-white transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div 
                                onClick={() => {
                                  setEditingCustomerTelefone(Number(cliente.id));
                                  setTempTelefone(cliente.telefone || '');
                                }}
                                className="group flex items-center gap-2 cursor-text"
                              >
                                <span>{cliente.telefone || '-'}</span>
                                <Edit2 className="w-3 h-3 text-white/0 group-hover:text-white/40 transition-colors" />
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            {editingCustomerObservacoes === cliente.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={tempObservacoes}
                                  onChange={(e) => setTempObservacoes(e.target.value)}
                                  className="flex-1 bg-black border border-[#ccff00]/30 focus:border-[#ccff00] px-2 py-1 rounded text-xs text-white outline-none"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveCustomerObservacoes(Number(cliente.id));
                                    if (e.key === 'Escape') setEditingCustomerObservacoes(null);
                                  }}
                                />
                                <button
                                  onClick={() => saveCustomerObservacoes(Number(cliente.id))}
                                  className="p-1.5 bg-[#ccff00]/20 text-[#ccff00] rounded hover:bg-[#ccff00] hover:text-black transition-colors"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => setEditingCustomerObservacoes(null)}
                                  className="p-1.5 bg-white/5 text-white/40 rounded hover:bg-white/10 hover:text-white transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div>
                                <div 
                                  onClick={() => {
                                    setEditingCustomerObservacoes(Number(cliente.id));
                                    setTempObservacoes(cliente.observacoes || '');
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!cliente.observacoes) return;
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHoveredObs({ text: cliente.observacoes, x: rect.left, y: rect.top });
                                  }}
                                  onMouseLeave={() => setHoveredObs(null)}
                                  className="group/obs flex items-center gap-2 cursor-text"
                                >
                                  <span className={cn(
                                    "text-xs truncate max-w-[200px] md:max-w-xs",
                                    cliente.observacoes ? "text-white/60" : "text-white/20 italic"
                                  )}>
                                    {cliente.observacoes || 'Adicionar observação...'}
                                  </span>
                                  <Edit2 className="w-3 h-3 text-white/0 group-hover/obs:text-white/40 transition-colors" />
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => toggleCustomerBlock(cliente)}
                              className={cn(
                                "px-3 py-1 rounded font-black text-[10px] uppercase tracking-wider transition-all",
                                cliente.bloqueada 
                                  ? "bg-red-500/20 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white" 
                                  : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white"
                              )}
                            >
                              <span>{cliente.bloqueada ? 'Desbloquear' : 'Bloquear'}</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="flex justify-start items-center">
                   <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">
                     {customers.length} CLIENTES CADASTRADOS
                   </div>
                </div>

              </div>
            </motion.div>
          ) : (
            <motion.div
              key="import-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Upload Section */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="bg-[#111] border border-white/5 p-3 rounded-lg shadow-2xl">
                    <h2 className="text-lg font-black mb-2 flex items-center gap-2 text-[#ccff00] uppercase">
                      <Upload className="w-5 h-5" />
                      Importar CSV
                    </h2>
                    
                    <div className="space-y-2">
                      <label className="relative group cursor-pointer block">
                        <div className="border-2 border-dashed border-white/10 group-hover:border-[#ccff00]/50 transition-colors rounded-lg p-4 text-center bg-black/50">
                          <Upload className="w-8 h-8 text-white/20 mx-auto mb-2 group-hover:text-[#ccff00] transition-colors" />
                          <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">
                            Clique para selecionar arquivos CSV
                          </span>
                          <input 
                            type="file" 
                            accept=".csv" 
                            multiple 
                            onChange={onFileChange} 
                            className="hidden"
                          />
                        </div>
                      </label>

                      <AnimatePresence>
                        {importFiles.map((file, idx) => (
                          <motion.div
                            key={file.name + idx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="flex items-center justify-between p-2 bg-black/30 rounded-md border border-white/5"
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileText className="w-4 h-4 text-[#ccff00]/40 flex-shrink-0" />
                              <span className="text-xs font-bold truncate">{file.name}</span>
                            </div>
                            <button 
                              onClick={() => removeFile(idx)}
                              className="p-1 hover:bg-red-500/20 text-white/20 hover:text-red-500 rounded-md transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>

                      {importFiles.length > 0 && (
                        <button
                          onClick={handleProcessImport}
                          disabled={isProcessing}
                          className="w-full py-2 bg-[#ccff00] text-black rounded-md font-black uppercase tracking-widest transition-all hover:shadow-[0_0_20px_rgba(204,255,0,0.4)] flex items-center justify-center gap-2 text-xs"
                        >
                          {isProcessing ? (
                            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              Processar e Mesclar
                            </>
                          )}
                        </button>
                      )}

                      {importError && (
                        <div className="p-4 bg-red-500/10 text-red-500 rounded-lg text-sm flex items-center gap-2 border border-red-500/20">
                          <AlertCircle className="w-4 h-4" />
                          {importError}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="bg-[#111] border border-white/5 p-6 rounded-xl shadow-2xl">
                    <h3 className="text-xs font-black text-white/40 uppercase tracking-[0.2em] mb-4">Requisitos do CSV</h3>
                    <ul className="space-y-3 text-sm text-white/60">
                      <li className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#ccff00] mt-1.5 flex-shrink-0 shadow-[0_0_5px_#ccff00]" />
                        <span>Deve conter as colunas <b className="text-[#ccff00]">username</b> e <b className="text-[#ccff00]">nome_completo</b>.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#ccff00] mt-1.5 flex-shrink-0 shadow-[0_0_5px_#ccff00]" />
                        <span>Duplicatas são removidas automaticamente pelo <b className="text-[#ccff00]">username</b>.</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Results Section */}
                <div className="lg:col-span-7">
                  <AnimatePresence mode="wait">
                    {importResult ? (
                      <motion.div
                        key="results"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="space-y-6"
                      >
                        {/* Metrics Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-[#111] border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-white/10 group-hover:bg-[#ccff00] transition-colors" />
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Total Importado</p>
                            <p className="text-4xl font-black text-white">{importResult.totalInitial}</p>
                            <div className="mt-3 space-y-1">
                              {importResult.fileStats.map((stat, i) => (
                                <p key={i} className="text-xs text-white/60 truncate font-mono uppercase whitespace-nowrap">
                                  {stat.name.replace(/Seguidores/gi, 'Seguid.').replace(/\.csv$/i, '')}: {stat.count}
                                </p>
                              ))}
                            </div>
                          </div>
                          <div className="bg-[#111] border border-[#ccff00]/20 rounded-xl p-6 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-[#ccff00]/40 group-hover:bg-[#ccff00] transition-colors" />
                            <p className="text-[10px] font-black text-[#ccff00]/60 uppercase tracking-widest mb-1">Usuários Únicos</p>
                            <p className="text-4xl font-black text-[#ccff00]">{importResult.totalUnique}</p>
                            <p className="text-xs text-[#ccff00]/60 mt-3 font-mono uppercase tracking-tighter whitespace-nowrap">Lista mestre finalizada</p>
                          </div>
                          <div className="bg-[#111] border border-red-500/20 rounded-xl p-6 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-red-500/40 group-hover:bg-red-500 transition-colors" />
                            <p className="text-[10px] font-black text-red-500/60 uppercase tracking-widest mb-1">Duplicatas Removidas</p>
                            <p className="text-4xl font-black text-red-500">{importResult.totalDuplicates}</p>
                            <p className="text-xs text-red-500/60 mt-3 font-mono uppercase tracking-tighter whitespace-nowrap">Entradas repetidas descartadas</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="bg-[#111] border border-white/5 rounded-xl p-6 shadow-2xl">
                          <div className="flex flex-col sm:flex-row gap-3">
                            <button
                              onClick={handleConfirmImport}
                              disabled={isSaving}
                              className="flex-1 py-3 bg-[#ccff00] text-black rounded-lg font-black uppercase tracking-[0.2em] text-xs hover:shadow-[0_0_30px_rgba(204,255,0,0.4)] transition-all flex items-center justify-center gap-2"
                            >
                              {isSaving ? (
                                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 className="w-4 h-4" />
                                  Confirmar e Salvar no Banco
                                </>
                              )}
                            </button>
                            <button
                              onClick={handleCancelImport}
                              disabled={isSaving}
                              className="px-6 py-3 bg-white/5 text-white/40 rounded-lg font-black uppercase tracking-[0.2em] text-xs hover:bg-white/10 hover:text-white transition-all border border-white/10"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>

                        <div className="bg-emerald-500/10 p-4 rounded-xl flex items-start gap-3 border border-emerald-500/20">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                          <div>
                            <p className="text-sm font-black text-emerald-400 uppercase tracking-widest">Processamento concluído!</p>
                            <p className="text-xs text-emerald-500/60 font-mono">Os dados foram mesclados e {importResult.totalDuplicates} duplicatas foram removidas.</p>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="h-full min-h-[400px] bg-[#111] rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center p-8">
                        <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center mb-4 border border-white/5">
                          <FileText className="w-8 h-8 text-white/10" />
                        </div>
                        <h3 className="text-lg font-black text-white/20 uppercase tracking-widest">Aguardando arquivos</h3>
                        <p className="text-sm text-white/10 max-w-xs mt-2">
                          Faça o upload de até cinco arquivos CSV para iniciar o processamento e ver as métricas.
                        </p>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Impact Modal (Card de Identificação) */}
      <AnimatePresence>
        {selectedCustomer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 30 }}
              className="w-full max-w-lg bg-[#111] border border-[#ccff00]/30 p-5 rounded-2xl text-center space-y-4 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-[#ccff00]/50" />

              <div className="flex flex-col items-center justify-center space-y-0">
                <motion.h1 
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring' }}
                  className={cn(
                    "font-black leading-none drop-shadow-[0_0_20px_rgba(204,255,0,0.25)] -mt-2 md:-mt-3",
                    selectedCustomer.bloqueada 
                      ? "text-[50px] md:text-[80px] text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.25)] uppercase tracking-tighter" 
                      : "text-[60px] md:text-[110px] text-[#ccff00]"
                  )}
                >
                  {selectedCustomer.bloqueada ? 'Bloqueada' : (selectedCustomer.codigo_cliente || '')}
                </motion.h1>

                <div className="space-y-0.5 -mt-3 md:-mt-5">
                  <div className="text-xl md:text-3xl font-black text-white leading-tight">{selectedCustomer.username}</div>
                  {selectedCustomer.nome_completo === 'Novo Cliente' ? (
                    <div className="space-y-1 max-w-sm mx-auto mt-1 mb-1">
                      <input
                        type="text"
                        placeholder="Digite o nome completo..."
                        value={editingName}
                        onChange={(e) => setEditingName(capitalizeWords(e.target.value))}
                        onFocus={(e) => {
                          const defaultName = selectedCustomer.username.replace(/^@/, '').replace(/^"/, '').split(',')[0].trim();
                          if (e.target.value === defaultName) {
                            setEditingName('');
                          }
                        }}
                        onBlur={(e) => {
                           if (e.target.value.trim() === '') {
                               const defaultName = selectedCustomer.username.replace(/^@/, '').replace(/^"/, '').split(',')[0].trim();
                               setEditingName(defaultName);
                           }
                        }}
                        className="w-full px-3 py-1.5 bg-black/50 border border-[#ccff00]/30 rounded-xl text-white placeholder-white/20 focus:border-[#ccff00] focus:ring-1 focus:ring-[#ccff00] outline-none text-center text-sm font-bold"
                        autoFocus
                      />
                      <div className="text-[9px] font-black text-[#ccff00]/40 uppercase tracking-[0.2em] mt-0.5">NOME COMPLETO</div>
                    </div>
                  ) : (
                    <div className="text-xs text-white/40 uppercase tracking-widest font-mono">
                      {selectedCustomer.nome_completo}
                    </div>
                  )}
                </div>
              </div>

              {!selectedCustomer.bloqueada && (
                <div className="flex flex-col items-center gap-1.5 py-3 bg-white/5 border border-white/5 rounded-xl px-4 max-w-xs mx-auto">
                  <div className="text-[13px] font-black text-[#ccff00]/60 uppercase tracking-[0.15em] font-mono">
                    Quantidade de peças
                  </div>
                  <div className="flex items-center gap-4 w-full justify-between">
                    <button
                      type="button"
                      onClick={() => setConfirmQty(prev => Math.max(1, prev - 1))}
                      className="w-9 h-9 bg-white/5 hover:bg-white/10 active:bg-white/20 rounded-lg text-white font-black text-lg flex items-center justify-center transition-all select-none border border-white/10"
                    >
                      -
                    </button>
                    <span className="text-[#ccff00] text-2xl font-black text-center min-w-[50px] font-mono">
                      {confirmQty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmQty(prev => prev + 1)}
                      className="w-9 h-9 bg-white/5 hover:bg-white/10 active:bg-white/20 rounded-lg text-white font-black text-lg flex items-center justify-center transition-all select-none border border-white/10"
                    >
                      +
                    </button>
                  </div>
                  {/* Quick selection chips */}
                  <div className="flex items-center gap-1.5 mt-1">
                    {[1, 2, 3, 5, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setConfirmQty(num)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm font-black transition-all border",
                          confirmQty === num 
                            ? "bg-[#ccff00]/10 border-[#ccff00] text-[#ccff00]" 
                            : "bg-transparent border-white/5 text-white/50 hover:border-white/10 hover:text-white"
                        )}
                      >
                        {num}x
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                {!selectedCustomer.bloqueada && (
                  <button
                    onClick={confirmPurchase}
                    className="w-full sm:w-auto px-6 py-2.5 bg-[#ccff00] text-black font-black text-sm rounded-lg hover:shadow-[0_0_20px_rgba(204,255,0,0.4)] transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
                  >
                    CONFIRMAR COMPRA <CheckCircle2 className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="w-full sm:w-auto px-6 py-2.5 bg-white/5 text-white/40 font-black text-sm rounded-lg hover:bg-white/10 hover:text-white transition-all border border-white/10 uppercase tracking-wider"
                >
                  <span>{selectedCustomer.bloqueada ? 'FECHAR E CONTINUAR' : 'CANCELAR'}</span>
                </button>
              </div>
            </motion.div>

            {/* Background Decorative Elements */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden opacity-20">
              <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#ccff00] blur-[150px] rounded-full" />
              <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#ccff00] blur-[150px] rounded-full" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-2xl bg-[#111] border border-[#ccff00]/30 p-6 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] relative flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Settings className="text-[#ccff00] w-6 h-6" />
                  <h2 className="text-xl font-black tracking-tight uppercase">Configurações</h2>
                </div>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-[#ccff00] uppercase tracking-widest border-b border-white/10 pb-2">Template de Mensagem</h3>
                  <div className="bg-[#ccff00]/10 border border-[#ccff00]/20 p-4 rounded-lg text-sm text-[#ccff00]/80 space-y-2">
                    <p className="font-bold uppercase tracking-widest text-[10px]">Tags Disponíveis:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li><code className="bg-black/50 px-1 py-0.5 rounded text-[#ccff00] font-mono">{'{{saudacao}}'}</code> - Bom dia, Boa tarde ou Boa noite</li>
                      <li><code className="bg-black/50 px-1 py-0.5 rounded text-[#ccff00] font-mono">{'{{nome}}'}</code> - Primeiro nome da cliente</li>
                      <li><code className="bg-black/50 px-1 py-0.5 rounded text-[#ccff00] font-mono">{'{{total}}'}</code> - Valor total da sacola</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Editor de Mensagem</label>
                    <textarea
                      value={messageTemplate}
                      onChange={(e) => saveTemplate(e.target.value)}
                      className="w-full h-48 bg-black border border-white/10 focus:border-[#ccff00] p-4 rounded-lg outline-none text-sm font-medium resize-none custom-scrollbar"
                      placeholder="Digite sua mensagem aqui..."
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-black text-[#58a6ff] uppercase tracking-widest border-b border-white/10 pb-2 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Banco de Dados & Integrações
                  </h3>
                  <div className="bg-[#58a6ff]/10 border border-[#58a6ff]/20 p-4 rounded-lg space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-[#58a6ff] uppercase">Estoque (produtos)</h4>
                      <p className="text-xs text-white/60 mt-1">
                        Gerencie os produtos no banco de dados Supabase (compartilhado com o Consignado de Lingeries).
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <div className="relative flex-1">
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleImportProductsCSV}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          title="Importar Estoque (CSV)"
                        />
                        <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/50 font-black text-xs uppercase tracking-widest rounded transition-all hover:bg-[#58a6ff] hover:text-black">
                          <Upload className="w-4 h-4" />
                          Importar Estoque (CSV)
                        </button>
                      </div>
                      <button
                        onClick={handleExportProductsCSV}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/5 text-white/60 border border-white/10 font-black text-xs uppercase tracking-widest rounded transition-all hover:bg-white/10 hover:text-white"
                      >
                        <Download className="w-4 h-4" />
                        Exportar Base Atual
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-black text-red-500 uppercase tracking-widest border-b border-white/10 pb-2">Zona de Perigo</h3>
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-bold text-red-500 uppercase">Limpar Dados de Simulação</h4>
                        <p className="text-xs text-white/60 mt-1">
                          Esta ação irá apagar <strong>TODOS</strong> os dados do Supabase (histórico, vendas e itens) e limpar o armazenamento local. A lista de clientes será preservada.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setIsDangerModalOpen(true);
                        setDangerInput('');
                        setIsSettingsOpen(false);
                      }}
                      className="w-full px-4 py-2 bg-red-500/20 text-red-500 border border-red-500/50 font-black text-xs uppercase tracking-widest rounded hover:bg-red-500 hover:text-white transition-all"
                    >
                      Limpar Sistema Completo
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-6 py-2.5 bg-[#ccff00] text-black font-black text-sm uppercase tracking-widest rounded-lg hover:shadow-[0_0_20px_rgba(204,255,0,0.4)] transition-all flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Salvar e Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {isHistoryOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-4xl bg-[#111] border border-[#ccff00]/30 p-6 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] relative flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <History className="text-[#ccff00] w-6 h-6" />
                  <h2 className="text-xl font-black tracking-tight uppercase">Histórico de Lives</h2>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setIsAddingManualLive(!isAddingManualLive)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#ccff00]/10 text-[#ccff00] border border-[#ccff00]/30 rounded-md font-bold text-xs uppercase hover:bg-[#ccff00]/20 transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Adicionar Registro Manual
                  </button>
                  <button 
                    onClick={() => setIsHistoryOpen(false)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                {isAddingManualLive && (
                  <div className="bg-black/50 border border-[#ccff00]/30 p-4 rounded-lg mb-4">
                    <h3 className="text-sm font-black text-[#ccff00] uppercase tracking-widest mb-3">Novo Registro Manual</h3>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Data da Live</label>
                        <input
                          type="date"
                          value={manualLiveDate}
                          onChange={(e) => setManualLiveDate(e.target.value)}
                          className="w-full bg-[#222] border border-white/10 focus:border-[#ccff00] focus:bg-black p-2 rounded-md outline-none text-sm font-bold text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Qtd Sacolas</label>
                        <input
                          type="number"
                          value={manualLiveQtdSacolas}
                          onChange={(e) => setManualLiveQtdSacolas(e.target.value)}
                          className="w-full bg-[#222] border border-white/10 focus:border-[#ccff00] focus:bg-black p-2 rounded-md outline-none text-sm font-bold text-white"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Valor Total (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={manualLiveValue}
                          onChange={(e) => setManualLiveValue(e.target.value)}
                          className="w-full bg-[#222] border border-white/10 focus:border-[#ccff00] focus:bg-black p-2 rounded-md outline-none text-sm font-bold text-[#ccff00]"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Observações</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={manualLiveObs}
                            onChange={(e) => setManualLiveObs(e.target.value)}
                            className="flex-1 bg-[#222] border border-white/10 focus:border-[#ccff00] focus:bg-black p-2 rounded-md outline-none text-sm font-medium text-white"
                            placeholder="Anotações sobre a live..."
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveManualLive()}
                          />
                          <button
                            onClick={handleSaveManualLive}
                            disabled={!manualLiveDate || !manualLiveValue}
                            className="px-4 py-2 bg-[#ccff00] text-black font-black text-xs uppercase rounded-md hover:bg-[#ccff00]/80 disabled:opacity-50 transition-colors"
                          >
                            Salvar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {isFetchingHistory ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-[#ccff00]/30 border-t-[#ccff00] rounded-full animate-spin" />
                  </div>
                ) : historyData.length === 0 ? (
                  <div className="text-center py-12 text-white/40 font-mono text-sm">
                    Nenhum histórico encontrado.
                  </div>
                ) : (
                  <div className="bg-black/50 border border-white/10 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/5 border-b border-white/10 text-[10px] font-black text-white/40 uppercase tracking-widest">
                          <th className="px-4 py-3 w-32">Data</th>
                          <th className="px-4 py-3 w-32">Dia da Semana</th>
                          <th className="px-4 py-3 w-24 text-center">Sacolas</th>
                          <th className="px-4 py-3 w-32">Valor Total</th>
                          <th className="px-4 py-3">Observações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {historyData.map((live: any) => (
                          <tr key={live.id} className="hover:bg-white/5 transition-colors group">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-[#ccff00]/60" />
                                <span className="text-sm font-bold text-white">
                                  {safeFormatDate(live.data_live)}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-white/70 capitalize">
                                {live.dia_semana || '---'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-sm font-bold text-white">
                                {live.qtd_sacolas || 0}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm font-black text-[#ccff00]">
                                R$ {Number(live.valor_total || 0).toFixed(2)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {editingLiveId === live.id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingLiveObs}
                                    onChange={(e) => setEditingLiveObs(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveLiveObs(live.id)}
                                    className="flex-1 bg-black border border-[#ccff00]/50 p-1.5 rounded outline-none text-sm text-white"
                                  />
                                  <button
                                    onClick={() => handleSaveLiveObs(live.id)}
                                    className="p-1.5 bg-[#ccff00]/20 text-[#ccff00] rounded hover:bg-[#ccff00]/40 transition-colors"
                                  >
                                    <Save className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingLiveId(null)}
                                    className="p-1.5 bg-red-500/20 text-red-500 rounded hover:bg-red-500/40 transition-colors"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between group/obs">
                                  <span className="text-sm text-white/70">
                                    {live.observacoes || <span className="text-white/20 italic">Sem observações</span>}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setEditingLiveId(live.id);
                                      setEditingLiveObs(live.observacoes || '');
                                    }}
                                    className="p-1.5 text-white/20 hover:text-[#ccff00] opacity-0 group-hover/obs:opacity-100 transition-all"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Focus Mode Modal */}
      <AnimatePresence>
        {isFocusModeOpen && focusQueue.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-3xl bg-[#111] border border-[#ccff00]/30 p-8 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] relative flex flex-col max-h-[90vh]"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-[#ccff00]/50" />
              
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Play className="text-[#ccff00] w-6 h-6" />
                  <h2 className="text-xl font-black tracking-tight uppercase">Modo Foco: Disparo em Massa</h2>
                </div>
                <div className="bg-[#ccff00]/10 px-3 py-1 rounded-full border border-[#ccff00]/20 text-[#ccff00] font-black text-xs uppercase tracking-widest">
                  Cliente {currentFocusIndex + 1} de {focusQueue.length}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
                <div className="bg-black/50 border border-white/5 p-6 rounded-xl text-center space-y-2">
                  <div className="text-3xl font-black text-white">{focusQueue[currentFocusIndex].username}</div>
                  <div className="text-sm text-[#ccff00] uppercase tracking-widest font-mono">{focusQueue[currentFocusIndex].nome_completo}</div>
                  <div className="text-xs text-white/40 uppercase tracking-widest mt-2">
                    Total: R$ {focusQueue[currentFocusIndex].total.toFixed(2)} • {focusQueue[currentFocusIndex].items.length} Itens
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Pré-visualização da Mensagem</label>
                  <div className="w-full bg-black border border-white/10 p-4 rounded-lg text-sm font-medium text-white/80 whitespace-pre-wrap">
                    {generateMessageText(focusQueue[currentFocusIndex].nome_completo, focusQueue[currentFocusIndex].total)}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                {focusQueue[currentFocusIndex].telefone ? (
                  <button
                    onClick={handleFocusSendWhatsApp}
                    autoFocus
                    className="flex-1 py-4 bg-green-500 text-black font-black text-sm uppercase tracking-widest rounded-xl hover:shadow-[0_0_30px_rgba(34,197,94,0.4)] transition-all flex items-center justify-center gap-3"
                  >
                    <MessageCircle className="w-5 h-5" />
                    Enviar via WhatsApp
                  </button>
                ) : (
                  <button
                    onClick={handleFocusSendInstagram}
                    autoFocus
                    className="flex-1 py-4 bg-[#ccff00] text-black font-black text-sm uppercase tracking-widest rounded-xl hover:shadow-[0_0_30px_rgba(204,255,0,0.4)] transition-all flex items-center justify-center gap-3"
                  >
                    <Instagram className="w-5 h-5" />
                    Enviar via Instagram
                  </button>
                )}
                <button
                  onClick={handleFocusNext}
                  className="px-8 py-4 bg-white/5 text-white/40 font-black text-sm uppercase tracking-widest rounded-xl hover:bg-white/10 hover:text-white transition-all border border-white/10 flex items-center justify-center gap-2"
                >
                  Pular <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              
              <button 
                onClick={() => setIsFocusModeOpen(false)}
                className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context Menu Overlay */}
      {contextMenu?.visible && (
        <div 
          className="fixed inset-0 z-[100]" 
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        >
          <div 
            className="absolute bg-[#111] border border-white/10 rounded-lg shadow-2xl overflow-hidden min-w-[180px] py-1"
            style={{ 
              top: Math.min(contextMenu.y, window.innerHeight - 100), 
              left: Math.min(contextMenu.x, window.innerWidth - 200) 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => {
                setDeleteModal({ visible: true, customerId: contextMenu.customerId });
                setContextMenu(null);
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-3 transition-colors font-bold"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Sacola
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Guardrail) */}
      <AnimatePresence>
        {deleteModal?.visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111] border border-red-500/30 rounded-xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-3 text-red-500 mb-4">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-lg font-black uppercase tracking-widest">Excluir Sacola?</h3>
              </div>
              <p className="text-white/70 text-sm mb-6 leading-relaxed">
                Tem certeza que deseja excluir esta sacola? Todos os itens lançados para este cliente serão removidos. <strong className="text-white">Esta ação não pode ser desfeita.</strong>
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteModal(null)}
                  className="px-4 py-2 rounded-md text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm font-bold"
                >
                  CANCELAR
                </button>
                <button
                  onClick={() => {
                    if (deleteModal.customerId) {
                      removeGroup(deleteModal.customerId);
                    }
                  }}
                  autoFocus
                  className="px-4 py-2 rounded-md bg-red-500 text-white font-black text-sm hover:bg-red-600 transition-colors shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                >
                  SIM, EXCLUIR
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Block Confirmation Modal */}
      <AnimatePresence>
        {blockModal.visible && blockModal.customer && (
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
              className="bg-[#111] border border-red-500/30 rounded-xl p-6 w-full max-w-md shadow-[0_0_50px_rgba(239,68,68,0.15)]"
            >
              <div className="flex items-center gap-3 text-red-500 mb-4">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="font-black text-lg tracking-tight uppercase">
                  <span>{blockModal.customer.bloqueada ? 'Desbloquear Cliente?' : 'Bloquear Cliente?'}</span>
                </h3>
              </div>
              <p className="text-white/60 text-sm mb-6 text-center">
                <span>{blockModal.customer.bloqueada 
                  ? `Deseja realmente DESBLOQUEAR a cliente ${blockModal.customer.nome_completo || blockModal.customer.username}?`
                  : `Deseja realmente BLOQUEAR a cliente ${blockModal.customer.nome_completo || blockModal.customer.username}? Ela não poderá fazer novas compras na live.`
                }</span>
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setBlockModal({ visible: false, customer: null })}
                  className="px-4 py-2 rounded-md font-bold text-sm text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                >
                  CANCELAR
                </button>
                <button
                  onClick={confirmBlockCustomer}
                  autoFocus
                  className={cn("px-4 py-2 rounded-md text-white font-black text-sm transition-colors",
                    blockModal.customer.bloqueada ? "bg-emerald-500 hover:bg-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "bg-red-500 hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                  )}
                >
                  <span>{blockModal.customer.bloqueada ? 'SIM, DESBLOQUEAR' : 'SIM, BLOQUEAR'}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Single Purchase Confirmation Modal (Guardrail) */}
      <AnimatePresence>
        {deletePurchaseModal?.visible && deletePurchaseModal.purchase && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[125] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111] border border-red-500/30 rounded-xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-3 text-red-500 mb-4">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-lg font-black uppercase tracking-widest">Excluir Lançamento?</h3>
              </div>
              <p className="text-white/70 text-sm mb-6 leading-relaxed">
                Tem certeza que deseja excluir o lançamento de <strong className="text-[#ccff00]">{deletePurchaseModal.purchase.quantity}x {deletePurchaseModal.purchase.reference}</strong>? 
                {customersMap.get(String(deletePurchaseModal.purchase.customerId)) && (
                  <span>
                    {" "}Este item pertence à cliente <strong className="text-[#00ffff]">{customersMap.get(String(deletePurchaseModal.purchase.customerId))?.username?.replace(/^@/, '') || customersMap.get(String(deletePurchaseModal.purchase.customerId))?.nome_completo}</strong>.
                  </span>
                )}
                {" "}<span className="text-red-400 font-bold">Esta ação não pode ser desfeita.</span>
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeletePurchaseModal({ visible: false, purchase: null })}
                  className="px-4 py-2 rounded-md text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm font-bold"
                >
                  CANCELAR
                </button>
                <button
                  onClick={async () => {
                    const p = deletePurchaseModal.purchase;
                    if (!p) return;
                    
                    if (supabase) {
                      try {
                        const { error } = await supabase
                          .from('live_vendas_itens')
                          .delete()
                          .eq('id', p.id);
                        if (error) {
                          console.error('Error deleting from supabase:', error);
                          showToast('⚠️ Erro ao excluir do banco de dados!');
                          setDeletePurchaseModal({ visible: false, purchase: null });
                          return;
                        }
                      } catch (err) {
                        console.error('Catch error deleting from supabase:', err);
                        showToast('⚠️ Erro ao excluir do banco de dados!');
                        setDeletePurchaseModal({ visible: false, purchase: null });
                        return;
                      }
                    }
                    setPurchases(prev => prev.filter(x => String(x.id) !== String(p.id)));
                    if (purchases.length === 1) setShowRecentPurchases(false);
                    showToast(`🗑️ Lançamento de ${p.quantity}x ${p.reference} excluído!`);
                    setDeletePurchaseModal({ visible: false, purchase: null });
                  }}
                  autoFocus
                  className="px-4 py-2 rounded-md bg-red-500 text-white font-black text-sm hover:bg-red-600 transition-colors shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                >
                  SIM, EXCLUIR
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-[#1e1e1e] border border-white/10 p-6 rounded-lg shadow-xl relative flex flex-col"
            >
              <h3 className="text-lg font-semibold text-white mb-2">{confirmAction.title}</h3>
              <p className="text-white/70 text-sm mb-6">{confirmAction.message}</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="px-4 py-2 bg-transparent text-white/70 font-medium text-sm rounded hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    handleFinalizarAcerto(confirmAction.type);
                    setConfirmAction(null);
                  }}
                  autoFocus
                  className="px-4 py-2 bg-white text-black font-medium text-sm rounded hover:bg-gray-200 transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GitHub-style Danger Zone Modal */}
      <AnimatePresence>
        {isDangerModalOpen && (
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
              className="w-full max-w-md bg-[#0d1117] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-[#30363d] bg-[#161b22]">
                <h3 className="text-sm font-semibold text-white">Excluir todos os dados do sistema</h3>
                <button
                  onClick={() => setIsDangerModalOpen(false)}
                  className="text-[#8b949e] hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div className="bg-[#ffebe9] text-[#cf222e] p-3 rounded-md text-sm border border-[#ff8182]/40 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>
                    <strong>Aviso inesperado:</strong> Isso apagará permanentemente todos os clientes, vendas, sacolas e histórico de lives. Esta ação <strong>não pode</strong> ser desfeita.
                  </p>
                </div>
                
                <div className="text-sm text-[#c9d1d9] space-y-2">
                  <p>Por favor, digite <strong className="text-white select-all">{expectedDangerText}</strong> para confirmar.</p>
                  <input
                    type="text"
                    value={dangerInput}
                    onChange={(e) => setDangerInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && dangerInput === expectedDangerText) {
                        handleClearAllData();
                        setIsDangerModalOpen(false);
                        setDangerInput('');
                      }
                    }}
                    className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] rounded-md p-2 text-white outline-none transition-all font-mono text-sm"
                  />
                </div>

                <button
                  disabled={dangerInput !== expectedDangerText}
                  onClick={() => {
                    handleClearAllData();
                    setIsDangerModalOpen(false);
                    setDangerInput('');
                  }}
                  className="w-full py-2 rounded-md font-semibold text-sm transition-all disabled:bg-[#21262d] disabled:text-[#8b949e] disabled:border-[#30363d] disabled:cursor-not-allowed bg-[#da3633] text-white hover:bg-[#b62324] border border-[#f85149]/50"
                >
                  Quero excluir este sistema.
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmação de Referência Modal */}
      <AnimatePresence>
        {pendingRefValidation && (
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
              className="w-full max-w-sm bg-[#1e1e1e] border border-white/10 p-6 rounded-lg shadow-xl relative flex flex-col"
            >
              <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-500" />
                Atenção
              </h3>
              <p className="text-white/70 text-sm mb-6">
                O produto "<strong className="text-white">{pendingRefValidation.ref}</strong>" não consta no estoque. Deseja adicionar à venda mesmo assim?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelInvalidRefModal}
                  className="px-4 py-2 bg-transparent text-white/70 font-medium text-sm rounded hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmInvalidRefModal}
                  autoFocus
                  className="px-4 py-2 bg-[#ccff00] text-black font-medium text-sm rounded hover:bg-[#b3e600] border border-[#ccff00]/50 transition-colors shadow-[0_0_15px_rgba(204,255,0,0.2)]"
                >
                  Sim, Continuar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product Import Modal */}
      <AnimatePresence>
        {productImportModal && (
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
              className="w-full max-w-lg bg-[#111] border border-[#58a6ff]/30 p-6 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] relative flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center gap-3 mb-6">
                <Database className="text-[#58a6ff] w-6 h-6" />
                <h3 className="text-xl font-black text-white uppercase tracking-tight">Confirmar Importação</h3>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                <div className="bg-[#1a1a1a] p-4 rounded-xl border border-white/5 space-y-2">
                  <p className="text-sm text-white/70">
                    Arquivo: <strong className="text-white">{productImportModal.filename}</strong>
                  </p>
                  <p className="text-sm text-white/70">
                    Produtos Encontrados: <strong className="text-[#58a6ff] text-lg">{productImportModal.count}</strong>
                  </p>
                </div>

                {productImportModal.warnings.length > 0 && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl space-y-3">
                    <h4 className="text-sm font-bold text-yellow-500 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Alertas no Arquivo
                    </h4>
                    <ul className="list-disc pl-5 text-xs text-yellow-500/80 space-y-1">
                      {productImportModal.warnings.map((warn, i) => (
                        <li key={i}><span>{warn}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <p className="text-xs text-white/40">
                  Estes dados serão injetados na tabela <code className="text-[#58a6ff]">produtos</code> do Supabase. 
                  Isso irá atualizar o estoque e preços. Produtos existentes com a mesma referência serão atualizados.
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  onClick={() => setProductImportModal(null)}
                  disabled={isImportingProducts}
                  className="px-6 py-2.5 bg-transparent text-white/60 font-black text-xs uppercase tracking-widest rounded transition-colors hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmProductCSVImport}
                  disabled={isImportingProducts}
                  className="px-6 py-2.5 bg-[#58a6ff] text-black font-black text-xs uppercase tracking-widest rounded flex items-center justify-center gap-2 transition-all hover:bg-[#79b8ff] disabled:opacity-50"
                >
                  {isImportingProducts ? (
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar Importação
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tooltip Overhead */}
      <AnimatePresence>
        {hoveredObs && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.15 }}
            className="fixed z-[999] pointer-events-none transform -translate-y-full pb-3 max-w-sm w-max"
            style={{ 
              top: hoveredObs.y,
              left: Math.min(hoveredObs.x, window.innerWidth - 300) 
            }}
          >
            <div className="bg-[#111]/95 backdrop-blur-md border border-[#ccff00]/50 text-white/90 text-[13px] leading-relaxed p-4 rounded-xl shadow-[0_10px_40px_-10px_rgba(204,255,0,0.3)] break-words whitespace-pre-wrap relative">
              {hoveredObs.text}
              <div className="absolute -bottom-1.5 left-6 w-3 h-3 bg-[#111] border-b border-r border-[#ccff00]/50 rotate-45"></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-[200] bg-[#2a2a2a] border border-white/10 text-white px-4 py-3 rounded shadow-lg text-sm font-medium flex items-center gap-2"
          >
            <div className="w-2 h-2 rounded-full bg-green-500" />
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
