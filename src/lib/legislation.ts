import type { Period, Proposal, Vote, VotePosition } from './data.ts';
import { parseSemicolonCsv } from './bulk.ts';
import { officialUrl } from './normalize.ts';

const base = 'https://dadosabertos.camara.leg.br/arquivos';

export const legislationUrl = (kind: 'votacoes' | 'votacoesVotos' | 'votacoesProposicoes' | 'proposicoes' | 'proposicoesAutores', year: number): string => {
  if (!Number.isInteger(year) || year < 1827 || year > 9999) throw new TypeError('Ano legislativo inválido');
  return `${base}/${kind}/csv/${kind}-${year}.csv`;
};

export type LegislationStreams = {
  votations: ReadableStream<Uint8Array>;
  votes: ReadableStream<Uint8Array>;
  affected: ReadableStream<Uint8Array>;
  proposals: ReadableStream<Uint8Array>;
  authors: ReadableStream<Uint8Array>;
};

type Votation = Omit<Vote, 'position'>;

function identifier(value: string | undefined, label: string, voting = false): string {
  const text = value?.trim() ?? '';
  if (!(voting ? /^\d+-\d+$/.test(text) : /^\d+$/.test(text))) throw new TypeError(`${label} inválido`);
  return text;
}

function date(value: string | undefined, label: string): string {
  const day = value?.slice(0, 10) ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || (value!.length > 10 && value![10] !== 'T')) throw new TypeError(`${label} inválida`);
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) throw new TypeError(`${label} inválida`);
  return day;
}

function inPeriod(day: string, period: Period): boolean {
  return day >= period.start && day <= period.end;
}

function result(value: string | undefined): string {
  if (value === '1') return 'Aprovada';
  if (value === '0') return 'Rejeitada';
  if (!value?.trim()) return 'Não informado';
  throw new TypeError('Resultado de votação inválido');
}

function position(value: string | undefined): VotePosition {
  return value === 'Sim' || value === 'Não' || value === 'Abstenção' || value === 'Obstrução' ? value : 'Não informado';
}

function add<T>(target: Map<string, T[]>, key: string, value: T): void {
  const values = target.get(key) ?? [];
  values.push(value);
  target.set(key, values);
}

export async function ingestLegislation(streams: LegislationStreams, deputyIds: Set<string>, period: Period): Promise<{ votes: Map<string, Vote[]>; proposals: Map<string, Proposal[]> }> {
  date(period.start, 'Início do período');
  date(period.end, 'Fim do período');
  if (period.start > period.end) throw new TypeError('Período invertido');
  for (const id of deputyIds) identifier(id, 'ID de deputado');

  const votations = new Map<string, Votation>();
  for await (const { row } of parseSemicolonCsv(streams.votations, ['id', 'data', 'aprovacao', 'descricao'])) {
    const id = identifier(row.id, 'ID de votação', true);
    const day = date(row.data, 'Data de votação');
    if (!inPeriod(day, period)) continue;
    const description = row.descricao?.trim() || `Votação ${id}`;
    const value: Votation = {
      id,
      date: day,
      title: description,
      objectType: 'Não determinado',
      result: result(row.aprovacao),
      status: 'Concluída',
      summary: description,
      proposalCode: '',
      sourceUrl: officialUrl(row.uri) ?? `https://dadosabertos.camara.leg.br/api/v2/votacoes/${id}`,
    };
    if (votations.has(id)) throw new TypeError(`Votação duplicada: ${id}`);
    votations.set(id, value);
  }

  const affected = new Map<string, Set<string>>();
  for await (const { row } of parseSemicolonCsv(streams.affected, ['idVotacao', 'proposicao_id', 'proposicao_titulo'])) {
    const id = identifier(row.idVotacao, 'ID de votação afetada', true);
    identifier(row.proposicao_id, 'ID de proposição afetada');
    if (!votations.has(id)) continue;
    const code = row.proposicao_titulo?.trim();
    if (!code) continue;
    const codes = affected.get(id) ?? new Set<string>();
    codes.add(code);
    affected.set(id, codes);
  }
  for (const [id, codes] of affected) {
    const votation = votations.get(id)!;
    const items = [...codes];
    votation.objectType = 'Proposição afetada';
    votation.proposalCode = items.length === 1 ? items[0]! : `${items.length} proposições afetadas`;
    votation.summary = `${votation.summary} Proposição${items.length === 1 ? '' : 'ões'} afetada${items.length === 1 ? '' : 's'}: ${items.join(', ')}.`;
  }

  const authors = new Map<string, Set<string>>();
  for await (const { row } of parseSemicolonCsv(streams.authors, ['idProposicao', 'idDeputadoAutor'])) {
    const proposalId = identifier(row.idProposicao, 'ID de proposição');
    if (!row.idDeputadoAutor?.trim()) continue;
    const deputyId = identifier(row.idDeputadoAutor, 'ID de autor');
    if (!deputyIds.has(deputyId)) continue;
    const ids = authors.get(proposalId) ?? new Set<string>();
    ids.add(deputyId);
    authors.set(proposalId, ids);
  }

  const proposals = new Map<string, Proposal[]>();
  for await (const { row } of parseSemicolonCsv(streams.proposals, ['id', 'dataApresentacao', 'siglaTipo', 'numero', 'ano'])) {
    const id = identifier(row.id, 'ID de proposição');
    const day = date(row.dataApresentacao, 'Data de apresentação');
    const authorIds = authors.get(id);
    if (!authorIds || !inPeriod(day, period)) continue;
    const kind = row.siglaTipo?.trim() || 'Não informado';
    const number = row.numero?.trim();
    const year = row.ano?.trim();
    if (number && !/^\d+$/.test(number)) throw new TypeError('Número de proposição inválido');
    if (year && year !== '0' && !/^\d{4}$/.test(year)) throw new TypeError('Ano de proposição inválido');
    const code = number && number !== '0' ? `${kind} ${number}${year && year !== '0' ? `/${year}` : ''}` : kind;
    const summary = row.ementa?.trim() || '';
    const proposal: Proposal = {
      id,
      date: day,
      title: summary || code,
      code,
      kind,
      status: row.ultimoStatus_descricaoSituacao?.trim() || 'Não informado',
      summary,
      sourceUrl: officialUrl(row.uri) ?? `https://dadosabertos.camara.leg.br/api/v2/proposicoes/${id}`,
    };
    for (const deputyId of authorIds) add(proposals, deputyId, proposal);
  }

  const votes = new Map<string, Vote[]>();
  const seen = new Map<string, VotePosition>();
  for await (const { row } of parseSemicolonCsv(streams.votes, ['idVotacao', 'deputado_id', 'voto', 'dataHoraVoto'])) {
    const id = identifier(row.idVotacao, 'ID de voto', true);
    const deputyId = identifier(row.deputado_id, 'ID de votante');
    if (!deputyIds.has(deputyId)) continue;
    const votation = votations.get(id);
    if (!votation) continue;
    if (row.dataHoraVoto?.trim()) date(row.dataHoraVoto, 'Data do registro do voto');
    const value = position(row.voto);
    const key = `${id}:${deputyId}`;
    const existing = seen.get(key);
    if (existing && existing !== value) throw new TypeError(`Votos conflitantes: ${key}`);
    if (existing) continue;
    seen.set(key, value);
    add(votes, deputyId, { ...votation, position: value });
  }

  for (const items of votes.values()) items.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  for (const items of proposals.values()) items.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return { votes, proposals };
}
