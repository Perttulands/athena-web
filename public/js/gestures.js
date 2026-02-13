// Touch gesture utilities for mobile interactions

const PULL_THRESHOLD = 60; // pixels to pull before triggering refresh
const SWIPE_THRESHOLD = 50; // pixels to swipe before triggering
const SWIPE_MAX_VERTICAL = 30; // max vertical movement for horizontal swipe

/**
 * Enable pull-to-refresh on an element
 * @param {HTMLElement} element - Element to attach gesture to
 * @param {Function} onRefresh - Callback when refresh is triggered
 * @returns {Function} Cleanup function to remove listeners
 */
export function enablePullToRefresh(element, onRefresh) {
  if (typeof window === 'undefined') return () => {};

  let startY = 0;
  let currentY = 0;
  let isPulling = false;
  let indicator = null;

  function handleTouchStart(e) {
    // Only trigger when at the top of scroll
    if (element.scrollTop > 0) return;

    startY = e.touches[0].clientY;
    isPulling = true;
  }

  function handleTouchMove(e) {
    if (!isPulling) return;

    currentY = e.touches[0].clientY;
    const pullDistance = currentY - startY;

    // Only track downward pulls
    if (pullDistance <= 0) {
      removePullIndicator();
      return;
    }

    // Show pull indicator
    if (!indicator && pullDistance > 10) {
      indicator = document.createElement('div');
      indicator.className = 'pull-refresh-indicator';
      indicator.innerHTML = '<div class="spinner"></div>';
      element.insertBefore(indicator, element.firstChild);
    }

    // Update indicator position
    if (indicator) {
      indicator.style.transform = `translateY(${Math.min(pullDistance, PULL_THRESHOLD)}px)`;

      if (pullDistance >= PULL_THRESHOLD) {
        indicator.classList.add('ready');
      } else {
        indicator.classList.remove('ready');
      }
    }
  }

  function handleTouchEnd(e) {
    if (!isPulling) return;

    const pullDistance = currentY - startY;
    isPulling = false;

    if (pullDistance >= PULL_THRESHOLD) {
      // Trigger refresh
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
      }

      if (indicator) {
        indicator.classList.add('refreshing');
      }

      // Call the refresh callback
      onRefresh();

      // Remove indicator after a delay
      setTimeout(removePullIndicator, 1000);
    } else {
      removePullIndicator();
    }

    startY = 0;
    currentY = 0;
  }

  function removePullIndicator() {
    if (indicator) {
      indicator.remove();
      indicator = null;
    }
  }

  element.addEventListener('touchstart', handleTouchStart, { passive: true });
  element.addEventListener('touchmove', handleTouchMove, { passive: true });
  element.addEventListener('touchend', handleTouchEnd, { passive: true });

  // Return cleanup function
  return () => {
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchmove', handleTouchMove);
    element.removeEventListener('touchend', handleTouchEnd);
    removePullIndicator();
  };
}

/**
 * Enable swipe gesture detection on an element
 * @param {HTMLElement} element - Element to attach gesture to
 * @param {Function} onSwipe - Callback with direction ('left' or 'right')
 * @returns {Function} Cleanup function to remove listeners
 */
export function enableSwipe(element, onSwipe) {
  if (typeof window === 'undefined') return () => {};

  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;

  function handleTouchStart(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }

  function handleTouchMove(e) {
    currentX = e.touches[0].clientX;
    currentY = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    // Check if swipe is primarily horizontal
    if (Math.abs(deltaY) > SWIPE_MAX_VERTICAL) {
      return; // Too much vertical movement, not a horizontal swipe
    }

    // Check if swipe meets threshold
    if (Math.abs(deltaX) >= SWIPE_THRESHOLD) {
      const direction = deltaX > 0 ? 'right' : 'left';
      onSwipe(direction);
    }

    // Reset
    startX = 0;
    startY = 0;
    currentX = 0;
    currentY = 0;
  }

  element.addEventListener('touchstart', handleTouchStart, { passive: true });
  element.addEventListener('touchmove', handleTouchMove, { passive: true });
  element.addEventListener('touchend', handleTouchEnd, { passive: true });

  // Return cleanup function
  return () => {
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchmove', handleTouchMove);
    element.removeEventListener('touchend', handleTouchEnd);
  };
}
