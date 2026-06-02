/**
 * GPU Monitor — Frontend Controller
 *
 * Fetches GPU data from the backend, renders cards into #gpuGrid,
 * and auto-refreshes at a configurable interval. Uses incremental
 * DOM updates to avoid full redraws on each refresh.
 */

/* ------------------------------------------------------------------ */
/*  Configuration                                                     */
/* ------------------------------------------------------------------ */

const API_ENDPOINT = '/api/gpu';
const DEFAULT_INTERVAL = 5;          // seconds
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 60;

/* ------------------------------------------------------------------ */
/*  State                                                             */
/* ------------------------------------------------------------------ */

let refreshTimer = null;
let refreshInterval = DEFAULT_INTERVAL;
let autoRefreshEnabled = true;
let isFirstRender = true;

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
    if (mi >= 1024) {
      return `${(mi / 1024).toFixed(1)} GB`;
    }
    return `${Math.round(mi)} MB`;
  }
  const matchGB = String(raw).match(/([\d.]+)\s*GiB/i);
  if (matchGB) {
    return `${parseFloat(matchGB[1]).toFixed(1)} GB`;
  }
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
/*  GPU Card — create or find by GPU id                               */
/* ------------------------------------------------------------------ */

/**
 * Find an existing card for a given GPU id, or create a new one.
 * Cards are keyed by data-gpu-id so they persist across refreshes.
 */
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
          <span class="label">GPU Utilization</span>
          <span class="value"></span>
        </div>
        <div class="progress-track">
          <div class="progress-fill"></div>
        </div>
      </div>

      <div class="metric-row">
        <div class="metric-label">
          <span class="label">Memory Usage</span>
          <span class="value"></span>
        </div>
        <div class="progress-track">
          <div class="progress-fill"></div>
        </div>
      </div>

      <div class="metric-row">
        <div class="metric-label">
          <span class="label">Temperature</span>
          <span class="value"></span>
        </div>
        <div class="progress-track">
          <div class="progress-fill"></div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <span class="label">Fan Speed</span>
          <span class="value"></span>
        </div>
        <div class="detail-item">
          <span class="label">Power Draw</span>
          <span class="value"></span>
        </div>
        <div class="detail-item">
          <span class="label">Power Limit</span>
          <span class="value"></span>
        </div>
        <div class="detail-item">
          <span class="label">Perf State</span>
          <span class="value"></span>
        </div>
      </div>
    `;

    gpuGrid.appendChild(card);
  }

  return card;
}

/**
 * Update a card's content in place. Only touches the values that
 * changed, keeping DOM layout stable.
 */
function updateCard(card, gpu) {
  const { querySelector: q, querySelectorAll: qa } = card;

  // Header
  q('.gpu-name').textContent = gpu.name;
  q('.gpu-id').textContent = `GPU ${gpu.id}`;

  // Metric rows: GPU Util, Memory, Temp
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

/**
 * Set a progress fill width with smooth transition. Preserves the
 * existing width on first call so the transition animates from the
 * current value rather than jumping to 0.
 */
function updateProgressFill(fill, width, colorClassStr) {
  // Update color class
  const classes = ['green', 'yellow', 'red', 'temp-green', 'temp-yellow', 'temp-red'];
  fill.className = 'progress-fill ' + colorClassStr;

  // On first render, start from 0 for the entrance animation.
  // On subsequent updates, the current width is already set so
  // the CSS transition animates from old to new.
  if (isFirstRender) {
    fill.style.width = '0%';
    // Double rAF to let the browser paint width:0 before setting target
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

  // Update header info
  driverVersionEl.textContent = `Driver: ${driverVersion || 'N/A'}`;
  cudaVersionEl.textContent   = `CUDA: ${cudaVersion || 'N/A'}`;
  lastUpdateEl.innerHTML      = `<span class="live-dot"></span>${formatTimestamp(timestamp)}`;

  if (!gpus || gpus.length === 0) {
    gpuGrid.innerHTML = '<div class="empty-state">No GPUs detected</div>';
    isFirstRender = false;
    return;
  }

  if (isFirstRender) {
    // Initial load: build all cards from scratch
    gpus.forEach(gpu => {
      const card = getOrCreateCard(gpu);
      updateCard(card, gpu);
    });
    isFirstRender = false;
  } else {
    // Subsequent updates: update existing cards, add new ones, remove gone ones
    const presentIds = new Set(gpus.map(g => g.id));

    // Update or add
    gpus.forEach(gpu => {
      const card = getOrCreateCard(gpu);
      updateCard(card, gpu);
    });

    // Remove cards for GPUs that no longer exist
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
/*  Data fetching                                                     */
/* ------------------------------------------------------------------ */

async function fetchGpuData() {
  try {
    const res = await fetch(API_ENDPOINT);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    renderGpuCards(data);
  } catch (err) {
    console.error('[gpu-monitor] Fetch error:', err);
    showError(err.message);
  }
}

/* ------------------------------------------------------------------ */
/*  Auto-refresh management                                           */
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
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

function updateInterval(newInterval) {
  newInterval = Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, parseInt(newInterval, 10)));
  if (isNaN(newInterval)) newInterval = DEFAULT_INTERVAL;
  refreshInterval = newInterval;
  intervalDisp.textContent = refreshInterval;
  if (autoRefreshEnabled) {
    startAutoRefresh();
  }
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    refreshBtn.click();
  }
});

/* ------------------------------------------------------------------ */
/*  Initialization                                                    */
/* ------------------------------------------------------------------ */

function init() {
  intervalDisp.textContent = refreshInterval;
  showLoading();
  fetchGpuData();
  if (autoRefreshEnabled) {
    startAutoRefresh();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
