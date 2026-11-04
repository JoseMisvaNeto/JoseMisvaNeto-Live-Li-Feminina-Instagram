import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProductCsv, parseQuantidadeBr, parseValorUnitarioBr } from '../src/utils/productCsvImport';

const BOM = '\uFEFF';

test('lê UTF-8 com BOM e separador ponto e vírgula, com decimal de vírgula', () => {
  const csv =
    BOM +
    [
      'referencia;descricao;quantidade;valor_unitario',
      "306;Top com e sem bojo removível (modelos variados);4;88,90",
      "306;Top com e sem bojo removível (modelos variados);6;88,90",
      "ABC-01;Blusa D'água / kit (2 peças);3;139,90",
    ].join('\r\n');

  const resultado = parseProductCsv(csv);

  assert.equal(resultado.cabecalhoInvalido, null);
  assert.equal(resultado.bloqueado, false);
  assert.equal(resultado.totalLinhas, 3);
  assert.equal(resultado.totalValidos, 2);
  assert.equal(resultado.totalErros, 0);
  assert.equal(resultado.somaQuantidades, 13);

  const top = resultado.rows.find((r) => r.referencia === '306');
  assert.ok(top);
  assert.equal(top!.descricao, 'Top com e sem bojo removível (modelos variados)');
  assert.equal(top!.quantidade, 10);
  assert.equal(top!.valor_unitario, 88.9);
  assert.deepEqual(top!.linhas, [2, 3]);

  const blusa = resultado.rows.find((r) => r.referencia === 'ABC-01');
  assert.ok(blusa);
  assert.equal(blusa!.descricao, "Blusa D'água / kit (2 peças)");
  assert.equal(blusa!.valor_unitario, 139.9);

  assert.equal(resultado.duplicadas.length, 1);
  assert.equal(resultado.duplicadas[0].referencia, '306');
});

test('mapeia cabeçalhos independentemente da ordem', () => {
  const csv = ['valor_unitario;quantidade;descricao;referencia', '25,50;7;Calça jogger;0306'].join('\n');

  const resultado = parseProductCsv(csv);

  assert.equal(resultado.totalValidos, 1);
  assert.equal(resultado.rows[0].referencia, '0306');
  assert.equal(resultado.rows[0].descricao, 'Calça jogger');
  assert.equal(resultado.rows[0].quantidade, 7);
  assert.equal(resultado.rows[0].valor_unitario, 25.5);
});

test('trata referência como texto preservando zeros à esquerda', () => {
  const csv = ['referencia;descricao;quantidade;valor_unitario', '"000306";Top;2;10,00'].join('\n');
  const resultado = parseProductCsv(csv);

  assert.equal(resultado.rows[0].referencia, '000306');
  assert.equal(typeof resultado.rows[0].referencia, 'string');
});

test('preserva acentos, barras, parênteses e apóstrofos na descrição', () => {
  const descricao = "Conjunto Verão D'água / 2 peças (azul & branco) — edição especial";
  const csv = ['referencia;descricao;quantidade;valor_unitario', `R-9;${descricao};1;59,99`].join('\n');
  const resultado = parseProductCsv(csv);

  assert.equal(resultado.rows[0].descricao, descricao);
});

test('detecta separador vírgula quando o arquivo usa vírgula', () => {
  const csv = ['referencia,descricao,quantidade,valor_unitario', 'X1,"Produto, especial",2,"139,90"'].join('\n');
  const resultado = parseProductCsv(csv);

  assert.equal(resultado.rows.length, 1);
  assert.equal(resultado.rows[0].descricao, 'Produto, especial');
  assert.equal(resultado.rows[0].valor_unitario, 139.9);
});

test('consolida duplicados idênticos e lista as referências repetidas', () => {
  const csv = [
    'referencia;descricao;quantidade;valor_unitario',
    'A;Produto;1;10,00',
    'A;Produto;2;10,00',
    'B;Outro;5;20,00',
  ].join('\n');

  const resultado = parseProductCsv(csv);

  assert.equal(resultado.totalValidos, 2);
  assert.equal(resultado.somaQuantidades, 8);
  const a = resultado.rows.find((r) => r.referencia === 'A')!;
  assert.equal(a.quantidade, 3);
  assert.deepEqual(a.linhas, [2, 3]);
  assert.equal(resultado.duplicadas.length, 1);
  assert.equal(resultado.bloqueado, false);
});

test('bloqueia a importação quando a mesma referência tem descrição divergente', () => {
  const csv = [
    'referencia;descricao;quantidade;valor_unitario',
    'A;Produto azul;1;10,00',
    'A;Produto rosa;1;10,00',
  ].join('\n');

  const resultado = parseProductCsv(csv);

  assert.equal(resultado.bloqueado, true);
  assert.equal(resultado.conflitos.length, 1);
  assert.equal(resultado.conflitos[0].referencia, 'A');
  assert.match(resultado.conflitos[0].motivo, /descrição/);
  assert.deepEqual(resultado.conflitos[0].linhas, [2, 3]);
});

test('bloqueia a importação quando a mesma referência tem preço divergente', () => {
  const csv = [
    'referencia;descricao;quantidade;valor_unitario',
    'A;Produto;1;10,00',
    'A;Produto;1;10,90',
  ].join('\n');

  const resultado = parseProductCsv(csv);

  assert.equal(resultado.bloqueado, true);
  assert.match(resultado.conflitos[0].motivo, /valor unitário/);
});

