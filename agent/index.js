import express from 'express';
import cors from 'cors';
import { execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCallback);
const PORT = process.env.PORT || 7000;
const DEFAULT_TIMEOUT = 10_000;

const app = express();
app.use(express.json());
app.use(cors({
  origin: true, // allow all origins — agent is localhost-only
  methods: ['GET', 'POST'],
}));

// ── Helpers ────────────────────────────────────────────────────────────────

async function run(cmd, args, timeoutMs = DEFAULT_TIMEOUT) {
  const result = await execFile(cmd, args, { timeout: timeoutMs });
  return result.stdout;
}

function validateDeviceId(id) {
  return /^[A-Za-z0-9\-]+$/.test(id) && id.length <= 64;
}

function parseParcelString(output, minLen = 14, maxLen = 15) {
  const readable = [];
  for (const line of output.split('\n')) {
    const m = line.match(/'([^']*)'/);
    if (m) readable.push(m[1]);
  }
  const raw = readable.join('').replace(/\./g, '');
  const match = raw.match(new RegExp(`\\d{${minLen},${maxLen}}`));
  return match ? match[0] : null;
}

// ── Routes ─────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// POST /detect — find connected iOS device
app.post('/detect', async (_req, res) => {
  try {
    const output = await run('idevice_id', ['-l']);
    const lines = output.trim().split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      return res.json({ device: null });
    }
    return res.json({ device: { platform: 'ios', id: lines[0].trim() } });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(503).json({
        message: 'idevice_id not found. Install libimobiledevice:\n  brew install libimobiledevice',
      });
    }
    return res.status(400).json({ message: err.message });
  }
});

// POST /pair — trust the connected iOS device
app.post('/pair', async (req, res) => {
  const { id } = req.body;
  if (!id || !validateDeviceId(id)) {
    return res.status(400).json({ message: 'Invalid device ID' });
  }
  try {
    const output = await run('idevicepair', ['-u', id, 'pair']);
    if (!output.includes('SUCCESS')) {
      return res.status(400).json({
        message: 'Trust not completed. Tap "Trust" on your iPhone and try again.',
      });
    }
    return res.json({ success: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(503).json({
        message: 'idevicepair not found. Install libimobiledevice:\n  brew install libimobiledevice',
      });
    }
    return res.status(400).json({ message: err.message });
  }
});

// POST /fetch — get device info for a paired iOS device
app.post('/fetch', async (req, res) => {
  const { id } = req.body;
  if (!id || !validateDeviceId(id)) {
    return res.status(400).json({ message: 'Invalid device ID' });
  }
  try {
    const output = await run('ideviceinfo', ['-u', id]);
    const info = parseIdeviceInfo(output);
    return res.json(info);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(503).json({
        message: 'ideviceinfo not found. Install libimobiledevice:\n  brew install libimobiledevice',
      });
    }
    return res.status(400).json({ message: err.message });
  }
});

// ── iOS info parser ────────────────────────────────────────────────────────

function parseIdeviceInfo(output) {
  const info = {
    platform: 'iOS',
    name: null,
    model: null,
    osVersion: null,
    serialNumber: null,
    udid: null,
    modelNumber: null,
    cpuArch: null,
    colour: null,
    imei: null,
    imei2: null,
    macAddress: null,
    simNumber: null,
    rom: null,
  };

  for (const line of output.split('\n')) {
    const [key, ...rest] = line.split(':');
    if (!key || rest.length === 0) continue;
    const value = rest.join(':').trim();

    switch (key.trim()) {
      case 'DeviceName':        info.name = value; break;
      case 'ProductType':       info.model = value; break;
      case 'ProductVersion':    info.osVersion = value; break;
      case 'SerialNumber':      info.serialNumber = value; break;
      case 'UniqueDeviceID':    info.udid = value; break;
      case 'ModelNumber':       info.modelNumber = value.replace(/[\/\\].*$/, '').trim(); break;
      case 'CPUArchitecture': {
        const arch = value.toLowerCase();
        if (arch.includes('arm64') || arch.includes('aarch64')) info.cpuArch = 'ARM64';
        else if (arch.includes('x86_64')) info.cpuArch = 'x86_64';
        else if (arch.includes('arm')) info.cpuArch = 'ARM';
        else info.cpuArch = value;
        break;
      }
      case 'InternationalMobileEquipmentIdentity':  info.imei = value; break;
      case 'IntegratedCircuitCardIdentity':         info.simNumber = value; break;
      case 'WiFiAddress':                           info.macAddress = value; break;
      case 'BuildVersion':                          info.rom = value; break;
    }
  }

  return info;
}

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, 'localhost', () => {
  console.log(`KnoxOps Agent running on http://localhost:${PORT}`);
  console.log('Waiting for iOS device connections...');
  console.log('\nPrerequisites:');
  console.log('  brew install libimobiledevice');
});
