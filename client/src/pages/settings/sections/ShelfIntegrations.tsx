import React, { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "../../../api";

// Интеграции полки: Shikimori (аниме, манга, ранобэ) и Steam (игры). Общие для компьютера и телефона.

export type ShelfIntegrationsState = {
  shikimori: { nickname: string | null; synced_at: string | null };
  steam: { steam_id: string | null; profile: string | null; has_key: boolean; synced_at: string | null };
};

const EMPTY: ShelfIntegrationsState = {
  shikimori: { nickname: null, synced_at: null },
  steam: { steam_id: null, profile: null, has_key: false, synced_at: null },
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

export function useShelfIntegrations() {
  const [state, setState] = useState<ShelfIntegrationsState>(EMPTY);
  const reload = async () => {
    try {
      const res = await api.get("/api/life/shelf/integrations", { silentError: true });
      if (res?.shikimori) setState(res);
    } catch {
      // сервер старый — интеграции просто не показываем
    }
  };
  useEffect(() => {
    reload();
  }, []);
  return { state, reload };
}

const field = "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-brand-mint/60";

export default function ShelfIntegrations({ compact = false }: { compact?: boolean }) {
  const { state, reload } = useShelfIntegrations();
  const [nick, setNick] = useState("");
  const [profile, setProfile] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});

  useEffect(() => {
    setNick(state.shikimori.nickname || "");
    setProfile(state.steam.profile || "");
  }, [state.shikimori.nickname, state.steam.profile]);

  const run = async (id: string, action: () => Promise<any>, ok: (res: any) => string) => {
    setBusy(id);
    setMessage((m) => ({ ...m, [id]: "" }));
    try {
      const res = await action();
      setMessage((m) => ({ ...m, [id]: ok(res) }));
      await reload();
    } catch (e: any) {
      setMessage((m) => ({ ...m, [id]: e?.message || "Не получилось" }));
    } finally {
      setBusy(null);
    }
  };
  const quiet = { silentSuccess: true, silentError: true };
  const summary = (res: any) => (res?.error ? res.error : `Готово: добавлено ${res?.added ?? 0}, обновлено ${res?.updated ?? 0} из ${res?.total ?? 0}.`);

  return (
    <section className={`space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] ${compact ? "p-4" : "p-5"}`}>
      <div>
        <div className="text-lg font-semibold text-white">Полка: Shikimori и Steam</div>
        <div className="text-sm text-white/55">Списки аниме и игр сами появляются на полке со статусами, оценками и часами. Обновляются при открытии полки.</div>
      </div>

      {/* Shikimori */}
      <div className="space-y-2 rounded-2xl border border-white/10 bg-black/10 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium text-white">🌸 Shikimori</div>
          {state.shikimori.nickname ? <div className="text-xs text-white/45">подключён · {when(state.shikimori.synced_at) || "ещё не обновлялся"}</div> : null}
        </div>
        <div className="text-xs text-white/50">Ник с открытым профилем. «Смотрю/Читаю» → В процессе, «Просмотрено» → Готово, «Отложено», «Брошено», «Запланировано» → Хочу.</div>
        <div className="flex gap-2">
          <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Ник на Shikimori" className={field} />
          <button type="button" disabled={!nick.trim() || !!busy} onClick={() => run("shiki", () => api.put("/api/life/shelf/shikimori", { nickname: nick.trim() }, quiet), summary)} className="shrink-0 rounded-xl bg-brand-mint px-4 text-sm font-semibold text-brand-deep disabled:opacity-40">
            {busy === "shiki" ? <Loader2 className="h-4 w-4 animate-spin" /> : state.shikimori.nickname ? "Сохранить" : "Подключить"}
          </button>
        </div>
        {state.shikimori.nickname ? (
          <div className="flex gap-4 text-sm">
            <button type="button" disabled={!!busy} onClick={() => run("shiki", () => api.post("/api/life/shelf/shikimori/sync", undefined, quiet), summary)} className="flex items-center gap-1 text-brand-mint disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" /> Обновить</button>
            <button type="button" disabled={!!busy} onClick={() => run("shiki", () => api.put("/api/life/shelf/shikimori", { nickname: "" }, quiet), () => "Отвязано")} className="text-white/45 hover:text-rose-300">Отвязать</button>
          </div>
        ) : null}
        {message.shiki ? <div className="text-xs text-white/70">{message.shiki}</div> : null}
      </div>

      {/* Steam */}
      <div className="space-y-2 rounded-2xl border border-white/10 bg-black/10 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium text-white">🎮 Steam</div>
          {state.steam.steam_id ? <div className="text-xs text-white/45">подключён{state.steam.has_key ? " · вся библиотека" : " · недавние игры"} · {when(state.steam.synced_at) || "ещё не обновлялся"}</div> : null}
        </div>
        <div className="text-xs leading-5 text-white/50">
          Достаточно ссылки на открытый профиль — на полку попадут игры, в которые вы играли недавно, с часами (каждое обновление добавляет новые).
          Чтобы подтянуть <b>всю библиотеку</b>, добавьте бесплатный ключ Steam Web API:{" "}
          <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer" className="text-brand-mint hover:underline">steamcommunity.com/dev/apikey</a> (в поле «домен» можно написать localhost).
        </div>
        <input value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="https://steamcommunity.com/id/ваш-ник/" className={field} />
        <div className="flex gap-2">
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={state.steam.has_key ? "Ключ сохранён — впишите новый, чтобы заменить" : "Ключ Web API (необязательно)"} className={field} />
          <button type="button" disabled={!profile.trim() || !!busy} onClick={() => run("steam", () => api.put("/api/life/shelf/steam", { profile: profile.trim(), ...(key.trim() ? { key: key.trim() } : {}) }, quiet), (res) => { setKey(""); return summary(res) + (res?.full === false ? " Это недавние игры — с ключом будет вся библиотека." : ""); })} className="shrink-0 rounded-xl bg-brand-mint px-4 text-sm font-semibold text-brand-deep disabled:opacity-40">
            {busy === "steam" ? <Loader2 className="h-4 w-4 animate-spin" /> : state.steam.steam_id ? "Сохранить" : "Подключить"}
          </button>
        </div>
        {state.steam.steam_id ? (
          <div className="flex flex-wrap gap-4 text-sm">
            <button type="button" disabled={!!busy} onClick={() => run("steam", () => api.post("/api/life/shelf/steam/sync", undefined, quiet), summary)} className="flex items-center gap-1 text-brand-mint disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" /> Обновить</button>
            {state.steam.has_key ? <button type="button" disabled={!!busy} onClick={() => run("steam", () => api.put("/api/life/shelf/steam", { profile: state.steam.profile, key: "" }, quiet), () => "Ключ убран — теперь подтягиваются недавние игры")} className="text-white/45 hover:text-white">Убрать ключ</button> : null}
            <button type="button" disabled={!!busy} onClick={() => run("steam", () => api.put("/api/life/shelf/steam", { profile: "" }, quiet), () => "Отвязано")} className="text-white/45 hover:text-rose-300">Отвязать</button>
          </div>
        ) : null}
        {message.steam ? <div className="text-xs text-white/70">{message.steam}</div> : null}
      </div>
    </section>
  );
}
