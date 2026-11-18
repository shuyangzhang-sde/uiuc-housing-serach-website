# IlliniRent mobile — Expo

Native iOS and Android app alongside the existing Next.js website. This foundation
implements email-code login, secure session restoration, foreground token refresh,
logout, paginated listing browsing, filters, sorting, and property details using
the existing FastAPI backend, plus a clustered native map sharing the same filters.
Google OAuth remains later work.

## Requirements and installation

Use Node 24 LTS (the root `.nvmrc`) or Node 22.13+, npm, and the repository-root
lockfile. MapLibre’s style dependency requires Node 22 or newer; CI uses Node 24:

```bash
# If using nvm: nvm use
npm ci
cp mobile/.env.example mobile/.env.local
```

Fill in the three public values in `mobile/.env.local`. The Supabase publishable
(or legacy anon) key and URL must refer to the same project whose JWTs FastAPI
verifies. Never put a service-role key in the mobile environment. Local environment
files are ignored; `.env.example` is intentionally tracked.

`EXPO_PUBLIC_API_URL` is the **FastAPI origin**, without `/api`, not the Next.js
website. All `EXPO_PUBLIC_*` configuration is readable in the compiled app.
Restart Metro after changing it. Release builds reject HTTP backend URLs.

The example defaults to the deployed HTTPS listing service, so testing login does
not require a local FastAPI process. To develop the backend locally, explicitly
change the origin using the table below and keep FastAPI running. An emulator
origin such as `10.0.2.2` will fail whenever the local server is stopped.
Successful email verification signs you in independently of listing-service
availability; the signed-in screen reports these two states separately.

| Test target | Local backend origin |
|---|---|
| Android emulator | `http://10.0.2.2:3101` |
| iOS simulator | `http://localhost:3101` |
| Physical phone | `http://YOUR_COMPUTER_LAN_IP:3101` |
| Preview/production binary | The deployed FastAPI HTTPS origin |

For local phone access, bind the backend to the LAN interface:

```bash
.venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 3101
```

Keep `DEV_MODE=false` or unset when verifying mobile auth. A backend with auth
bypassed cannot prove that the app's bearer-token flow works. Development builds
permit HTTP for local work; preview/production builds disable Android cleartext.
Configure the existing backend's Supabase project URL if using another auth project.

## Run a real development build

Android requires Android Studio/SDK, an emulator or attached phone, and a compatible
JDK. iOS requires macOS with full Xcode and a simulator or signing setup.

From the repository root:

```bash
npm run mobile:android
# or
npm run mobile:ios
```

These build and install an Expo development client and start Metro on port 3103.
After installation, restart only Metro with:

```bash
npm run mobile
```

The native `android/` and `ios/` folders are generated and ignored. After changing
native dependencies/plugins, regenerate and rebuild rather than reusing an old
binary. Expo Go is not the validation target; MapLibre requires a
custom development build. After installing the MapLibre dependency, rebuild an
older Phase 3 development client before opening the map. Simulators/emulators run the actual native app, and
physical-device/store builds come from the same source.

## Login and persistence

Email sign-in uses the same eight-digit OTP and allowed-domain UX rules as web.
Supabase's deployed signup hook is the authority for eligibility. The app does not
create a separate user database. Keep the Supabase email template configured to
send `{{ .Token }}` and the OTP length set to eight; this app uses email codes,
not magic-link callbacks. No new OAuth redirect configuration is needed yet.

The root route waits for restoration before showing either login or protected
content. A failed restore offers retry and saved-session clearing. Signed-in
content unmounts when the session ends, clearing its local listing state.

Tokens are persisted only in SecureStore. The adapter splits large Unicode
sessions into small items, writes a new generation, then commits its pointer.
Operations are serialized so refresh writes cannot race logout. Failed writes
preserve the old generation. Incomplete/corrupt sessions surface a recovery flow.
No biometric prompt is requested. Keychain values on iOS may survive reinstall;
uninstalling is not a logout mechanism.

Refresh follows AppState: it runs in the foreground and stops in the background.
The shared API client reads the current token for each protected request. A 401
triggers one coordinated refresh and one retry. A second 401 clears local auth;
refresh connectivity failures preserve credentials so the user can retry online.
Logout attempts to revoke the current Supabase session and always clears local
credentials, including when the remote request fails. Device-storage failures
show an error instead of claiming successful cleanup.

## Package choices

Expo SDK 57 / React Native 0.86 use the existing React 19.2.4 instance. Expo's
nominal React pin is 19.2.3; `expo.install.exclude` intentionally excludes this
single newer compatible patch so web and native avoid duplicate React copies.
Mobile uses its own Expo-recommended TypeScript 6; the website keeps TypeScript 5.
The SDK was selected after Expo Doctor flagged a Hermes regression in SDK 56.
Root npm overrides pin React Native and Worklets to the SDK-compatible versions
to prevent incompatible transitive native copies; update these together with the SDK.

