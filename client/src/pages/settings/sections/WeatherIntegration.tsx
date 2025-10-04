import React from "react";
import {
  WeatherBackgroundKey,
  WeatherEffectKey,
} from "../../../utils/customAssets";

type WeatherBackgroundMap = Record<WeatherBackgroundKey, string>;
type WeatherEffectMap = Record<WeatherEffectKey, string>;

type Props = {
  apiKey: string;
  backgrounds: WeatherBackgroundMap;
  effects: WeatherEffectMap;
  onApiKeyChange: (value: string) => void;
  onBackgroundChange: (key: WeatherBackgroundKey, value: string) => void;
  onEffectChange: (key: WeatherEffectKey, value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

type AssetUploaderProps = {
  label: string;
  description: string;
  value: string;
  accept?: string;
  onChange: (value: string) => void;
};

const AssetUploader = ({ label, description, value, accept = "image/*", onChange }: AssetUploaderProps) => {
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChange(dataUrl);
    } catch (error) {
      console.error("Не удалось загрузить изображение", error);
    } finally {
      input.value = "";
    }
  };

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white">{label}</div>
          <div className="text-xs text-white/60">{description}</div>
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-white/60 transition hover:text-white"
          >
            Очистить
          </button>
        )}
      </div>
      <label className="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-white/20 bg-white/5 p-3 text-xs text-white/70 transition hover:border-white/40 hover:bg-white/10">
        {value ? (
          <img src={value} alt={label} className="h-32 w-full rounded-lg object-cover" />
        ) : (
          <span>Выберите файл</span>
        )}
        <input type="file" accept={accept} className="hidden" onChange={handleFileChange} />
      </label>
    </div>
  );
};

export default function WeatherIntegration({
  apiKey,
  backgrounds,
  effects,
  onApiKeyChange,
  onBackgroundChange,
  onEffectChange,
  onSubmit,
  saving,
}: Props) {
  const backgroundConfigs: { key: WeatherBackgroundKey; label: string; description: string }[] = [
    { key: "morning", label: "Утро", description: "Тёплый мягкий фон для ранних часов" },
    { key: "day", label: "День", description: "Яркий фон для дневного блока" },
    { key: "evening", label: "Вечер", description: "Глубокие цвета для вечерней сцены" },
  ];

  const effectConfigs: { key: WeatherEffectKey; label: string; description: string }[] = [
    { key: "rain", label: "Дождь", description: "Лёгкая анимация капель" },
    { key: "snow", label: "Снег", description: "Плавное падение снежинок" },
    { key: "mist", label: "Туман", description: "Мягкий дымчатый эффект" },
  ];

  return (
    <form
      id="settings-weather"
      data-settings-section="weather"
      onSubmit={onSubmit}
      className="card space-y-4"
    >
      <div>
        <div className="text-lg font-semibold mb-1">OpenWeather</div>
        <p className="text-xs opacity-70">
          Добавьте персональный API-ключ, чтобы показывать погоду в&nbsp;дашборде, и настройте визуальные элементы виджета.
        </p>
      </div>
      <input
        placeholder="API key"
        value={apiKey}
        onChange={(event) => onApiKeyChange(event.target.value)}
        className="px-3 py-2 rounded bg-white/10"
        autoComplete="off"
      />

      <div className="space-y-3">
        <div className="text-sm font-semibold text-white">Фоны виджета</div>
        <p className="text-xs text-white/60">
          Изображения применяются в зависимости от времени суток. Сохранение происходит после нажатия кнопки ниже.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {backgroundConfigs.map((config) => (
            <AssetUploader
              key={config.key}
              label={config.label}
              description={config.description}
              value={backgrounds[config.key]}
              onChange={(value) => onBackgroundChange(config.key, value)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold text-white">Погодные эффекты</div>
        <p className="text-xs text-white/60">
          Дополнительные оверлеи будут включаться автоматически при соответствующих погодных условиях.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {effectConfigs.map((config) => (
            <AssetUploader
              key={config.key}
              label={config.label}
              description={config.description}
              value={effects[config.key]}
              accept="image/*"
              onChange={(value) => onEffectChange(config.key, value)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={saving} className="px-4 py-2 rounded bg-white text-black">
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
        <span className="text-xs opacity-70">
          Ключ можно получить на&nbsp;openweathermap.org. Фоны и эффекты сохраняются локально после нажатия «Сохранить».
        </span>
      </div>
    </form>
  );
}
