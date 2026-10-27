import React, { useState } from "react";
import Master from "../../components/master/Master";

type SetupTarget = "google" | "weather" | "system";

type Option = {
  id: SetupTarget;
  label: string;
  description: string;
};

type Instruction = {
  title: string;
  bullets: string[];
};

type CompletionMeta = {
  title: string;
  description: string;
  sectionId: string;
};

type QuickSetupMasterProps = {
  googleRefreshToken: string;
  onGoogleTokenChange: (value: string) => void;
  weatherKey: string;
  onWeatherKeyChange: (value: string) => void;
  favicon: string;
  onFaviconChange: (value: string) => void;
};

const OPTIONS: Option[] = [
  { id: "google", label: "Google Fit", description: "Импорт активности и сна" },
  { id: "weather", label: "Погода", description: "Отображение прогноза на дашборде" },
  { id: "system", label: "Системные", description: "Favicon и базовые параметры" },
];

const INSTRUCTIONS: Record<SetupTarget, Instruction> = {
  google: {
    title: "Подключение Google Fit",
    bullets: [
      "Получите refresh token через кнопку \"Подключить к Google\".",
      "Скопируйте токен в поле настроек.",
      "Сохраните изменения и дождитесь синхронизации данных.",
    ],
  },
  weather: {
    title: "Настройка погоды",
    bullets: [
      "Зарегистрируйтесь на openweathermap.org.",
      "Скопируйте API key из раздела API keys.",
      "Вставьте ключ в поле настроек и сохраните.",
    ],
  },
  system: {
    title: "Системные настройки",
    bullets: [
      "Подготовьте favicon размером 32×32 px.",
      "Загрузите иконку, чтобы вкладка браузера отображала ваш бренд.",
      "Сохраните изменения в разделе \"Системные настройки\".",
    ],
  },
};

