import React, { useEffect, useState } from 'react';
import { X, Clock, Globe, ShieldCheck } from 'lucide-react';
import { COUNTRIES } from '../utils/geoip';
import { parseIpOrCidr } from '../utils/network';
import { useI18n } from '../i18n/I18nContext';

interface TempAllowModalProps {
  initialType?: 'ip' | 'country';
  initialValue?: string;
  onClose: () => void;
  onAddTempAllow: (params: {
    targetType: 'ip' | 'country';
    value: string;
    durationMinutes: number;
    reason?: string;
  }) => void;
}

const DURATION_PRESET_MINUTES = [15, 60, 240, 1440] as const;

export const TempAllowModal: React.FC<TempAllowModalProps> = ({
  initialType = 'ip',
  initialValue = '',
  onClose,
  onAddTempAllow,
}) => {
  const { t, formatCountry, formatRegion, formatDuration } = useI18n();
  const [targetType, setTargetType] = useState<'ip' | 'country'>(initialType);
  const [ipValue, setIpValue] = useState(initialType === 'ip' ? initialValue : '');
  const [countryCode, setCountryCode] = useState(
    initialType === 'country' && initialValue ? initialValue : 'CN'
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [customMinutes, setCustomMinutes] = useState<string>('60');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSelectPreset = (minutes: number) => {
    setDurationMinutes(minutes);
    setCustomMinutes(String(minutes));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = Math.max(1, Math.min(43200, Number(customMinutes) || durationMinutes));

    if (targetType === 'ip') {
      const parsed = parseIpOrCidr(ipValue);
      if (!parsed || parsed.isRange) {
        setError(t('tempInvalidIp'));
        return;
      }
      onAddTempAllow({
        targetType: 'ip',
        value: parsed.ip,
        durationMinutes: mins,
        reason: reason.trim() || undefined,
      });
      onClose();
      return;
    }

    onAddTempAllow({
      targetType: 'country',
      value: countryCode,
      durationMinutes: mins,
      reason: reason.trim() || undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t('tempModalTitle')}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface border border-border-subtle rounded-xl overflow-hidden my-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent-hover" />
            <h2 className="text-sm font-semibold text-text-primary">{t('tempModalTitle')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-canvas border border-border-subtle rounded-lg">
            <button
              type="button"
              onClick={() => {
                setTargetType('ip');
                setError('');
              }}
              className={`h-8 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                targetType === 'ip'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {t('typeIp')}
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetType('country');
                setError('');
              }}
              className={`h-8 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                targetType === 'country'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              {t('typeCountry')}
            </button>
          </div>

          {targetType === 'ip' ? (
            <div>
              <label className="block text-[11px] text-text-secondary mb-1">IPv4</label>
              <input
                type="text"
                value={ipValue}
                onChange={(e) => {
                  setIpValue(e.target.value);
                  setError('');
                }}
                placeholder="195.201.84.55"
                autoFocus
                className="w-full h-9 px-3 rounded-lg bg-canvas border border-border-subtle font-mono text-xs text-text-primary placeholder:text-text-muted"
              />
            </div>
          ) : (
            <div>
              <label className="block text-[11px] text-text-secondary mb-1">{t('colCountry')}</label>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-canvas border border-border-subtle text-xs text-text-primary"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {formatCountry(c.code, c.nameRu)} ({c.code}) — {formatRegion(c.region)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-[11px] text-text-secondary">{t('tempDurationLabel')}</label>
            <div className="grid grid-cols-4 gap-1.5">
              {DURATION_PRESET_MINUTES.map((mins) => {
                const active = Number(customMinutes) === mins;
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => handleSelectPreset(mins)}
                    className={`h-8 rounded-lg border text-xs font-medium transition-colors ${
                      active
                        ? 'bg-accent/15 border-accent-hover text-text-primary'
                        : 'bg-canvas border-border-subtle text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {formatDuration(mins)}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={43200}
                value={customMinutes}
                onChange={(e) => {
                  setCustomMinutes(e.target.value);
                  const num = Number(e.target.value);
                  if (num > 0) setDurationMinutes(num);
                }}
                aria-label={t('tempDurationLabel')}
                className="w-28 h-8 px-2.5 rounded-lg bg-canvas border border-border-subtle font-mono text-xs text-text-primary tabular-nums"
              />
              <span className="text-xs text-text-secondary">{t('minutesFull')}</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-text-secondary mb-1">{t('colComment')}</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('tempReasonPlaceholder')}
              className="w-full h-9 px-3 rounded-lg bg-canvas border border-border-subtle text-xs text-text-primary placeholder:text-text-muted"
            />
          </div>

          {error && <p className="text-xs text-danger-text">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-lg border border-border-subtle text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="h-8 px-4 rounded-lg bg-accent hover:bg-accent-hover text-xs font-medium text-white transition-colors"
            >
              {t('unblockBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
