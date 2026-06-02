/**
 * GPU Monitor — SPA Frontend Controller
 *
 * Features:
 * - SSE-based real-time updates (push from server, no polling)
 * - Pull-to-refresh on mobile
 * - Incremental DOM updates for snappy feel
 * - Connection status indicator
 * - Network info modal for connecting from other devices
 * - Responsive mobile-first design
 */

/* ------------------------------------------------------------------ */
/*  Configuration                                                     */
/* ------------------------------------------------------------------ */

const API_ENDPOINT = '/api/gpu';
const SSE_ENDPOINT = '/api/events';
const NETWORK_ENDPOINT = '/api/network';
const DEFAULT_INTERVAL = 5;          // seconds (fallback if SSE fails)
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 60;

/* ------------------------------------------------------------------ */
/*  State                                                             */
/* ------------------------------------------------------------------ */

let refreshTimer = null;
let refreshInterval = DEFAULT_INTERVAL;
let autoRefreshEnabled = true;
let isFirstRender = true;
let sseConnection = null;
let sseConnected = false;
let isPulling = false;
let pullStartY = 0;
let pullCurrentY = 0;

/* ------------------------------------------------------------------ */
/*  DOM References                                                    */
/* ------------------------------------------------------------------ */

const gpuGrid         = document.getElementById('gpuGrid');
const driverVersionEl = document.getElementById('driverVersion');
const cudaVersionEl   = document.getElementById('cudaVersion');
const lastUpdateEl    = document.getElementById('lastUpdate');
const refreshBtn      = document.getElementById('refreshBtn');
const autoRefreshCb   = document.getElementById('autoRefresh');
const intervalDisp    = document.getElementById('intervalDisplay');
const connectionStatus = document.getElementById('connectionStatus');
const networkInfoEl   = document.getElementById('networkInfo');
const menuBtn         = document.getElementById('menuBtn');
const connectModal    = document.getElementById('connectModal');
const networkUrlsEl   = document.getElementById('networkUrls');
const closeModalBtn   = document.getElementById('closeModal');
const headerInfo      = document.getElementById('headerInfo');

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                   */
/* ------------------------------------------------------------------ */

function colorClass(value) {
  if (value < 60) return 'green';
  if (value <= 80) return 'yellow';
  return 'red';
}

function formatMemory(raw) {
  if (!raw) return '\u2014';
  const match = String(raw).match(/([\d.]+)\s*MiB/i);
  if (match) {
    const mi = parseFloat(match[1]);
    if (mi >= 1024) return `${(mi / 1024).toFixed(1)} GB`;
    return `${Math.round(mi)} MB`;
  }
  const matchGB = String(raw).match(/([\d.]+)\s*GiB/i);
  if (matchGB) return `${parseFloat(matchGB[1]).toFixed(1)} GB`;
  return raw;
}

function formatTimestamp(iso) {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ------------------------------------------------------------------ */
/*  SSE Connection (primary data source)                              */
/* ------------------------------------------------------------------ */

function connectSSE() {
  // Close existing connection
  if (sseConnection) {
    sseConnection.close();
    sseConnection = null;
  }

  sseConnection = new EventSource(SSE_ENDPOINT);

  sseConnection.onopen = () => {
    sseConnected = true;
    updateConnectionStatus(true);
    console.log('[gpu-monitor] SSE connected');
  };

  sseConnection.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      renderGpuCards(data);
    } catch (err) {
      console.error('[gpu-monitor] SSE parse error:', err);
    }
  });

  sseConnection.onerror = (err) => {
    sseConnected = false;
    updateConnectionStatus(false);
    console.error('[gpu-monitor] SSE error:', err);

    // Fallback to polling if SSE fails
    if (autoRefreshEnabled) {
      startAutoRefresh();
    }
  };
}

function updateConnectionStatus(connected) {
  if (connected) {
    connectionStatus.className = 'status-indicator connected';
    connectionStatus.textContent = '● SSE Connected';
  } else {
    connectionStatus.className = 'status-indicator disconnected';
    connectionStatus.textContent = '● Polling (SSE unavailable)';
  }
}

/* ------------------------------------------------------------------ */
/*  GPU Card — create or find by GPU id                               */
/* ------------------------------------------------------------------ */

