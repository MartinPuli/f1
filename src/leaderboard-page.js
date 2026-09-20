import './archive-page.css';
import './leaderboard-page.css';
import { siteNavigation } from './site-navigation.js';
import { aggregateResults } from './leaderboard.js';
const host = document.querySelector('#season');
siteNavigation('leaderboard');
const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
try {
  const response = await fetch('/race-archive.json');
  if (!response.ok) throw new Error();
  const { races } = await response.json();
  host.innerHTML = `<div class="leaderboard-heading"><h1 class="page-title">Leaderboard</h1><select id="leaderboard-scope" aria-label="Races included"><option value="all">All races · ${races.length}</option><option value="championship">Championship · ${races.filter((r) => r.phase === 'championship').length}</option></select></div><div class="leaderboard-scroll"><table><thead><tr><th scope="col">#</th><th scope="col">Driver</th><th scope="col">Wins</th><th scope="col">Avg. position</th><th scope="col">Best lap</th><th scope="col">Finishes</th></tr></thead><tbody id="leaderboard-rows"></tbody></table></div>`;
  function render() {
    const selected = races.filter(
      (r) =>
        document.querySelector('#leaderboard-scope').value === 'all' || r.phase === 'championship',
    );
    document.querySelector('#leaderboard-rows').innerHTML = aggregateResults(selected)
      .map(
        (d, i) =>
          `<tr><td>${i + 1}</td><th scope="row">${esc(d.name)}</th><td>${d.wins}</td><td>${d.averagePosition.toFixed(1)}</td><td>${Number.isFinite(d.bestLap) ? `${d.bestLap.toFixed(3)}s` : '—'}</td><td>${d.finishes}/${d.races}</td></tr>`,
      )
      .join('');
  }
  render();
  document.querySelector('#leaderboard-scope').onchange = render;
} catch {
  host.innerHTML = '<h1>Leaderboard</h1><a href="/leaderboard.html">Try again</a>';
}
