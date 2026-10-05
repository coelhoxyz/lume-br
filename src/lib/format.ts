const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const fullDate = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const abbreviatedDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });

export const money = (cents: number | null) => cents === null ? 'Não informado' : currency.format(cents / 100);
export const shortMoney = (cents: number | null) => cents === null ? 'Não informado' : compact.format(cents / 100);
export const dateLabel = (date: string) => fullDate.format(new Date(`${date}T12:00:00Z`));
export const shortDate = (date: string) => abbreviatedDate.format(new Date(`${date}T12:00:00Z`));
