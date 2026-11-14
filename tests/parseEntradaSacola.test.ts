import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEntradaSacola } from '../src/utils/parseEntradaSacola';

test('código puro continua valendo 1 peça (comportamento original)', () => {
  assert.deepEqual(parseEntradaSacola('77'), { codigo: '77', qtd: 1 });
  assert.deepEqual(parseEntradaSacola('  77  '), { codigo: '77', qtd: 1 });
});

test('multiplicador 77*3 vira código 77 com 3 peças', () => {
  assert.deepEqual(parseEntradaSacola('77*3'), { codigo: '77', qtd: 3 });
});

test('aceita espaços ao redor do "*" e caixa mista', () => {
  assert.deepEqual(parseEntradaSacola('77 * 3'), { codigo: '77', qtd: 3 });
  assert.deepEqual(parseEntradaSacola(' a7 * 12 '), { codigo: 'A7', qtd: 12 });
});

test('multiplicador de 1 dígito e de vários dígitos', () => {
  assert.deepEqual(parseEntradaSacola('101*1'), { codigo: '101', qtd: 1 });
  assert.deepEqual(parseEntradaSacola('101*99'), { codigo: '101', qtd: 99 });
});

test('entradas inválidas são rejeitadas (mantém o campo para correção)', () => {
  const invalidas = ['', '   ', '77*', '77*0', '77*abc', '77*3a', '77*-2', '77**3', '*3', '77*  ', '77*2*3'];
  for (const entrada of invalidas) {
    assert.equal(parseEntradaSacola(entrada), null, `deveria rejeitar "${entrada}"`);
  }
});
