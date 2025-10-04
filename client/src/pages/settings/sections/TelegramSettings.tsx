import React from "react";
import { SocialSettings } from "../types";

type Props = {
  form: SocialSettings;
  onChange: (updates: Partial<SocialSettings>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
};

const update = (
  onChange: Props["onChange"],
  field: keyof SocialSettings,
) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  onChange({ [field]: event.target.value });
};

export default function TelegramSettings({ form, onChange, onSubmit, saving }: Props) {
  return (
    <form
      id="settings-telegram"
      data-settings-section="telegram"
      onSubmit={onSubmit}
      className="card space-y-4"
    >
      <div>
        <div className="text-lg font-semibold">Telegram</div>
        <p className="text-xs opacity-70">
          Подключите бота, укажите чат канала и личный чат, чтобы отправлять уведомления и отчёты.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <input
            placeholder="Bot token"
            value={form.tg_bot_token || ""}
            onChange={update(onChange, "tg_bot_token")}
            className="px-3 py-2 rounded bg-white/10"
          />
          <input
            placeholder="Chat ID канала/группы"
            value={form.tg_chat_id || ""}
            onChange={update(onChange, "tg_chat_id")}
            className="px-3 py-2 rounded bg-white/10"
          />
        </div>
        <div className="flex flex-col gap-2">
          <input
            placeholder="ID личного чата"
            value={form.tg_personal_chat_id || ""}
            onChange={update(onChange, "tg_personal_chat_id")}
            className="px-3 py-2 rounded bg-white/10"
          />
          <input
            placeholder="YouTube channelId (начинается с UC)"
            value={form.youtube_channel_id || ""}
            onChange={update(onChange, "youtube_channel_id")}
            className="px-3 py-2 rounded bg-white/10"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs opacity-70">Шаблон сообщения о стриме</label>
          <textarea
            value={form.tg_stream_template || ""}
            onChange={update(onChange, "tg_stream_template")}
            className="w-full px-3 py-2 rounded bg-white/10 min-h-[96px]"
          />
        </div>
        <div>
          <label className="text-xs opacity-70">Шаблон сообщения о видео</label>
          <textarea
            value={form.tg_video_template || ""}
            onChange={update(onChange, "tg_video_template")}
            className="w-full px-3 py-2 rounded bg-white/10 min-h-[96px]"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button disabled={saving} className="px-4 py-2 rounded bg-white text-black">
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
        <span className="text-xs opacity-70">
          Подсказка: ID личного чата можно узнать у бота @userinfobot.
        </span>
      </div>
    </form>
  );
}
