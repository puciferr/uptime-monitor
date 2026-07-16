const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

function sparkline(latencies) {
  if (latencies.length < 2) return '';
  const w = 260, h = 40;
  const max = Math.max(...latencies, 1);
  const points = latencies
    .map((ms, i) =>
      `${(i / (latencies.length - 1)) * w},${h - (ms / max) * (h - 4) - 2}`)
    .join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="spark"><polyline points="${points}" /></svg>`;
}

function render(monitors) {
  const el = document.getElementById('monitors');
  if (monitors.length === 0) {
    el.innerHTML = '<p>Zatiaľ žiadne monitory.</p>';
    return;
  }
  el.innerHTML = monitors.map(m => `
    <article class="card ${m.up === null ? 'unknown' : m.up ? 'up' : 'down'}">
      <header>
        <span class="badge"></span>
        <strong>${esc(m.name)}</strong>
        <span class="uptime">${m.uptime24h === null ? '–' : m.uptime24h + ' %'} / 24 h</span>
      </header>
      <div class="url">${esc(m.url)}</div>
      ${sparkline(m.latencies)}
    </article>
  `).join('');
}

async function refresh() {
  const res = await fetch('/api/monitors');
  render(await res.json());
}

refresh();
setInterval(refresh, 30_000);
