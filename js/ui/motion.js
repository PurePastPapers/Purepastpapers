// Reveal off-screen sections once as they enter the viewport. Content stays
// visible when motion is reduced or IntersectionObserver is unavailable.
export function revealOnScroll(root) {
  if (!('IntersectionObserver' in window)) return () => {};

  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const targets = [...root.querySelectorAll('[data-reveal]')];
  const pending = new Set();
  const reveal = (element) => {
    element.classList.add('is-revealed');
    pending.delete(element);
    observer.unobserve(element);
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) reveal(entry.target);
    }
  }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });

  if (!preference.matches) {
    for (const element of targets) {
      // Never hide content that is already on screen, including restored scroll
      // positions. The CSS hidden state is enabled only after this check.
      if (element.getBoundingClientRect().top < window.innerHeight) continue;
      element.classList.add('reveal-ready');
      pending.add(element);
      observer.observe(element);
    }
  }

  const onPreferenceChange = () => {
    if (preference.matches) {
      for (const element of pending) reveal(element);
    }
  };
  const onFocus = (event) => {
    if (!(event.target instanceof Element)) return;
    // A keyboard user can tab into a section before scrolling to it.
    let element = event.target.closest('[data-reveal]');
    while (element && root.contains(element)) {
      if (pending.has(element)) reveal(element);
      element = element.parentElement?.closest('[data-reveal]');
    }
  };
  preference.addEventListener('change', onPreferenceChange);
  root.addEventListener('focusin', onFocus);

  return () => {
    observer.disconnect();
    preference.removeEventListener('change', onPreferenceChange);
    root.removeEventListener('focusin', onFocus);
    for (const element of targets) element.classList.remove('reveal-ready', 'is-revealed');
    pending.clear();
  };
}
