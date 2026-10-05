import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestLegislation, legislationUrl, type LegislationStreams } from './legislation.ts';
import type { Period } from './data.ts';

const period: Period = { id: 'sample', label: 'Setembro', start: '2026-09-01', end: '2026-09-30' };

function csv(header: string, ...rows: string[]): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(`${header}\n${rows.length ? `${rows.join('\n')}\n` : ''}`);
  return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}

function streams(overrides: Partial<Record<keyof LegislationStreams, ReadableStream<Uint8Array>>> = {}): LegislationStreams {
  return {
    votations: csv('id;data;aprovacao;descricao;uri', '2611313-31;2026-09-03;1;Subemenda aprovada;https://dadosabertos.camara.leg.br/api/v2/votacoes/2611313-31'),
    votes: csv('idVotacao;deputado_id;voto;dataHoraVoto', '2611313-31;204528;Não;2026-09-03T17:25:39'),
    affected: csv('idVotacao;proposicao_id;proposicao_titulo', '2611313-31;2611313;PLP 74/2026'),
    proposals: csv('id;dataApresentacao;siglaTipo;numero;ano;ementa;ultimoStatus_descricaoSituacao;uri', '2647298;2026-09-05T10:00:00;PL;99;2026;Texto proposto;Em tramitação;https://dadosabertos.camara.leg.br/api/v2/proposicoes/2647298'),
    authors: csv('idProposicao;idDeputadoAutor;proponente;ordemAssinatura', '2647298;204528;1;1'),
    ...overrides,
  };
}

test('joins the individual vote to the event and labels affected proposal as context', async () => {
  const data = await ingestLegislation(streams(), new Set(['204528', '999999']), period);
  const vote = data.votes.get('204528')?.[0];
  assert.equal(vote?.id, '2611313-31');
  assert.equal(vote?.date, '2026-09-03');
  assert.equal(vote?.position, 'Não');
  assert.equal(vote?.result, 'Aprovada');
  assert.equal(vote?.objectType, 'Proposição afetada');
  assert.equal(vote?.proposalCode, 'PLP 74/2026');
  assert.match(vote?.summary ?? '', /Proposição afetada/);
  assert.equal(data.votes.has('999999'), false);
  assert.equal(data.proposals.get('204528')?.[0]?.code, 'PL 99/2026');
});

test('keeps empty individual position and unknown result explicit; event date wins', async () => {
  const data = await ingestLegislation(streams({
    votations: csv('id;data;aprovacao;descricao', '2611313-31;2026-09-03;;Votação sem resultado'),
    votes: csv('idVotacao;deputado_id;voto;dataHoraVoto', '2611313-31;204528;;2026-09-04T01:00:00'),
    affected: csv('idVotacao;proposicao_id;proposicao_titulo'),
  }), new Set(['204528']), period);
  const vote = data.votes.get('204528')?.[0];
  assert.equal(vote?.date, '2026-09-03');
  assert.equal(vote?.position, 'Não informado');
  assert.equal(vote?.result, 'Não informado');
  assert.equal(vote?.proposalCode, '');
  assert.equal(vote?.objectType, 'Não determinado');
});

test('counts coauthors once and excludes older proposals reautuated into annual file', async () => {
  const data = await ingestLegislation(streams({
    authors: csv('idProposicao;idDeputadoAutor;proponente;ordemAssinatura',
      '2647298;204528;1;1', '2647298;204528;1;1', '2647298;999999;0;2', '281460;204528;1;1'),
    proposals: csv('id;dataApresentacao;siglaTipo;numero;ano;ementa',
      '2647298;2026-09-05T10:00:00;PL;99;2026;Texto proposto',
      '281460;2005-04-12T19:37:00;PL;1051;2026;Antiga reautuada'),
  }), new Set(['204528', '999999']), period);
  assert.deepEqual(data.proposals.get('204528')?.map(item => item.id), ['2647298']);
  assert.deepEqual(data.proposals.get('999999')?.map(item => item.id), ['2647298']);
});

test('zero year in an accessory proposition remains unspecified', async () => {
  const data = await ingestLegislation(streams({
    authors: csv('idProposicao;idDeputadoAutor', '2645181;204528'),
    proposals: csv('id;dataApresentacao;siglaTipo;numero;ano;ementa', '2645181;2026-09-01T15:45:52;RPD;1;0;Retirada de pauta'),
  }), new Set(['204528']), period);
  assert.equal(data.proposals.get('204528')?.[0]?.code, 'RPD 1');
});

test('rejects invalid IDs, event dates, and conflicting votes', async () => {
  await assert.rejects(ingestLegislation(streams({ votations: csv('id;data;aprovacao;descricao', 'bad;2026-09-03;1;Teste') }), new Set(['204528']), period), /ID de votação inválido/);
  await assert.rejects(ingestLegislation(streams({ votations: csv('id;data;aprovacao;descricao', '2611313-31;2026-02-31;1;Teste') }), new Set(['204528']), period), /Data de votação inválida/);
  await assert.rejects(ingestLegislation(streams({ votes: csv('idVotacao;deputado_id;voto;dataHoraVoto', '2611313-31;204528;Sim;2026-09-03T11:00:00', '2611313-31;204528;Não;2026-09-03T12:00:00') }), new Set(['204528']), period), /Votos conflitantes/);
});

test('only constructs documented official bulk source URLs', () => {
  assert.equal(legislationUrl('votacoesVotos', 2026), 'https://dadosabertos.camara.leg.br/arquivos/votacoesVotos/csv/votacoesVotos-2026.csv');
  assert.throws(() => legislationUrl('votacoes', 2026.5), /Ano legislativo inválido/);
});
