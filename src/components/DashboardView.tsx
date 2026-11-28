import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Monitor,
  FolderSync,
  HardDrive,
  Globe,
  Unlock,
  Ban,
  Plus,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { DefenderState, NavSection, ProtocolId } from '../types/defender';
import { getFirewallOverallStatus } from '../utils/ipsEngine';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { IpDetailsModal } from './IpDetailsModal';

interface DashboardViewProps {
  state: DefenderState;
  now: number;
  onToggleProtocol: (protocol: ProtocolId) => void;
  onEnableAllProtection: () => void;
  onUnbanIp: (banId: string) => void;
  onMakeBanPermanent: (banId: string) => void;
  onMoveBanToWhitelist: (banId: string) => void;
  onAddTempAllow: (params: {
    targetType: 'ip' | 'country';
    value: string;
    durationMinutes: number;
    reason?: string;
  }) => void;
  onNavigate: (section: NavSection) => void;
}

const PROTOCOL_ICONS: Record<ProtocolId, React.ReactNode> = {
  RDP: <Monitor className="w-4 h-4" />,
  FTP: <FolderSync className="w-4 h-4" />,
  SMB: <HardDrive className="w-4 h-4" />,
};

const PROTOCOL_TITLE_KEYS: Record<ProtocolId, TranslationKey> = {
  RDP: 'protoRDP',
  FTP: 'protoFTP',
  SMB: 'protoSMB',
};

const CrispBarShape = (props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
}) => {
  const { x = 0, y = 0, width = 0, height = 0, fill } = props;
  if (width <= 0 || height <= 0) return null;
  const rx = Math.round(x);
  const rw = Math.max(1, Math.round(width));
  const ry = Math.round(y);
  const rawH = Math.round(y + height) - ry;
  const rh = rawH > 2 ? rawH - 1 : Math.max(1, rawH);
  return (
    <rect
      x={rx}
      y={ry}
      width={rw}
      height={rh}
      fill={fill}
      shapeRendering="crispEdges"
    />
  );
};

interface ChartTooltipItem {
  name?: string;
  dataKey?: string;
  value?: number | string;
  color?: string;
  payload?: { color?: string; rangeLabel?: string };
}

