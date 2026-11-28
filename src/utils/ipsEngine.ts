import type {
  ActiveBan,
  AlertDispatchRecord,
  AuthAttemptEvent,
  DefenderState,
  EscalationStage,
  EvaluationStep,
  NotificationSettings,
  ProtocolId,
  SecurityPresetId,
  SimulationOutcome,
} from '../types/defender';
import { resolveCountryByIp } from './geoip';
import {
  formatCountdown,
  formatDurationRu,
  hashPasswordSync,
  ipMatchesCidr,
  isPrivateOrLoopbackIp,
} from './network';

export const DEFAULT_ADMIN_PASSWORD = 'admin';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  smtpHost: '',
  smtpPort: 587,
  security: 'starttls',
  smtpUsername: '',
  smtpPassword: '',
  fromEmail: '',
  recipientEmail: '',
  triggers: {
    onPermanentBan: true,
    onGeoBlock: true,
    onBruteforceBan: false,
    onFirewallDisabled: true,
  },
  cooldownMinutes: 5,
};

export function createAlertIfTriggered(
  state: DefenderState,
  triggerType: 'permanent_ban' | 'geo_block' | 'bruteforce_ban' | 'firewall_disabled',
  info: { subject: string; triggerLabel: string; ip?: string; detail: string }
): AlertDispatchRecord | null {
  const n = state.notifications;
  if (!n || !n.enabled) return null;
  if (!n.smtpHost.trim() || !n.recipientEmail.trim()) return null;

  const shouldSend =
    (triggerType === 'permanent_ban' && n.triggers.onPermanentBan) ||
    (triggerType === 'geo_block' && n.triggers.onGeoBlock) ||
    (triggerType === 'bruteforce_ban' && n.triggers.onBruteforceBan) ||
    (triggerType === 'firewall_disabled' && n.triggers.onFirewallDisabled);

  if (!shouldSend) return null;

  const now = Date.now();
  const cooldownMs = Math.max(0, n.cooldownMinutes) * 60_000;
  if (cooldownMs > 0 && info.ip) {
    const recentSameIp = state.alertHistory.find(
      (a) => a.ip === info.ip && now - a.timestamp < cooldownMs
    );
    if (recentSameIp) return null;
  }

  return {
    id: `alert-${now}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    recipient: n.recipientEmail.trim(),
    subject: info.subject,
    triggerLabel: info.triggerLabel,
    ip: info.ip,
    status: 'sent',
    detail: `SMTP ${n.smtpHost}:${n.smtpPort} (${n.security.toUpperCase()}) · ${info.detail}`,
  };
}

export const SECURITY_PRESETS: Record<
  Exclude<SecurityPresetId, 'custom'>,
  {
    id: Exclude<SecurityPresetId, 'custom'>;
    title: string;
    subtitle: string;
    maxAttempts: Record<ProtocolId, number>;
    windowMinutes: Record<ProtocolId, number>;
    stages: EscalationStage[];
    resetAfterDays: number;
  }
> = {
  standard: {
    id: 'standard',
    title: 'Стандартная (Рекомендуется)',
    subtitle: 'Оптимальный баланс: 5 ошибок за 10 мин и плавный рост времени блокировки.',
    maxAttempts: { RDP: 5, FTP: 5, SMB: 5 },
    windowMinutes: { RDP: 10, FTP: 10, SMB: 10 },
    stages: [
      { level: 1, durationMinutes: 15, label: '1-я блокировка' },
      { level: 2, durationMinutes: 60, label: '2-я блокировка' },
      { level: 3, durationMinutes: 1440, label: '3-я блокировка' },
      { level: 4, durationMinutes: null, label: '4-я и далее' },
    ],
    resetAfterDays: 7,
  },
  strict: {
    id: 'strict',
    title: 'Строгая (Открытый сервер)',
    subtitle: 'Для VDS и ПК с прямым выходом в интернет: 3 ошибки и жесткий бан.',
    maxAttempts: { RDP: 3, FTP: 3, SMB: 3 },
    windowMinutes: { RDP: 15, FTP: 15, SMB: 15 },
    stages: [
      { level: 1, durationMinutes: 60, label: '1-я блокировка' },
      { level: 2, durationMinutes: 1440, label: '2-я блокировка' },
      { level: 3, durationMinutes: null, label: '3-я блокировка' },
      { level: 4, durationMinutes: null, label: '4-я и далее' },
    ],
    resetAfterDays: 30,
  },
  office: {
    id: 'office',
    title: 'Мягкая (Офис / Домашняя сеть)',
    subtitle: 'Прощает случайные опечатки сотрудников: до 10 попыток за 10 минут.',
    maxAttempts: { RDP: 10, FTP: 10, SMB: 8 },
    windowMinutes: { RDP: 10, FTP: 10, SMB: 10 },
    stages: [
      { level: 1, durationMinutes: 5, label: '1-я блокировка' },
      { level: 2, durationMinutes: 30, label: '2-я блокировка' },
      { level: 3, durationMinutes: 120, label: '3-я блокировка' },
      { level: 4, durationMinutes: 1440, label: '4-я и далее' },
    ],
    resetAfterDays: 3,
  },
};

export const WHITELIST_ONLY_RULE_NAME = 'ServerProDefender_WhitelistOnly_Block';

export function buildWhitelistOnlyFirewallCommand(enabled: boolean, ports: number[] = [3389, 21, 445]): string {
  const portList = ports.length > 0 ? ports.join(',') : '3389,21,445';
  if (enabled) {
    return `netsh advfirewall firewall set rule name="${WHITELIST_ONLY_RULE_NAME}" new localport=${portList} enable=yes`;
  }
  return `netsh advfirewall firewall set rule name="${WHITELIST_ONLY_RULE_NAME}" new enable=no`;
}

export function buildNetshBlockCommand(ip: string, port: number | 'ALL', ruleName: string): string {
  if (port === 'ALL') {
    return `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=block remoteip=${ip} enable=yes`;
  }
  return `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=block protocol=TCP localport=${port} remoteip=${ip} enable=yes`;
}

export function buildNetshUnblockCommand(ruleName: string): string {
  return `netsh advfirewall firewall delete rule name="${ruleName}"`;
}

export function createInitialDefenderState(): DefenderState {
  const now = Date.now();
  const min = 60_000;
  const hour = 3_600_000;

  return {
    activePreset: 'standard',
    policies: {
      RDP: {
        protocol: 'RDP',
        titleRu: 'Удаленный рабочий стол',
        shortDescRu: 'Подключения к рабочему столу Windows из сети и интернета',
        enabled: true,
        port: 3389,
        maxAttempts: 5,
        windowMinutes: 10,
        logSource: 'Журнал безопасности Windows (Security)',
        eventIdLabel: 'Event ID 4625 · Logon Type 10 / 3',
      },
      FTP: {
        protocol: 'FTP',
        titleRu: 'Файловый сервер FTP',
        shortDescRu: 'Обмен файлами через IIS FTP или FileZilla Server',
        enabled: true,
        port: 21,
        maxAttempts: 5,
        windowMinutes: 10,
        logSource: 'Журнал IIS FTP / FileZilla Server',
        eventIdLabel: 'FTP 530 Login Incorrect',
      },
      SMB: {
        protocol: 'SMB',
        titleRu: 'Общие папки Windows',
        shortDescRu: 'Доступ к сетевым дискам и общим ресурсам Windows',
        enabled: true,
        port: 445,
        maxAttempts: 5,
        windowMinutes: 10,
        logSource: 'Журнал безопасности Windows (Security)',
        eventIdLabel: 'Event ID 4625 · Logon Type 3',
      },
    },
    escalation: {
      enabled: true,
      stages: SECURITY_PRESETS.standard.stages.map((s) => ({ ...s })),
      resetAfterDays: 7,
    },
    geoPolicy: {
      mode: 'blacklist',
      selectedCountries: ['CN', 'NL', 'BR', 'VN', 'KP'],
      protocols: ['RDP', 'FTP', 'SMB'],
      action: 'block',
      bypassPrivateNetworks: true,
    },
    whitelistOnly: false,
    accessList: [
      {
        id: 'wl-loopback',
        type: 'whitelist',
        value: '127.0.0.1',
        comment: 'Этот компьютер (системное исключение)',
        createdAt: now - 14 * 24 * hour,
        systemDefault: true,
      },
      {
        id: 'wl-lan-192',
        type: 'whitelist',
        value: '192.168.0.0/16',
        comment: 'Домашняя и офисная локальная сеть',
        createdAt: now - 14 * 24 * hour,
        systemDefault: true,
      },
      {
        id: 'wl-lan-10',
        type: 'whitelist',
        value: '10.0.0.0/8',
        comment: 'Корпоративная внутренняя сеть / VPN',
        createdAt: now - 10 * 24 * hour,
      },
      {
        id: 'bl-scanner-1',
        type: 'blacklist',
        value: '45.155.205.0/24',
        comment: 'Известная подсеть автоматического сканирования RDP',
        createdAt: now - 3 * 24 * hour,
      },
    ],
    activeBans: [
      {
        id: 'ban-1',
        ip: '218.92.0.184',
        countryCode: 'CN',
        countryName: 'Китай',
        protocol: 'RDP',
        reason: 'geoip',
        reasonLabel: 'Геоблокировка (Китай)',
        escalationLevel: 1,
        isPermanent: false,
        attemptsCount: 1,
        bannedAt: now - 22 * min,
        expiresAt: now + 38 * min,
        firewallRuleName: 'ServerProDefender_Geo_218.92.0.184',
      },
      {
        id: 'ban-2',
        ip: '195.201.84.132',
        countryCode: 'DE',
        countryName: 'Германия',
        protocol: 'RDP',
        reason: 'bruteforce',
        reasonLabel: 'Подбор пароля RDP (5 попыток)',
        escalationLevel: 2,
        isPermanent: false,
        attemptsCount: 11,
        bannedAt: now - 14 * min,
        expiresAt: now + 46 * min,
        firewallRuleName: 'ServerProDefender_RDP_195.201.84.132',
      },
      {
        id: 'ban-3',
        ip: '162.142.125.91',
        countryCode: 'US',
        countryName: 'США',
        protocol: 'SMB',
        reason: 'bruteforce',
        reasonLabel: 'Повторный подбор пароля SMB',
        escalationLevel: 3,
        isPermanent: false,
        attemptsCount: 17,
        bannedAt: now - 2 * hour,
        expiresAt: now + 22 * hour,
        firewallRuleName: 'ServerProDefender_SMB_162.142.125.91',
      },
      {
        id: 'ban-4',
        ip: '103.21.58.144',
        countryCode: 'IN',
        countryName: 'Индия',
        protocol: 'FTP',
        reason: 'bruteforce',
        reasonLabel: 'Рецидив подбора FTP (4-я ступень)',
        escalationLevel: 4,
        isPermanent: true,
        attemptsCount: 24,
        bannedAt: now - 5 * hour,
        expiresAt: null,
        firewallRuleName: 'ServerProDefender_FTP_103.21.58.144',
      },
      {
        id: 'ban-5',
        ip: '141.98.10.214',
        countryCode: 'NL',
        countryName: 'Нидерланды',
        protocol: 'RDP',
        reason: 'geoip',
        reasonLabel: 'Геоблокировка (Нидерланды)',
        escalationLevel: 1,
        isPermanent: false,
        attemptsCount: 1,
        bannedAt: now - 6 * min,
        expiresAt: now + 9 * min,
        firewallRuleName: 'ServerProDefender_Geo_141.98.10.214',
      },
    ],
    events: [
      {
        id: 'ev-ok-1',
        timestamp: now - 3 * min,
        ip: '192.168.1.12',
        countryCode: 'LOCAL',
        countryName: 'Локальная сеть',
        protocol: 'RDP',
        username: 'Administrator',
        eventId: '4624',
        logonType: '10 (RemoteInteractive)',
        subStatus: '0x0 (Success)',
        authStatus: 'success',
        verdict: 'allowed',
        summaryRu: 'Успешный вход RDP из доверенной сети (192.168.0.0/16)',
        firewallCommand: 'Нет команды — подключение разрешено',
      },
      {
        id: 'ev-1',
        timestamp: now - 6 * min,
        ip: '141.98.10.214',
        countryCode: 'NL',
        countryName: 'Нидерланды',
        protocol: 'RDP',
        username: 'Administrator',
        eventId: '4625',
        logonType: '10 (RemoteInteractive)',
        subStatus: '0xC000006A',
        authStatus: 'invalid_credentials',
        verdict: 'geo_blocked',
        summaryRu: 'Мгновенная блокировка по стране (Нидерланды в черном списке)',
        firewallCommand: buildNetshBlockCommand('141.98.10.214', 3389, 'ServerProDefender_Geo_141.98.10.214'),
      },
      {
        id: 'ev-ok-2',
        timestamp: now - 11 * min,
        ip: '192.168.1.45',
        countryCode: 'LOCAL',
        countryName: 'Локальная сеть',
        protocol: 'SMB',
        username: 'buhgalter',
        eventId: '4624',
        logonType: '3 (Network)',
        subStatus: '0x0 (Success)',
        authStatus: 'success',
        verdict: 'allowed',
        summaryRu: 'Успешное подключение к общей папке Windows',
        firewallCommand: 'Нет команды — подключение разрешено',
      },
      {
        id: 'ev-ok-3',
        timestamp: now - 34 * min,
        ip: '10.0.0.18',
        countryCode: 'LOCAL',
        countryName: 'Локальная сеть',
        protocol: 'FTP',
        username: 'backup_svc',
        eventId: 'FTP-230',
        logonType: 'FTP Auth',
        subStatus: '230 User logged in',
        authStatus: 'success',
        verdict: 'allowed',
        summaryRu: 'Успешная авторизация FTP из корпоративной сети (10.0.0.0/8)',
        firewallCommand: 'Нет команды — подключение разрешено',
      },
      {
        id: 'ev-2',
        timestamp: now - 14 * min,
        ip: '195.201.84.132',
        countryCode: 'DE',
        countryName: 'Германия',
        protocol: 'RDP',
        username: 'Admin',
        eventId: '4625',
        logonType: '10 (RemoteInteractive)',
        subStatus: '0xC000006A',
        verdict: 'blocked',
        summaryRu: 'Достигнут порог 5/5 — заблокирован на 1 час (2-я ступень)',
        firewallCommand: buildNetshBlockCommand('195.201.84.132', 3389, 'ServerProDefender_RDP_195.201.84.132'),
      },
      {
        id: 'ev-3',
        timestamp: now - 19 * min,
        ip: '192.168.1.45',
        countryCode: 'LOCAL',
        countryName: 'Локальная сеть',
        protocol: 'SMB',
        username: 'buhgalter',
        eventId: '4625',
        logonType: '3 (Network)',
        subStatus: '0xC000006A',
        verdict: 'whitelisted',
        summaryRu: 'Пропущен: адрес входит в доверенную сеть 192.168.0.0/16',
        firewallCommand: 'Нет команды — адрес защищен белым списком',
      },
      {
        id: 'ev-4',
        timestamp: now - 22 * min,
        ip: '218.92.0.184',
        countryCode: 'CN',
        countryName: 'Китай',
        protocol: 'RDP',
        username: 'root',
        eventId: '4625',
        logonType: '10 (RemoteInteractive)',
        subStatus: '0xC0000064',
        verdict: 'geo_blocked',
        summaryRu: 'Мгновенная блокировка по стране (Китай в черном списке)',
        firewallCommand: buildNetshBlockCommand('218.92.0.184', 3389, 'ServerProDefender_Geo_218.92.0.184'),
      },
      {
        id: 'ev-5',
        timestamp: now - 47 * min,
        ip: '51.91.144.78',
        countryCode: 'FR',
        countryName: 'Франция',
        protocol: 'FTP',
        username: 'ftpuser',
        eventId: 'FTP-530',
        logonType: 'FTP Auth',
        subStatus: '530 Login Incorrect',
        verdict: 'warning',
        summaryRu: 'Неверный пароль FTP (попытка 3 из 5 за 10 мин)',
        firewallCommand: 'Ожидание порога — правило не создано',
      },
      {
        id: 'ev-6',
        timestamp: now - 2 * hour,
        ip: '162.142.125.91',
        countryCode: 'US',
        countryName: 'США',
        protocol: 'SMB',
        username: 'Administrator',
        eventId: '4625',
        logonType: '3 (Network)',
        subStatus: '0xC000006A',
        verdict: 'blocked',
        summaryRu: 'Повторная атака SMB — заблокирован на 24 часа (3-я ступень)',
        firewallCommand: buildNetshBlockCommand('162.142.125.91', 445, 'ServerProDefender_SMB_162.142.125.91'),
      },
      {
        id: 'ev-7',
        timestamp: now - 3 * hour,
        ip: '177.54.148.19',
        countryCode: 'BR',
        countryName: 'Бразилия',
        protocol: 'RDP',
        username: 'user1',
        eventId: '4625',
        logonType: '10 (RemoteInteractive)',
        subStatus: '0xC000006A',
        verdict: 'geo_blocked',
        summaryRu: 'Мгновенная блокировка по стране (Бразилия в черном списке)',
        firewallCommand: buildNetshBlockCommand('177.54.148.19', 3389, 'ServerProDefender_Geo_177.54.148.19'),
      },
      {
        id: 'ev-8',
        timestamp: now - 5 * hour,
        ip: '103.21.58.144',
        countryCode: 'IN',
        countryName: 'Индия',
        protocol: 'FTP',
        username: 'backup',
        eventId: 'FTP-530',
        logonType: 'FTP Auth',
        subStatus: '530 Login Incorrect',
        verdict: 'blocked',
        summaryRu: '4-й рецидив подбора пароля — заблокирован навсегда',
        firewallCommand: buildNetshBlockCommand('103.21.58.144', 21, 'ServerProDefender_FTP_103.21.58.144'),
      },
      {
        id: 'ev-9',
        timestamp: now - 7 * hour,
        ip: '113.160.224.85',
        countryCode: 'VN',
        countryName: 'Вьетнам',
        protocol: 'SMB',
        username: 'Guest',
        eventId: '4625',
        logonType: '3 (Network)',
        subStatus: '0xC000006E',
        verdict: 'geo_blocked',
        summaryRu: 'Мгновенная блокировка по стране (Вьетнам в черном списке)',
        firewallCommand: buildNetshBlockCommand('113.160.224.85', 445, 'ServerProDefender_Geo_113.160.224.85'),
      },
      {
        id: 'ev-10',
        timestamp: now - 9 * hour,
        ip: '195.201.84.132',
        countryCode: 'DE',
        countryName: 'Германия',
        protocol: 'RDP',
        username: 'Admin',
        eventId: '4625',
        logonType: '10 (RemoteInteractive)',
        subStatus: '0xC000006A',
        verdict: 'blocked',
        summaryRu: 'Первый подбор пароля RDP (5/5) — заблокирован на 15 мин',
        firewallCommand: buildNetshBlockCommand('195.201.84.132', 3389, 'ServerProDefender_RDP_195.201.84.132'),
      },
      {
        id: 'ev-11',
        timestamp: now - 12 * hour,
        ip: '91.200.12.74',
        countryCode: 'UA',
        countryName: 'Украина',
        protocol: 'RDP',
        username: 'support',
        eventId: '4625',
        logonType: '10 (RemoteInteractive)',
        subStatus: '0xC000006A',
        verdict: 'warning',
        summaryRu: 'Неверный пароль RDP (попытка 2 из 5 за 10 мин)',
        firewallCommand: 'Ожидание порога — правило не создано',
      },
      {
        id: 'ev-12',
        timestamp: now - 16 * hour,
        ip: '218.92.0.184',
        countryCode: 'CN',
        countryName: 'Китай',
        protocol: 'RDP',
        username: 'Administrator',
        eventId: '4625',
        logonType: '10 (RemoteInteractive)',
        subStatus: '0xC000006A',
        verdict: 'geo_blocked',
        summaryRu: 'Мгновенная блокировка по стране (Китай в черном списке)',
        firewallCommand: buildNetshBlockCommand('218.92.0.184', 3389, 'ServerProDefender_Geo_218.92.0.184'),
      },
    ],
    failureTracker: {
      '195.201.84.132|RDP': { timestamps: [], recurrenceCount: 2, lastBanAt: now - 14 * min },
      '162.142.125.91|SMB': { timestamps: [], recurrenceCount: 3, lastBanAt: now - 2 * hour },
      '103.21.58.144|FTP': { timestamps: [], recurrenceCount: 4, lastBanAt: now - 5 * hour },
      '51.91.144.78|FTP': { timestamps: [now - 4 * min, now - 3 * min, now - 2 * min], recurrenceCount: 0, lastBanAt: null },
    },
    system: {
      serviceStatus: 'running',
      serviceStartupType: 'auto',
      serviceName: 'ServerProDefender',
      lastServiceChangeAt: now - 18 * hour,
      firewallProfiles: {
        domain: true,
        private: true,
        public: true,
      },
      settingsLockEnabled: false,
      passwordHash: hashPasswordSync(DEFAULT_ADMIN_PASSWORD),
      isDefaultPassword: true,
      installDirectory: 'C:\\Program Files\\ServerPro Defender',
      targetOsPreset: 'win7_2008r2',
      createDesktopShortcut: true,
    },
    notifications: {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      triggers: { ...DEFAULT_NOTIFICATION_SETTINGS.triggers },
    },
    alertHistory: [],
    tempAllows: [],
  };
}

export function getFirewallOverallStatus(profiles: DefenderState['system']['firewallProfiles']): 'enabled' | 'partial' | 'disabled' {
  const values = [profiles.domain, profiles.private, profiles.public];
  if (values.every(Boolean)) return 'enabled';
  if (values.every((v) => !v)) return 'disabled';
  return 'partial';
}

export function evaluateAttemptsBatch(
  state: DefenderState,
  params: {
    ip: string;
    protocol: ProtocolId;
    username: string;
    attempts: number;
    explicitCountryCode?: string;
  }
): { nextState: DefenderState; outcome: SimulationOutcome } {
  const now = Date.now();
  const { ip, protocol, username, attempts, explicitCountryCode } = params;
  const policy = state.policies[protocol];
  const country = resolveCountryByIp(ip, explicitCountryCode);
  const steps: EvaluationStep[] = [];

  const fwStatus = getFirewallOverallStatus(state.system.firewallProfiles);
  const serviceRunning = state.system.serviceStatus === 'running';
  const eventId = protocol === 'FTP' ? 'FTP-530' : '4625';
  const logonType =
    protocol === 'RDP'
      ? '10 (RemoteInteractive)'
      : protocol === 'SMB'
      ? '3 (Network)'
      : 'FTP Auth';
  const subStatus = protocol === 'FTP' ? '530 Login Incorrect' : '0xC000006A';

  // Step 0: System & Firewall readiness
  if (!serviceRunning || fwStatus === 'disabled' || !policy.enabled) {
    const reason = !serviceRunning
      ? 'Служба ServerProDefender остановлена'
      : fwStatus === 'disabled'
      ? 'Брандмауэр Windows полностью отключен'
      : `Защита протокола ${protocol} выключена в настройках`;

    steps.push({
      stepNumber: 1,
      label: 'Проверка готовности защиты',
      result: 'warn',
      detail: `${reason} — блокировка не выполнена.`,
    });

    const newEvent: AuthAttemptEvent = {
      id: `ev-${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      ip,
      countryCode: country.code,
      countryName: country.nameRu,
      protocol,
      username,
      eventId,
      logonType,
      subStatus,
      verdict: 'unprotected',
      summaryRu: `Не заблокирован: ${reason.toLowerCase()}`,
      firewallCommand: 'Нет команды — защита неактивна',
    };

    return {
      nextState: {
        ...state,
        events: [newEvent, ...state.events].slice(0, 120),
      },
      outcome: {
        verdict: 'unprotected',
        headline: 'Атака не заблокирована',
        explanation: `${reason}. Включите службу, брандмауэр Windows и защиту ${protocol}, чтобы блокировки работали автоматически.`,
        ip,
        countryCode: country.code,
        countryName: country.nameRu,
        protocol,
        steps,
        appliedBan: null,
        firewallCommand: newEvent.firewallCommand,
      },
    };
  }

  steps.push({
    stepNumber: 1,
    label: 'Служба Windows и Брандмауэр',
    result: 'pass',
    detail: `Служба работает, брандмауэр включен, защита ${protocol} (порт ${policy.port}) активна.`,
  });

  // Step 1: Whitelist check
  const matchedWhitelist = state.accessList.find(
    (item) => item.type === 'whitelist' && ipMatchesCidr(ip, item.value)
  );
  if (matchedWhitelist) {
    steps.push({
      stepNumber: 2,
      label: 'Проверка Белого списка (IP / CIDR)',
      result: 'match',
      detail: `Совпадение с доверенным правилом ${matchedWhitelist.value} (${matchedWhitelist.comment || 'без комментария'}). Адрес защищен от блокировки.`,
    });

    const newEvent: AuthAttemptEvent = {
      id: `ev-${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      ip,
      countryCode: country.code,
      countryName: country.nameRu,
      protocol,
      username,
      eventId,
      logonType,
      subStatus,
      verdict: 'whitelisted',
      summaryRu: `Пропущен: совпадает с белым списком (${matchedWhitelist.value})`,
      firewallCommand: 'Нет команды — адрес в белом списке',
    };

    return {
      nextState: {
        ...state,
        events: [newEvent, ...state.events].slice(0, 120),
      },
      outcome: {
        verdict: 'whitelisted',
        headline: 'Адрес пропущен по Белому списку',
        explanation: `IP ${ip} совпадает с правилом ${matchedWhitelist.value}. Программа записала ошибку в журнал, но не заблокировала доверенный адрес.`,
        ip,
        countryCode: country.code,
        countryName: country.nameRu,
        protocol,
        steps,
        appliedBan: null,
        firewallCommand: newEvent.firewallCommand,
      },
    };
  }

  // Step 1b: Temporary IP unblock exception
  const matchedTempIp = (state.tempAllows || []).find(
    (item) => item.targetType === 'ip' && item.value === ip && item.expiresAt > now
  );
  if (matchedTempIp) {
    const remaining = formatCountdown(matchedTempIp.expiresAt, now);
    steps.push({
      stepNumber: 2,
      label: 'Временная разблокировка IP',
      result: 'match',
      detail: `Для IP ${ip} действует временное исключение (осталось ${remaining}). Блокировка не применяется.`,
    });

    const newEvent: AuthAttemptEvent = {
      id: `ev-${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      ip,
      countryCode: country.code,
      countryName: country.nameRu,
      protocol,
      username,
      eventId,
      logonType,
      subStatus,
      verdict: 'whitelisted',
      summaryRu: `Пропущен: временная разблокировка IP (осталось ${remaining})`,
      firewallCommand: 'Нет команды — действует временная разблокировка IP',
    };

    return {
      nextState: {
        ...state,
        events: [newEvent, ...state.events].slice(0, 120),
      },
      outcome: {
        verdict: 'whitelisted',
        headline: 'Адрес временно разблокирован',
        explanation: `Для IP ${ip} открыт временный доступ (осталось ${remaining}). После окончания срока защита возобновится автоматически.`,
        ip,
        countryCode: country.code,
        countryName: country.nameRu,
        protocol,
        steps,
        appliedBan: null,
        firewallCommand: newEvent.firewallCommand,
      },
    };
  }

  steps.push({
    stepNumber: 2,
    label: 'Проверка Белого списка',
    result: 'pass',
    detail: 'Совпадений с доверенными адресами нет — продолжаем проверку.',
  });

  // Step 1c: Whitelist-only firewall rule enforcement
  if (state.whitelistOnly) {
    const activePorts = Object.values(state.policies)
      .filter((p) => p.enabled)
      .map((p) => p.port);
    const cmd = buildWhitelistOnlyFirewallCommand(true, activePorts);
    const ban: ActiveBan = {
      id: `ban-${now}`,
      ip,
      countryCode: country.code,
      countryName: country.nameRu,
      protocol: 'ALL',
      reason: 'whitelist_only',
      reasonLabel: 'Только белый список (IP не разрешен)',
      escalationLevel: 4,
      isPermanent: true,
      attemptsCount: attempts,
      bannedAt: now,
      expiresAt: null,
      firewallRuleName: WHITELIST_ONLY_RULE_NAME,
    };

    steps.push({
      stepNumber: 3,
      label: 'Режим «Только белый список»',
      result: 'match',
      detail: `Включен строгий доступ только из Белого списка — правило ${WHITELIST_ONLY_RULE_NAME} активно (enable=yes). IP ${ip} отклонен.`,
    });

    const newEvent: AuthAttemptEvent = {
      id: `ev-${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      ip,
      countryCode: country.code,
      countryName: country.nameRu,
      protocol,
      username,
      eventId,
      logonType,
      subStatus,
      verdict: 'blocked',
      summaryRu: `Отклонен правилом «Только белый список» (${WHITELIST_ONLY_RULE_NAME})`,
      firewallCommand: cmd,
    };

    const filteredBans = state.activeBans.filter((b) => b.ip !== ip);
    return {
      nextState: {
        ...state,
        activeBans: [ban, ...filteredBans],
        events: [newEvent, ...state.events].slice(0, 120),
      },
      outcome: {
        verdict: 'blocked',
        headline: 'Заблокировано: режим «Только белый список»',
        explanation: `IP ${ip} не входит в Белый список. Правило брандмауэра Windows ${WHITELIST_ONLY_RULE_NAME} активно и блокирует все внешние подключения.`,
        ip,
        countryCode: country.code,
        countryName: country.nameRu,
        protocol,
        steps,
        appliedBan: ban,
        firewallCommand: cmd,
      },
    };
  }

  // Step 2: Blacklist check
  const matchedBlacklist = state.accessList.find(
    (item) => item.type === 'blacklist' && ipMatchesCidr(ip, item.value)
  );
  if (matchedBlacklist) {
    const ruleName = `ServerProDefender_Blacklist_${ip}`;
    const cmd = buildNetshBlockCommand(ip, 'ALL', ruleName);
    const ban: ActiveBan = {
      id: `ban-${now}`,
      ip,
      countryCode: country.code,
      countryName: country.nameRu,
      protocol: 'ALL',
      reason: 'blacklist',
      reasonLabel: `Черный список (${matchedBlacklist.value})`,
      escalationLevel: 4,
      isPermanent: true,
      attemptsCount: attempts,
      bannedAt: now,
      expiresAt: null,
      firewallRuleName: ruleName,
    };

    steps.push({
      stepNumber: 3,
      label: 'Проверка Черного списка',
      result: 'match',
      detail: `Совпадение с запрещенным правилом ${matchedBlacklist.value}. Применена постоянная блокировка.`,
    });

    const newEvent: AuthAttemptEvent = {
      id: `ev-${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      ip,
      countryCode: country.code,
      countryName: country.nameRu,
      protocol,
      username,
      eventId,
      logonType,
      subStatus,
      verdict: 'blocked',
      summaryRu: `Постоянная блокировка по Черному списку (${matchedBlacklist.value})`,
      firewallCommand: cmd,
    };

    const alert = createAlertIfTriggered(state, 'permanent_ban', {
      subject: `[ServerPro Defender] Постоянный бан ${ip} (Черный список)`,
      triggerLabel: 'Черный список',
      ip,
      detail: `Постоянная блокировка по правилу ${matchedBlacklist.value}`,
    });

    const filteredBans = state.activeBans.filter((b) => b.ip !== ip);
    return {
      nextState: {
        ...state,
        activeBans: [ban, ...filteredBans],
        events: [newEvent, ...state.events].slice(0, 120),
        alertHistory: alert ? [alert, ...state.alertHistory].slice(0, 50) : state.alertHistory,
      },
      outcome: {
        verdict: 'blocked',
        headline: 'Мгновенная блокировка по Черному списку',
        explanation: `IP ${ip} находится в Черном списке (${matchedBlacklist.value}). Создано постоянное правило в брандмауэре Windows.`,
        ip,
        countryCode: country.code,
        countryName: country.nameRu,
        protocol,
        steps,
        appliedBan: ban,
        firewallCommand: cmd,
        dispatchedAlert: alert,
      },
    };
  }

  steps.push({
    stepNumber: 3,
    label: 'Проверка Черного списка',
    result: 'pass',
    detail: 'В постоянном Черном списке адрес не найден.',
  });

  // Step 3: GeoIP check
  const geo = state.geoPolicy;
  const geoAppliesToProtocol = geo.protocols.includes(protocol);
  const bypassBecausePrivate = geo.bypassPrivateNetworks && isPrivateOrLoopbackIp(ip);
  const matchedTempCountry = (state.tempAllows || []).find(
    (item) => item.targetType === 'country' && item.value === country.code && item.expiresAt > now
  );

  if (geo.mode !== 'disabled' && geoAppliesToProtocol && !bypassBecausePrivate && matchedTempCountry) {
    steps.push({
      stepNumber: 4,
      label: `Геоблокировка (GeoIP · ${country.nameRu})`,
      result: 'pass',
      detail: `Временная разблокировка страны ${country.nameRu} (${country.code}) — осталось ${formatCountdown(matchedTempCountry.expiresAt, now)}.`,
    });
  } else if (geo.mode !== 'disabled' && geoAppliesToProtocol && !bypassBecausePrivate) {
    const inSelected = geo.selectedCountries.includes(country.code);
    const isGeoViolation =
      (geo.mode === 'blacklist' && inSelected) ||
      (geo.mode === 'allowlist' && !inSelected);

    if (isGeoViolation) {
      const geoReasonText =
        geo.mode === 'blacklist'
          ? `Страна ${country.nameRu} (${country.code}) находится в списке запрещенных`
          : `Страна ${country.nameRu} (${country.code}) не входит в список разрешенных стран`;

      if (geo.action === 'audit') {
        steps.push({
          stepNumber: 4,
          label: `Геоблокировка (GeoIP · ${country.nameRu})`,
          result: 'warn',
          detail: `${geoReasonText}, но выбран режим «Только запись в журнал» (аудит).`,
        });

        const newEvent: AuthAttemptEvent = {
          id: `ev-${now}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: now,
          ip,
          countryCode: country.code,
          countryName: country.nameRu,
          protocol,
          username,
          eventId,
          logonType,
          subStatus,
          verdict: 'geo_audit',
          summaryRu: `GeoIP-аудит: ${geoReasonText} (блокировка не применялась)`,
          firewallCommand: 'Режим аудита GeoIP — правило не создавалось',
        };

        return {
          nextState: {
            ...state,
            events: [newEvent, ...state.events].slice(0, 120),
          },
          outcome: {
            verdict: 'geo_audit',
            headline: 'Событие отмечено в режиме GeoIP-аудита',
            explanation: `${geoReasonText}. Так как включен режим «Только журнал», адрес не был заблокирован.`,
            ip,
            countryCode: country.code,
            countryName: country.nameRu,
            protocol,
            steps,
            appliedBan: null,
            firewallCommand: newEvent.firewallCommand,
          },
        };
      }

      const isProgressive = state.escalation.enabled !== false;
      const stage0 = state.escalation.stages[0];
      const durationMin = isProgressive ? (stage0?.durationMinutes ?? 60) : null;
      const ruleName = `ServerProDefender_Geo_${ip}`;
      const cmd = buildNetshBlockCommand(ip, policy.port, ruleName);

      const ban: ActiveBan = {
        id: `ban-${now}`,
        ip,
        countryCode: country.code,
        countryName: country.nameRu,
        protocol,
        reason: 'geoip',
        reasonLabel:
          geo.mode === 'blacklist'
            ? `Геоблокировка (${country.nameRu})`
            : `Вне разрешенных стран (${country.nameRu})`,
        escalationLevel: durationMin === null ? 4 : 1,
        isPermanent: durationMin === null,
        attemptsCount: attempts,
        bannedAt: now,
        expiresAt: durationMin === null ? null : now + durationMin * 60_000,
        firewallRuleName: ruleName,
      };

      steps.push({
        stepNumber: 4,
        label: `Геоблокировка (GeoIP · ${country.nameRu})`,
        result: 'match',
        detail: `${geoReasonText}. Мгновенная блокировка с 1-й попытки без ожидания порога.`,
      });

      const newEvent: AuthAttemptEvent = {
        id: `ev-${now}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now,
        ip,
        countryCode: country.code,
        countryName: country.nameRu,
        protocol,
        username,
        eventId,
        logonType,
        subStatus,
        verdict: 'geo_blocked',
        summaryRu: `Мгновенная блокировка по стране (${country.nameRu}) — ${formatDurationRu(durationMin)}`,
        firewallCommand: cmd,
      };

      const alert = createAlertIfTriggered(state, 'geo_block', {
        subject: `[ServerPro Defender] GeoIP-блок ${ip} (${country.nameRu}) · ${protocol}`,
        triggerLabel: `GeoIP (${country.code})`,
        ip,
        detail: `${geoReasonText}, порт ${policy.port}`,
      });

      const filteredBans = state.activeBans.filter((b) => b.ip !== ip);
      return {
        nextState: {
          ...state,
          activeBans: [ban, ...filteredBans],
          events: [newEvent, ...state.events].slice(0, 120),
          alertHistory: alert ? [alert, ...state.alertHistory].slice(0, 50) : state.alertHistory,
        },
        outcome: {
          verdict: 'geo_blocked',
          headline: `Мгновенная геоблокировка (${country.nameRu})`,
          explanation: `${geoReasonText}. Брандмауэр Windows сразу закрыл порт ${policy.port} для ${ip} на ${formatDurationRu(durationMin)}.`,
          ip,
          countryCode: country.code,
          countryName: country.nameRu,
          protocol,
          steps,
          appliedBan: ban,
          firewallCommand: cmd,
          dispatchedAlert: alert,
        },
      };
    }

    steps.push({
      stepNumber: 4,
      label: `Геоблокировка (GeoIP · ${country.nameRu})`,
      result: 'pass',
      detail: `Страна ${country.nameRu} (${country.code}) разрешена текущими правилами GeoIP.`,
    });
  } else {
    steps.push({
      stepNumber: 4,
      label: `Геоблокировка (GeoIP · ${country.nameRu})`,
      result: 'skip',
      detail:
        geo.mode === 'disabled'
          ? 'Фильтр по странам отключен.'
          : bypassBecausePrivate
          ? 'Локальный IP не проверяется GeoIP.'
          : `GeoIP не включен для протокола ${protocol}.`,
    });
  }

  // Step 4: Brute-force sliding window + progressive ban
  const key = `${ip}|${protocol}`;
  const existingRecord = state.failureTracker[key] || {
    timestamps: [],
    recurrenceCount: 0,
    lastBanAt: null,
  };

  const windowMs = policy.windowMinutes * 60_000;
  const resetMs = state.escalation.resetAfterDays * 86_400_000;

  let recurrenceCount = existingRecord.recurrenceCount;
  if (existingRecord.lastBanAt && now - existingRecord.lastBanAt > resetMs) {
    recurrenceCount = 0;
  }

  const recentTimestamps = existingRecord.timestamps.filter((t) => now - t <= windowMs);
  for (let i = 0; i < attempts; i++) {
    recentTimestamps.push(now - (attempts - 1 - i) * 500);
  }

  const totalInWindow = recentTimestamps.length;

  if (totalInWindow < policy.maxAttempts) {
    steps.push({
      stepNumber: 5,
      label: `Счетчик подбора пароля ${protocol}`,
      result: 'warn',
      detail: `Зафиксировано ${totalInWindow} из ${policy.maxAttempts} ошибок за ${policy.windowMinutes} мин. Порог еще не достигнут.`,
    });

    const newEvent: AuthAttemptEvent = {
      id: `ev-${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      ip,
      countryCode: country.code,
      countryName: country.nameRu,
      protocol,
      username,
      eventId,
      logonType,
      subStatus,
      verdict: 'warning',
      summaryRu: `Неверный пароль ${protocol} (попытка ${totalInWindow} из ${policy.maxAttempts} за ${policy.windowMinutes} мин)`,
      firewallCommand: 'Порог не превышен — правило не создавалось',
    };

    return {
      nextState: {
        ...state,
        events: [newEvent, ...state.events].slice(0, 120),
        failureTracker: {
          ...state.failureTracker,
          [key]: {
            timestamps: recentTimestamps,
            recurrenceCount,
            lastBanAt: existingRecord.lastBanAt,
          },
        },
      },
      outcome: {
        verdict: 'warning',
        headline: `Зафиксировано ${totalInWindow} из ${policy.maxAttempts} ошибок`,
        explanation: `Порог блокировки (${policy.maxAttempts} ошибок за ${policy.windowMinutes} мин) еще не достигнут. Если поступят еще ${policy.maxAttempts - totalInWindow} неудачные попытки, IP будет заблокирован автоматически.`,
        ip,
        countryCode: country.code,
        countryName: country.nameRu,
        protocol,
        steps,
        appliedBan: null,
        firewallCommand: newEvent.firewallCommand,
      },
    };
  }

  // Threshold exceeded -> trigger progressive or permanent ban
  const isProgressive = state.escalation.enabled !== false;
  const nextRecurrence = recurrenceCount + 1;
  const stageIdx = Math.min(nextRecurrence - 1, state.escalation.stages.length - 1);
  const stage = state.escalation.stages[stageIdx];
  const durationMin = isProgressive ? (stage?.durationMinutes ?? null) : null;
  const ruleName = `ServerProDefender_${protocol}_${ip}`;
  const cmd = buildNetshBlockCommand(ip, policy.port, ruleName);

  const ban: ActiveBan = {
    id: `ban-${now}`,
    ip,
    countryCode: country.code,
    countryName: country.nameRu,
    protocol,
    reason: 'bruteforce',
    reasonLabel:
      !isProgressive
        ? `Подбор пароля ${protocol} (${totalInWindow} попыток)`
        : nextRecurrence > 1
        ? `Повторный подбор ${protocol} (${nextRecurrence}-я ступень)`
        : `Подбор пароля ${protocol} (${totalInWindow} попыток)`,
    escalationLevel: isProgressive ? stageIdx + 1 : 4,
    isPermanent: durationMin === null,
    attemptsCount: totalInWindow,
    bannedAt: now,
    expiresAt: durationMin === null ? null : now + durationMin * 60_000,
    firewallRuleName: ruleName,
  };

  steps.push({
    stepNumber: 5,
    label: isProgressive
      ? `Прогрессивная блокировка ${protocol} (ступень ${stageIdx + 1})`
      : `Постоянная блокировка ${protocol}`,
    result: 'match',
    detail: `Достигнут порог ${totalInWindow}/${policy.maxAttempts} за ${policy.windowMinutes} мин. Блокировка ${durationMin === null ? 'навсегда' : `на ${formatDurationRu(durationMin)}`}.`,
  });

  const newEvent: AuthAttemptEvent = {
    id: `ev-${now}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    ip,
    countryCode: country.code,
    countryName: country.nameRu,
    protocol,
    username,
    eventId,
    logonType,
    subStatus,
    verdict: 'blocked',
    summaryRu: isProgressive
      ? `Порог ${totalInWindow}/${policy.maxAttempts} превышен — блокировка ${durationMin === null ? 'навсегда' : `на ${formatDurationRu(durationMin)}`} (${stageIdx + 1}-я ступень)`
      : `Порог ${totalInWindow}/${policy.maxAttempts} превышен — постоянная блокировка`,
    firewallCommand: cmd,
  };

  const alert = createAlertIfTriggered(
    state,
    durationMin === null ? 'permanent_ban' : 'bruteforce_ban',
    {
      subject:
        durationMin === null
          ? `[ServerPro Defender] Постоянный бан ${ip} (${protocol})`
          : `[ServerPro Defender] Блокировка ${ip} (${protocol}) на ${formatDurationRu(durationMin)}`,
      triggerLabel: durationMin === null ? 'Постоянный бан' : `Подбор ${protocol}`,
      ip,
      detail: isProgressive
        ? `${totalInWindow} ошибок входа · ступень ${stageIdx + 1}`
        : `${totalInWindow} ошибок входа · бан навсегда`,
    }
  );

  const filteredBans = state.activeBans.filter((b) => b.ip !== ip);
  return {
    nextState: {
      ...state,
      activeBans: [ban, ...filteredBans],
      events: [newEvent, ...state.events].slice(0, 120),
      alertHistory: alert ? [alert, ...state.alertHistory].slice(0, 50) : state.alertHistory,
      failureTracker: {
        ...state.failureTracker,
        [key]: {
          timestamps: [],
          recurrenceCount: nextRecurrence,
          lastBanAt: now,
        },
      },
    },
    outcome: {
      verdict: 'blocked',
      headline:
        durationMin === null
          ? 'IP заблокирован навсегда'
          : `IP заблокирован на ${formatDurationRu(durationMin)}`,
      explanation: isProgressive
        ? `Превышен порог ошибок (${totalInWindow} из ${policy.maxAttempts}). Сработала ${stageIdx + 1}-я ступень прогрессивного бана — добавлено правило Windows Firewall для порта ${policy.port}.`
        : `Превышен порог ошибок (${totalInWindow} из ${policy.maxAttempts}). Прогрессивный бан отключен — применена постоянная блокировка в Windows Firewall для порта ${policy.port}.`,
      ip,
      countryCode: country.code,
      countryName: country.nameRu,
      protocol,
      steps,
      appliedBan: ban,
      firewallCommand: cmd,
      dispatchedAlert: alert,
    },
  };
}

export function parseRawWindowsLogLine(raw: string): {
  ip: string | null;
  protocol: ProtocolId;
  username: string;
} {
  const ipMatch = raw.match(/\b((?:\d{1,3}\.){3}\d{1,3})\b/);
  const lower = raw.toLowerCase();
  let protocol: ProtocolId = 'RDP';
  if (lower.includes('ftp') || lower.includes('530') || lower.includes('filezilla') || lower.includes('port 21')) {
    protocol = 'FTP';
  } else if (lower.includes('smb') || lower.includes('445') || lower.includes('logon type: 3') || lower.includes('logon type 3') || lower.includes('ntlmssp')) {
    protocol = 'SMB';
  }

  const userMatch =
    raw.match(/(?:account name|имя учетной записи|user|login)\s*[:=]\s*([a-zA-Z0-9._-]+)/i);

  return {
    ip: ipMatch ? ipMatch[1] : null,
    protocol,
    username: userMatch ? userMatch[1] : 'Administrator',
  };
}
