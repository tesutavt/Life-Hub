import React from "react";

type Props = {
  apiKey: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
};

export default function WeatherIntegration({ apiKey, onChange, onSubmit, saving }: Props) {
  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <div>
        <div className="text-lg font-semibold mb-1">OpenWeather</div>
        <p className="text-xs opacity-70">
          Добавьте персональный API-ключ, чтобы показывать погоду в&nbsp;дашборде.
        </p>
      </div>
      <input
        placeholder="API key"
        value={apiKey}
        onChange={(event) => onChange(event.target.value)}
        className="px-3 py-2 rounded bg-white/10"
        autoComplete="off"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={saving} className="px-4 py-2 rounded bg-white text-black">
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
        <span className="text-xs opacity-70">
          Ключ можно получить на&nbsp;openweathermap.org в&nbsp;разделе API keys.
        </span>
      </div>
    </form>
  );
}
