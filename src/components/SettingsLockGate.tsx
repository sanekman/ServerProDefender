import React, { useState } from 'react';
import { Lock, ShieldCheck, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { DEFAULT_ADMIN_PASSWORD } from '../utils/ipsEngine';
import { useI18n } from '../i18n/I18nContext';

interface SettingsLockGateProps {
  isDefaultPassword: boolean;
  onUnlock: (password: string) => Promise<boolean>;
  onCancel?: () => void;
  title?: string;
  description?: string;
  isModal?: boolean;
}

export const SettingsLockGate: React.FC<SettingsLockGateProps> = ({
  isDefaultPassword,
  onUnlock,
  onCancel,
  title,
  description,
  isModal = false,
}) => {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resolvedTitle = title ?? t('lockGateTitle');
  const resolvedDesc = description ?? t('lockGateDesc');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError(t('lockGateEmptyErr'));
      return;
    }
    setSubmitting(true);
    setError('');
    const ok = await onUnlock(password);
    setSubmitting(false);
    if (!ok) {
      setError(t('lockGateWrongErr'));
      setPassword('');
    }
  };

  const card = (
    <div className="w-full max-w-md bg-surface border border-border-subtle rounded-xl p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-lg bg-surface-elevated border border-border-subtle flex items-center justify-center text-accent-hover shrink-0">
          <Lock className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-text-primary leading-snug">{resolvedTitle}</h2>
          <p className="text-xs text-text-secondary mt-0.5">{t('lockGateSubtitle')}</p>
        </div>
      </div>

      <p className="text-sm text-text-secondary leading-relaxed mb-5">{resolvedDesc}</p>

      {isDefaultPassword && (
        <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-surface-elevated border border-border-subtle text-xs text-text-secondary">
          {t('lockGateDefaultBanner', { pwd: DEFAULT_ADMIN_PASSWORD })}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="admin-password-input" className="block text-sm font-medium text-text-primary mb-1.5">
            {t('lockGatePwdLabel')}
          </label>
          <div className="relative">
            <input
              id="admin-password-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              placeholder={t('lockGatePwdPlaceholder')}
              autoFocus
              className="w-full h-11 pl-3.5 pr-11 rounded-lg bg-canvas border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:border-accent-hover transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={t('lockGatePwdLabel')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary rounded-md"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && <p className="text-xs text-danger-text mt-1.5">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="h-10 px-4 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('lockGateBack')}
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="h-10 px-5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            {submitting ? t('lockGateChecking') : t('unlockSettings')}
          </button>
        </div>
      </form>
    </div>
  );

  if (isModal) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={t('unlockSettings')}
      >
        {card}
      </div>
    );
  }

  return (
    <div className="py-12 flex items-center justify-center">
      {card}
    </div>
  );
};
