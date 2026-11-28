import React, { useMemo, useState } from 'react';
import { Search, Download, ChevronDown, ChevronUp } from 'lucide-react';
import type {
  AuthAttemptEvent,
  AuthAttemptStatus,
  DefenderState,
  EventVerdict,
  ProtocolId,
} from '../types/defender';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';

interface EventLogViewProps {
  state: DefenderState;
}

const VERDICT_META: Record<EventVerdict, { labelKey: TranslationKey; color: string }> = {
  allowed: { labelKey: 'verdictAllowed', color: 'text-ok-text' },
  blocked: { labelKey: 'verdictBlocked', color: 'text-danger-text' },
  geo_blocked: { labelKey: 'verdictGeoBlocked', color: 'text-danger-text' },
  geo_audit: { labelKey: 'verdictGeoAudit', color: 'text-warn-text' },
  warning: { labelKey: 'verdictWarning', color: 'text-warn-text' },
  whitelisted: { labelKey: 'verdictWhitelisted', color: 'text-ok-text' },
  unprotected: { labelKey: 'verdictUnprotected', color: 'text-text-secondary' },
};

function resolveAuthStatus(ev: AuthAttemptEvent): AuthAttemptStatus {
  if (ev.authStatus) return ev.authStatus;
  if (ev.verdict === 'allowed' || ev.eventId === '4624' || ev.eventId === 'FTP-230') {
    return 'success';
  }
  return 'invalid_credentials';
}

