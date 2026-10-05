const profile = document.querySelector<HTMLElement>('[data-profile]');

if (profile) {
  const tabs = Array.from(profile.querySelectorAll<HTMLButtonElement>('[data-tab]'));
  const panels = Array.from(profile.querySelectorAll<HTMLElement>('[data-panel]'));
  const periodSelect = profile.querySelector<HTMLSelectElement>('[data-period-select]');
  const exploreLink = document.querySelector<HTMLAnchorElement>('[data-explore-link]');
  const validTabs = new Set(tabs.map((tab) => tab.dataset.tab));
  const validPeriods = new Set(Array.from(periodSelect?.options ?? []).map((option) => option.value));
  const defaultPeriod = profile.dataset.defaultPeriod ?? periodSelect?.value ?? '';

  function readState() {
    const hash = window.location.hash.slice(1);
    const requestedPeriod = new URLSearchParams(window.location.search).get('period');
    return {
      tab: validTabs.has(hash) ? hash : 'visao-geral',
      period: requestedPeriod && validPeriods.has(requestedPeriod) ? requestedPeriod : defaultPeriod,
    };
  }

  function applyState() {
    const { tab, period } = readState();
    tabs.forEach((button) => {
      const active = button.dataset.tab === tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      button.classList.toggle('is-active', active);
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab;
      panel.querySelectorAll<HTMLElement>('[data-period]').forEach((content) => {
        content.hidden = content.dataset.period !== period;
      });
    });
    if (periodSelect) periodSelect.value = period;
    if (exploreLink) {
      const url = new URL('/', window.location.origin);
      const params = new URLSearchParams(window.location.search);
      for (const key of ['q', 'party']) {
        const value = params.get(key);
        if (value) url.searchParams.set(key, value);
      }
      url.searchParams.set('period', period);
      exploreLink.href = `${url.pathname}${url.search}`;
    }
  }

  function navigate(tab: string, period: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('period', period);
    url.hash = tab;
    window.history.pushState(null, '', url);
    applyState();
  }

  tabs.forEach((button, index) => {
    button.addEventListener('click', () => navigate(button.dataset.tab ?? 'visao-geral', periodSelect?.value ?? defaultPeriod));
    button.addEventListener('keydown', (event) => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[next].focus();
      navigate(tabs[next].dataset.tab ?? 'visao-geral', periodSelect?.value ?? defaultPeriod);
    });
  });

  periodSelect?.addEventListener('change', () => {
    navigate(readState().tab, periodSelect.value);
  });

  window.addEventListener('popstate', applyState);
  window.addEventListener('hashchange', applyState);
  applyState();
}
