/* ==========================================================================
   ExtingoAlert — shared fire-alert popup + siren
   Used by index.html (manual dashboard) and dispatch-demo.html
   ========================================================================== */
(function (global) {
  'use strict';

  var audioCtx = null;
  var oscillators = [];
  var sirenInterval = null;
  var overlayEl = null;
  var acknowledged = false;

  /* ------------------------------------------------------------------ *
   * Build the overlay markup once, lazily, on first use
   * ------------------------------------------------------------------ */
  function ensureOverlay() {
    if (overlayEl) return overlayEl;

    overlayEl = document.createElement('div');
    overlayEl.className = 'ext-alert-overlay';
    overlayEl.setAttribute('role', 'alertdialog');
    overlayEl.setAttribute('aria-modal', 'true');
    overlayEl.setAttribute('aria-labelledby', 'ext-alert-title');
    overlayEl.innerHTML =
      '<div class="ext-alert-card">' +
        '<div class="ext-alert-icon" aria-hidden="true">🔥</div>' +
        '<h2 class="ext-alert-title" id="ext-alert-title">FIRE DETECTED</h2>' +
        '<p class="ext-alert-detail" id="ext-alert-detail"></p>' +
        '<button type="button" class="ext-alert-ack" id="ext-alert-ack">Acknowledge</button>' +
      '</div>';
    document.body.appendChild(overlayEl);

    overlayEl.querySelector('#ext-alert-ack').addEventListener('click', hide);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlayEl.classList.contains('is-visible')) hide();
    });

    return overlayEl;
  }

  /* ------------------------------------------------------------------ *
   * Siren — two-tone oscillator sweep, generated in-browser (no audio
   * file needed, works fully offline)
   * ------------------------------------------------------------------ */
  function startSiren() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      var toneHigh = 880;
      var toneLow = 660;
      var toggle = false;

      function playTone(freq) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.value = 0.001;
        gain.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.55);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.6);
        oscillators.push(osc);
      }

      playTone(toneHigh);
      sirenInterval = setInterval(function () {
        toggle = !toggle;
        playTone(toggle ? toneLow : toneHigh);
      }, 600);
    } catch (e) {
      console.warn('[ExtingoAlert] Web Audio unavailable:', e.message);
    }
  }

  function stopSiren() {
    if (sirenInterval) { clearInterval(sirenInterval); sirenInterval = null; }
    oscillators.length = 0;
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */
  function show(detailText, onAcknowledge) {
    var el = ensureOverlay();
    acknowledged = false;
    el.querySelector('#ext-alert-detail').textContent = detailText || '';
    el.classList.add('is-visible');
    startSiren();

    var ackBtn = el.querySelector('#ext-alert-ack');
    ackBtn.focus();

    function handler() {
      if (typeof onAcknowledge === 'function') onAcknowledge();
      ackBtn.removeEventListener('click', handler);
    }
    ackBtn.addEventListener('click', handler);
  }

  function hide() {
    if (!overlayEl) return;
    overlayEl.classList.remove('is-visible');
    stopSiren();
    acknowledged = true;
  }

  global.ExtingoAlert = { show: show, hide: hide };

})(window);
