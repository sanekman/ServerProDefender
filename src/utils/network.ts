export interface ParsedCidr {
  normalized: string;
  ip: string;
  ipInt: number;
  prefix: number;
  maskInt: number;
  networkInt: number;
  broadcastInt: number;
  hostCount: number;
  isRange: boolean;
}

export function ipv4ToInt(ip: string): number | null {
  const trimmed = ip.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (let i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(parts[i])) return null;
    const octet = Number(parts[i]);
    if (octet < 0 || octet > 255) return null;
    result = (result << 8) | octet;
  }
  return result >>> 0;
}

export function intToIpv4(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join('.');
}

export function parseIpOrCidr(input: string): ParsedCidr | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasSlash = trimmed.includes('/');
  const [ipPart, prefixPart] = trimmed.split('/');
  if (hasSlash && trimmed.split('/').length > 2) return null;

  const ipInt = ipv4ToInt(ipPart);
  if (ipInt === null) return null;

  let prefix = 32;
  if (hasSlash) {
    if (!/^\d{1,2}$/.test(prefixPart)) return null;
    prefix = Number(prefixPart);
    if (prefix < 0 || prefix > 32) return null;
  }

  const maskInt = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const networkInt = (ipInt & maskInt) >>> 0;
  const broadcastInt = (networkInt | (~maskInt >>> 0)) >>> 0;
  const hostCount = prefix === 0 ? 4294967296 : Math.pow(2, 32 - prefix);

  return {
    normalized: prefix === 32 ? intToIpv4(ipInt) : `${intToIpv4(networkInt)}/${prefix}`,
    ip: intToIpv4(ipInt),
    ipInt,
    prefix,
    maskInt,
    networkInt,
    broadcastInt,
    hostCount,
    isRange: prefix < 32,
  };
}

export function ipMatchesCidr(ip: string, cidrEntry: string): boolean {
  const ipInt = ipv4ToInt(ip);
  const parsed = parseIpOrCidr(cidrEntry);
  if (ipInt === null || !parsed) return false;
  return ((ipInt & parsed.maskInt) >>> 0) === parsed.networkInt;
}

export function cidrsOverlap(entryA: string, entryB: string): boolean {
  const a = parseIpOrCidr(entryA);
  const b = parseIpOrCidr(entryB);
  if (!a || !b) return false;
  return a.networkInt <= b.broadcastInt && b.networkInt <= a.broadcastInt;
}

export function isPrivateOrLoopbackIp(ip: string): boolean {
  return (
    ipMatchesCidr(ip, '127.0.0.0/8') ||
    ipMatchesCidr(ip, '10.0.0.0/8') ||
    ipMatchesCidr(ip, '172.16.0.0/12') ||
    ipMatchesCidr(ip, '192.168.0.0/16') ||
    ipMatchesCidr(ip, '169.254.0.0/16')
  );
}

export function formatHostCountRu(count: number): string {
  if (count === 1) return '1 адрес';
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)} млн адресов`;
  }
  return `${count.toLocaleString('ru-RU')} адресов`;
}

export function formatDurationRu(minutes: number | null): string {
  if (minutes === null) return 'Навсегда';
  if (minutes < 60) return `${minutes} мин`;
  if (minutes < 1440) {
    const h = Math.round((minutes / 60) * 10) / 10;
    if (h === 1) return '1 час';
    if (h >= 2 && h <= 4) return `${h} часа`;
    return `${h} часов`;
  }
  const days = Math.round((minutes / 1440) * 10) / 10;
  if (days === 1) return '24 часа';
  return `${days} дн.`;
}

export function formatCountdown(expiresAt: number | null, now: number): string {
  if (expiresAt === null) return 'Бессрочно';
  const remainingSec = Math.max(0, Math.floor((expiresAt - now) / 1000));
  if (remainingSec <= 0) return 'Истекает...';
  const days = Math.floor(remainingSec / 86400);
  const hours = Math.floor((remainingSec % 86400) / 3600);
  const mins = Math.floor((remainingSec % 3600) / 60);
  const secs = remainingSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}д ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

export function formatTimeShort(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDateTimeShort(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Pure JS SHA-256 fallback for environments without crypto.subtle
function sha256Fallback(ascii: string): string {
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, number> = {};

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }
    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

export async function hashPasswordSha256(plain: string): Promise<string> {
  const bytes = new TextEncoder().encode(plain);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback below
    }
  }
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return sha256Fallback(bin);
}

export function hashPasswordSync(plain: string): string {
  const bytes = new TextEncoder().encode(plain);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return sha256Fallback(bin);
}

export interface ExternalIpResult {
  ip: string;
  source: string;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onParentAbort = () => controller.abort();

  if (parentSignal) {
    if (parentSignal.aborted) {
      clearTimeout(timer);
      throw new DOMException('Aborted', 'AbortError');
    }
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  try {
    return await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    if (parentSignal) {
      parentSignal.removeEventListener('abort', onParentAbort);
    }
  }
}

export async function detectExternalIp(
  signal?: AbortSignal
): Promise<ExternalIpResult | null> {
  const providers: Array<{
    name: string;
    url: string;
    parse: (res: Response) => Promise<string | null>;
  }> = [
    {
      name: 'api.ipify.org',
      url: 'https://api.ipify.org?format=json',
      parse: async (res) => {
        const data = (await res.json()) as { ip?: string };
        return typeof data?.ip === 'string' ? data.ip.trim() : null;
      },
    },
    {
      name: 'api4.my-ip.io',
      url: 'https://api4.my-ip.io/v2/ip.json',
      parse: async (res) => {
        const data = (await res.json()) as { ip?: string };
        return typeof data?.ip === 'string' ? data.ip.trim() : null;
      },
    },
    {
      name: 'ipv4.icanhazip.com',
      url: 'https://ipv4.icanhazip.com/',
      parse: async (res) => (await res.text()).trim(),
    },
    {
      name: 'cloudflare.com',
      url: 'https://www.cloudflare.com/cdn-cgi/trace',
      parse: async (res) => {
        const text = await res.text();
        const match = text.match(/^ip=(.+)$/m);
        return match ? match[1].trim() : null;
      },
    },
  ];

  for (const provider of providers) {
    if (signal?.aborted) return null;
    try {
      const res = await fetchWithTimeout(provider.url, 4000, signal);
      if (!res.ok) continue;
      const candidate = await provider.parse(res);
      if (candidate && ipv4ToInt(candidate) !== null) {
        return { ip: candidate, source: provider.name };
      }
    } catch {
      if (signal?.aborted) return null;
      // Try next provider
    }
  }

  return null;
}

