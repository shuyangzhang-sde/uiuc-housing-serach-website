# Expo private beta readiness

Status: Phase 5 implementation prepared locally, **not released to testers**.
Last checked: November 18, 2026. Website routes and cookie authentication are unchanged.

## What is implemented

- Native usage events: successful email login, Browse/Map/detail visits, filter and
  sort changes, successful external listing/brochure opens, and a diagnostic event.
- Mobile sends a bearer-authenticated `POST /api/events` to the existing FastAPI
  service. The endpoint verifies the JWT using the existing project JWKS, derives
  user identity from its subject, excludes `ADMIN_EMAIL` accounts, and forwards
  validated events to the existing Supabase events table using the **caller JWT**.
  Its existing insert RLS policy remains the database authority. No service-role
  credential or identity from the request body is accepted.
- Event names/metadata are allowlisted and bounded on the server. Metadata includes
  platform, native app version/build, and environment; it omits emails, search values, addresses,
  listing URLs, tokens, and OTPs. User IDs remain in the existing events schema.
- Delivery is best effort, with a five-second request timeout, bounded concurrency,
  two-second duplicate suppression, no persistent queue, and a per-process backend
  limit of 60 events/user/minute. Failures never block app use. This is usage
  telemetry, not an audit log or a precise conversion counter.
- Sentry SDK, Expo plugin, Metro source maps, root error capture/retry, and a
  conservative JS event scrubber are installed. Messages, user/request/context/extra
  payloads and breadcrumbs are removed before JS delivery; stack locations remain.
  Default PII, tracing, session replay and profiling are not enabled. Native SDK
  crash handling is included; native report delivery/symbolication still needs a
  configured release build and a physical-device test.
- Development builds never send analytics or crash reports. Analytics requires
  an explicit public build flag; Sentry requires a public DSN. The backend is
  disabled by default. Missing telemetry configuration does not disable housing search.
- Account → Beta diagnostics is available in development and preview builds. It
  checks backend connectivity and provides explicit test-event/nonfatal-error
  buttons. A successful SDK flush is not proof of an issue appearing in Sentry.

## Configuration and distribution

1. Confirm the deployed Supabase signup hook and domain policy, the intended beta
   participant list, and privacy notice. Current preview profiles use the existing
   production backend/auth/data. They are **not** a separate staging environment.
2. Apply/verify `scripts/admin-analytics-setup.sql` in the existing Supabase project
   if the website analytics table/policy has not already been installed. Verify
   authenticated users can insert only their own events and cannot read events.
