import React, { useState } from 'react';
import { X, Play, CheckCircle2, ShieldAlert, AlertTriangle, MinusCircle } from 'lucide-react';
import type { ProtocolId, SimulationOutcome } from '../types/defender';
import { COUNTRIES } from '../utils/geoip';
import { parseIpOrCidr } from '../utils/network';
import { parseRawWindowsLogLine } from '../utils/ipsEngine';
import { useI18n } from '../i18n/I18nContext';

interface TestAttackModalProps {
  onClose: () => void;
  onRunSimulation: (params: {
    ip: string;
    protocol: ProtocolId;
    username: string;
    attempts: number;
    explicitCountryCode?: string;
  }) => SimulationOutcome;
}

const SAMPLE_EVENT_LOG = `Event ID: 4625 | Logon Type: 10 | Account Name: Administrator | Source Network Address: 185.220.101.44 | Failure Reason: Unknown user name or bad password (0xC000006A)`;

export const TestAttackModal: React.FC<TestAttackModalProps> = ({
  onClose,
  onRunSimulation,
}) => {
  const { t, formatCountry } = useI18n();
  const [mode, setMode] = useState<'scenarios' | 'custom' | 'rawlog'>('scenarios');
  const [ip, setIp] = useState('195.201.84.55');
  const [countryCode, setCountryCode] = useState<string>('AUTO');
  const [protocol, setProtocol] = useState<ProtocolId>('RDP');
  const [username, setUsername] = useState('Administrator');
  const [attempts, setAttempts] = useState(5);
  const [rawLog, setRawLog] = useState(SAMPLE_EVENT_LOG);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<SimulationOutcome | null>(null);

  const runQuickScenario = (scenario: 'bruteforce' | 'geoip' | 'local') => {
    setError('');
    if (scenario === 'bruteforce') {
      const res = onRunSimulation({
        ip: '195.201.84.55',
        protocol: 'RDP',
        username: 'Administrator',
        attempts: 5,
        explicitCountryCode: 'DE',
      });
      setOutcome(res);
    } else if (scenario === 'geoip') {
      const res = onRunSimulation({
        ip: '218.92.0.199',
        protocol: 'RDP',
        username: 'root',
        attempts: 1,
        explicitCountryCode: 'CN',
      });
      setOutcome(res);
    } else {
      const res = onRunSimulation({
        ip: '192.168.1.24',
        protocol: 'SMB',
        username: 'office_pc',
        attempts: 6,
      });
      setOutcome(res);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseIpOrCidr(ip);
    if (!parsed || parsed.isRange) {
      setError(t('testInvalidIp'));
      return;
    }
    setError('');
    const res = onRunSimulation({
      ip: parsed.ip,
      protocol,
      username: username.trim() || 'Administrator',
      attempts: Math.max(1, Math.min(20, attempts)),
      explicitCountryCode: countryCode === 'AUTO' ? undefined : countryCode,
    });
    setOutcome(res);
  };

  const handleRawLogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseRawWindowsLogLine(rawLog);
    if (!parsed.ip) {
      setError(t('testRawLogNoIp'));
      return;
    }
    setError('');
    const res = onRunSimulation({
      ip: parsed.ip,
      protocol: parsed.protocol,
      username: parsed.username,
      attempts: 1,
    });
    setOutcome(res);
  };

  const handleCountrySelect = (cc: string) => {
    setCountryCode(cc);
    if (cc !== 'AUTO') {
      const found = COUNTRIES.find((c) => c.code === cc);
      if (found) setIp(found.sampleIp);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t('testModalTitle')}
    >
      <div className="w-full max-w-2xl bg-surface border border-border-subtle rounded-xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('testModalTitle')}</h2>
            <p className="text-xs text-text-secondary mt-0.5">{t('testModalSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center gap-1 p-1 bg-canvas border border-border-subtle rounded-lg w-fit">
            <button
              type="button"
              onClick={() => { setMode('scenarios'); setError(''); }}
              className={`h-9 px-3.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                mode === 'scenarios'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t('testTabScenarios')}
            </button>
            <button
              type="button"
              onClick={() => { setMode('custom'); setError(''); }}
              className={`h-9 px-3.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                mode === 'custom'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t('testTabCustom')}
            </button>
            <button
              type="button"
              onClick={() => { setMode('rawlog'); setError(''); }}
              className={`h-9 px-3.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                mode === 'rawlog'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t('testTabRawlog')}
            </button>
          </div>

          {mode === 'scenarios' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => runQuickScenario('bruteforce')}
                className="text-left p-4 rounded-lg bg-canvas border border-border-subtle hover:border-accent-hover transition-colors flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-semibold text-text-primary">{t('testScenBruteTitle')}</div>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">{t('testScenBruteDesc')}</p>
                </div>
                <span className="text-xs font-medium text-accent-hover flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" /> {t('testRunBtn')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => runQuickScenario('geoip')}
                className="text-left p-4 rounded-lg bg-canvas border border-border-subtle hover:border-accent-hover transition-colors flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-semibold text-text-primary">{t('testScenGeoTitle')}</div>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">{t('testScenGeoDesc')}</p>
                </div>
                <span className="text-xs font-medium text-accent-hover flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" /> {t('testRunBtn')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => runQuickScenario('local')}
                className="text-left p-4 rounded-lg bg-canvas border border-border-subtle hover:border-accent-hover transition-colors flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-semibold text-text-primary">{t('testScenLocalTitle')}</div>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">{t('testScenLocalDesc')}</p>
                </div>
                <span className="text-xs font-medium text-accent-hover flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" /> {t('testRunBtn')}
                </span>
              </button>
            </div>
          )}

          {mode === 'custom' && (
            <form onSubmit={handleCustomSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    {t('testCountryLabel')}
                  </label>
                  <select
                    value={countryCode}
                    onChange={(e) => handleCountrySelect(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-canvas border border-border-subtle text-sm text-text-primary"
                  >
                    <option value="AUTO">{t('testCountryAuto')}</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {formatCountry(c.code, c.nameRu)} ({c.code}) — {c.sampleIp}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    {t('testAttackerIp')}
                  </label>
                  <input
                    type="text"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    placeholder="195.201.84.55"
                    className="w-full h-10 px-3 rounded-lg bg-canvas border border-border-subtle font-mono text-sm text-text-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    {t('testServiceLabel')}
                  </label>
                  <select
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value as ProtocolId)}
                    className="w-full h-10 px-3 rounded-lg bg-canvas border border-border-subtle text-sm text-text-primary"
                  >
                    <option value="RDP">{t('protoRDP')} (RDP · 3389)</option>
                    <option value="FTP">{t('protoFTP')} (FTP · 21)</option>
                    <option value="SMB">{t('protoSMB')} (SMB · 445)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">
                      {t('testAttemptsLabel')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={attempts}
                      onChange={(e) => setAttempts(Number(e.target.value) || 1)}
                      className="w-full h-10 px-3 rounded-lg bg-canvas border border-border-subtle font-mono text-sm text-text-primary tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">
                      {t('testLoginLabel')}
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-canvas border border-border-subtle text-sm text-text-primary"
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-xs text-danger-text">{error}</p>}

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="h-10 px-5 rounded-lg bg-accent hover:bg-accent-hover text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  {t('testSendBtn')}
                </button>
              </div>
            </form>
          )}

          {mode === 'rawlog' && (
            <form onSubmit={handleRawLogSubmit} className="space-y-3">
              <label className="block text-xs font-medium text-text-secondary">
                {t('testRawLogLabel')}
              </label>
              <textarea
                rows={4}
                value={rawLog}
                onChange={(e) => setRawLog(e.target.value)}
                className="w-full p-3 rounded-lg bg-canvas border border-border-subtle font-mono text-xs text-text-primary leading-relaxed"
              />
              {error && <p className="text-xs text-danger-text">{error}</p>}
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="h-10 px-5 rounded-lg bg-accent hover:bg-accent-hover text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  {t('testParseBtn')}
                </button>
              </div>
            </form>
          )}

          {outcome && (
            <div className="pt-4 border-t border-border-subtle space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-text-secondary flex items-center gap-2">
                    <span className="font-mono text-text-primary">{outcome.ip}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {formatCountry(outcome.countryCode, outcome.countryName)} ({outcome.countryCode})
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{outcome.protocol}</span>
                  </div>
                  <h3
                    className={`text-base font-semibold mt-1 ${
                      outcome.verdict === 'blocked' || outcome.verdict === 'geo_blocked'
                        ? 'text-danger-text'
                        : outcome.verdict === 'whitelisted'
                        ? 'text-ok-text'
                        : 'text-warn-text'
                    }`}
                  >
                    {outcome.headline}
                  </h3>
                  <p className="text-sm text-text-secondary mt-1 leading-relaxed">{outcome.explanation}</p>
                  {outcome.dispatchedAlert && (
                    <p className="text-xs text-ok-text mt-1.5 font-medium">
                      {t('testEmailSent', { email: outcome.dispatchedAlert.recipient })}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-text-secondary">{t('testDecisionSteps')}</div>
                <div className="divide-y divide-border-subtle border border-border-subtle rounded-lg bg-canvas">
                  {outcome.steps.map((s) => (
                    <div key={s.stepNumber} className="px-3.5 py-2.5 flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {s.result === 'pass' && <CheckCircle2 className="w-4 h-4 text-ok" />}
                        {s.result === 'match' && <ShieldAlert className="w-4 h-4 text-danger" />}
                        {s.result === 'warn' && <AlertTriangle className="w-4 h-4 text-warn" />}
                        {s.result === 'skip' && <MinusCircle className="w-4 h-4 text-text-muted" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-text-primary">
                          {s.stepNumber}. {s.label}
                        </div>
                        <div className="text-xs text-text-secondary mt-0.5">{s.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
