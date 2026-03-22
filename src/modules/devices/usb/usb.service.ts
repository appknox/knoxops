import { execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';
import { deviceByIdentifier } from 'ios-device-list';

function resolveIosModelName(productType: string): string {
  const matches = deviceByIdentifier(productType);
  return matches?.[0]?.Generation ?? productType;
}

const execFile = promisify(execFileCallback);

const DEFAULT_TIMEOUT = 10_000; // 10 seconds

// Validate device identifiers to prevent injection
function validateDeviceId(id: string): boolean {
  return /^[A-Za-z0-9\-]+$/.test(id) && id.length <= 64;
}

async function run(cmd: string, args: string[], timeoutMs = DEFAULT_TIMEOUT): Promise<string> {
  try {
    const result = await (execFile as any)(cmd, args, { timeout: timeoutMs });
    return result.stdout as string;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Command not found: ${cmd}`);
    }
    if (error.killed) {
      throw new Error(`Command timeout (>${timeoutMs}ms)`);
    }
    throw error;
  }
}

// Parse Parcel hex dump from service call iphonesubinfo (Android 10+)
// Example output:
//   Result: Parcel(
//     0x00000000: 00000000 0000000f 00350033 00320038 '........3.5.8.2.'
//     0x00000010: 00300039 00310032 00340033 00360035 '9.0.2.1.3.4.5.6.'
//     ...
// Each character is UTF-16LE, shown as X. in the readable section
// minLen/maxLen controls expected digit count: IMEI = 14-15, ICCID = 18-22
function parseParcelString(output: string, minLen = 14, maxLen = 15): string | null {
  const readable: string[] = [];
  for (const line of output.split('\n')) {
    const m = line.match(/'([^']*)'/);
    if (m) readable.push(m[1]);
  }
  // Remove null-byte dots, then find first digit sequence of expected length
  const raw = readable.join('').replace(/\./g, '');
  const match = raw.match(new RegExp(`\\d{${minLen},${maxLen}}`));
  return match ? match[0] : null;
}

export interface DetectResult {
  platform: 'ios' | 'android';
  id: string;
  name?: string;
}

export interface DeviceInfo {
  name: string | null;
  model: string | null;
  osVersion: string | null;
  serialNumber: string | null;
  udid: string | null; // iOS: UniqueDeviceID; Android: null
  modelNumber: string | null; // iOS: ModelNumber (e.g. NNCK2); Android: null
  cpuArch: string | null;
  platform: 'iOS' | 'Android';
  colour: string | null;
  imei: string | null;
  imei2: string | null;
  macAddress: string | null;
  simNumber: string | null;
}

export async function detectConnectedDevice(): Promise<DetectResult | null> {
  let iosToolMissing = false;
  let androidToolMissing = false;

  // Try iOS first
  try {
    const output = await run('idevice_id', ['-l']);
    const lines = output.trim().split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      return { platform: 'ios', id: lines[0].trim() };
    }
  } catch (e: any) {
    if (e.message?.includes('not found') || e.code === 'ENOENT') {
      iosToolMissing = true;
    }
    // else: tool exists but no device connected, continue to Android
  }

  // Try Android
  try {
    const output = await run('adb', ['devices']);
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.match(/^(\S+)\s+device$/)) {
        return { platform: 'android', id: line.split(/\s+/)[0] };
      }
      if (line.match(/^(\S+)\s+unauthorized$/)) {
        throw new Error('Android device found but USB Debugging is not authorized. Go to Settings → Developer Options → Enable USB Debugging, then tap "Allow" on your device.');
      }
      if (line.match(/^(\S+)\s+offline$/)) {
        throw new Error('Android device is offline. Disconnect and reconnect the cable.');
      }
    }
  } catch (e: any) {
    if (e.message?.includes('not found') || e.code === 'ENOENT') {
      androidToolMissing = true;
    } else {
      // Re-throw meaningful errors (unauthorized, offline, etc.)
      throw e;
    }
  }

  // If both tools are missing, throw a helpful error
  if (iosToolMissing && androidToolMissing) {
    throw new Error(
      'Required tools not found. Install: brew install libimobiledevice android-platform-tools'
    );
  }

  return null;
}

export async function verifyAuthorization(platform: 'ios' | 'android', id: string): Promise<void> {
  if (!validateDeviceId(id)) {
    throw new Error('Invalid device ID format');
  }

  if (platform === 'ios') {
    const output = await run('idevicepair', ['-u', id, 'pair']);
    if (!output.includes('SUCCESS')) {
      throw new Error('Trust not completed. Tap "Trust" on your iPhone and try again.');
    }
  } else if (platform === 'android') {
    const output = await run('adb', ['-s', id, 'get-state']);
    const state = output.trim();
    if (state === 'unauthorized') {
      throw new Error('Device not authorized. Tap "Allow" on your Android device and try again.');
    } else if (state === 'offline') {
      throw new Error('Device offline. Check cable and reconnect.');
    } else if (state !== 'device') {
      throw new Error(`Unexpected device state: ${state}`);
    }
  }
}

export async function fetchIosDeviceInfo(udid: string): Promise<DeviceInfo> {
  if (!validateDeviceId(udid)) {
    throw new Error('Invalid UDID format');
  }

  const output = await run('ideviceinfo', ['-u', udid]);
  const info: Partial<DeviceInfo> = {
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
  };

  const lines = output.split('\n');
  for (const line of lines) {
    const [key, ...rest] = line.split(':');
    if (!key || rest.length === 0) continue;
    const value = rest.join(':').trim();

    switch (key.trim()) {
      case 'DeviceName':
        info.name = value;
        break;
      case 'ProductType':
        info.model = resolveIosModelName(value);
        break;
      case 'ProductVersion':
        info.osVersion = value;
        break;
      case 'SerialNumber':
        info.serialNumber = value;
        break;
      case 'UniqueDeviceID':
        info.udid = value;
        break;
      case 'ModelNumber':
        info.modelNumber = value.replace(/[\/\\].*$/, '').trim(); // strip suffix like J/A
        break;
      case 'CPUArchitecture': {
        // ideviceinfo returns lowercase (arm64, arm64e) — normalize to match form dropdown
        const arch = value.toLowerCase();
        if (arch.includes('arm64') || arch.includes('aarch64')) info.cpuArch = 'ARM64';
        else if (arch.includes('x86_64')) info.cpuArch = 'x86_64';
        else if (arch.includes('arm')) info.cpuArch = 'ARM';
        else info.cpuArch = value;
        break;
      }
      // DeviceColor returns Apple internal codes (e.g. "1", "3") not human-readable names — skip
      case 'InternationalMobileEquipmentIdentity':
        info.imei = value;
        break;
      case 'IntegratedCircuitCardIdentity':
        info.simNumber = value;
        break;
      case 'WiFiAddress':
        info.macAddress = value;
        break;
    }
  }

  return info as DeviceInfo;
}

export async function fetchAndroidDeviceInfo(serial: string): Promise<DeviceInfo> {
  if (!validateDeviceId(serial)) {
    throw new Error('Invalid serial format');
  }

  const output = await run('adb', ['-s', serial, 'shell', 'getprop']);
  const info: Partial<DeviceInfo> = {
    platform: 'Android',
    name: null,
    model: null,
    osVersion: null,
    serialNumber: null,
    udid: null, // Android has no UDID equivalent
    modelNumber: null, // Android has no A-number equivalent
    cpuArch: null,
    colour: null,
    imei: null,
    imei2: null,
    macAddress: null,
    simNumber: null,
  };

  const props: Record<string, string> = {};
  const lines = output.split('\n');
  for (const line of lines) {
    const match = line.match(/^\[([^\]]+)\]:\s*\[([^\]]*)\]/);
    if (match) {
      props[match[1]] = match[2];
    }
  }

  // Map Android properties to DeviceInfo
  const manufacturer = props['ro.product.manufacturer'] || '';
  const model = props['ro.product.model'] || '';
  if (manufacturer && model) {
    info.name = `${manufacturer} ${model}`;
  } else if (model) {
    info.name = model;
  }

  info.model = props['ro.product.model'] || null;
  info.osVersion = props['ro.build.version.release'] || null;
  info.serialNumber = props['ro.serialno'] || null;
  info.imei = props['ro.gsm.imei'] || null;
  info.imei2 = props['ro.gsm.imei2'] || null;
  info.macAddress = props['ro.boot.wifimacaddr'] || null;

  // Map CPU ABI to standard arch names
  const abi = props['ro.product.cpu.abi'] || '';
  if (abi.includes('arm64') || abi.includes('aarch64')) {
    info.cpuArch = 'ARM64';
  } else if (abi.includes('x86_64')) {
    info.cpuArch = 'x86_64';
  } else if (abi.includes('armeabi') || abi.includes('arm')) {
    info.cpuArch = 'ARM';
  }

  // On Android 10+, ro.gsm.imei and ro.boot.wifimacaddr are often restricted.
  // Use 3-stage cascade: getprop (done above) → dumpsys → service call

  // Stage 2: Try dumpsys iphonesubinfo (works on some Android versions, fails on Android 13)
  if (!info.imei || !info.imei2 || !info.simNumber) {
    try {
      const dumpsys = await run('adb', ['-s', serial, 'shell', 'dumpsys', 'iphonesubinfo'], 5000);
      if (!info.imei) {
        const imeiMatch = dumpsys.match(/IMEI\s*[=:]\s*(\d{14,17})/i);
        if (imeiMatch) info.imei = imeiMatch[1];
      }
      if (!info.simNumber) {
        const iccidMatch = dumpsys.match(/ICC\s*ID\s*[=:]\s*([\dF]+)/i);
        if (iccidMatch) info.simNumber = iccidMatch[1];
      }
    } catch {
      // ignore — device may not support telephony
    }
  }

  // Stage 3: Use service call iphonesubinfo (Android 10+ reliable fallback)
  if (!info.imei) {
    try {
      const out1 = await run('adb', ['-s', serial, 'shell', 'service', 'call', 'iphonesubinfo', '1', 's16', 'com.android.shell'], 5000);
      info.imei = parseParcelString(out1);
    } catch {
      // ignore — device may not support telephony
    }
  }
  if (!info.imei2) {
    try {
      // Transaction 4 = getImeiForSlot(int slotIndex, String pkg, String feature) on Android 13
      const out2 = await run('adb', ['-s', serial, 'shell', 'service', 'call', 'iphonesubinfo', '4', 'i32', '1', 's16', 'com.android.shell', 's16', 'null'], 5000);
      info.imei2 = parseParcelString(out2);
    } catch {
      // ignore — device may not support telephony or dual-SIM
    }
  }
  if (!info.simNumber) {
    // Stage A: content://telephony/siminfo — most reliable on Android 10+ (no root needed)
    try {
      const simInfo = await run('adb', ['-s', serial, 'shell', 'content', 'query', '--uri', 'content://telephony/siminfo', '--projection', 'icc_id'], 5000);
      const iccidMatch = simInfo.match(/icc_id=(\d{15,22})/);
      if (iccidMatch) info.simNumber = iccidMatch[1];
    } catch {
      // ignore — content provider may be unavailable
    }
  }
  if (!info.simNumber) {
    // Stage B: service call iphonesubinfo tx11 (ICCID is 18-22 digits)
    try {
      const out3 = await run('adb', ['-s', serial, 'shell', 'service', 'call', 'iphonesubinfo', '11', 's16', 'com.android.shell', 's16', 'null'], 5000);
      info.simNumber = parseParcelString(out3, 18, 22);
    } catch {
      // ignore — device may not support telephony
    }
  }

  // MAC Stage 1: dumpsys wifi → factory/hardware MAC (correct, not randomized)
  // Android 10+ randomises MAC per-network, so we need the hardware MAC
  if (!info.macAddress) {
    try {
      const wifiDump = await run('adb', ['-s', serial, 'shell', 'dumpsys', 'wifi'], 5000);
      const macMatch = wifiDump.match(/wifi_sta_factory_mac_address=([0-9a-f]{2}(?::[0-9a-f]{2}){5})/i);
      if (macMatch) info.macAddress = macMatch[1];
    } catch {
      // ignore — dumpsys wifi may not expose factory MAC
    }
  }

  // MAC Stage 2: ip link show wlan0 (last resort — may be randomized, but better than nothing)
  if (!info.macAddress) {
    try {
      const ipOut = await run('adb', ['-s', serial, 'shell', 'ip', 'link', 'show', 'wlan0'], 5000);
      const macMatch = ipOut.match(/link\/ether\s+([0-9a-f]{2}(?::[0-9a-f]{2}){5})/i);
      if (macMatch) info.macAddress = macMatch[1];
    } catch {
      // ignore — wlan0 may not be available
    }
  }

  return info as DeviceInfo;
}
