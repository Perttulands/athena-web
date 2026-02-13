import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Setup DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Mock navigator if needed
if (typeof global.navigator === 'undefined') {
  Object.defineProperty(global, 'navigator', {
    value: { vibrate: () => {} },
    writable: true
  });
} else if (!global.navigator.vibrate) {
  global.navigator.vibrate = () => {};
}

// Import the gestures module
const gestures = await import('../../public/js/gestures.js?t=' + Date.now());

describe('Gesture utilities', () => {
  let element;

  beforeEach(() => {
    // Create a fresh element for each test
    element = document.createElement('div');
    document.body.appendChild(element);
  });

  describe('Pull-to-refresh detection', () => {
    it('should detect pull-to-refresh when pulling down from top', () => {
      let refreshTriggered = false;
      gestures.enablePullToRefresh(element, () => {
        refreshTriggered = true;
      });

      // Simulate touch events: start at top, pull down 70px
      const touchStart = new dom.window.TouchEvent('touchstart', {
        touches: [{ clientY: 10 }]
      });
      const touchMove = new dom.window.TouchEvent('touchmove', {
        touches: [{ clientY: 80 }]
      });
      const touchEnd = new dom.window.TouchEvent('touchend', {});

      element.dispatchEvent(touchStart);
      element.dispatchEvent(touchMove);
      element.dispatchEvent(touchEnd);

      assert.strictEqual(refreshTriggered, true, 'Refresh should be triggered after pulling > 60px');
    });

    it('should not trigger refresh when pulling less than threshold', () => {
      let refreshTriggered = false;
      gestures.enablePullToRefresh(element, () => {
        refreshTriggered = true;
      });

      const touchStart = new dom.window.TouchEvent('touchstart', {
        touches: [{ clientY: 10 }]
      });
      const touchMove = new dom.window.TouchEvent('touchmove', {
        touches: [{ clientY: 50 }]  // Only 40px, below 60px threshold
      });
      const touchEnd = new dom.window.TouchEvent('touchend', {});

      element.dispatchEvent(touchStart);
      element.dispatchEvent(touchMove);
      element.dispatchEvent(touchEnd);

      assert.strictEqual(refreshTriggered, false, 'Refresh should not trigger below threshold');
    });

    it('should not trigger when not at top of scroll', () => {
      let refreshTriggered = false;
      element.style.overflow = 'auto';
      element.style.height = '100px';
      element.innerHTML = '<div style="height: 300px;"></div>';
      element.scrollTop = 50;  // Scrolled down

      gestures.enablePullToRefresh(element, () => {
        refreshTriggered = true;
      });

      const touchStart = new dom.window.TouchEvent('touchstart', {
        touches: [{ clientY: 10 }]
      });
      const touchMove = new dom.window.TouchEvent('touchmove', {
        touches: [{ clientY: 80 }]
      });
      const touchEnd = new dom.window.TouchEvent('touchend', {});

      element.dispatchEvent(touchStart);
      element.dispatchEvent(touchMove);
      element.dispatchEvent(touchEnd);

      assert.strictEqual(refreshTriggered, false, 'Should not trigger when scrolled down');
    });

    it('should show pull indicator during pull', () => {
      gestures.enablePullToRefresh(element, () => {});

      const touchStart = new dom.window.TouchEvent('touchstart', {
        touches: [{ clientY: 10 }]
      });
      const touchMove = new dom.window.TouchEvent('touchmove', {
        touches: [{ clientY: 50 }]
      });

      element.dispatchEvent(touchStart);
      element.dispatchEvent(touchMove);

      const indicator = element.querySelector('.pull-refresh-indicator');
      assert.ok(indicator, 'Pull indicator should be present during pull');
    });
  });

  describe('Swipe gesture detection', () => {
    it('should detect left swipe', () => {
      let swipeDirection = null;
      gestures.enableSwipe(element, (direction) => {
        swipeDirection = direction;
      });

      const touchStart = new dom.window.TouchEvent('touchstart', {
        touches: [{ clientX: 200, clientY: 100 }]
      });
      const touchMove = new dom.window.TouchEvent('touchmove', {
        touches: [{ clientX: 100, clientY: 100 }]
      });
      const touchEnd = new dom.window.TouchEvent('touchend', {});

      element.dispatchEvent(touchStart);
      element.dispatchEvent(touchMove);
      element.dispatchEvent(touchEnd);

      assert.strictEqual(swipeDirection, 'left', 'Should detect left swipe');
    });

    it('should detect right swipe', () => {
      let swipeDirection = null;
      gestures.enableSwipe(element, (direction) => {
        swipeDirection = direction;
      });

      const touchStart = new dom.window.TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 }]
      });
      const touchMove = new dom.window.TouchEvent('touchmove', {
        touches: [{ clientX: 200, clientY: 100 }]
      });
      const touchEnd = new dom.window.TouchEvent('touchend', {});

      element.dispatchEvent(touchStart);
      element.dispatchEvent(touchMove);
      element.dispatchEvent(touchEnd);

      assert.strictEqual(swipeDirection, 'right', 'Should detect right swipe');
    });

    it('should not trigger swipe for short distance', () => {
      let swipeDirection = null;
      gestures.enableSwipe(element, (direction) => {
        swipeDirection = direction;
      });

      const touchStart = new dom.window.TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 }]
      });
      const touchMove = new dom.window.TouchEvent('touchmove', {
        touches: [{ clientX: 120, clientY: 100 }]  // Only 20px, below threshold
      });
      const touchEnd = new dom.window.TouchEvent('touchend', {});

      element.dispatchEvent(touchStart);
      element.dispatchEvent(touchMove);
      element.dispatchEvent(touchEnd);

      assert.strictEqual(swipeDirection, null, 'Should not trigger for short distance');
    });

    it('should ignore vertical swipes', () => {
      let swipeDirection = null;
      gestures.enableSwipe(element, (direction) => {
        swipeDirection = direction;
      });

      const touchStart = new dom.window.TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 }]
      });
      const touchMove = new dom.window.TouchEvent('touchmove', {
        touches: [{ clientX: 100, clientY: 200 }]  // Vertical movement
      });
      const touchEnd = new dom.window.TouchEvent('touchend', {});

      element.dispatchEvent(touchStart);
      element.dispatchEvent(touchMove);
      element.dispatchEvent(touchEnd);

      assert.strictEqual(swipeDirection, null, 'Should ignore vertical swipes');
    });
  });
});
