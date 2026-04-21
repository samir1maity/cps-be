type LogLevel = 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = ['password', 'secret', 'token', 'authorization', 'signature'];

const sanitizeMeta = (meta?: Record<string, unknown>): Record<string, unknown> | undefined => {
  if (!meta) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => {
      if (SENSITIVE_KEYS.some((sensitiveKey) => key.toLowerCase().includes(sensitiveKey))) {
        return [key, '[REDACTED]'];
      }

      if (value instanceof Error) {
        return [key, value.message];
      }

      return [key, value];
    })
  );
};

const log = (level: LogLevel, message: string, meta?: Record<string, unknown>): void => {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  const sanitizedMeta = sanitizeMeta(meta);
  if (level === 'error') {
    console.error(base, sanitizedMeta ? JSON.stringify(sanitizedMeta) : '');
  } else if (level === 'warn') {
    console.warn(base, sanitizedMeta ? JSON.stringify(sanitizedMeta) : '');
  } else {
    console.log(base, sanitizedMeta ? JSON.stringify(sanitizedMeta) : '');
  }
};

const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
};

export default logger;
