import React from "react";
import { GoogleSettings } from "../types";

type Props = {
  value: GoogleSettings;
  onChange: (value: GoogleSettings) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  authUrl: string;
};

export default function GoogleIntegration({ value, onChange, onSubmit, saving, authUrl }: Props) {
  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <div>
        <div className="text-lg font-semibold mb-1">Google API / Fitness</div>
        <p className="text-xs opacity-70">Нужен для импорта активности и сна из Google Fit.</p>
      </div>
      <input
        placeholder="Refresh token"
        value={value.refresh_token || ""}
        onChange={(event) => onChange({ refresh_token: event.target.value })}
        className="px-3 py-2 rounded bg-white/10"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={saving} className="px-4 py-2 rounded bg-white text-black">
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
        <a href={authUrl} className="px-4 py-2 rounded bg-white/10 border border-white/20 text-sm">
          Подключить к Google
        </a>
        <span className="text-xs opacity-70">После авторизации OAuth появится новый токен.</span>
      </div>
    </form>
  );
}
