/* ==========================================================================
   How Extingo Works — phase controller
   Steps through Scan -> Detect & Confirm -> Human-Safety Check -> Suppress
   -> Alert Cascade, alternating the human-safety branch each full loop.
   All actual motion lives in CSS, keyed off data-phase / data-branch
   attributes on #hiw-stage; this script only owns timing and labels.
   ========================================================================== */
(function () {
  var stage = document.getElementById('hiw-stage');
  if (!stage) return;

  var stepEls = document.querySelectorAll('#hiw-steps .hiw-step');
  var announcer = document.getElementById('hiw-announcer');

  var PHASES = [
    { name: 'scan', duration: 2700, announce: 'Scanning the room' },
    { name: 'detect', duration: 2800, announce: 'Flame detected, confirming' },
    { name: 'safety', duration: 2600, announce: 'Checking for people in range' },
    { name: 'suppress', duration: 2900, announce: 'Suppressing the fire' },
    { name: 'alert', duration: 4200, announce: 'Sending alert cascade' }
  ];

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var loopCount = 0;
  var phaseIndex = 0;
  var timer = null;

  function setActiveStep(name) {
    stepEls.forEach(function (el) {
      el.classList.toggle('is-active', el.getAttribute('data-step') === name);
    });
  }

  function runPhase(index) {
    var phase = PHASES[index];

    if (phase.name === 'safety') {
      stage.setAttribute('data-branch', loopCount % 2 === 0 ? 'present' : 'clear');
    }

    stage.setAttribute('data-phase', phase.name);
    setActiveStep(phase.name);
    if (announcer) announcer.textContent = phase.announce;

    var duration = reduceMotion ? Math.min(phase.duration, 1600) : phase.duration;

    timer = setTimeout(function () {
      var nextIndex = (index + 1) % PHASES.length;
      if (nextIndex === 0) loopCount += 1;
      runPhase(nextIndex);
    }, duration);
  }

  // Pause the loop when the panel is off-screen to save cycles.
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          if (!timer) runPhase(phaseIndex);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      });
    }, { threshold: 0.1 });
    observer.observe(stage);
  } else {
    runPhase(phaseIndex);
  }
})();
