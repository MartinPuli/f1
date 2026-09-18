import { createSaveQueue } from './save-queue.js';
import { defaultSettings, cleanSettings, MODEL_CHOICES, validModel } from './race-config.js';
import {
  createIcons,
  Flag,
  Focus,
  Gauge,
  Layers,
  Pause,
  Play,
  Settings2,
  Shuffle,
  X,
  Check,
  Download,
  Plus,
  Trophy,
  RotateCcw,
  Github,
  Film,
  Trash2,
  Pencil,
} from 'lucide';
import { Race, DRIVERS, makeTrack, formatTime } from './simulation.js';
import { RaceScene } from './scene.js';
import { recordRace, applyReplay } from './recording.js';
import './style.css';
const icons = {
  Flag,
  Focus,
  Gauge,
  Layers,
  Pause,
  Play,
  Settings2,
  Shuffle,
  X,
  Check,
  Download,
  Plus,
  Trophy,
  RotateCcw,
  Github,
  Film,
  Trash2,
  Pencil,
};
const icon = (name) =>
  `<i data-lucide="${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}"></i>`;
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
// One bootstrap request sets the archive cookie before any parallel API calls.
let sessionPromise;
function ensureSession() {
  return (sessionPromise ??= fetch('/api/status', { cache: 'no-store' })
    .then(async (res) => ({ ok: res.ok, ...(await res.json()) }))
    .catch(() => ({ ok: false, error: 'Could not connect. Reload and try again.' })));
}
let draftSettings = defaultSettings(),
  gridDriver = 0,
  availableModels = [...MODEL_CHOICES],
  connecting = false,
  connectionGeneration = 0;
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
let race = new Race(42),
  raceId = crypto.randomUUID(),
  raceName = 'Sunshine Grand Prix',
  created = Date.now(),
  key = '',
  speed = 1,
  sceneError = '',
  saveMessage = '',
  lastUi = 0,
  lastSaveAttempt = 0,
  finishSaved = false,
  saving = false,
  lastAutoSaveWall = Date.now(),
  replay = null,
  live = null,
  pendingMode = 'demo';
