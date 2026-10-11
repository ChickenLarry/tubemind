/* TubeMind – options page. To add a setting: add its default in shared/settings.js and one line below. */
(function (g) {
  const TM = g.TM;
  const { el, t } = TM.utils;
  const $ = (id) => document.getElementById(id);

  const SECTIONS = [
    {
      title: 'optModulesTitle',
      desc: 'optModulesDesc',
      items: [
        { path: 'modules.search', type: 'switch', label: 'modSearch', help: 'modSearchDesc' },
        { path: 'modules.summary', type: 'switch', label: 'modSummary', help: 'modSummaryDesc' },
        { path: 'modules.notes', type: 'switch', label: 'modNotes', help: 'modNotesDesc' },
        { path: 'modules.focus', type: 'switch', label: 'modFocus', help: 'modFocusDesc' },
        { path: 'modules.player', type: 'switch', label: 'modPlayer', help: 'modPlayerDesc' },
        { path: 'modules.stats', type: 'switch', label: 'modStats', help: 'modStatsDesc' },
      ],
    },
    {
      title: 'focusMode',
      desc: 'focusModeDesc',
      module: 'focus',
      items: [
        { path: 'focus.enabled', type: 'switch', label: 'optFocusEnabled' },
        { path: 'focus.hideShorts', type: 'switch', label: 'optHideShorts', sub: true },
        { path: 'focus.hideHomeFeed', type: 'switch', label: 'optHideHomeFeed', sub: true },
        { path: 'focus.hideRelated', type: 'switch', label: 'optHideRelated', sub: true },
        { path: 'focus.hideComments', type: 'switch', label: 'optHideComments', sub: true },
        { path: 'focus.hideEndscreen', type: 'switch', label: 'optHideEndscreen', sub: true },
        { path: 'focus.redirectShorts', type: 'switch', label: 'optRedirectShorts', help: 'optRedirectShortsHelp', sub: true },
      ],
    },
    {
      title: 'optSearchNotesTitle',
      items: [
        { path: 'search.showMarkers', type: 'switch', label: 'optSearchMarkers', module: 'search' },
        { path: 'notes.showMarkers', type: 'switch', label: 'optNoteMarkers', module: 'notes' },
        { path: 'notes.pauseOnNote', type: 'switch', label: 'optPauseOnNote', module: 'notes' },
        {
          path: 'summary.length',
          type: 'select',
          label: 'optSummaryLength',
          module: 'summary',
          options: [
            ['short', 'lengthShort'],
            ['medium', 'lengthMedium'],
            ['long', 'lengthLong'],
          ],
        },
      ],
    },
    {
      title: 'modPlayer',
      module: 'player',
      items: [
        { path: 'player.rememberChannelSpeed', type: 'switch', label: 'optChannelSpeed', help: 'optChannelSpeedHelp' },
        { path: 'player.speedKeys', type: 'switch', label: 'optSpeedKeys', help: 'optSpeedKeysHelp' },
        {
          path: 'player.speedStep',
          type: 'select',
          number: true,
          label: 'optSpeedStep',
          options: [
            [0.1, '0.1×'],
            [0.25, '0.25×'],
            [0.5, '0.5×'],
          ],
        },
        {
          path: 'player.maxSpeed',
          type: 'select',
          number: true,
          label: 'optMaxSpeed',
          options: [
            [2, '2×'],
            [3, '3×'],
            [4, '4×'],
            [8, '8×'],
            [16, '16×'],
          ],
        },
        { path: 'player.autoTheater', type: 'switch', label: 'optAutoTheater' },
        {
          path: 'player.preferredQuality',
          type: 'select',
          label: 'optQuality',
          options: [
            ['auto', 'qualityAuto'],
            ['hd2160', '2160p (4K)'],
            ['hd1440', '1440p'],
            ['hd1080', '1080p'],
            ['hd720', '720p'],
            ['large', '480p'],
            ['medium', '360p'],
          ],
        },
      ],
    },
    {
      title: 'optTimeTitle',
      module: 'stats',
      items: [{ path: 'stats.dailyLimitMin', type: 'number', label: 'optDailyLimit', help: 'optDailyLimitHelp', min: 0, max: 1440, step: 5 }],
    },
  ];

  const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  function patchFor(path, value) {
    const keys = path.split('.');
    const patch = {};
    let cur = patch;
    keys.forEach((k, i) => {
      cur[k] = i === keys.length - 1 ? value : {};
      cur = cur[k];
    });
    return patch;
  }
  // Option labels that are message keys get translated; literal labels (e.g. "1080p") stay as they are.
  const label = (key) => (/^[a-zA-Z]+$/.test(key) ? t(key) : key);

  let settings = TM.settings.DEFAULTS;

  function control(item) {
    const current = getPath(settings, item.path);
    if (item.type === 'switch') {
      const input = el('input', { type: 'checkbox' });
      input.checked = !!current;
      input.addEventListener('change', () => save(item.path, input.checked));
      return el('label', { class: 'switch' }, [input, el('span')]);
    }
    if (item.type === 'select') {
      const sel = el(
        'select',
        { class: 'input' },
        item.options.map(([value, text]) => el('option', { value: String(value) }, label(text)))
      );
      sel.value = String(current);
      sel.addEventListener('change', () => save(item.path, item.number ? Number(sel.value) : sel.value));
      return sel;
    }
    const input = el('input', { class: 'input', type: 'number', min: item.min, max: item.max, step: item.step });
    input.value = String(current ?? 0);
    input.addEventListener('change', () => {
      const v = Math.max(item.min ?? 0, Math.min(item.max ?? 1e9, Math.round(Number(input.value) || 0)));
      input.value = String(v);
      save(item.path, v);
    });
    return input;
  }

  async function save(path, value) {
    settings = await TM.settings.set(patchFor(path, value));
    render();
    TM.page.toast(t('saved'), 1200);
  }

  function render() {
    const box = $('sections');
    box.replaceChildren(
      ...SECTIONS.map((sec) => {
        const sectionOff = sec.module && settings.modules[sec.module] === false;
        return el('section', { class: 'card opt-section' }, [
          el('h2', {}, t(sec.title)),
          sec.desc ? el('p', { class: 'muted small' }, t(sec.desc)) : null,
          ...sec.items.map((item) => {
            const off = sectionOff || (item.module && settings.modules[item.module] === false) || (item.sub && sec.module === 'focus' && !settings.focus.enabled);
            return el('div', { class: 'opt-item' + (item.sub ? ' sub' : '') + (off ? ' disabled' : '') }, [
              el('div', {}, [el('div', { class: 'opt-label' }, t(item.label)), item.help ? el('div', { class: 'opt-help' }, t(item.help)) : null]),
              el('div', { class: 'opt-control' }, control(item)),
            ]);
          }),
        ]);
      })
    );
  }

  // ------------------------------------------------------------------ data
  function bindData() {
    $('btn-export').addEventListener('click', async () => {
      const data = await TM.store.exportAll();
      TM.utils.downloadText(`tubemind-backup-${TM.utils.dayKey()}.json`, JSON.stringify(data), 'application/json');
    });
    $('import-file').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        await TM.store.importAll(JSON.parse(await file.text()));
        settings = await TM.settings.get();
        render();
        TM.page.toast(t('dataImported'), 2500);
      } catch (err) {
        TM.page.toast(t('dataImportError'), 3000);
      }
      e.target.value = '';
    });
    const clearBtn = $('btn-clear');
    clearBtn.addEventListener('click', async () => {
      if (!clearBtn.dataset.confirm) {
        clearBtn.dataset.confirm = '1';
        clearBtn.textContent = t('dataClearConfirm');
        setTimeout(() => {
          clearBtn.dataset.confirm = '';
          clearBtn.textContent = t('dataClear');
        }, 4000);
        return;
      }
      await TM.store.clearAll();
      await TM.store.setUsage({ installDate: Date.now() });
      settings = await TM.settings.get();
      render();
      clearBtn.dataset.confirm = '';
      clearBtn.textContent = t('dataClear');
      TM.page.toast(t('dataCleared'), 2500);
    });
  }

  function showLink(id, url) {
    if (!TM.isConfigured(url)) return;
    $(id).href = url;
    $(id).hidden = false;
  }

  async function init() {
    TM.page.init();
    settings = await TM.settings.get();
    render();
    bindData();
    $('welcome').hidden = location.hash !== '#welcome';
    $('btn-library').addEventListener('click', () => TM.page.open('library'));
    $('about-version').textContent = 'TubeMind v' + g.chrome.runtime.getManifest().version;
    $('link-rate').href = TM.config.reviewUrl;
    showLink('link-donate', TM.config.donateUrl);
    showLink('link-privacy', TM.config.privacyUrl);
    showLink('link-website', TM.config.websiteUrl);
    TM.settings.onChange((s) => {
      settings = s;
      render();
    });
  }

  init();
})(globalThis);
