import { normalizeSearch, resolvePeriod, defaultPeriod } from '../lib/data';

const form = document.querySelector<HTMLFormElement>('[data-filter-form]');
const search = document.querySelector<HTMLInputElement>('#deputy-search')!;
const party = document.querySelector<HTMLSelectElement>('#party-filter')!;
const period = document.querySelector<HTMLSelectElement>('#period-filter')!;
const cards = [...document.querySelectorAll<HTMLElement>('[data-deputy-card]')];
const toolbarReset = document.querySelector<HTMLButtonElement>('.results-toolbar [data-reset]');

function update(writeUrl = true) {
  const selectedPeriod = resolvePeriod(period.value);
  const query = normalizeSearch(search.value);
  let count = 0;
  const params = new URLSearchParams();
  if (search.value.trim()) params.set('q', search.value.trim());
  if (party.value) params.set('party', party.value);
  if (selectedPeriod.id !== defaultPeriod.id) params.set('period', selectedPeriod.id);
  const suffix = params.size ? `?${params}` : '';
  for (const card of cards) {
    const matches = normalizeSearch(`${card.dataset.name} ${card.dataset.party}`).includes(query) && (!party.value || card.dataset.party === party.value);
    card.hidden = !matches;
    if (matches) count++;
    card.querySelectorAll<HTMLElement>('[data-card-period]').forEach(content => { content.hidden = content.dataset.cardPeriod !== selectedPeriod.id; });
    const link = card.querySelector<HTMLAnchorElement>('[data-profile-link]')!;
    link.href = `${new URL(link.href).pathname}${suffix}`;
  }
  const result = document.querySelector('[data-result-count]')!;
  result.replaceChildren();
  const number = document.createElement('strong'); number.textContent = String(count);
  const label = document.createElement('span'); label.textContent = ` · ${selectedPeriod.label}`;
  result.append(number, ` ${count === 1 ? 'deputado' : 'deputados'}`, label);
  document.querySelector('[data-period-caption]')!.textContent = selectedPeriod.label;
  document.querySelector<HTMLElement>('[data-empty]')!.hidden = count > 0;
  if (toolbarReset) toolbarReset.hidden = !search.value && !party.value && selectedPeriod.id === defaultPeriod.id;
  if (writeUrl) history.replaceState(null, '', `${location.pathname}${suffix}`);
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  search.value = params.get('q') || '';
  party.value = params.get('party') || '';
  if (!party.value) party.value = '';
  period.value = resolvePeriod(params.get('period') ?? undefined).id;
  update(false);
}

form?.addEventListener('submit', event => { event.preventDefault(); update(); });
search.addEventListener('input', () => update());
party.addEventListener('change', () => update());
period.addEventListener('change', () => update());
document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => {
  search.value = ''; party.value = ''; period.value = defaultPeriod.id; update(); search.focus();
}));
window.addEventListener('popstate', readUrl);
window.addEventListener('pageshow', readUrl);
readUrl();
