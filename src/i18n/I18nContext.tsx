import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getLanguageMeta,
  getLocalizedCountryName,
  loadInitialLanguage,
  saveLanguage,
  type LanguageCode,
} from './languages';
import { translate, type TranslationKey } from './translations';

export interface I18nContextValue {
  lang: LanguageCode;
  setLang: (next: LanguageCode) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  formatCountry: (code: string, fallbackName?: string) => string;
  formatRegion: (regionRu: string) => string;
  formatDuration: (minutes: number | null) => string;
  formatCountdown: (expiresAt: number | null, nowMs: number) => string;
  formatHosts: (count: number) => string;
  formatDateTime: (ts: number) => string;
  formatTime: (ts: number) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const REGION_KEY_MAP: Record<string, TranslationKey> = {
  'Все регионы': 'regionAll',
  'СНГ': 'regionCis',
  'Европа': 'regionEurope',
  'Азия': 'regionAsia',
  'Америка': 'regionAmerica',
  'Ближний Восток и Африка': 'regionMea',
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<LanguageCode>(loadInitialLanguage);

  useEffect(() => {
    const meta = getLanguageMeta(lang);
    document.documentElement.lang = meta.code;
  }, [lang]);

  const setLang = useCallback((next: LanguageCode) => {
    setLangState(next);
    saveLanguage(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang]
  );

  const formatCountry = useCallback(
    (code: string, fallbackName = code) =>
      getLocalizedCountryName(
        code,
        lang,
        fallbackName,
        translate(lang, 'localNetwork'),
        translate(lang, 'unknownCountry')
      ),
    [lang]
  );

  const formatRegion = useCallback(
    (regionRu: string) => {
      const key = REGION_KEY_MAP[regionRu];
      return key ? translate(lang, key) : regionRu;
    },
    [lang]
  );

  const formatDuration = useCallback(
    (minutes: number | null) => {
      if (minutes === null) return translate(lang, 'forever');
      if (minutes < 60) return `${minutes} ${translate(lang, 'minutesShort')}`;
      if (minutes < 1440) {
        const hours = Math.round((minutes / 60) * 10) / 10;
        return `${hours} ${translate(lang, 'hoursShort')}`;
      }
      const days = Math.round((minutes / 1440) * 10) / 10;
      return `${days} ${translate(lang, 'daysShort')}`;
    },
    [lang]
  );

  const formatCountdown = useCallback(
    (expiresAt: number | null, nowMs: number) => {
      if (expiresAt === null) return translate(lang, 'forever');
      const diffSec = Math.max(0, Math.floor((expiresAt - nowMs) / 1000));
      if (diffSec === 0) return translate(lang, 'expired');
      const days = Math.floor(diffSec / 86400);
      const hours = Math.floor((diffSec % 86400) / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      const d = translate(lang, 'daysShort');
      const h = translate(lang, 'hoursShort');
      const m = translate(lang, 'minutesShort');
      if (days > 0) return `${days}${d} ${hours}${h}`;
      if (hours > 0) return `${hours}${h} ${String(mins).padStart(2, '0')}${m}`;
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    },
    [lang]
  );

  const formatHosts = useCallback(
    (count: number) => {
      if (count === 1) return translate(lang, 'singleHost');
      const meta = getLanguageMeta(lang);
      const formatted = count.toLocaleString(meta.bcp47);
      return translate(lang, 'hostsCount', { n: formatted });
    },
    [lang]
  );

  const formatDateTime = useCallback(
    (ts: number) => {
      const meta = getLanguageMeta(lang);
      const d = new Date(ts);
      return d.toLocaleString(meta.bcp47, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    },
    [lang]
  );

  const formatTime = useCallback(
    (ts: number) => {
      const meta = getLanguageMeta(lang);
      const d = new Date(ts);
      return d.toLocaleTimeString(meta.bcp47, {
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    [lang]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t,
      formatCountry,
      formatRegion,
      formatDuration,
      formatCountdown,
      formatHosts,
      formatDateTime,
      formatTime,
    }),
    [lang, setLang, t, formatCountry, formatRegion, formatDuration, formatCountdown, formatHosts, formatDateTime, formatTime]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
