import React, { useMemo, useState } from 'react';
import { Check, Plus, Trash2, AlertTriangle, RotateCcw, Clock, Globe, ShieldCheck, Shield, Ban } from 'lucide-react';
import type {
  AccessListType,
  DefenderState,
  ProtocolId,
  SecurityPresetId,
  ServicePolicy,
} from '../types/defender';
import { SECURITY_PRESETS } from '../utils/ipsEngine';
import { cidrsOverlap, parseIpOrCidr } from '../utils/network';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { TempAllowModal } from './TempAllowModal';

interface PoliciesViewProps {
  state: DefenderState;
  now: number;
  onApplyPreset: (preset: Exclude<SecurityPresetId, 'custom'>) => void;
  onUpdatePolicy: (protocol: ProtocolId, patch: Partial<ServicePolicy>) => void;
  onToggleProgressiveBan: () => void;
  onToggleWhitelistOnly: () => void;
  onUpdateEscalationStage: (level: number, durationMinutes: number | null) => void;
  onUpdateResetDays: (days: number) => void;
  onAddAccessEntry: (type: AccessListType, value: string, comment: string) => void;
  onRemoveAccessEntry: (id: string) => void;
  onAddTempAllow: (params: {
    targetType: 'ip' | 'country';
    value: string;
    durationMinutes: number;
    reason?: string;
  }) => void;
  onRemoveTempAllow: (id: string) => void;
}

const DURATION_VALUES: (number | null)[] = [5, 15, 30, 60, 120, 360, 1440, 10080, null];

const PRESET_TITLE_KEYS: Record<Exclude<SecurityPresetId, 'custom'>, TranslationKey> = {
  standard: 'presetStandard',
  strict: 'presetStrict',
  office: 'presetOffice',
};

const PROTOCOL_TITLE_KEYS: Record<ProtocolId, TranslationKey> = {
  RDP: 'protoRDP',
  FTP: 'protoFTP',
  SMB: 'protoSMB',
};

const STAGE_LABEL_KEYS: Record<number, TranslationKey> = {
  1: 'stage1',
  2: 'stage2',
  3: 'stage3',
  4: 'stage4',
};