export const EventLogView: React.FC<EventLogViewProps> = ({ state }) => {
  const { t, formatDateTime, formatCountry } = useI18n();
  const [protocolFilter, setProtocolFilter] = useState<'ALL' | ProtocolId>('ALL');
  const [verdictFilter, setVerdictFilter] = useState<
    'ALL' | 'success' | 'blocked_any' | 'warning' | 'whitelisted'
  >('ALL');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.events.filter((ev) => {
      if (protocolFilter !== 'ALL' && ev.protocol !== protocolFilter) return false;
      const authStatus = resolveAuthStatus(ev);
      if (verdictFilter === 'success' && authStatus !== 'success') return false;
      if (verdictFilter === 'blocked_any' && ev.verdict !== 'blocked' && ev.verdict !== 'geo_blocked') {
        return false;
      }
      if (verdictFilter === 'warning' && ev.verdict !== 'warning' && ev.verdict !== 'geo_audit') {
        return false;
      }
      if (verdictFilter === 'whitelisted' && ev.verdict !== 'whitelisted') return false;
      if (q) {
        const localizedCountry = formatCountry(ev.countryCode, ev.countryName).toLowerCase();
        return (
          ev.ip.toLowerCase().includes(q) ||
          ev.username.toLowerCase().includes(q) ||
          ev.countryName.toLowerCase().includes(q) ||
          localizedCountry.includes(q) ||
          ev.countryCode.toLowerCase().includes(q) ||
          ev.summaryRu.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [state.events, protocolFilter, verdictFilter, search, formatCountry]);

  const handleExportCsv = () => {
    const header = [
      t('colTime'),
      'IP',
      t('colCountry'),
      t('colService'),
      t('ipColLogin'),
      t('colAuthState'),
      t('colResult'),
      'EventID',
    ];
    const rows = filteredEvents.map((ev: AuthAttemptEvent) => {
      const authStatus = resolveAuthStatus(ev);
      const authLabel = authStatus === 'success' ? t('authStateSuccess') : t('authStateInvalid');
      const resultLabel = `${t(VERDICT_META[ev.verdict].labelKey)} · ${ev.summaryRu}`;
      return [
        formatDateTime(ev.timestamp),
        ev.ip,
        `${ev.countryCode} ${formatCountry(ev.countryCode, ev.countryName)}`,
        ev.protocol,
        ev.username,
        authLabel,
        resultLabel.replace(/"/g, '""'),
        ev.eventId,
      ];
    });
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'serverpro-defender-log.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Compact Filter Bar */}
      <section className="bg-surface border border-border-subtle rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-0.5 bg-canvas border border-border-subtle rounded-lg">
            {(['ALL', 'RDP', 'FTP', 'SMB'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProtocolFilter(p)}
                className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  protocolFilter === p ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {p === 'ALL' ? t('all') : p}
              </button>
            ))}
          </div>

          <select
            value={verdictFilter}
            onChange={(e) => setVerdictFilter(e.target.value as typeof verdictFilter)}
            aria-label={t('colStatus')}
            className="h-8 px-2.5 rounded-lg bg-canvas border border-border-subtle text-xs text-text-primary"
          >
            <option value="ALL">{t('filterAllStatuses')}</option>
            <option value="success">{t('filterSuccess')}</option>
            <option value="blocked_any">{t('filterBlocks')}</option>
            <option value="warning">{t('filterWarnings')}</option>
            <option value="whitelisted">{t('filterWhitelist')}</option>
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchEventsPlaceholder')}
              className="h-8 pl-8 pr-2.5 w-48 rounded-lg bg-canvas border border-border-subtle text-xs text-text-primary placeholder:text-text-muted"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredEvents.length === 0}
            className="h-8 px-3 rounded-lg border border-border-subtle hover:border-border-strong disabled:opacity-40 text-xs font-medium text-text-primary transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-text-secondary" />
            CSV
          </button>
        </div>
      </section>

      {/* Compact Connection Log Table */}
      <section className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('eventLogTitle', { n: filteredEvents.length })}
          </h2>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="py-10 px-4 text-center text-xs text-text-secondary">
            {t('noEventsFound')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] font-medium text-text-secondary">
                  <th className="py-2 px-4">{t('colTime')}</th>
                  <th className="py-2 px-3">{t('colIpCountry')}</th>
                  <th className="py-2 px-3">{t('colServiceLogin')}</th>
                  <th className="py-2 px-3">{t('colAuthState')}</th>
                  <th className="py-2 px-3">{t('colResult')}</th>
                  <th className="py-2 px-4 text-right">{t('colDetails')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredEvents.map((ev) => {
                  const isExpanded = expandedId === ev.id;
                  const meta = VERDICT_META[ev.verdict] || VERDICT_META.warning;
                  const authStatus = resolveAuthStatus(ev);
                  const isSuccess = authStatus === 'success';
                  return (
                    <React.Fragment key={ev.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                        className="hover:bg-surface-elevated/60 transition-colors cursor-pointer"
                      >
                        <td className="py-2 px-4 font-mono text-text-secondary tabular-nums whitespace-nowrap">
                          {formatDateTime(ev.timestamp)}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap font-mono tabular-nums">
                          <span className="text-text-primary font-medium">{ev.ip}</span>
                          <span className="text-text-secondary font-sans ml-2">{ev.countryCode}</span>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="font-mono text-text-primary">{ev.protocol}</span>
                          <span className="text-text-muted mx-1.5">·</span>
                          <span className="text-text-secondary">{ev.username}</span>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`font-medium ${
                              isSuccess ? 'text-ok-text' : 'text-warn-text'
                            }`}
                          >
                            {isSuccess ? t('authStateSuccess') : t('authStateInvalid')}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`font-medium ${meta.color}`}>{t(meta.labelKey)}</span>
                          <span className="text-text-muted mx-1.5">·</span>
                          <span className="text-text-secondary">{ev.summaryRu}</span>
                        </td>
                        <td className="py-2 px-4 text-right whitespace-nowrap text-text-secondary">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 inline" /> : <ChevronDown className="w-3.5 h-3.5 inline" />}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-canvas/70">
                          <td colSpan={6} className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] font-mono text-text-secondary">
                              <span>EventID: <strong className="text-text-primary">{ev.eventId}</strong></span>
                              <span>LogonType: <strong className="text-text-primary">{ev.logonType}</strong></span>
                              <span>SubStatus: <strong className="text-text-primary">{ev.subStatus}</strong></span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
