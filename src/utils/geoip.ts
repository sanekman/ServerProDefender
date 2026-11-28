import type { CountryInfo } from '../types/defender';
import { isPrivateOrLoopbackIp, ipv4ToInt } from './network';

export const COUNTRIES: CountryInfo[] = [
  { code: 'RU', nameRu: 'Россия', region: 'СНГ', samplePrefixes: ['5.188.', '31.173.', '77.88.', '95.165.', '178.154.'], sampleIp: '95.165.142.18' },
  { code: 'BY', nameRu: 'Беларусь', region: 'СНГ', samplePrefixes: ['37.214.', '178.124.', '194.158.'], sampleIp: '178.124.198.42' },
  { code: 'KZ', nameRu: 'Казахстан', region: 'СНГ', samplePrefixes: ['2.132.', '37.99.', '92.46.', '178.89.'], sampleIp: '92.46.118.64' },
  { code: 'AM', nameRu: 'Армения', region: 'СНГ', samplePrefixes: ['37.252.', '46.70.'], sampleIp: '46.70.112.19' },
  { code: 'UZ', nameRu: 'Узбекистан', region: 'СНГ', samplePrefixes: ['84.54.', '185.139.'], sampleIp: '84.54.73.21' },
  { code: 'KG', nameRu: 'Кыргызстан', region: 'СНГ', samplePrefixes: ['46.251.', '158.181.'], sampleIp: '46.251.201.14' },
  { code: 'AZ', nameRu: 'Азербайджан', region: 'СНГ', samplePrefixes: ['31.171.', '185.43.'], sampleIp: '31.171.88.51' },
  { code: 'CN', nameRu: 'Китай', region: 'Азия', samplePrefixes: ['36.110.', '61.135.', '112.85.', '118.24.', '218.92.', '222.186.'], sampleIp: '218.92.0.184' },
  { code: 'US', nameRu: 'США', region: 'Америка', samplePrefixes: ['23.129.', '45.142.', '64.62.', '104.244.', '162.142.', '198.235.'], sampleIp: '162.142.125.91' },
  { code: 'NL', nameRu: 'Нидерланды', region: 'Европа', samplePrefixes: ['45.155.', '89.248.', '141.98.', '185.220.', '193.32.'], sampleIp: '141.98.10.214' },
  { code: 'DE', nameRu: 'Германия', region: 'Европа', samplePrefixes: ['46.4.', '78.46.', '138.201.', '195.201.'], sampleIp: '195.201.84.132' },
  { code: 'FR', nameRu: 'Франция', region: 'Европа', samplePrefixes: ['51.75.', '51.91.', '163.172.', '212.129.'], sampleIp: '51.91.144.78' },
  { code: 'GB', nameRu: 'Великобритания', region: 'Европа', samplePrefixes: ['51.140.', '81.149.', '185.199.'], sampleIp: '81.149.42.105' },
  { code: 'PL', nameRu: 'Польша', region: 'Европа', samplePrefixes: ['5.134.', '83.144.', '193.106.'], sampleIp: '193.106.191.47' },
  { code: 'RO', nameRu: 'Румыния', region: 'Европа', samplePrefixes: ['45.134.', '89.40.', '185.156.'], sampleIp: '89.40.182.63' },
  { code: 'BG', nameRu: 'Болгария', region: 'Европа', samplePrefixes: ['45.95.', '185.234.'], sampleIp: '185.234.217.34' },
  { code: 'FI', nameRu: 'Финляндия', region: 'Европа', samplePrefixes: ['65.108.', '95.216.'], sampleIp: '95.216.148.27' },
  { code: 'SE', nameRu: 'Швеция', region: 'Европа', samplePrefixes: ['46.246.', '185.65.'], sampleIp: '46.246.32.119' },
  { code: 'UA', nameRu: 'Украина', region: 'Европа', samplePrefixes: ['91.200.', '176.36.', '185.69.'], sampleIp: '91.200.12.74' },
  { code: 'TR', nameRu: 'Турция', region: 'Ближний Восток и Африка', samplePrefixes: ['78.186.', '88.247.', '176.235.'], sampleIp: '176.235.140.82' },
  { code: 'IR', nameRu: 'Иран', region: 'Ближний Восток и Африка', samplePrefixes: ['5.160.', '37.156.', '185.143.'], sampleIp: '5.160.247.66' },
  { code: 'IL', nameRu: 'Израиль', region: 'Ближний Восток и Африка', samplePrefixes: ['31.154.', '84.108.'], sampleIp: '84.108.92.11' },
  { code: 'AE', nameRu: 'ОАЭ', region: 'Ближний Восток и Африка', samplePrefixes: ['5.32.', '94.200.'], sampleIp: '94.200.145.38' },
  { code: 'ZA', nameRu: 'ЮАР', region: 'Ближний Восток и Африка', samplePrefixes: ['41.13.', '102.132.'], sampleIp: '41.13.84.202' },
  { code: 'BR', nameRu: 'Бразилия', region: 'Америка', samplePrefixes: ['138.94.', '177.54.', '189.112.', '200.147.'], sampleIp: '177.54.148.19' },
  { code: 'CA', nameRu: 'Канада', region: 'Америка', samplePrefixes: ['142.44.', '192.99.'], sampleIp: '192.99.44.162' },
  { code: 'MX', nameRu: 'Мексика', region: 'Америка', samplePrefixes: ['187.188.', '201.144.'], sampleIp: '187.188.62.94' },
  { code: 'AR', nameRu: 'Аргентина', region: 'Америка', samplePrefixes: ['181.46.', '190.210.'], sampleIp: '181.46.120.53' },
  { code: 'IN', nameRu: 'Индия', region: 'Азия', samplePrefixes: ['49.36.', '103.21.', '117.204.', '182.73.'], sampleIp: '103.21.58.144' },
  { code: 'VN', nameRu: 'Вьетнам', region: 'Азия', samplePrefixes: ['14.161.', '113.160.', '171.244.'], sampleIp: '113.160.224.85' },
  { code: 'ID', nameRu: 'Индонезия', region: 'Азия', samplePrefixes: ['36.80.', '103.10.', '114.124.'], sampleIp: '114.124.168.40' },
  { code: 'KR', nameRu: 'Южная Корея', region: 'Азия', samplePrefixes: ['112.175.', '121.134.', '211.110.'], sampleIp: '121.134.18.92' },
  { code: 'KP', nameRu: 'КНДР', region: 'Азия', samplePrefixes: ['175.45.'], sampleIp: '175.45.176.22' },
  { code: 'JP', nameRu: 'Япония', region: 'Азия', samplePrefixes: ['126.205.', '153.126.', '210.140.'], sampleIp: '153.126.182.49' },
  { code: 'SG', nameRu: 'Сингапур', region: 'Азия', samplePrefixes: ['103.253.', '128.199.', '167.71.'], sampleIp: '128.199.182.77' },
  { code: 'HK', nameRu: 'Гонконг', region: 'Азия', samplePrefixes: ['43.132.', '103.214.', '119.28.'], sampleIp: '119.28.142.31' },
  { code: 'TH', nameRu: 'Таиланд', region: 'Азия', samplePrefixes: ['49.228.', '171.96.'], sampleIp: '171.96.188.61' },
  { code: 'PK', nameRu: 'Пакистан', region: 'Азия', samplePrefixes: ['39.42.', '182.180.'], sampleIp: '39.42.190.15' },
];

