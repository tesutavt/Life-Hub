import React, { useState } from "react";
import Master from "../../components/master/Master";

type SetupTarget = "twitch" | "google" | "telegram" | "weather";

type Option = {
  id: SetupTarget;
  label: string;
  description: string;
};

type Instruction = {
  title: string;
  bullets: string[];
};

const OPTIONS: Option[] = [
  { id: "twitch", label: "Twitch", description: "Команды, таймеры и бот для чата" },
  { id: "google", label: "Google Fit", description: "Импорт активности и сна" },
  { id: "telegram", label: "Telegram", description: "Уведомления и рассылки" },
  { id: "weather", label: "Погода", description: "Отображение прогноза на дашборде" },
];

const INSTRUCTIONS: Record<SetupTarget, Instruction> = {
  twitch: {
    title: "Настройка Twitch",
    bullets: [
      "Укажите логин канала и OAuth токен бота.",
      "Добавьте команды и таймеры для автоматических сообщений.",
      "Проверьте, что бот приглашён в чат и имеет права писать сообщения.",
    ],
  },
  google: {
    title: "Подключение Google Fit",
    bullets: [
      "Получите refresh token через кнопку \"Подключить к Google\".",
      "Скопируйте токен в поле настроек.",
      "Сохраните изменения и дождитесь синхронизации данных.",
    ],
  },
  telegram: {
    title: "Настройка Telegram",
    bullets: [
      "Создайте бота через @BotFather и скопируйте токен.",
      "Укажите chat ID канала или группы для рассылки.",
      "Настройте шаблоны сообщений для стримов и видео.",
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
};

export default function QuickSetupMaster() {
  const [step, setStep] = useState(1);
  const [target, setTarget] = useState<SetupTarget | null>(null);

  const goNext = () => {
    if (step === 1 && !target) return;
    setStep((prev) => Math.min(prev + 1, 3));
  };

  const goBack = () => {
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const reset = () => {
    setStep(1);
    setTarget(null);
  };

  return (
    <Master buttonLabel="Быстрая настройка" title="Мастер быстрой настройки" description="Подготовьте интеграции за три шага" triggerClassName="w-full sm:w-auto px-4 py-2 rounded-2xl bg-white/10 border border-white/20 text-sm">
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
                      onChange={() => setTarget(option.id)}
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
            <div className="space-y-3">
              <div className="text-lg font-semibold text-white">{INSTRUCTIONS[target].title}</div>
              <ul className="space-y-2 text-sm text-white/80 list-disc pl-5">
                {INSTRUCTIONS[target].bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="text-xs text-white/50">Выполните шаги и нажмите «Далее», когда будете готовы.</div>
            </div>
          )}

          {step === 3 && target && (
            <div className="space-y-3">
              <div className="text-lg font-semibold text-white">Готово!</div>
              <p className="text-sm text-white/70">
                Интеграция «{OPTIONS.find((option) => option.id === target)?.label}» подготовлена. Проверьте поля в соответствующем
                разделе и сохраните изменения.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                if (step === 3) {
                  close();
                  reset();
                  return;
                }
                if (step === 1 && !target) return;
                goNext();
              }}
              className="px-4 py-2 rounded-full bg-brand-mint text-brand-deep font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={step === 1 && !target}
            >
              {step === 3 ? "Закрыть" : "Далее"}
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
