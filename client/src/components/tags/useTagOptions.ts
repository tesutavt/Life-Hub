import { useEffect, useState } from 'react';
import { api } from '../../api';

export type TagOption = { id: number; label: string; color: string };

/** Общие теги приложения (те же, что у страниц, поездок, целей и т. д.). */
export function useTagOptions() {
  const [tags, setTags] = useState<TagOption[]>([]);
  useEffect(() => {
    api
      .get('/api/life/pages/tags', { silentError: true })
      .then((res) => setTags((res?.items || []).map((t: any) => ({ id: t.id, label: t.label, color: t.color }))))
      .catch(() => {});
  }, []);
  return tags;
}
