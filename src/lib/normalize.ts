import type { Deputy, Expense, Proposal, Vote, VotePosition, DataCoverage } from './data.ts';

type JsonObject = Record<string, unknown>;
export type DeputySummary = Pick<Deputy, 'id' | 'name' | 'party' | 'photo' | 'state' | 'sourceUrl'>;
export type NormalizedVotation = Omit<Vote, 'position'>;

const apiBase = 'https://dadosabertos.camara.leg.br/api/v2';

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function rows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const envelope = object(value);
  if (envelope && Array.isArray(envelope.dados)) return envelope.dados;
  throw new TypeError('Resposta da Câmara sem lista de dados válida');
}

function dataObject(value: unknown): JsonObject {
  const envelope = object(value);
  const data = object(envelope?.dados) ?? envelope;
  if (!data) throw new TypeError('Resposta da Câmara sem objeto de dados válido');
  return data;
}

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function id(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (typeof value === 'string' && /^[\w-]+$/.test(value)) return value;
  return '';
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
  const date = value.slice(0, 10);
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date;
}

function integer(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(number) ? number : null;
}

export function officialUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (!['camara.leg.br', 'camara.gov.br'].some((domain) => host === domain || host.endsWith(`.${domain}`))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function toCents(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  let text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  text = text.replace(/^R\$\s*/, '').replace(/\s/g, '');
  const sign = text.startsWith('-') ? -1 : 1;
  if (text[0] === '-' || text[0] === '+') text = text.slice(1);
  if (!text) return null;
  let integerPart: string;
  let decimalPart = '';
  if (typeof value === 'number') {
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    [integerPart, decimalPart = ''] = text.split('.');
  } else if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(text)) {
    [integerPart, decimalPart = ''] = text.split(',');
    integerPart = integerPart.replace(/\./g, '');
  } else if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(text)) {
    [integerPart, decimalPart = ''] = text.split('.');
    integerPart = integerPart.replace(/,/g, '');
  } else if (/^\d+(?:[.,]\d{1,2})?$/.test(text)) {
    [integerPart, decimalPart = ''] = text.split(/[.,]/);
  } else {
    return null;
  }
  const cents = Number(integerPart) * 100 + Number(decimalPart.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? sign * cents : null;
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

export function normalizeDeputyListItem(raw: unknown): DeputySummary | null {
  const item = object(raw);
  const deputyId = id(item?.id);
  const name = string(item?.nome);
  if (!item || !deputyId || !name) return null;
  return {
    id: deputyId,
    name,
    party: string(item.siglaPartido),
    state: string(item.siglaUf),
    photo: officialUrl(item.urlFoto) ?? '',
    sourceUrl: officialUrl(item.uri) ?? `${apiBase}/deputados/${encodeURIComponent(deputyId)}`,
  };
}

function pending(sourceUrl: string, since: string, until: string): DataCoverage {
  return { status: 'pending', since, until, fetchedAt: null, sourceUrl };
}

export function normalizeDeputyDetail(raw: unknown, summary: DeputySummary, fetchedAt: string, since: string, until: string): Deputy {
  const detail = dataObject(raw);
  if (id(detail.id) !== summary.id) throw new TypeError('Detalhe não corresponde ao deputado solicitado');
  const status = object(detail.ultimoStatus);
  const photo = officialUrl(status?.urlFoto) ?? summary.photo;
  const party = string(status?.siglaPartido) || summary.party;
  const partyColors = ['#5636A4', '#2F6FA3', '#AC5D42', '#3A8B70', '#A55D8A', '#7E7740'];
  const colorIndex = [...party].reduce((sum, char) => sum + char.codePointAt(0)!, 0) % partyColors.length;
  const sourceUrl = officialUrl(detail.uri) ?? summary.sourceUrl;
  return {
    id: summary.id,
    name: string(status?.nome) || summary.name,
    fullName: string(detail.nomeCivil) || summary.name,
    party,
    partyColor: partyColors[colorIndex]!,
    bio: '',
    status: string(status?.situacao) || 'Não informado',
    photo,
    state: string(status?.siglaUf) || summary.state,
    mandate: integer(status?.idLegislatura) === null ? 'Não informado' : `${integer(status?.idLegislatura)}ª legislatura`,
    sourceLabel: 'Câmara dos Deputados · Dados Abertos',
    sourceUrl,
    fetchedAt,
    coverage: {
      expenses: pending(`${apiBase}/deputados/${summary.id}/despesas`, since, until),
      votes: pending(`${apiBase}/votacoes`, since, until),
      proposals: pending(`${apiBase}/proposicoes?idDeputadoAutor=${summary.id}`, since, until),
      amendments: { status: 'unavailable', since, until, fetchedAt: null, sourceUrl: '', message: 'Fonte de emendas não integrada.' },
    },
    expenses: [], votes: [], proposals: [], amendments: [],
  };
}

export function normalizeExpenses(raw: unknown, deputyId: string): Expense[] {
  const expenses = rows(raw).map((rawItem) => {
    const item = object(rawItem);
    const year = integer(item?.ano);
    const month = integer(item?.mes);
    if (!item || year === null || year < 1900 || month === null || month < 1 || month > 12) {
      throw new TypeError('Despesa sem competência válida');
    }
    const amountCents = toCents(item.valorLiquido);
    if (item.valorLiquido !== null && item.valorLiquido !== undefined && amountCents === null) {
      throw new TypeError('Despesa com valor líquido inválido');
    }
    const date = `${year}-${String(month).padStart(2, '0')}-01`;
    const documentDate = dateOnly(item.dataDocumento);
    const category = string(item.tipoDespesa) || 'Não informado';
    const supplier = string(item.nomeFornecedor) || 'Não informado';
    const identity = [deputyId, year, month, item.idDocumento, item.idLote, item.parcela, item.numeroDocumento, item.dataDocumento, category, supplier, item.valorLiquido];
    return {
      id: `ceap-${encodeURIComponent(JSON.stringify(identity))}`,
      date,
      documentDate,
      category,
      supplier,
      amountCents,
      receiptUrl: officialUrl(item.urlDocumento),
    } satisfies Expense;
  });
  return uniqueById(expenses);
}

export function normalizeVotations(raw: unknown): NormalizedVotation[] {
  const votes = rows(raw).map((rawItem) => {
    const item = object(rawItem);
    const voteId = id(item?.id);
    const date = dateOnly(item?.data) ?? dateOnly(item?.dataHoraRegistro);
    if (!item || !voteId || !date) throw new TypeError('Votação sem ID ou data válida');
    const summary = string(item.descricao);
    const proposalCode = string(item.proposicaoObjeto);
    return {
      id: voteId,
      date,
      title: summary || proposalCode || `Votação ${voteId}`,
      objectType: proposalCode.split(' ')[0] || 'Não informado',
      result: string(item.descricaoResultado) || 'Não informado',
      status: 'Não informado',
      summary,
      proposalCode,
      sourceUrl: officialUrl(item.uri) ?? `${apiBase}/votacoes/${encodeURIComponent(voteId)}`,
    } satisfies NormalizedVotation;
  });
  return uniqueById(votes);
}

function votePosition(value: unknown): VotePosition {
  return value === 'Sim' || value === 'Não' || value === 'Abstenção' || value === 'Obstrução' ? value : 'Não informado';
}

export function normalizeVotes(raw: unknown, votation: NormalizedVotation, deputyId: string): Vote[] {
  const matching = rows(raw).filter((rawItem) => {
    const deputy = object(object(rawItem)?.deputado_);
    return id(deputy?.id) === deputyId;
  });
  if (matching.length === 0) return [];
  const positions = [...new Set(matching.map((item) => votePosition(object(item)?.tipoVoto)))];
  if (positions.length > 1) throw new TypeError('Votos conflitantes para o mesmo parlamentar');
  return [{ ...votation, position: positions[0]! }];
}

export function normalizeProposals(raw: unknown): Proposal[] {
  const proposals = rows(raw).map((rawItem) => {
    const item = object(rawItem);
    const proposalId = id(item?.id);
    const date = dateOnly(item?.dataApresentacao);
    if (!item || !proposalId || !date) throw new TypeError('Proposição sem ID ou data de apresentação válida');
    const kind = string(item.siglaTipo) || 'Não informado';
    const number = integer(item.numero);
    const year = integer(item.ano);
    const code = number === null || year === null ? kind : `${kind} ${number}/${year}`;
    const summary = string(item.ementa);
    const status = object(item.statusProposicao);
    return {
      id: proposalId,
      date,
      title: summary || code,
      code,
      kind,
      status: string(status?.descricaoSituacao) || 'Não informado',
      summary,
      sourceUrl: officialUrl(item.uri) ?? `${apiBase}/proposicoes/${encodeURIComponent(proposalId)}`,
    } satisfies Proposal;
  });
  return uniqueById(proposals);
}
