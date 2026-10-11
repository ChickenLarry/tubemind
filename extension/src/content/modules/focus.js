/* TubeMind – Focus mode: hide Shorts, home feed, recommendations, comments, end screens */
(function (g) {
  const TM = g.TM;
  const { el, t, waitFor } = TM.utils;

  const CLASS_MAP = {
    hideShorts: 'tm-hide-shorts',
    hideHomeFeed: 'tm-hide-home',
    hideRelated: 'tm-hide-related',
    hideComments: 'tm-hide-comments',
    hideEndscreen: 'tm-hide-endscreen',
  };
  const ALL_CLASSES = ['tm-focus', ...Object.values(CLASS_MAP)];
  const CACHE_KEY = 'tubemind-focus-classes';
  const root = document.documentElement;
  let homeRevealed = false;

  // Apply the last known state synchronously at document_start -> no flicker.
  try {
    const cached = g.localStorage.getItem(CACHE_KEY);
    if (cached) root.classList.add(...cached.split(' ').filter(Boolean));
  } catch (e) {
    /* storage blocked */
  }

  function apply() {
    const s = TM.state.settings;
    const on = TM.isModuleOn('focus') && s.focus.enabled;
    let classes = [];
    if (on) {
      classes.push('tm-focus');
      for (const [key, cls] of Object.entries(CLASS_MAP)) if (s.focus[key]) classes.push(cls);
    }
    try {
      g.localStorage.setItem(CACHE_KEY, classes.join(' '));
    } catch (e) {
      /* ignore */
    }
    if (homeRevealed) classes = classes.filter((c) => c !== 'tm-hide-home');
    ALL_CLASSES.forEach((c) => root.classList.toggle(c, classes.includes(c)));
    if (classes.includes('tm-hide-home')) ensureHomeMessage();
  }

  async function ensureHomeMessage() {
    if (location.pathname !== '/') return;
    const browse = await waitFor(() => document.querySelector('ytd-browse[page-subtype="home"]'), 8000);
    if (!browse || browse.querySelector('.tm-calm')) return;
    const box = el('div', { class: 'tm-calm' }, [
      el('div', { class: 'tm-calm-icon' }, '🧘'),
      el('h2', {}, t('focusHomeTitle')),
      el('p', {}, t('focusHomeText')),
      el(
        'button',
        {
          class: 'tm-calm-btn',
          onclick: () => {
            homeRevealed = true;
            root.classList.remove('tm-hide-home');
          },
        },
        t('focusHomeShowAnyway')
      ),
    ]);
    const primary = browse.querySelector('#primary') || browse;
    primary.prepend(box);
  }

  function maybeRedirectShorts(info) {
    const s = TM.state.settings;
    if (!info.isShorts || !info.videoId || !s.focus.enabled || !s.focus.redirectShorts) return;
    location.replace('/watch?v=' + encodeURIComponent(info.videoId));
  }

  TM.registerModule({
    id: 'focus',
    start: apply,
    stop: apply,
    onSettings: apply,
    onVideo(info) {
      maybeRedirectShorts(info);
      if (root.classList.contains('tm-hide-home')) ensureHomeMessage();
    },
  });
})(globalThis);
