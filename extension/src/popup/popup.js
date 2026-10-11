/* TubeMind – toolbar popup */
(function (g) {
  const TM = g.TM;
  const { t, dayKey, formatDuration } = TM.utils;
  const $ = (id) => document.getElementById(id);

  let windowId = null;

  async function renderSettings() {
    const s = await TM.settings.get();
    $('focus-section').hidden = s.modules.focus === false;
    $('today-section').hidden = s.modules.stats === false;
    $('focus-enabled').checked = !!s.focus.enabled;
    $('focus-options').classList.toggle('off', !s.focus.enabled);
    document.querySelectorAll('[data-focus]').forEach((input) => {
      input.checked = !!s.focus[input.dataset.focus];
    });
    return s;
  }

  async function renderToday(s) {
    const stats = await TM.store.getStats();
    const today = stats[dayKey()] || { w: 0, s: 0 };
    $('today-total').textContent = formatDuration(today.w);
    $('today-shorts').textContent = today.s >= 60 ? t('todayShorts', [formatDuration(today.s)]) : '';
    const limit = Number(s.stats.dailyLimitMin) || 0;
    $('limit-bar').hidden = !limit;
    if (limit) {
      const frac = today.w / (limit * 60);
      $('limit-fill').style.width = Math.min(100, Math.round(frac * 100)) + '%';
      $('limit-fill').classList.toggle('over', frac >= 1);
      $('limit-text').textContent = t('todayLimit', [formatDuration(limit * 60)]);
    } else {
      $('limit-text').textContent = '';
    }
  }

  async function maybeShowRate() {
    const usage = await TM.store.bumpUsage('popupOpens');
    const days = (Date.now() - (usage.installDate || Date.now())) / 86400000;
    const activity = (usage.notes || 0) + (usage.summaries || 0) + (usage.searches || 0);
    const snoozed = (usage.rateSnoozedUntil || 0) > Date.now();
    if (usage.rated || snoozed || days < 3 || activity < 5) return false;
    $('rate').hidden = false;
    $('btn-rate').href = TM.config.reviewUrl;
    $('btn-rate').addEventListener('click', () => TM.store.setUsage({ rated: true }));
    $('btn-rate-later').addEventListener('click', () => {
      TM.store.setUsage({ rateSnoozedUntil: Date.now() + 14 * 86400000 });
      $('rate').hidden = true;
    });
    return true;
  }

  function bind() {
    $('focus-enabled').addEventListener('change', (e) => {
      $('focus-options').classList.toggle('off', !e.target.checked);
      TM.settings.set({ focus: { enabled: e.target.checked } });
    });
    document.querySelectorAll('[data-focus]').forEach((input) =>
      input.addEventListener('change', () => TM.settings.set({ focus: { [input.dataset.focus]: input.checked } }))
    );
    $('btn-panel').addEventListener('click', () => {
      // sidePanel.open() must run synchronously inside the click.
      if (windowId == null) return;
      g.chrome.sidePanel
        .open({ windowId })
        .then(() => g.close())
        .catch(() => TM.page.toast(t('errorGeneric')));
    });
    $('btn-library').addEventListener('click', () => {
      TM.page.open('library');
      g.close();
    });
    $('btn-options').addEventListener('click', () => {
      g.chrome.runtime.openOptionsPage();
      g.close();
    });
  }

  async function init() {
    TM.page.init();
    g.chrome.windows.getCurrent().then((w) => (windowId = w.id));
    bind();
    const s = await renderSettings();
    renderToday(s);
    const rateShown = await maybeShowRate();

    $('version').textContent = 'v' + g.chrome.runtime.getManifest().version;
    if (TM.isConfigured(TM.config.donateUrl)) {
      $('link-donate').href = TM.config.donateUrl;
      $('link-donate').hidden = false;
    }
    if (TM.isConfigured(TM.config.privacyUrl)) {
      $('link-privacy').href = TM.config.privacyUrl;
      $('link-privacy').hidden = false;
    }
    TM.sponsor.render($('sponsor'), 'popup', { skipRate: rateShown });
  }

  init();
})(globalThis);
