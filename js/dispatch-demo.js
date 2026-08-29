(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Config
   * ------------------------------------------------------------------ */
  var FIRE_COORDS = { lat: 22.937341, lng: 72.6623481 };   // JNV Ahmedabad — hardcoded demo incident location
  var STATION_COORDS = { lat: 22.9969471, lng: 72.6030834 }; // Maninagar Fire Station — placeholder, swap for real station
  var DEFAULT_ZOOM = 12;
  var FIRE_ZOOM = 15;
  var OSRM_URL = 'https://router.project-osrm.org/route/v1/driving/' +
    STATION_COORDS.lng + ',' + STATION_COORDS.lat + ';' +
    FIRE_COORDS.lng + ',' + FIRE_COORDS.lat + '?overview=full&geometries=geojson';
  var MAX_LOG = 6;

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  var state = {
    triggered: false,
    log: []
  };

  var leafletAvailable = (typeof L !== 'undefined');
  var map = null;
  var fireMarker = null;
  var stationMarker = null;
  var routeLine = null;

  /* ------------------------------------------------------------------ *
   * DOM refs
   * ------------------------------------------------------------------ */
  var els = {
    clock: document.getElementById('clock'),

    statusBanner: document.getElementById('status-banner'),
    statusText: document.getElementById('status-text'),
    statusDetail: document.getElementById('status-detail'),

    mapEl: document.getElementById('map'),
    fallbackEl: document.getElementById('map-fallback'),
    fallbackPin: document.getElementById('fallback-pin'),
    fallbackCoords: document.getElementById('fallback-coords'),
    fallbackLabel: document.getElementById('fallback-label'),

    routeDistance: document.getElementById('route-distance'),
    routeEta: document.getElementById('route-eta'),
    routeFireCoords: document.getElementById('route-fire-coords'),
    routeNote: document.getElementById('route-note'),

    logList: document.getElementById('log-list'),
    logToggle: document.getElementById('log-toggle'),

    triggerBtn: document.getElementById('trigger-alert'),
    resetBtn: document.getElementById('reset-dispatch')
  };

  /* ------------------------------------------------------------------ *
   * Clock
   * ------------------------------------------------------------------ */
  function pad(n) { return String(n).padStart(2, '0'); }
  function tickClock() {
    var now = new Date();
    els.clock.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  }
  tickClock();
  setInterval(tickClock, 1000);

  /* ------------------------------------------------------------------ *
   * Action log — same bounded, newest-first pattern as the dashboard
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
      empty.textContent = 'No dispatch events yet.';
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
  logEvent('Dispatch console initialized. Standing by.', 'info');

  /* ------------------------------------------------------------------ *
   * Leaflet init (falls back to a coordinate panel if it can't load —
   * same resilience pattern as the original dispatch.html)
   * ------------------------------------------------------------------ */
  var stationIcon, fireIcon;

  if (leafletAvailable) {
    els.fallbackEl.classList.remove('is-visible');
    els.mapEl.style.display = 'block';

    map = L.map('map').setView([STATION_COORDS.lat, STATION_COORDS.lng], DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    stationIcon = L.divIcon({
      html: '<div class="station-marker-icon">🚒</div>',
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 28]
    });
    fireIcon = L.divIcon({
      html: '<div class="fire-marker-icon">🔥</div>',
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 28]
    });

    stationMarker = L.marker([STATION_COORDS.lat, STATION_COORDS.lng], { icon: stationIcon })
      .addTo(map)
      .bindPopup('<b>Fire Station</b><br>Dispatch origin');

  } else {
    els.mapEl.style.display = 'none';
    els.fallbackEl.classList.add('is-visible');
    console.warn('[Dispatch] Leaflet not available — showing fallback coordinate panel.');
  }

  /* ------------------------------------------------------------------ *
   * Status banner
   * ------------------------------------------------------------------ */
  function setStatus(mode) {
    els.statusBanner.className = 'status-banner status-' + mode;
    if (mode === 'emergency') {
      els.statusText.textContent = 'EMERGENCY';
      els.statusDetail.textContent = 'Active incident — route calculated';
    } else {
      els.statusText.textContent = 'STANDBY';
      els.statusDetail.textContent = 'No active incident';
    }
  }

  /* ------------------------------------------------------------------ *
   * Route fetch — OSRM public demo server, shortest driving route
   * ------------------------------------------------------------------ */
  function fetchRoute() {
    els.routeNote.textContent = 'Calculating shortest driving route from station to incident…';

    fetch(OSRM_URL)
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        if (!data.routes || !data.routes.length) throw new Error('No route returned');
        var route = data.routes[0];
        var km = (route.distance / 1000).toFixed(2);
        var mins = Math.round(route.duration / 60);

        els.routeDistance.textContent = km + ' km';
        els.routeDistance.classList.add('is-active');
        els.routeEta.textContent = mins + ' min';
        els.routeEta.classList.add('is-active');
        els.routeNote.textContent = 'Shortest drivable route plotted via OSRM — not a straight-line displacement, the actual road path.';

        if (leafletAvailable && map) {
          var latlngs = route.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
          if (routeLine) map.removeLayer(routeLine);
          routeLine = L.polyline(latlngs, { color: '#ff9d2e', weight: 4, opacity: 0.85 }).addTo(map);
          map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
        }

        logEvent('Route calculated: ' + km + ' km, ETA ' + mins + ' min.', 'warning');
      })
      .catch(function (err) {
        els.routeNote.textContent = 'Route lookup failed (' + err.message + '). Check internet connectivity — OSRM requires a live connection.';
        logEvent('Route calculation failed: ' + err.message, 'info');
      });
  }

  /* ------------------------------------------------------------------ *
   * Trigger / Reset
   * ------------------------------------------------------------------ */
  function triggerAlert() {
    if (state.triggered) return;
    state.triggered = true;

    setStatus('emergency');
    var coordStr = FIRE_COORDS.lat.toFixed(6) + ', ' + FIRE_COORDS.lng.toFixed(6);
    els.routeFireCoords.textContent = coordStr;

    if (leafletAvailable && map) {
      fireMarker = L.marker([FIRE_COORDS.lat, FIRE_COORDS.lng], { icon: fireIcon })
        .addTo(map)
        .bindPopup('<b>🔥 FIRE DETECTED</b><br>Extingo suppression active')
        .openPopup();
      map.flyTo([FIRE_COORDS.lat, FIRE_COORDS.lng], FIRE_ZOOM);
    } else {
      els.fallbackEl.classList.add('fire-mode');
      els.fallbackPin.textContent = '🔥';
      els.fallbackCoords.textContent = coordStr;
      els.fallbackLabel.textContent = 'FIRE DETECTED — Extingo suppression active';
    }

    logEvent('Fire alert received from Extingo. Incident at ' + coordStr + '.', 'emergency');
    fetchRoute();
  }

  function resetDispatch() {
    state.triggered = false;
    setStatus('normal');

    els.routeDistance.textContent = '—';
    els.routeDistance.classList.remove('is-active');
    els.routeEta.textContent = '—';
    els.routeEta.classList.remove('is-active');
    els.routeFireCoords.textContent = '—';
    els.routeNote.textContent = 'Press "Trigger Fire Alert" to plot the incident and calculate the fastest driving route from the station.';

    if (leafletAvailable && map) {
      if (fireMarker) { map.removeLayer(fireMarker); fireMarker = null; }
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
      map.flyTo([STATION_COORDS.lat, STATION_COORDS.lng], DEFAULT_ZOOM);
    } else {
      els.fallbackEl.classList.remove('fire-mode');
      els.fallbackPin.textContent = '📍';
      els.fallbackCoords.textContent = 'Awaiting trigger';
      els.fallbackLabel.textContent = 'Map tiles unavailable — showing coordinates only';
    }

    logEvent('Dispatch reset. Standing by.', 'normal');
  }

  els.triggerBtn.addEventListener('click', triggerAlert);
  els.resetBtn.addEventListener('click', resetDispatch);

  /* ------------------------------------------------------------------ *
   * Log panel collapse toggle — same pattern as the dashboard
   * ------------------------------------------------------------------ */
  els.logToggle.addEventListener('click', function () {
    var expanded = els.logToggle.getAttribute('aria-expanded') === 'true';
    els.logToggle.setAttribute('aria-expanded', String(!expanded));
  });

})();
