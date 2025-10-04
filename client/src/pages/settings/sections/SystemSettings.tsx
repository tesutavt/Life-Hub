import React, { useRef } from "react";

type Props = {
  favicon: string;
  onChange: (value: string) => void;
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

export default function SystemSettings({ favicon, onChange, onSubmit, saving }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChange(dataUrl);
    } catch (error) {
      console.error("Не удалось прочитать файл favicon", error);
    } finally {
      input.value = "";
    }
  };

  const handleReset = () => {
    onChange("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <form
      id="settings-system"
      data-settings-section="system"
      onSubmit={onSubmit}
      className="card space-y-4"
    >
      <div>
        <div className="text-lg font-semibold mb-1">Системные настройки</div>
        <p className="text-xs opacity-70">
          Загрузите favicon, чтобы ваш Life Hub отображался с персональной иконкой во вкладке браузера.
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/5">
            {favicon ? (
              <img src={favicon} alt="Favicon" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-white/60">32×32</span>
            )}
          </div>
          <div className="max-w-xs text-xs text-white/70">
            Поддерживаются PNG, SVG или ICO. Рекомендуемый размер — 32×32 px.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20">
            Загрузить
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/x-icon,image/svg+xml"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
          {favicon && (
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
            >
              Очистить
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-white text-black">
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
        <span className="text-xs opacity-70">Иконка сохранится после нажатия «Сохранить».</span>
      </div>
    </form>
  );
}
