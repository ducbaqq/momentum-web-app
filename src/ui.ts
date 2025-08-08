// ui.ts - Enhanced web dashboard with live data from database
import http from 'node:http';
import { config, log } from './config.js';
import { getInitialData, getLiveTicks, getRecentSignals, type LiveTick, type DbSignal } from './db.js';

/* =========================
   Types
   ========================= */
interface CollectorStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  timestamp: string;
  uptime: number;
  checks: {
    websocket: boolean;
    database: boolean;
    symbols: boolean;
  };
}

/* =========================
   Server-Sent Events (SSE)
   ========================= */
export class EventEmitter {
  private clients = new Set<http.ServerResponse>();

  addClient(res: http.ServerResponse): void {
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
  }

  broadcast(type: string, payload: unknown): void {
    const line = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of this.clients) {
      try { res.write(line); } catch { /* ignore broken pipe */ }
    }
  }

  // Convenience emitters
  emitTick(payload: LiveTick): void { this.broadcast('tick', payload); }
  emitSignal(payload: DbSignal): void { this.broadcast('signal', payload); }
  emitStatus(payload: CollectorStatus): void { this.broadcast('status', payload); }
  emitStartup(payload: { symbols: string[] }): void { this.broadcast('startup', payload); }
}

/* =========================
   Collector API Client
   ========================= */
