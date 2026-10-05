import { buildPeriods, type Deputy, type DataCoverage } from './data.ts';
import { officialUrl } from './normalize.ts';

export const legacyDeputiesUrl = 'https://www.camara.leg.br/SitCamaraWS/Deputados.asmx/ObterDeputados';
export const legacyDeputiesRequestUrl = 'http://www.camara.leg.br/SitCamaraWS/Deputados.asmx/ObterDeputados';

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_whole, entity: string) => {
    if (entity === 'amp') return '&';
    if (entity === 'lt') return '<';
    if (entity === 'gt') return '>';
    if (entity === 'quot') return '"';
    if (entity === 'apos') return "'";
    const codepoint = entity.startsWith('#x') ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    if (!Number.isInteger(codepoint) || codepoint < 1 || codepoint > 0x10ffff || (codepoint >= 0xd800 && codepoint <= 0xdfff)) {
      throw new TypeError('Entidade XML inválida');
    }
    return String.fromCodePoint(codepoint);
  });
}

function field(block: string, tag: 'ideCadastro' | 'nome' | 'nomeParlamentar' | 'urlFoto' | 'uf' | 'partido'): string {
  const match = new RegExp(`<${tag}>([^<]*)<\\/${tag}>`).exec(block);
  const raw = match?.[1]?.trim() ?? '';
  if (/&(?!(?:#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);)/.test(raw)) throw new TypeError('Entidade XML não permitida');
  return decodeXml(raw).trim();
}

export function normalizeLegacyDeputies(xml: string, fetchedAt: string): Deputy[] {
  if (xml.length > 5_000_000 || /<!|<\?(?!xml\s)/i.test(xml) || !/<deputados>/.test(xml) || !/<\/deputados>\s*$/.test(xml.trim())) {
    throw new TypeError('XML de deputados inválido');
  }
  const blocks = [...xml.matchAll(/<deputado>([\s\S]*?)<\/deputado>/g)].map((match) => match[1]!);
  if (blocks.length === 0 || (xml.match(/<deputado>/g) ?? []).length !== blocks.length) {
    throw new TypeError('Lista de deputados vazia ou incompleta');
  }
  const period = buildPeriods(new Date(fetchedAt))[0]!;
  const unavailable = (message: string): DataCoverage => ({ status: 'unavailable', since: period.start, until: period.end, fetchedAt: null, sourceUrl: '', message });
  const deputies: Deputy[] = [];
  const ids = new Set<string>();
  for (const block of blocks) {
    if (field(block, 'uf') !== 'SP') continue;
    const deputyId = field(block, 'ideCadastro');
    const name = field(block, 'nomeParlamentar');
    const fullName = field(block, 'nome');
    if (!/^\d+$/.test(deputyId) || !name || !fullName || ids.has(deputyId)) {
      throw new TypeError('Deputado de SP sem ID único ou nome válido');
    }
    ids.add(deputyId);
    const party = field(block, 'partido');
    const colors = ['#5636A4', '#2F6FA3', '#AC5D42', '#3A8B70', '#A55D8A', '#7E7740'];
    const colorIndex = [...party].reduce((sum, character) => sum + character.codePointAt(0)!, 0) % colors.length;
    deputies.push({
      id: deputyId,
      name,
      fullName,
      party,
      partyColor: colors[colorIndex]!,
      bio: '',
      status: 'Em exercício',
      photo: officialUrl(field(block, 'urlFoto')) ?? '',
      state: 'SP',
      mandate: '',
      sourceLabel: 'Câmara dos Deputados · Dados Abertos',
      sourceUrl: legacyDeputiesUrl,
      fetchedAt,
      coverage: {
        expenses: { status: 'pending', since: period.start, until: period.end, fetchedAt: null, sourceUrl: `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputyId}/despesas` },
        votes: unavailable('Votos individuais ainda não integrados.'),
        proposals: unavailable('Proposições ainda não integradas.'),
        amendments: unavailable('Emendas ainda não integradas.'),
      },
      expenses: [], votes: [], proposals: [], amendments: [],
    });
  }
  if (deputies.length === 0) throw new TypeError('Nenhum deputado de SP na resposta');
  return deputies;
}
