import React, { useMemo, useState } from 'react';
import { Globe, Search, Check, X } from 'lucide-react';
import type { DefenderState, GeoAction, GeoMode, GeoPolicy, ProtocolId } from '../types/defender';
import { COUNTRIES, GEO_PRESETS } from '../utils/geoip';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';

interface GeoIpViewProps {
  state: DefenderState;
  now: number;
  onUpdateGeoPolicy: (patch: Partial<GeoPolicy>) => void;
}

const REGIONS = ['Все регионы', 'СНГ', 'Европа', 'Азия', 'Америка', 'Ближний Восток и Африка'] as const;

const GEO_PRESET_KEYS: Record<string, TranslationKey> = {
  ru_only: 'geoPresetRuOnly',
  cis_only: 'geoPresetCis',
  block_top_attackers: 'geoPresetBlockTop',
};

export const GeoIpView: React.FC<GeoIpViewProps> = ({
  state,
  now,
  onUpdateGeoPolicy,
}) => {
  const { t, formatCountry, formatRegion, formatCountdown } = useI18n();
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState<(typeof REGIONS)[number]>('Все регионы');
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  const { geoPolicy } = state;
  const tempCountryAllows = useMemo(
    () => (state.tempAllows || []).filter((t) => t.targetType === 'country'),
    [state.tempAllows]
  );

  const attacksByCountry = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ev of state.events) {
      map[ev.countryCode] = (map[ev.countryCode] || 0) + 1;
    }
    return map;
  }, [state.events]);

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return COUNTRIES.filter((c) => {
      if (regionFilter !== 'Все регионы' && c.region !== regionFilter) return false;
      if (showOnlySelected && !geoPolicy.selectedCountries.includes(c.code)) return false;
      if (q) {
        const localized = formatCountry(c.code, c.nameRu).toLowerCase();
        return (
          localized.includes(q) ||
          c.nameRu.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q)
        );
      }
      return true;
    }).sort((a, b) => {
      const aSelected = geoPolicy.selectedCountries.includes(a.code) ? 1 : 0;
      const bSelected = geoPolicy.selectedCountries.includes(b.code) ? 1 : 0;
      if (aSelected !== bSelected) return bSelected - aSelected;
      return (attacksByCountry[b.code] || 0) - (attacksByCountry[a.code] || 0);
    });
  }, [search, regionFilter, showOnlySelected, geoPolicy.selectedCountries, attacksByCountry, formatCountry]);

  const toggleCountry = (code: string) => {
    const exists = geoPolicy.selectedCountries.includes(code);
    const next = exists
      ? geoPolicy.selectedCountries.filter((c) => c !== code)
      : [...geoPolicy.selectedCountries, code];
    onUpdateGeoPolicy({ selectedCountries: next });
  };

  const toggleProtocol = (protocol: ProtocolId) => {
    const exists = geoPolicy.protocols.includes(protocol);
    const next = exists
      ? geoPolicy.protocols.filter((p) => p !== protocol)
      : [...geoPolicy.protocols, protocol];
    onUpdateGeoPolicy({ protocols: next });
  };

  const modes: { id: GeoMode; label: string }[] = [
    { id: 'disabled', label: t('geoModeDisabled') },
    { id: 'blacklist', label: t('geoModeBlacklist') },
    { id: 'allowlist', label: t('geoModeAllowlist') },
  ];

  return (
    <div className="space-y-4">
      {/* Compact Controls Strip */}
      <section className="bg-surface border border-border-subtle rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-0.5 bg-canvas border border-border-subtle rounded-lg">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onUpdateGeoPolicy({ mode: m.id })}
                className={`h-8 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  geoPolicy.mode === m.id
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['RDP', 'FTP', 'SMB'] as ProtocolId[]).map((pid) => {
              const selected = geoPolicy.protocols.includes(pid);
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => toggleProtocol(pid)}
                  className={`h-8 px-3 rounded-lg border text-xs font-mono transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    selected
                      ? 'bg-accent/15 border-accent-hover text-text-primary'
                      : 'bg-canvas border-border-subtle text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {selected && <Check className="w-3 h-3 text-accent-hover" />}
                  {pid}
                </button>
              );
            })}

            <div className="flex items-center gap-1 p-0.5 bg-canvas border border-border-subtle rounded-lg">
              {(
                [
                  { id: 'block', label: t('geoActionBlock') },
                  { id: 'audit', label: t('geoActionAudit') },
                ] as { id: GeoAction; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdateGeoPolicy({ action: opt.id })}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    geoPolicy.action === opt.id
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-2.5 border-t border-border-subtle flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {GEO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  onUpdateGeoPolicy({
                    mode: preset.mode,
                    selectedCountries: [...preset.countries],
                  })
                }
                className="h-8 px-3 rounded-lg bg-canvas border border-border-subtle hover:border-accent-hover text-xs font-medium text-text-primary transition-colors whitespace-nowrap"
              >
                {GEO_PRESET_KEYS[preset.id] ? t(GEO_PRESET_KEYS[preset.id]) : preset.label}
              </button>
            ))}
            {geoPolicy.selectedCountries.length > 0 && (
              <button
                type="button"
                onClick={() => onUpdateGeoPolicy({ selectedCountries: [] })}
                className="h-8 px-2.5 rounded-lg bg-canvas border border-border-subtle hover:border-danger-text text-xs text-text-secondary hover:text-danger-text transition-colors whitespace-nowrap inline-flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                {t('geoClearSelected', { n: geoPolicy.selectedCountries.length })}
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={geoPolicy.bypassPrivateNetworks}
              onChange={(e) => onUpdateGeoPolicy({ bypassPrivateNetworks: e.target.checked })}
              className="w-3.5 h-3.5 rounded accent-accent"
            />
            {t('geoBypassLocal')}
          </label>
        </div>
      </section>

      {/* Compact Country Table */}
      <section className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-subtle flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Globe className="w-4 h-4 text-accent-hover" />
            {t('countriesCount', { n: geoPolicy.selectedCountries.length })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('search')}
                className="h-8 pl-8 pr-2.5 w-44 rounded-lg bg-canvas border border-border-subtle text-xs text-text-primary placeholder:text-text-muted"
              />
            </div>

            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value as (typeof REGIONS)[number])}
              aria-label={t('colRegion')}
              className="h-8 px-2.5 rounded-lg bg-canvas border border-border-subtle text-xs text-text-primary"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {formatRegion(r)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowOnlySelected((v) => !v)}
              className={`h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                showOnlySelected
                  ? 'bg-accent border-accent text-white'
                  : 'bg-canvas border-border-subtle text-text-secondary hover:text-text-primary'
              }`}
            >
              {t('onlySelected')}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-surface border-b border-border-subtle text-[11px] font-medium text-text-secondary">
              <tr>
                <th className="py-2 px-4 w-10"></th>
                <th className="py-2 px-3">{t('colCountry')}</th>
                <th className="py-2 px-3">{t('colRegion')}</th>
                <th className="py-2 px-3 text-right">{t('colAttacks')}</th>
                <th className="py-2 px-4 text-right">{t('colStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filteredCountries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-secondary">
                    {t('nothingFound')}
                  </td>
                </tr>
              ) : (
                filteredCountries.map((country) => {
                  const isSelected = geoPolicy.selectedCountries.includes(country.code);
                  const attackCount = attacksByCountry[country.code] || 0;
                  const tempAllow = tempCountryAllows.find((item) => item.value === country.code);
                  const localizedCountry = formatCountry(country.code, country.nameRu);
                  const statusInfo = tempAllow
                    ? {
                        text: t('statusOpenTemp', { time: formatCountdown(tempAllow.expiresAt, now) }),
                        cls: 'text-ok-text font-medium font-mono tabular-nums',
                      }
                    : geoPolicy.mode === 'disabled'
                    ? { text: t('off'), cls: 'text-text-muted' }
                    : geoPolicy.mode === 'allowlist'
                    ? isSelected
                      ? { text: t('statusAllowed'), cls: 'text-ok-text font-medium' }
                      : { text: t('statusBlocked'), cls: 'text-danger-text' }
                    : isSelected
                    ? { text: t('statusBlocked'), cls: 'text-danger-text font-medium' }
                    : { text: t('statusAllowed'), cls: 'text-text-secondary' };

                  return (
                    <tr
                      key={country.code}
                      onClick={() => toggleCountry(country.code)}
                      className="hover:bg-surface-elevated/60 transition-colors cursor-pointer"
                    >
                      <td className="py-2 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCountry(country.code)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={localizedCountry}
                          className="w-3.5 h-3.5 rounded accent-accent cursor-pointer"
                        />
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className="font-mono text-text-secondary mr-2">{country.code}</span>
                        <span className="text-text-primary font-medium">{localizedCountry}</span>
                      </td>
                      <td className="py-2 px-3 text-text-secondary whitespace-nowrap">
                        {formatRegion(country.region)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-text-primary">
                        {attackCount}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <span className={statusInfo.cls}>{statusInfo.text}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