export const PoliciesView: React.FC<PoliciesViewProps> = ({
  state,
  now,
  onApplyPreset,
  onUpdatePolicy,
  onToggleProgressiveBan,
  onToggleWhitelistOnly,
  onUpdateEscalationStage,
  onUpdateResetDays,
  onAddAccessEntry,
  onRemoveAccessEntry,
  onAddTempAllow,
  onRemoveTempAllow,
}) => {
  const { t, formatDuration, formatCountdown, formatHosts, formatCountry } = useI18n();
  const progressiveEnabled = state.escalation.enabled !== false;
  const whitelistOnly = Boolean(state.whitelistOnly);
  const tempAllows = state.tempAllows || [];
  const whitelistCount = state.accessList.filter((e) => e.type === 'whitelist').length;
  const blacklistCount = state.accessList.filter((e) => e.type === 'blacklist').length;

  const [listTab, setListTab] = useState<AccessListType>('whitelist');
  const [ipInput, setIpInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [formError, setFormError] = useState('');
  const [tempAllowModalOpen, setTempAllowModalOpen] = useState(false);

  const parsedInput = useMemo(() => parseIpOrCidr(ipInput), [ipInput]);

  const conflictWarning = useMemo(() => {
    if (!parsedInput) return null;
    const oppositeType: AccessListType = listTab === 'whitelist' ? 'blacklist' : 'whitelist';
    const opposite = state.accessList.find(
      (entry) => entry.type === oppositeType && cidrsOverlap(parsedInput.normalized, entry.value)
    );
    if (!opposite) return null;
    return listTab === 'blacklist'
      ? t('overlapWlWarn', { val: opposite.value })
      : t('overlapBlWarn', { val: opposite.value });
  }, [parsedInput, listTab, state.accessList, t]);

  const filteredList = useMemo(
    () => state.accessList.filter((entry) => entry.type === listTab),
    [state.accessList, listTab]
  );

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedInput) {
      setFormError(t('invalidIpCidr'));
      return;
    }
    const duplicate = state.accessList.some(
      (e) => e.type === listTab && e.value === parsedInput.normalized
    );
    if (duplicate) {
      setFormError(t('duplicateEntry'));
      return;
    }
    onAddAccessEntry(
      listTab,
      parsedInput.normalized,
      commentInput.trim() || (listTab === 'whitelist' ? t('defaultWlComment') : t('defaultBlComment'))
    );
    setIpInput('');
    setCommentInput('');
    setFormError('');
  };

  return (
    <div className="space-y-4">
      {/* Compact Preset Bar */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(['standard', 'strict', 'office'] as const).map((presetId) => {
          const preset = SECURITY_PRESETS[presetId];
          const isActive = progressiveEnabled && state.activePreset === presetId;
          return (
            <button
              key={presetId}
              type="button"
              disabled={!progressiveEnabled}
              onClick={() => {
                if (progressiveEnabled) onApplyPreset(presetId);
              }}
              className={`text-left px-4 py-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                !progressiveEnabled
                  ? 'bg-surface border-border-subtle opacity-45 cursor-not-allowed'
                  : isActive
                  ? 'bg-surface-elevated border-accent-hover'
                  : 'bg-surface border-border-subtle hover:border-border-strong'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-text-primary truncate">
                  {t(PRESET_TITLE_KEYS[presetId])}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-text-secondary mt-0.5 truncate">
                  {preset.maxAttempts.RDP}/{preset.windowMinutes.RDP}{t('minutesShort')} ·{' '}
                  {preset.stages.map((s) => formatDuration(s.durationMinutes)).join(' → ')}
                </div>
              </div>
              {isActive && <Check className="w-4 h-4 text-accent-hover shrink-0" />}
            </button>
          );
        })}
      </section>

      {/* Compact Protocol Thresholds & Progressive Ban */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-7 bg-surface border border-border-subtle rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border-subtle flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-text-primary">{t('thresholdsTitle')}</h2>
            <button
              type="button"
              onClick={() => onApplyPreset('standard')}
              className="h-7 px-2.5 rounded-md border border-border-subtle hover:border-border-strong text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1 whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              {t('reset')}
            </button>
          </div>

          <div className="divide-y divide-border-subtle">
            {(['RDP', 'FTP', 'SMB'] as ProtocolId[]).map((pid) => {
              const p = state.policies[pid];
              return (
                <div key={pid} className="px-4 py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={p.enabled}
                      aria-label={t('toggleProtocolAria', { protocol: p.protocol })}
                      onClick={() => onUpdatePolicy(pid, { enabled: !p.enabled })}
                      className={`w-10 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                        p.enabled ? 'bg-ok' : 'bg-border-subtle'
                      }`}
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                          p.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-text-primary whitespace-nowrap">
                        {t(PROTOCOL_TITLE_KEYS[pid])} ({p.protocol})
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <label className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                      {t('portLabel')}
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={p.port}
                        disabled={!p.enabled}
                        onChange={(e) =>
                          onUpdatePolicy(pid, {
                            port: Math.max(1, Math.min(65535, Number(e.target.value) || p.port)),
                          })
                        }
                        className="w-16 h-8 px-2 rounded-md bg-canvas border border-border-subtle font-mono text-xs text-text-primary tabular-nums disabled:opacity-45"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                      {t('errorsLabel')}
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={p.maxAttempts}
                        disabled={!p.enabled}
                        onChange={(e) =>
                          onUpdatePolicy(pid, {
                            maxAttempts: Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                          })
                        }
                        className="w-14 h-8 px-2 rounded-md bg-canvas border border-border-subtle font-mono text-xs text-text-primary tabular-nums disabled:opacity-45"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                      {t('minLabel')}
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={p.windowMinutes}
                        disabled={!p.enabled}
                        onChange={(e) =>
                          onUpdatePolicy(pid, {
                            windowMinutes: Math.max(1, Math.min(1440, Number(e.target.value) || 1)),
                          })
                        }
                        className="w-14 h-8 px-2 rounded-md bg-canvas border border-border-subtle font-mono text-xs text-text-primary tabular-nums disabled:opacity-45"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Compact Progressive Ban */}
        <section className="lg:col-span-5 bg-surface border border-border-subtle rounded-xl p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <h2 className="text-sm font-semibold text-text-primary whitespace-nowrap">
                {t('progressiveBanTitle')}
              </h2>
              <button
                type="button"
                role="switch"
                aria-checked={progressiveEnabled}
                aria-label={t('toggleProgressiveAria')}
                onClick={onToggleProgressiveBan}
                className={`w-10 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                  progressiveEnabled ? 'bg-ok' : 'bg-border-subtle'
                }`}
              >
                <span
                  className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                    progressiveEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {progressiveEnabled ? (
              <label className="flex items-center gap-1.5 text-[11px] text-text-secondary shrink-0">
                {t('resetDaysLabel')}
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={state.escalation.resetAfterDays}
                  onChange={(e) =>
                    onUpdateResetDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))
                  }
                  className="w-14 h-7 px-2 rounded-md bg-canvas border border-border-subtle font-mono text-xs text-text-primary tabular-nums"
                />
              </label>
            ) : (
              <span className="text-xs font-medium text-danger-text whitespace-nowrap shrink-0">
                {t('permanentBanMode')}
              </span>
            )}
          </div>

          <div
            className={`grid grid-cols-2 gap-2.5 transition-opacity ${
              progressiveEnabled ? '' : 'opacity-45'
            }`}
          >
            {state.escalation.stages.map((stage) => {
              const stageLabel = STAGE_LABEL_KEYS[stage.level]
                ? t(STAGE_LABEL_KEYS[stage.level])
                : stage.label;
              return (
                <div key={stage.level} className="space-y-1">
                  <div className="text-[11px] text-text-secondary">{stageLabel}</div>
                  <select
                    value={
                      !progressiveEnabled || stage.durationMinutes === null
                        ? 'permanent'
                        : String(stage.durationMinutes)
                    }
                    disabled={!progressiveEnabled}
                    onChange={(e) => {
                      const val = e.target.value === 'permanent' ? null : Number(e.target.value);
                      onUpdateEscalationStage(stage.level, val);
                    }}
                    aria-label={stageLabel}
                    className="w-full h-8 px-2.5 rounded-md bg-canvas border border-border-subtle text-xs text-text-primary disabled:cursor-not-allowed"
                  >
                    {DURATION_VALUES.map((val) => (
                      <option
                        key={val === null ? 'permanent' : String(val)}
                        value={val === null ? 'permanent' : String(val)}
                      >
                        {formatDuration(val)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Compact Whitelist & Blacklist + Whitelist-Only Mode */}
      <section className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-subtle flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text-primary">{t('ipListsTitle')}</h2>

          <div
            role="tablist"
            aria-label={t('ipListsTitle')}
            className="inline-flex items-center gap-1 p-0.5 bg-canvas border border-border-subtle rounded-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={listTab === 'whitelist'}
              onClick={() => { setListTab('whitelist'); setFormError(''); }}
              className={`h-7 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 border ${
                listTab === 'whitelist'
                  ? 'bg-ok/15 text-ok-text border-ok/35'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <ShieldCheck
                className={`w-3.5 h-3.5 shrink-0 ${
                  listTab === 'whitelist' ? 'text-ok-text' : 'text-ok-text/70'
                }`}
              />
              <span>{t('whitelistTab', { n: whitelistCount })}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={listTab === 'blacklist'}
              onClick={() => { setListTab('blacklist'); setFormError(''); }}
              className={`h-7 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 border ${
                listTab === 'blacklist'
                  ? 'bg-danger/15 text-danger-text border-danger/35'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <Ban
                className={`w-3.5 h-3.5 shrink-0 ${
                  listTab === 'blacklist' ? 'text-danger-text' : 'text-danger-text/70'
                }`}
              />
              <span>{t('blacklistTab', { n: blacklistCount })}</span>
            </button>
          </div>
        </div>

        {/* Allow Only From Whitelist Bar */}
        <div className="px-4 py-2.5 border-b border-border-subtle bg-canvas/50 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={whitelistOnly}
            onClick={onToggleWhitelistOnly}
            className={`h-8 px-3 rounded-lg border text-xs font-medium transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
              whitelistOnly
                ? 'bg-accent/15 border-accent-hover text-text-primary'
                : 'bg-surface border-border-subtle hover:border-border-strong text-text-primary'
            }`}
          >
            <Shield className={`w-3.5 h-3.5 shrink-0 ${whitelistOnly ? 'text-accent-hover' : 'text-text-muted'}`} />
            <span>{t('whitelistOnlyTitle')}</span>
            <span
              className={`w-8 h-4 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
                whitelistOnly ? 'bg-ok' : 'bg-border-subtle'
              }`}
            >
              <span
                className={`block w-3 h-3 rounded-full bg-white transition-transform ${
                  whitelistOnly ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </span>
          </button>

          {whitelistOnly && whitelistCount === 0 && (
            <div className="text-xs text-warn-text flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{t('whitelistOnlyEmptyWarn')}</span>
            </div>
          )}
        </div>

        <div className="p-4 space-y-3">
          <form onSubmit={handleAddSubmit} className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
              <input
                type="text"
                value={ipInput}
                onChange={(e) => { setIpInput(e.target.value); setFormError(''); }}
                placeholder={t('ipInputPlaceholder')}
                className="md:col-span-5 h-9 px-3 rounded-lg bg-canvas border border-border-subtle font-mono text-xs text-text-primary placeholder:text-text-muted"
              />
              <input
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder={t('commentPlaceholder')}
                className="md:col-span-5 h-9 px-3 rounded-lg bg-canvas border border-border-subtle text-xs text-text-primary placeholder:text-text-muted"
              />
              <button
                type="submit"
                className="md:col-span-2 h-9 px-3 rounded-lg bg-accent hover:bg-accent-hover text-xs font-medium text-white transition-colors whitespace-nowrap flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('add')}
              </button>
            </div>

            {parsedInput && (
              <div className="text-[11px] text-text-secondary font-mono">
                {parsedInput.normalized} · {formatHosts(parsedInput.hostCount)}
              </div>
            )}

            {conflictWarning && (
              <div className="px-3 py-2 rounded-lg bg-warn/10 border border-warn/30 text-xs text-warn-text flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{conflictWarning}</span>
              </div>
            )}

            {formError && <p className="text-xs text-danger-text">{formError}</p>}
          </form>

          {filteredList.length === 0 ? (
            <div className="py-5 text-center border border-dashed border-border-subtle rounded-lg text-xs text-text-secondary">
              {t('listEmpty')}
            </div>
          ) : (
            <div className="overflow-x-auto border border-border-subtle rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border-subtle bg-canvas/60 text-[11px] font-medium text-text-secondary">
                    <th className="py-2 px-3">{t('colIpSubnet')}</th>
                    <th className="py-2 px-3">{t('colScope')}</th>
                    <th className="py-2 px-3">{t('colComment')}</th>
                    <th className="py-2 px-3 text-right">{t('colDelete')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredList.map((entry) => {
                    const parsed = parseIpOrCidr(entry.value);
                    return (
                      <tr key={entry.id} className="hover:bg-surface-elevated/50 transition-colors">
                        <td className="py-2 px-3 font-mono text-text-primary whitespace-nowrap">
                          {entry.value}
                        </td>
                        <td className="py-2 px-3 text-text-secondary whitespace-nowrap tabular-nums">
                          {parsed ? formatHosts(parsed.hostCount) : formatHosts(1)}
                        </td>
                        <td className="py-2 px-3 text-text-primary">{entry.comment}</td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onRemoveAccessEntry(entry.id)}
                            aria-label={`${t('delete')} ${entry.value}`}
                            className="h-7 px-2 rounded text-text-secondary hover:text-danger-text hover:bg-canvas transition-colors inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Temporary Unblocks (IP & Countries) */}
      <section className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-subtle flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent-hover shrink-0" />
            <h2 className="text-sm font-semibold text-text-primary">
              {t('tempUnblocksTitle', { n: tempAllows.length })}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setTempAllowModalOpen(true)}
            className="h-8 px-3 rounded-lg bg-accent hover:bg-accent-hover text-xs font-medium text-white transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('tempUnblockBtn')}
          </button>
        </div>

        <div className="p-4">
          {tempAllows.length === 0 ? (
            <div className="py-5 text-center border border-dashed border-border-subtle rounded-lg text-xs text-text-secondary">
              {t('noTempUnblocks')}
            </div>
          ) : (
            <div className="overflow-x-auto border border-border-subtle rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border-subtle bg-canvas/60 text-[11px] font-medium text-text-secondary">
                    <th className="py-2 px-3">{t('colTarget')}</th>
                    <th className="py-2 px-3">{t('colType')}</th>
                    <th className="py-2 px-3">{t('colComment')}</th>
                    <th className="py-2 px-3 text-right">{t('colRemaining')}</th>
                    <th className="py-2 px-3 text-right">{t('colCancel')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {tempAllows.map((item) => {
                    const displayTarget =
                      item.targetType === 'country'
                        ? `${formatCountry(item.value, item.label)} (${item.value})`
                        : item.value;
                    return (
                      <tr key={item.id} className="hover:bg-surface-elevated/50 transition-colors">
                        <td className="py-2 px-3 font-mono text-text-primary whitespace-nowrap">
                          {displayTarget}
                        </td>
                        <td className="py-2 px-3 text-text-secondary whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            {item.targetType === 'country' ? (
                              <>
                                <Globe className="w-3.5 h-3.5 text-text-muted" />
                                {t('typeCountry')}
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="w-3.5 h-3.5 text-text-muted" />
                                {t('typeIp')}
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-text-primary">
                          {item.reason || '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-ok-text font-medium whitespace-nowrap">
                          {formatCountdown(item.expiresAt, now)}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onRemoveTempAllow(item.id)}
                            aria-label={`${t('colCancel')} ${displayTarget}`}
                            className="h-7 px-2 rounded text-text-secondary hover:text-danger-text hover:bg-canvas transition-colors inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {tempAllowModalOpen && (
        <TempAllowModal
          onClose={() => setTempAllowModalOpen(false)}
          onAddTempAllow={onAddTempAllow}
        />
      )}
    </div>
  );
};
