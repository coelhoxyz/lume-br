export type Period = { id: string; label: string; start: string; end: string };
export type DataCoverage = {
  status: 'pending' | 'complete' | 'unavailable' | 'partial';
  since: string;
  until: string;
  fetchedAt: string | null;
  sourceUrl: string;
  message?: string;
};
export type Expense = {
  id: string;
  date: string;
  documentDate?: string | null;
  category: string;
  supplier: string;
  amountCents: number | null;
  receiptUrl: string | null;
};
export type VotePosition = 'Sim' | 'Não' | 'Abstenção' | 'Obstrução' | 'Não informado';
export type Vote = {
  id: string;
  date: string;
  title: string;
  objectType: string;
  position: VotePosition;
  result: string;
  status: string;
  summary: string;
  proposalCode: string;
  sourceUrl: string | null;
};
export type Proposal = {
  id: string;
  date: string;
  title: string;
  code: string;
  kind: string;
  status: string;
  summary: string;
  sourceUrl: string | null;
};
export type AmendmentSnapshot = {
  date: string;
  committedCents: number | null;
  liquidatedCents: number | null;
  paidCents: number | null;
};
export type Amendment = {
  id: string;
  year: number;
  city: string;
  purpose: string;
  beneficiary: string;
  area: string;
  indicatedCents: number;
  snapshots: AmendmentSnapshot[];
};
export type Deputy = {
  id: string;
  name: string;
  fullName: string;
  party: string;
  partyColor: string;
  bio: string;
  status: string;
  photo: string;
  state: string;
  mandate: string;
  sourceLabel: string;
  sourceUrl: string;
  fetchedAt: string;
  coverage: { expenses: DataCoverage; votes: DataCoverage; proposals: DataCoverage; amendments: DataCoverage };
  expenses: Expense[];
  votes: Vote[];
  proposals: Proposal[];
  amendments: Amendment[];
};
export type Activity = { type: 'vote' | 'proposal' | 'expense'; id: string; title: string; date: string };
export type ExpenseMonth = { month: string; label: string; totalCents: number; missingCount: number };
export type ExpenseCategoryTotal = { category: string; totalCents: number; count: number; missingCount: number };
export type AmendmentAsOf = Amendment & { latestSnapshot: AmendmentSnapshot | null };

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildPeriods(now: Date): Period[] {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric' }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value) - 1;
  const end = new Date(Date.UTC(year, month, 0));
  const startMonth = (back: number) => new Date(Date.UTC(year, month - back, 1));
  const short = (date: Date) => new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(date).replace('.', '');
  const startLabel = (date: Date) => { const label = short(date); return `${label.charAt(0).toUpperCase()}${label.slice(1)}`; };
  const full = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(end);
  return [
    { id: 'six-months', label: `${startLabel(startMonth(6))}–${short(end)} ${end.getUTCFullYear()}`, start: isoDate(startMonth(6)), end: isoDate(end) },
    { id: 'quarter', label: `${startLabel(startMonth(3))}–${short(end)} ${end.getUTCFullYear()}`, start: isoDate(startMonth(3)), end: isoDate(end) },
    { id: 'month', label: `${full.charAt(0).toUpperCase()}${full.slice(1)} ${end.getUTCFullYear()}`, start: isoDate(startMonth(1)), end: isoDate(end) },
  ];
}

export const periods: Period[] = buildPeriods(new Date());
export const defaultPeriod = periods[0]!;

export function resolvePeriod(id?: string): Period {
  return periods.find((period) => period.id === id) ?? defaultPeriod;
}

export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
}

function inPeriod(date: string, period: Period): boolean {
  return date >= period.start && date <= period.end;
}

export function selectExpenses(deputy: Deputy, period: Period): Expense[] {
  return deputy.expenses.filter((expense) => inPeriod(expense.date, period)).sort((a, b) => b.date.localeCompare(a.date));
}

export function selectVotes(deputy: Deputy, period: Period): Vote[] {
  return deputy.votes.filter((vote) => inPeriod(vote.date, period)).sort((a, b) => b.date.localeCompare(a.date));
}

export function selectProposals(deputy: Deputy, period: Period): Proposal[] {
  return deputy.proposals.filter((proposal) => inPeriod(proposal.date, period)).sort((a, b) => b.date.localeCompare(a.date));
}

export function expenseTotalCents(expenses: Expense[]): number {
  return sumKnown(expenses.map((expense) => expense.amountCents)).totalCents;
}

export function expenseMonths(expenses: Expense[], period: Period): ExpenseMonth[] {
  const months: ExpenseMonth[] = [];
  const start = new Date(`${period.start.slice(0, 7)}-01T00:00:00Z`);
  const endMonth = period.end.slice(0, 7);
  const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });
  for (const date = new Date(start); date.toISOString().slice(0, 7) <= endMonth; date.setUTCMonth(date.getUTCMonth() + 1)) {
    const month = date.toISOString().slice(0, 7);
    const amount = sumKnown(expenses.filter((expense) => expense.date.startsWith(month) && inPeriod(expense.date, period)).map((expense) => expense.amountCents));
    months.push({ month, label: formatter.format(date).replace('.', ''), totalCents: amount.totalCents, missingCount: amount.missingCount });
  }
  return months;
}

export function expenseCategories(expenses: Expense[]): ExpenseCategoryTotal[] {
  const totals = new Map<string, ExpenseCategoryTotal>();
  for (const expense of expenses) {
    const current = totals.get(expense.category) ?? { category: expense.category, totalCents: 0, count: 0, missingCount: 0 };
    current.totalCents += expense.amountCents ?? 0;
    current.count += 1;
    current.missingCount += expense.amountCents === null ? 1 : 0;
    totals.set(expense.category, current);
  }
  return [...totals.values()].sort((a, b) => b.totalCents - a.totalCents || a.category.localeCompare(b.category, 'pt-BR'));
}

export function latestActivity(deputy: Deputy, period: Period): Activity | null {
  const activities: Activity[] = [
    ...selectVotes(deputy, period).map(({ id, date, title }) => ({ type: 'vote' as const, id, date, title })),
    ...selectProposals(deputy, period).map(({ id, date, title }) => ({ type: 'proposal' as const, id, date, title })),
    ...selectExpenses(deputy, period).map(({ id, date, category }) => ({ type: 'expense' as const, id, date, title: `Despesa com ${category.toLocaleLowerCase('pt-BR')}` })),
  ];
  return activities.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))[0] ?? null;
}

export function selectAmendments(deputy: Deputy, asOfDate: string): AmendmentAsOf[] {
  return deputy.amendments.map((amendment) => ({
    ...amendment,
    latestSnapshot: [...amendment.snapshots].filter((snapshot) => snapshot.date <= asOfDate).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null,
  }));
}

export function sumKnown(values: (number | null)[]): { totalCents: number; missingCount: number } {
  return values.reduce((sum, value) => ({
    totalCents: sum.totalCents + (value ?? 0),
    missingCount: sum.missingCount + (value === null ? 1 : 0),
  }), { totalCents: 0, missingCount: 0 });
}