$('#app').innerHTML = `
<header class="topbar"><a href="/" class="brand" aria-label="JEVRACE home"><img src="/logo-mark.svg" alt=""/><span>JEV<em>RACE</em></span></a><nav aria-label="Race actions"><button id="new-race" class="nav-button">${icon('Plus')} New race</button><button id="results" class="nav-button">${icon('Trophy')} Results</button></nav><div class="header-end"><span id="mode-caption" class="mode-caption">DEMO</span><button class="icon-button" id="configure" aria-label="Session API key" title="Session API key">${icon('Settings2')}</button></div></header>
<main><section id="race-view" aria-label="Race circuit"><div id="canvas-host"></div><aside class="timing-tower" aria-label="Live standings"><div class="timing-header"><span class="dot"></span><span id="live-status">ON THE GRID</span><span>GAP</span></div><div id="timing-rows"></div></aside><div class="onboard-strip"><span id="position-number"></span><span id="position-name"></span><small>ONBOARD</small></div><div class="lap-widget"><span>LAP</span><strong id="lap"></strong><span id="clock">00:00.00</span></div>
<button class="track-label" id="rename-race" aria-label="Rename race"><span id="race-name"></span><small id="seed-label"></small>${icon('Pencil')}</button><div class="speed-widget"><strong id="selected-speed">0</strong><span>km/h</span></div><div id="stage-message" role="status"></div><div class="finish-banner" id="finish-overlay" hidden></div>
<div class="driver-switcher" role="group" aria-label="Choose a driver to follow">${DRIVERS.map((d, i) => `<button class="pilot-button ${i === 4 ? 'active' : ''}" data-pilot="${i}" style="--pilot:${d.color}" aria-label="Follow ${d.name}" title="${d.name} · ${i + 1}" aria-pressed="${i === 4}"><span class="pilot-avatar"><b>${d.number}</b></span><span>${d.short}</span></button>`).join('')}</div>
<div id="replay-bar" hidden><span>${icon('Film')} REPLAY</span><input id="replay-seek" type="range" min="0" step="0.1" value="0" aria-label="Replay position"/><output id="replay-time">00:00</output><button id="exit-replay" class="icon-button" aria-label="Exit replay">${icon('X')}</button></div>
<div class="control-dock"><button id="start" class="primary-button">${icon('Play')} <span>Start race</span></button><span class="control-divider"></span><div class="speed-controls" role="group" aria-label="Playback speed"><button data-speed="1" class="active" aria-pressed="true">1×</button><button data-speed="2" aria-pressed="false">2×</button><button data-speed="4" aria-pressed="false">4×</button></div><span class="control-divider"></span><div class="camera-controls" role="group" aria-label="Camera view"><button data-camera="follow" class="active icon-button" title="Follow driver · reset camera" aria-label="Follow driver · reset camera" aria-pressed="true">${icon('Gauge')}</button><button data-camera="orbit" class="icon-button" title="Orbit circuit" aria-label="Orbit circuit" aria-pressed="false">${icon('Layers')}</button><button data-camera="top" class="icon-button" title="Aerial view" aria-label="Aerial view" aria-pressed="false">${icon('Focus')}</button></div></div></section></main>
<dialog id="setup-dialog" aria-labelledby="setup-title"><button class="dialog-close icon-button" data-close aria-label="Close race setup">${icon('X')}</button><h2 id="setup-title">Race setup</h2><div class="setup-tabs" role="group" aria-label="Race setup view"><button type="button" data-setup-tab="circuit" class="active" aria-pressed="true">Circuit</button><button type="button" data-setup-tab="grid" aria-pressed="false">Grid</button></div><form id="setup-form"><section id="circuit-panel">
<div class="track-preview"><svg id="track-preview" viewBox="-115 -115 230 230" role="img" aria-label="Generated circuit preview"></svg><div class="circuit-controls"><small id="track-length"></small><label for="race-seed">Seed</label><input id="race-seed" type="number" min="0" max="4294967295" step="1" required value="42"/><button type="button" id="randomize" class="icon-button" aria-label="Generate circuit" title="Generate circuit">${icon('Shuffle')}</button></div></div>
<label for="race-title">Name</label><input id="race-title" required maxlength="60" value="Sunshine Grand Prix"/>
<div class="setup-options"><div><span class="field-label" id="driver-mode-label">Drivers</span><div class="mode-choices" role="group" aria-labelledby="driver-mode-label"><button type="button" data-mode="demo" class="mode-choice active" aria-pressed="true">Demo</button><button type="button" data-mode="jev" class="mode-choice" aria-pressed="false">Jev</button></div></div><div><label for="race-laps">Laps</label><select id="race-laps">${[1, 2, 3, 4, 5].map((n) => `<option ${n === 3 ? 'selected' : ''} value="${n}">${n}</option>`).join('')}</select></div></div>
<div id="setup-key-field" hidden><label for="setup-key">TypeSafe API key</label><input type="password" id="setup-key" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="512" placeholder="Paste your key"/><button type="button" id="connect-setup" class="connection-button">Connect TypeSafe</button><p id="setup-connection" class="field-note">Session only · never saved</p><details class="api-usage"><summary>API usage</summary><p>Up to 10 TypeSafe requests per simulation second, with at most one batch every two real seconds. Keys are never stored with recordings.</p></details></div></section><section id="grid-panel" hidden><div class="grid-editor-tabs" role="group" aria-label="Edit driver">${DRIVERS.map((d, i) => `<button type="button" data-grid-driver="${i}" style="--pilot:${d.color}" aria-label="Configure ${d.name}" aria-pressed="${i === 0}" class="${i === 0 ? 'active' : ''}">${d.number}</button>`).join('')}</div><div class="grid-driver-heading"><h3 id="grid-driver-name"></h3><span id="grid-driver-style"></span></div><div class="driver-identity"><div><label for="driver-name">Name</label><input id="driver-name" maxlength="40" /></div><div><label for="driver-number">Number</label><input id="driver-number" inputmode="numeric" pattern="[0-9]{1,2}" maxlength="2" /></div></div><details class="driver-brain"><summary>Jev settings</summary><label for="driver-model">Model</label><select id="driver-model"></select><label for="driver-prompt">Driver prompt</label><textarea id="driver-prompt" rows="4" maxlength="1000" spellcheck="false"></textarea><details class="race-prompt-details"><summary>Race prompt</summary><label class="sr-only" for="race-prompt">Shared race prompt</label><textarea id="race-prompt" rows="3" maxlength="2000" spellcheck="false"></textarea></details></details><div class="grid-editor-footer"><span id="grid-mode-note">Prompts run in Jev mode.</span><button type="button" id="reset-prompts">Reset grid</button></div></section><p id="setup-error" class="error" role="alert"></p><button type="submit" class="primary-button wide"><span>Start race</span>${icon('Play')}</button></form></dialog>
<dialog id="results-dialog" aria-labelledby="results-title"><button class="dialog-close icon-button" data-close aria-label="Close results">${icon('X')}</button><h2 id="results-title">Results</h2><div class="result-tabs" role="group" aria-label="Results view"><button class="active" data-results="current" aria-pressed="true">This race</button><button data-results="saved" aria-pressed="false">My races</button><button data-results="community" aria-pressed="false">Community</button></div><section id="current-results"><div class="results-heading"><div><h3 id="results-race-name"></h3><p id="results-status"></p></div><button id="export" class="icon-button" aria-label="Download race recording" title="Download race recording">${icon('Download')}</button></div><div class="results-table-wrap"><table><thead><tr><th>POS</th><th>DRIVER</th><th>LAPS</th><th>BEST LAP</th><th>TOTAL</th></tr></thead><tbody id="results-body"></tbody></table></div><div class="results-footer"><span id="results-mode"></span></div><details id="saved-config" class="saved-config"><summary>Race setup</summary><div id="saved-config-body"></div></details><div class="result-actions"><button id="share-current" class="secondary-button">Share race</button><button id="save-race" class="secondary-button" hidden>${icon('RotateCcw')} Retry save</button><button id="watch-current" class="secondary-button">${icon('Film')} Watch replay</button></div><p id="save-status" class="field-note" role="status"></p></section><section id="saved-results" hidden><p id="archive-scope" class="field-note" hidden>Saved for this browser for up to 90 days. Download recordings to keep a copy.</p><div id="archive-list"></div><p id="archive-error" class="error" role="alert"></p><button id="refresh-archive" class="secondary-button">${icon('RotateCcw')} Refresh</button></section><section id="community-results" hidden><p class="field-note">Shared by players · unverified results</p><div id="community-list"></div><p id="community-error" class="error" role="alert"></p><button id="refresh-community" class="secondary-button">Refresh</button></section></dialog>
<dialog id="share-dialog" aria-labelledby="share-title"><button class="dialog-close icon-button" data-close aria-label="Close sharing">${icon('X')}</button><h2 id="share-title">Share race</h2><p id="share-name"></p><p class="field-note">Anyone can replay this race and read its driver names, models and prompts. You can remove it from Community in My races.</p><p id="share-error" class="error" role="alert"></p><button id="confirm-share" class="primary-button wide">Publish replay</button></dialog>
<dialog id="key-dialog" aria-labelledby="key-title"><button class="dialog-close icon-button" data-close aria-label="Close API settings">${icon('X')}</button><h2 id="key-title">TypeSafe connection</h2><label for="api-key">TypeSafe API key</label><input type="password" id="api-key" placeholder="Paste your key" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="512"/><p id="key-status" class="field-note"></p><p class="field-note">Kept in memory. Sent through this server to TypeSafe over HTTPS; never saved.</p><button id="save-key" class="primary-button">${icon('Check')} Connect</button><button id="clear-key" class="secondary-button">Clear key</button><button id="show-shortcuts" class="source-link" type="button">Keyboard shortcuts <kbd>?</kbd></button><a class="source-link" href="https://github.com/MartinPuli/f1" target="_blank" rel="noopener">${icon('Github')} Source code</a></dialog>
<dialog id="shortcuts-dialog" aria-labelledby="shortcuts-title"><button class="dialog-close icon-button" data-close aria-label="Close keyboard shortcuts">${icon('X')}</button><h2 id="shortcuts-title">Keyboard shortcuts</h2><dl class="shortcut-list"><div><dt>Close window / pause</dt><dd><kbd>Esc</kbd></dd></div><div><dt>Play / pause</dt><dd><kbd>Space</kbd> <kbd>P</kbd></dd></div><div><dt>Follow driver</dt><dd><kbd>1</kbd>–<kbd>5</kbd></dd></div><div><dt>Previous / next driver</dt><dd><kbd>←</kbd> <kbd>→</kbd></dd></div><div><dt>Change camera / recenter</dt><dd><kbd>C</kbd> <kbd>F</kbd></dd></div><div><dt>Results / new race</dt><dd><kbd>R</kbd> <kbd>N</kbd></dd></div><div><dt>Keyboard shortcuts</dt><dd><kbd>?</kbd></dd></div></dl><label class="shortcut-toggle"><input id="enable-shortcuts" type="checkbox" checked/> Enable race shortcuts</label></dialog>
<dialog id="rename-dialog" aria-labelledby="rename-title"><button class="dialog-close icon-button" data-close aria-label="Close rename dialog">${icon('X')}</button><h2 id="rename-title">Rename race</h2><form id="rename-form"><label for="new-name">Race name</label><input id="new-name" maxlength="60" required/><button class="primary-button" type="submit">${icon('Check')} Save name</button></form></dialog>`;

