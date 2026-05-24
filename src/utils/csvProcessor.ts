import Papa from 'papaparse';

export interface InstagramProfile {
  id?: number;
  username: string;
  nome_completo: string;
  photo_url?: string;
}

export interface FileStat {
  name: string;
  count: number;
}

export interface ProcessingResult {
  totalInitial: number;
  totalUnique: number;
  totalDuplicates: number;
  uniqueProfiles: InstagramProfile[];
  fileStats: FileStat[];
}

export const processCSVFiles = async (files: File[]): Promise<ProcessingResult> => {
  let allProfiles: InstagramProfile[] = [];
  const fileStats: FileStat[] = [];

  for (const file of files) {
    const text = await file.text();
    
    // Detect delimiter
    const firstLine = text.split('\n')[0];
    let delimiter = ',';
    if (firstLine.includes(';')) delimiter = ';';
    else if (firstLine.includes('\t')) delimiter = '\t';

    // Helper to clean strings
    const cleanStr = (str: any) => {
      if (str === null || str === undefined) return '';
      return String(str).trim();
    };

    // Parse CSV
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: 'greedy',
      delimiter: delimiter,
      // We don't use transformHeader because we want to handle variations manually
    });

    let profiles: InstagramProfile[] = [];

    if (result.meta.fields && result.meta.fields.length > 0) {
      const fields = result.meta.fields;
      
      // Find best matching columns
      const usernameKey = fields.find(f => /^(username|user|login|usuário|usuario)$/i.test(f.trim()));
      const fullNameKey = fields.find(f => /^(nome_completo|full_name|name|nome completo|full name|display name|nome)$/i.test(f.trim()));

      if (usernameKey) {
        profiles = (result.data as any[]).map(row => {
          const rawUsername = cleanStr(row[usernameKey]);
          const rawFullName = fullNameKey ? cleanStr(row[fullNameKey]) : '';
          
          return {
            username: rawUsername.replace(/^@/, '').toLowerCase(),
            nome_completo: rawFullName,
            photo_url: '',
          };
        }).filter(p => p.username.length > 0 && p.username.toLowerCase() !== 'username');
      }
    }

    // Fallback if header-based parsing failed
    if (profiles.length === 0) {
      const rawResult = Papa.parse(text, {
        header: false,
        skipEmptyLines: 'greedy',
        delimiter: delimiter,
      });

      const rows = rawResult.data as string[][];
      if (rows.length > 0) {
        // Try to find which column looks like a username (no spaces, reasonable length)
        const firstDataRow = rows[0];
        let usernameIdx = firstDataRow.findIndex(cell => {
          const c = cleanStr(cell);
          return c && !c.includes(' ') && c.length > 2 && c.length < 35 && !c.includes('http');
        });

        if (usernameIdx !== -1) {
          profiles = rows.map(r => {
            const uname = cleanStr(r[usernameIdx]);
            // Assume next column might be name if it's different
            const name = cleanStr(r[usernameIdx + 1]) || '';
            
            return {
              username: uname.replace(/^@/, '').toLowerCase(),
              nome_completo: name.includes('http') ? '' : name,
              photo_url: ''
            };
          }).filter(p => p.username.length > 0 && p.username.toLowerCase() !== 'username');
        }
      }
    }

    fileStats.push({ name: file.name, count: profiles.length });
    allProfiles = [...allProfiles, ...profiles];
  }

  const totalInitial = allProfiles.length;
  const uniqueMap = new Map<string, InstagramProfile>();
  let duplicatesCount = 0;

  allProfiles.forEach(profile => {
    const key = profile.username.toLowerCase();
    if (uniqueMap.has(key)) {
      duplicatesCount++;
    } else {
      uniqueMap.set(key, profile);
    }
  });

  const uniqueProfiles = Array.from(uniqueMap.values());

  return {
    totalInitial,
    totalUnique: uniqueProfiles.length,
    totalDuplicates: duplicatesCount,
    uniqueProfiles,
    fileStats,
  };
};

