import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLegacyDeputies } from './legacy.ts';

const person = (id: string, state: string, name: string) => `<deputado>
  <ideCadastro>${id}</ideCadastro><nome>${name}</nome><nomeParlamentar>${name}</nomeParlamentar>
  <urlFoto>http://www.camara.gov.br/internet/deputado/bandep/${id}.jpg</urlFoto>
  <uf>${state}</uf><partido>ABC</partido><comissoes><titular /></comissoes>
</deputado>`;
const xml = (...people: string[]) => `<?xml version="1.0" encoding="utf-8"?><deputados>${people.join('')}</deputados>`;

test('legacy catalog selects São Paulo and preserves source fields', () => {
  const deputies = normalizeLegacyDeputies(xml(person('10', 'SP', 'Ana &amp; Lia'), person('11', 'RJ', 'Bia')), '2026-10-05T12:00:00Z');
  assert.equal(deputies.length, 1);
  assert.equal(deputies[0]?.id, '10');
  assert.equal(deputies[0]?.name, 'Ana & Lia');
  assert.equal(deputies[0]?.photo, 'http://www.camara.gov.br/internet/deputado/bandep/10.jpg');
  assert.equal(deputies[0]?.mandate, '');
  assert.equal(deputies[0]?.coverage.expenses.status, 'pending');
  assert.equal(deputies[0]?.coverage.votes.status, 'unavailable');
});

test('legacy catalog rejects dangerous or incomplete XML and duplicate IDs', () => {
  assert.throws(() => normalizeLegacyDeputies(xml(person('10', 'SP', 'Ana'), person('10', 'SP', 'Bia')), '2026-10-05T12:00:00Z'), /ID único/);
  assert.throws(() => normalizeLegacyDeputies(xml(person('10', 'RJ', 'Ana')), '2026-10-05T12:00:00Z'), /Nenhum deputado/);
  assert.throws(() => normalizeLegacyDeputies('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>' + xml(person('10', 'SP', 'Ana')), '2026-10-05T12:00:00Z'), /XML/);
  assert.throws(() => normalizeLegacyDeputies('<deputados><deputado><ideCadastro>10</ideCadastro></deputados>', '2026-10-05T12:00:00Z'), /incompleta/);
  assert.throws(() => normalizeLegacyDeputies(xml(person('10', 'SP', 'Ana &evil;')), '2026-10-05T12:00:00Z'), /Entidade XML/);
});