function refreshIcons() {
  createIcons({ icons });
}
refreshIcons();
let scene;
try {
  scene = new RaceScene($('#canvas-host'), race);
} catch (e) {
  sceneError = 'Could not start 3D. Try a browser with hardware acceleration.';
  console.error(e);
}
$('#canvas-host').addEventListener('scene-error', (event) => {
  sceneError = event.detail;
  race.running = false;
  updateUi();
});
function setCamera(mode) {
  scene?.setCamera(mode);
  document.body.dataset.camera = mode;
  $$('[data-camera]').forEach((el) => {
    const active = el.dataset.camera === mode;
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', String(active));
  });
}
function selectDriver(i) {
  scene?.selectDriver(i);
  setCamera('follow');
  $$('[data-pilot]').forEach((el) => {
    const active = Number(el.dataset.pilot) === i;
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', String(active));
  });
  updateUi();
}
$$('[data-camera]').forEach((b) => (b.onclick = () => setCamera(b.dataset.camera)));
$$('[data-pilot]').forEach((b) => (b.onclick = () => selectDriver(Number(b.dataset.pilot))));
$$('[data-speed]').forEach(
  (b) =>
    (b.onclick = () => {
      speed = Number(b.dataset.speed);
      $$('[data-speed]').forEach((el) => {
        const active = el === b;
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', String(active));
      });
    }),
);
// Leave text editing, browser shortcuts, and native button activation alone.
window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.repeat || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
  const modal = document.querySelector('dialog[open]');
  if (modal) return; // A modal handles Escape natively, including while an input has focus.
  if (e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))
    return;
  if (e.key === 'Escape') {
    e.preventDefault();
    if (race.running || replay?.playing) pause();
    return;
  }
  if (!$('#enable-shortcuts').checked) return;
  const key = e.key.toLowerCase();
  if (key === ' ' && e.target.closest('button,a,summary,[role="button"]')) return;
  let action;
  if (/^[1-5]$/.test(key)) action = () => selectDriver(Number(key) - 1);
  else if (key === 'arrowleft' || key === 'arrowright')
    action = () =>
      selectDriver(
        ((scene?.selected ?? 4) + (key === 'arrowleft' ? -1 : 1) + DRIVERS.length) % DRIVERS.length,
      );
  else if (key === ' ' || key === 'p') action = () => $('#start').click();
  else if (key === 'c')
    action = () => {
      const modes = ['follow', 'orbit', 'top'];
      setCamera(modes[(modes.indexOf(scene?.mode) + 1) % modes.length]);
    };
  else if (key === 'f') action = () => setCamera('follow');
  else if (key === 'r') action = () => $('#results').click();
  else if (key === 'n') action = () => $('#new-race').click();
  else if (key === '?') action = () => openModal('#shortcuts-dialog');
  if (action) {
    e.preventDefault();
    action();
  }
});
$('#show-shortcuts').onclick = () => {
  $('#key-dialog').close();
  openModal('#shortcuts-dialog');
};
for (const [selector, shortcut, title] of [
  ['#start', 'Space P', 'Play / pause (Space or P)'],
  ['#new-race', 'N', 'New race (N)'],
  ['#results', 'R', 'Results (R)'],
  ['[data-camera="follow"]', 'F', 'Follow driver · reset camera (F)'],
  ['#show-shortcuts', 'Shift+/', 'Keyboard shortcuts (?)'],
]) {
  $(selector).setAttribute('aria-keyshortcuts', shortcut);
  $(selector).title = title;
}
$$('[data-pilot]').forEach((button, i) => button.setAttribute('aria-keyshortcuts', String(i + 1)));
function pause() {
  if (replay) replay.playing = false;
  else {
    race.running = false;
    if (race.time > 0) saveRace();
  }
  updateUi();
}
function openModal(id) {
  pause();
  $(id).showModal();
}
$$('[data-close]').forEach((b) => (b.onclick = () => b.closest('dialog').close()));
$$('dialog').forEach((d) =>
  d.addEventListener('click', (e) => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      d.close();
  }),
);
function updatePreview() {
  const seed = Number($('#race-seed').value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) return;
  const track = makeTrack(seed);
  const points = track.samples
    .filter((_, i) => i % 9 === 0)
    .map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`)
    .join(' ');
  const start = track.at(4),
    xs = track.samples.map((p) => p.x),
    zs = track.samples.map((p) => p.z);
  $('#track-preview').setAttribute(
    'viewBox',
    `${Math.min(...xs) - 18} ${Math.min(...zs) - 18} ${Math.max(...xs) - Math.min(...xs) + 36} ${Math.max(...zs) - Math.min(...zs) + 36}`,
  );
  $('#track-preview').innerHTML =
    `<polygon points="${points}" class="circuit-outline"/><circle cx="${start.x}" cy="${start.z}" r="4" class="circuit-start"/>`;
  $('#track-length').textContent = `${Math.round(track.length)} m`;
}
function setMode(mode) {
  pendingMode = mode;
  $$('[data-mode]').forEach((b) => {
    const active = b.dataset.mode === mode;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  $('#setup-key-field').hidden = mode !== 'jev';
  $('#setup-key').placeholder = key ? 'Connected for this session' : 'Paste your key';
  $('#grid-mode-note').textContent =
    mode === 'demo' ? 'Prompts run in Jev mode.' : 'TypeSafe · five independent drivers';
}
function openSetup() {
  draftSettings = cleanSettings(replay?.record.settings || race.settings);
  renderGridEditor();
  setSetupTab('circuit');
  openModal('#setup-dialog');
  $('#setup-error').textContent = '';
  $('#race-title').value = race.time ? 'Untitled Grand Prix' : raceName;
  $('#race-seed').value = randomSeed();
  $('#race-laps').value = race.limit;
  setMode(race.mode);
  updatePreview();
}
$('#new-race').onclick = openSetup;
$('#randomize').onclick = () => {
  $('#race-seed').value = randomSeed();
  updatePreview();
};
$('#race-seed').oninput = updatePreview;
$$('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$('#setup-form').onsubmit = async (e) => {
  e.preventDefault();
  const candidate = $('#setup-key').value.trim();
  if (pendingMode === 'jev' && !candidate && !key) {
    $('#setup-error').textContent = 'Add a key or choose Demo.';
    return;
  }
  const name = $('#race-title').value.trim();
  if (!name) {
    $('#setup-error').textContent = 'Give your race a name.';
    return;
  }
  if (key && JSON.stringify({ name, settings: draftSettings }).includes(key)) {
    $('#setup-error').textContent = 'Keep your key out of race names and prompts.';
    return;
  }
  if (pendingMode === 'jev' && candidate) {
    if (!(await connectKey(candidate, 'setup'))) return;
  }
  if (connecting) return;
  if (key && JSON.stringify({ name, settings: draftSettings }).includes(key)) {
    $('#setup-error').textContent = 'Keep your key out of race names and prompts.';
    return;
  }
  if (!draftSettings.drivers.every((d) => d.name.trim() && /^\d{1,2}$/.test(d.number))) {
    $('#setup-error').textContent = 'Each driver needs a name and a number from 0 to 99.';
    setSetupTab('grid');
    return;
  }
  $('#setup-key').value = '';
  if (!replay && race.time) saveRace();
  if (live) {
    live.race.generation++;
    live = null;
  }
  race.generation++;
  replay = null;
  race = new Race(Number($('#race-seed').value));
  race.limit = Number($('#race-laps').value);
  race.mode = pendingMode;
  race.configure(draftSettings);
  race.apiKey = key;
  raceId = crypto.randomUUID();
  raceName = name;
  created = Date.now();
  finishSaved = false;
  lastSaveAttempt = 0;
  lastAutoSaveWall = Date.now();
  saveMessage = '';
  if (scene) {
    scene.race = race;
    scene.build();
  }
  race.running = true;
  $('#setup-dialog').close();
  $('#finish-overlay').hidden = true;
  $('#replay-bar').hidden = true;
  document.body.classList.remove('is-replay');
  updateUi();
};
$('#configure').onclick = () => {
  $('#key-status').textContent = key ? 'Connected' : 'Not connected';
  openModal('#key-dialog');
};
$('#save-key').onclick = async () => {
  if (await connectKey($('#api-key').value.trim(), 'key')) $('#key-dialog').close();
};
$('#clear-key').onclick = () => {
  connectionGeneration++;
  key = '';
  race.apiKey = '';
  if (live) live.race.apiKey = '';
  $('#api-key').value = '';
  $('#key-status').textContent = 'Key cleared.';
  $('#setup-key').value = '';
  $('#setup-connection').textContent = 'Session only · never saved';
  availableModels = [...MODEL_CHOICES];
  renderGridEditor();
};
$('#start').onclick = () => {
  if (replay) {
    if (replay.time >= replay.record.duration) replay.time = 0;
    replay.playing = !replay.playing;
  } else if (race.finished) {
    openSetup();
    return;
  } else {
    if (race.mode === 'jev' && Date.now() < race.retryNotBefore) {
      race.error = 'Please wait before resuming Jev.';
      updateUi();
      return;
    }
    if (race.mode === 'jev' && !key) {
      $('#configure').click();
      return;
    }
    race.error = '';
    race.running = !race.running;
    if (!race.running) saveRace();
  }
  updateUi();
};
$('#rename-race').onclick = () => {
  $('#new-name').value = raceName;
  openModal('#rename-dialog');
};
$('#new-name').oninput = () => $('#new-name').setCustomValidity('');
$('#rename-form').onsubmit = (e) => {
  e.preventDefault();
  const name = $('#new-name').value.trim();
  if (!name) return;
  if (key && name.includes(key)) {
    $('#new-name').setCustomValidity('Keep your API key out of race names.');
    $('#new-name').reportValidity();
    return;
  }
  raceName = name;
  if (replay) {
    replay.record.name = name;
    if (live?.raceId === replay.record.id) live.raceName = name;
    queueSave(structuredClone(replay.record));
  } else if (race.time) saveRace();
  $('#rename-dialog').close();
  updateUi();
};
async function request(url, opts) {
  const session = await ensureSession();
  $('#archive-scope').hidden = session.archive !== 'browser';
  if (!session.ok) throw new Error(session.error || 'Could not connect. Reload and try again.');
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error || 'Request failed.');
    error.retryAt =
      Date.now() +
      Math.max(10, Math.min(86400, Number(res.headers.get('Retry-After')) || 60)) * 1000;
    throw error;
  }
  return data;
}
async function persist(record) {
  await request('/api/races', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
}
function currentRecord() {
  return replay ? replay.record : recordRace(race, raceId, raceName, created);
}
const saveScheduler = createSaveQueue({
  write: persist,
  onState: (state) => {
    saving = state.saving;
    saveMessage = state.message;
  },
});
function queueSave(record) {
  return saveScheduler.enqueue(record);
}
let lastSnapshot = '';
async function saveRace(force = false) {
  if (replay || !race.time) return;
  const signature = JSON.stringify([raceId, raceName, race.time, race.finished]);
  if (!force && signature === lastSnapshot) return;
  lastSnapshot = signature;
  lastSaveAttempt = race.time;
  return queueSave(currentRecord());
}
$('#save-race').onclick = () => saveRace(true);
function download(record) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(record)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `jevrace-${record.seed}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#export').onclick = () => download(currentRecord());
function showResults(which = 'current') {
  openModal('#results-dialog');
  setResultsTab(which);
}
function setResultsTab(which) {
  $$('[data-results]').forEach((b) => {
    const active = b.dataset.results === which;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  $('#current-results').hidden = which !== 'current';
  $('#saved-results').hidden = which !== 'saved';
  $('#community-results').hidden = which !== 'community';
  if (which === 'saved') loadArchive();
  else if (which === 'community') loadCommunity();
  else updateResults();
}
$('#results').onclick = () => showResults();
$$('[data-results]').forEach((b) => (b.onclick = () => setResultsTab(b.dataset.results)));
$('#refresh-archive').onclick = () => loadArchive();
let archiveLoading = false,
  archiveLoadedAt = 0;
async function loadArchive() {
  if (archiveLoading || Date.now() - archiveLoadedAt < 5000) return;
  archiveLoading = true;
  archiveLoadedAt = Date.now();
  const list = $('#archive-list');
  list.textContent = 'Loading your races…';
  $('#archive-error').textContent = '';
  try {
    const { races } = await request('/api/races');
    list.innerHTML = races.length
      ? races
          .map(
            (r) =>
              `<article class="archive-row"><span class="archive-flag">${icon(r.finished ? 'Flag' : 'Pause')}</span><div><h3>${esc(r.name)}</h3><p>${esc(new Date(r.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))} · ${r.mode === 'jev' ? 'Jev' : 'Demo'} · ${r.laps} ${r.laps === 1 ? 'lap' : 'laps'} · ${r.finished ? 'Finished' : 'Saved progress'}</p><small>Seed ${r.seed} · ${formatTime(r.duration)}</small></div><button class="archive-share" data-share="${r.id}" data-published="${!!r.published}" data-race-name="${esc(r.name)}" ${r.finished ? '' : 'disabled'}>${r.published ? 'Unpublish' : 'Share'}</button><button class="icon-button" data-watch="${r.id}" aria-label="Replay ${esc(r.name)}" title="Watch replay">${icon('Play')}</button><button class="icon-button" data-delete="${r.id}" aria-label="Delete ${esc(r.name)}" title="Delete recording">${icon('Trash2')}</button></article>`,
          )
          .join('')
      : '<p class="empty-archive">No saved races yet.</p>';
    refreshIcons();
    $$('[data-watch]').forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            startReplay(await request(`/api/races/${b.dataset.watch}`));
          } catch (e) {
            $('#archive-error').textContent = e.message;
            b.disabled = false;
          }
        }),
    );
    $$('[data-share]').forEach(
      (button) =>
        (button.onclick = async () => {
          if (button.dataset.published === 'true') {
            button.disabled = true;
            try {
              await request(`/api/races/${button.dataset.share}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ published: false }),
              });
              archiveLoadedAt = 0;
              communityLoadedAt = 0;
              loadArchive();
            } catch (error) {
              $('#archive-error').textContent = error.message;
              button.disabled = false;
            }
          } else openShare(button.dataset.share, button.dataset.raceName);
        }),
    );
    $$('[data-delete]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (b.dataset.confirm !== 'yes') {
            b.dataset.confirm = 'yes';
            b.innerHTML = 'Delete?';
            b.setAttribute('aria-label', 'Confirm delete recording');
            return;
          }
          try {
            await request(`/api/races/${b.dataset.delete}`, { method: 'DELETE' });
            archiveLoadedAt = 0;
            loadArchive();
          } catch (e) {
            $('#archive-error').textContent = e.message;
          }
        }),
    );
  } catch (e) {
    list.textContent = '';
    $('#archive-error').textContent = e.message;
    archiveLoadedAt = (e.retryAt || Date.now() + 5000) - 5000;
  } finally {
    archiveLoading = false;
  }
}
function startReplay(record) {
  if (!record.frames?.length) return;
  if (!replay) {
    race.running = false;
    live = { race, raceId, raceName, created, finishSaved, lastSaveAttempt, saveMessage };
  }
  replay = { record, time: 0, playing: true };
  race = new Race(record.seed);
  race.limit = record.laps;
  race.configure(record.settings || defaultSettings());
  raceName = record.name;
  if (scene) {
    scene.race = race;
    scene.build();
  }
  applyReplay(race, record, 0);
  $('#results-dialog').close();
  $('#replay-bar').hidden = false;
  $('#replay-seek').max = record.duration;
  $('#finish-overlay').hidden = true;
  document.body.classList.add('is-replay');
  updateUi();
}
$('#watch-current').onclick = () => startReplay(currentRecord());
$('#exit-replay').onclick = () => {
  if (!live) return;
  ({ race, raceId, raceName, created, finishSaved, lastSaveAttempt } = live);
  replay = null;
  live = null;
  if (scene) {
    scene.race = race;
    scene.build();
  }
  $('#replay-bar').hidden = true;
  document.body.classList.remove('is-replay');
  updateUi();
};
$('#replay-seek').oninput = () => {
  if (!replay) return;
  replay.time = Number($('#replay-seek').value);
  applyReplay(race, replay.record, replay.time);
  updateUi();
};
let resultsRenderKey = '';
function updateResults() {
  const renderKey = [raceId, replay?.record.id, raceName, race.time, saveMessage, saving].join('|');
  if (renderKey === resultsRenderKey) return;
  resultsRenderKey = renderKey;
  const record = currentRecord();
  $('#results-race-name').textContent = raceName;
  $('#results-status').textContent =
    `${record.finished ? 'Final classification' : record.duration ? 'Paused' : 'Starting grid'} · ${record.laps} ${record.laps === 1 ? 'lap' : 'laps'}`;
  $('#results-body').innerHTML = record.drivers
    .map(
      (d, i) =>
        `<tr><td class="result-position">${i + 1}</td><td><span class="driver-table-dot" style="background:${d.color}"></span><strong>${esc(d.name)}</strong></td><td>${d.lapTimes.length}/${record.laps}</td><td>${formatTime(d.lapTimes.length ? Math.min(...d.lapTimes) : null)}</td><td>${formatTime(d.finishTime)}</td></tr>`,
    )
    .join('');
  $('#results-mode').textContent = record.mode === 'jev' ? 'Jev · TypeSafe' : 'Local demo';
  $('#saved-config').hidden = record.mode !== 'jev';
  if (record.mode === 'jev') renderSavedConfig(record);
  $('#save-status').textContent = saveMessage.includes('unavailable')
    ? 'Cloud save unavailable. Download this race to keep it.'
    : saveMessage || '';
  $('#save-race').hidden = !saveMessage || saveMessage === 'Saved' || saveMessage === 'Saving…';
  $('#save-race').disabled = saving || !!replay || !race.time;
  $('#watch-current').disabled = !record.duration;
  $('#share-current').disabled = !record.finished || !!record.shared;
  $('#share-current').title = record.finished
    ? 'Publish this replay in Community'
    : 'Finish the race to share it';
}
function renderTiming(ranking, selected) {
  const host = $('#timing-rows');
  ranking.forEach((car, index) => {
    const position = race.cars.indexOf(car);
    let row = host.querySelector(`[data-follow="${position}"]`);
    if (!row) {
      row = document.createElement('button');
      row.className = 'timing-row';
      row.dataset.follow = position;
      row.innerHTML =
        '<span class="timing-pos"></span><span class="timing-number"></span><strong></strong><span class="timing-gap"></span>';
    }
    row.classList.toggle('selected', car === selected);
    row.setAttribute('aria-label', `Follow ${car.name}`);
    row.setAttribute('aria-pressed', String(car === selected));
    row.style.setProperty('--pilot', car.color);
    row.children[0].textContent = index + 1;
    row.children[1].textContent = car.number;
    row.children[2].textContent = car.short;
    row.children[3].textContent = car.finished
      ? 'FIN'
      : !race.time
        ? 'GRID'
        : index === 0
          ? 'LEADER'
          : `+${Math.max(0, ranking[0].progress - car.progress).toFixed(0)} m`;
    if (host.children[index] !== row) host.insertBefore(row, host.children[index] || null);
  });
  $$('.pilot-button').forEach((button, index) => {
    const car = race.cars[index];
    button.querySelector('b').textContent = car.number;
    button.lastElementChild.textContent = car.short;
    button.setAttribute('aria-label', `Follow ${car.name}`);
    button.title = `${car.name} · ${index + 1}`;
  });
}
$('#timing-rows').onclick = (event) => {
  const row = event.target.closest('[data-follow]');
  if (row) selectDriver(Number(row.dataset.follow));
};
function updateUi() {
  const ranking = race.ranking(),
    car = race.cars[scene?.selected ?? 4];
  $('#position-number').textContent = `P${ranking.indexOf(car) + 1}`;
  renderTiming(ranking, car);
  $('#position-name').textContent = car.name;
  $('#selected-speed').textContent = Math.round(car.speed * 3.6);
  $('#clock').textContent = formatTime(race.time);
  $('#lap').innerHTML =
    `${String(Math.min(car.lap + 1, race.limit)).padStart(2, '0')} <em>/ ${String(race.limit).padStart(2, '0')}</em>`;
  $('#race-name').textContent = raceName;
  $('#seed-label').textContent = `#${race.seed}`;
  $('#mode-caption').textContent = replay ? 'REPLAY' : race.mode.toUpperCase();
  $('#live-status').textContent = replay
    ? replay.playing
      ? 'REPLAYING'
      : 'REPLAY PAUSED'
    : race.finished
      ? 'FINISHED'
      : race.waiting
        ? 'DECIDING'
        : race.running
          ? 'RACING'
          : race.time
            ? 'PAUSED'
            : 'ON THE GRID';
  $('#stage-message').textContent =
    sceneError || race.error || (race.waiting ? 'Waiting for Jev…' : '');
  const label = replay
    ? replay.playing
      ? 'Pause replay'
      : replay.time >= replay.record.duration
        ? 'Replay again'
        : 'Play replay'
    : race.finished
      ? 'Race again'
      : race.running
        ? 'Pause'
        : race.time
          ? 'Resume'
          : 'Start race';
  if ($('#start span').textContent !== label) {
    $('#start').innerHTML =
      `${icon((replay ? replay.playing : race.running) ? 'Pause' : 'Play')} <span>${label}</span>`;
    refreshIcons();
  }
  if (race.finished && !replay) {
    if ($('#finish-overlay').hidden) {
      $('#finish-overlay').innerHTML =
        `<strong>${esc(ranking[0].name)} ${ranking[0].finished ? 'wins!' : 'leads'}</strong><button class="secondary-button" id="see-results">Results ${icon('Trophy')}</button>`;
      $('#see-results').onclick = () => showResults();
      $('#finish-overlay').hidden = false;
      refreshIcons();
    }
  } else $('#finish-overlay').hidden = true;
  if (replay) {
    $('#replay-seek').value = replay.time;
    $('#replay-time').textContent = formatTime(replay.time);
  }
  if ($('#results-dialog').open && !$('#current-results').hidden) updateResults();
}
renderGridEditor();
updatePreview();
updateUi();
let last = performance.now();
// Cap elapsed time after backgrounding; a hidden tab must not fast-forward the race.
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (replay) {
    if (replay.playing) {
      replay.time = Math.min(replay.record.duration, replay.time + dt * speed);
      if (replay.time >= replay.record.duration) replay.playing = false;
    }
    applyReplay(race, replay.record, replay.time);
  } else {
    race.tick(dt, speed);
    if (race.finished && !finishSaved) {
      race.captureFrame();
      finishSaved = true;
      saveRace();
    } else if (
      race.running &&
      race.time - lastSaveAttempt >= 30 &&
      Date.now() - lastAutoSaveWall >= 60000
    ) {
      lastAutoSaveWall = Date.now();
      saveRace();
    }
  }
  scene?.render();
  if (now - lastUi > 150) {
    updateUi();
    lastUi = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
$('#setup-dialog').showModal();
window.jevSnapshot = () => ({
  time: race.time,
  mode: replay ? 'replay' : race.mode,
  running: race.running,
  finished: race.finished,
  waiting: race.waiting,
  seed: race.seed,
  name: raceName,
  decisions: race.decisions,
  cars: race.cars.map((c) => ({
    name: c.name,
    x: c.x,
    z: c.z,
    speed: c.speed,
    lap: c.lap,
    progress: c.progress,
  })),
});
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  try {
    Promise.resolve(
      document.modelContext.registerTool(
        {
          name: 'read_race_state',
          description: 'Read race standings, simulation time and driver progress.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true },
          execute: () => window.jevSnapshot(),
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
  } catch {}
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}

function setSetupTab(name) {
  $('#circuit-panel').hidden = name !== 'circuit';
  $('#grid-panel').hidden = name !== 'grid';
  $$('[data-setup-tab]').forEach((b) => {
    const active = b.dataset.setupTab === name;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}
$$('[data-setup-tab]').forEach((b) => (b.onclick = () => setSetupTab(b.dataset.setupTab)));
function renderGridEditor() {
  const driver = DRIVERS[gridDriver],
    config = draftSettings.drivers[gridDriver];
  $('#grid-driver-name').textContent = config.name;
  $('#driver-name').value = config.name;
  $('#driver-number').value = config.number;
  $('#grid-driver-style').textContent = driver.style;
  $('#grid-driver-name').style.setProperty('--pilot', driver.color);
  const models = [...new Set([...availableModels, config.model])];
  $('#driver-model').innerHTML = models
    .map(
      (model) =>
        `<option value="${esc(model)}">${model === 'jev-latest' ? 'Jev · Default' : esc(model)}</option>`,
    )
    .join('');
  $('#driver-model').value = config.model;
  $('#driver-prompt').value = config.prompt;
  $('#race-prompt').value = draftSettings.prompt;
  $$('[data-grid-driver]').forEach((b) => {
    const entry = draftSettings.drivers[Number(b.dataset.gridDriver)];
    b.textContent = entry.number;
    b.setAttribute('aria-label', `Edit ${entry.name}`);
    const active = Number(b.dataset.gridDriver) === gridDriver;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}
$$('[data-grid-driver]').forEach(
  (b) =>
    (b.onclick = () => {
      gridDriver = Number(b.dataset.gridDriver);
      renderGridEditor();
    }),
);
$('#driver-name').oninput = (e) => {
  draftSettings.drivers[gridDriver].name = e.target.value;
  $('#grid-driver-name').textContent = e.target.value;
};
$('#driver-number').oninput = (e) => {
  draftSettings.drivers[gridDriver].number = e.target.value.replace(/\D/g, '').slice(0, 2);
  e.target.value = draftSettings.drivers[gridDriver].number;
  $(`[data-grid-driver="${gridDriver}"]`).textContent = e.target.value;
};
$('#driver-model').onchange = (e) => {
  draftSettings.drivers[gridDriver].model = e.target.value;
};
$('#driver-prompt').oninput = (e) => {
  draftSettings.drivers[gridDriver].prompt = e.target.value;
};
$('#race-prompt').oninput = (e) => {
  draftSettings.prompt = e.target.value;
};
$('#reset-prompts').onclick = () => {
  draftSettings = defaultSettings();
  renderGridEditor();
};
async function connectKey(candidate, source) {
  const status = source === 'setup' ? $('#setup-connection') : $('#key-status');
  if (connecting) return false;
  if (!candidate) {
    status.textContent = key ? 'Connected' : 'Paste a TypeSafe key.';
    return !!key;
  }
  if (!window.isSecureContext) {
    status.textContent = 'Use HTTPS to connect your key.';
    return false;
  }
  if (
    JSON.stringify(draftSettings).includes(candidate) ||
    $('#race-title').value.includes(candidate)
  ) {
    status.textContent = 'Keep your key out of names and prompts.';
    return false;
  }
  const generation = connectionGeneration;
  connecting = true;
  $('#connect-setup').disabled = $('#save-key').disabled = true;
  status.textContent = 'Connecting…';
  try {
    const data = await request('/api/models', {
      headers: { Authorization: `Bearer ${candidate}` },
      signal: AbortSignal.timeout(18000),
    });
    if (generation !== connectionGeneration) return false;
    availableModels = [
      ...new Set([...data.models.map((m) => m.name).filter(validModel), ...MODEL_CHOICES]),
    ];
    key = candidate;
    race.apiKey = key;
    if (live) live.race.apiKey = key;
    $('#setup-key').value = $('#api-key').value = '';
    status.textContent = 'Connected · session only';
    $('#setup-connection').textContent = 'Connected · session only';
    renderGridEditor();
    return true;
  } catch (e) {
    if (generation !== connectionGeneration) return false;
    status.textContent = e.name === 'TimeoutError' ? 'Connection timed out. Try again.' : e.message;
    return false;
  } finally {
    connecting = false;
    $('#connect-setup').disabled = $('#save-key').disabled = false;
  }
}
$('#connect-setup').onclick = () => connectKey($('#setup-key').value.trim(), 'setup');
$('#key-dialog').addEventListener('close', () => {
  $('#api-key').value = '';
});
$('#setup-dialog').addEventListener('close', () => {
  $('#setup-key').value = '';
});
// Prompts come from visitors. Escape them before rendering archived configuration.
function renderSavedConfig(record) {
  const host = $('#saved-config-body');
  if (!record.settings) {
    host.textContent = 'Default grid · earlier recording';
    return;
  }
  host.innerHTML = `<details class="saved-instruction"><summary>Race instruction</summary><p>${esc(record.settings.prompt)}</p></details>${record.settings.drivers
    .map((d) => {
      const driver = DRIVERS.find((c) => c.id === d.id),
        resolved = record.drivers.find((c) => c.id === d.id)?.resolvedModel;
      return `<details class="saved-driver-config"><summary><strong>${esc(d.number || driver?.number || '')} · ${esc(d.name || driver?.name || d.id)}</strong><small>${d.model === 'jev-latest' ? 'Jev · Default' : esc(d.model)}</small></summary><p>${esc(d.prompt)}</p>${resolved ? `<code>${esc(resolved)}</code>` : ''}</details>`;
    })
    .join('')}`;
}

let shareTarget,
  communityLoading = false,
  communityLoadedAt = 0;
function openShare(id, name) {
  shareTarget = id;
  $('#share-name').textContent = name;
  $('#share-error').textContent = '';
  $('#confirm-share').disabled = false;
  openModal('#share-dialog');
}
$('#share-current').onclick = () => openShare(replay?.record.id || raceId, raceName);
$('#confirm-share').onclick = async () => {
  const button = $('#confirm-share');
  button.disabled = true;
  try {
    if (shareTarget === raceId && !replay) await saveRace(true);
    await request(`/api/races/${shareTarget}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: true }),
    });
    archiveLoadedAt = 0;
    communityLoadedAt = 0;
    $('#share-dialog').close();
    showResults('community');
  } catch (error) {
    $('#share-error').textContent = error.message;
    button.disabled = false;
  }
};
$('#refresh-community').onclick = () => loadCommunity();
async function loadCommunity() {
  if (communityLoading || Date.now() - communityLoadedAt < 15000) return;
  communityLoading = true;
  communityLoadedAt = Date.now();
  const list = $('#community-list');
  list.textContent = 'Loading replays…';
  $('#community-error').textContent = '';
  try {
    const { races } = await request('/api/community');
    list.innerHTML = races.length
      ? races
          .map(
            (r) =>
              `<article class="archive-row"><span class="archive-flag">${icon('Flag')}</span><div><h3>${esc(r.name)}</h3><p>${r.mode === 'jev' ? 'Jev' : 'Demo'} · ${r.laps} ${r.laps === 1 ? 'lap' : 'laps'} · ${formatTime(r.duration)}</p><small>${esc(r.drivers[0]?.name || '')} · Seed ${r.seed}</small></div><button class="icon-button" data-public-watch="${r.id}" aria-label="Replay ${esc(r.name)}">${icon('Play')}</button></article>`,
          )
          .join('')
      : '<p class="empty-archive">No shared races yet. Finish a race and share its replay.</p>';
    refreshIcons();
    $$('[data-public-watch]').forEach(
      (button) =>
        (button.onclick = async () => {
          button.disabled = true;
          try {
            startReplay(await request(`/api/community/${button.dataset.publicWatch}`));
          } catch (error) {
            $('#community-error').textContent = error.message;
            button.disabled = false;
          }
        }),
    );
  } catch (error) {
    list.textContent = '';
    $('#community-error').textContent = error.message;
    communityLoadedAt = (error.retryAt || Date.now() + 15000) - 15000;
  } finally {
    communityLoading = false;
  }
}
