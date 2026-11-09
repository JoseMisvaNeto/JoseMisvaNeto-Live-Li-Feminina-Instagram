import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIndex,
  searchProdutos,
  type ProdutoPesquisavel,
} from '../src/utils/productSearch';

const produto = (
  referencia: string,
  extras: Partial<ProdutoPesquisavel> = {}
): ProdutoPesquisavel => ({
  referencia,
  descricao: `Produto ${referencia}`,
  preco_venda: 0,
  custo: 0,
  lucro: 0,
  ...extras,
});

const refs = (lista: ProdutoPesquisavel[], query: string) =>
  searchProdutos(buildIndex(lista), query).map((p) => p.referencia);

test('referência exata aparece primeiro mesmo estando no fim da lista', () => {
  // Simula o bug original: "4" cadastrada depois de várias "4x"
  const lista = [
    produto('42'),
    produto('44'),
    produto('400'),
    produto('444'),
    produto('14'),
    produto('24'),
    produto('4'), // exata, mas última na ordem original
  ];

  assert.deepEqual(refs(lista, '4'), ['4', '42', '44', '400', '444', '14', '24']);
});

test('prefixos vêm em ordem numérica natural após a referência exata', () => {
  const lista = [produto('444'), produto('400'), produto('42'), produto('40'), produto('4')];

  assert.deepEqual(refs(lista, '4'), ['4', '40', '42', '400', '444']);
});

test('referência numérica igual ("04") fica logo atrás da exata', () => {
  const lista = [produto('40'), produto('04'), produto('4')];

  assert.deepEqual(refs(lista, '4'), ['4', '04', '40']);
});

test('referências que apenas contêm a busca vêm depois das de prefixo', () => {
  const lista = [produto('A4B'), produto('14'), produto('49'), produto('4')];

  assert.deepEqual(refs(lista, '4'), ['4', '49', '14', 'A4B']);
});

test('busca por descrição continua funcionando e respeita a ordem natural', () => {
  const lista = [
    produto('B1', { descricao: 'Vestido de festa longo' }),
    produto('A1', { descricao: 'vestido curto' }),
    produto('C1', { descricao: 'Blusa cropped' }),
  ];

  const resultados = searchProdutos(buildIndex(lista), 'VESTIDO');
  assert.deepEqual(
    resultados.map((p) => p.referencia),
    ['A1', 'B1']
  );
  assert.ok(!resultados.some((p) => p.referencia === 'C1'));
});

test('palavra inteira na descrição tem prioridade sobre trecho no meio', () => {
  const lista = [
    produto('A1', { descricao: 'Tamanho G4 especial' }), // "4" no meio da palavra
    produto('B1', { descricao: 'Coleção 4 peças' }), // "4" como palavra
  ];

  assert.deepEqual(refs(lista, '4'), ['B1', 'A1']);
});

test('busca por fornecedor', () => {
  const lista = [
    produto('A1', { fornecedor: 'Tecidos São João' }),
    produto('B1', { fornecedor: 'Malharia Lima' }),
  ];

  assert.deepEqual(refs(lista, 'são joão'), ['A1']);
});

test('busca por valor aceita vírgula, ponto e sem separador', () => {
  const lista = [
    produto('A1', { preco_venda: 88.9 }),
    produto('B1', { preco_venda: 25.9 }),
    produto('C1', { preco_venda: 120 }),
  ];

  assert.deepEqual(refs(lista, '25,9'), ['B1']);
  assert.deepEqual(refs(lista, '25.9'), ['B1']);
  assert.deepEqual(refs(lista, '2590'), ['B1']);
  assert.deepEqual(refs(lista, 'R$ 25,90'), ['B1']);
});

test('preço com "4" não compete com referência', () => {
  // Muitos produtos têm "4" no valor; a referência exata precisa vencer
  const lista = [
    produto('X1', { preco_venda: 44.9 }),
    produto('X2', { preco_venda: 404 }),
    produto('X3'),
    produto('4'),
  ];

  assert.equal(refs(lista, '4')[0], '4');
});

test('consulta vazia devolve todos na ordem original', () => {
  const lista = [produto('C'), produto('A'), produto('B')];

  assert.deepEqual(refs(lista, '   '), ['C', 'A', 'B']);
});

test('ignora acentos, caixa e espaços nas pontas', () => {
  const lista = [
    produto('A1', { descricao: 'Blusa com aplicações' }),
    produto('B1', { descricao: 'Calça jeans' }),
  ];

  assert.deepEqual(refs(lista, '  APLICACOES '), ['A1']);
  assert.deepEqual(refs(lista, 'CALÇA'), ['B1']);
});

test('não retorna produtos sem relação com a busca', () => {
  const lista = [produto('100'), produto('200'), produto('Camisa')];

  assert.deepEqual(refs(lista, '999'), []);
});

test('busca permanece rápida com milhares de produtos', () => {
  const lista = Array.from({ length: 5000 }, (_, i) =>
    produto(`REF-${i}`, { descricao: `Produto número ${i} da coleção`, preco_venda: i + 0.9 })
  );
  lista.push(produto('4'));

  const index = buildIndex(lista);
  const inicio = process.hrtime.bigint();
  for (let i = 0; i < 50; i++) {
    searchProdutos(index, '4');
  }
  const decorridoMs = Number(process.hrtime.bigint() - inicio) / 1e6;

  assert.equal(searchProdutos(index, '4')[0].referencia, '4');
  // 50 buscas em 5000 produtos — limite generoso para não ser instável
  assert.ok(decorridoMs < 1000, `busca demorou ${decorridoMs.toFixed(1)}ms`);
});
