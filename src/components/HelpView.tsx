import React, { useState } from 'react';
import {
  Shield,
  SlidersHorizontal,
  Globe,
  ListChecks,
  Bell,
  Server,
  Lock,
} from 'lucide-react';
import { DEFAULT_ADMIN_PASSWORD, WHITELIST_ONLY_RULE_NAME } from '../utils/ipsEngine';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';

type HelpTopicId = 'overview' | 'protocols' | 'geoip' | 'lists' | 'notifications' | 'system';

const TOPICS: { id: HelpTopicId; labelKey: TranslationKey; bodyKey: TranslationKey; icon: React.ReactNode }[] = [
  { id: 'overview', labelKey: 'helpTopicOverview', bodyKey: 'helpOverviewBody', icon: <Shield className="w-4 h-4" /> },
  { id: 'protocols', labelKey: 'helpTopicProtocols', bodyKey: 'helpProtocolsBody', icon: <SlidersHorizontal className="w-4 h-4" /> },
  { id: 'geoip', labelKey: 'helpTopicGeoip', bodyKey: 'helpGeoipBody', icon: <Globe className="w-4 h-4" /> },
  { id: 'lists', labelKey: 'helpTopicLists', bodyKey: 'helpListsBody', icon: <ListChecks className="w-4 h-4" /> },
  { id: 'notifications', labelKey: 'helpTopicNotifications', bodyKey: 'helpNotificationsBody', icon: <Bell className="w-4 h-4" /> },
  { id: 'system', labelKey: 'helpTopicSystem', bodyKey: 'helpSystemBody', icon: <Server className="w-4 h-4" /> },
];