The app imports `@illirent/core`, `@illirent/api-client`, and
`@illirent/design-tokens`. Metro uses Expo's default workspace/autolinking support;
there is no custom module aliasing. Native auth adapters stay in `mobile/src/auth`.

## Checks

```bash
npm run test:shared
npm run test:mobile
.venv/bin/python -m unittest discover -s tests -p test_mobile_api_auth.py -v
npm run typecheck
npm run build
npm run export:check --workspace=@illirent/mobile
npx expo-doctor mobile
```

Mobile tests cover large-session persistence, interrupted writes, restoration
races, AppState cleanup, refresh/retry, configuration, and mocked Supabase email
OTP followed by restoration in a new client. Mocked auth tests do not send mail.
Bundle exports and unit tests do not prove native Keychain/Keystore behavior or
real email delivery; complete the device checklist below before beta.

## Device acceptance checklist

- Start with auth enforcement enabled on the backend; an unauthenticated request
  to `/api/listings` must return 401.
- Request a code for your own allowed-domain email, enter it, and confirm the
  protected preview loads. Verify invalid/expired codes and resend cooldown.
- Force-close/reopen: restoration should retain sign-in and load listings.
- Background and resume after token expiry; protected reads should recover.
- Disable networking: show retry feedback without deleting a valid session.
- Log out while offline, reopen, and confirm login is required.
- Repeat on installed Android and iOS builds and at least one physical device.

## Preview and eventual store builds

`eas.json` includes development, preview, and production profiles. Development has
separate bundle IDs and a development client. Preview/production use production
IDs and require HTTPS services. IDs (`com.illinirent.app`) are proposed defaults;
verify ownership before registering them in developer accounts.

Link to your own Expo/EAS project before remote builds; no project ID or developer
credentials are committed. Set the three public variables in the appropriate EAS
environment and use `APP_VARIANT=production` for preview/production. No remote
project, signing identity, build submission, or store release is created here.

## Implementation verification — November 17, 2026

- Clean root `npm ci`, web/mobile typechecks, and the website production build pass.
- 13 mobile auth tests, 10 shared tests, and three backend JWT integration tests pass.
- Expo Doctor passes all 21 checks; iOS and Android Hermes bundle exports pass.
- An Android development APK built successfully and opened the native login screen
  in the local Pixel 6 emulator. The incomplete local NDK was repaired and required
  SDK components installed by Gradle during this check.
- Real email-code delivery, force-close restoration with a real account, offline
  logout, and physical-device acceptance remain manual checks. Native iOS compilation
  was not run because this computer has command-line tools rather than full Xcode.
- Website lint remains at its existing three errors and 18 warnings.

### Backend connection fix — November 18, 2026

The original local emulator configuration pointed to `http://10.0.2.2:3101`.
When FastAPI was stopped, OTP verification still succeeded but listings failed.
The example now defaults to the deployed HTTPS FastAPI origin; local development
remains an explicit opt-in. Listing failures describe service availability separately
from authentication, and the header says “You’re signed in.”

Verified on the Android emulator: force-closing/reopening restored the existing
real-account session and loaded the deployed backend's 1,306 listings without
another code. Fifteen mobile tests and mobile/test typechecks pass. Physical-device
and native iOS acceptance remain outstanding.


## Phase 3 — browse, filters, sorting, and details

The signed-in root is a virtualized `FlatList`, with one column on phones and two
on wider screens. Results use 24-record server pages, automatic pagination, a Load
more fallback, pull-to-refresh, retry, empty states, and photo loading/fallbacks.
Refresh restarts at page one. A failed later page keeps earlier results visible.

`@illirent/search-state` owns the applied filters. Each toolbar category opens an
anchored dropdown over the cards. Beds/managers apply immediately and stay open for
multiple selections; Done closes the popup. Property type, availability, and sort
apply with one tap and close. Budget inputs use a small draft panel with Clear and
Apply; closing it discards uncommitted amounts. Shared option lists cover beds
(including studio and 5+), budget per bed, ceiling-only tolerance, availability,
property type/penthouse, and multiple managers. Whole-dollar inputs accept zero and
reject invalid ranges. Changing filters or sorting returns to page one. Sorting
options and price-range formatting live in `@illirent/core` and are also used by web.

TanStack Query owns in-memory server state. Cache keys include identity, canonical
filters, and sort; reordered equivalent multi-selects share a cache entry. Query
cancellation prevents late responses from replacing a newer search. AppState drives
foreground revalidation. There is no persisted listing cache or complete offline
search. The protected provider is keyed by identity and clears its cache on unmount.
Account/Log out remain accessible from the browse header.

