import { NotificationInput, notify } from './notifications/notificationBus';

const BASE = (() => {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === 'string') {
    const trimmed = fromEnv.trim();
    if (trimmed.length > 0 && trimmed.toLowerCase() !== 'undefined' && trimmed.toLowerCase() !== 'null') {
      return trimmed.replace(/\/+$/, '');
    }
  }

  if (typeof window === 'undefined') return '';

  const { protocol, hostname, port } = window.location;
  if (port === '5173' || port === '4173') {
    return `${protocol}//${hostname}:4000`;
  }

  if (port && port.length > 0) {
    return `${protocol}//${hostname}:${port}`.replace(/\/+$/, '');
  }

  return `${protocol}//${hostname}`;
})();

export const API_BASE_URL = BASE;

export function resolveApiUrl(path: string) {
  if (!path) return BASE;
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!BASE) return normalized;
  return `${BASE}${normalized}`;
}

type ApiRequestInit = RequestInit & {
  notifySuccess?: string | NotificationInput;
  notifyError?: string | NotificationInput;
  silentSuccess?: boolean;
  silentError?: boolean;
};

type NotificationSource = string | NotificationInput | undefined;

const SUCCESS_DEFAULT: Record<string, string> = {
  POST: 'Успешно добавлено',
  PUT: 'Изменения сохранены',
  PATCH: 'Изменения обновлены',
  DELETE: 'Запись удалена',
};

const ERROR_DEFAULT: Record<string, string> = {
  GET: 'Не удалось загрузить данные',
  HEAD: 'Не удалось загрузить данные',
};

function resolveMessage(source: NotificationSource, fallback: string) {
  if (!source) return { message: fallback, options: undefined as Omit<NotificationInput, 'message' | 'variant'> | undefined };
  if (typeof source === 'string') return { message: source, options: undefined };
  const { message, variant: _variant, ...rest } = source;
  return { message: message ?? fallback, options: rest };
}

async function parseResponse(res: Response) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

async function extractErrorMessage(res: Response) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const payload = await res.clone().json();
      if (!payload) return '';
      if (typeof payload === 'string') return payload;
      if (payload.message && typeof payload.message === 'string') return payload.message;
      if (payload.error && typeof payload.error === 'string') return payload.error;
      if (Array.isArray(payload.errors) && payload.errors.length > 0) {
        const first = payload.errors[0];
        if (typeof first === 'string') return first;
        if (first?.message) return String(first.message);
      }
    } catch {
      // ignore json parse errors
    }
  }
  try {
    const text = await res.clone().text();
    return text.trim();
  } catch {
    return '';
  }
}

export const api = {
  async request(path: string, options: ApiRequestInit = {}) {
    const { notifySuccess, notifyError, silentSuccess, silentError, ...fetchOptions } = options;
    const token = localStorage.getItem('token');
    const headers = new Headers(fetchOptions.headers || {});
    const method = (fetchOptions.method || 'GET').toUpperCase();
    const body = fetchOptions.body as BodyInit | null | undefined;
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (!isFormData && body && typeof body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    let response: Response;
    try {
      const url = resolveApiUrl(path);
      response = await fetch(url, { ...fetchOptions, headers });
    } catch (error) {
      if (!silentError) {
        const { message, options: extra } = resolveMessage(notifyError, ERROR_DEFAULT[method] || 'Не удалось выполнить действие');
        notify.error(message, extra);
      }
      throw error;
    }

    if (!response.ok) {
      const extracted = await extractErrorMessage(response);
      const fallback = extracted || response.statusText || ERROR_DEFAULT[method] || 'Не удалось выполнить действие';
      if (!silentError) {
        const { message, options: extra } = resolveMessage(notifyError, fallback);
        notify.error(message, extra);
      }
      throw new Error(fallback);
    }

    const result = await parseResponse(response);

    if (!silentSuccess && method !== 'GET' && method !== 'HEAD') {
      const fallback = SUCCESS_DEFAULT[method] || 'Действие выполнено';
      const { message, options: extra } = resolveMessage(notifySuccess, fallback);
      notify.success(message, extra);
    }

    return result;
  },
  get: (path: string, extra?: ApiRequestInit) => api.request(path, extra),
  post: (path: string, body?: any, extra: ApiRequestInit = {}) => {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const payload = isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined;
    return api.request(path, { method: 'POST', body: payload, ...extra });
  },
  patch: (path: string, body?: any, extra: ApiRequestInit = {}) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    return api.request(path, { method: 'PATCH', body: payload, ...extra });
  },
  put: (path: string, body?: any, extra: ApiRequestInit = {}) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    return api.request(path, { method: 'PUT', body: payload, ...extra });
  },
  del: (path: string, extra: ApiRequestInit = {}) =>
    api.request(path, { method: 'DELETE', ...extra }),
};
