import React, { useCallback, useEffect, useState } from 'react';
import {
  Shield,
  SlidersHorizontal,
  Globe,
  FileText,
  Bell,
  Server,
  HelpCircle,
  Lock,
  Unlock,
  Play,
  Menu,
  X,
  CheckCircle2,
  Sun,
  Moon,
} from 'lucide-react';
import type {
  AccessListType,
  AlertDispatchRecord,
  DefenderState,
  FirewallProfilesState,
  GeoPolicy,
  NavSection,
  NotificationSettings,
  ProtocolId,
  SecurityPresetId,
  ServicePolicy,
  SimulationOutcome,
  SystemControlState,
  TemporaryAllowException,
} from './types/defender';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  SECURITY_PRESETS,
  createAlertIfTriggered,
  createInitialDefenderState,
  evaluateAttemptsBatch,
} from './utils/ipsEngine';
import { COUNTRIES, resolveCountryByIp } from './utils/geoip';
import { hashPasswordSha256 } from './utils/network';
import { useI18n } from './i18n/I18nContext';
import type { TranslationKey } from './i18n/translations';
import { LanguageSelector } from './components/LanguageSelector';
import { DashboardView } from './components/DashboardView';
import { PoliciesView } from './components/PoliciesView';
import { GeoIpView } from './components/GeoIpView';
import { EventLogView } from './components/EventLogView';
import { NotificationsView } from './components/NotificationsView';
import { SystemAndInstallerView } from './components/SystemAndInstallerView';
import { HelpView } from './components/HelpView';
import { SettingsLockGate } from './components/SettingsLockGate';
import { TestAttackModal } from './components/TestAttackModal';
import { FirstRunIpModal } from './components/FirstRunIpModal';

const STORAGE_KEY = 'serverpro_defender_state_v1';
const THEME_STORAGE_KEY = 'serverpro_defender_theme_v1';
const FIRST_RUN_IP_STORAGE_KEY = 'serverpro_defender_first_run_ip_v1';

type ThemeMode = 'dark' | 'light';

function loadInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    const theme: ThemeMode = saved === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    return theme;
  } catch {
    return 'dark';
  }
}

const NAV_ITEMS: {
  id: NavSection;
  labelKey: TranslationKey;
  protectedByLock: boolean;
  icon: React.ReactNode;
}[] = [
  { id: 'protection', labelKey: 'navProtection', protectedByLock: false, icon: <Shield className="w-4 h-4" /> },
  { id: 'rules', labelKey: 'navRules', protectedByLock: true, icon: <SlidersHorizontal className="w-4 h-4" /> },
  { id: 'geoip', labelKey: 'navGeoip', protectedByLock: true, icon: <Globe className="w-4 h-4" /> },
  { id: 'events', labelKey: 'navEvents', protectedByLock: false, icon: <FileText className="w-4 h-4" /> },
  { id: 'notifications', labelKey: 'navNotifications', protectedByLock: true, icon: <Bell className="w-4 h-4" /> },
  { id: 'system', labelKey: 'navSystem', protectedByLock: true, icon: <Server className="w-4 h-4" /> },
  { id: 'help', labelKey: 'navHelp', protectedByLock: false, icon: <HelpCircle className="w-4 h-4" /> },
];

function loadInitialState(): DefenderState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialDefenderState();
    const parsed = JSON.parse(raw) as Partial<DefenderState>;
    if (!parsed || !parsed.policies || !parsed.system || !parsed.geoPolicy) {
      return createInitialDefenderState();
    }
    const initialDefaults = createInitialDefenderState();
    const savedEvents = Array.isArray(parsed.events) ? parsed.events : initialDefaults.events;
    const hasSuccessEvents = savedEvents.some(
      (ev) => ev.authStatus === 'success' || ev.verdict === 'allowed'
    );
    const mergedEvents = hasSuccessEvents
      ? savedEvents
      : [
          ...initialDefaults.events.filter((ev) => ev.authStatus === 'success'),
          ...savedEvents,
        ].sort((a, b) => b.timestamp - a.timestamp);

    return {
      ...(parsed as DefenderState),
      events: mergedEvents,
      whitelistOnly: parsed.whitelistOnly ?? false,
      escalation: {
        ...(parsed.escalation || initialDefaults.escalation),
        enabled: parsed.escalation?.enabled ?? true,
      },
      notifications: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...(parsed.notifications || {}),
        triggers: {
          ...DEFAULT_NOTIFICATION_SETTINGS.triggers,
          ...(parsed.notifications?.triggers || {}),
        },
      },
      alertHistory: Array.isArray(parsed.alertHistory) ? parsed.alertHistory : [],
      tempAllows: Array.isArray(parsed.tempAllows) ? parsed.tempAllows : [],
    };
  } catch {
    return createInitialDefenderState();
  }
}

