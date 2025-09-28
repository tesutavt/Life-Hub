import React, { useEffect, useState } from "react";
import Shell from "../components/Shell";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { notifyMenuCountersVisibility } from "../menuBus";

const defaultSocialTemplates = {
  stream: "Привет! В эфире: {stream_title}\nhttps://twitch.tv/{channel}",
  video: "Новое видео: {video_title}\n{video_url}",
};

type SocialSettings = {
  tg_bot_token?: string | null;
  tg_chat_id?: string | null;
  twitch_channel?: string | null;
  youtube_channel_id?: string | null;
  tg_stream_template?: string | null;
  tg_video_template?: string | null;
};

type GoogleSettings = { refresh_token: string | null };

export default function Settings() {
  const { token } = useAuth();
  const [socialForm, setSocialForm] = useState<SocialSettings>({});
  const [google, setGoogle] = useState<GoogleSettings>({ refresh_token: null });
  const [showMenuCounters, setShowMenuCounters] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingGoogle, setSavingGoogle] = useState(false);
  const [savingUi, setSavingUi] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const socials = await api.get("/api/socials/settings");
        setSocialForm({
          tg_bot_token: socials.settings?.tg_bot_token || "",
          tg_chat_id: socials.settings?.tg_chat_id || "",
          twitch_channel: socials.settings?.twitch_channel || "",
          youtube_channel_id: socials.settings?.youtube_channel_id || "",
          tg_stream_template: socials.settings?.tg_stream_template || defaultSocialTemplates.stream,
          tg_video_template: socials.settings?.tg_video_template || defaultSocialTemplates.video,
        });
      } catch {
        setSocialForm({
          tg_bot_token: "",
          tg_chat_id: "",
          twitch_channel: "",
          youtube_channel_id: "",
          tg_stream_template: defaultSocialTemplates.stream,
          tg_video_template: defaultSocialTemplates.video,
        });
      }
      try {
        const g = await api.get("/api/life/settings/google");
        setGoogle({ refresh_token: g.refresh_token || "" });
      } catch {
        setGoogle({ refresh_token: "" });
      }
      try {
        const ui = await api.get("/api/life/ui-settings");
        const visible = ui?.show_menu_counters !== false;
        setShowMenuCounters(visible);
        notifyMenuCountersVisibility(visible);
      } catch {
        setShowMenuCounters(true);
        notifyMenuCountersVisibility(true);
      }
      setLoading(false);
    })();
  }, []);

  const saveSocials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/socials/settings", socialForm, {
        notifySuccess: "Настройки сохранены",
      });
      await api.post("/api/life/feed/add", {
        type: "settings",
        text: "Обновлены настройки соцсетей",
        meta: { section: "socials" },
      }, { silentSuccess: true });
    } finally {
      setSaving(false);
    }
  };

  const saveGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGoogle(true);
    try {
      await api.post("/api/life/settings/google", { refresh_token: google.refresh_token }, {
        notifySuccess: "Google API token сохранён",
      });
    } finally {
      setSavingGoogle(false);
    }
  };

  const updateMenuCountersVisibility = async (show: boolean) => {
    const previous = showMenuCounters;
    setShowMenuCounters(show);
    setSavingUi(true);
    notifyMenuCountersVisibility(show);
    try {
      const response = await api.put("/api/life/ui-settings", { show_menu_counters: show });
      const resolved = response?.show_menu_counters !== false;
      setShowMenuCounters(resolved);
      if (resolved !== show) {
        notifyMenuCountersVisibility(resolved);
      }
    } catch {
      setShowMenuCounters(previous);
      notifyMenuCountersVisibility(previous);
    } finally {
      setSavingUi(false);
    }
  };

  const googleAuthUrl = token
    ? `/api/fitness/google/auth?token=${encodeURIComponent(token)}`
    : "/api/fitness/google/auth";

  if (loading) {
    return (
      <Shell>
        <div className="text-sm opacity-70">Загружаем настройки…</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-2xl font-semibold mb-4">Настройки интеграций</div>

      <div className="grid gap-6">
        <form onSubmit={saveSocials} className="card space-y-4">
          <div>
            <div className="text-lg font-semibold mb-1">Telegram</div>
            <p className="text-xs opacity-70">Заполните поля, чтобы бот мог отправлять сообщения и посты.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <input
                placeholder="Bot token"
                value={socialForm.tg_bot_token || ""}
                onChange={(e) => setSocialForm({ ...socialForm, tg_bot_token: e.target.value })}
                className="px-3 py-2 rounded bg-white/10"
              />
              <input
                placeholder="Chat ID"
                value={socialForm.tg_chat_id || ""}
                onChange={(e) => setSocialForm({ ...socialForm, tg_chat_id: e.target.value })}
                className="px-3 py-2 rounded bg-white/10"
              />
            </div>
            <div className="flex flex-col gap-2">
              <input
                placeholder="Twitch канал (логин)"
                value={socialForm.twitch_channel || ""}
                onChange={(e) => setSocialForm({ ...socialForm, twitch_channel: e.target.value })}
                className="px-3 py-2 rounded bg-white/10"
              />
              <input
                placeholder="YouTube channelId (начинается с UC)"
                value={socialForm.youtube_channel_id || ""}
                onChange={(e) => setSocialForm({ ...socialForm, youtube_channel_id: e.target.value })}
                className="px-3 py-2 rounded bg-white/10"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs opacity-70">Шаблон сообщения о стриме</label>
              <textarea
                value={socialForm.tg_stream_template || ""}
                onChange={(e) => setSocialForm({ ...socialForm, tg_stream_template: e.target.value })}
                className="w-full px-3 py-2 rounded bg-white/10 min-h-[96px]"
              />
            </div>
            <div>
              <label className="text-xs opacity-70">Шаблон сообщения о видео</label>
              <textarea
                value={socialForm.tg_video_template || ""}
                onChange={(e) => setSocialForm({ ...socialForm, tg_video_template: e.target.value })}
                className="w-full px-3 py-2 rounded bg-white/10 min-h-[96px]"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button disabled={saving} className="px-4 py-2 rounded bg-white text-black">
              {saving ? "Сохраняем..." : "Сохранить"}
            </button>
            <span className="text-xs opacity-70">Подсказка: используйте формат &lt;name&gt;</span>
          </div>
        </form>

        <form onSubmit={saveGoogle} className="card space-y-4">
          <div>
            <div className="text-lg font-semibold mb-1">Google API / Fitness</div>
            <p className="text-xs opacity-70">Нужен для импорта активности и сна из Google Fit.</p>
          </div>
          <input
            placeholder="Refresh token"
            value={google.refresh_token || ""}
            onChange={(e) => setGoogle({ refresh_token: e.target.value })}
            className="px-3 py-2 rounded bg-white/10"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={savingGoogle} className="px-4 py-2 rounded bg-white text-black">
              {savingGoogle ? "Сохраняем..." : "Сохранить"}
            </button>
            <a
              href={googleAuthUrl}
              className="px-4 py-2 rounded bg-white/10 border border-white/20 text-sm"
            >
              Подключить к Google
            </a>
            <span className="text-xs opacity-70">После авторизации OAuth появится новый токен.</span>
          </div>
        </form>

        <div className="card space-y-3">
          <div>
            <div className="text-lg font-semibold mb-1">Интерфейс</div>
            <p className="text-xs opacity-70">Управляйте отображением счетчиков рядом с пунктами меню.</p>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={showMenuCounters}
              onChange={(e) => updateMenuCountersVisibility(e.target.checked)}
              disabled={savingUi}
              className="h-4 w-4 accent-white"
            />
            <span>Показывать индикаторы активных блоков в меню</span>
          </label>
          {savingUi && <div className="text-xs opacity-60">Сохраняем...</div>}
        </div>
      </div>
    </Shell>
  );
}
