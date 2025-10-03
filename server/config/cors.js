const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173'];

export function parseAllowedOrigins(rawValue, defaults = DEFAULT_ALLOWED_ORIGINS) {
  if (Array.isArray(rawValue)) {
    const normalized = rawValue.map((origin) => String(origin).trim()).filter(Boolean);
    return normalized.length > 0 ? normalized : [...defaults];
  }

  if (typeof rawValue !== 'string') {
    return [...defaults];
  }

  const normalized = rawValue
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : [...defaults];
}

export function createCorsOptions(origins = DEFAULT_ALLOWED_ORIGINS) {
  const allowedOrigins = new Set(origins.length > 0 ? origins : DEFAULT_ALLOWED_ORIGINS);

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true
  };
}

export { DEFAULT_ALLOWED_ORIGINS };
