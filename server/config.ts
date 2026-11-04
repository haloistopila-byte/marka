/** Server configuration, read once from environment variables. Secrets never live in this file. */
export const config = {
  port: Number(process.env.PORT) || 3000,

  // Origins allowed to call the API from a browser. Same-origin requests are always allowed.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  // Browser username/password prompt in front of the app. Off unless a password is configured.
  basicAuth: {
    user: process.env.BASIC_AUTH_USER || 'admin',
    password: process.env.BASIC_AUTH_PASSWORD || '',
    passwordHash: process.env.BASIC_AUTH_PASSWORD_HASH || '',
    maxFailures: Number(process.env.BASIC_AUTH_MAX_FAILURES) || 10,
    lockoutMinutes: Number(process.env.BASIC_AUTH_LOCKOUT_MINUTES) || 15
  }
};