export const HelpView: React.FC = () => {
  const { t, lang } = useI18n();
  const [topic, setTopic] = useState<HelpTopicId>('overview');
  const activeMeta = TOPICS.find((item) => item.id === topic) || TOPICS[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left Topic Navigation */}
      <aside className="lg:col-span-3">
        <div className="bg-surface border border-border-subtle rounded-xl p-2 space-y-1 sticky top-0">
          {TOPICS.map((item) => {
            const active = topic === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTopic(item.id)}
                className={`w-full h-9 px-3 rounded-lg text-xs font-medium transition-colors flex items-center gap-2.5 whitespace-nowrap text-left ${
                  active
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="truncate">{t(item.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right Content Panel */}
      <div className="lg:col-span-9 bg-surface border border-border-subtle rounded-xl p-6 space-y-6 text-sm text-text-secondary leading-relaxed">
        {lang !== 'ru' ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-text-primary">{t(activeMeta.labelKey)}</h2>
            <p>{t(activeMeta.bodyKey)}</p>
            {topic === 'lists' && (
              <div className="p-3.5 rounded-lg bg-canvas border border-border-subtle font-mono text-xs text-text-secondary space-y-1">
                <div>192.168.1.10 · 192.168.1.0/24 · 192.168.0.0/16 · 10.0.0.0/8</div>
                <div>{WHITELIST_ONLY_RULE_NAME}: enable=yes / enable=no</div>
              </div>
            )}
            {topic === 'system' && (
              <div className="p-3.5 rounded-lg bg-canvas border border-border-subtle text-xs text-text-secondary">
                {t('pwdDefaultHint')}: <span className="font-mono text-text-primary">{DEFAULT_ADMIN_PASSWORD}</span>
              </div>
            )}
          </div>
        ) : (
          <>
            {topic === 'overview' && (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Как работает ServerPro Defender</h2>
                  <p className="mt-2">
                    <strong className="text-text-primary">ServerPro Defender</strong> защищает компьютер или сервер Windows от автоматического подбора паролей (brute-force атак) и нежелательных подключений из-за рубежа. Программа читает журнал безопасности Windows (<span className="font-mono text-text-primary">Event ID 4624 / 4625</span>) и логи FTP-сервера, после чего автоматически управляет правилами в брандмауэре Windows (<span className="font-mono text-text-primary">netsh advfirewall</span>).
                  </p>
                </div>

                <div className="space-y-3 pt-4 border-t border-border-subtle">
                  <h3 className="text-sm font-semibold text-text-primary">Порядок проверки каждого подключения</h3>
                  <ol className="space-y-2.5 list-decimal list-inside">
                    <li>
                      <strong className="text-text-primary">Готовность защиты:</strong> проверяется, запущена ли служба Windows <span className="font-mono text-text-primary">ServerProDefender</span>, включен ли брандмауэр Windows и активна ли защита нужного протокола.
                    </li>
                    <li>
                      <strong className="text-ok-text">Белый список (высший приоритет):</strong> доверенные IP-адреса и подсети (<span className="font-mono text-text-primary">192.168.0.0/16</span>, <span className="font-mono text-text-primary">127.0.0.1</span>) никогда не блокируются.
                    </li>
                    <li>
                      <strong className="text-text-primary">Режим «Разрешить только из белого списка»:</strong> если включен, правило брандмауэра <span className="font-mono text-text-primary">{WHITELIST_ONLY_RULE_NAME}</span> активно (<span className="font-mono text-text-primary">enable=yes</span>) и отклоняет все остальные адреса; при выключении правило становится неактивным (<span className="font-mono text-text-primary">enable=no</span>).
                    </li>
                    <li>
                      <strong className="text-danger-text">Черный список и GeoIP:</strong> запрещенные адреса и страны отклоняются с первой попытки.
                    </li>
                    <li>
                      <strong className="text-text-primary">Счетчик ошибок и прогрессивный бан:</strong> при превышении лимита неверных паролей адрес блокируется в брандмауэре Windows.
                    </li>
                  </ol>
                </div>
              </>
            )}

            {topic === 'protocols' && (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Защищаемые службы (RDP, FTP, SMB) и прогрессивный бан</h2>
                  <p className="mt-2">
                    Вы можете независимо включать и настраивать пороги для каждого из трех сетевых протоколов в разделе <strong className="text-text-primary">«Правила и IP»</strong>.
                  </p>
                </div>
                <div className="space-y-2.5 pt-4 border-t border-border-subtle">
                  <p>
                    <strong className="text-text-primary">RDP (Удаленный рабочий стол · порт 3389):</strong> отслеживается по <span className="font-mono text-text-primary">Event ID 4624 / 4625 · Logon Type 10 / 3</span>.
                  </p>
                  <p>
                    <strong className="text-text-primary">FTP (Файловый сервер · порт 21):</strong> отслеживается по кодам <span className="font-mono text-text-primary">230 / 530 Login Incorrect</span>.
                  </p>
                  <p>
                    <strong className="text-text-primary">SMB (Общие папки Windows · порт 445):</strong> отслеживается по <span className="font-mono text-text-primary">Event ID 4624 / 4625 · Logon Type 3</span>.
                  </p>
                </div>
                <div className="space-y-2 pt-4 border-t border-border-subtle">
                  <h3 className="text-sm font-semibold text-text-primary">Прогрессивный бан</h3>
                  <p>
                    Когда переключатель «Прогрессивный бан» включен, срок бана растет по ступеням (15 мин → 1 ч → 24 ч → Навсегда). Если переключатель выключен, любой нарушитель блокируется навсегда сразу.
                  </p>
                </div>
              </>
            )}

            {topic === 'geoip' && (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Геоблокировка по странам (GeoIP)</h2>
                  <p className="mt-2">
                    Раздел <strong className="text-text-primary">«Страны (GeoIP)»</strong> позволяет запрещать выбранные страны или разрешать доступ только из доверенных стран.
                  </p>
                </div>
                <div className="space-y-2 pt-4 border-t border-border-subtle">
                  <h3 className="text-sm font-semibold text-text-primary">Временная разблокировка IP и стран</h3>
                  <p>
                    Для разового доступа из заблокированной страны или с отдельного IP используйте блок <strong className="text-text-primary">«Временные разблокировки»</strong> в разделе <strong className="text-text-primary">«Правила и IP»</strong>.
                  </p>
                </div>
              </>
            )}

            {topic === 'lists' && (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Белый и черный списки IP и подсетей CIDR</h2>
                  <p className="mt-2">
                    Добавляйте отдельные IPv4-адреса или диапазоны CIDR (например, <span className="font-mono text-text-primary">192.168.1.0/24</span>). Кнопка <strong className="text-text-primary">«Разрешить только из белого списка»</strong> включает правило брандмауэра <span className="font-mono text-text-primary">{WHITELIST_ONLY_RULE_NAME}</span>, а при выключении переводит его в неактивное состояние (<span className="font-mono text-text-primary">enable=no</span>).
                  </p>
                </div>
              </>
            )}

            {topic === 'notifications' && (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Мгновенные email-уведомления (SMTP)</h2>
                  <p className="mt-2">
                    Подключите SMTP-сервер (Яндекс, Mail.ru, Gmail или свой корпоративный шлюз), чтобы мгновенно получать письма при постоянных банах, геоблокировках или остановке защиты.
                  </p>
                </div>
              </>
            )}

            {topic === 'system' && (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Служба Windows, Брандмауэр и защита входа паролем</h2>
                </div>
                <div className="space-y-3 pt-4 border-t border-border-subtle">
                  <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <Lock className="w-4 h-4 text-accent-hover" />
                    Защита входа в настройки паролем
                  </h3>
                  <p>
                    В разделе <strong className="text-text-primary">«Система»</strong> можно включить пароль на изменение настроек. Пароль по умолчанию: <span className="font-mono text-text-primary">{DEFAULT_ADMIN_PASSWORD}</span>.
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
