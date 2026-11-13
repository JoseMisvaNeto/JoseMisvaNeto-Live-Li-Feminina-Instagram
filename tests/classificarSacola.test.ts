import test from 'node:test';
import assert from 'node:assert/strict';
import { classificarSacola } from '../src/utils/classificarSacola';

const m = (descricao: string, quantidade = 1) => ({ descricao, quantidade });

test('pijama deixa a sacola AMARELO (TAM G)', () => {
  assert.equal(classificarSacola([m('Pijama adulto')]), 'G');
  // regra do pijama vence mesmo sobre conteúdo que seria verde
  assert.equal(classificarSacola([m('Pijama'), m('Calcinha', 4)]), 'G');
});

test('dois ou mais conjuntos (soma das quantidades) -> AMARELO', () => {
  assert.equal(classificarSacola([m('Conjunto de renda', 2)]), 'G');
  assert.equal(classificarSacola([m('Conjunto', 1), m('Conjunto infantil', 1)]), 'G');
});

test('um único conjunto junto com calcinhas continua VERDE', () => {
  assert.equal(classificarSacola([m('Conjunto', 1), m('Calcinha', 3)]), 'P');
});

test('três sutiãs avulsos -> AMARELO; até 2 -> VERDE', () => {
  assert.equal(classificarSacola([m('Sutiã com bojo', 3)]), 'G');
  assert.equal(classificarSacola([m('Sutiã', 2)]), 'P');
});

test('extensor para sutiã não conta como sutiã avulso', () => {
  assert.equal(classificarSacola([m('Sutiã', 2), m('Extensor para sutiã', 4)]), 'P');
  assert.equal(classificarSacola([m('Extensor para sutiã', 4)]), 'P');
});

test('qualquer peça grande -> AMARELO', () => {
  const grandes = [
    'Casaco de pelúcia',
    'Vestido longo',
    'Blazer',
    'Jaqueta jeans',
    'Saia longa',
    'Calça alfaiataria',
  ];
  for (const descricao of grandes) {
    assert.equal(classificarSacola([m(descricao)]), 'G', descricao);
  }
});

test('só calcinhas/cuecas -> VERDE mesmo com 8+ peças (regra vence o desempate)', () => {
  assert.equal(classificarSacola([m('Calcinha', 6), m('Cueca', 2)]), 'P');
  assert.equal(classificarSacola([m('Calcinha', 12)]), 'P');
});

test('desempate: 8 ou mais peças sem regra -> AMARELO, menos de 8 -> VERDE', () => {
  assert.equal(classificarSacola([m('Blusa', 8)]), 'G');
  assert.equal(classificarSacola([m('Blusa', 7)]), 'P');
});

test('descrições com acento e caixa diferente são normalizadas', () => {
  assert.equal(classificarSacola([m('VESTIDO de festa')]), 'G');
  assert.equal(classificarSacola([m('sutiã', 3)]), 'G');
  assert.equal(classificarSacola([m('Calça jeans')]), 'G');
});

test('sacola sem mercadorias fica VERDE (sem regra e menos de 8 peças)', () => {
  assert.equal(classificarSacola([]), 'P');
});
