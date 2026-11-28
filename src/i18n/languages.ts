export type LanguageCode =
  | 'ru'
  | 'en'
  | 'de'
  | 'fr'
  | 'es'
  | 'pt'
  | 'it'
  | 'pl'
  | 'nl'
  | 'cs'
  | 'sv'
  | 'no'
  | 'da'
  | 'fi'
  | 'ro'
  | 'hu'
  | 'el'
  | 'tr'
  | 'kk'
  | 'ar'
  | 'hi'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'vi'
  | 'th'
  | 'id';

export interface LanguageMeta {
  code: LanguageCode;
  nativeName: string;
  englishName: string;
  shortLabel: string;
  bcp47: string;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian', shortLabel: 'RU', bcp47: 'ru-RU' },
  { code: 'en', nativeName: 'English', englishName: 'English', shortLabel: 'EN', bcp47: 'en-US' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', shortLabel: 'DE', bcp47: 'de-DE' },
  { code: 'fr', nativeName: 'Français', englishName: 'French', shortLabel: 'FR', bcp47: 'fr-FR' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', shortLabel: 'ES', bcp47: 'es-ES' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese', shortLabel: 'PT', bcp47: 'pt-BR' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian', shortLabel: 'IT', bcp47: 'it-IT' },
  { code: 'pl', nativeName: 'Polski', englishName: 'Polish', shortLabel: 'PL', bcp47: 'pl-PL' },
  { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch', shortLabel: 'NL', bcp47: 'nl-NL' },
  { code: 'cs', nativeName: 'Čeština', englishName: 'Czech', shortLabel: 'CS', bcp47: 'cs-CZ' },
  { code: 'sv', nativeName: 'Svenska', englishName: 'Swedish', shortLabel: 'SV', bcp47: 'sv-SE' },
  { code: 'no', nativeName: 'Norsk', englishName: 'Norwegian', shortLabel: 'NO', bcp47: 'nb-NO' },
  { code: 'da', nativeName: 'Dansk', englishName: 'Danish', shortLabel: 'DA', bcp47: 'da-DK' },
  { code: 'fi', nativeName: 'Suomi', englishName: 'Finnish', shortLabel: 'FI', bcp47: 'fi-FI' },
  { code: 'ro', nativeName: 'Română', englishName: 'Romanian', shortLabel: 'RO', bcp47: 'ro-RO' },
  { code: 'hu', nativeName: 'Magyar', englishName: 'Hungarian', shortLabel: 'HU', bcp47: 'hu-HU' },
  { code: 'el', nativeName: 'Ελληνικά', englishName: 'Greek', shortLabel: 'EL', bcp47: 'el-GR' },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish', shortLabel: 'TR', bcp47: 'tr-TR' },
  { code: 'kk', nativeName: 'Қазақша', englishName: 'Kazakh', shortLabel: 'KK', bcp47: 'kk-KZ' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', shortLabel: 'AR', bcp47: 'ar-SA' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', shortLabel: 'HI', bcp47: 'hi-IN' },
  { code: 'zh', nativeName: '中文', englishName: 'Chinese', shortLabel: 'ZH', bcp47: 'zh-CN' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese', shortLabel: 'JA', bcp47: 'ja-JP' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean', shortLabel: 'KO', bcp47: 'ko-KR' },
  { code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese', shortLabel: 'VI', bcp47: 'vi-VN' },
  { code: 'th', nativeName: 'ไทย', englishName: 'Thai', shortLabel: 'TH', bcp47: 'th-TH' },
  { code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian', shortLabel: 'ID', bcp47: 'id-ID' },
];

export const LANGUAGE_STORAGE_KEY = 'serverpro_defender_lang_v1';

const SUPPORTED_SET = new Set<string>(SUPPORTED_LANGUAGES.map((l) => l.code));

export function isSupportedLanguage(code: string | null | undefined): code is LanguageCode {
  return Boolean(code && SUPPORTED_SET.has(code));
}

export function detectSystemLanguage(): LanguageCode {
  if (typeof navigator === 'undefined') return 'en';
  const candidates: string[] = [];
  if (Array.isArray(navigator.languages)) {
    candidates.push(...navigator.languages);
  }
  if (navigator.language) {
    candidates.push(navigator.language);
  }
  for (const raw of candidates) {
    const primary = raw.toLowerCase().split(/[-_]/)[0];
    if (primary === 'uk') return 'ru';
    if (primary === 'nb' || primary === 'nn') return 'no';
    if (isSupportedLanguage(primary)) {
      return primary;
    }
  }
  return 'en';
}

export function loadInitialLanguage(): LanguageCode {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(saved)) {
      return saved;
    }
  } catch {
    // Ignore storage access errors
  }
  return detectSystemLanguage();
}

export function saveLanguage(lang: LanguageCode): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Ignore storage access errors
  }
}

export function getLanguageMeta(lang: LanguageCode): LanguageMeta {
  return SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[1];
}

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

export function getLocalizedCountryName(
  countryCode: string,
  lang: LanguageCode,
  fallbackName: string,
  localLabel = 'Local network',
  unknownLabel = 'Unknown'
): string {
  if (countryCode === 'LOCAL') return localLabel;
  if (countryCode === 'UNK') return unknownLabel;
  if (!/^[A-Z]{2}$/.test(countryCode)) return fallbackName;

  try {
    if (!displayNamesCache.has(lang)) {
      const meta = getLanguageMeta(lang);
      const dn =
        typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
          ? new Intl.DisplayNames([meta.bcp47, lang], { type: 'region' })
          : null;
      displayNamesCache.set(lang, dn);
    }
    const dn = displayNamesCache.get(lang);
    const resolved = dn?.of(countryCode);
    return resolved || fallbackName;
  } catch {
    return fallbackName;
  }
}
