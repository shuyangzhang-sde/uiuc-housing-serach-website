// Run with the same environment variables as the intended EAS preview build.
import { loadEnvFile } from 'node:process';
for (const file of ['.env', '.env.local']) { try { loadEnvFile(file); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
const failures = [];
for (const key of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SENTRY_DSN']) {
  try { if (new URL(process.env[key]).protocol !== 'https:') throw Error(); }
  catch { failures.push(`${key} must be an HTTPS URL`); }
}
for (const key of ['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_AUTH_TOKEN']) {
  if (!process.env[key]) failures.push(`${key} is missing`);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(process.env.EXPO_PROJECT_ID ?? '')) failures.push('EXPO_PROJECT_ID must identify a real EAS project');
if (process.env.EXPO_PUBLIC_APP_ENV !== 'preview') failures.push('EXPO_PUBLIC_APP_ENV must be preview');
if (process.env.EXPO_PUBLIC_ANALYTICS_ENABLED !== 'true') failures.push('EXPO_PUBLIC_ANALYTICS_ENABLED must be true');
for (const key of ['SENTRY_DISABLE_AUTO_UPLOAD', 'SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD']) {
  if (process.env[key] === 'true') failures.push(`${key} must not disable beta source-map uploads`);
}
try {
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  if (!key.startsWith('sb_publishable_') && JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role !== 'anon') throw Error();
  if (key.startsWith('sb_secret_')) throw Error();
} catch { failures.push('Supabase client key must be a publishable or legacy anon key'); }
if (failures.length) { console.error('Beta configuration incomplete:\n' + failures.map(f => `- ${f}`).join('\n')); process.exitCode = 1; }
else console.log('Build settings present. Verify event delivery, symbolication, signing and the device checklist before distributing.');
