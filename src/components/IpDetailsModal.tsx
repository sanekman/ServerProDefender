import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Copy,
  Check,
  Unlock,
  Ban,
  Plus,
  ShieldAlert,
  Mail,
  Clock,
  Globe,
} from 'lucide-react';
import type { ActiveBan, DefenderState, EventVerdict } from '../types/defender';
import { COUNTRIES } from '../utils/geoip';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';

interface IpDetailsModalProps {
  ban: ActiveBan;
  state: DefenderState;
  now: number;
  onClose: () => void;
  onUnbanIp: (banId: string) => void;
  onMakeBanPermanent: (banId: string) => void;
  onMoveBanToWhitelist: (banId: string) => void;
  onAddTempAllow: (params: {
    targetType: 'ip' | 'country';
    value: string;
    durationMinutes: number;
    reason?: string;
  }) => void;
}

const VERDICT_META: Record<EventVerdict, { labelKey: TranslationKey; color: string }> = {
  allowed: { labelKey: 'verdictAllowed', color: 'text-ok-text' },
  blocked: { labelKey: 'verdictBlocked', color: 'text-danger-text' },
  geo_blocked: { labelKey: 'verdictGeoBlocked', color: 'text-danger-text' },
  geo_audit: { labelKey: 'verdictGeoAudit', color: 'text-warn-text' },
  warning: { labelKey: 'verdictWarning', color: 'text-warn-text' },
  whitelisted: { labelKey: 'verdictWhitelisted', color: 'text-ok-text' },
  unprotected: { labelKey: 'verdictUnprotected', color: 'text-text-muted' },
};