Selecting a card opens the property route with its session-local selected record.
Returning preserves filters, sorting, loaded pages, and scroll position. The detail
screen includes the photo, availability, price notes/ranges, description, amenities,
lease dates, utilities, and validated HTTP(S) source/brochure links. Missing numeric
prices remain unpublished; per-bed prices are never presented as a fabricated total.

The API still has no stable listing ID/detail endpoint. Property selection is not
persisted or a durable shared URL. A cold property link asks the user to choose a
listing rather than inventing or reusing an unrelated record. Stable links and saved
homes remain follow-up work.

### Browse acceptance checks

- Apply two beds, a budget, and multiple companies; compare results with the website
  using the same filters and accepted dataset.
- Close a dropdown by tapping outside or using Android Back. An uncommitted budget
  edit must be discarded; beds/managers should retain immediately applied selections.
- Change sort after loading multiple pages; the new ordering must begin at page one.
- Open property details, return, and verify filters/ordering/scroll position persist.
- Try no matches, broken photos, a failed next page, and slow-network filter changes.
- Test source/PDF links, Android Back, font scaling, and phone/tablet layouts.

Automated Phase 3 checks cover canonical keys, immutable drafts, input validation,
pagination/stop conditions, sort resets, stale-request cancellation, failed-page retry,
price presentation, and safe external URLs. Existing auth and shared tests remain.

### Phase 3 live Android verification — November 18, 2026

Using a real signed-in account in the Pixel 6 emulator:

- The deployed API returned 1,306 listings. Ascending price order began at $260.
- Two beds and a $900 maximum returned 238 listings, matching the backend on the
  November 14 snapshot, with the first ascending result at $400 per bed.
- Editing a draft bed selection then Cancel retained the 238-result search.
- A $550 ceiling returned 25 listings; descending order began at $550 per bed.
- Scrolling loaded the second server page and ended with all 25 results shown.
- Details displayed the selected property, availability, description, and correct
  per-bed/total pricing. Returning retained the filters, order, loaded pages, and
  exact scroll position at the end of the list.
- Working photos and unavailable-photo fallbacks were both observed.

The emulator was returned to the unfiltered default sort. Broader physical-device,
iOS, accessibility/font-scale, and offline device acceptance remain separate checks.


### Compact dropdown controls — November 18, 2026

The full-page Filter/Sort sheets were replaced with small anchored popovers at the
user’s request. All categories are visible in a wrapping toolbar: Beds, Budget per
bed, Type, Availability, Managers, and Sort. The list remains visible underneath.
Popovers have bounded scrollable content, outside-tap/Back dismissal, and keyboard-aware
budget placement. Single choices apply immediately; multi-select lists stay open
until Done. Budget retains explicit Apply because amounts require validation.

Verified dropdown positioning, bed toggles, property options, and numeric-keyboard
placement in the Android emulator. The 25 mobile tests, mobile typechecks, and both
native bundle exports pass. Earlier full-sheet Cancel checks above describe the
previous interaction, superseded by these controls.

### Compact typography — November 18, 2026

Mobile text now uses a central hierarchy in `src/components/typography.ts`: page
headings 26, card headings 18, section headings 16, body text 14, controls 13,
metadata 12, and badges 11. Prices remain emphasized at 22. Login, account, browse,
property details, inputs, and dropdowns all use this scale. Native accessibility
font scaling and existing touch-target sizes are preserved. Mobile typechecks and
an Android visual check pass.


## Phase 4 — shared Browse and Map tabs

The protected navigation now contains a persistent `(tabs)` navigator for Browse
(`/`) and Map (`/map`), with property details above it in the parent stack. The same
`BrowseProvider`, `FiltersProvider`, authenticated API, and account-scoped query client
surround both tabs. The header/dropdowns are one shared component, so edits in either
tab immediately update the other. Browse keeps its own sort and pagination state.

The map uses `@maplibre/maplibre-react-native` 11 with the Expo config plugin and
OpenFreeMap’s Positron style, tiles, glyphs, and native attribution control. It needs
an installed development build, not Expo Go. No paid tile account, Google Maps key,
or user-location permission is needed for the campus-centered experience.

The authenticated all-listings endpoint loads every matching listing, rather than
only Browse’s current page. Its query key includes identity and canonical filters;
it has separate cache data from the paginated browse query. Late searches are
cancelled and cannot put old pins back on the map.

Map presentation:

- A default campus view with shared landmark labels; Campus, Fit, and zoom controls.
- Native GeoJSON layers and clustering, avoiding hundreds of React marker views.
- A single location pin groups coordinate-coincident floor plans while retaining
  all underlying listings. Cluster numbers count **locations**, not floor plans.
- Price pins show the lowest published comparable starting price at that location;
  unavailable pricing remains `—`, and availability controls pin color.
