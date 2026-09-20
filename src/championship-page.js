import './championship-page.css';
import { DRIVERS } from './race-config.js';
import { standings } from './championship.js';

const host = document.querySelector('#season');
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const seconds = (n) => (Number.isFinite(n) ? `${n.toFixed(3)}s` : '—');
const signed = (n) => (Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(3)}s` : '—');
const replay = (r) =>
  `/?seasonRace=${encodeURIComponent(r.id)}${search?.rounds.some((item) => item.id === r.id) ? '&archive=prompt-search' : ''}`;
const phaseName = (r) =>
  r.phase === 'training'
    ? `Prompt v${r.generation}`
    : r.phase === 'validation'
      ? r.generation === 0
        ? 'Baseline check'
        : 'Selected check'
      : `Round ${r.id.split('-')[1]}`;
let season,
  search,
  driverId = 'franco',
  seed;

function chart(rows) {
  const values = rows.map((r) => r.results.find((d) => d.id === driverId)?.flyingLap);
  const measured = values.filter(Number.isFinite);
  if (!measured.length) return '<p class="empty">Completed flying laps will appear here.</p>';
  const min = Math.min(...measured) - 0.6,
    max = Math.max(...measured) + 0.6;
  const x = (i) => 58 + i * (Math.max(1, rows.length - 1) === 1 ? 420 : 420 / (rows.length - 1));
  const y = (n) => 145 - ((n - min) / (max - min)) * 104;
  const grid = [min, (min + max) / 2, max]
    .map(
      (n) =>
        `<path d="M48 ${y(n)}H530" class="plot-grid"/><text x="4" y="${y(n) + 4}">${n.toFixed(1)}s</text>`,
    )
    .join('');
  let path = '',
    connected = false;
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) {
      connected = false;
      return;
    }
    path += `${connected ? 'L' : 'M'}${x(i)} ${y(v)} `;
    connected = true;
  });
  return `<svg class="lap-chart" viewBox="0 0 560 194" role="img" aria-label="Flying lap time by prompt generation. Lower is faster.">${grid}<path class="plot-line" d="${path}"/>${rows.map((r, i) => `<text x="${x(i)}" y="185" text-anchor="middle">v${r.generation}</text>${Number.isFinite(values[i]) ? `<circle cx="${x(i)}" cy="${y(values[i])}" r="5"/><text class="plot-value" x="${x(i)}" y="${y(values[i]) - 12}" text-anchor="middle">${seconds(values[i])}</text>` : `<text x="${x(i)}" y="90" text-anchor="middle">No finish</text>`}`).join('')}</svg>`;
}

function renderDriver() {
  const study = search || season;
  const driver = DRIVERS.find((d) => d.id === driverId);
  const rows = study.rounds
    .filter((r) => r.phase === 'training' && r.seed === Number(seed))
    .sort((a, b) => a.generation - b.generation);
  const selected = (search?.localSelected ||
    search?.confirmed ||
    search?.sourceSelected ||
    season.selected)?.[driverId];
  document.querySelector('#driver-panel').innerHTML = `
    <div class="driver-heading"><span class="number" style="--paint:${driver.color}">${esc(driver.number)}</span><div><h2>${esc(driver.name)}</h2><p>${selected ? `Selected ${esc(selected.version)}` : 'Training in progress'}</p></div></div>
    <div class="chart-heading"><h3>Flying lap</h3><label>Circuit <select id="training-seed">${study.trainingSeeds.map((s) => `<option ${s === Number(seed) ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
    ${chart(rows)}<p class="note">Lap 2 on the same circuit. Lower is faster.</p>
    <div class="table-scroll"><table><thead><tr><th>Prompt</th><th>Lap 2</th><th>Total</th><th>Contact</th><th></th></tr></thead><tbody>${rows
      .map((r) => {
        const d = r.results.find((d) => d.id === driverId);
        return `<tr><th>v${r.generation}</th><td>${seconds(d.flyingLap)}</td><td>${d.finished ? seconds(d.finishTime) : 'DNF'}</td><td>${d.collisions}</td><td><a href="${replay(r)}" aria-label="Replay prompt v${r.generation}">Replay ↗</a></td></tr>`;
      })
      .join('')}</tbody></table></div>
    ${search ? confirmation(driverId) : validation(driverId)}
    <h3 class="section-label">Prompt history</h3>
    <div class="prompt-history">${study.generations
      .map((g) => {
        const d = g.drivers[driverId];
        return `<details ${selected?.version === d.version ? 'open' : ''}><summary><span>v${g.id} · ${esc(d.strategy)}</span><span>${selected?.version === d.version ? 'Selected' : study.rounds.some((r) => r.phase === 'training' && r.generation === g.id) ? 'Tested' : 'Queued'}</span></summary><p>${esc(d.prompt)}</p>${g.id > 0 ? `<small>Strategy chosen by Jev from earlier results${Number.isFinite(d.selection?.confidence) ? ` · ${Math.round(d.selection.confidence * 100)}% confidence` : ''}</small>` : ''}</details>`;
      })
      .join('')}</div>${refinementHistory(driverId)}`;
  document.querySelector('#training-seed').onchange = (event) => {
    seed = Number(event.target.value);
    renderDriver();
  };
}

function refinementHistory(id) {
  if (!search?.refinements?.length) return '';
  return search.refinements
    .map((cycle) => {
      const result = cycle.comparisons?.[id];
      return `<h3 class="section-label">Refinement ${cycle.index + 1} · ${cycle.complete ? 'measured' : 'running'}</h3><p class="note">${result ? `${result.accepted ? 'Retained' : 'Rejected'} candidate: ${seconds(result.before)} → ${seconds(result.after)} mean total; ${result.wins}/${result.pairs} paired wins.` : 'Testing local edits to the current prompt.'}</p>${cycle.candidates
        .map((key) => {
          const driver = search.grids[key][id];
          const round = search.rounds.find((r) => r.id === `${key}-${seed}`);
          const sample = round?.results.find((d) => d.id === id);
          return `<details class="all-races"><summary>${esc(driver.version)} · ${esc(driver.edit || 'unchanged control')}${sample ? ` · lap 2 ${seconds(sample.flyingLap)} · total ${seconds(sample.finishTime)}` : ' · queued'}</summary><p>${esc(driver.prompt)}</p>${round ? `<a href="${replay(round)}">Replay ↗</a>` : ''}</details>`;
        })
        .join('')}`;
    })
    .join('');
}

function confirmation(id) {
  const c = (search.localSelected || search.confirmed)?.[id]?.confirmation;
  if (!c)
    return `<div class="validation"><strong>Repeated comparisons ${esc(search.status)}</strong><p>The Season 01 prompt stays selected until the new candidate passes four paired races.</p></div>`;
  return `<div class="validation"><div><span>${c.pairs} paired races · fixed circuits</span><strong>${c.accepted ? 'Candidate retained' : 'Incumbent retained'}</strong></div><p>Mean total: ${seconds(c.before)} → ${seconds(c.after)} · ${c.wins}/${c.pairs} wins</p><small>Promotion requires at least 0.5% faster mean time, ${c.pairs - 1} wins and no additional unfinished races. ${c.samePrompt ? 'The prompt was identical; traffic or response timing can change the result.' : 'This does not prove a global optimum.'}</small></div>`;
}

function validation(id) {
  const rounds = season.rounds.filter((r) => r.phase === 'validation');
  const before = rounds.find((r) => r.generation === 0)?.results.find((d) => d.id === id);
  const after = rounds.find((r) => r.generation === 'selected')?.results.find((d) => d.id === id);
  if (!before || !after) return '';
  const difference =
    before.finished && after.finished ? after.finishTime - before.finishTime : null;
  return `<div class="validation"><div><span>Unseen circuit · ${season.validationSeed}</span><strong>${difference === null ? 'Finish comparison' : `${signed(difference)} total`}</strong></div><p>Baseline ${before.finished ? seconds(before.finishTime) : 'DNF'} → selected ${after.finished ? seconds(after.finishTime) : 'DNF'}</p><small>${difference === null ? 'No comparable pair of finishes.' : difference < 0 ? 'Faster in this run.' : difference > 0 ? 'Slower in this run.' : 'Same time in this run.'} One held-out run; traffic and response latency vary.</small></div>`;
}

function render() {
  const rounds = season.rounds.filter((r) => r.phase === 'championship');
  const table = standings(season.rounds, DRIVERS);
  host.innerHTML = `<section class="season-title"><div><p class="eyebrow">JEVRACE / CHAMPIONSHIP</p><h1>Season 01</h1></div><div class="season-meta"><span class="status">${season.status === 'complete' ? 'Season complete' : esc(season.status)}</span><p>${season.rounds.length} races · 10 drivers<br/>${esc(season.resolvedModel || season.model)} · 2 laps<br/>No scripted incidents</p><a href="/championship/season.json" download>Download history ↓</a> · <a href="/championship/results.csv" download>CSV</a></div></section>
  <nav class="season-tabs" aria-label="Championship views"><button data-tab="championship" aria-pressed="true">Championship <span>${rounds.length}/3</span></button><button data-tab="training" aria-pressed="false">Prompt lab <span>${(search || season).generations.length} versions</span></button></nav>
  <section id="championship-view"><div class="champ-layout"><section><div class="section-heading"><h2>Driver standings</h2><span>POINTS</span></div><ol class="standings">${table
    .map((d, i) => {
      const paint = DRIVERS.find((p) => p.id === d.id);
      return `<li><span class="position">${rounds.length ? i + 1 : '—'}</span><span class="number" style="--paint:${paint.color}">${paint.number}</span><div><strong>${esc(d.name)}</strong><small>${d.wins} wins · ${d.finishes}/${rounds.length} finishes</small></div><b>${d.points}</b></li>`;
    })
    .join(
      '',
    )}</ol></section><section class="race-calendar"><h2>Race calendar</h2>${season.championshipSeeds
    .map((s, i) => {
      const r = rounds.find((r) => r.seed === s);
      return `<article><div class="round-index">0${i + 1}</div><div><p class="eyebrow">SEED ${s}</p><h3>${r ? esc(r.results[0].name) : 'Awaiting race'}</h3><p>${r ? `Winner · ${seconds(r.results[0].finishTime)}` : 'Two laps · ten drivers'}</p>${r ? `<a class="replay-link" href="${replay(r)}">Watch race ↗</a>` : ''}</div></article>`;
    })
    .join(
      '',
    )}<p class="note">25–18–15–12–10–8–6–4–2–1 points. Finishers only. Ties use position countback.</p></section></div></section>
  <section id="training-view" hidden>${search ? `<p class="note">Search snapshot · ${esc(search.status)} · ${esc(new Date(search.updated).toLocaleString())} · ${search.rounds.length - season.rounds.length} additional races · <a href="/prompt-search/season.json" download>Download search history</a></p>` : ''}<div class="lab-layout"><aside><label for="driver-select">Driver</label><select id="driver-select">${DRIVERS.map((d) => `<option value="${d.id}" ${d.id === driverId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select><h2>Every version.<br/>Every attempt saved.</h2><p>Jev chooses a strategy adjustment using each driver’s earlier results. Candidates race the same two circuits. The continued search repeats comparisons before retaining a new prompt; the Season 01 championship stays unchanged.</p><p>Original prompts can win. Unfinished races receive a penalty; slower attempts stay in the history.</p><p class="note">This optimizes prompts. Model weights stay unchanged. All ten cars race together, so differences also include traffic and API latency.</p></aside><section id="driver-panel"></section></div></section>
  <details class="all-races"><summary>All ${season.rounds.length} races & methodology</summary><p>${esc(season.method)}</p><p>Model: ${esc(season.resolvedModel || season.model)}. Physics: 40 Hz. Each driver requests the next decision after its previous reply; one request in flight per driver. Training and held-out seeds are excluded from the championship.</p><div class="table-scroll"><table><thead><tr><th>Session</th><th>Seed</th><th>Calls</th><th>Mean latency</th><th>Recording</th></tr></thead><tbody>${season.rounds.map((r) => `<tr><th>${phaseName(r)}</th><td>${r.seed}</td><td>${r.calls}</td><td>${Math.round(r.latencyMs)}ms</td><td><a href="${replay(r)}">Watch</a> · <a href="/championship/${esc(r.file)}" download>JSON</a></td></tr>`).join('')}</tbody></table></div></details>`;
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.onclick = () => {
      document
        .querySelectorAll('[data-tab]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      document.querySelector('#championship-view').hidden = button.dataset.tab !== 'championship';
      document.querySelector('#training-view').hidden = button.dataset.tab !== 'training';
    };
  });
  document.querySelector('#driver-select').onchange = (event) => {
    driverId = event.target.value;
    renderDriver();
  };
  if (search) {
    const detail = document.createElement('details');
    detail.className = 'all-races';
    detail.innerHTML = `<summary>Continued search · all attempts</summary><p>${esc(search.method)}</p><div class="table-scroll"><table><thead><tr><th>Session</th><th>Seed</th><th>Calls</th><th>Replay</th></tr></thead><tbody>${search.rounds
      .filter((r) => !season.rounds.some((old) => old.id === r.id))
      .map(
        (r) =>
          `<tr><th>${esc(r.id)}</th><td>${r.seed}</td><td>${r.calls}</td><td><a href="${replay(r)}">Watch ↗</a></td></tr>`,
      )
      .join('')}</tbody></table></div>`;
    document.querySelector('#training-view').append(detail);
  }
  renderDriver();
}

try {
  const response = await fetch('/championship/season.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Championship history is not available yet.');
  season = await response.json();
  try {
    const extra = await fetch('/prompt-search/season.json', { cache: 'no-store' });
    if (extra.ok) search = await extra.json();
  } catch {
    /* The original season remains readable if the search snapshot is unavailable. */
  }
  seed = season.trainingSeeds[0];
  render();
} catch (error) {
  host.innerHTML = `<h1>Championship</h1><p role="alert">${esc(error.message)}</p><a href="/championship.html">Try again</a>`;
}
