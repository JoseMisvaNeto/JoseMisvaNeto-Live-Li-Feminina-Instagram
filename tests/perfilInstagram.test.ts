import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extrairPerfilInstagram } from '../src/utils/perfilInstagram';

test('perfil com @ é mantido', () => {
  assert.equal(extrairPerfilInstagram('@ana.silva'), '@ana.silva');
  assert.equal(extrairPerfilInstagram('@ana_silva.2'), '@ana_silva.2');
});

test('perfil sem @ (formato do monitor) recebe o @', () => {
  assert.equal(extrairPerfilInstagram('ana.silva'), '@ana.silva');
  assert.equal(extrairPerfilInstagram('  lifemininamodaintima  '), '@lifemininamodaintima');
});

test('texto arrastado com comentário pega só o perfil', () => {
  assert.equal(
    extrairPerfilInstagram('@maria.souza quero a peça azul tamanho M'),
    '@maria.souza'
  );
  assert.equal(extrairPerfilInstagram('@maria.souza\nquero a peça azul'), '@maria.souza');
  assert.equal(extrairPerfilInstagram('@maria.souza.'), '@maria.souza');
});

test('código de produto e frases não preenchem a busca', () => {
  assert.equal(extrairPerfilInstagram('123456'), null);
  assert.equal(extrairPerfilInstagram('quero a peça azul'), null);
  assert.equal(extrairPerfilInstagram('77*3'), null);
});

test('texto vazio ou inválido devolve null', () => {
  assert.equal(extrairPerfilInstagram(''), null);
  assert.equal(extrairPerfilInstagram('   '), null);
  assert.equal(extrairPerfilInstagram('@'), null);
  // Com "@" explícito, um caractere só já é intenção do usuário.
  assert.equal(extrairPerfilInstagram('@a'), '@a');
});

test('nome de perfil com espaços é aceito com o nome exato', () => {
  assert.equal(extrairPerfilInstagram('Andressa Grittens'), 'Andressa Grittens');
  assert.equal(extrairPerfilInstagram('@Andressa Grittens'), 'Andressa Grittens');
  assert.equal(extrairPerfilInstagram('  Maria Clara Silva  '), 'Maria Clara Silva');
  assert.equal(extrairPerfilInstagram("Joana D'Angelo"), "Joana D'Angelo");
});

test('frase com pontuação ou caixa mista não vira perfil', () => {
  assert.equal(extrairPerfilInstagram('Atenção: Pedido Novo'), null);
  assert.equal(extrairPerfilInstagram('Gostei Da peça azul'), null);
  assert.equal(extrairPerfilInstagram('Bom dia, tudo bem?'), null);
});