- Tap a cluster to expand it; tap a location for a preview and its listing options.
  Each option opens the existing property detail screen; Back returns to Map.
- Invalid/missing coordinates are excluded only from the geometry, with their
  count explained; all matching listings remain available in Browse.
- Empty-data, request failure, tile failure/retry, and missing-selection recovery.
- Map selection/camera stay within the signed-in session. Filters changing clear
  the preview and refit filtered results; background price refreshes do not recenter.

Existing installations must be rebuilt once to include MapLibre:

```bash
npm run mobile:android
# Full Xcode required:
npm run mobile:ios
```

For an already-running Metro server, compile/install without starting another one:

```bash
cd mobile
npx expo run:android --no-bundler
```

Do not combine `--no-bundler` and `--port` with Expo CLI. If that build opens the
default port 8081, choose the existing port 3103 development server in the client.
Normal subsequent JS-only work still uses `npm run mobile` from the repository root.

### Phase 4 verification

The Android native build, all 32 mobile tests, 10 shared tests, web/mobile typechecks,
website production build, both native bundle exports, and all 21 Expo Doctor checks
pass. The existing web lint baseline remains three errors and 18 warnings.

Live Android checks rendered 1,306 listings at 599 locations with real tiles and
price/cluster labels. A two-bed/$900 search stayed at 238 matches across tabs;
a budget change in Browse to $550 propagated to Map as 25 listings at 23 locations.
Cluster taps expanded the map, individual pins opened the correct location preview,
and a map option opened the correct property details. Back to map restored the
selected location preview and the same filtered result count.

Native iOS compilation, physical-device GPU/memory performance, slow/offline tile
recovery, and broader accessibility checks remain release acceptance work. The
all-results query is suitable for the current dataset; evaluate a dedicated small
map/viewport endpoint if listing volume grows substantially. Custom map themes,
walking-time calculations, location tracking, offline tiles, and saved homes are
separate features.

References: [MapLibre Expo setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/),
[OpenFreeMap mobile guide](https://openfreemap.org/quick_start/).

## Phase 5: private beta preparation

Sentry native/JS crash reporting, privacy filtering, authenticated analytics,
preview/store build profiles, configuration checks and Account → Beta diagnostics
are implemented. Telemetry is disabled in development. Existing native development
clients need one rebuild to include Sentry; ordinary JS development is unchanged.

Follow [private beta readiness](../design-docs/private-beta-readiness.md) for server
settings, Sentry/EAS setup, release verification and the remaining device checklist.
`npm run beta:check --workspace=@illirent/mobile` reports missing build settings
without exposing their values. It is expected to fail until Sentry/EAS are configured.
The integration is prepared locally; a private beta has not been published.

## Visual style: playful campus homes

The current mobile direction follows a graphic cafe/editorial reference: white
surfaces, black text and actions, mustard yellow accents, a coral illustration
panel, and a small handwritten greeting. The previous peach gradients and soft
shadows have been removed. All listing photos remain authentic source images.

Typography uses locally bundled static Inter Regular/Medium/Semibold/Bold and a
Caveat Medium accent. `src/components/AppFonts.tsx` loads these and the icon face
before app text mounts, with a retry state for load failures. No font service is
needed by installed release builds. Body sizes, native text scaling and compact
controls remain centralized in `src/components/typography.ts`.

The original decorative student/plant/home illustration lives at
`assets/illustrations/moving-home.png`. It is generated brand artwork, not a listing
photo or a depiction of a listed property. It now appears only on the dedicated
Home page; search headers never contain the large headline or illustration.
Filter/action targets retain their minimum 44-point size, and all five filter
categories remain directly accessible.

Browse, details, dropdowns, sign-in/account states, tabs and map overlays share the
UI typography. MapLibre labels/native price symbols keep the map style's glyph
font. Website styling and shared search/backend logic are unchanged. Full technical
pricing notes remain expandable behind student-facing summaries.

Mobile typechecks, 36 mobile tests and both native bundle exports pass. Native iOS
device rendering still requires a separate hardware check.


### Home and search navigation

The signed-in root (`/`) is a scrollable welcome/function page with the illustration,
Browse homes and Explore the map entrances, the shared Account menu, and a current
search shortcut when filters or a custom sort are selected. The graphic hero stacks
on narrow screens and at larger text sizes. It makes no extra listing request.

Persistent bottom tabs are Home (`/`), Browse (`/browse`), and Map (`/map`). Browse
and Map use the same compact `SearchHeader`, while `AppHeader` owns shared brand and
account controls. The protected parent `BrowseProvider` still owns filters, sorting,
selection and the query cache, so tab switches do not reset the current search.
Property-detail recovery and map empty-state links target `/browse` explicitly.
Android tab Back behavior follows navigation history. The new `home_view` analytics
event is allowlisted in the app and backend; telemetry configuration is unchanged.
