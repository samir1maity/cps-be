type LogLevel = 'info' | 'warn' | 'error';

const log = (level: LogLevel, message: string, meta?: Record<string, unknown>): void => {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (level === 'error') {
    console.error(base, meta ? JSON.stringify(meta) : '');
  } else if (level === 'warn') {
    console.warn(base, meta ? JSON.stringify(meta) : '');
  } else {
    console.log(base, meta ? JSON.stringify(meta) : '');
  }
};

const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
};

export default logger;