export const downloadCSV = (profiles: InstagramProfile[]) => {
  const csv = Papa.unparse(profiles);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `unique_profiles_${new Date().getTime()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const processProductsCSV = async (file: File): Promise<{ products: any[], warnings: string[], count: number }> => {
  const text = await file.text();
  
  let delimiter = ',';
  const firstLine = text.split('\n')[0];
  if (firstLine.includes(';')) delimiter = ';';
  else if (firstLine.includes('\t')) delimiter = '\t';

  const parseCurrency = (val: string): number => {
    if (!val) return 0;
    const cleaned = val.toString().replace(/R\$/g, '').replace(/,/g, '.').replace(/\s/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
  };

  const parsePercentage = (val: string): number => {
    if (!val) return 0;
    const cleaned = val.toString().replace(/%/g, '').replace(/,/g, '.').replace(/\s/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
  };

  const parseIntSafe = (val: string): number => {
    if (!val) return 0;
    const parsed = parseInt(val.toString().trim(), 10);
    return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
  };

  const cleanStr = (val: any) => {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  };

  return new Promise((resolve) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: 'greedy',
      delimiter: delimiter,
      complete: (result) => {
        const warnings: string[] = [];
        let validProductsCount = 0;

        const fields = result.meta.fields || [];
        
        // Find best matching columns based on common names
        const refKey = fields.find(f => /^(ref|referencia|ref\.|id)$/i.test(f.trim()));
        const descKey = fields.find(f => /^(descricao|descrição|produto|nome)$/i.test(f.trim()));
        const precoKey = fields.find(f => /^(preco_venda|preco|preço|valor|venda)$/i.test(f.trim()));
        const estoqueKey = fields.find(f => /^(estoque_atual|estoque|quantidade|qtd)$/i.test(f.trim()));
        const fornecedorKey = fields.find(f => /^(fornecedor|marca)$/i.test(f.trim()));
        const custoKey = fields.find(f => /^(custo|valor de custo|preço de custo)$/i.test(f.trim()));
        const lucroKey = fields.find(f => /^(lucro)$/i.test(f.trim()));
        const lucropKey = fields.find(f => /^(lucro%|lucro_percentual|margem)$/i.test(f.trim()));

        if (!refKey) {
          warnings.push("Coluna de referência (ref) não encontrada no CSV.");
          resolve({ products: [], warnings, count: 0 });
          return;
        }

        const products = (result.data as any[]).map((row, idx) => {
          const rawRef = cleanStr(row[refKey]);
          if (!rawRef) return null; // Ignora linhas em branco ou erro

          // Parse values
          const rawPrice = precoKey ? row[precoKey] : '0';
          const rawEstoque = estoqueKey ? row[estoqueKey] : '0';
          const rawCusto = custoKey ? row[custoKey] : '0';
          const rawLucro = lucroKey ? row[lucroKey] : '0';
          const rawLucrop = lucropKey ? row[lucropKey] : '0';

          const preco = parseCurrency(rawPrice);
          const estoque = parseIntSafe(rawEstoque);
          const custo = parseCurrency(rawCusto);
          const lucro = parseCurrency(rawLucro);
          const lucro_percentual = parsePercentage(rawLucrop);
          const descricao = descKey ? cleanStr(row[descKey]) : '';
          const fornecedor = fornecedorKey ? cleanStr(row[fornecedorKey]) : '';

          // Validate broken data #VALUE! / #DIV/0!
          if (String(rawCusto).includes('#') || String(rawLucro).includes('#')) {
             warnings.push(`Linha com ref "${rawRef}": Alguns valores estavam corrompidos (ex: #VALUE!) e foram zerados.`);
          }

          validProductsCount++;

          return {
            referencia: rawRef,
            descricao,
            preco_venda: preco,
            estoque_atual: estoque,
            fornecedor,
            custo,
            lucro,
            lucro_percentual,
            data_cadastro: new Date().toISOString()
          };
        }).filter(p => p !== null);

        resolve({ products, warnings: Array.from(new Set(warnings)), count: validProductsCount });
      },
      error: (err) => {
        resolve({ products: [], warnings: [err.message], count: 0 });
      }
    });
  });
};

export const downloadProductsCSV = (products: any[]) => {
  const formattedProducts = products.map(p => ({
    'ref.': p.referencia || '',
    'descricao': p.descricao || '',
    'valor': p.preco_venda ? `R$ ${p.preco_venda.toFixed(2)}` : '0',
    'qtd': p.estoque_atual || 0,
    'Fornecedor': p.fornecedor || '',
    'custo': p.custo ? `R$ ${p.custo.toFixed(2)}` : '0',
    'lucro': p.lucro ? `R$ ${p.lucro.toFixed(2)}` : '0',
    'lucro%': p.lucro_percentual ? `${p.lucro_percentual}%` : '0%'
  }));

  const csv = Papa.unparse(formattedProducts);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `estoque_produtos_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