function getOrCreateCard(gpu) {
  let card = gpuGrid.querySelector(`[data-gpu-id="${gpu.id}"]`);

  if (!card) {
    card = document.createElement('div');
    card.className = 'gpu-card';
    card.dataset.gpuId = gpu.id;
    if (isFirstRender) {
      card.style.animationDelay = `${gpuGrid.children.length * 80}ms`;
    }

    card.innerHTML = `
      <div class="gpu-card-header">
        <span class="gpu-name"></span>
        <span class="gpu-id"></span>
      </div>

      <div class="metric-row">
        <div class="metric-label">
          <span class="label">GPU</span>
          <span class="value"></span>
        </div>
        <div class="progress-track">
          <div class="progress-fill"></div>
        </div>
      </div>

      <div class="metric-row">
        <div class="metric-label">
          <span class="label">Memory</span>
          <span class="value"></span>
        </div>
        <div class="progress-track">
          <div class="progress-fill"></div>
        </div>
      </div>

      <div class="metric-row">
        <div class="metric-label">
          <span class="label">Temp</span>
          <span class="value"></span>
        </div>
        <div class="progress-track">
          <div class="progress-fill"></div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <span class="label">Fan</span>
          <span class="value"></span>
        </div>
        <div class="detail-item">
          <span class="label">Power</span>
          <span class="value"></span>
        </div>
        <div class="detail-item">
          <span class="label">Limit</span>
          <span class="value"></span>
        </div>
        <div class="detail-item">
          <span class="label">P-State</span>
          <span class="value"></span>
        </div>
      </div>
    `;

    gpuGrid.appendChild(card);
  }

  return card;
}

function updateCard(card, gpu) {
  const { querySelector: q, querySelectorAll: qa } = card;

  q('.gpu-name').textContent = gpu.name;
  q('.gpu-id').textContent = `GPU ${gpu.id}`;

  const metricRows = qa('.metric-row');

  // GPU Utilization
  const gpuFill = metricRows[0].querySelector('.progress-fill');
  metricRows[0].querySelector('.value').textContent = `${gpu.gpuUtil}%`;
  updateProgressFill(gpuFill, gpu.gpuUtil, colorClass(gpu.gpuUtil));

  // Memory Usage
  const memFill = metricRows[1].querySelector('.progress-fill');
  metricRows[1].querySelector('.value').textContent =
    `${formatMemory(gpu.memoryUsed)} / ${formatMemory(gpu.memoryTotal)}`;
  updateProgressFill(memFill, gpu.memUtil, colorClass(gpu.memUtil));

  // Temperature
  const tempFill = metricRows[2].querySelector('.progress-fill');
  metricRows[2].querySelector('.value').textContent = `${gpu.temp}\u00B0C`;
  updateProgressFill(tempFill, Math.min(gpu.temp, 100), `temp-${colorClass(gpu.temp)}`);

  // Detail grid
  const detailValues = qa('.detail-item .value');
  detailValues[0].textContent = gpu.fan || '\u2014';
  detailValues[1].textContent = gpu.powerDraw || '\u2014';
  detailValues[2].textContent = gpu.powerLimit || '\u2014';
  detailValues[3].textContent = gpu.perfState || '\u2014';
}

function updateProgressFill(fill, width, colorClassStr) {
  const classes = ['green', 'yellow', 'red', 'temp-green', 'temp-yellow', 'temp-red'];
  fill.className = 'progress-fill ' + colorClassStr;

  if (isFirstRender) {
    fill.style.width = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fill.style.width = `${width}%`;
      });
    });
  } else {
    fill.style.width = `${width}%`;
  }
}

/* ------------------------------------------------------------------ */
/*  Render functions                                                  */
/* ------------------------------------------------------------------ */

function renderGpuCards(data) {
  const { gpus, driverVersion, cudaVersion, timestamp } = data;

  driverVersionEl.textContent = `Driver: ${driverVersion || 'N/A'}`;
  cudaVersionEl.textContent   = `CUDA: ${cudaVersion || 'N/A'}`;
  lastUpdateEl.innerHTML      = `<span class="live-dot"></span>${formatTimestamp(timestamp)}`;

  if (!gpus || gpus.length === 0) {
    gpuGrid.innerHTML = '<div class="empty-state">No GPUs detected</div>';
    isFirstRender = false;
    return;
  }

  if (isFirstRender) {
    gpus.forEach(gpu => {
      const card = getOrCreateCard(gpu);
      updateCard(card, gpu);
    });
    isFirstRender = false;
  } else {
    const presentIds = new Set(gpus.map(g => g.id));

    gpus.forEach(gpu => {
      const card = getOrCreateCard(gpu);
      updateCard(card, gpu);
    });

    gpuGrid.querySelectorAll('.gpu-card').forEach(card => {
      if (!presentIds.has(card.dataset.gpuId)) {
        card.remove();
      }
    });
  }
}

function showLoading() {
  gpuGrid.innerHTML = '<div class="loading">Loading GPU data...</div>';
}

