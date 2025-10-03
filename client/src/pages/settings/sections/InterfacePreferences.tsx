import React from "react";
import MenuMaster from "../../../components/master/MenuMaster";
import NotificationMaster from "../../../components/master/NotificationMaster";
import { NotificationPreferences } from "../../../types/ui";

interface MenuItem {
  key: string;
  label: string;
}

type Props = {
  showMenuCounters: boolean;
  savingUi: boolean;
  onToggleMenuCounters: (value: boolean) => void;
  menuItems: MenuItem[];
  hiddenMenuItems: string[];
  onHiddenItemsChange: (items: string[]) => void;
  notificationPreferences: NotificationPreferences;
  onNotificationPreferencesChange: (prefs: NotificationPreferences) => void;
  hiddenMenuSummary: string;
  notificationSummary: string;
};

export default function InterfacePreferences({
  showMenuCounters,
  savingUi,
  onToggleMenuCounters,
  menuItems,
  hiddenMenuItems,
  onHiddenItemsChange,
  notificationPreferences,
  onNotificationPreferencesChange,
  hiddenMenuSummary,
  notificationSummary,
}: Props) {
  return (
    <div className="card space-y-3">
      <div>
        <div className="text-lg font-semibold mb-1">Интерфейс</div>
        <p className="text-xs opacity-70">Управляйте отображением элементов меню и настройками уведомлений.</p>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={showMenuCounters}
          onChange={(event) => onToggleMenuCounters(event.target.checked)}
          disabled={savingUi}
          className="h-4 w-4 accent-white"
        />
        <span>Показывать индикаторы активных блоков в меню</span>
      </label>
      {savingUi && <div className="text-xs opacity-60">Сохраняем...</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <MenuMaster hiddenItems={hiddenMenuItems} onApply={onHiddenItemsChange} menuItems={menuItems} />
        <NotificationMaster preferences={notificationPreferences} onApply={onNotificationPreferencesChange} />
      </div>
      <div className="text-xs text-white/60 space-y-1">
        <div>{hiddenMenuSummary}</div>
        <div>{notificationSummary}</div>
      </div>
    </div>
  );
}
