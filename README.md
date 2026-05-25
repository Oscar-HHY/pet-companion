# Pet Companion

A full-featured iOS pet care app: pet health tracking, AI-generated pixel-art avatars, native iOS Live Activities, real-time chat with friends, and a memory-keeping community — built end-to-end with React Native, Supabase, and a small set of custom iOS extensions.

> Status: prepared for App Store submission. See `HANDOFF.md` for the engineering log across all build sessions.

---

## What's in the app

| Area | Features |
|---|---|
| **Pet profile** | Photo, breed, age, bio, live status (idle / eating / sleeping / etc.) |
| **AI pixel avatar** | Generates a 2D pixel-art version of the pet from a photo, using Volcengine Doubao Seedream via a server-side proxy |
| **Health tracking** | Symptom questionnaires, medical records, vaccination history, weight log |
| **Vaccination reminders** | Scheduled iOS local notifications fire at 9 AM on the next due date |
| **Companion Dock** | Time walks / baths / playtime with a native iOS Live Activity on Lock Screen and Dynamic Island |
| **Memory palace** | Photos, videos, voice recordings ("memory echos"), diary entries |
| **Community** | Posts, comments, hugs/tissues reactions, content reports |
| **Friends & messaging** | Friend requests, blocks, real-time chat backed by Supabase Realtime |
| **Notifications hub** | In-app feed of incoming comments + upcoming vaccinations |
| **Bilingual** | Full Chinese + English support, switch instantly in Settings |
| **Theming** | Multiple background palettes; follows system dark mode by default |

---

## Tech stack

- **Frontend**: React Native 0.81 + Expo SDK 54 + TypeScript
- **Native iOS extensions**: Swift (ActivityKit) for the Companion Dock Live Activity
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions)
- **Edge Functions** (Deno):
  - `generate-pixel-pet` — proxies Seedream image generation, keeps API key server-side, sanitizes prompts
  - `delete-account` — App Store guideline 5.1.1(v) compliance; service-role wipes storage, public-schema rows, profile, and auth user
- **Realtime**: Postgres `LISTEN/NOTIFY` via Supabase `supabase_realtime` publication on `chat_messages` and `friendships`
- **Notifications**: `expo-notifications` for local scheduled reminders (no push server)
- **Image generation**: Volcengine Doubao Seedream 5.0

---

## Architecture highlights

A few design choices worth calling out:

1. **All third-party AI calls are proxied through Supabase Edge Functions** so the Seedream API key never ships in the iOS bundle. The client only ever sees its own JWT and forwards images via `supabase.functions.invoke()`.

2. **Row-Level Security on every table**, with a hand-audited policy sweep that caught two silent bugs where "delete" policies were mislabeled as `FOR INSERT` (PostgREST would return success but RLS would filter every row, so no rows were actually affected). Documented in `HANDOFF.md` under "Part 4.4".

3. **Account deletion respects the FK reality**, not the FK intent. The `delete-account` Edge Function discovered during the audit that `user_profiles.id` is `text` while `auth.users.id` is `uuid`, so a FK cascade between them is impossible without a type migration. Instead the function deletes from the 6 no-FK tables explicitly, then deletes `user_profiles` (cascades 10 other tables), then `auth.users`. Documented inline in `supabase/functions/delete-account/index.ts`.

4. **Realtime + 60s polling fallback** — every subscriber to `chat_messages` / `friendships` has a 60-second polling safety net for cases where the WebSocket dropped without notification.

5. **iOS Live Activity from React Native** — bridged via a custom Expo config plugin (`mobile_app/plugins/withLiveActivities`) plus a Swift module (`mobile_app/ios/CompanionLiveActivityExtension/`).

---

## Repository layout

```
.
├── mobile_app/                   # React Native + Expo app
│   ├── src/
│   │   ├── screens/              # Pet, Health, Community, Friends, Settings, etc.
│   │   ├── services/             # Supabase client, PetDatabaseService, notifications, Seedream proxy
│   │   ├── context/              # BadgeContext (realtime), SettingsContext (theme/lang)
│   │   ├── navigation/           # Root + bottom tabs + drawer
│   │   ├── components/           # Shared components (PetAvatar, ReportModal, etc.)
│   │   └── i18n/                 # Chinese + English strings
│   ├── ios/
│   │   ├── mobileapp/            # Main iOS target
│   │   ├── CompanionLiveActivityExtension/  # Live Activity widget extension
│   │   └── Podfile
│   ├── plugins/withLiveActivities.js  # Expo config plugin for the LA extension
│   ├── app.json                  # Expo configuration
│   └── package.json
├── supabase/
│   ├── migrations/               # All schema + RLS + grants + realtime + reminder column
│   └── functions/                # Edge Functions (generate-pixel-pet, delete-account)
├── For_Seedream_API/             # Reference docs for the Volcengine image API
├── For_Zhipu_API/                # Reference docs for the Zhipu Chat API (unused in v1)
├── UI_Reference/                 # Design reference assets
├── PRIVACY.md                    # Full privacy policy (bilingual)
├── APP_STORE_LISTING.md          # Pre-filled App Store Connect listing copy (EN + ZH)
├── APP_STORE_PRIVACY_LABELS.md   # Privacy Nutrition Labels answer key
├── APP_STORE_REVIEWER_DEMO.md    # Demo reviewer account setup + seed SQL
├── HANDOFF.md                    # Engineering log across all build sessions
├── MIGRATION_GUIDE.md            # Notes on the US → Seoul Supabase region migration
└── README.md                     # this file
```

---

## Running locally

### Prerequisites

- Node 18+ and npm
- Xcode 16+ (for iOS)
- CocoaPods (`brew install cocoapods`)
- A Supabase project of your own (free tier is fine)
- The Supabase CLI (`brew install supabase/tap/supabase`)

### Setup

```bash
# 1. Install dependencies
cd mobile_app
npm install --legacy-peer-deps

# 2. Configure Supabase
cp .env.example .env
# Edit .env with your own Supabase URL + anon key

# 3. Apply database migrations (requires Supabase CLI linked to your project)
cd ../supabase
supabase link --project-ref <your-project-ref>
supabase db push --db-url "postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres"

# 4. Deploy Edge Functions
supabase functions deploy generate-pixel-pet
supabase functions deploy delete-account
supabase secrets set SEEDREAM_API_KEY=<your-volcengine-key>

# 5. Run the app on a simulator or device
cd ../mobile_app
npx expo run:ios               # simulator
npx expo run:ios --device      # physical iPhone (must be plugged in + trusted)
```

The first iOS build runs `pod install` automatically; expect ~5 min on first run.

---

## Privacy

Pet Companion does not track users, does not sell data, and does not show ads. The full bilingual policy is in `PRIVACY.md` and hosted at https://oscar-hhy.github.io/pet-companion-privacy/.

---

## License

MIT — see `LICENSE`.
