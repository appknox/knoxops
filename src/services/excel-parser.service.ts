import * as XLSX from 'xlsx';

export interface ParsedExcelData {
  // Client fields
  clientName?: string;
  contactEmail?: string;
  contactPhone?: string;
  domainName?: string;
  currentVersion?: string;

  // Infrastructure fields
  staticIP?: string;
  gateway?: string;
  netmask?: string;
  dnsServers?: string[];
  ntpServer?: string;
  smtpServer?: string;
  fingerprint?: string;
  cpuCores?: number;
  ramGB?: number;
  storageGB?: number;

  // License fields
  licenseUserFullName?: string;
  licenseEmail?: string;
  licenseUsername?: string;
  licenseStartDate?: string;
  licenseEndDate?: string;
  licensePricingPlan?: 'per app' | 'per scan';
  licenseNumberOfApps?: number;
}

// Column name mapping with fuzzy matching
const FIELD_MAPPINGS: Record<string, string[]> = {
  clientName: ['client name', 'company name', 'organization', 'client', 'company'],
  contactEmail: ['email', 'contact email', 'client email', 'main email'],
  contactPhone: ['phone', 'contact phone', 'telephone', 'contact number', 'phone number'],
  domainName: ['domain', 'domain name', 'url', 'website'],
  currentVersion: ['version', 'current version', 'app version'],

  staticIP: ['static ip', 'ip address', 'ip', 'server ip'],
  gateway: ['gateway', 'default gateway', 'network gateway'],
  netmask: ['netmask', 'subnet mask', 'subnet'],
  dnsServers: ['dns', 'dns servers', 'dns server', 'name servers'],
  ntpServer: ['ntp', 'ntp server', 'time server'],
  smtpServer: ['smtp', 'smtp server', 'mail server'],
  fingerprint: ['fingerprint', 'device fingerprint', 'unique id', 'device id'],
  cpuCores: ['cpu', 'cpu cores', 'cores', 'processor cores'],
  ramGB: ['ram', 'memory', 'ram gb', 'memory gb'],
  storageGB: ['storage', 'disk', 'storage gb', 'disk space'],

  licenseUserFullName: [
    'license user',
    'license name',
    'licensee name',
    'license user full name',
    'license user name',
  ],
  licenseEmail: ['license email', 'licensee email'],
  licenseUsername: ['license username', 'username', 'account username', 'user name'],
  licenseStartDate: ['license start', 'start date', 'license start date', 'valid from'],
  licenseEndDate: ['license end', 'end date', 'license end date', 'valid until', 'expiry date'],
  licensePricingPlan: ['pricing plan', 'plan', 'license plan', 'subscription plan'],
  licenseNumberOfApps: ['number of apps', 'apps', 'scans', 'app count', 'number of scans'],
};

function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
}

function findMatchingField(columnName: string): string | null {
  const normalized = normalizeString(columnName);

  for (const [fieldName, patterns] of Object.entries(FIELD_MAPPINGS)) {
    if (patterns.some((pattern) => normalized.includes(normalizeString(pattern)))) {
      return fieldName;
    }
  }

  return null;
}

function parseValue(value: any, fieldName: string): any {
  if (value === null || value === undefined || value === '') return undefined;

  // Handle dates
  if (fieldName.includes('Date')) {
    if (typeof value === 'number') {
      // Excel date serial number
      const date = XLSX.SSF.parse_date_code(value);
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
    // Handle date strings
    if (typeof value === 'string') {
      try {
        const parsedDate = new Date(value);
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate.toISOString().split('T')[0];
        }
      } catch {
        return value;
      }
    }
    return value;
  }

  // Handle numbers
  if (
    fieldName === 'cpuCores' ||
    fieldName === 'ramGB' ||
    fieldName === 'storageGB' ||
    fieldName === 'licenseNumberOfApps'
  ) {
    const parsed = parseInt(String(value));
    return isNaN(parsed) ? undefined : parsed;
  }

  // Handle arrays (DNS servers)
  if (fieldName === 'dnsServers') {
    return String(value)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Handle pricing plan
  if (fieldName === 'licensePricingPlan') {
    const normalized = normalizeString(String(value));
    if (normalized.includes('app')) return 'per app';
    if (normalized.includes('scan')) return 'per scan';
    return 'per app'; // default
  }

  return String(value);
}

export async function parseExcelFile(buffer: Buffer): Promise<ParsedExcelData> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Use first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error('Excel file contains no sheets');
    }

    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    if (jsonData.length < 2) {
      throw new Error('Excel file must have at least a header row and one data row');
    }

    // First row is header
    const headers = jsonData[0];
    const dataRow = jsonData[1]; // Use first data row

    const result: ParsedExcelData = {};

    // Map columns to fields
    headers.forEach((header: any, index: number) => {
      if (!header) return; // Skip empty headers

      const fieldName = findMatchingField(String(header));
      if (fieldName && dataRow[index] !== undefined) {
        const value = parseValue(dataRow[index], fieldName);
        if (value !== undefined) {
          (result as any)[fieldName] = value;
        }
      }
    });

    return result;
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
