import React, { useState } from 'react';
import {
  Server,
  Shield,
  Lock,
  Play,
  Square,
  RotateCw,
  AlertTriangle,
} from 'lucide-react';
import type { DefenderState, FirewallProfilesState, SystemControlState } from '../types/defender';
import {
  DEFAULT_ADMIN_PASSWORD,
  getFirewallOverallStatus,
} from '../utils/ipsEngine';
import { useI18n } from '../i18n/I18nContext';

interface SystemAndInstallerViewProps {
  state: DefenderState;
  onUpdateSystem: (patch: Partial<SystemControlState>) => void;
  onToggleFirewallProfile: (profile: keyof FirewallProfilesState) => void;
  onToggleAllFirewalls: (enabled: boolean) => void;
  onToggleWhitelistOnly: () => void;
  onChangePassword: (newPassword: string) => Promise<void>;
  onLockSettingsNow: () => void;
  onNotify: (message: string) => void;
}

export const SystemAndInstallerView: React.FC<SystemAndInstallerViewProps> = ({
  state,
  onUpdateSystem,
  onToggleFirewallProfile,
  onToggleAllFirewalls,
  onToggleWhitelistOnly,
  onChangePassword,
  onLockSettingsNow,
  onNotify,
}) => {
  const { t } = useI18n();
  const { system } = state;
  const fwStatus = getFirewallOverallStatus(system.firewallProfiles);
  const serviceRunning = system.serviceStatus === 'running';
  const whitelistOnly = Boolean(state.whitelistOnly);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.trim().length < 4) {
      setPwdError(t('pwdMinError'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError(t('pwdMismatchError'));
      return;
    }
    await onChangePassword(newPassword.trim());
    setNewPassword('');
    setConfirmPassword('');
    setPwdError('');
  };

  return (
    <div className="space-y-4">
      {/* Row 1: Windows Service + Windows Firewall */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-surface border border-border-subtle rounded-xl p-4 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Server className="w-4 h-4 text-accent-hover" />
                <h2 className="text-sm font-semibold text-text-primary">
                  {t('winServiceTitle')} · <span className="font-mono text-text-secondary">{system.serviceName}</span>
                </h2>
              </div>
              <span className={`text-xs font-semibold ${serviceRunning ? 'text-ok-text' : 'text-danger-text'}`}>
                {serviceRunning ? t('serviceRunning') : t('serviceStopped')}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-y border-border-subtle">
              <span className="text-xs text-text-primary">{t('startupType')}</span>
              <div className="flex items-center gap-1 p-0.5 bg-canvas border border-border-subtle rounded-lg">
                <button
                  type="button"
                  onClick={() => onUpdateSystem({ serviceStartupType: 'auto' })}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${
                    system.serviceStartupType === 'auto'
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {t('startupAuto')}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSystem({ serviceStartupType: 'manual' })}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${
                    system.serviceStartupType === 'manual'
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {t('startupManual')}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!serviceRunning ? (
              <button
                type="button"
                onClick={() => onUpdateSystem({ serviceStatus: 'running', lastServiceChangeAt: Date.now() })}
                className="h-9 px-3.5 rounded-lg bg-ok hover:bg-ok-text text-xs font-medium text-white transition-colors flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                {t('startBtn')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onUpdateSystem({ serviceStatus: 'stopped', lastServiceChangeAt: Date.now() })}
                className="h-9 px-3.5 rounded-lg border border-danger/50 hover:bg-danger/15 text-xs font-medium text-danger-text transition-colors flex items-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5" />
                {t('stopBtn')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onUpdateSystem({ serviceStatus: 'running', lastServiceChangeAt: Date.now() });
                onNotify(t('toastServiceRestarted'));
              }}
              className="h-9 px-3.5 rounded-lg border border-border-subtle hover:border-border-strong text-xs font-medium text-text-primary transition-colors flex items-center gap-1.5"
            >
              <RotateCw className="w-3.5 h-3.5 text-text-secondary" />
              {t('restartBtn')}
            </button>
          </div>
        </section>

        <section className="bg-surface border border-border-subtle rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-accent-hover" />
              <h2 className="text-sm font-semibold text-text-primary">{t('winFirewallTitle')}</h2>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={fwStatus !== 'disabled'}
              aria-label={t('winFirewallTitle')}
              onClick={() => onToggleAllFirewalls(fwStatus === 'disabled')}
              className={`w-11 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                fwStatus === 'enabled'
                  ? 'bg-ok'
                  : fwStatus === 'partial'
                  ? 'bg-warn'
                  : 'bg-border-subtle'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                  fwStatus !== 'disabled' ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {fwStatus === 'disabled' && (
            <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger-text flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{t('fwDisabledWarn')}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { key: 'private', label: t('fwProfilePrivate') },
                { key: 'domain', label: t('fwProfileDomain') },
                { key: 'public', label: t('fwProfilePublic') },
              ] as const
            ).map((prof) => {
              const enabled = system.firewallProfiles[prof.key];
              return (
                <button
                  key={prof.key}
                  type="button"
                  onClick={() => onToggleFirewallProfile(prof.key)}
                  className={`h-9 px-3 rounded-lg border text-xs font-medium transition-colors flex items-center justify-between gap-2 ${
                    enabled
                      ? 'bg-ok/12 border-ok/40 text-text-primary'
                      : 'bg-canvas border-border-subtle text-text-secondary'
                  }`}
                >
                  <span className="truncate">{prof.label}</span>
                  <span className={`font-mono text-[11px] ${enabled ? 'text-ok-text' : 'text-text-muted'}`}>
                    {enabled ? t('on') : t('off')}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Whitelist-Only Firewall Rule Row */}
          <div className="px-3 py-2 rounded-lg bg-canvas border border-border-subtle flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-text-primary truncate">
                {t('whitelistOnlyTitle')}
              </div>
              <div className="text-[11px] text-text-secondary truncate">
                {t('whitelistOnlyFirewallRule')}:{' '}
                <span className={whitelistOnly ? 'text-ok-text font-medium' : 'text-text-muted'}>
                  {whitelistOnly ? t('activeRule') : t('inactiveRule')}
                </span>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={whitelistOnly}
              aria-label={t('whitelistOnlyTitle')}
              onClick={onToggleWhitelistOnly}
              className={`w-10 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                whitelistOnly ? 'bg-ok' : 'bg-border-subtle'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                  whitelistOnly ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </section>
      </div>

      {/* Row 2: Settings Password Protection */}
      <section className="bg-surface border border-border-subtle rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-accent-hover" />
            <h2 className="text-sm font-semibold text-text-primary">{t('pwdSectionTitle')}</h2>
            {system.isDefaultPassword && (
              <span className="text-xs text-text-muted">
                · {t('pwdDefaultHint')}: <span className="font-mono text-text-secondary">{DEFAULT_ADMIN_PASSWORD}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {system.settingsLockEnabled && (
              <button
                type="button"
                onClick={onLockSettingsNow}
                className="h-8 px-3 rounded-lg border border-border-subtle hover:border-accent-hover text-xs font-medium text-text-primary transition-colors whitespace-nowrap"
              >
                {t('lockSettings')}
              </button>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={system.settingsLockEnabled}
              aria-label={t('pwdSectionTitle')}
              onClick={() => onUpdateSystem({ settingsLockEnabled: !system.settingsLockEnabled })}
              className={`w-11 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                system.settingsLockEnabled ? 'bg-ok' : 'bg-border-subtle'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                  system.settingsLockEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <form onSubmit={handlePasswordSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setPwdError(''); }}
            placeholder={t('newPwdPlaceholder')}
            className="md:col-span-5 h-9 px-3 rounded-lg bg-canvas border border-border-subtle text-xs text-text-primary placeholder:text-text-muted"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setPwdError(''); }}
            placeholder={t('confirmPwdPlaceholder')}
            className="md:col-span-5 h-9 px-3 rounded-lg bg-canvas border border-border-subtle text-xs text-text-primary placeholder:text-text-muted"
          />
          <button
            type="submit"
            className="md:col-span-2 h-9 px-3 rounded-lg bg-accent hover:bg-accent-hover text-xs font-medium text-white transition-colors whitespace-nowrap"
          >
            {t('save')}
          </button>
          {pwdError && <p className="md:col-span-12 text-xs text-danger-text">{pwdError}</p>}
        </form>
      </section>
    </div>
  );
};