export const IpDetailsModal: React.FC<IpDetailsModalProps> = ({
  ban,
  state,
  now,
  onClose,
  onUnbanIp,
  onMakeBanPermanent,
  onMoveBanToWhitelist,
  onAddTempAllow,
}) => {
  const { t, formatCountry, formatRegion, formatCountdown, formatDateTime, formatDuration } = useI18n();
  const [copiedField, setCopiedField] = useState<'ip' | null>(null);
  const [tempMinutes, setTempMinutes] = useState<number>(60);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const countryMeta = useMemo(
    () => COUNTRIES.find((c) => c.code === ban.countryCode),
    [ban.countryCode]
  );

  const ipEvents = useMemo(
    () => state.events.filter((ev) => ev.ip === ban.ip),
    [state.events, ban.ip]
  );

  const ipAlerts = useMemo(
    () => state.alertHistory.filter((a) => a.ip === ban.ip),
    [state.alertHistory, ban.ip]
  );

  const targetedUsernames = useMemo(() => {
    const uniq = new Set<string>();
    for (const ev of ipEvents) {
      if (ev.username) uniq.add(ev.username);
    }
    return Array.from(uniq);
  }, [ipEvents]);

  const recurrenceTotal = useMemo(() => {
    let maxRec = ban.escalationLevel;
    for (const [key, rec] of Object.entries(state.failureTracker)) {
      if (key.startsWith(`${ban.ip}|`)) {
        maxRec = Math.max(maxRec, rec.recurrenceCount);
      }
    }
    return maxRec;
  }, [state.failureTracker, ban.ip, ban.escalationLevel]);

  const portLabel = useMemo(() => {
    if (ban.protocol === 'ALL') return t('ipAllPorts');
    const policy = state.policies[ban.protocol];
    return t('ipPortLabel', { protocol: ban.protocol, port: policy.port });
  }, [ban.protocol, state.policies, t]);

  const handleCopy = async (field: 'ip', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1600);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`${t('ipDetailsTitle')} ${ban.ip}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-surface border border-border-subtle rounded-xl overflow-hidden my-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border-subtle flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldAlert className="w-4 h-4 text-danger-text shrink-0" />
              <h2 className="text-base font-bold font-mono tabular-nums text-text-primary">
                {ban.ip}
              </h2>
              <button
                type="button"
                onClick={() => handleCopy('ip', ban.ip)}
                title={t('copy')}
                className="h-6 px-2 rounded border border-border-subtle hover:border-accent-hover text-[11px] text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-1"
              >
                {copiedField === 'ip' ? (
                  <>
                    <Check className="w-3 h-3 text-ok-text" />
                    {t('copied')}
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    IP
                  </>
                )}
              </button>
            </div>
            <div className="text-xs text-text-secondary flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
              <span>
                {formatCountry(ban.countryCode, ban.countryName)} ({ban.countryCode})
              </span>
              {countryMeta && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{formatRegion(countryMeta.region)}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono">{portLabel}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="px-3 py-2.5 rounded-lg bg-canvas border border-border-subtle">
              <div className="text-[11px] text-text-muted">{t('ipStatusStage')}</div>
              <div
                className={`text-xs font-semibold mt-0.5 ${
                  ban.isPermanent ? 'text-danger-text' : 'text-warn-text'
                }`}
              >
                {ban.isPermanent ? t('ipPermanentStage') : t('ipStageValue', { level: ban.escalationLevel })}
              </div>
            </div>

            <div className="px-3 py-2.5 rounded-lg bg-canvas border border-border-subtle">
              <div className="text-[11px] text-text-muted">{t('colRemaining')}</div>
              <div
                className={`text-xs font-mono font-semibold tabular-nums mt-0.5 ${
                  ban.isPermanent ? 'text-danger-text' : 'text-text-primary'
                }`}
              >
                {formatCountdown(ban.expiresAt, now)}
              </div>
            </div>

            <div className="px-3 py-2.5 rounded-lg bg-canvas border border-border-subtle">
              <div className="text-[11px] text-text-muted">{t('ipBannedAt')}</div>
              <div className="text-xs font-mono tabular-nums text-text-primary mt-0.5">
                {formatDateTime(ban.bannedAt)}
              </div>
            </div>

            <div className="px-3 py-2.5 rounded-lg bg-canvas border border-border-subtle">
              <div className="text-[11px] text-text-muted">{t('ipExpiresAt')}</div>
              <div className="text-xs font-mono tabular-nums text-text-primary mt-0.5">
                {ban.expiresAt ? formatDateTime(ban.expiresAt) : t('noExpiry')}
              </div>
            </div>

            <div className="px-3 py-2.5 rounded-lg bg-canvas border border-border-subtle">
              <div className="text-[11px] text-text-muted">{t('ipAttemptsRec')}</div>
              <div className="text-xs font-mono tabular-nums text-text-primary mt-0.5">
                {Math.max(ban.attemptsCount, ipEvents.length)} / {recurrenceTotal}
              </div>
            </div>

            <div className="px-3 py-2.5 rounded-lg bg-canvas border border-border-subtle">
              <div className="text-[11px] text-text-muted">{t('ipTargetLogins')}</div>
              <div className="text-xs font-mono text-text-primary mt-0.5 truncate" title={targetedUsernames.join(', ')}>
                {targetedUsernames.length > 0 ? targetedUsernames.join(', ') : '—'}
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-canvas border border-border-subtle divide-y divide-border-subtle text-xs">
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
              <span className="text-text-secondary shrink-0">{t('ipBanReason')}</span>
              <span className="text-text-primary font-medium text-right">{ban.reasonLabel}</span>
            </div>
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
              <span className="text-text-secondary shrink-0">{t('ipFirewallRule')}</span>
              <span className="font-mono text-text-primary truncate">{ban.firewallRuleName}</span>
            </div>
            {countryMeta && countryMeta.samplePrefixes.length > 0 && (
              <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                <span className="text-text-secondary shrink-0">{t('ipNetworkRange', { code: ban.countryCode })}</span>
                <span className="font-mono text-text-secondary truncate">
                  {countryMeta.samplePrefixes.slice(0, 3).join(', ')}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">
                {t('ipEventsHistory', { n: ipEvents.length })}
              </span>
              {ipAlerts.length > 0 && (
                <span className="text-[11px] text-ok-text inline-flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  {t('ipEmailAlerts', { n: ipAlerts.length })}
                </span>
              )}
            </div>

            {ipEvents.length === 0 ? (
              <div className="px-3.5 py-4 rounded-lg bg-canvas border border-border-subtle text-center text-xs text-text-muted">
                {t('ipNoEvents')}
              </div>
            ) : (
              <div className="rounded-lg bg-canvas border border-border-subtle overflow-hidden">
                <div className="overflow-x-auto max-h-[168px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-canvas border-b border-border-subtle text-[11px] font-medium text-text-muted">
                      <tr>
                        <th className="py-1.5 px-3">{t('colTime')}</th>
                        <th className="py-1.5 px-2.5">{t('colService')}</th>
                        <th className="py-1.5 px-2.5">{t('ipColLogin')}</th>
                        <th className="py-1.5 px-2.5">{t('ipColCode')}</th>
                        <th className="py-1.5 px-3 text-right">{t('ipColOutcome')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {ipEvents.slice(0, 20).map((ev) => {
                        const meta = VERDICT_META[ev.verdict] || VERDICT_META.warning;
                        return (
                          <tr key={ev.id}>
                            <td className="py-1.5 px-3 font-mono text-text-secondary tabular-nums whitespace-nowrap">
                              {formatDateTime(ev.timestamp)}
                            </td>
                            <td className="py-1.5 px-2.5 font-mono text-text-primary whitespace-nowrap">
                              {ev.protocol}
                            </td>
                            <td className="py-1.5 px-2.5 font-mono text-text-secondary truncate max-w-[120px]">
                              {ev.username}
                            </td>
                            <td className="py-1.5 px-2.5 font-mono text-text-muted whitespace-nowrap">
                              {ev.eventId}
                            </td>
                            <td className={`py-1.5 px-3 text-right font-medium whitespace-nowrap ${meta.color}`}>
                              {t(meta.labelKey)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="px-3.5 py-2.5 rounded-lg bg-canvas border border-border-subtle flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <Clock className="w-3.5 h-3.5 text-accent-hover shrink-0" />
              <span className="font-medium text-text-primary">{t('ipTempUnblockFor')}</span>
              <select
                value={tempMinutes}
                onChange={(e) => setTempMinutes(Number(e.target.value))}
                aria-label={t('tempDurationLabel')}
                className="h-7 px-2 rounded-md bg-surface border border-border-subtle text-xs text-text-primary"
              >
                {[15, 60, 240, 1440].map((m) => (
                  <option key={m} value={m}>
                    {formatDuration(m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onAddTempAllow({ targetType: 'ip', value: ban.ip, durationMinutes: tempMinutes });
                  onClose();
                }}
                className="h-7 px-2.5 rounded-md bg-accent hover:bg-accent-hover text-[11px] font-medium text-white transition-colors whitespace-nowrap"
              >
                {t('ipOpenIp')}
              </button>
              {ban.countryCode !== 'LOCAL' && (
                <button
                  type="button"
                  onClick={() => {
                    onAddTempAllow({
                      targetType: 'country',
                      value: ban.countryCode,
                      durationMinutes: tempMinutes,
                    });
                    onClose();
                  }}
                  className="h-7 px-2.5 rounded-md border border-border-subtle hover:border-accent-hover bg-surface text-[11px] font-medium text-text-primary transition-colors whitespace-nowrap inline-flex items-center gap-1"
                >
                  <Globe className="w-3 h-3 text-accent-hover" />
                  {t('ipOpenCountry', { code: ban.countryCode })}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-border-subtle bg-canvas/50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onUnbanIp(ban.id);
                onClose();
              }}
              className="h-8 px-3 rounded-lg border border-border-subtle hover:border-ok-text bg-surface text-xs font-medium text-text-primary hover:text-ok-text transition-colors inline-flex items-center gap-1.5"
            >
              <Unlock className="w-3.5 h-3.5" />
              {t('unbanFull')}
            </button>

            {!ban.isPermanent && (
              <button
                type="button"
                onClick={() => onMakeBanPermanent(ban.id)}
                className="h-8 px-3 rounded-lg border border-border-subtle hover:border-danger-text bg-surface text-xs font-medium text-text-secondary hover:text-danger-text transition-colors inline-flex items-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" />
                {t('forever')}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onMoveBanToWhitelist(ban.id);
                onClose();
              }}
              className="h-8 px-3 rounded-lg border border-border-subtle hover:border-accent-hover bg-surface text-xs font-medium text-text-secondary hover:text-accent-hover transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('ipToWhitelist')}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3.5 rounded-lg bg-surface-elevated hover:bg-border-subtle text-xs font-medium text-text-primary transition-colors"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
};
