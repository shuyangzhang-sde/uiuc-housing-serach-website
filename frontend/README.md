# UIUC Housing Frontend

Next.js 16 frontend for the UIUC Housing Assistant. The active app is now focused on search, comparison, and map browsing rather than chat or account-management pages.

## Active Routes

- `/about` — editorial landing page with the current warm campus visual system
- `/card` — card-based listing browse with shared filters and listing detail panel
- `/map` — map-first browse with shared filters, listing pins, and map color controls
- `/login` — Supabase auth
- `/admin/activity` — admin-only activity view, exposed from the header for admins
- `/admin/feedback` — admin-only historical feedback review

There is no active `/account` page. Signed-in user controls live in the shared header:

- unauthenticated users see `Log In`
- signed-in users see their email prefix and avatar
- the dropdown shows the full email and `Log out`
- admin users get the `Admin Activity` tab from `/api/admin/status`

The former user-facing `Rate & Report` page has been retired from navigation and archived at `../archive/retired-feedback-page/`.

## Design System Notes

- App-wide body font: `Inter`
- Display/brand font: `Lilita One`, used for hero text, prominent stats, brand marks, prices, and select headings
- Warm palette tokens live in `app/globals.css`:
  - `warm-ivory`
  - `espresso-brown`
  - `forest-green`
  - `blush-pink`
- About hero image asset: `public/about/uiuc-housing-hero.png`
- Experimental static About preview: `public/about-editorial-preview.html`

## Local Development

The repo intentionally uses the `310x` port range:

- FastAPI backend: `http://localhost:3101`
- Next.js frontend: `http://localhost:3102`

Install JavaScript dependencies from the **repository root** with `npm ci`.
The root `package-lock.json` is the only JavaScript lockfile; do not recreate a
frontend-only lockfile. Existing `cd frontend && npm run dev` commands still work.

Start the frontend:

```bash
npm run dev
```

Useful checks:

```bash
npx tsc --noEmit
npm run lint
```

`npm run lint` may report existing React hook lint issues in `app/card/page.tsx` and `app/map/page.tsx` around synchronous loading-state updates inside effects. Those are pre-existing app-page issues, separate from component-level UI changes.

## Key Components

- `components/AppHeader.tsx` — shared navigation and admin tab
- `components/UserMenu.tsx` — signed-in user dropdown and logout
- `components/FilterChips.tsx` — shared Card/Map filter row
- `components/ListingCardV2.tsx` — active listing card skin
- `components/ListingGrid.tsx` — card grid column layout
- `components/PropertyPanel.tsx` — docked detail panel on Card view
- `components/PropertyDrawer.tsx` — drawer/detail content shared with Map
- `components/MapColorPicker.tsx` — default/custom map color editor
- `components/ListingPhoto.tsx` — image loader with fallback on broken listing photos

## Map Theme

Map theme defaults live in `lib/mapTheme.ts`; persisted theme state lives in `hooks/useMapTheme.ts`.

The active map color UI supports:

- `default` palette
- user-edited custom colors based on the default palette

Named alternate presets were removed from the product UI.


## Shared workspace packages

The website consumes source packages from `../packages/`:

- `@illirent/core`: listing/filter/status contracts, defaults, availability helpers,
  filter options, campus landmarks, and company metadata with platform-neutral logo keys.
- `@illirent/api-client`: query serialization and configurable HTTP transport,
  including cancellation, timeout/error handling, and response validation.
- `@illirent/search-state`: React filter provider shared by Card and Map.
- `@illirent/design-tokens`: palette CSS/TypeScript and font-family names.

The existing `lib/api.ts`, utility modules, and `contexts/FiltersContext.tsx`
remain compatibility adapters. Web calls still use same-origin Next.js API routes
and cookie authentication. Supabase server clients and DOM/map exports remain web-only.
A native client will configure an absolute API origin and an access-token getter.

Run from the repository root:

```bash
npm ci
npm run test:shared
npm run typecheck
npm run build
npm run dev
```

Shared packages are TypeScript source exports, transpiled by Next.js. There is no
separate package build step. Turbopack's root includes the repository so it can
resolve workspace packages. React is a peer dependency of shared filter state.
The shared tests include a real two-listing backend response fixture, transport
checks, filter-state persistence, and CSS/TypeScript palette parity.

### Vercel deployment

Keep the Vercel Root Directory set to `frontend`. Its `vercel.json` installs from
the repository root (`cd .. && npm ci`); the build command remains `npm run build`.
In Vercel project settings, enable **Include source files outside of the Root
Directory in the Build Step** so `packages/` and the root lockfile are available.
If an existing project-level install override is present, align it with this
command. The remote project settings have not been changed by this migration.
No Railway or Python installation changes are needed.

The `Web, mobile, and shared packages` GitHub workflow runs shared/mobile tests, typechecking,
and a production build. Full lint remains a separate check because the current
baseline has three errors and 18 warnings in existing web code.