const COMPLETION: Record<SetupTarget, CompletionMeta> = {
  google: {
    title: "Токен Google Fit добавлен",
    description:
      "Откройте карточку «Google API / Fitness», чтобы сохранить refresh token и запустить синхронизацию.",
    sectionId: "settings-google",
  },
  weather: {
    title: "Ключ OpenWeather заполнен",
    description:
      "В карточке «Погода» осталась только кнопка «Сохранить». Заодно добавьте фоны и эффекты, если ещё не сделали этого.",
    sectionId: "settings-weather",
  },
  system: {
    title: "Favicon загружен",
    description:
      "Откройте «Системные настройки», чтобы сохранить иконку и обновить отображение вкладки браузера.",
    sectionId: "settings-system",
  },
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const isFilled = (value?: string | null) => typeof value === "string" && value.trim().length > 0;

export default function QuickSetupMaster({
  googleRefreshToken,
  onGoogleTokenChange,
  weatherKey,
  onWeatherKeyChange,
  favicon,
  onFaviconChange,
}: QuickSetupMasterProps) {
  const [step, setStep] = useState(1);
  const [target, setTarget] = useState<SetupTarget | null>(null);

  const goBack = () => {
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const reset = () => {
    setStep(1);
    setTarget(null);
  };

  const isTargetReady = (choice: SetupTarget) => {
    switch (choice) {
      case "google":
        return isFilled(googleRefreshToken);
      case "weather":
        return isFilled(weatherKey);
      case "system":
        return isFilled(favicon);
      default:
        return false;
    }
  };

  const canProceed = step === 1 ? Boolean(target) : step === 2 && target ? isTargetReady(target) : true;
  const primaryLabel = step === 3 ? "Закрыть" : step === 2 ? "Готово" : "Далее";

  const handlePrimaryAction = (close: () => void) => {
    if (step === 1) {
      if (!target) return;
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!target || !isTargetReady(target)) return;
      setStep(3);
      return;
    }
    if (step === 3) {
      close();
      reset();
    }
  };

  const handleFaviconFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onFaviconChange(dataUrl);
    } catch (error) {
      console.error("Не удалось прочитать favicon", error);
    } finally {
      input.value = "";
    }
  };

  const renderTargetForm = () => {
    if (!target) return null;
    switch (target) {
      case "google":
        return (
          <div className="space-y-2">
            <textarea
              placeholder="Refresh token"
              value={googleRefreshToken}
              onChange={(event) => onGoogleTokenChange(event.target.value)}
              className="w-full px-3 py-2 rounded bg-white/10 min-h-[96px]"
            />
            <div className="text-xs text-white/60">
              Авторизуйтесь через кнопку «Подключить к Google», затем вставьте скопированный refresh token сюда.
            </div>
          </div>
        );
      case "weather":
        return (
          <div className="space-y-2">
            <input
              placeholder="API ключ OpenWeather"
              value={weatherKey}
              onChange={(event) => onWeatherKeyChange(event.target.value)}
              className="px-3 py-2 rounded bg-white/10"
              autoComplete="off"
            />
            <div className="text-xs text-white/60">
              Убедитесь, что ключ активен, иначе данные не загрузятся.
            </div>
          </div>
        );
      case "system":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/5">
                {favicon ? (
                  <img src={favicon} alt="Favicon" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-white/60">32×32</span>
                )}
              </div>
              <div className="text-xs text-white/60">PNG, SVG или ICO, размер 32×32 px.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20">
                Выбрать файл
                <input
                  type="file"
                  accept="image/png,image/x-icon,image/svg+xml"
                  className="hidden"
                  onChange={handleFaviconFile}
                />
              </label>
              {favicon && (
                <button
                  type="button"
                  onClick={() => onFaviconChange("")}
                  className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
                >
                  Очистить
                </button>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const handleOpenSection = (close: () => void, sectionId: string) => {
    if (typeof document !== "undefined") {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    close();
    reset();
  };

  const summary = target ? COMPLETION[target] : null;

  return (
    <Master
      buttonLabel="Быстрая настройка"
      title="Мастер быстрой настройки"
      description="Подготовьте интеграции за три шага"
      triggerClassName="w-full sm:w-auto px-4 py-2 rounded-2xl bg-white/10 border border-white/20 text-sm"
    >
      {({ close }) => (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-sm text-white/60">
            <span>Шаг {step} из 3</span>
            {step > 1 && (
              <button onClick={goBack} className="text-xs uppercase tracking-wide text-white/50 hover:text-white/80">
                Назад
              </button>
            )}
          </div>

          {step === 1 && (
            <div className="space-y-3">
              <div className="text-lg font-semibold text-white">Выберите интеграцию</div>
              <div className="grid gap-2">
                {OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                      target === option.id ? "border-brand-mint bg-brand-mint/10" : "border-white/10 hover:border-white/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="quick-setup"
                      value={option.id}
                      checked={target === option.id}
                      onChange={() => {
                        setTarget(option.id);
                        setStep(2);
                      }}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-white">{option.label}</div>
                      <div className="text-xs text-white/60">{option.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && target && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-lg font-semibold text-white">{INSTRUCTIONS[target].title}</div>
                <ul className="space-y-2 text-sm text-white/80 list-disc pl-5">
                  {INSTRUCTIONS[target].bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">Быстрое заполнение</div>
                <div className="text-xs text-white/60">
                  Значения автоматически подставляются в основной раздел настроек. Не забудьте сохранить изменения после закрытия мастера.
                </div>
                {renderTargetForm()}
              </div>
            </div>
          )}

          {step === 3 && target && summary && (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="text-lg font-semibold text-white">{summary.title}</div>
                <p className="text-sm text-white/70">{summary.description}</p>
              </div>
              <button
                type="button"
                onClick={() => handleOpenSection(close, summary.sectionId)}
                className="inline-flex items-center justify-center rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/30"
              >
                Перейти к разделу
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => handlePrimaryAction(close)}
              className="px-4 py-2 rounded-full bg-brand-mint text-brand-deep font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!canProceed}
            >
              {primaryLabel}
            </button>
            <button
              onClick={() => {
                reset();
                close();
              }}
              className="text-xs uppercase tracking-wide text-white/50 hover:text-white/80"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </Master>
  );
}
