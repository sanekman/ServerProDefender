export type ProtocolId = 'RDP' | 'FTP' | 'SMB';

export type NavSection =
  | 'protection'
  | 'rules'
  | 'geoip'
  | 'events'
  | 'notifications'
  | 'system'
  | 'help';

export type SecurityPresetId = 'standard' | 'strict' | 'office' | 'custom';

export interface ServicePolicy {
  protocol: ProtocolId;
  titleRu: string;
  shortDescRu: string;
  enabled: boolean;
  port: number;
  maxAttempts: number;
  windowMinutes: number;
  logSource: string;
  eventIdLabel: string;
}

export interface EscalationStage {
  level: number;
  durationMinutes: number | null; // null = навсегда
  label: string;
}

export interface EscalationPolicy {
  enabled: boolean;
  stages: EscalationStage[];
  resetAfterDays: number;
}

export type GeoMode = 'disabled' | 'blacklist' | 'allowlist';
export type GeoAction = 'block' | 'audit';

export interface GeoPolicy {
  mode: GeoMode;
  selectedCountries: string[]; // ISO-2 codes
  protocols: ProtocolId[];
  action: GeoAction;
  bypassPrivateNetworks: boolean;
}

export type AccessListType = 'whitelist' | 'blacklist';

export interface AccessListEntry {
  id: string;
  type: AccessListType;
  value: string; // IPv4 or CIDR
  comment: string;
  createdAt: number;
  systemDefault?: boolean;
}

export interface TemporaryAllowException {
  id: string;
  targetType: 'ip' | 'country';
  value: string; // IPv4 address or ISO-2 country code
  label: string;
  createdAt: number;
  expiresAt: number;
  reason?: string;
}

export type BanReason = 'bruteforce' | 'geoip' | 'blacklist' | 'whitelist_only';

export interface ActiveBan {
  id: string;
  ip: string;
  countryCode: string;
  countryName: string;
  protocol: ProtocolId | 'ALL';
  reason: BanReason;
  reasonLabel: string;
  escalationLevel: number;
  isPermanent: boolean;
  attemptsCount: number;
  bannedAt: number;
  expiresAt: number | null;
  firewallRuleName: string;
}

export type EventVerdict =
  | 'allowed'
  | 'blocked'
  | 'geo_blocked'
  | 'geo_audit'
  | 'warning'
  | 'whitelisted'
  | 'unprotected';

export type AuthAttemptStatus = 'success' | 'invalid_credentials';

export interface AuthAttemptEvent {
  id: string;
  timestamp: number;
  ip: string;
  countryCode: string;
  countryName: string;
  protocol: ProtocolId;
  username: string;
  eventId: string;
  logonType: string;
  subStatus: string;
  authStatus?: AuthAttemptStatus;
  verdict: EventVerdict;
  summaryRu: string;
  firewallCommand: string;
}

export interface FirewallProfilesState {
  domain: boolean;
  private: boolean;
  public: boolean;
}

export interface SystemControlState {
  serviceStatus: 'running' | 'stopped';
  serviceStartupType: 'auto' | 'manual';
  serviceName: string;
  lastServiceChangeAt: number;
  firewallProfiles: FirewallProfilesState;
  settingsLockEnabled: boolean;
  passwordHash: string;
  isDefaultPassword: boolean;
  installDirectory: string;
  targetOsPreset: 'win7_2008r2' | 'win10_11_server';
  createDesktopShortcut: boolean;
}

export interface FailureWindowRecord {
  timestamps: number[];
  recurrenceCount: number;
  lastBanAt: number | null;
}

export type SmtpSecurityMode = 'starttls' | 'ssl' | 'none';

export interface NotificationSettings {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  security: SmtpSecurityMode;
  smtpUsername: string;
  smtpPassword: string;
  fromEmail: string;
  recipientEmail: string;
  triggers: {
    onPermanentBan: boolean;
    onGeoBlock: boolean;
    onBruteforceBan: boolean;
    onFirewallDisabled: boolean;
  };
  cooldownMinutes: number;
}

export interface AlertDispatchRecord {
  id: string;
  timestamp: number;
  recipient: string;
  subject: string;
  triggerLabel: string;
  ip?: string;
  status: 'sent' | 'error';
  detail: string;
}

export interface DefenderState {
  activePreset: SecurityPresetId;
  policies: Record<ProtocolId, ServicePolicy>;
  escalation: EscalationPolicy;
  geoPolicy: GeoPolicy;
  whitelistOnly: boolean;
  accessList: AccessListEntry[];
  tempAllows: TemporaryAllowException[];
  activeBans: ActiveBan[];
  events: AuthAttemptEvent[];
  failureTracker: Record<string, FailureWindowRecord>; // key: `${ip}|${protocol}`
  system: SystemControlState;
  notifications: NotificationSettings;
  alertHistory: AlertDispatchRecord[];
}

export interface CountryInfo {
  code: string;
  nameRu: string;
  region: 'СНГ' | 'Европа' | 'Азия' | 'Америка' | 'Ближний Восток и Африка';
  samplePrefixes: string[];
  sampleIp: string;
}

export interface EvaluationStep {
  stepNumber: number;
  label: string;
  result: 'pass' | 'match' | 'skip' | 'warn';
  detail: string;
}

export interface SimulationOutcome {
  verdict: EventVerdict;
  headline: string;
  explanation: string;
  ip: string;
  countryCode: string;
  countryName: string;
  protocol: ProtocolId;
  steps: EvaluationStep[];
  appliedBan: ActiveBan | null;
  firewallCommand: string;
  dispatchedAlert?: AlertDispatchRecord | null;
}
