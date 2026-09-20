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
  host.innerHTML = `<header class="project-nav"><a href="/" aria-label="Home"><img src="/logo.svg" alt="JEVRACE"></a><nav><a href="#experiment">How it works</a><a href="#prompts">The prompts</a><a href="/championship.html">Watch races ↗</a></nav></header>
 <main><section class="project-hero"><div class="hero-copy"><h1>Ten drivers.<br>Powered by <em>Jev.</em></h1><p>Watch the races. See what Jev decided and how each driver’s prompt changed.</p><a class="primary" href="${replay('round-3-20260920')}">▶ Watch the final race</a><a class="text-link" href="/prompts.html">Explore prompt evolution ↗</a></div><div class="race-window"><video id="race-clip" muted loop playsinline preload="metadata" poster="/race-preview.jpg"><source src="/race-preview.mp4" type="video/mp4"></video><div class="clip-caption"><span>Recorded race · Jev ${esc(data.model.replace('jev-', ''))}</span><button id="clip-toggle" aria-label="Play race preview">▶</button></div></div></section>
 <div class="project-facts"><span><b>${data.count}</b> recorded races</span><span><b>10</b> driver prompts</span><span><b>6</b> strategy versions</span><span><b>2 laps</b> per race</span></div>
 <section id="experiment" class="project-section"><div class="section-intro"><h2>How Jev drives each car.</h2><p>Jev chooses the intent. The simulator handles steering, grip and contact.</p></div><div class="decision-flow"><div class="observation"><span class="step-label">01 / OBSERVE</span><h3>Franco ColJEVpinto</h3><p class="small">Recorded at ${data.sample.t.toFixed(2)}s</p><dl><div><dt>Speed</dt><dd>${Math.round(data.sample.observation.speed * 3.6)} <small>km/h</small></dd></div><div><dt>Battery</dt><dd>${Math.round(data.sample.observation.battery * 100)}<small>%</small></dd></div><div><dt>Car ahead</dt><dd>${data.sample.observation.ahead ?? '—'} <small>m</small></dd></div></dl></div><div class="decision"><span class="step-label">02 / JEV RESPONSE</span><div class="response-title"><h3>${esc(data.sample.model)}</h3><span>${data.sample.ms}ms</span></div>${[
   'line',
   'pace',
   'power',
 ]
   .map(
     (key) =>
       `<div class="choice"><span>${{ line: 'Lane', pace: 'Pace', power: 'Battery' }[key]}</span><strong>${esc(data.sample.response[key].choice)}</strong><div class="probabilities">${Object.entries(
         data.sample.response[key].probabilities,
       )
         .map(
           ([label, value]) =>
             `<span title="${esc(label)}: ${Math.round(value * 100)}%" style="--share:${value * 100}%"><i style="width:${value * 100}%"></i>${esc(label)} ${Math.round(value * 100)}%</span>`,
         )
         .join('')}</div></div>`,
   )
   .join(
     '',
   )}<details><summary>Recorded response</summary><pre>${esc(JSON.stringify(data.sample.response, null, 2))}</pre></details></div></div><div class="next-steps"><div><span class="step-label">03 / DRIVE</span><p>The car follows that choice while its next request is in flight.</p></div><div><span class="step-label">04 / COMPARE</span><p>Jev picks a strategy to test. Paired races on the same circuits decide what stays.</p></div></div></section>
 <section id="prompts" class="project-section"><div class="section-intro"><h2>How the prompts changed.</h2><p>Choose a driver, then select a version to read its prompt and watch its race.</p></div><div class="prompt-tools"><label for="story-driver">Driver</label><select id="story-driver">${data.drivers.map((d) => `<option value="${d.id}" ${d.id === 'oscar' ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select><label for="story-seed">Circuit</label><select id="story-seed"><option>8912</option><option>2046</option></select></div><div id="prompt-story"></div></section>
 <section class="project-section findings"><div class="section-intro"><h2>The confirmed improvements.</h2><p>Mean race time across four paired comparisons, on the same circuits.</p></div><div class="improvement-grid">${data.drivers
   .filter((d) => d.comparison.accepted)
   .map(
     (d) =>
       `<article><p>${esc(d.name)}</p><strong>−${(d.comparison.before - d.comparison.after).toFixed(2)}<small>s</small></strong><div>${time(d.comparison.before)} <span>→</span> ${time(d.comparison.after)}</div><p class="small">${d.comparison.wins}/${d.comparison.pairs} paired wins · ${esc(d.selected)}</p></article>`,
   )
   .join(
     '',
   )}</div><p class="small">Other drivers kept their earlier prompts. Later trials stopped before confirmation.</p></section>
 <section class="archive-cta"><div><p class="kicker">30 SAVED RACES</p><h2>Choose your next race.</h2><p>Original decisions, results and 3D replays.</p></div><a class="primary" href="/championship.html">Explore the seasons ↗</a></section></main><footer class="project-footer"><img src="/logo.svg" alt="JEVRACE"><a href="/lab.html">Full results ↗</a></footer>`;
  siteNavigation(promptPage ? 'prompts' : 'project');
  let selectedVersion = 3;
  function draw() {
    const d = data.drivers.find((x) => x.id === document.querySelector('#story-driver').value);
    const seed = Number(document.querySelector('#story-seed').value);
    const c = d.comparison;
    const v = d.versions.find((v) => v.version === selectedVersion) || d.versions[0];
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
      `<div class="prompt-chart" id="version-list"><div class="chart-top"><h3>Select a prompt version</h3><span>Race time ↓</span></div><div class="version-options">${d.versions
        .map((version) => {
          const r = version.races.find((r) => r.seed === seed);
          return `<button class="version-row" data-version="${version.version}" aria-pressed="${version.version === v.version}"><span class="version-name"><b>v${version.version}</b><small>${esc(labels[version.strategy] || version.strategy)}</small></span><div class="bar-track"><i style="width:${Math.min(100, (r.time / 60) * 100)}%"></i></div><strong>${time(r.time)}</strong></button>`;
        })
        .join(
          '',
        )}</div><p class="small">Same circuit, two laps. Lower is faster.</p><div class="retained-summary"><strong>${esc(d.selected)} retained</strong><span>${c.accepted ? `${c.wins}/${c.pairs} paired wins · −${(c.before - c.after).toFixed(2)}s` : 'No confirmed improvement over the earlier prompt.'}</span></div></div><div class="prompt-detail" id="version-instructions"><a class="back-to-versions" href="#version-list">← All versions</a><div class="prompt-version-heading"><span class="version-badge">v${v.version}</span><div><span class="step-label">TESTED STRATEGY</span><h3>${esc(labels[v.strategy] || v.strategy)}</h3></div></div><p class="instruction-label">What Jev was told</p><p class="visible-prompt">${esc(parts.at(-1).trim())}</p>${parts.length > 1 ? `<details><summary>Driver’s base prompt</summary><p class="prompt-text">${esc(parts[0].trim())}</p></details>` : ''}<a class="primary prompt-replay" href="${replay(run.id)}">▶ Watch this version <span>${time(run.time)}</span></a><p class="small">Circuit #${seed} · recorded Jev calls</p></div>`;
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
  if (promptPage) {
    document.body.classList.add('prompt-page');
    document.querySelector('.project-hero').hidden = true;
    document.querySelector('.project-facts').hidden = true;
    document.querySelector('#experiment').hidden = true;
    document.querySelector('#prompts').classList.add('prompt-page-heading');
  }
  document.querySelector('.project-facts').remove();
  document.querySelector('.archive-cta').remove();
  if (!promptPage) document.querySelector('#prompts').hidden = true;
  else document.querySelector('.findings').hidden = true;
  const video = document.querySelector('video'),
    button = document.querySelector('#clip-toggle');
  function sync() {
    button.textContent = video.paused ? '▶' : 'Ⅱ';
    button.setAttribute('aria-label', video.paused ? 'Play race preview' : 'Pause race preview');
  }
  video.onplay = sync;
  video.onpause = sync;
  button.onclick = () => (video.paused ? video.play() : video.pause());
  if (!promptPage && !matchMedia('(prefers-reduced-motion: reduce)').matches)
    video.play().catch(() => {});
} catch {
  host.innerHTML =
    '<main><h1>JEVRACE</h1><p>Could not load the project.</p><a href="/championship.html">Watch recorded races ↗</a></main>';
}
