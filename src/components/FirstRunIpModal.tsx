import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  X,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { AccessListEntry } from '../types/defender';
import { resolveCountryByIp } from '../utils/geoip';
import {
  detectExternalIp,
  ipMatchesCidr,
  parseIpOrCidr,
} from '../utils/network';
import { useI18n } from '../i18n/I18nContext';

interface FirstRunIpModalProps {
  accessList: AccessListEntry[];
  onAccept: (ip: string, comment: string) => void;
  onDismiss: () => void;
}

type DetectionStatus = 'loading' | 'detected' | 'error';

export const FirstRunIpModal: React.FC<FirstRunIpModalProps> = ({
  accessList,
  onAccept,
  onDismiss,
}) => {
  const { t, formatCountry } = useI18n();
  const [status, setStatus] = useState<DetectionStatus>('loading');
  const [detectedIp, setDetectedIp] = useState<string | null>(null);
  const [manualIp, setManualIp] = useState('');
  const [comment, setComment] = useState(() => t('firstRunDefaultComment'));
  const [manualError, setManualError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const runDetection = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setDetectedIp(null);
    setManualError('');

    detectExternalIp(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result) {
        setDetectedIp(result.ip);
        setStatus('detected');
      } else {
        setStatus('error');
      }
    });
  }, []);

  useEffect(() => {
    runDetection();
    return () => {
      abortRef.current?.abort();
    };
  }, [runDetection]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  const alreadyWhitelistedEntry = useMemo(() => {
    if (!detectedIp) return null;
    return (
      accessList.find(
        (entry) =>
          entry.type === 'whitelist' && ipMatchesCidr(detectedIp, entry.value)
      ) || null
    );
  }, [detectedIp, accessList]);

  const country = useMemo(
    () => (detectedIp ? resolveCountryByIp(detectedIp) : null),
    [detectedIp]
  );

  const handleConfirmDetected = () => {
    if (!detectedIp) return;
    onAccept(detectedIp, comment.trim() || t('firstRunDefaultComment'));
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseIpOrCidr(manualIp);
    if (!parsed || parsed.isRange) {
      setManualError(t('firstRunManualInvalid'));
      return;
    }
    onAccept(parsed.ip, comment.trim() || t('firstRunDefaultComment'));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t('firstRunTitle')}
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-md bg-surface border border-border-subtle rounded-xl overflow-hidden my-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 text-accent-hover shrink-0" />
            <h2 className="text-sm font-semibold text-text-primary truncate">
              {t('firstRunTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('close')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {status === 'loading' && (
            <div className="py-6 flex flex-col items-center justify-center gap-2.5 text-center">
              <Loader2 className="w-5 h-5 text-accent-hover animate-spin" />
              <div className="text-xs font-medium text-text-primary">
                {t('firstRunDetecting')}
              </div>
            </div>
          )}

          {status === 'detected' && detectedIp && (
            <>
              <div className="bg-canvas border border-border-subtle rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] text-text-secondary">
                    {t('firstRunExternalIp')}
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
                    <span className="text-base font-mono font-semibold text-text-primary tabular-nums">
                      {detectedIp}
                    </span>
                    {country && country.code !== 'LOCAL' && country.code !== 'UNK' && (
                      <span className="text-xs text-text-secondary">
                        · {formatCountry(country.code, country.nameRu)} ({country.code})
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={runDetection}
                  title={t('firstRunRedetect')}
                  aria-label={t('firstRunRedetect')}
                  className="w-8 h-8 rounded-lg border border-border-subtle hover:border-border-strong text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {alreadyWhitelistedEntry ? (
                <div className="flex items-start gap-2.5 text-xs text-text-secondary">
                  <CheckCircle2 className="w-4 h-4 text-ok-text shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    {t('firstRunAlreadyWl', { val: alreadyWhitelistedEntry.value })}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {t('firstRunRecommend')}
                  </p>

                  <div>
                    <label
                      htmlFor="first-run-ip-comment"
                      className="block text-[11px] text-text-secondary mb-1"
                    >
                      {t('firstRunCommentLabel')}
                    </label>
                    <input
                      id="first-run-ip-comment"
                      type="text"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={t('firstRunDefaultComment')}
                      className="w-full h-9 px-3 rounded-lg bg-canvas border border-border-subtle text-xs text-text-primary placeholder:text-text-muted"
                    />
                  </div>
                </>
              )}
            </>
          )}

          {status === 'error' && (
            <form id="first-run-manual-form" onSubmit={handleManualSubmit} className="space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-text-secondary">
                <AlertCircle className="w-4 h-4 text-warn-text shrink-0 mt-0.5" />
                <p className="leading-relaxed">{t('firstRunErrorText')}</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualIp}
                  onChange={(e) => {
                    setManualIp(e.target.value);
                    setManualError('');
                  }}
                  placeholder={t('firstRunManualPlaceholder')}
                  aria-label={t('firstRunExternalIp')}
                  className="flex-1 h-9 px-3 rounded-lg bg-canvas border border-border-subtle font-mono text-xs text-text-primary placeholder:text-text-muted"
                />
                <button
                  type="button"
                  onClick={runDetection}
                  className="h-9 px-3 rounded-lg border border-border-subtle hover:border-border-strong text-xs font-medium text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t('retry')}
                </button>
              </div>

              {manualError && <p className="text-xs text-danger-text">{manualError}</p>}
            </form>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle">
            {status === 'detected' && alreadyWhitelistedEntry ? (
              <button
                type="button"
                onClick={onDismiss}
                className="h-8 px-4 rounded-lg bg-accent hover:bg-accent-hover text-xs font-medium text-white transition-colors whitespace-nowrap"
              >
                {t('continueBtn')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="h-8 px-3 rounded-lg border border-border-subtle hover:border-border-strong text-xs font-medium text-text-secondary hover:text-text-primary transition-colors whitespace-nowrap"
                >
                  {t('skipBtn')}
                </button>

                {status === 'detected' && detectedIp && (
                  <button
                    type="button"
                    onClick={handleConfirmDetected}
                    className="h-8 px-4 rounded-lg bg-accent hover:bg-accent-hover text-xs font-medium text-white transition-colors whitespace-nowrap"
                  >
                    {t('addToWhitelistBtn')}
                  </button>
                )}

                {status === 'error' && (
                  <button
                    type="submit"
                    form="first-run-manual-form"
                    disabled={!manualIp.trim()}
                    className="h-8 px-4 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-45 disabled:cursor-not-allowed text-xs font-medium text-white transition-colors whitespace-nowrap"
                  >
                    {t('addToWhitelistBtn')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
