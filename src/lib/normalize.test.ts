import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeDeputyListItem,
  normalizeDeputyDetail,
  normalizeExpenses,
  normalizeVotations,
  normalizeVotes,
  normalizeProposals,
  officialUrl,
  toCents,
} from './normalize.ts';

test('currency conversion is exact and accepts negative reversals', () => {
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents('R$ 1.234,56'), 123456);
  assert.equal(toCents('1,234.56'), 123456);
  assert.equal(toCents('-0,01'), -1);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(null), null);
  assert.equal(toCents(''), null);
  assert.equal(toCents(1.234), null);
  assert.equal(toCents('12,3456'), null);
  assert.equal(toCents(Infinity), null);
});

test('only official Câmara HTTP URLs survive normalization', () => {
  assert.equal(officialUrl('http://www.camara.leg.br/internet/deputado/1.jpg'), 'http://www.camara.leg.br/internet/deputado/1.jpg');
  assert.equal(officialUrl('https://dadosabertos.camara.leg.br/api/v2/deputados/1'), 'https://dadosabertos.camara.leg.br/api/v2/deputados/1');
  for (const value of ['javascript:alert(1)', 'https://camara.leg.br.evil.example/a', 'https://evil.example/a', 'https://user@camara.leg.br/a', '/relative']) {
    assert.equal(officialUrl(value), null);
  }
});

test('deputy list and detail use received facts and start with pending coverage', () => {
  const summary = normalizeDeputyListItem({ id: 123, uri: 'https://dadosabertos.camara.leg.br/api/v2/deputados/123', nome: 'Ana Silva', siglaPartido: 'ABC', siglaUf: 'SP', urlFoto: 'https://www.camara.leg.br/foto.jpg' });
  assert.ok(summary);
  const deputy = normalizeDeputyDetail({ dados: { id: 123, nomeCivil: 'Ana Maria Silva', ultimoStatus: { nome: 'Ana Silva', siglaPartido: 'ABC', siglaUf: 'SP', idLegislatura: 57, situacao: 'Exercício' } } }, summary, '2026-10-05T12:00:00Z', '2026-09-01', '2026-09-30');
  assert.equal(deputy.fullName, 'Ana Maria Silva');
  assert.equal(deputy.mandate, '57ª legislatura');
  assert.equal(deputy.bio, '');
  assert.equal(deputy.coverage.expenses.status, 'pending');
  assert.equal(deputy.coverage.amendments.status, 'unavailable');
  assert.deepEqual(deputy.expenses, []);
  assert.throws(() => normalizeDeputyDetail({ dados: { id: 999 } }, summary, '', '', ''), /não corresponde/);
});

test('expense competence differs from issue date; null and reversal stay distinct', () => {
  const base = { ano: 2026, mes: 9, idDocumento: 81, idLote: 4, parcela: 0, tipoDespesa: 'PASSAGEM AÉREA', nomeFornecedor: 'Fornecedor de teste', dataDocumento: '2026-10-03', urlDocumento: 'https://www.camara.leg.br/documento/81' };
  const expenses = normalizeExpenses({ dados: [
    { ...base, valorLiquido: 35.2 },
    { ...base, valorLiquido: 35.2 },
    { ...base, idDocumento: 82, valorLiquido: -12.5 },
    { ...base, idDocumento: 83, valorLiquido: null, urlDocumento: 'https://example.com/receipt' },
  ] }, '123');
  assert.equal(expenses.length, 3);
  assert.ok(expenses.every((expense) => expense.date === '2026-09-01' && expense.documentDate === '2026-10-03'));
  assert.deepEqual(expenses.map((expense) => expense.amountCents), [3520, -1250, null]);
  assert.equal(expenses[2]?.receiptUrl, null);
  assert.equal(new Set(expenses.map((expense) => expense.id)).size, 3);
  assert.throws(() => normalizeExpenses({ error: 'timeout' }, '123'), /sem lista/);
  assert.throws(() => normalizeExpenses({ dados: [{ ...base, mes: 13, valorLiquido: 1 }] }, '123'), /competência/);
});

test('votes only attribute an explicitly received individual position', () => {
  const [votation] = normalizeVotations({ dados: [{ id: '999-1', data: '2026-09-15', descricao: 'Teste de votação', descricaoResultado: 'Aprovado', proposicaoObjeto: 'PL 1/2026', uri: 'https://dadosabertos.camara.leg.br/api/v2/votacoes/999-1' }] });
  assert.ok(votation);
  assert.equal(normalizeVotes({ dados: [{ deputado_: { id: 456 }, tipoVoto: 'Sim' }] }, votation, '123').length, 0);
  assert.deepEqual(normalizeVotes({ dados: [{ deputado_: { id: 123 }, tipoVoto: 'Não' }] }, votation, '123').map((vote) => vote.position), ['Não']);
  assert.deepEqual(normalizeVotes({ dados: [{ deputado_: { id: 123 }, tipoVoto: 'Obstrução' }] }, votation, '123').map((vote) => vote.position), ['Obstrução']);
  assert.throws(() => normalizeVotes({ dados: [{ deputado_: { id: 123 }, tipoVoto: 'Sim' }, { deputado_: { id: 123 }, tipoVoto: 'Não' }] }, votation, '123'), /conflitantes/);
  assert.throws(() => normalizeVotes({ status: 504 }, votation, '123'), /sem lista/);
});

test('votation and proposal IDs deduplicate without fabricating missing fields', () => {
  const rawVote = { id: '999-1', data: '2026-09-15', descricao: 'Teste de votação' };
  assert.equal(normalizeVotations({ dados: [rawVote, rawVote] }).length, 1);
  const proposals = normalizeProposals({ dados: [
    { id: 301, dataApresentacao: '2026-09-08T11:00:00', siglaTipo: 'PL', numero: 22, ano: 2026, ementa: 'Texto de teste' },
    { id: 301, dataApresentacao: '2026-09-08T11:00:00', siglaTipo: 'PL', numero: 22, ano: 2026, ementa: 'Texto de teste' },
  ] });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0]?.code, 'PL 22/2026');
  assert.equal(proposals[0]?.status, 'Não informado');
  assert.throws(() => normalizeProposals({ dados: [{ id: 302, ementa: 'Sem data' }] }), /data de apresentação/);
});
