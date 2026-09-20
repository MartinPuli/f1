import { circuitName } from './race-names.js';
import './home-page.css';
import { siteNavigation } from './site-navigation.js';
const host = document.querySelector('#project');
if (new URLSearchParams(location.search).has('seasonRace'))
  location.replace(`/watch.html${location.search}`);
const url = (id) => `/watch.html?seasonRace=${encodeURIComponent(id)}&archive=prompt-search`;
host.innerHTML = `<main class="home-main">
<section class="video-hero" aria-label="Recorded Jev race">
<div class="hero-screen"><video muted loop playsinline preload="metadata" poster="/race-preview-hq.jpg" aria-label="Golden Coast race recording"><source src="/race-preview-4k.mp4" media="(min-width: 1100px)" type="video/mp4"><source src="/race-preview-1080.mp4" type="video/mp4"></video></div>
<div class="hero-toolbar"><div class="hero-caption"><strong>Golden Coast</strong><span>10 drivers · Jev 1.13.0</span></div><div class="hero-actions"><button id="show-race-data" aria-haspopup="dialog">Race data</button><button id="hero-fullscreen" aria-label="View fullscreen" title="View fullscreen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg></button><button id="hero-play" aria-label="Play preview">▶</button><a href="${url('round-3-20260920')}" class="hero-watch">Watch race <span aria-hidden="true">▶</span></a></div></div>
</section>
<dialog id="race-data" aria-labelledby="race-data-title"><form method="dialog"><button class="data-close" aria-label="Close race data">×</button></form><h2 id="race-data-title">Golden Coast</h2><p class="data-summary">Each driver’s prompt and observations go to Jev.<br>It chooses lane, pace and battery. Physics handles the car.</p><div id="decision-example" class="decision-example"><a href="/prompts.html">Driver prompts</a></div></dialog>
<section id="circuits" class="home-circuits home-section"><div class="home-section-heading"><h1>Circuits</h1><a href="/championship.html">All races</a></div><div class="circuit-grid" id="circuit-grid"></div></section></main>`;
siteNavigation('project');
document.body.classList.add('home-page');
const heroScreen = document.querySelector('.hero-screen');
heroScreen.append(document.querySelector('.site-header'));
heroScreen.append(document.querySelector('.hero-toolbar'));
const raceData = document.querySelector('#race-data');
document.querySelector('#show-race-data').onclick = () => raceData.showModal();
raceData.addEventListener('click', (event) => {
  if (event.target === raceData) {
    const rect = raceData.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      raceData.close();
  }
});
const video = document.querySelector('video'),
  button = document.querySelector('#hero-play');
const sync = () => {
  button.textContent = video.paused ? '▶' : 'Ⅱ';
  button.setAttribute('aria-label', video.paused ? 'Play preview' : 'Pause preview');
};
video.onplay = sync;
video.onpause = sync;
button.onclick = () => (video.paused ? video.play() : video.pause());
const fullscreenButton = document.querySelector('#hero-fullscreen');
fullscreenButton.hidden = !video.requestFullscreen && !video.webkitEnterFullscreen;
fullscreenButton.onclick = async () => {
  video.controls = true;
  try {
    if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    else await video.requestFullscreen();
  } catch {
    video.controls = false;
  }
};
video.addEventListener('webkitendfullscreen', () => {
  video.controls = false;
});
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) video.controls = false;
});
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
if (!reducedMotion.matches) video.play().catch(() => {});
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => entry.target.classList.toggle('in-view', entry.isIntersecting));
  },
  { threshold: 0.15 },
);
document.querySelectorAll('.home-section').forEach((section) => observer.observe(section));

// These values come from a saved Jev response, not a live or generated activity feed.
async function loadDecision() {
  try {
    const response = await fetch('/project-story.json');
    if (!response.ok) throw new Error();
    const { sample } = await response.json();
    const labels = { line: 'Lane', pace: 'Pace', power: 'Battery' };
    document.querySelector('#decision-example').innerHTML =
      `<div class="example-observation"><div class="example-caption"><span class="record-dot"></span>Recorded decision <time>00:${sample.t.toFixed(2)}</time></div><h3>Franco ColJEVpinto</h3><dl><div><dt>Speed</dt><dd>${Math.round(sample.observation.speed * 3.6)} <small>km/h</small></dd></div><div><dt>Car ahead</dt><dd>${sample.observation.ahead} <small>m</small></dd></div><div><dt>Grip</dt><dd>${Math.round(sample.observation.grip * 100)}<small>%</small></dd></div></dl><a class="prompt-link" href="/prompts.html">Read the driver prompts</a></div><div class="example-response"><div class="response-heading"><strong>Jev response</strong><span>${sample.ms} ms</span></div><div class="decision-tabs" role="group" aria-label="Decision type">${Object.entries(
        labels,
      )
        .map(
          ([key, label]) =>
            `<button data-decision="${key}" aria-pressed="${key === 'line'}">${label}</button>`,
        )
        .join('')}</div><div id="choice-output" aria-live="polite"></div></div>`;
    function showChoice(key) {
      const answer = sample.response[key];
      document
        .querySelectorAll('[data-decision]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.decision === key)));
      document.querySelector('#choice-output').innerHTML =
        `<div class="chosen-action"><span>${labels[key]}</span><strong>${answer.choice}</strong></div><div class="choice-bars">${Object.entries(
          answer.probabilities,
        )
          .sort((a, b) => b[1] - a[1])
          .map(
            ([name, value]) =>
              `<div class="choice-row ${name === answer.choice ? 'chosen' : ''}"><span>${name}</span><div class="choice-track"><i style="--probability:${value * 100}%"></i></div><b>${Math.round(value * 100)}%</b></div>`,
          )
          .join('')}</div>`;
    }
    document
      .querySelectorAll('[data-decision]')
      .forEach((b) => (b.onclick = () => showChoice(b.dataset.decision)));
    showChoice('line');
  } catch {
    /* The prompts link remains available if the saved example cannot load. */
  }
}
async function loadCircuits() {
  try {
    const response = await fetch('/race-archive.json');
    if (!response.ok) throw new Error();
    const { races } = await response.json();
    const seeds = [...new Set(races.map((r) => r.seed))];
    document.querySelector('#circuit-grid').innerHTML = seeds
      .map((seed) => {
        const rounds = races.filter((r) => r.seed === seed),
          race = rounds.at(-1);
        return `<a class="circuit-card" href="${url(race.id)}"><div class="circuit-map"><svg viewBox="0 0 320 200" role="img" aria-label="Circuit ${seed}"><path d="${race.path}"/><path class="circuit-trace" pathLength="100" d="${race.path}"/></svg><span class="circuit-play" aria-hidden="true">▶</span></div><div class="circuit-caption"><strong>${circuitName(seed)}</strong><span>${rounds.length} ${rounds.length === 1 ? 'race' : 'races'}</span></div></a>`;
      })
      .join('');
  } catch {
    document.querySelector('#circuit-grid').innerHTML =
      '<a href="/championship.html">View races</a>';
  }
}
await Promise.allSettled([loadDecision(), loadCircuits()]);
