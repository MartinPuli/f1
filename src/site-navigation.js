import './analytics.js';
import './site-navigation.css';
export function siteNavigation(current) {
  const items = [
    ['races', '/championship.html', 'Races'],
    ['leaderboard', '/leaderboard.html', 'Leaderboard'],
    ['prompts', '/prompts.html', 'Prompts'],
  ];
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `<div class="site-header-inner"><a class="site-logo" href="/" aria-label="JEVRACE home"><img src="/logo.svg" alt="JEVRACE"></a><nav aria-label="Main navigation">${items.map(([id, href, label]) => `<a href="${href}" ${id === current ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav></div>`;
  const old = document.querySelector('.project-nav,.masthead');
  if (old) old.replaceWith(header);
  else document.body.prepend(header);
  if (!document.querySelector('.skip-content')) {
    const skip = document.createElement('a');
    skip.className = 'skip-content';
    skip.href = '#page-content';
    skip.textContent = 'Skip to content';
    document.body.prepend(skip);
    const main = document.querySelector('main');
    if (main) main.id = 'page-content';
  }
}
