import React, { useEffect, useState } from 'react';

/** Картинка, которая при ошибке загрузки (сайт недоступен, ссылка устарела) показывает заглушку вместо пустого места. */
export default function FallbackImg({ src, fallback, ...rest }: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src?: string | null; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <>{fallback}</>;
  return <img alt="" {...rest} src={src} onError={() => setFailed(true)} />;
}
