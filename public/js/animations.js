/**
 * Animation helpers with reduced-motion support.
 */

function mediaQueryReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function raf(callback) {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(Date.now()), 16);
}

export function prefersReducedMotion() {
  return mediaQueryReducedMotion();
}

export function applyStagger(container, selector = '.card-appear', stepMs = 50) {
  if (!container) return [];

  const elements = Array.from(container.querySelectorAll(selector));

  if (prefersReducedMotion()) {
    elements.forEach((element) => {
      element.style.animationDelay = '0ms';
    });
    return elements;
  }

  elements.forEach((element, index) => {
    element.style.animationDelay = `${index * stepMs}ms`;
  });

  return elements;
}

export function animateCountUp(element, targetValue, durationMs = 300) {
  if (!element) return;

  const target = Number(targetValue);
  if (!Number.isFinite(target)) {
    element.textContent = String(targetValue);
    return;
  }

  if (prefersReducedMotion()) {
    element.textContent = String(Math.round(target));
    return;
  }

  const start = performance.now();

  function tick(now) {
    const progress = Math.min(1, (now - start) / durationMs);
    const value = Math.round(target * progress);
    element.textContent = String(value);

    if (progress < 1) {
      raf(tick);
    }
  }

  raf(tick);
}

export function applyPageEnterAnimation(scope) {
  if (!scope) return;

  if (prefersReducedMotion()) {
    scope.classList.remove('page-enter');
    return;
  }

  scope.classList.remove('page-enter');
  raf(() => {
    scope.classList.add('page-enter');
  });
}

export default {
  prefersReducedMotion,
  applyStagger,
  animateCountUp,
  applyPageEnterAnimation
};
