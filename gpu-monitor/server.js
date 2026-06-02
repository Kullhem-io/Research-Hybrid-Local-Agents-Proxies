import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const app = express();
const PORT = 3000;

// TTL cache for GPU data (2 second cache to coalesce rapid polls)
let cachedData = null;
let cacheTime = 0;
const CACHE_TTL = 2000;

// CUDA version is fetched once at startup — it doesn't change at runtime
let cudaVersion = 'N/A';

app.use(express.static(path.join(__dirname, 'public')));

async function initCudaVersion() {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [], {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    const match = stdout.match(/CUDA[\s\S]*Version\s*:\s*(\d+\.\d+)/);
    if (match) cudaVersion = match[1];
  } catch {
    // Non-critical — dashboard works without CUDA version
  }
}

/**
 * Run nvidia-smi with a single query command to get all GPU metrics.
 * Uses execFile to avoid shell spawning. Driver version is included
 * per-GPU row; CUDA toolkit version is obtained separately.
 */
async function getGpuData() {
  const now = Date.now();

  // Return cached data if still fresh
  if (cachedData && (now - cacheTime) < CACHE_TTL) {
    return cachedData;
  }

  try {
    // Single query for GPU metrics + driver version
    // Note: pstate (not performance.state) is the correct field name
    // Note: cuda_version is not a queryable field - CUDA toolkit version
    //       must be obtained from nvcc or the full nvidia-smi header
    const { stdout: gpuStdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=index,name,temperature.gpu,fan.speed,power.draw,power.limit,pstate,memory.used,memory.total,utilization.gpu,utilization.memory,driver_version',
      '--format=csv,noheader'
    ], {
      timeout: 10000,
      maxBuffer: 5 * 1024 * 1024,
    });

    const gpus = [];
    const lines = gpuStdout.trim().split('\n');

    for (const line of lines) {
      const parts = line.split(', ');
      // 12 fields total: index, name, temp, fan, power.draw, power.limit,
      //     pstate, mem.used, mem.total, util.gpu, util.mem, driver_version
      // After name, there are 10 fixed fields. From the right:
      //   -1  = driver_version
      //   -2  = utilization.memory
      //   -3  = utilization.gpu
      //   -4  = memory.total
      //   -5  = memory.used
      //   -6  = pstate
      //   -7  = power.limit
      //   -8  = power.draw
      //   -9  = fan.speed
      //   -10 = temperature.gpu
      if (parts.length >= 12) {
        const id = parts[0];

        // GPU name may contain commas, so extract from the right for fixed
        // fields and treat everything between index (0) and the last 10
        // fields as the name.
        const nameParts = parts.slice(1, parts.length - 10);
        const name = nameParts.join(', ').trim();

        gpus.push({
          id,
          name,
          temp: parseInt(parts[parts.length - 10]) || 0,
          fan: parts[parts.length - 9],
          powerDraw: parts[parts.length - 8],
          powerLimit: parts[parts.length - 7],
          perfState: parts[parts.length - 6],
          memoryUsed: parts[parts.length - 5],
          memoryTotal: parts[parts.length - 4],
          gpuUtil: parseInt(parts[parts.length - 3]) || 0,
          memUtil: parseInt(parts[parts.length - 2]) || 0,
        });
      }
    }

    // Extract driver version from first GPU row (same across all GPUs)
    const firstLine = lines[0]?.split(', ');
    const driverVersion = firstLine ? firstLine[firstLine.length - 1].trim() : 'N/A';

    const result = {
      gpus,
      driverVersion,
      cudaVersion,
      timestamp: new Date().toISOString()
    };

    // Update cache
    cachedData = result;
    cacheTime = now;

    return result;
  } catch (error) {
    // Differentiate error types for better client feedback
    if (error.code === 'ENOENT') {
      throw new Error('nvidia-smi not found — NVIDIA drivers may not be installed');
    } else if (error.killed && error.signal === 'SIGTERM') {
      throw new Error('nvidia-smi timed out — GPU driver may be unresponsive');
    } else if (error.status === 255) {
      throw new Error('GPU driver error — check that NVIDIA drivers are loaded');
    }
    throw error;
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    cached: !!cachedData,
    cacheAge: cachedData ? Date.now() - cacheTime : null
  });
});

// Main GPU data endpoint
app.get('/api/gpu', async (req, res) => {
  try {
    const data = await getGpuData();
    res.json(data);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] GPU fetch error:`, error.message);

    if (error.message.includes('not found')) {
      return res.status(503).json({ error: error.message });
    } else if (error.message.includes('timed out')) {
      return res.status(504).json({ error: error.message });
    } else if (error.message.includes('driver error')) {
      return res.status(503).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to fetch GPU data' });
  }
});

// Fetch CUDA version at startup (only runs once)
initCudaVersion();

// Bind to localhost only for safety
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 GPU Monitor running at http://localhost:${PORT}`);
});