export default function App() {
  const { t, formatDuration, formatCountry } = useI18n();
  const [state, setState] = useState<DefenderState>(loadInitialState);
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
  const [activeNav, setActiveNav] = useState<NavSection>('protection');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSettingsUnlocked, setIsSettingsUnlocked] = useState<boolean>(
    () => !loadInitialState().system.settingsLockEnabled
  );
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [firstRunIpModalOpen, setFirstRunIpModalOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(FIRST_RUN_IP_STORAGE_KEY) !== 'done';
    } catch {
      return true;
    }
  });
  const [now, setNow] = useState<number>(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const notify = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota errors
    }
  }, [state]);

  useEffect(() => {
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      setState((prev) => {
        const hasExpiredBans = prev.activeBans.some(
          (b) => b.expiresAt !== null && b.expiresAt <= current
        );
        const hasExpiredAllows = (prev.tempAllows || []).some(
          (t) => t.expiresAt <= current
        );
        if (!hasExpiredBans && !hasExpiredAllows) return prev;
        return {
          ...prev,
          activeBans: hasExpiredBans
            ? prev.activeBans.filter((b) => b.expiresAt === null || b.expiresAt > current)
            : prev.activeBans,
          tempAllows: hasExpiredAllows
            ? (prev.tempAllows || []).filter((t) => t.expiresAt > current)
            : prev.tempAllows,
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const isLocked = state.system.settingsLockEnabled && !isSettingsUnlocked;

  const guardAction = useCallback(
    (action: () => void) => {
      if (state.system.settingsLockEnabled && !isSettingsUnlocked) {
        setPendingAction(() => action);
        setUnlockModalOpen(true);
        return;
      }
      action();
    },
    [state.system.settingsLockEnabled, isSettingsUnlocked]
  );

  const handleUnlock = useCallback(
    async (password: string): Promise<boolean> => {
      const hashed = await hashPasswordSha256(password);
      if (hashed !== state.system.passwordHash) {
        return false;
      }
      setIsSettingsUnlocked(true);
      setUnlockModalOpen(false);
      notify(t('toastUnlocked'));
      if (pendingAction) {
        const fn = pendingAction;
        setPendingAction(null);
        fn();
      }
      return true;
    },
    [state.system.passwordHash, pendingAction, notify, t]
  );

  const handleLockNow = useCallback(() => {
    setIsSettingsUnlocked(false);
    setActiveNav('protection');
    notify(t('toastLocked'));
  }, [notify, t]);

  const handleToggleProtocol = useCallback(
    (protocol: ProtocolId) => {
      guardAction(() => {
        setState((prev) => ({
          ...prev,
          policies: {
            ...prev.policies,
            [protocol]: { ...prev.policies[protocol], enabled: !prev.policies[protocol].enabled },
          },
        }));
        notify(t('toastProtoUpdated', { protocol }));
      });
    },
    [guardAction, notify, t]
  );

  const handleEnableAllProtection = useCallback(() => {
    guardAction(() => {
      setState((prev) => ({
        ...prev,
        policies: {
          RDP: { ...prev.policies.RDP, enabled: true },
          FTP: { ...prev.policies.FTP, enabled: true },
          SMB: { ...prev.policies.SMB, enabled: true },
        },
        system: {
          ...prev.system,
          serviceStatus: 'running',
          lastServiceChangeAt: Date.now(),
          firewallProfiles: { domain: true, private: true, public: true },
        },
      }));
      notify(t('toastFullProtection'));
    });
  }, [guardAction, notify, t]);

  const handleApplyPreset = useCallback(
    (presetId: Exclude<SecurityPresetId, 'custom'>) => {
      const preset = SECURITY_PRESETS[presetId];
      setState((prev) => ({
        ...prev,
        activePreset: presetId,
        policies: {
          RDP: {
            ...prev.policies.RDP,
            maxAttempts: preset.maxAttempts.RDP,
            windowMinutes: preset.windowMinutes.RDP,
          },
          FTP: {
            ...prev.policies.FTP,
            maxAttempts: preset.maxAttempts.FTP,
            windowMinutes: preset.windowMinutes.FTP,
          },
          SMB: {
            ...prev.policies.SMB,
            maxAttempts: preset.maxAttempts.SMB,
            windowMinutes: preset.windowMinutes.SMB,
          },
        },
        escalation: {
          enabled: true,
          stages: preset.stages.map((s) => ({ ...s })),
          resetAfterDays: preset.resetAfterDays,
        },
      }));
      const presetTitleKey: Record<Exclude<SecurityPresetId, 'custom'>, TranslationKey> = {
        standard: 'presetStandard',
        strict: 'presetStrict',
        office: 'presetOffice',
      };
      notify(t('toastPresetApplied', { title: t(presetTitleKey[presetId]) }));
    },
    [notify, t]
  );

  const handleUpdatePolicy = useCallback((protocol: ProtocolId, patch: Partial<ServicePolicy>) => {
    setState((prev) => ({
      ...prev,
      activePreset: 'custom',
      policies: {
        ...prev.policies,
        [protocol]: { ...prev.policies[protocol], ...patch },
      },
    }));
  }, []);

  const handleToggleProgressiveBan = useCallback(() => {
    setState((prev) => {
      const nextEnabled = !(prev.escalation.enabled ?? true);
      return {
        ...prev,
        activePreset: 'custom',
        escalation: {
          ...prev.escalation,
          enabled: nextEnabled,
        },
      };
    });
    notify(state.escalation.enabled === false ? t('toastProgOn') : t('toastProgOff'));
  }, [state.escalation.enabled, notify, t]);

  const handleToggleWhitelistOnly = useCallback(() => {
    guardAction(() => {
      const nextValue = !state.whitelistOnly;
      setState((prev) => ({
        ...prev,
        whitelistOnly: !prev.whitelistOnly,
      }));
      notify(nextValue ? t('toastWhitelistOnlyOn') : t('toastWhitelistOnlyOff'));
    });
  }, [guardAction, state.whitelistOnly, notify, t]);

  const handleUpdateEscalationStage = useCallback((level: number, durationMinutes: number | null) => {
    setState((prev) => ({
      ...prev,
      activePreset: 'custom',
      escalation: {
        ...prev.escalation,
        stages: prev.escalation.stages.map((s) =>
          s.level === level ? { ...s, durationMinutes } : s
        ),
      },
    }));
  }, []);

  const handleUpdateResetDays = useCallback((days: number) => {
    setState((prev) => ({
      ...prev,
      activePreset: 'custom',
      escalation: { ...prev.escalation, resetAfterDays: days },
    }));
  }, []);

  const handleAddAccessEntry = useCallback(
    (type: AccessListType, value: string, comment: string) => {
      const currentTs = Date.now();
      setState((prev) => {
        const alreadyExists = prev.accessList.some(
          (e) => e.type === type && e.value === value
        );
        const entry = {
          id: `${type}-${currentTs}`,
          type,
          value,
          comment,
          createdAt: currentTs,
        };

        let nextBans = prev.activeBans;
        if (type === 'whitelist') {
          nextBans = prev.activeBans.filter((b) => b.ip !== value);
        } else if (!value.includes('/')) {
          const country = resolveCountryByIp(value);
          const ruleName = `ServerProDefender_Blacklist_${value}`;
          const newBan = {
            id: `ban-${currentTs}`,
            ip: value,
            countryCode: country.code,
            countryName: country.nameRu,
            protocol: 'ALL' as const,
            reason: 'blacklist' as const,
            reasonLabel: `Черный список (${comment})`,
            escalationLevel: 4,
            isPermanent: true,
            attemptsCount: 0,
            bannedAt: currentTs,
            expiresAt: null,
            firewallRuleName: ruleName,
          };
          nextBans = [newBan, ...prev.activeBans.filter((b) => b.ip !== value)];
        }

        return {
          ...prev,
          accessList: alreadyExists ? prev.accessList : [entry, ...prev.accessList],
          activeBans: nextBans,
        };
      });
      notify(type === 'whitelist' ? t('toastAddedWl', { val: value }) : t('toastAddedBl', { val: value }));
    },
    [notify, t]
  );

  const markFirstRunIpDone = useCallback(() => {
    setFirstRunIpModalOpen(false);
    try {
      localStorage.setItem(FIRST_RUN_IP_STORAGE_KEY, 'done');
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleAcceptFirstRunIp = useCallback(
    (ip: string, comment: string) => {
      handleAddAccessEntry('whitelist', ip, comment);
      markFirstRunIpDone();
    },
    [handleAddAccessEntry, markFirstRunIpDone]
  );

  const handleDismissFirstRunIp = useCallback(() => {
    markFirstRunIpDone();
  }, [markFirstRunIpDone]);

  const handleRemoveAccessEntry = useCallback(
    (id: string) => {
      setState((prev) => ({
        ...prev,
        accessList: prev.accessList.filter((e) => e.id !== id),
      }));
      notify(t('toastEntryRemoved'));
    },
    [notify, t]
  );

  const handleUnbanIp = useCallback(
    (banId: string) => {
      guardAction(() => {
        setState((prev) => ({
          ...prev,
          activeBans: prev.activeBans.filter((b) => b.id !== banId),
        }));
        notify(t('toastUnbanned'));
      });
    },
    [guardAction, notify, t]
  );

  const handleMakeBanPermanent = useCallback(
    (banId: string) => {
      guardAction(() => {
        setState((prev) => {
          const target = prev.activeBans.find((b) => b.id === banId);
          const alert = target
            ? createAlertIfTriggered(prev, 'permanent_ban', {
                subject: `Постоянный бан ${target.ip}`,
                triggerLabel: 'Постоянный бан',
                ip: target.ip,
                detail: `Адрес ${target.ip} переведен в постоянную блокировку`,
              })
            : null;
          return {
            ...prev,
            activeBans: prev.activeBans.map((b) =>
              b.id === banId
                ? {
                    ...b,
                    isPermanent: true,
                    expiresAt: null,
                    escalationLevel: 4,
                    reasonLabel: `${b.reasonLabel} · ${t('forever')}`,
                  }
                : b
            ),
            alertHistory: alert ? [alert, ...prev.alertHistory].slice(0, 100) : prev.alertHistory,
          };
        });
        notify(t('toastMadePerm'));
      });
    },
    [guardAction, notify, t]
  );

  const handleMoveBanToWhitelist = useCallback(
    (banId: string) => {
      guardAction(() => {
        setState((prev) => {
          const ban = prev.activeBans.find((b) => b.id === banId);
          if (!ban) return prev;
          const alreadyWhitelisted = prev.accessList.some(
            (e) => e.type === 'whitelist' && e.value === ban.ip
          );
          const nextAccess = alreadyWhitelisted
            ? prev.accessList
            : [
                {
                  id: `wl-${Date.now()}`,
                  type: 'whitelist' as const,
                  value: ban.ip,
                  comment: t('defaultWlComment'),
                  createdAt: Date.now(),
                },
                ...prev.accessList,
              ];
          return {
            ...prev,
            accessList: nextAccess,
            activeBans: prev.activeBans.filter((b) => b.id !== banId),
          };
        });
        notify(t('toastMovedWl'));
      });
    },
    [guardAction, notify, t]
  );

  const handleUpdateGeoPolicy = useCallback((patch: Partial<GeoPolicy>) => {
    setState((prev) => ({
      ...prev,
      geoPolicy: { ...prev.geoPolicy, ...patch },
    }));
  }, []);

  const handleAddTempAllow = useCallback(
    (params: {
      targetType: 'ip' | 'country';
      value: string;
      durationMinutes: number;
      reason?: string;
    }) => {
      guardAction(() => {
        const nowTs = Date.now();
        const mins = Math.max(1, Math.min(43200, Math.round(params.durationMinutes)));
        const expiresAt = nowTs + mins * 60_000;
        const country =
          params.targetType === 'country'
            ? COUNTRIES.find((c) => c.code === params.value)
            : null;
        const label =
          params.targetType === 'country'
            ? country
              ? `${country.nameRu} (${country.code})`
              : params.value
            : params.value;

        const entry: TemporaryAllowException = {
          id: `temp-${params.targetType}-${params.value}-${nowTs}`,
          targetType: params.targetType,
          value: params.value,
          label,
          createdAt: nowTs,
          expiresAt,
          reason: params.reason,
        };

        setState((prev) => {
          const filteredAllows = (prev.tempAllows || []).filter(
            (t) => !(t.targetType === params.targetType && t.value === params.value)
          );
          const nextBans =
            params.targetType === 'ip'
              ? prev.activeBans.filter((b) => b.ip !== params.value)
              : prev.activeBans.filter(
                  (b) => !(b.reason === 'geoip' && b.countryCode === params.value)
                );
          return {
            ...prev,
            tempAllows: [entry, ...filteredAllows],
            activeBans: nextBans,
          };
        });

        const displayLabel =
          params.targetType === 'country'
            ? `${formatCountry(params.value, country?.nameRu || params.value)} (${params.value})`
            : params.value;

        notify(
          params.targetType === 'ip'
            ? t('toastTempIp', { label: displayLabel, dur: formatDuration(mins) })
            : t('toastTempCountry', { label: displayLabel, dur: formatDuration(mins) })
        );
      });
    },
    [guardAction, notify, t, formatDuration, formatCountry]
  );

  const handleRemoveTempAllow = useCallback(
    (id: string) => {
      guardAction(() => {
        setState((prev) => ({
          ...prev,
          tempAllows: (prev.tempAllows || []).filter((t) => t.id !== id),
        }));
        notify(t('toastTempRemoved'));
      });
    },
    [guardAction, notify, t]
  );

  const handleUpdateSystem = useCallback(
    (patch: Partial<SystemControlState>) => {
      setState((prev) => {
        const alert =
          patch.serviceStatus === 'stopped' && prev.system.serviceStatus !== 'stopped'
            ? createAlertIfTriggered(prev, 'firewall_disabled', {
                subject: `Остановлена служба ${prev.system.serviceName}`,
                triggerLabel: 'Остановка службы',
                detail: 'Фоновая служба защиты Windows остановлена',
              })
            : null;
        return {
          ...prev,
          system: { ...prev.system, ...patch },
          alertHistory: alert ? [alert, ...prev.alertHistory].slice(0, 100) : prev.alertHistory,
        };
      });
      if (patch.serviceStatus === 'running') notify(t('toastServiceStarted'));
      if (patch.serviceStatus === 'stopped') notify(t('toastServiceStopped'));
      if (patch.settingsLockEnabled === true) {
        setIsSettingsUnlocked(true);
        notify(t('toastPwdOn'));
      }
      if (patch.settingsLockEnabled === false) {
        setIsSettingsUnlocked(true);
        notify(t('toastPwdOff'));
      }
    },
    [notify, t]
  );

  const handleToggleFirewallProfile = useCallback(
    (profile: keyof FirewallProfilesState) => {
      setState((prev) => ({
        ...prev,
        system: {
          ...prev.system,
          firewallProfiles: {
            ...prev.system.firewallProfiles,
            [profile]: !prev.system.firewallProfiles[profile],
          },
        },
      }));
      notify(t('toastFwUpdated'));
    },
    [notify, t]
  );

  const handleToggleAllFirewalls = useCallback(
    (enabled: boolean) => {
      setState((prev) => {
        const alert = !enabled
          ? createAlertIfTriggered(prev, 'firewall_disabled', {
              subject: 'Отключен брандмауэр Windows',
              triggerLabel: 'Отключение брандмауэра',
              detail: 'Все профили брандмауэра Windows отключены',
            })
          : null;
        return {
          ...prev,
          system: {
            ...prev.system,
            firewallProfiles: { domain: enabled, private: enabled, public: enabled },
          },
          alertHistory: alert ? [alert, ...prev.alertHistory].slice(0, 100) : prev.alertHistory,
        };
      });
      notify(enabled ? t('toastFwOn') : t('toastFwOff'));
    },
    [notify, t]
  );

  const handleChangePassword = useCallback(
    async (newPassword: string) => {
      const hash = await hashPasswordSha256(newPassword);
      setState((prev) => ({
        ...prev,
        system: {
          ...prev.system,
          passwordHash: hash,
          isDefaultPassword: false,
          settingsLockEnabled: true,
        },
      }));
      setIsSettingsUnlocked(true);
      notify(t('toastPwdSaved'));
    },
    [notify, t]
  );

  const handleUpdateNotifications = useCallback((patch: Partial<NotificationSettings>) => {
    setState((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, ...patch },
    }));
  }, []);

  const handleUpdateNotificationTriggers = useCallback(
    (patch: Partial<NotificationSettings['triggers']>) => {
      setState((prev) => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          triggers: { ...prev.notifications.triggers, ...patch },
        },
      }));
    },
    []
  );

  const handleSendTestAlert = useCallback((): { ok: boolean; error?: string } => {
    const n = state.notifications;
    if (!n.smtpHost.trim()) {
      return { ok: false, error: t('smtpErrNoHost') };
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(n.recipientEmail.trim())) {
      return { ok: false, error: t('smtpErrBadEmail') };
    }
    const nowTs = Date.now();
    const record: AlertDispatchRecord = {
      id: `alert-test-${nowTs}`,
      timestamp: nowTs,
      recipient: n.recipientEmail.trim(),
      subject: 'ServerPro Defender Test Alert',
      triggerLabel: 'SMTP',
      status: 'sent',
      detail: `SMTP ${n.smtpHost.trim()}:${n.smtpPort} (${n.security.toUpperCase()})`,
    };
    setState((prev) => ({
      ...prev,
      alertHistory: [record, ...prev.alertHistory].slice(0, 100),
    }));
    notify(t('toastTestSent', { email: record.recipient }));
    return { ok: true };
  }, [state.notifications, notify, t]);

  const handleClearAlertHistory = useCallback(() => {
    setState((prev) => ({
      ...prev,
      alertHistory: [],
    }));
    notify(t('toastAlertHistoryCleared'));
  }, [notify, t]);

  const handleRunSimulation = useCallback(
    (params: {
      ip: string;
      protocol: ProtocolId;
      username: string;
      attempts: number;
      explicitCountryCode?: string;
    }): SimulationOutcome => {
      const { nextState, outcome } = evaluateAttemptsBatch(state, params);
      setState(nextState);
      if (outcome.dispatchedAlert) {
        notify(t('toastAlertDispatched', { email: outcome.dispatchedAlert.recipient }));
      }
      return outcome;
    },
    [state, notify, t]
  );

  const currentNavMeta = NAV_ITEMS.find((item) => item.id === activeNav) || NAV_ITEMS[0];
  const currentSectionLocked = currentNavMeta.protectedByLock && isLocked;

  return (
    <div className="h-screen overflow-hidden bg-canvas text-text-primary flex">
      {/* Compact Desktop Sidebar (224px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-56 shrink-0 bg-sidebar border-r border-border-subtle">
        <div className="h-12 px-4 flex items-center gap-2 border-b border-border-subtle shrink-0">
          <Shield className="w-4 h-4 text-accent-hover shrink-0" />
          <span className="text-sm font-bold tracking-tight text-text-primary whitespace-nowrap">
            ServerPro Defender
          </span>
        </div>

        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto" aria-label={t('navAriaLabel')}>
          {NAV_ITEMS.map((item) => {
            const active = activeNav === item.id;
            const lockedItem = item.protectedByLock && isLocked;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`w-full h-9 px-3 rounded-lg text-xs font-medium transition-colors flex items-center justify-between gap-2 whitespace-nowrap ${
                  active
                    ? 'bg-surface-elevated text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className={active ? 'text-accent-hover' : 'text-text-muted'}>{item.icon}</span>
                  <span className="truncate">{t(item.labelKey)}</span>
                </span>
                {lockedItem && <Lock className="w-3 h-3 text-text-muted shrink-0" />}
              </button>
            );
          })}
        </nav>

        <div className="px-3 pb-2.5 shrink-0">
          <LanguageSelector />
        </div>

        <div className="p-3 border-t border-border-subtle shrink-0 space-y-2">
          <div
            role="group"
            aria-label={t('themeLabel')}
            className="grid grid-cols-2 gap-0.5 p-0.5 bg-canvas border border-border-subtle rounded-lg"
          >
            <button
              type="button"
              onClick={() => setTheme('light')}
              aria-pressed={theme === 'light'}
              className={`h-7 px-2 rounded-md text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${
                theme === 'light'
                  ? 'bg-surface text-text-primary border border-border-subtle shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Sun className="w-3.5 h-3.5 shrink-0" />
              {t('themeLight')}
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              aria-pressed={theme === 'dark'}
              className={`h-7 px-2 rounded-md text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${
                theme === 'dark'
                  ? 'bg-surface-elevated text-text-primary border border-border-strong/70'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Moon className="w-3.5 h-3.5 shrink-0" />
              {t('themeDark')}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setTestModalOpen(true)}
            className="w-full h-8 px-2.5 rounded-lg bg-accent hover:bg-accent-hover text-xs font-medium text-white transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Play className="w-3 h-3 shrink-0" />
            {t('checkProtection')}
          </button>

          {state.system.settingsLockEnabled ? (
            <button
              type="button"
              onClick={() => (isLocked ? setUnlockModalOpen(true) : handleLockNow())}
              className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border-subtle hover:border-accent-hover text-xs font-medium text-text-primary transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              {isLocked ? (
                <>
                  <Lock className="w-3 h-3 text-warn-text shrink-0" />
                  {t('unlockSettings')}
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3 text-ok-text shrink-0" />
                  {t('lockSettings')}
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveNav('system')}
              className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border-subtle hover:border-border-strong text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Lock className="w-3 h-3 shrink-0" />
              {t('settingsPassword')}
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-black/70" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-56 max-w-[80vw] bg-sidebar border-r border-border-subtle flex flex-col z-50">
            <div className="h-12 px-4 flex items-center justify-between border-b border-border-subtle">
              <span className="text-sm font-bold text-text-primary whitespace-nowrap">
                ServerPro Defender
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label={t('menuClose')}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-2.5 space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveNav(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full h-9 px-3 rounded-lg text-xs font-medium flex items-center justify-between gap-2 ${
                      active ? 'bg-surface-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      {item.icon}
                      {t(item.labelKey)}
                    </span>
                    {item.protectedByLock && isLocked && <Lock className="w-3 h-3 text-text-muted" />}
                  </button>
                );
              })}
            </nav>

            <div className="px-3 pb-2.5 shrink-0">
              <LanguageSelector />
            </div>

            <div className="p-3 border-t border-border-subtle shrink-0 space-y-2">
              <div
                role="group"
                aria-label={t('themeLabel')}
                className="grid grid-cols-2 gap-0.5 p-0.5 bg-canvas border border-border-subtle rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  aria-pressed={theme === 'light'}
                  className={`h-7 px-2 rounded-md text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    theme === 'light'
                      ? 'bg-surface text-text-primary border border-border-subtle shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5 shrink-0" />
                  {t('themeLight')}
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  aria-pressed={theme === 'dark'}
                  className={`h-7 px-2 rounded-md text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    theme === 'dark'
                      ? 'bg-surface-elevated text-text-primary border border-border-strong/70'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5 shrink-0" />
                  {t('themeDark')}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setTestModalOpen(true);
                }}
                className="w-full h-8 px-2.5 rounded-lg bg-accent hover:bg-accent-hover text-xs font-medium text-white transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Play className="w-3 h-3 shrink-0" />
                {t('checkProtection')}
              </button>

              {state.system.settingsLockEnabled ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (isLocked) setUnlockModalOpen(true);
                    else handleLockNow();
                  }}
                  className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border-subtle hover:border-accent-hover text-xs font-medium text-text-primary transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  {isLocked ? (
                    <>
                      <Lock className="w-3 h-3 text-warn-text shrink-0" />
                      {t('unlockSettings')}
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3 h-3 text-ok-text shrink-0" />
                      {t('lockSettings')}
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setActiveNav('system');
                  }}
                  className="w-full h-8 px-2.5 rounded-lg bg-surface border border-border-subtle hover:border-border-strong text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Lock className="w-3 h-3 shrink-0" />
                  {t('settingsPassword')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Windowed Main Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Compact Top Bar (48px) */}
        <header className="h-12 shrink-0 bg-canvas border-b border-border-subtle px-4 sm:px-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label={t('menuOpen')}
              className="lg:hidden w-8 h-8 rounded-lg border border-border-subtle flex items-center justify-center text-text-primary shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 text-xs min-w-0">
              <span className="hidden sm:inline text-text-muted whitespace-nowrap">ServerPro Defender</span>
              <span className="hidden sm:inline text-text-muted" aria-hidden="true">/</span>
              <span className="font-semibold text-text-primary truncate">{t(currentNavMeta.labelKey)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {state.system.settingsLockEnabled && (
              <button
                type="button"
                onClick={() => (isLocked ? setUnlockModalOpen(true) : handleLockNow())}
                className="h-8 px-3 rounded-lg border border-border-subtle hover:border-accent-hover text-xs font-medium text-text-primary transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
              >
                {isLocked ? (
                  <>
                    <Lock className="w-3 h-3 text-warn-text" />
                    {t('unlockSettingsShort')}
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3 text-ok-text" />
                    {t('lockSettings')}
                  </>
                )}
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Window Viewport */}
        <main className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          <div
            className={`w-full px-4 sm:px-5 py-3 ${
              !currentSectionLocked && activeNav === 'protection'
                ? 'flex-1 min-h-0 flex flex-col'
                : ''
            }`}
          >
            {currentSectionLocked ? (
              <SettingsLockGate
                isDefaultPassword={state.system.isDefaultPassword}
                onUnlock={handleUnlock}
                onCancel={() => setActiveNav('protection')}
              />
            ) : (
              <>
                {activeNav === 'protection' && (
                  <DashboardView
                    state={state}
                    now={now}
                    onToggleProtocol={handleToggleProtocol}
                    onEnableAllProtection={handleEnableAllProtection}
                    onUnbanIp={handleUnbanIp}
                    onMakeBanPermanent={handleMakeBanPermanent}
                    onMoveBanToWhitelist={handleMoveBanToWhitelist}
                    onAddTempAllow={handleAddTempAllow}
                    onNavigate={setActiveNav}
                  />
                )}

                {activeNav === 'rules' && (
                  <PoliciesView
                    state={state}
                    now={now}
                    onApplyPreset={handleApplyPreset}
                    onUpdatePolicy={handleUpdatePolicy}
                    onToggleProgressiveBan={handleToggleProgressiveBan}
                    onToggleWhitelistOnly={handleToggleWhitelistOnly}
                    onUpdateEscalationStage={handleUpdateEscalationStage}
                    onUpdateResetDays={handleUpdateResetDays}
                    onAddAccessEntry={handleAddAccessEntry}
                    onRemoveAccessEntry={handleRemoveAccessEntry}
                    onAddTempAllow={handleAddTempAllow}
                    onRemoveTempAllow={handleRemoveTempAllow}
                  />
                )}

                {activeNav === 'geoip' && (
                  <GeoIpView
                    state={state}
                    now={now}
                    onUpdateGeoPolicy={handleUpdateGeoPolicy}
                  />
                )}

                {activeNav === 'events' && <EventLogView state={state} />}

                {activeNav === 'notifications' && (
                  <NotificationsView
                    state={state}
                    onUpdateNotifications={handleUpdateNotifications}
                    onUpdateTriggers={handleUpdateNotificationTriggers}
                    onSendTestAlert={handleSendTestAlert}
                    onClearAlertHistory={handleClearAlertHistory}
                  />
                )}

                {activeNav === 'system' && (
                  <SystemAndInstallerView
                    state={state}
                    onUpdateSystem={handleUpdateSystem}
                    onToggleFirewallProfile={handleToggleFirewallProfile}
                    onToggleAllFirewalls={handleToggleAllFirewalls}
                    onToggleWhitelistOnly={handleToggleWhitelistOnly}
                    onChangePassword={handleChangePassword}
                    onLockSettingsNow={handleLockNow}
                    onNotify={notify}
                  />
                )}

                {activeNav === 'help' && <HelpView />}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Test Attack Modal */}
      {testModalOpen && (
        <TestAttackModal
          onClose={() => setTestModalOpen(false)}
          onRunSimulation={handleRunSimulation}
        />
      )}

      {/* Unlock Settings Modal */}
      {unlockModalOpen && (
        <SettingsLockGate
          isModal
          isDefaultPassword={state.system.isDefaultPassword}
          onUnlock={handleUnlock}
          onCancel={() => {
            setUnlockModalOpen(false);
            setPendingAction(null);
          }}
        />
      )}

      {/* First-Run External IP Whitelist Recommendation Modal */}
      {firstRunIpModalOpen && (
        <FirstRunIpModal
          accessList={state.accessList}
          onAccept={handleAcceptFirstRunIp}
          onDismiss={handleDismissFirstRunIp}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 bg-surface-elevated border border-border-strong text-text-primary px-3.5 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2 shadow-lg max-w-xs"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-ok-text shrink-0" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