export const COUNTRY_MAP: Record<string, CountryInfo> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c])
);

export const GEO_PRESETS = [
  {
    id: 'only_ru',
    label: 'Только Россия',
    description: 'Пускать только подключения из РФ, остальной мир закрыть',
    mode: 'allowlist' as const,
    countries: ['RU'],
  },
  {
    id: 'ru_cis',
    label: 'Россия и СНГ',
    description: 'Разрешить РФ, Беларусь, Казахстан, Армению, Узбекистан и Кыргызстан',
    mode: 'allowlist' as const,
    countries: ['RU', 'BY', 'KZ', 'AM', 'UZ', 'KG'],
  },
  {
    id: 'top_botnets',
    label: 'Запретить частые источники атак',
    description: 'Заблокировать страны с наибольшей долей автоматического сканирования',
    mode: 'blacklist' as const,
    countries: ['CN', 'NL', 'BR', 'VN', 'IN', 'IR', 'KP', 'ID', 'RO', 'BG'],
  },
];

export function resolveCountryByIp(
  ip: string,
  explicitCountryCode?: string
): { code: string; nameRu: string; isLocal: boolean } {
  if (isPrivateOrLoopbackIp(ip)) {
    return { code: 'LOCAL', nameRu: 'Локальная сеть', isLocal: true };
  }

  if (explicitCountryCode && COUNTRY_MAP[explicitCountryCode]) {
    const info = COUNTRY_MAP[explicitCountryCode];
    return { code: info.code, nameRu: info.nameRu, isLocal: false };
  }

  for (const country of COUNTRIES) {
    for (const prefix of country.samplePrefixes) {
      if (ip.startsWith(prefix)) {
        return { code: country.code, nameRu: country.nameRu, isLocal: false };
      }
    }
  }

  // Deterministic fallback mapping based on IP hash so any valid public IP gets a stable country
  const intVal = ipv4ToInt(ip);
  if (intVal !== null) {
    const publicPool = COUNTRIES.filter((c) => c.code !== 'KP');
    const idx = ((intVal >>> 16) + (intVal & 0xff)) % publicPool.length;
    const chosen = publicPool[idx];
    return { code: chosen.code, nameRu: chosen.nameRu, isLocal: false };
  }

  return { code: 'ZZ', nameRu: 'Не определена', isLocal: false };
}
