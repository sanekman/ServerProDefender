import React, { useEffect, useRef, useState } from 'react';
import { Globe, ChevronUp, Check } from 'lucide-react';
import { getLanguageMeta, SUPPORTED_LANGUAGES, type LanguageCode } from '../i18n/languages';
import { useI18n } from '../i18n/I18nContext';

interface LanguageSelectorProps {
  onSelect?: (lang: LanguageCode) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ onSelect }) => {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentMeta = getLanguageMeta(lang);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleChoose = (code: LanguageCode) => {
    setLang(code);
    setOpen(false);
    onSelect?.(code);
  };

  return (
    <div ref={containerRef} className="relative">
      {open && (
        <div
          role="listbox"
          aria-label={t('languageLabel')}
          className="absolute bottom-full left-0 right-0 mb-1.5 z-50 bg-surface-elevated border border-border-strong rounded-lg shadow-xl py-1 max-h-64 overflow-y-auto"
        >
          {SUPPORTED_LANGUAGES.map((item) => {
            const active = item.code === lang;
            return (
              <button
                key={item.code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => handleChoose(item.code)}
                className={`w-full px-2.5 py-1.5 text-left text-xs transition-colors flex items-center justify-between gap-2 ${
                  active
                    ? 'bg-accent/15 text-text-primary font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] text-text-muted w-5 shrink-0">
                    {item.shortLabel}
                  </span>
                  <span className="truncate">{item.nativeName}</span>
                </span>
                {active && <Check className="w-3.5 h-3.5 text-accent-hover shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('languageLabel')}
        className="w-full h-8 px-2.5 rounded-lg bg-canvas border border-border-subtle hover:border-border-strong text-xs text-text-primary transition-colors flex items-center justify-between gap-2 whitespace-nowrap"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Globe className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <span className="truncate font-medium">{currentMeta.nativeName}</span>
        </span>
        <span className="flex items-center gap-1 text-text-muted shrink-0">
          <span className="font-mono text-[10px]">{currentMeta.shortLabel}</span>
          <ChevronUp
            className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180 text-text-primary' : ''}`}
          />
        </span>
      </button>
    </div>
  );
};