const ChartTooltip = ({
  active,
  payload,
  label,
  labelMap,
}: {
  active?: boolean;
  payload?: ChartTooltipItem[];
  label?: string;
  labelMap?: Record<string, string>;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const headerLabel = payload[0]?.payload?.rangeLabel || label;
  return (
    <div className="bg-surface-elevated border border-border-strong rounded-lg px-2.5 py-2 text-[11px] shadow-md space-y-1">
      {headerLabel && <div className="font-mono text-text-secondary">{headerLabel}</div>}
      <div className="space-y-0.5">
        {payload.map((item, idx) => {
          const key = String(item.dataKey ?? item.name ?? idx);
          const displayName = labelMap?.[key] ?? String(item.name ?? key);
          const swatchColor = item.color || item.payload?.color;
          return (
            <div key={key} className="flex items-center justify-between gap-4 font-mono tabular-nums">
              <span className="inline-flex items-center gap-1.5 text-text-secondary">
                <span
                  className="w-2 h-2 rounded-xs shrink-0"
                  style={{ backgroundColor: swatchColor }}
                />
                {displayName}
              </span>
              <span className="font-semibold text-text-primary">{item.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const STEP_CANDIDATES = [60, 30, 20, 15, 10] as const;

function pickStepMinutes(chartWidth: number): number {
  const plotWidth = Math.max(200, chartWidth - 36);
  let best = 60;
  for (const step of STEP_CANDIDATES) {
    const count = 1440 / step;
    if (plotWidth / count >= 10) {
      best = step;
    }
  }
  return best;
}

function distributeTotal(total: number, slots: number, seed: number): number[] {
  if (slots <= 1) return [total];
  if (total <= 0) return Array(slots).fill(0);

  const weights: number[] = [];
  let weightSum = 0;
  for (let i = 0; i < slots; i++) {
    const w = 0.55 + 0.45 * Math.sin((seed + 1) * 1.7 + (i + 1) * 2.3);
    weights.push(w);
    weightSum += w;
  }

  const exact = weights.map((w) => (w / weightSum) * total);
  const floors = exact.map((v) => Math.floor(v));
  const remainder = total - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, idx) => ({ idx, frac: v - floors[idx] }))
    .sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < remainder; i++) {
    floors[order[i].idx] += 1;
  }
  return floors;
}

function formatHm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  now,
  onToggleProtocol,
  onEnableAllProtection,
  onUnbanIp,
  onMakeBanPermanent,
  onMoveBanToWhitelist,
  onAddTempAllow,
  onNavigate,
}) => {
  const { t, formatCountry, formatCountdown, formatTime, formatDuration } = useI18n();
  const fwStatus = getFirewallOverallStatus(state.system.firewallProfiles);
  const serviceRunning = state.system.serviceStatus === 'running';
  const enabledProtocolsCount = Object.values(state.policies).filter((p) => p.enabled).length;

  const overallHealth: 'healthy' | 'warning' | 'critical' = useMemo(() => {
    if (!serviceRunning || fwStatus === 'disabled' || enabledProtocolsCount === 0) {
      return 'critical';
    }
    if (fwStatus === 'partial' || enabledProtocolsCount < 3) {
      return 'warning';
    }
    return 'healthy';
  }, [serviceRunning, fwStatus, enabledProtocolsCount]);

  const statusHeadline =
    overallHealth === 'healthy'
      ? t('statusActive')
      : overallHealth === 'warning'
      ? t('statusPartial')
      : t('statusStopped');

  const [chartMode, setChartMode] = useState<'protocols' | 'trend'>('protocols');
  const [selectedBanId, setSelectedBanId] = useState<string | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState<number>(640);

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      if (next > 0) setChartWidth(next);
    };
    updateWidth();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setChartWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stepMinutes = useMemo(() => pickStepMinutes(chartWidth), [chartWidth]);
  const nowTickLabel = t('now');

  const selectedBan = useMemo(
    () => (selectedBanId ? state.activeBans.find((b) => b.id === selectedBanId) ?? null : null),
    [selectedBanId, state.activeBans]
  );
  const currentMinuteBucket = Math.floor(now / 60_000);

  const hourlySeries = useMemo(() => {
    const basePattern: { RDP: number; FTP: number; SMB: number }[] = [
      { RDP: 4, FTP: 1, SMB: 2 },
      { RDP: 3, FTP: 1, SMB: 1 },
      { RDP: 2, FTP: 0, SMB: 1 },
      { RDP: 5, FTP: 2, SMB: 2 },
      { RDP: 7, FTP: 2, SMB: 3 },
      { RDP: 6, FTP: 1, SMB: 2 },
      { RDP: 4, FTP: 1, SMB: 1 },
      { RDP: 3, FTP: 2, SMB: 1 },
      { RDP: 5, FTP: 2, SMB: 2 },
      { RDP: 8, FTP: 3, SMB: 4 },
      { RDP: 11, FTP: 4, SMB: 5 },
      { RDP: 7, FTP: 2, SMB: 3 },
      { RDP: 6, FTP: 3, SMB: 2 },
      { RDP: 9, FTP: 2, SMB: 4 },
      { RDP: 12, FTP: 4, SMB: 5 },
      { RDP: 8, FTP: 3, SMB: 3 },
      { RDP: 7, FTP: 2, SMB: 3 },
      { RDP: 14, FTP: 5, SMB: 6 },
      { RDP: 10, FTP: 3, SMB: 4 },
      { RDP: 8, FTP: 2, SMB: 3 },
      { RDP: 6, FTP: 2, SMB: 2 },
      { RDP: 9, FTP: 3, SMB: 4 },
      { RDP: 11, FTP: 3, SMB: 4 },
      { RDP: 3, FTP: 1, SMB: 1 },
    ];

    const stepMs = stepMinutes * 60_000;
    const slotsPerHour = 60 / stepMinutes;
    const bucketCount = 24 * slotsPerHour;
    const anchorMs = currentMinuteBucket * 60_000;
    const alignedEndStartMs = Math.floor(anchorMs / stepMs) * stepMs;

    const rows: {
      hour: string;
      rangeLabel: string;
      RDP: number;
      FTP: number;
      SMB: number;
      total: number;
      blocked: number;
    }[] = [];

    for (let h = 0; h < 24; h++) {
      const base = basePattern[h];
      const rdpSplits = distributeTotal(base.RDP, slotsPerHour, h * 3 + 1);
      const smbSplits = distributeTotal(base.SMB, slotsPerHour, h * 3 + 2);
      const ftpSplits = distributeTotal(base.FTP, slotsPerHour, h * 3 + 3);
      const hourTotal = base.RDP + base.SMB + base.FTP;
      const hourBlocked = Math.round(hourTotal * 0.72);
      const subTotals = rdpSplits.map((v, s) => v + smbSplits[s] + ftpSplits[s]);

      const blockedSplits = subTotals.map((st) =>
        hourTotal > 0 ? Math.min(st, Math.floor((st / hourTotal) * hourBlocked)) : 0
      );
      let remBlocked = hourBlocked - blockedSplits.reduce((a, b) => a + b, 0);
      for (let s = 0; s < slotsPerHour && remBlocked > 0; s++) {
        if (blockedSplits[s] < subTotals[s]) {
          blockedSplits[s] += 1;
          remBlocked -= 1;
        }
      }

      for (let s = 0; s < slotsPerHour; s++) {
        const idx = h * slotsPerHour + s;
        const stepsAgo = bucketCount - 1 - idx;
        const startDate = new Date(alignedEndStartMs - stepsAgo * stepMs);
        const endDate = new Date(startDate.getTime() + stepMs);
        const startHm = formatHm(startDate);
        const endHm = formatHm(endDate);
        rows.push({
          hour: stepsAgo === 0 ? nowTickLabel : startHm,
          rangeLabel: `${startHm} – ${endHm}`,
          RDP: rdpSplits[s],
          FTP: ftpSplits[s],
          SMB: smbSplits[s],
          total: subTotals[s],
          blocked: blockedSplits[s],
        });
      }
    }

    for (const ev of state.events) {
      if (ev.verdict === 'allowed' || ev.authStatus === 'success') continue;
      const diffSteps = Math.floor((alignedEndStartMs + stepMs - 1 - ev.timestamp) / stepMs);
      if (diffSteps >= 0 && diffSteps < bucketCount) {
        const idx = bucketCount - 1 - diffSteps;
        rows[idx][ev.protocol] += 1;
        rows[idx].total += 1;
        if (ev.verdict === 'blocked' || ev.verdict === 'geo_blocked') {
          rows[idx].blocked += 1;
        }
      }
    }

    return rows;
  }, [state.events, currentMinuteBucket, stepMinutes, nowTickLabel]);

  const totals24h = useMemo(() => {
    return hourlySeries.reduce(
      (acc, r) => ({
        RDP: acc.RDP + r.RDP,
        FTP: acc.FTP + r.FTP,
        SMB: acc.SMB + r.SMB,
        total: acc.total + r.total,
        blocked: acc.blocked + r.blocked,
      }),
      { RDP: 0, FTP: 0, SMB: 0, total: 0, blocked: 0 }
    );
  }, [hourlySeries]);

  const protocolDonutData = useMemo(
    () => [
      { name: 'RDP', key: 'RDP' as const, value: totals24h.RDP, color: 'var(--chart-rdp)' },
      { name: 'SMB', key: 'SMB' as const, value: totals24h.SMB, color: 'var(--chart-smb)' },
      { name: 'FTP', key: 'FTP' as const, value: totals24h.FTP, color: 'var(--chart-ftp)' },
    ],
    [totals24h]
  );

  const topCountries = useMemo(() => {
    const counts = new Map<string, { code: string; name: string; count: number }>();
    for (const ev of state.events) {
      if (ev.countryCode === 'LOCAL' || ev.verdict === 'allowed' || ev.authStatus === 'success') continue;
      const existing = counts.get(ev.countryCode);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(ev.countryCode, { code: ev.countryCode, name: ev.countryName, count: 1 });
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [state.events]);

  const geoShortStatus =
    state.geoPolicy.mode === 'disabled'
      ? t('off')
      : state.geoPolicy.mode === 'allowlist'
      ? t('geoOnlyCountries', { n: state.geoPolicy.selectedCountries.length })
      : t('geoBlockCountries', { n: state.geoPolicy.selectedCountries.length });

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* Row 1: Compact Unified Protection & KPI Strip */}
      <section className="shrink-0 bg-surface border border-border-subtle rounded-xl px-4 py-3 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
              overallHealth === 'healthy'
                ? 'bg-ok/12 border-ok/30 text-ok-text'
                : overallHealth === 'warning'
                ? 'bg-warn/12 border-warn/30 text-warn-text'
                : 'bg-danger/12 border-danger/30 text-danger-text'
            }`}
          >
            {overallHealth === 'healthy' ? (
              <ShieldCheck className="w-5 h-5" />
            ) : overallHealth === 'warning' ? (
              <ShieldAlert className="w-5 h-5" />
            ) : (
              <ShieldOff className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold text-text-primary leading-tight truncate">
              {statusHeadline}
            </div>
            <div className="text-xs text-text-secondary flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span>
                {t('serviceLabel')}:{' '}
                <strong className={serviceRunning ? 'text-ok-text font-medium' : 'text-danger-text font-medium'}>
                  {serviceRunning ? t('on') : t('off')}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {t('firewallLabel')}:{' '}
                <strong
                  className={
                    fwStatus === 'enabled'
                      ? 'text-ok-text font-medium'
                      : fwStatus === 'partial'
                      ? 'text-warn-text font-medium'
                      : 'text-danger-text font-medium'
                  }
                >
                  {fwStatus === 'enabled' ? t('on') : fwStatus === 'partial' ? t('partial') : t('off')}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                GeoIP: <strong className="text-text-primary font-medium">{geoShortStatus}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Compact KPIs + Action */}
        <div className="flex flex-wrap items-center gap-4 shrink-0">
          <div className="flex items-center gap-5">
            <div>
              <div className="text-[11px] text-text-secondary">{t('kpiBans')}</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-text-primary leading-tight">
                {state.activeBans.length}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-text-secondary">{t('kpi24h')}</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-text-primary leading-tight">
                {totals24h.total}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-text-secondary">{t('kpiWhitelist')}</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-text-primary leading-tight">
                {state.accessList.filter((e) => e.type === 'whitelist').length}
              </div>
            </div>
          </div>

          {overallHealth !== 'healthy' && (
            <button
              type="button"
              onClick={onEnableAllProtection}
              className="h-9 px-3.5 rounded-lg bg-ok hover:bg-ok-text text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
            >
              {t('enableProtection')}
            </button>
          )}
        </div>
      </section>

      {/* Row 2: Compact 3-Protocol Switch Bar */}
      <section className="shrink-0 grid grid-cols-1 md:grid-cols-3 gap-3">
        {(['RDP', 'FTP', 'SMB'] as ProtocolId[]).map((pid) => {
          const p = state.policies[pid];
          return (
            <div
              key={pid}
              className="bg-surface border border-border-subtle rounded-xl px-4 py-2.5 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                    p.enabled
                      ? 'bg-surface-elevated border-border-strong text-accent-hover'
                      : 'bg-canvas border-border-subtle text-text-muted'
                  }`}
                >
                  {PROTOCOL_ICONS[pid]}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text-primary truncate">
                    {t(PROTOCOL_TITLE_KEYS[pid])}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-text-secondary">
                    {p.protocol} :{p.port} · {p.maxAttempts} / {p.windowMinutes}{t('minutesShort')}
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={p.enabled}
                aria-label={t('toggleProtocolAria', { protocol: p.protocol })}
                onClick={() => onToggleProtocol(pid)}
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
            </div>
          );
        })}
      </section>

      {/* Row 3: Compact Recharts Analytics (24h Intensity + Share & Countries) */}
      <div className="shrink-0 grid grid-cols-1 lg:grid-cols-12 gap-3">
        <section className="lg:col-span-8 min-w-0 bg-surface border border-border-subtle rounded-xl p-4 flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-baseline gap-2 min-w-0">
                <h2 className="text-sm font-semibold text-text-primary truncate">
                  {t('chartTitle24h')}
                </h2>
                <span className="text-[11px] font-mono tabular-nums text-text-muted whitespace-nowrap shrink-0">
                  · {t('chartStepPrefix', { step: formatDuration(stepMinutes) })}
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-3 text-[11px] text-text-secondary">
                {chartMode === 'protocols' ? (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-xs" style={{ backgroundColor: 'var(--chart-rdp)' }} />
                      RDP <strong className="font-mono tabular-nums text-text-primary">{totals24h.RDP}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-xs" style={{ backgroundColor: 'var(--chart-smb)' }} />
                      SMB <strong className="font-mono tabular-nums text-text-primary">{totals24h.SMB}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-xs" style={{ backgroundColor: 'var(--chart-ftp)' }} />
                      FTP <strong className="font-mono tabular-nums text-text-primary">{totals24h.FTP}</strong>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-xs" style={{ backgroundColor: 'var(--chart-rdp)' }} />
                      {t('chartTotal')} <strong className="font-mono tabular-nums text-text-primary">{totals24h.total}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-xs" style={{ backgroundColor: 'var(--chart-blocked)' }} />
                      {t('chartBlocked')} <strong className="font-mono tabular-nums text-text-primary">{totals24h.blocked}</strong>
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 p-0.5 bg-canvas border border-border-subtle rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setChartMode('protocols')}
                className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  chartMode === 'protocols'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('chartTabServices')}
              </button>
              <button
                type="button"
                onClick={() => setChartMode('trend')}
                className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  chartMode === 'trend'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('chartTabTrend')}
              </button>
            </div>
          </div>

          <div
            ref={chartContainerRef}
            className="h-[164px] w-full min-w-0"
            aria-label={t('chartAriaLabel')}
          >
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === 'protocols' ? (
                <BarChart
                  data={hourlySeries}
                  barCategoryGap="20%"
                  margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                    axisLine={{ stroke: 'var(--border-subtle)' }}
                    tickLine={false}
                    minTickGap={42}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip cursor={{ fill: 'var(--chart-cursor)' }} content={<ChartTooltip />} />
                  <Bar dataKey="RDP" stackId="a" fill="var(--chart-rdp)" maxBarSize={26} shape={<CrispBarShape />} />
                  <Bar dataKey="SMB" stackId="a" fill="var(--chart-smb)" maxBarSize={26} shape={<CrispBarShape />} />
                  <Bar dataKey="FTP" stackId="a" fill="var(--chart-ftp)" maxBarSize={26} shape={<CrispBarShape />} />
                </BarChart>
              ) : (
                <AreaChart data={hourlySeries} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spdTotalFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" style={{ stopColor: 'var(--chart-rdp)', stopOpacity: 0.28 }} />
                      <stop offset="95%" style={{ stopColor: 'var(--chart-rdp)', stopOpacity: 0.02 }} />
                    </linearGradient>
                    <linearGradient id="spdBlockedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" style={{ stopColor: 'var(--chart-blocked)', stopOpacity: 0.24 }} />
                      <stop offset="95%" style={{ stopColor: 'var(--chart-blocked)', stopOpacity: 0.02 }} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                    axisLine={{ stroke: 'var(--border-subtle)' }}
                    tickLine={false}
                    minTickGap={42}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip
                        labelMap={{ total: t('chartTotal'), blocked: t('chartBlockedFull') }}
                      />
                    }
                  />
                  <Area type="monotone" dataKey="total" stroke="var(--chart-rdp)" strokeWidth={2} fill="url(#spdTotalFill)" />
                  <Area type="monotone" dataKey="blocked" stroke="var(--chart-blocked)" strokeWidth={2} fill="url(#spdBlockedFill)" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </section>

        {/* Compact Right Card: Donut + Top Countries */}
        <section className="lg:col-span-4 min-w-0 bg-surface border border-border-subtle rounded-xl p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-[84px] h-[84px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={protocolDonutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={24}
                    outerRadius={38}
                    stroke="var(--bg-surface)"
                    strokeWidth={2}
                  >
                    {protocolDonutData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex-1 space-y-1.5 text-xs min-w-0">
              <div className="text-xs font-semibold text-text-primary mb-1">{t('serviceShare24h')}</div>
              {protocolDonutData.map((item) => {
                const pct =
                  totals24h.total > 0 ? Math.round((item.value / totals24h.total) * 100) : 0;
                return (
                  <div key={item.key} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-text-secondary">
                      <span
                        className="w-2 h-2 rounded-xs shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      {item.name}
                    </span>
                    <span className="font-mono tabular-nums text-text-primary">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2.5 border-t border-border-subtle space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-accent-hover" />
                {t('topCountries')}
              </span>
              <button
                type="button"
                onClick={() => onNavigate('geoip')}
                className="text-[11px] font-medium text-accent-hover hover:text-accent-link-hover"
              >
                GeoIP →
              </button>
            </div>
            <div className="space-y-1">
              {topCountries.map((c) => {
                const isGeoSelected = state.geoPolicy.selectedCountries.includes(c.code);
                const isBlockedByGeo =
                  (state.geoPolicy.mode === 'blacklist' && isGeoSelected) ||
                  (state.geoPolicy.mode === 'allowlist' && !isGeoSelected);
                return (
                  <div key={c.code} className="flex items-center justify-between text-xs">
                    <span className="text-text-primary truncate">
                      <span className="font-mono text-text-secondary mr-1.5">{c.code}</span>
                      {formatCountry(c.code, c.name)}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-text-secondary shrink-0">
                      {c.count} ·{' '}
                      <span className={isBlockedByGeo ? 'text-danger-text' : 'text-text-secondary'}>
                        {isBlockedByGeo ? t('geoRuleTag') : t('thresholdRuleTag')}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Row 4: Dynamic-Height Active Bans Table */}
      <section className="flex-1 min-h-[180px] bg-surface border border-border-subtle rounded-xl overflow-hidden flex flex-col">
        <div className="shrink-0 px-4 py-2.5 border-b border-border-subtle flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('activeBansTitle', { n: state.activeBans.length })}
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('events')}
            className="text-xs font-medium text-text-secondary hover:text-text-primary whitespace-nowrap"
          >
            {t('logLink')}
          </button>
        </div>

        {state.activeBans.length === 0 ? (
          <div className="flex-1 px-4 py-6 flex items-center justify-center text-xs text-text-secondary">
            {t('noActiveBans')}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-surface border-b border-border-subtle text-[11px] font-medium text-text-secondary">
                <tr>
                  <th className="py-2 px-4">{t('colIpCountry')}</th>
                  <th className="py-2 px-3">{t('colService')}</th>
                  <th className="py-2 px-3">{t('colReason')}</th>
                  <th className="py-2 px-3">{t('colStage')}</th>
                  <th className="py-2 px-3 text-right">{t('colRemaining')}</th>
                  <th className="py-2 px-4 text-right">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-xs">
                {state.activeBans.map((ban) => (
                  <tr key={ban.id} className="hover:bg-surface-elevated/60 transition-colors">
                    <td className="py-2 px-4 whitespace-nowrap font-mono tabular-nums">
                      <button
                        type="button"
                        onClick={() => setSelectedBanId(ban.id)}
                        title={t('ipDetailsTitle')}
                        className="text-text-primary hover:text-accent-hover hover:underline underline-offset-2 font-medium transition-colors"
                      >
                        {ban.ip}
                      </button>
                      <span className="text-text-secondary font-sans ml-2">{ban.countryCode}</span>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap font-mono text-text-primary">
                      {ban.protocol === 'ALL' ? t('all') : ban.protocol}
                    </td>
                    <td className="py-2 px-3 text-text-secondary truncate max-w-[260px] xl:max-w-[460px]">
                      {ban.reasonLabel} · <span className="font-mono text-text-muted">{formatTime(ban.bannedAt)}</span>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span
                        className={
                          ban.isPermanent
                            ? 'text-danger-text font-medium'
                            : ban.escalationLevel >= 3
                            ? 'text-warn-text font-medium'
                            : 'text-text-secondary'
                        }
                      >
                        {ban.isPermanent ? t('forever') : `${ban.escalationLevel}/4`}
                      </span>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap text-right font-mono tabular-nums">
                      <span className={ban.isPermanent ? 'text-danger-text font-medium' : 'text-text-primary'}>
                        {formatCountdown(ban.expiresAt, now)}
                      </span>
                    </td>
                    <td className="py-2 px-4 whitespace-nowrap text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onUnbanIp(ban.id)}
                          title={t('unbanFull')}
                          className="h-7 px-2 rounded border border-border-subtle hover:border-ok-text text-[11px] font-medium text-text-primary hover:text-ok-text transition-colors inline-flex items-center gap-1"
                        >
                          <Unlock className="w-3 h-3" />
                          {t('unban')}
                        </button>
                        {!ban.isPermanent && (
                          <button
                            type="button"
                            onClick={() => onMakeBanPermanent(ban.id)}
                            title={t('makePermanentTitle')}
                            className="h-7 px-2 rounded border border-border-subtle hover:border-danger-text text-[11px] text-text-secondary hover:text-danger-text transition-colors inline-flex items-center gap-1"
                          >
                            <Ban className="w-3 h-3" />
                            ∞
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onMoveBanToWhitelist(ban.id)}
                          title={t('addToWlTitle')}
                          className="h-7 px-2 rounded border border-border-subtle hover:border-accent-hover text-[11px] text-text-secondary hover:text-accent-hover transition-colors inline-flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          WL
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedBan && (
        <IpDetailsModal
          ban={selectedBan}
          state={state}
          now={now}
          onClose={() => setSelectedBanId(null)}
          onUnbanIp={onUnbanIp}
          onMakeBanPermanent={onMakeBanPermanent}
          onMoveBanToWhitelist={onMoveBanToWhitelist}
          onAddTempAllow={onAddTempAllow}
        />
      )}
    </div>
  );
};
