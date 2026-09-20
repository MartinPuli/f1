import './controls.css';
import { siteNavigation } from './site-navigation.js';
import './project-page.css';
const legacy = new URLSearchParams(location.search);
if (legacy.has('seasonRace')) location.replace(`/watch.html${location.search}`);
const promptPage = location.pathname === '/prompts.html';
const host = document.querySelector('#project');
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const time = (n) => `${n.toFixed(3)}s`;
const replay = (id) => `/watch.html?seasonRace=${encodeURIComponent(id)}&archive=prompt-search`;
try {
  const response = await fetch('/project-story.json');
  if (!response.ok) throw new Error();
  const data = await response.json();
  host.innerHTML = `<main><section id="prompts"><h1 class="page-title">Prompts</h1><div class="prompt-tools"><label for="story-driver">Driver</label><select id="story-driver">${data.drivers.map((d) => `<option value="${d.id}" ${d.id === 'oscar' ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select><label for="story-seed">Circuit</label><select id="story-seed">${[...new Set(data.drivers.flatMap((d) => d.versions.flatMap((v) => v.races.map((r) => r.seed))))].map((seed) => `<option>${seed}</option>`).join('')}</select></div><div id="prompt-story"></div></section></main>`;
  siteNavigation(promptPage ? 'prompts' : 'project');
  let selectedVersion = 3;
  function draw() {
    const d = data.drivers.find((x) => x.id === document.querySelector('#story-driver').value);
    const seed = Number(document.querySelector('#story-seed').value);
    const c = d.comparison;
    const available = d.versions.filter((v) => v.races.some((r) => r.seed === seed));
    const v = available.find((v) => v.version === selectedVersion) || available[0];
    const run = v.races.find((r) => r.seed === seed);
    const parts = v.prompt.split('Current priority:');
    const labels = {
      baseline: 'Original prompt',
      clean: 'Clean racing',
      attack: 'Attack',
      exits: 'Corner exits',
      energy: 'Battery use',
      passing: 'Overtaking',
    };
    document.querySelector('#prompt-story').innerHTML =
      `<div class="prompt-chart" id="version-list"><div class="chart-top"><h3>Version</h3><span>Race time ↓</span></div><div class="version-options">${available
        .map((version) => {
          const r = version.races.find((r) => r.seed === seed);
          return `<button class="version-row" data-version="${version.version}" aria-pressed="${version.version === v.version}"><span class="version-name"><b>v${version.version}</b><small>${esc(labels[version.strategy] || version.strategy)}</small></span><div class="bar-track"><i style="width:${Math.min(100, (r.time / 60) * 100)}%"></i></div><strong>${time(r.time)}</strong></button>`;
        })
        .join(
          '',
        )}</div><div class="retained-summary"><strong>${esc(d.selected)} retained</strong><span>${c.accepted ? `${c.wins}/${c.pairs} paired wins · −${(c.before - c.after).toFixed(2)}s` : 'Unchanged'}</span></div></div><div class="prompt-detail" id="version-instructions"><a class="back-to-versions" href="#version-list">← All versions</a><div class="prompt-version-heading"><span class="version-badge">v${v.version}</span><div><h3>${esc(labels[v.strategy] || v.strategy)}</h3></div></div><p class="visible-prompt">${esc(parts.at(-1).trim())}</p>${parts.length > 1 ? `<details><summary>Driver’s base prompt</summary><p class="prompt-text">${esc(parts[0].trim())}</p></details>` : ''}<a class="primary prompt-replay" href="${replay(run.id)}">▶ Watch this version <span>${time(run.time)}</span></a></div>`;
    document.querySelectorAll('[data-version]').forEach(
      (button) =>
        (button.onclick = () => {
          selectedVersion = Number(button.dataset.version);
          draw();
          document
            .querySelector(`[data-version="${selectedVersion}"]`)
            .focus({ preventScroll: true });
          if (innerWidth < 850)
            document.querySelector('#version-instructions').scrollIntoView({
              behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'instant'
                : 'smooth',
              block: 'start',
            });
        }),
    );
  }
  draw();
  document.querySelector('#story-driver').onchange = () => {
    const d = data.drivers.find((x) => x.id === document.querySelector('#story-driver').value);
    selectedVersion = Number(d.selected.split('-v').at(-1)) || 0;
    draw();
  };
  document.querySelector('#story-seed').onchange = draw;
} catch {
  host.innerHTML =
    '<main><h1>JEVRACE</h1><p>Could not load the project.</p><a href="/championship.html">Watch recorded races ↗</a></main>';
}