3. Deploy the updated FastAPI code with `httpx` installed. Set server variables
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`),
   `ADMIN_EMAIL` (comma-separated admin accounts), and `ANALYTICS_ENABLED=true`.
   Do not use `SUPABASE_SERVICE_ROLE_KEY` for this endpoint. Keep `DEV_MODE=false`.
   An unconfigured endpoint returns 503; a backend without this change returns 404.
   Admin events return `skipped: admin`, so use a non-admin beta account to verify
   actual insertion. Exclude `beta_diagnostic` from product metrics.
4. Create/select a **React Native Sentry project** for the Expo app. This is a
   separate service, not the IlliniRent website. Set public `EXPO_PUBLIC_SENTRY_DSN`
   and build variables `SENTRY_ORG` / `SENTRY_PROJECT`. Store a scoped source-map
   upload token as **secret** `SENTRY_AUTH_TOKEN` in EAS. Never use an
   `EXPO_PUBLIC_` name for that token or commit it. Retain the SDK's native release
   identification so source maps and native builds agree.
5. Link a real Expo/EAS project and set `EXPO_PROJECT_ID`. Configure the three
   existing public connection settings from `mobile/.env.example` in the EAS
   **preview** environment. Profiles inject `EXPO_PUBLIC_APP_ENV=preview` and
   `EXPO_PUBLIC_ANALYTICS_ENABLED=true`. Use the same settings when running:

   ```bash
   npm run beta:check --workspace=@illirent/mobile
   ```

   The EAS post-install hook also runs this check for `preview` and `beta-store`
   builds and stops them when required settings are missing. The check prints no
   secret values. It does not verify
   remote credentials, database policies, store signing or delivery. A local run
   without the EAS-only secret will report that setting missing; verify it in the
   actual build environment. Node 24 is required.
6. Use `eas build --profile preview --platform android` from `mobile` for an
   internal APK. Preview iOS uses internal/ad-hoc distribution and registered test
   device UDIDs. For TestFlight or Google Play internal testing, use the
   `beta-store` profile and the store's signing/submission workflow. The production
   app identifier is `com.illinirent.app`; development remains `.dev`. Preview and
   store builds share the production identifier and cannot coexist with each other.
   EAS manages build numbers remotely and increments them automatically. EAS account/signing credentials, Apple
   membership, store listings and tester invitations are still to be configured.
7. Install the actual release artifact. Verify one non-admin event appears in the
   admin analytics dashboard with `platform`/`environment` metadata. Verify the
   diagnostic exception appears in Sentry with readable, source-mapped frames and
   no sensitive payload. Check a controlled native crash on a dedicated test build,
   then relaunch to upload it. Do not distribute with source-map upload disabled.

Local Android debug compilation uses `SENTRY_DISABLE_AUTO_UPLOAD=true` and
`SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD=true` when no Sentry account is configured.
These flags are **not** part of the EAS beta profiles. Adding Sentry changes native
dependencies, so existing development clients must be rebuilt once.

## Release acceptance checklist

Record device/OS, artifact build number, date and tester for each physical test.
Do not infer release behavior solely from Metro or an emulator.

| Check | Current evidence / remaining work |
| --- | --- |
| Shared logic and website compatibility | 10 shared tests, full typechecks and website production build pass locally |
| Mobile behavior and telemetry privacy | 36 mobile tests pass, including event isolation, failure handling and crash redaction |
| Backend authentication/events | 8 mocked-boundary API tests pass; no live analytics writes in tests |
| Native dependency compatibility | Android debug build/install succeeds; Android and iOS JS exports pass; Expo Doctor 21/21 |
| Android cold session restore | Checked on Pixel 6 emulator after native rebuild; real session restored without another code |
| Diagnostics and backend connectivity | Android emulator checked; telemetry correctly disabled in development |
| Text scaling, rotation, background/resume, network recovery | See device-check results below; repeat on actual release artifacts |
| iOS native compilation and hardware | Pending: this machine has Command Line Tools without full Xcode; no iPhone attached |
| Real Android device | Pending: no physical Android device attached |
| Release telemetry delivery | Pending Sentry project/settings, backend deployment/settings, source-map verification |
| Clean-install/login/logout | Pending on release iOS and Android: valid/invalid/expired OTP, resend limits, force-close, expired session, logout offline and account switching |
| Full housing journey | Repeat Browse → dropdown filters → sort → Map clusters/pins → details → external listing → Back; preserve filters, scroll and map state |
| Accessibility | Pending TalkBack/VoiceOver reading order, headings, focus return from dropdowns, large text, contrast and touch targets on both platforms |
| Network resilience | Airplane mode, slow network, cached vs uncached map tiles, timeout/retry, reconnect without duplicate navigation; no promised offline map support |
| Lifecycle / layout | Screen rotation, large text, keyboard/OTP autofill, tablet sizing, background/resume, process eviction, low-memory behavior |
| Map performance | Pending representative physical-device measurements: first result/tile time, frame rate, memory, long-session pan/zoom, 1,306-listing dataset |
| Private-beta delivery | Pending signed store/internal artifacts, tester installation and acceptance, support contact, privacy disclosure and rollback rehearsal |

## Local device-check results — November 18, 2026

Pixel 6 Android emulator, development binary 0.1.0 (1), rebuilt with Sentry and
native app-version support:

- Force-stopped/reopened the app; the existing signed-in session restored and
  Browse loaded 1,306 live listings without requesting another email code.
- Opened Account → Beta diagnostics; verified native version/build display,
  telemetry disabled in development, and live backend connectivity.
- Enabled airplane mode; a backend check ended with a recoverable unavailable
  message. Restored airplane mode and retried successfully (`Backend reachable`).
- Native Android Back returned from diagnostics to Browse. Backgrounding with the
  account sheet open and resuming retained that sheet and the signed-in account.
- Visually inspected Browse at system font scale 1.3: the toolbar wraps, heading
  hierarchy remains visible, and property text wraps. This does not replace
  screen-reader or maximum accessibility-font testing. Changing system font size
  recreated the development activity and returned navigation to Browse; verify
  release behavior and document expectations for transient session-only filters.
- Visually inspected landscape Browse at normal font size: controls remain visible,
  results switch to two columns, and tab navigation remains available. Rotation
  returns to the original portrait mode.
- Original font size, rotation and network settings were restored after testing.

Remote analytics ingestion and native/JS crash delivery were deliberately not
marked passed: remote configuration is absent and tests mock the write boundary.

## Operations

Disable server analytics with `ANALYTICS_ENABLED=false` without rebuilding the app.
Changing public app flags or DSN requires a new build; OTA updates are not set up.
Keep the previous signed artifact available and backend response contracts compatible
with already installed clients. Inspect Sentry new/fatal issues by build and the
beta funnel daily during active testing; assign a support owner before invitations.

References: [Expo build versions](https://docs.expo.dev/build-reference/app-versions/),
[Expo Sentry setup](https://docs.expo.dev/guides/using-sentry/),
[Sentry Expo setup](https://docs.sentry.io/platforms/react-native/guides/expo/),
[Sentry data scrubbing](https://docs.sentry.io/platforms/react-native/data-management/sensitive-data/).
