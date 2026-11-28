import React, { useState } from 'react';
import { Bell, Mail, Send, Eye, EyeOff, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { DefenderState, NotificationSettings, SmtpSecurityMode } from '../types/defender';
import { useI18n } from '../i18n/I18nContext';

interface NotificationsViewProps {
  state: DefenderState;
  onUpdateNotifications: (patch: Partial<NotificationSettings>) => void;
  onUpdateTriggers: (patch: Partial<NotificationSettings['triggers']>) => void;
  onSendTestAlert: () => { ok: boolean; error?: string };
  onClearAlertHistory: () => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  state,
  onUpdateNotifications,
  onUpdateTriggers,
  onSendTestAlert,
  onClearAlertHistory,
}) => {
  const { t, formatDateTime } = useI18n();
  const { notifications, alertHistory } = state;
  const [showPassword, setShowPassword] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const smtpPresets: {
    id: string;
    label: string;
    host: string;
    port: number;
    security: SmtpSecurityMode;
  }[] = [
    { id: 'yandex', label: 'Yandex', host: 'smtp.yandex.ru', port: 465, security: 'ssl' },
    { id: 'mailru', label: 'Mail.ru', host: 'smtp.mail.ru', port: 465, security: 'ssl' },
    { id: 'gmail', label: 'Gmail', host: 'smtp.gmail.com', port: 587, security: 'starttls' },
    { id: 'custom', label: t('smtpCustom'), host: '', port: 587, security: 'starttls' },
  ];

  const handleTest = () => {
    const res = onSendTestAlert();
    if (res.ok) {
      setTestFeedback({
        ok: true,
        text: t('smtpTestOk', {
          email: notifications.recipientEmail,
          host: notifications.smtpHost,
          port: notifications.smtpPort,
        }),
      });
    } else {
      setTestFeedback({
        ok: false,
        text: res.error || t('smtpTestErrFallback'),
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Row 1: SMTP Server & Email Credentials */}
      <section className="bg-surface border border-border-subtle rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Mail className="w-4 h-4 text-accent-hover" />
            <h2 className="text-sm font-semibold text-text-primary">{t('smtpTitle')}</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {smtpPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onUpdateNotifications({
                      smtpHost: preset.host,
                      smtpPort: preset.port,
                      security: preset.security,
                    });
                    setTestFeedback(null);
                  }}
                  className={`h-7 px-2.5 rounded-md border text-[11px] font-medium transition-colors whitespace-nowrap ${
                    notifications.smtpHost === preset.host && preset.host !== ''
                      ? 'bg-surface-elevated border-accent-hover text-text-primary'
                      : 'bg-canvas border-border-subtle text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={notifications.enabled}
              aria-label={t('smtpTitle')}
              onClick={() => onUpdateNotifications({ enabled: !notifications.enabled })}
              className={`w-11 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                notifications.enabled ? 'bg-ok' : 'bg-border-subtle'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                  notifications.enabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <label className="block text-[11px] text-text-secondary mb-1">{t('smtpHostLabel')}</label>
            <input
              type="text"
              value={notifications.smtpHost}
              onChange={(e) => {
                onUpdateNotifications({ smtpHost: e.target.value });
                setTestFeedback(null);
              }}
              placeholder="smtp.yandex.ru"
              className="w-full h-9 px-3 rounded-lg bg-canvas border border-border-subtle font-mono text-xs text-text-primary placeholder:text-text-muted"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] text-text-secondary mb-1">{t('portLabel')}</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={notifications.smtpPort}
              onChange={(e) =>
                onUpdateNotifications({
                  smtpPort: Math.max(1, Math.min(65535, Number(e.target.value) || 587)),
                })
              }
              className="w-full h-9 px-3 rounded-lg bg-canvas border border-border-subtle font-mono text-xs text-text-primary tabular-nums"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-[11px] text-text-secondary mb-1">{t('smtpEncryption')}</label>
            <select
              value={notifications.security}
              onChange={(e) => {
                const sec = e.target.value as SmtpSecurityMode;
                onUpdateNotifications({
                  security: sec,
                  smtpPort: sec === 'ssl' ? 465 : sec === 'starttls' ? 587 : 25,
                });
              }}
              className="w-full h-9 px-3 rounded-lg bg-canvas border border-border-subtle text-xs text-text-primary"
            >
              <option value="starttls">{t('smtpStarttls')}</option>
              <option value="ssl">{t('smtpSsl')}</option>
              <option value="none">{t('smtpNone')}</option>
            </select>
          </div>

          <div className="md:col-span-6">
            <label className="block text-[11px] text-text-secondary mb-1">{t('smtpLogin')}</label>
            <input
              type="text"
              value={notifications.smtpUsername}
              onChange={(e) => onUpdateNotifications({ smtpUsername: e.target.value })}
              placeholder="alerts@example.com"
              className="w-full h-9 px-3 rounded-lg bg-canvas border border-border-subtle font-mono text-xs text-text-primary placeholder:text-text-muted"
            />
          </div>

          <div className="md:col-span-6">
            <label className="block text-[11px] text-text-secondary mb-1">{t('smtpPassword')}</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={notifications.smtpPassword}
                onChange={(e) => onUpdateNotifications({ smtpPassword: e.target.value })}
                placeholder="••••••••••••"
                className="w-full h-9 pl-3 pr-9 rounded-lg bg-canvas border border-border-subtle font-mono text-xs text-text-primary placeholder:text-text-muted"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={t('smtpPassword')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-text-secondary hover:text-text-primary"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="md:col-span-5">
            <label className="block text-[11px] text-text-secondary mb-1">{t('smtpFrom')}</label>
            <input
              type="email"
              value={notifications.fromEmail}
              onChange={(e) => onUpdateNotifications({ fromEmail: e.target.value })}
              placeholder="defender@company.com"
              className="w-full h-9 px-3 rounded-lg bg-canvas border border-border-subtle font-mono text-xs text-text-primary placeholder:text-text-muted"
            />
          </div>

          <div className="md:col-span-5">
            <label className="block text-[11px] text-text-secondary mb-1">{t('smtpRecipient')}</label>
            <input
              type="email"
              value={notifications.recipientEmail}
              onChange={(e) => {
                onUpdateNotifications({ recipientEmail: e.target.value });
                setTestFeedback(null);
              }}
              placeholder="admin@company.com"
              className="w-full h-9 px-3 rounded-lg bg-canvas border border-border-subtle font-mono text-xs text-text-primary placeholder:text-text-muted"
            />
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="button"
              onClick={handleTest}
              className="w-full h-9 px-3 rounded-lg bg-accent hover:bg-accent-hover text-xs font-medium text-white transition-colors whitespace-nowrap flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {t('smtpTestBtn')}
            </button>
          </div>
        </div>

        {testFeedback && (
          <div
            className={`px-3 py-2 rounded-lg border text-xs flex items-center gap-2 ${
              testFeedback.ok
                ? 'bg-ok/10 border-ok/30 text-ok-text'
                : 'bg-danger/10 border-danger/30 text-danger-text'
            }`}
          >
            {testFeedback.ok ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{testFeedback.text}</span>
          </div>
        )}
      </section>

      {/* Row 2: Critical Alert Triggers */}
      <section className="bg-surface border border-border-subtle rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-accent-hover" />
            <h2 className="text-sm font-semibold text-text-primary">{t('alertTriggersTitle')}</h2>
          </div>

          <label className="flex items-center gap-2 text-xs text-text-secondary">
            {t('antispamMin')}
            <input
              type="number"
              min={0}
              max={1440}
              value={notifications.cooldownMinutes}
              onChange={(e) =>
                onUpdateNotifications({
                  cooldownMinutes: Math.max(0, Math.min(1440, Number(e.target.value) || 0)),
                })
              }
              className="w-16 h-8 px-2 rounded-md bg-canvas border border-border-subtle font-mono text-xs text-text-primary tabular-nums"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {(
            [
              { key: 'onPermanentBan', label: t('triggerPermBan') },
              { key: 'onGeoBlock', label: t('triggerGeoBlock') },
              { key: 'onBruteforceBan', label: t('triggerBruteforce') },
              { key: 'onFirewallDisabled', label: t('triggerFirewall') },
            ] as const
          ).map((item) => {
            const active = notifications.triggers[item.key];
            return (
              <div
                key={item.key}
                className="px-3.5 py-2.5 rounded-lg bg-canvas border border-border-subtle flex items-center justify-between gap-3"
              >
                <span className="text-xs text-text-primary">{item.label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  aria-label={item.label}
                  onClick={() => onUpdateTriggers({ [item.key]: !active })}
                  className={`w-10 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                    active ? 'bg-ok' : 'bg-border-subtle'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Row 3: Alert Dispatch Log */}
      <section className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-subtle flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('sentAlertsTitle', { n: alertHistory.length })}
          </h2>
          {alertHistory.length > 0 && (
            <button
              type="button"
              onClick={onClearAlertHistory}
              className="h-7 px-2.5 rounded-md border border-border-subtle hover:border-danger-text text-xs text-text-secondary hover:text-danger-text transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              {t('clearBtn')}
            </button>
          )}
        </div>

        {alertHistory.length === 0 ? (
          <div className="py-8 px-4 text-center text-xs text-text-secondary">
            {t('noAlertsYet')}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[240px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-surface border-b border-border-subtle text-[11px] font-medium text-text-secondary">
                <tr>
                  <th className="py-2 px-4">{t('colTime')}</th>
                  <th className="py-2 px-3">{t('colRecipient')}</th>
                  <th className="py-2 px-3">{t('colEventSubject')}</th>
                  <th className="py-2 px-4 text-right">{t('colStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {alertHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-elevated/60 transition-colors">
                    <td className="py-2 px-4 font-mono text-text-secondary tabular-nums whitespace-nowrap">
                      {formatDateTime(item.timestamp)}
                    </td>
                    <td className="py-2 px-3 font-mono text-text-primary whitespace-nowrap">
                      {item.recipient}
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-text-primary font-medium">{item.triggerLabel}</span>
                      <span className="text-text-muted mx-1.5">·</span>
                      <span className="text-text-secondary">{item.subject}</span>
                    </td>
                    <td className="py-2 px-4 text-right whitespace-nowrap">
                      <span className={item.status === 'sent' ? 'text-ok-text font-medium' : 'text-danger-text font-medium'}>
                        {item.status === 'sent' ? t('statusSent') : t('statusError')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
