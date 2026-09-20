import { siteNavigation } from './site-navigation.js';
import './archive-page.css';
const host = document.querySelector('#season');
siteNavigation('races');
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const time = (n) => (Number.isFinite(n) ? `${n.toFixed(2)}s` : 'DNF');
const phase = (r) =>
  ({
    training: 'Practice',
    validation: 'Validation',
    championship: 'Grand Prix',
    confirmation: 'Prompt test',
    'refinement-screen': 'Prompt test',
    'refinement-confirm': 'Prompt test',
  })[r.phase] || 'Prompt test';
const url = (r) => `/watch.html?seasonRace=${encodeURIComponent(r.id)}&archive=prompt-search`;
let active = Math.max(0, Number(new URLSearchParams(location.search).get('season') || 1) - 1);
let races = [];
let sessionFilter = 'all';
function render() {
  const count = Math.ceil(races.length / 10);
  active = Number.isInteger(active) ? Math.max(0, Math.min(active, count - 1)) : 0;
  const seasonRaces = races.slice(active * 10, active * 10 + 10);
  const selected = seasonRaces.filter((r) => sessionFilter === 'all' || phase(r) === sessionFilter);
  host.innerHTML = `<div class="archive-heading"><div><p class="eyebrow">RECORDED WITH JEV</p><h1>Watch the races.</h1><p class="page-description">Pick a season, then press play.</p></div><a class="featured-race" href="${url(races.find((r) => r.id === 'round-3-20260920') || races[0])}"><img src="/race-preview.jpg" alt="Cars racing in the recorded championship final"><span><small>START HERE</small><strong>Watch the championship final <b>▶</b></strong></span></a></div>
  <nav class="season-tabs" aria-label="Seasons">${Array.from({ length: count }, (_, i) => `<button aria-current="${i === active ? 'page' : 'false'}" data-season="${i}">Season ${String(i + 1).padStart(2, '0')}<span>${races.slice(i * 10, i * 10 + 10).length} races</span></button>`).join('')}</nav>
  <div class="collection-heading"><div><h2>Season ${String(active + 1).padStart(2, '0')}</h2><p>${selected.length} recordings</p></div><label class="race-filter">Session <select id="session-filter"><option value="all">All sessions</option>${['Grand Prix', 'Practice', 'Validation', 'Prompt test'].map((label) => `<option ${sessionFilter === label ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
  <div class="race-grid">${selected.map((r, i) => `<article class="race-card"><a class="race-preview" href="${url(r)}" aria-label="Watch race ${races.indexOf(r) + 1}, ${esc(phase(r))}"><svg viewBox="0 0 320 200" aria-label="Circuit ${r.seed}" role="img"><path class="track-edge" d="${r.path}"/><path class="track-road" d="${r.path}"/><path class="track-line" d="${r.path}"/></svg><div class="preview-bottom"><span>#${r.seed}</span><span class="play">▶ <span>Watch race</span></span></div></a><div class="race-body"><div class="race-facts"><span>${r.drivers} drivers · ${r.laps} laps</span><span>${time(r.duration)}</span></div><h3 class="race-card-title">Race ${String(races.indexOf(r) + 1).padStart(2, '0')} <span>${esc(phase(r))}</span></h3><div class="race-call-count">${r.calls.toLocaleString()} Jev calls</div><div class="race-footer"><a class="card-watch" href="${url(r)}">▶ Watch race</a><button data-results="${r.id}" aria-label="Results for race ${races.indexOf(r) + 1}">Results ↗</button></div></div></article>`).join('')}${!selected.length ? '<div class="empty-races"><h3>No sessions of this type in this season.</h3><button id="reset-filter">Show all sessions</button></div>' : ''}</div>
  <footer class="archive-footer"><span>Seasons group recordings by date; original session types are preserved.</span><a href="/prompts.html">Explore prompt evolution ↗</a></footer>
  <dialog id="race-results" aria-labelledby="classification-title"><form method="dialog"><button class="close" aria-label="Close results">×</button></form><div id="result-content"></div></dialog>`;
  document.querySelector('#session-filter').onchange = (event) => {
    sessionFilter = event.target.value;
    render();
    document.querySelector('#session-filter').focus({ preventScroll: true });
  };
  const reset = document.querySelector('#reset-filter');
  if (reset)
    reset.onclick = () => {
      sessionFilter = 'all';
      render();
    };
  host.querySelectorAll('[data-season]').forEach(
    (b) =>
      (b.onclick = () => {
        active = Number(b.dataset.season);
        sessionFilter = 'all';
        history.replaceState(null, '', `?season=${active + 1}`);
        render();
        document.querySelector(`[data-season="${active}"]`).focus({ preventScroll: true });
      }),
  );
  host.querySelectorAll('[data-results]').forEach(
    (b) =>
      (b.onclick = () => {
        const r = races.find((r) => r.id === b.dataset.results);
        document.querySelector('#result-content').innerHTML =
          `<p class="eyebrow">${esc(phase(r))} · #${r.seed}</p><h2 id="classification-title">Classification</h2><ol class="results-list">${[
            ...r.results,
          ]
            .sort((a, b) => a.position - b.position)
            .map(
              (d) =>
                `<li><span>${d.position}</span><strong>${esc(d.name)}</strong><span>${d.finished ? time(d.finishTime) : 'DNF'}</span></li>`,
            )
            .join('')}</ol><a class="watch-link" href="${url(r)}">▶ Watch race</a>`;
        document.querySelector('#race-results').showModal();
      }),
  );
  const dialog = host.querySelector('dialog');
  dialog.onclick = (e) => {
    if (e.target === dialog) dialog.close();
  };
}
try {
  const response = await fetch('/race-archive.json');
  if (!response.ok) throw new Error('Archive unavailable');
  races = (await response.json()).races;
  if (!races.length) host.textContent = 'No recorded races yet.';
  else render();
} catch {
  host.innerHTML = '<p>Could not load races. <a href="/championship.html">Try again</a></p>';
}