test('reporta erros com a linha e o motivo de cada rejeição', () => {
  const csv = [
    'referencia;descricao;quantidade;valor_unitario', // 1
    ';Sem referência;1;10,00', // 2
    'A1;;1;10,00', // 3
    'A2;Produto;-1;10,00', // 4
    'A3;Produto;2,5;10,00', // 5
    'A4;Produto;abc;10,00', // 6
    'A5;Produto;1;-5,00', // 7
    'A6;Produto;1;abc', // 8
    'A7;Produto válido;10;88,90', // 9
  ].join('\n');

  const resultado = parseProductCsv(csv);

  assert.deepEqual(
    resultado.errors.map((e) => e.linha),
    [2, 3, 4, 5, 6, 7, 8]
  );
  assert.match(resultado.errors[0].motivo, /referência vazia/);
  assert.match(resultado.errors[1].motivo, /descrição vazia/);
  assert.match(resultado.errors[2].motivo, /negativa/);
  assert.match(resultado.errors[3].motivo, /decimal/);
  assert.match(resultado.errors[4].motivo, /inválida/);
  assert.match(resultado.errors[5].motivo, /negativo/);
  assert.match(resultado.errors[6].motivo, /inválido/);

  assert.equal(resultado.totalErros, 7);
  assert.equal(resultado.totalValidos, 1);
  assert.equal(resultado.rows[0].referencia, 'A7');
  assert.equal(resultado.somaQuantidades, 10);
});

test('ignora linhas vazias no final do arquivo', () => {
  const csv = [
    'referencia;descricao;quantidade;valor_unitario',
    'A;Produto;1;10,00',
    ';;;',
    '',
    '',
  ].join('\r\n');

  const resultado = parseProductCsv(csv);

  assert.equal(resultado.totalLinhas, 1);
  assert.equal(resultado.totalValidos, 1);
  assert.equal(resultado.totalErros, 0);
});

test('acusa coluna obrigatória ausente e bloqueia', () => {
  const csv = ['referencia;descricao;quantidade', 'A;Produto;1'].join('\n');
  const resultado = parseProductCsv(csv);

  assert.equal(resultado.bloqueado, true);
  assert.match(resultado.cabecalhoInvalido || '', /valor_unitario/);
  assert.equal(resultado.rows.length, 0);
});

test('aceita arquivo vazio como erro de cabeçalho, sem registros', () => {
  const resultado = parseProductCsv(`${BOM}\r\n\r\n`);

  assert.equal(resultado.bloqueado, true);
  assert.equal(resultado.rows.length, 0);
  assert.equal(resultado.totalValidos, 0);
});

test('interpreta valores unitários nos formatos usados no Brasil', () => {
  assert.deepEqual(parseValorUnitarioBr('139,90'), { valor: 139.9 });
  assert.deepEqual(parseValorUnitarioBr('R$ 1.234,56'), { valor: 1234.56 });
  assert.deepEqual(parseValorUnitarioBr('88.90'), { valor: 88.9 });
  assert.deepEqual(parseValorUnitarioBr('0'), { valor: 0 });
  assert.match(parseValorUnitarioBr('-1,00').erro || '', /negativo/);
  assert.match(parseValorUnitarioBr('abc').erro || '', /inválido/);
  assert.match(parseValorUnitarioBr('').erro || '', /vazio/);
});

test('quantidade aceita apenas inteiro não negativo', () => {
  assert.deepEqual(parseQuantidadeBr('10'), { valor: 10 });
  assert.deepEqual(parseQuantidadeBr(' 0 '), { valor: 0 });
  assert.deepEqual(parseQuantidadeBr('1.000'), { valor: 1000 });
  assert.match(parseQuantidadeBr('-1').erro || '', /negativa/);
  assert.match(parseQuantidadeBr('2,5').erro || '', /decimal/);
  assert.match(parseQuantidadeBr('1.5').erro || '', /decimal/);
  assert.match(parseQuantidadeBr('dez').erro || '', /inválida/);
  assert.match(parseQuantidadeBr('').erro || '', /vazia/);
});

// Cenário sintético com os mesmos totais do arquivo real (182 produtos / 978 unidades),
// incluindo a referência 306 consolidada em 10 unidades a R$ 88,90.
test('cenário do arquivo real: 182 produtos, 978 unidades e ref 306 com 10 unidades', () => {
  const linhas = ['referencia;descricao;quantidade;valor_unitario'];
  for (let i = 1; i <= 180; i++) {
    linhas.push(`${1000 + i};Produto ${i};5;10,00`);
  }
  linhas.push('306;Top com e sem bojo removível (modelos variados);4;88,90');
  linhas.push('306;Top com e sem bojo removível (modelos variados);6;88,90');
  linhas.push('999;Produto extra;68;19,90');

  const resultado = parseProductCsv(linhas.join('\n'));

  assert.equal(resultado.totalValidos, 182);
  assert.equal(resultado.somaQuantidades, 978);
  assert.equal(resultado.totalErros, 0);
  assert.equal(resultado.bloqueado, false);

  const top = resultado.rows.find((r) => r.referencia === '306')!;
  assert.equal(top.quantidade, 10);
  assert.equal(top.valor_unitario, 88.9);
  assert.equal(top.descricao, 'Top com e sem bojo removível (modelos variados)');
  assert.deepEqual(top.linhas, [182, 183]);
});
