import path from 'path';

// The Windows launchers pass no secrets along, so they are read from .env. ENV_DIR is the folder they
// keep it in: the project folder, or the user's own folder for an installed app.
try {
  process.loadEnvFile(process.env.ENV_DIR ? path.join(process.env.ENV_DIR, '.env') : undefined);
} catch {
  // No .env: the app runs, and Google Calendar says what is missing when someone uses it
}

/** Server configuration, read once from environment variables. Secrets never live in this file. */
export const config = {
  port: Number(process.env.PORT) || 3000,
  // 127.0.0.1 keeps the app on this computer only, with no firewall prompt on Windows
  host: process.env.HOST || '0.0.0.0',

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
  },

  firebaseProjectId: 'marka-96250',

  // Must match the list in firestore.rules. Only these accounts may use the calendar routes or be connected to them.
  teamEmails: ['markaselfstudio@gmail.com'],

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || ''
  }
};
