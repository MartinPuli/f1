import './home-page.css';
import { siteNavigation } from './site-navigation.js';
const host = document.querySelector('#project');
if (new URLSearchParams(location.search).has('seasonRace'))
  location.replace(`/watch.html${location.search}`);
const url = (id) => `/watch.html?seasonRace=${encodeURIComponent(id)}&archive=prompt-search`;
host.innerHTML = `<main class="home-main"><section class="video-hero"><video muted loop playsinline preload="metadata" poster="/race-preview.jpg"><source src="/race-preview.mp4" type="video/mp4"></video><div class="hero-actions"><a href="${url('round-3-20260920')}" class="hero-watch">▶ Watch race</a><button id="hero-play" aria-label="Play preview">▶</button><a class="hero-down" href="#circuits" aria-label="View circuits">↓</a></div></section><section id="circuits" class="home-circuits"><div class="home-section-heading"><h1>Circuits</h1><a href="/championship.html">All races ↗</a></div><div class="circuit-grid" id="circuit-grid"></div></section></main>`;
siteNavigation('project');
const video = document.querySelector('video'),
  button = document.querySelector('#hero-play');
const sync = () => {
  button.textContent = video.paused ? '▶' : 'Ⅱ';
  button.setAttribute('aria-label', video.paused ? 'Play preview' : 'Pause preview');
};
video.onplay = sync;
video.onpause = sync;
button.onclick = () => (video.paused ? video.play() : video.pause());
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) video.play().catch(() => {});
try {
  const response = await fetch('/race-archive.json');
  if (!response.ok) throw new Error();
  const { races } = await response.json();
  const seeds = [...new Set(races.map((r) => r.seed))];
  document.querySelector('#circuit-grid').innerHTML = seeds
    .map((seed) => {
      const rounds = races.filter((r) => r.seed === seed),
        race = rounds.at(-1);
      return `<a class="circuit-card" href="${url(race.id)}"><svg viewBox="0 0 320 200" role="img" aria-label="Circuit ${seed}"><path d="${race.path}"/></svg><div><strong>#${seed}</strong><span>${rounds.length} races</span><b>▶</b></div></a>`;
    })
    .join('');
} catch {
  document.querySelector('#circuit-grid').innerHTML =
    '<a href="/championship.html">View races ↗</a>';
}
