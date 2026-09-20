const app = document.querySelector('#app');
async function enter() {
  await import('./main.js');
}
if (['localhost', '127.0.0.1'].includes(location.hostname)) await enter();
else {
  const response = await fetch('/api/admin');
  if (response.ok && (await response.json()).admin) await enter();
  else {
    await import('./archive-page.css');
    app.innerHTML =
      '<main style="max-width:440px;padding-top:12vh"><a href="/"><img src="/logo.svg" alt="JEVRACE" width="160"></a><h1 style="font-size:52px;margin:32px 0">Admin</h1><form><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required style="display:block;width:100%;padding:14px;margin:12px 0;border:1px solid #b9c7c0;border-radius:10px"><button class="watch-link" style="border:0;width:100%">Sign in</button><p role="alert" id="error"></p></form></main>';
    app.querySelector('form').onsubmit = async (event) => {
      event.preventDefault();
      const button = app.querySelector('button');
      button.disabled = true;
      try {
        const r = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: app.querySelector('input').value }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        location.reload();
      } catch (error) {
        app.querySelector('#error').textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
  }
}