async function fetchCollectorStatus(): Promise<CollectorStatus> {
  try {
    const response = await fetch(`${config.collector.apiUrl}/health`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json() as CollectorStatus;
  } catch (error) {
    log('⚠️  Failed to fetch collector status:', error instanceof Error ? error.message : String(error));
    return {
      status: 'unknown',
      timestamp: new Date().toISOString(),
      uptime: 0,
      checks: { websocket: false, database: false, symbols: false }
    };
  }
}

/* =========================
   Dashboard HTML
   ========================= */
function getDashboardHTML(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Binance Momentum Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html,body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell; margin: 0; background:#0b0e11; color:#e6e6e6;}
    
    /* Header Navigation */
    .header { background: #151a21; border-bottom: 1px solid #20252b; margin-bottom: 20px; }
    .nav { max-width: 1200px; margin: 0 auto; padding: 0 20px; display: flex; align-items: center; height: 60px; }
    .nav h1 { color: #ffd700; margin-right: 40px; font-size: 20px; margin-bottom: 0; }
    .nav-links { display: flex; gap: 20px; }
    .nav-link { color: #9aa0a6; text-decoration: none; padding: 8px 16px; border-radius: 6px; transition: all 0.2s; }
    .nav-link:hover { background: #20252b; color: #e6e6e6; }
    .nav-link.active { background: #ffd700; color: #0b0e11; font-weight: 600; }
    
    .wrap{max-width:1200px;margin:0 auto;padding:0 20px 20px;}
    .page { display: none; }
    .page.active { display: block; }
    
    .status-bar { background: #151a21; border: 1px solid #20252b; border-radius: 8px; padding: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
    .status-indicator { display: flex; align-items: center; gap: 8px; }
    .status-dot { width: 12px; height: 12px; border-radius: 50%; }
    .status-healthy { background: #22c55e; }
    .status-degraded { background: #f59e0b; }
    .status-unhealthy { background: #ef4444; }
    .status-unknown { background: #6b7280; }
    
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:20px;}
    .card{background:#151a21;border:1px solid #20252b;border-radius:12px;padding:16px;}
    .title{font-size:16px;margin:0 0 12px;display:flex;justify-content:space-between;align-items:center;font-weight:600;}
    .pill{font-size:11px;background:#1f2833;padding:4px 8px;border-radius:999px;border:1px solid #2b3642;}
    .pill.signal{background:#ef4444;color:#fff;animation:pulse 1s infinite;}
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    .kv{font-size:13px;display:grid;grid-template-columns:130px 1fr;gap:6px 12px;margin-top:8px;}
    .kv-value { font-family: ui-monospace, 'SF Mono', Consolas, monospace; }
    
    .events{margin-top:20px;background:#111519;border:1px solid #20252b;border-radius:12px;max-height:400px;overflow:auto;}
    .events pre{white-space:pre-wrap;margin:0;padding:12px;font-size:12px;color:#c9d1d9;line-height:1.4;}
    
    /* Details page */
    .coming-soon { text-align: center; padding: 100px 20px; }
    .coming-soon h2 { color: #ffd700; font-size: 48px; margin-bottom: 20px; }
    .coming-soon p { color: #9aa0a6; font-size: 18px; }
    
    .collector-info { background: #151a21; border: 1px solid #20252b; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .collector-info h3 { color: #ffd700; margin-top: 0; }
  </style>
</head>
<body>
  <div class="header">
    <nav class="nav">
      <h1>🚀 Binance Momentum</h1>
      <div class="nav-links">
        <a href="#" class="nav-link" data-page="home">Home</a>
        <a href="#" class="nav-link" data-page="details">Details</a>
      </div>
    </nav>
  </div>

  <div class="wrap">
    <!-- Home Page -->
    <div id="home-page" class="page active">
      <div class="status-bar">
        <div class="status-indicator">
          <div class="status-dot status-unknown" id="status-dot"></div>
          <span id="status-text">Checking collector status...</span>
        </div>
        <div id="status-details">Web App • Connected to Database</div>
      </div>
      
      <div class="grid" id="grid"></div>
      <div class="events"><pre id="log"></pre></div>
    </div>

    <!-- Details Page -->
    <div id="details-page" class="page">
      <div class="collector-info">
        <h3>📊 Data Collector Status</h3>
        <div id="collector-details">Loading collector information...</div>
      </div>
      <div class="coming-soon">
        <h2>Advanced Analytics</h2>
        <p>Historical charts and detailed analysis coming soon</p>
      </div>
    </div>
  </div>

<script>
// Router functionality
const pages = {
  home: document.getElementById('home-page'),
  details: document.getElementById('details-page')
};

const navLinks = document.querySelectorAll('.nav-link');

function showPage(pageName) {
  Object.values(pages).forEach(page => page.classList.remove('active'));
  if (pages[pageName]) {
    pages[pageName].classList.add('active');
  }
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.dataset.page === pageName) {
      link.classList.add('active');
    }
  });
  const url = pageName === 'home' ? '/' : '/' + pageName;
  window.history.pushState({page: pageName}, '', url);
}

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    showPage(link.dataset.page);
  });
});

window.addEventListener('popstate', (e) => {
  const pageName = e.state?.page || getPageFromURL();
  showPage(pageName);
});

function getPageFromURL() {
  const path = window.location.pathname;
  if (path === '/' || path === '') return 'home';
  if (path === '/details') return 'details';
  return 'home';
}

const initialPage = getPageFromURL();
showPage(initialPage);

// Dashboard functionality
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const statusDetails = document.getElementById('status-details');
const collectorDetails = document.getElementById('collector-details');
const grid = document.getElementById('grid');
const logEl = document.getElementById('log');
const symbols = ${JSON.stringify(config.symbols)};

const cells = {};
function ensureCard(sym){
  if(cells[sym]) return;
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = \`
    <div class="title">
      <strong>\${sym}</strong>
      <span class="pill" id="pill-\${sym}">—</span>
    </div>
    <div class="kv">
      <div>Price</div><div class="kv-value" id="p-\${sym}">—</div>
      <div>1m ROC</div><div class="kv-value" id="r1-\${sym}">—</div>
      <div>5m ROC</div><div class="kv-value" id="r5-\${sym}">—</div>
      <div>Volume</div><div class="kv-value" id="v-\${sym}">—</div>
      <div>Vol Avg</div><div class="kv-value" id="va-\${sym}">—</div>
      <div>Book Imbalance</div><div class="kv-value" id="b-\${sym}">—</div>
      <div>Last Signal</div><div class="kv-value" id="s-\${sym}" style="color:#9aa0a6">—</div>
    </div>\`;
  grid.appendChild(el);
  cells[sym] = {
    price: el.querySelector('#p-'+sym),
    r1: el.querySelector('#r1-'+sym),
    r5: el.querySelector('#r5-'+sym),
    v: el.querySelector('#v-'+sym),
    va: el.querySelector('#va-'+sym),
    b: el.querySelector('#b-'+sym),
    s: el.querySelector('#s-'+sym),
    pill: el.querySelector('#pill-'+sym),
  };
}
symbols.forEach(ensureCard);

function logLine(text){
  const ts = new Date().toISOString().substring(11, 23);
  logEl.textContent = \`[\${ts}] \${text}\\n\` + logEl.textContent;
  // Keep only last 50 lines
  const lines = logEl.textContent.split('\\n');
  if (lines.length > 50) {
    logEl.textContent = lines.slice(0, 50).join('\\n');
  }
}

function updateStatusIndicator(status) {
  statusDot.className = 'status-dot status-' + status.status;
  statusText.textContent = 'Collector: ' + status.status;
  
  const checks = status.checks;
  const details = \`WS: \${checks.websocket ? '✅' : '❌'} | DB: \${checks.database ? '✅' : '❌'} | Symbols: \${checks.symbols ? '✅' : '❌'}\`;
  statusDetails.textContent = details;
  
  if (collectorDetails) {
    collectorDetails.innerHTML = \`
      <div><strong>Status:</strong> \${status.status}</div>
      <div><strong>Uptime:</strong> \${Math.round(status.uptime / 1000 / 60)} minutes</div>
      <div><strong>WebSocket:</strong> \${checks.websocket ? 'Connected' : 'Disconnected'}</div>
      <div><strong>Database:</strong> \${checks.database ? 'Connected' : 'Disconnected'}</div>
      <div><strong>Symbols:</strong> \${checks.symbols ? 'Loaded' : 'Not loaded'}</div>
      <div><strong>Last Check:</strong> \${new Date(status.timestamp).toLocaleTimeString()}</div>
    \`;
  }
}

// Load initial data from database
fetch('/api/initial')
  .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
  .then(data => {
    if (Array.isArray(data.ticks)) {
      for (const t of data.ticks) {
        const sym = t.symbol;
        ensureCard(sym);
        const c = cells[sym];
        const v = Number(t.vol || 0), vavg = Number(t.vol_avg || 0);
        c.price.textContent = t.close;
        c.r1.textContent = (t.roc1m != null ? Number(t.roc1m).toFixed(2) : '-') + '%';
        c.r5.textContent = (t.roc5m != null ? Number(t.roc5m).toFixed(2) : '-') + '%';
        c.v.textContent = Math.round(v).toLocaleString();
        c.va.textContent = Math.round(vavg).toLocaleString();
        c.b.textContent = (t.book_imb != null ? Number(t.book_imb).toFixed(2) : '-');
      }
      logLine(\`Loaded \${data.ticks.length} latest ticks from database\`);
    }
    if (Array.isArray(data.signals)) {
      const latestPerSymbol = {};
      for (const s of data.signals) {
        if (!latestPerSymbol[s.symbol]) latestPerSymbol[s.symbol] = s;
      }
      for (const [sym, s] of Object.entries(latestPerSymbol)) {
        ensureCard(sym);
        const c = cells[sym];
        c.s.textContent = \`\${new Date(s.ts).toLocaleTimeString()} • ROC1m: \${Number(s.roc1m).toFixed(2)}% • Vol: \${Math.round(Number(s.vol)).toLocaleString()}\`;
      }
      logLine(\`Loaded \${data.signals.length} recent signals from database\`);
    }
  })
  .catch(err => logLine('[database] ' + err.message));

// Set up Server-Sent Events for live updates
const es = new EventSource('/events');
es.addEventListener('open', () => logLine('Connected to live updates'));
es.addEventListener('error', () => logLine('Disconnected from live updates (retrying...)'));

es.addEventListener('startup', e => {
  const d = JSON.parse(e.data);
  logLine(\`Web app started, monitoring: \${d.symbols.join(', ')}\`);
});

es.addEventListener('status', e => {
  const status = JSON.parse(e.data);
  updateStatusIndicator(status);
});

es.addEventListener('tick', e => {
  const tick = JSON.parse(e.data);
  ensureCard(tick.symbol);
  const c = cells[tick.symbol];
  c.price.textContent = tick.close;
  c.r1.textContent = \`\${tick.roc1m?.toFixed?.(2) ?? '-'}%\`;
  c.r5.textContent = \`\${tick.roc5m?.toFixed?.(2) ?? '-'}%\`;
  c.v.textContent = Math.round(tick.vol || 0).toLocaleString();
  c.va.textContent = Math.round(tick.vol_avg || 0).toLocaleString();
  c.b.textContent = tick.book_imb?.toFixed?.(2) ?? '-';
  
  if (tick.signal) {
    c.pill.textContent = '🔥 SIGNAL';
    c.pill.className = 'pill signal';
    setTimeout(() => {
      c.pill.textContent = '—';
      c.pill.className = 'pill';
    }, 30000);
  }
});

es.addEventListener('signal', e => {
  const signal = JSON.parse(e.data);
  ensureCard(signal.symbol);
  const c = cells[signal.symbol];
  c.s.textContent = \`\${new Date(signal.ts).toLocaleTimeString()} • ROC1m: \${Number(signal.roc1m).toFixed(2)}% • Vol: \${Math.round(Number(signal.vol)).toLocaleString()}\`;
  logLine(\`🔥 SIGNAL: \${signal.symbol} at \${signal.close} | ROC1m: \${Number(signal.roc1m).toFixed(2)}% | ROC5m: \${Number(signal.roc5m).toFixed(2)}%\`);
});

// Poll collector status every 10 seconds
async function checkCollectorStatus() {
  try {
    const response = await fetch('/api/collector-status');
    if (response.ok) {
      const status = await response.json();
      updateStatusIndicator(status);
    }
  } catch (error) {
    console.warn('Failed to check collector status:', error);
  }
}

checkCollectorStatus();
setInterval(checkCollectorStatus, 10000);
</script>
</body></html>`;
}

/* =========================
   HTTP Server
   ========================= */
export class WebServer {
  private emitter: EventEmitter;
  private server: http.Server | null = null;
  private lastTick = new Date();

  constructor(eventEmitter: EventEmitter) {
    this.emitter = eventEmitter;
  }

  private async handleInitialData(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const data = await getInitialData(config.symbols);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: errorMessage }));
    }
  }

  private async handleCollectorStatus(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const status = await fetchCollectorStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: errorMessage }));
    }
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === '/' || req.url === '/index.html' || req.url === '/details') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getDashboardHTML());
        return;
      }
      
      if (req.url === '/api/initial') {
        this.handleInitialData(req, res);
        return;
      }

      if (req.url === '/api/collector-status') {
        this.handleCollectorStatus(req, res);
        return;
      }
      
      if (req.url === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        res.write('\n');
        this.emitter.addClient(res);
        return;
      }
      
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', service: 'webapp' }));
        return;
      }
      
      res.writeHead(404);
      res.end('Not found');
    });

    this.server.listen(config.server.port, config.server.host, () => {
      log(`🌐 Web app listening on http://${config.server.host}:${config.server.port}`);
    });

    // Start live data polling and broadcasting
    this.startLiveDataPolling();

    // Initial startup event
    this.emitter.emitStartup({ symbols: config.symbols });
  }

  private async startLiveDataPolling(): Promise<void> {
    // Poll for new data every 2 seconds
    setInterval(async () => {
      try {
        const now = new Date();
        const [liveTicks, liveSignals] = await Promise.all([
          getLiveTicks(config.symbols, this.lastTick),
          getRecentSignals(this.lastTick)
        ]);

        // Broadcast new ticks
        for (const tick of liveTicks) {
          this.emitter.emitTick(tick);
        }

        // Broadcast new signals
        for (const signal of liveSignals) {
          this.emitter.emitSignal(signal);
        }

        this.lastTick = now;

        // Also broadcast collector status periodically
        const status = await fetchCollectorStatus();
        this.emitter.emitStatus(status);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log('⚠️  Live data polling error:', errorMessage);
      }
    }, 2000);
  }

  close(): void {
    if (this.server) {
      this.server.close();
    }
  }
}