function showError(message) {
  gpuGrid.innerHTML = `
    <div class="error-state">
      <span>\u26A0 Failed to fetch GPU data</span>
      <span class="error-detail">${escapeHtml(message)}</span>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/*  Data fetching (fallback polling)                                  */
/* ------------------------------------------------------------------ */

async function fetchGpuData() {
  try {
    const res = await fetch(API_ENDPOINT);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();
    renderGpuCards(data);
  } catch (err) {
    console.error('[gpu-monitor] Fetch error:', err);
    showError(err.message);
  }
}

/* ------------------------------------------------------------------ */
/*  Auto-refresh management (fallback polling)                        */
/* ------------------------------------------------------------------ */

function startAutoRefresh() {
  stopAutoRefresh();
  if (!autoRefreshEnabled) return;
  refreshTimer = setInterval(fetchGpuData, refreshInterval * 1000);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function toggleAutoRefresh() {
  autoRefreshEnabled = autoRefreshCb.checked;
  if (autoRefreshEnabled) {
    if (sseConnected) {
      connectSSE();
    } else {
      startAutoRefresh();
    }
  } else {
    if (sseConnection) sseConnection.close();
    stopAutoRefresh();
  }
}

function updateInterval(newInterval) {
  newInterval = Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, parseInt(newInterval, 10)));
  if (isNaN(newInterval)) newInterval = DEFAULT_INTERVAL;
  refreshInterval = newInterval;
  intervalDisp.textContent = refreshInterval;
  if (autoRefreshEnabled && !sseConnected) {
    startAutoRefresh();
  }
}

/* ------------------------------------------------------------------ */
/*  Pull-to-refresh (mobile)                                          */
/* ------------------------------------------------------------------ */

function initPullToRefresh() {
  let startY = 0;
  let pulling = false;
  let pullIndicator = null;

  document.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;

    if (diff > 0 && diff < 200) {
      e.preventDefault();

      if (!pullIndicator) {
        pullIndicator = document.createElement('div');
        pullIndicator.className = 'pull-indicator';
        pullIndicator.innerHTML = '<span>↓</span><span>Release to refresh</span>';
        document.body.appendChild(pullIndicator);
      }

      const opacity = Math.min(diff / 150, 1);
      pullIndicator.style.transform = `translateY(${diff - 50}px)`;
      pullIndicator.style.opacity = opacity;
    }
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (pullIndicator && pullIndicator.style.opacity === '1') {
      fetchGpuData();
      refreshBtn.classList.add('spinning');
      setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
    }

    if (pullIndicator) {
      pullIndicator.remove();
      pullIndicator = null;
    }
    pulling = false;
  });
}

/* ------------------------------------------------------------------ */
/*  Network info modal                                                */
/* ------------------------------------------------------------------ */

async function loadNetworkInfo() {
  try {
    const res = await fetch(NETWORK_ENDPOINT);
    if (!res.ok) return;
    const data = await res.json();

    if (data.local && data.local.length > 0) {
      networkUrlsEl.innerHTML = data.local.map(url =>
        `<div class="network-url"><span class="url-text">${escapeHtml(url)}</span><button class="copy-btn" data-url="${escapeHtml(url)}">Copy</button></div>`
      ).join('');

      networkUrlsEl.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(btn.dataset.url);
          btn.textContent = '✓';
          setTimeout(() => btn.textContent = 'Copy', 1500);
        });
      });

      networkInfoEl.textContent = `${data.local.length} network URL(s) available`;
    }
  } catch {
    // Non-critical
  }
}

function showConnectModal() {
  connectModal.classList.remove('hidden');
}

function hideConnectModal() {
  connectModal.classList.add('hidden');
}

/* ------------------------------------------------------------------ */
/*  Event listeners                                                   */
/* ------------------------------------------------------------------ */

refreshBtn.addEventListener('click', () => {
  refreshBtn.classList.remove('spinning');
  void refreshBtn.offsetWidth;
  refreshBtn.classList.add('spinning');
  fetchGpuData();
});

autoRefreshCb.addEventListener('change', toggleAutoRefresh);

menuBtn.addEventListener('click', () => {
  headerInfo.classList.toggle('mobile-expanded');
});

closeModalBtn.addEventListener('click', hideConnectModal);

connectModal.addEventListener('click', (e) => {
  if (e.target === connectModal) hideConnectModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    refreshBtn.click();
  }
  if (e.key === 'Escape') hideConnectModal();
});

/* ------------------------------------------------------------------ */
/*  Initialization                                                    */
/* ------------------------------------------------------------------ */

function init() {
  intervalDisp.textContent = refreshInterval;
  showLoading();

  // Initialize pull-to-refresh on mobile
  if ('ontouchstart' in window) {
    initPullToRefresh();
  }

  // Load network info
  loadNetworkInfo();

  // Try SSE first, fallback to polling
  connectSSE();

  // Also do initial fetch to populate data immediately
  fetchGpuData();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
