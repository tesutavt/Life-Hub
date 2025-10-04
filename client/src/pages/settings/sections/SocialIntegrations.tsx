import React from "react";
import { SocialSettings, TwitchCommand, TwitchTimer } from "../types";

type Props = {
  form: SocialSettings;
  onChange: (updates: Partial<SocialSettings>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  commands: TwitchCommand[];
  commandsLoading: boolean;
  commandsBusy: boolean;
  onAddCommand: () => void;
  onUpdateCommandField: (index: number, field: "command" | "response" | "enabled", value: string | boolean) => void;
  onSaveCommand: (command: TwitchCommand, index: number) => void;
  onDeleteCommand: (command: TwitchCommand, index: number) => void;
  timers: TwitchTimer[];
  timersLoading: boolean;
  timersBusy: boolean;
  onAddTimer: () => void;
  onUpdateTimerField: (
    index: number,
    field: "message" | "online_interval_sec" | "offline_interval_sec" | "enabled",
    value: string | number | boolean,
  ) => void;
  onSaveTimer: (timer: TwitchTimer, index: number) => void;
  onDeleteTimer: (timer: TwitchTimer, index: number) => void;
  formatTimerDate: (value: string | null | undefined) => string;
};

export default function SocialIntegrations({
  form,
  onChange,
  onSubmit,
  saving,
  commands,
  commandsLoading,
  commandsBusy,
  onAddCommand,
  onUpdateCommandField,
  onSaveCommand,
  onDeleteCommand,
  timers,
  timersLoading,
  timersBusy,
  onAddTimer,
  onUpdateTimerField,
  onSaveTimer,
  onDeleteTimer,
  formatTimerDate,
}: Props) {
  const updateField = (field: keyof SocialSettings) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange({ [field]: event.target.value });
  };

  return (
    <form
      id="settings-socials"
      data-settings-section="socials"
      onSubmit={onSubmit}
      className="card space-y-4"
    >
      <div>
        <div className="text-lg font-semibold mb-1">Telegram</div>
        <p className="text-xs opacity-70">Заполните поля, чтобы бот мог отправлять сообщения и посты.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <input
            placeholder="Bot token"
            value={form.tg_bot_token || ""}
            onChange={updateField("tg_bot_token")}
            className="px-3 py-2 rounded bg-white/10"
          />
          <input
            placeholder="Chat ID"
            value={form.tg_chat_id || ""}
            onChange={updateField("tg_chat_id")}
            className="px-3 py-2 rounded bg-white/10"
          />
        </div>
        <div className="flex flex-col gap-2">
          <input
            placeholder="Twitch канал (логин)"
            value={form.twitch_channel || ""}
            onChange={updateField("twitch_channel")}
            className="px-3 py-2 rounded bg-white/10"
          />
          <input
            placeholder="YouTube channelId (начинается с UC)"
            value={form.youtube_channel_id || ""}
            onChange={updateField("youtube_channel_id")}
            className="px-3 py-2 rounded bg-white/10"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs opacity-70">Шаблон сообщения о стриме</label>
          <textarea
            value={form.tg_stream_template || ""}
            onChange={updateField("tg_stream_template")}
            className="w-full px-3 py-2 rounded bg-white/10 min-h-[96px]"
          />
        </div>
        <div>
          <label className="text-xs opacity-70">Шаблон сообщения о видео</label>
          <textarea
            value={form.tg_video_template || ""}
            onChange={updateField("tg_video_template")}
            className="w-full px-3 py-2 rounded bg-white/10 min-h-[96px]"
          />
        </div>
      </div>

      <div className="border-t border-white/10 pt-4 space-y-4">
        <div>
          <div className="text-lg font-semibold mb-1">Twitch бот</div>
          <p className="text-xs opacity-70">
            Укажите логин и OAuth токен аккаунта, который будет отправлять сообщения в чат Twitch.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <input
            placeholder="Логин бота"
            value={form.twitch_bot_username || ""}
            onChange={updateField("twitch_bot_username")}
            className="px-3 py-2 rounded bg-white/10"
            autoComplete="off"
          />
          <input
            placeholder="OAuth токен (oauth:...)"
            type="password"
            value={form.twitch_bot_token || ""}
            onChange={updateField("twitch_bot_token")}
            className="px-3 py-2 rounded bg-white/10"
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">Команды</div>
            <button
              type="button"
              onClick={onAddCommand}
              disabled={commandsBusy || commandsLoading}
              className="px-3 py-1.5 rounded bg-white/10 border border-white/20 text-xs"
            >
              Добавить команду
            </button>
          </div>
          {commandsLoading ? (
            <div className="text-xs opacity-70">Загружаем команды…</div>
          ) : commands.length === 0 ? (
            <div className="text-xs opacity-70">Команды ещё не добавлены.</div>
          ) : (
            <div className="space-y-3">
              {commands.map((command, index) => {
                const ready = command.command.trim().length > 0 && command.response.trim().length > 0;
                return (
                  <div
                    key={command.id ?? `command-${index}`}
                    className="bg-white/5 border border-white/10 rounded p-3 space-y-2"
                  >
                    <div className="grid md:grid-cols-2 gap-2">
                      <input
                        className="px-3 py-2 rounded bg-white/10"
                        placeholder="Команда (без !)"
                        value={command.command}
                        onChange={(event) => onUpdateCommandField(index, "command", event.target.value)}
                        disabled={commandsBusy}
                      />
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={command.enabled}
                            onChange={(event) => onUpdateCommandField(index, "enabled", event.target.checked)}
                            disabled={commandsBusy}
                          />
                          Включена
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded bg-white text-black"
                            onClick={() => onSaveCommand(command, index)}
                            disabled={commandsBusy || !ready}
                          >
                            Сохранить
                          </button>
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded bg-white/10 border border-white/10"
                            onClick={() => onDeleteCommand(command, index)}
                            disabled={commandsBusy}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    </div>
                    <textarea
                      className="w-full px-3 py-2 rounded bg-white/10 min-h-[72px]"
                      placeholder="Ответ в чат"
                      value={command.response}
                      onChange={(event) => onUpdateCommandField(index, "response", event.target.value)}
                      disabled={commandsBusy}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">Таймеры</div>
            <button
              type="button"
              onClick={onAddTimer}
              disabled={timersBusy || timersLoading}
              className="px-3 py-1.5 rounded bg-white/10 border border-white/20 text-xs"
            >
              Добавить таймер
            </button>
          </div>
          {timersLoading ? (
            <div className="text-xs opacity-70">Загружаем таймеры…</div>
          ) : timers.length === 0 ? (
            <div className="text-xs opacity-70">Таймеры ещё не настроены.</div>
          ) : (
            <div className="space-y-3">
              {timers.map((timer, index) => (
                <div
                  key={timer.id ?? `timer-${index}`}
                  className="bg-white/5 border border-white/10 rounded p-3 space-y-2"
                >
                  <input
                    className="w-full px-3 py-2 rounded bg-white/10"
                    placeholder="Сообщение таймера"
                    value={timer.message}
                    onChange={(event) => onUpdateTimerField(index, "message", event.target.value)}
                    disabled={timersBusy}
                  />
                  <div className="grid md:grid-cols-3 gap-2 text-xs">
                    <div className="flex flex-col gap-1">
                      <label className="opacity-70">Интервал онлайн (сек.)</label>
                      <input
                        type="number"
                        min={0}
                        className="px-3 py-2 rounded bg-white/10"
                        value={timer.online_interval_sec}
                        onChange={(event) => onUpdateTimerField(index, "online_interval_sec", event.target.value)}
                        disabled={timersBusy}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="opacity-70">Интервал офлайн (сек.)</label>
                      <input
                        type="number"
                        min={0}
                        className="px-3 py-2 rounded bg-white/10"
                        value={timer.offline_interval_sec}
                        onChange={(event) => onUpdateTimerField(index, "offline_interval_sec", event.target.value)}
                        disabled={timersBusy}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="opacity-70">Статус</label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={timer.enabled}
                          onChange={(event) => onUpdateTimerField(index, "enabled", event.target.checked)}
                          disabled={timersBusy}
                        />
                        Активен
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-70">
                    <span>Последняя отправка: {formatTimerDate(timer.last_sent_at)}</span>
                    <div className="flex gap-2 opacity-100">
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded bg-white text-black"
                        onClick={() => onSaveTimer(timer, index)}
                        disabled={timersBusy || !timer.message.trim()}
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded bg-white/10 border border-white/10"
                        onClick={() => onDeleteTimer(timer, index)}
                        disabled={timersBusy}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button disabled={saving} className="px-4 py-2 rounded bg-white text-black">
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
        <span className="text-xs opacity-70">Подсказка: используйте формат &lt;name&gt;</span>
      </div>
    </form>
  );
}
