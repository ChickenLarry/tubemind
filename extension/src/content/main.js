/* TubeMind – content script entry point */
(function (g) {
  const TM = g.TM;
  const { el, t } = TM.utils;

  // One-time tip on the first video, so people discover the shortcuts.
  TM.on('meta', async () => {
    const s = TM.state.settings;
    if (s.onboardingShown || !TM.state.isWatch) return;
    await TM.settings.set({ onboardingShown: true });
    const root = TM.ui.playerRoot();
    if (!root) return;
    const tip = el('div', { class: 'tm-onboarding' }, [
      el('strong', {}, t('onboardingTitle')),
      el('div', { class: 'tm-onboarding-keys' }, [
        el('span', {}, [el('kbd', {}, 'S'), ' ', t('onboardingSearch')]),
        el('span', {}, [el('kbd', {}, 'N'), ' ', t('onboardingNote')]),
        el('span', {}, [el('kbd', {}, 'B'), ' ', t('onboardingBookmark')]),
        el('span', {}, [el('kbd', {}, 'A'), '/', el('kbd', {}, 'D'), ' ', t('onboardingSpeed')]),
      ]),
      el('button', { class: 'tm-btn tm-btn-primary', onclick: () => tip.remove() }, t('onboardingOk')),
    ]);
    root.append(tip);
    setTimeout(() => tip.remove(), 15000);
  });

  TM.boot();
})(globalThis);
