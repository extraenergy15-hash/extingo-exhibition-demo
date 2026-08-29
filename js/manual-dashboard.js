(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Config — thresholds mirror the live site's status/prediction logic
   * ------------------------------------------------------------------ */
  var HEAT_WARN = 45;      // °C
  var HEAT_EMERGENCY = 60; // °C
  var SMOKE_WARN = 200;    // ppm
  var SMOKE_EMERGENCY = 450; // ppm
  var MAX_HISTORY = 30;    // points kept on each chart
  var MAX_LOG = 5;         // bounded action log

  var BASELINE = { heat: 22, smoke: 15, flame: false, motion: false, x: 0, y: 0 };

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  var state = {
    heatHistory: [],
    smokeHistory: [],
    labels: [],
    step: 0,
    status: 'normal',
    log: [],
    uptimeStart: Date.now()
  };

  /* ------------------------------------------------------------------ *
   * DOM refs
   * ------------------------------------------------------------------ */
  var els = {
    clock: document.getElementById('clock'),
    uptime: document.getElementById('uptime'),

    statusBanner: document.getElementById('status-banner'),
    statusText: document.getElementById('status-text'),
    statusDetail: document.getElementById('status-detail'),

    flameValue: document.getElementById('flame-value'),
    flameState: document.getElementById('flame-state'),
    flameTile: document.querySelector('.sensor-tile[data-sensor="flame"]'),

    smokeValue: document.getElementById('smoke-value'),
    smokeState: document.getElementById('smoke-state'),
    smokeTrend: document.getElementById('smoke-trend'),
    smokeTile: document.querySelector('.sensor-tile[data-sensor="smoke"]'),

    heatValue: document.getElementById('heat-value'),
    heatState: document.getElementById('heat-state'),
    heatTrend: document.getElementById('heat-trend'),
    heatTile: document.querySelector('.sensor-tile[data-sensor="heat"]'),

    motionValue: document.getElementById('motion-value'),
    motionState: document.getElementById('motion-state'),
    motionTile: document.querySelector('.sensor-tile[data-sensor="motion"]'),

    zoneValue: document.getElementById('zone-value'),
    zoneDot: document.getElementById('zone-dot'),

    gaugeFill: document.getElementById('gauge-fill'),
    gaugeNeedle: document.getElementById('gauge-needle'),
    predictionPercent: document.getElementById('prediction-percent'),
    predictionSummary: document.getElementById('prediction-summary'),
    factorHeatRor: document.getElementById('factor-heat-ror'),
    factorSmokeTrend: document.getElementById('factor-smoke-trend'),
    factorFlameMotion: document.getElementById('factor-flame-motion'),

    logList: document.getElementById('log-list'),
    logToggle: document.getElementById('log-toggle'),

    inputHeat: document.getElementById('input-heat'),
    inputSmoke: document.getElementById('input-smoke'),
    inputX: document.getElementById('input-x'),
    inputY: document.getElementById('input-y'),
    toggleFlame: document.getElementById('toggle-flame'),
    toggleFlameLabel: document.getElementById('toggle-flame-label'),
    toggleMotion: document.getElementById('toggle-motion'),
    toggleMotionLabel: document.getElementById('toggle-motion-label'),

    submitBtn: document.getElementById('submit-reading'),
    resetBtn: document.getElementById('reset-demo')
  };

  /* ------------------------------------------------------------------ *
   * Clock / uptime
   * ------------------------------------------------------------------ */
  function pad(n) { return String(n).padStart(2, '0'); }

  function tickClock() {
    var now = new Date();
    els.clock.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());

    var elapsed = Math.floor((Date.now() - state.uptimeStart) / 1000);
    var h = Math.floor(elapsed / 3600);
    var m = Math.floor((elapsed % 3600) / 60);
    var s = elapsed % 60;
    els.uptime.textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
  }
  setInterval(tickClock, 1000);
  tickClock();

  /* ------------------------------------------------------------------ *
   * Charts
   * ------------------------------------------------------------------ */
  var chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#565f65', font: { family: 'IBM Plex Mono', size: 10 }, maxRotation: 0 }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.06)' },
        ticks: { color: '#8d969e', font: { family: 'IBM Plex Mono', size: 10 } },
        beginAtZero: true
      }
    }
  };

  var smokeChart = new Chart(document.getElementById('smoke-chart').getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Smoke (ppm)',
        data: [],
        borderColor: '#8d969e',
        backgroundColor: 'rgba(141,150,158,0.12)',
        pointRadius: 2,
        pointBackgroundColor: '#8d969e',
        borderWidth: 2,
        tension: 0.3,
        fill: true
      }]
    },
    options: chartDefaults
  });

  var heatChart = new Chart(document.getElementById('heat-chart').getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Heat (°C)',
        data: [],
        borderColor: '#ff9d2e',
        backgroundColor: 'rgba(255,157,46,0.12)',
        pointRadius: 2,
        pointBackgroundColor: '#ff9d2e',
        borderWidth: 2,
        tension: 0.3,
        fill: true
      }]
    },
    options: chartDefaults
  });

  function pushHistory(heat, smoke) {
    state.step += 1;
    var label = '#' + state.step;

    state.heatHistory.push(heat);
    state.smokeHistory.push(smoke);
    state.labels.push(label);

    if (state.heatHistory.length > MAX_HISTORY) {
      state.heatHistory.shift();
      state.smokeHistory.shift();
      state.labels.shift();
    }

    heatChart.data.labels = state.labels;
    heatChart.data.datasets[0].data = state.heatHistory;
    heatChart.update();

    smokeChart.data.labels = state.labels;
    smokeChart.data.datasets[0].data = state.smokeHistory;
    smokeChart.update();
  }

  function clearHistory() {
    state.heatHistory = [];
    state.smokeHistory = [];
    state.labels = [];
    state.step = 0;
    heatChart.data.labels = [];
    heatChart.data.datasets[0].data = [];
    heatChart.update();
    smokeChart.data.labels = [];
    smokeChart.data.datasets[0].data = [];
    smokeChart.update();
  }

  /* ------------------------------------------------------------------ *
   * Status engine
   * ------------------------------------------------------------------ */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function computeStatus(heat, smoke, flame) {
    if (flame || heat >= HEAT_EMERGENCY || smoke >= SMOKE_EMERGENCY) return 'emergency';
    if (heat >= HEAT_WARN || smoke >= SMOKE_WARN) return 'warning';
    return 'normal';
  }

  function statusDetailText(status, heat, smoke, flame) {
    if (status === 'emergency') {
      if (flame) return 'Flame sensor triggered — suppression protocol required';
      if (heat >= HEAT_EMERGENCY) return 'Heat ' + heat.toFixed(1) + '°C exceeds emergency threshold (' + HEAT_EMERGENCY + '°C)';
      return 'Smoke ' + smoke + 'ppm exceeds emergency threshold (' + SMOKE_EMERGENCY + 'ppm)';
    }
    if (status === 'warning') {
      if (heat >= HEAT_WARN) return 'Heat ' + heat.toFixed(1) + '°C above nominal — monitor closely';
      return 'Smoke ' + smoke + 'ppm above nominal — monitor closely';
    }
    return 'All zones reporting within safe range';
  }

  function applyStatus(status, heat, smoke, flame) {
    els.statusBanner.className = 'status-banner status-' + status;
    els.statusText.textContent = status.toUpperCase();
    els.statusDetail.textContent = statusDetailText(status, heat, smoke, flame);

    [els.flameTile, els.smokeTile, els.heatTile].forEach(function (tile) {
      if (tile) tile.dataset.state = status === 'normal' ? '' : status;
    });
  }

  /* ------------------------------------------------------------------ *
   * Early-warning prediction (rate-of-rise + smoke-trend + flame/motion)
   * ------------------------------------------------------------------ */
  function computePrediction(heat, smoke, flame, motion) {
    var prevHeat = state.heatHistory.length ? state.heatHistory[state.heatHistory.length - 1] : heat;
    var ror = heat - prevHeat; // °C since last reading
    var heatScore = clamp(Math.max(ror, 0) * 12, 0, 100);

    var recentSmoke = state.smokeHistory.slice(-5);
    var avgPrevSmoke = recentSmoke.length ? recentSmoke.reduce(function (a, b) { return a + b; }, 0) / recentSmoke.length : smoke;
    var smokeDelta = smoke - avgPrevSmoke;
    var smokeScore = clamp(Math.max(smokeDelta, 0) / 5, 0, 100);

    var flameMotionScore = flame ? 100 : (motion ? 35 : 0);

    // Correlated-signal average: rewards multiple factors rising together.
    var weightedAvg = heatScore * 0.35 + smokeScore * 0.35 + flameMotionScore * 0.30;
    // Dominant-signal floor: a single factor that is itself near-maxed should
    // read as clearly dangerous on its own, not get diluted just because the
    // other two factors happen to be flat. A 30°C+ jump in one reading alone
    // now lands in the red zone (>=70) instead of capping near 35.
    var dominant = Math.max(heatScore, smokeScore, flameMotionScore) * 0.82;

    var score = Math.round(Math.max(weightedAvg, dominant));
    score = clamp(score, 0, 100);

    return { score: score, ror: ror, smokeDelta: smokeDelta, heatScore: heatScore, smokeScore: smokeScore, flameMotionScore: flameMotionScore };
  }

  function applyGauge(score) {
    var pct = clamp(score, 0, 100);
    var offset = 283 * (1 - pct / 100);
    els.gaugeFill.style.strokeDashoffset = offset;

    var color = pct >= 70 ? '#ff4757' : (pct >= 40 ? '#ff9d2e' : '#35e0c4');
    els.gaugeFill.style.stroke = color;

    var angle = -90 + (pct / 100) * 180;
    els.gaugeNeedle.setAttribute('transform', 'rotate(' + angle + ' 110 110)');

    els.predictionPercent.textContent = pct + '%';
    els.predictionPercent.style.color = color;
  }

  function applyPredictionDetail(pred, status) {
    els.factorHeatRor.textContent = (pred.ror >= 0 ? '+' : '') + pred.ror.toFixed(1) + '°C since last reading';
    els.factorSmokeTrend.textContent = (pred.smokeDelta >= 0 ? '+' : '') + Math.round(pred.smokeDelta) + 'ppm vs recent avg';
    if (pred.flameMotionScore >= 100) {
      els.factorFlameMotion.textContent = 'Flame active — maximum weight';
    } else if (pred.flameMotionScore > 0) {
      els.factorFlameMotion.textContent = 'Motion present — partial weight';
    } else {
      els.factorFlameMotion.textContent = 'No flame or motion contribution';
    }

    var summary;
    if (state.heatHistory.length < 2) {
      summary = 'Awaiting sufficient entry history to compute a trend.';
    } else if (pred.score >= 70) {
      summary = 'Rapid heat rise and rising smoke trend align with pre-ignition conditions.';
    } else if (pred.score >= 40) {
      summary = 'Readings show an upward trend worth monitoring on the next entries.';
    } else {
      summary = 'Rate-of-rise and smoke trend are both flat — no early-warning signal.';
    }
    els.predictionSummary.textContent = summary;
  }

  /* ------------------------------------------------------------------ *
   * Tile + trend rendering
   * ------------------------------------------------------------------ */
  function trendArrow(el, delta) {
    if (delta > 0.001) { el.textContent = '▲'; el.dataset.trend = 'up'; }
    else if (delta < -0.001) { el.textContent = '▼'; el.dataset.trend = 'down'; }
    else { el.textContent = '▬'; el.dataset.trend = 'flat'; }
  }

  function renderTiles(heat, smoke, flame, motion, x, y, status, pred) {
    els.heatValue.textContent = heat.toFixed(1);
    els.heatState.textContent = heat >= HEAT_EMERGENCY ? 'Critical' : (heat >= HEAT_WARN ? 'Elevated' : 'Nominal');
    trendArrow(els.heatTrend, pred.ror);

    els.smokeValue.textContent = String(Math.round(smoke));
    els.smokeState.textContent = smoke >= SMOKE_EMERGENCY ? 'Critical' : (smoke >= SMOKE_WARN ? 'Elevated' : 'Clear');
    trendArrow(els.smokeTrend, pred.smokeDelta);

    els.flameValue.textContent = flame ? 'DETECTED' : 'CLEAR';
    els.flameState.textContent = flame ? 'Triggered' : 'Clear';

    els.motionValue.textContent = motion ? 'DETECTED' : 'NONE';
    els.motionState.textContent = motion ? 'Occupied' : 'Unoccupied';

    els.zoneValue.textContent = 'X:' + x + ' Y:' + y;
    var px = clamp(x, 0, 100);
    var py = 100 - clamp(y, 0, 100);
    els.zoneDot.setAttribute('cx', px);
    els.zoneDot.setAttribute('cy', py);
    var zoneDot = document.querySelector('.zone-map-dot');
    if (zoneDot) zoneDot.style.fill = status === 'emergency' ? '#ff4757' : (status === 'warning' ? '#ff9d2e' : '#ffcc4d');
  }

  /* ------------------------------------------------------------------ *
   * Action log (bounded to MAX_LOG entries, newest first)
   * ------------------------------------------------------------------ */
  function logEvent(message, level) {
    var now = new Date();
    var time = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    state.log.unshift({ time: time, message: message, level: level });
    if (state.log.length > MAX_LOG) state.log.length = MAX_LOG;
    renderLog();
  }

  function renderLog() {
    els.logList.innerHTML = '';
    if (!state.log.length) {
      var empty = document.createElement('li');
      empty.className = 'log-empty';
      empty.textContent = 'No events logged yet.';
      els.logList.appendChild(empty);
      return;
    }
    state.log.forEach(function (entry) {
      var li = document.createElement('li');
      li.className = 'log-' + entry.level;
      var timeSpan = document.createElement('span');
      timeSpan.className = 'log-time';
      timeSpan.textContent = entry.time;
      var msgSpan = document.createElement('span');
      msgSpan.textContent = entry.message;
      li.appendChild(timeSpan);
      li.appendChild(msgSpan);
      els.logList.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------ *
   * Toggles
   * ------------------------------------------------------------------ */
  function wireToggle(btn, label) {
    btn.addEventListener('click', function () {
      var active = btn.dataset.active === 'true';
      var next = !active;
      btn.dataset.active = String(next);
      btn.setAttribute('aria-pressed', String(next));
      label.textContent = next ? 'ON' : 'OFF';
      commitReading();
    });
  }
  wireToggle(els.toggleFlame, els.toggleFlameLabel);
  wireToggle(els.toggleMotion, els.toggleMotionLabel);

  /* ------------------------------------------------------------------ *
   * Core commit — recompute status, append charts, log transition
   * ------------------------------------------------------------------ */
  function readInputs() {
    return {
      heat: parseFloat(els.inputHeat.value) || 0,
      smoke: parseFloat(els.inputSmoke.value) || 0,
      flame: els.toggleFlame.dataset.active === 'true',
      motion: els.toggleMotion.dataset.active === 'true',
      x: clamp(parseInt(els.inputX.value, 10) || 0, 0, 100),
      y: clamp(parseInt(els.inputY.value, 10) || 0, 0, 100)
    };
  }

  function readingSignature(v) {
    return [v.heat, v.smoke, v.flame, v.motion, v.x, v.y].join('|');
  }

  function commitReading() {
    var v = readInputs();

    // Guard against duplicate commits: the number/coordinate fields fire a
    // 'change' event on blur AND the Submit Reading button can fire right
    // after (e.g. tabbing out of a field then clicking Submit). If nothing
    // actually changed since the last commit, re-committing the identical
    // values would flatten the rate-of-rise and smoke-trend math to ~0 for
    // this step and quietly overwrite a correct, higher score. Skip it.
    var sig = readingSignature(v);
    if (sig === state.lastSignature) return;
    state.lastSignature = sig;

    var status = computeStatus(v.heat, v.smoke, v.flame);
    var pred = computePrediction(v.heat, v.smoke, v.flame, v.motion);

    // Append to chart history BEFORE overwriting for next rate-of-rise calc
    pushHistory(v.heat, v.smoke);

    applyStatus(status, v.heat, v.smoke, v.flame);
    applyGauge(pred.score);
    applyPredictionDetail(pred, status);
    renderTiles(v.heat, v.smoke, v.flame, v.motion, v.x, v.y, status, pred);

    var readingMsg = 'Reading logged — Heat ' + v.heat.toFixed(1) + '°C, Smoke ' + Math.round(v.smoke) + 'ppm' +
      (v.flame ? ', flame ON' : '') + (v.motion ? ', motion ON' : '') + ' @ (' + v.x + ',' + v.y + ')';

    if (status !== state.status) {
      logEvent('STATUS ' + state.status.toUpperCase() + ' → ' + status.toUpperCase() + ' — ' + statusDetailText(status, v.heat, v.smoke, v.flame), status);
      state.status = status;
    } else {
      logEvent(readingMsg, status);
    }
  }

  /* ------------------------------------------------------------------ *
   * Wire inputs — "on any change" triggers a full recompute
   * ------------------------------------------------------------------ */
  [els.inputHeat, els.inputSmoke, els.inputX, els.inputY].forEach(function (input) {
    input.addEventListener('change', commitReading);
  });
  els.submitBtn.addEventListener('click', commitReading);

  /* ------------------------------------------------------------------ *
   * Reset demo
   * ------------------------------------------------------------------ */
  function resetDemo() {
    els.inputHeat.value = BASELINE.heat;
    els.inputSmoke.value = BASELINE.smoke;
    els.inputX.value = BASELINE.x;
    els.inputY.value = BASELINE.y;

    els.toggleFlame.dataset.active = 'false';
    els.toggleFlame.setAttribute('aria-pressed', 'false');
    els.toggleFlameLabel.textContent = 'OFF';

    els.toggleMotion.dataset.active = 'false';
    els.toggleMotion.setAttribute('aria-pressed', 'false');
    els.toggleMotionLabel.textContent = 'OFF';

    clearHistory();
    state.log = [];
    state.status = 'normal';
    state.uptimeStart = Date.now();
    state.lastSignature = [BASELINE.heat, BASELINE.smoke, BASELINE.flame, BASELINE.motion, BASELINE.x, BASELINE.y].join('|');
    renderLog();

    // Seed history with the baseline point so the first real submission has
    // a genuine previous reading to diff against — without this, ror/smoke
    // trend on the very first change always compute as 0 regardless of how
    // large the actual jump was.
    pushHistory(BASELINE.heat, BASELINE.smoke);

    applyStatus('normal', BASELINE.heat, BASELINE.smoke, false);
    applyGauge(0);
    var pred = { ror: 0, smokeDelta: 0, heatScore: 0, smokeScore: 0, flameMotionScore: 0, score: 0 };
    applyPredictionDetail(pred, 'normal');
    renderTiles(BASELINE.heat, BASELINE.smoke, false, false, BASELINE.x, BASELINE.y, 'normal', pred);

    logEvent('Demo reset — baseline restored', 'info');
  }
  els.resetBtn.addEventListener('click', resetDemo);

  /* ------------------------------------------------------------------ *
   * Log panel collapse toggle
   * ------------------------------------------------------------------ */
  els.logToggle.addEventListener('click', function () {
    var expanded = els.logToggle.getAttribute('aria-expanded') === 'true';
    els.logToggle.setAttribute('aria-expanded', String(!expanded));
  });

  /* ------------------------------------------------------------------ *
   * Initial paint
   * ------------------------------------------------------------------ */
  resetDemo();
})();
