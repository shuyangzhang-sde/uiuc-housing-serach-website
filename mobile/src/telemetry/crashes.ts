import * as Sentry from "@sentry/react-native"
import { scrubCrash } from "./privacy"

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN
export const crashReportingEnabled = !!dsn && !__DEV__
Sentry.init({
  dsn, enabled: crashReportingEnabled,
  environment: process.env.EXPO_PUBLIC_APP_ENV ?? "development",
  sendDefaultPii: false, tracesSampleRate: 0,
  beforeSend: event => scrubCrash({ ...event, breadcrumbs: undefined }),
  beforeBreadcrumb: () => null,
})
export { Sentry }
