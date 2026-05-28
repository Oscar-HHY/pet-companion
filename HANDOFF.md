# Pet Companion — App Store Launch Prep Handoff

**Last updated:** 2026-05-28 (session 9)
**Status:** **Mid App Store Connect submission.** This session: renamed the app to **萌宠无忧** (zh primary) / **Pet Companion: Care & Memory** (en secondary, the bare "Pet Companion" was taken), made the app **iPhone-only**, created the App Store Connect record (zh-Hans primary, SKU/age-rating/pricing/privacy-labels done by user), and fixed **two App Store rejection risks** (dead "share pet" button + community "coming soon" share alert) plus one **RLS bug** (friends' pet profiles were invisible — migration applied to prod). **Currently blocked on:** capturing App Store screenshots from the **iPhone 17 Pro Max simulator** (Metro is running in background). **Next: finish screenshots → native rebuild → production build/upload (Phase F).**

---

## How to resume next session

In a new Claude Code session, `cd /Users/poutine./Desktop/Pet_Companionship` then say:

> "Read `HANDOFF.md` and continue from where we left off."

The Supabase CLI is already installed, authenticated, and linked to project `pzozanrirwjnlrgvqlzj` (Seoul). Claude can run migrations + deploy Edge Functions via the pooler URL (psql full path `/opt/homebrew/opt/libpq/bin/psql`, `psql` is NOT on PATH).

⚠ **Project lives at `/Users/poutine./Desktop/Pet_Companionship`** (moved from `Downloads/` between sessions 7 and 8). Recurring symptom: a `ConfigError` referencing the old `/Downloads/...` path = a stale Metro pinned to the old location — kill it and restart Metro from the Desktop path.

⚠ **Everything is UNCOMMITTED.** The only git commit is the initial `f597e45`. All 9 sessions' source/function/config changes sit in the working tree, never committed. Run `git status` to see them. The public repo `Oscar-HHY/pet-companion` does NOT contain any of these fixes.

**Available project skills:**
- `conclusion` — regenerate this HANDOFF.md (trigger: "conclusion", "总结", "wrap up")
- `code-check` — full architect-style code review of the session's changes (trigger: "check codes", "code review", "代码审查")

---

## Decisions already locked in

| Topic | Choice |
|---|---|
| Bundle ID | `com.beichen.petcompanion` (iOS + Android) |
| Live Activity extension Bundle ID | `com.beichen.petcompanion.CompanionLiveActivityExtension` |
| **App Store name (zh-Hans, PRIMARY)** | **萌宠无忧** (session 9 — supersedes old 宠物伴侣) |
| **App Store name (en-US, secondary)** | **Pet Companion: Care & Memory** (session 9 — bare "Pet Companion" was already taken on the App Store; names are globally unique) |
| **App Store Connect Primary Language** | **Simplified Chinese (zh-Hans)** (session 9 — English is secondary localization) |
| **On-device display name (CFBundleDisplayName)** | **萌宠无忧** (session 9 — `ios/mobileapp/Info.plist` + `app.json` `expo.name`; single value, shows on all devices regardless of system language; **requires native rebuild to take effect**) |
| Internal slug / CFBundleName | `petcompanion` / `$(PRODUCT_NAME)` = `mobileapp` (internal, unchanged) |
| Xcode project / target name | **`ios/mobileapp.xcodeproj`**, target `mobileapp`. Workspace: `ios/mobileapp.xcworkspace`. |
| **Device support** | **iPhone-only** (session 9): `app.json` `supportsTablet: false` + `TARGETED_DEVICE_FAMILY = "1"` (4 build configs). Reason: skip iPad screenshots + iPad review for a faster v1; can add iPad in a later update. **Requires native rebuild.** |
| App ID capabilities to enable | **NONE.** Entitlements file is empty `<dict/>`. Local notifications only, Live Activity via `NSSupportsLiveActivities` Info.plist key, Supabase auth. In-App Purchase + Game Center show pre-checked/greyed (Apple defaults) — leave them. |
| App IDs registered | Both already existed on developer.apple.com (Xcode automatic signing auto-created them). Registering again throws "An App ID with Identifier '…' is not available" — that's expected, just confirm they're in the Identifiers list. |
| **Age Rating** | **13+** (session 9, via Apple's NEW multi-step questionnaire). Answers: UGC=Yes, Messaging=Yes, Advertising=No, Parental Controls=No, Age Assurance=No, Unrestricted Web=No, Loot Boxes=No, Health/Wellness Topics=No, all violence/sexual/gambling=None/No. Override = Not Applicable. |
| **App Store Connect SKU / User Access** | SKU `petcompanion-001` (internal, permanent, never shown). User Access = **Full Access** (correct for a solo developer). |
| **ASC Version number** | **`1.0.0`** (must match the build's `CFBundleShortVersionString` / `MARKETING_VERSION = 1.0.0`; do NOT use "1.0"). |
| **Copyright** | `2026 Hengyu He` (the name on the Apple Developer account; or user's legal name). |
| **Description field char rule** | App Store Connect Description **rejects `✓` (U+2713, Dingbats block)** → "invalid characters". Use **`•` (U+2022)** and `—` (em dash) which are General Punctuation and accepted. All `✓` in `APP_STORE_LISTING.md` were swapped to `•`. |
| Keywords (ZH) | `宠物,猫狗,健康记录,疫苗提醒,体检,像素,头像生成,记忆相册,日记,陪伴,养宠,小动物,新手,称重,笔记,双语` (56 chars). Removed `萌宠` (now in App Name 萌宠无忧, auto-indexed); added `宠物` (no longer in name). |
| Keywords (EN) | `dog,cat,puppy,kitten,health,tracker,vaccination,reminder,avatar,weight,diary,bilingual,pixel,walks` (98 chars). Removed `care`+`memory` (now in en App Name); added `pixel`+`walks`. |
| Dark mode | Follows system; users can override in Settings |
| `user_profiles` schema | Has `email` + `contact_info` columns |
| Workflow | Batch fixes, pause for user review between Parts |
| Privacy Policy URL | **`https://oscar-hhy.github.io/pet-companion-privacy/`** — live; wired into `AboutScreen.tsx` |
| EULA URL | Apple standard `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/` |
| MARKETING_VERSION / build # | `1.0.0` / `1` (both targets must match; bump build # per re-upload) |
| Apple Developer Program | **APPROVED 2026-05-28**, Individual / Sole Proprietor. Apple ID `1207252615@qq.com`. Account name **Hengyu He**, team `HW5J57WXQ8`. |
| iOS dev signing team | `HW5J57WXQ8` (Personal Team). Use the team ID in `DEVELOPMENT_TEAM` (4 build configs). |
| pbxproj `objectVersion` | `77` (Xcode 16 format — required by CocoaPods 1.16.2's xcodeproj 1.27.0). **Do not change.** |
| **Screenshot capture device** | **iPhone 17 Pro Max simulator** (machine runs iOS 26, so there is NO iPhone 16 Pro Max sim; the 17 Pro Max is also 6.9″ → exactly **1320×2868**, the required size). The physical iPhone 16 is 6.1″ (1179×2556) → WRONG size, can't use it for screenshots. |
| Test iPhone (physical) | `超级无敌霸王小朋友` (iPhone 16, model `iPhone17,3`). UDID `82B5CE3B-3ABA-5057-98FB-164EC83662CC`. Use the Chinese name with `expo run:ios --device`. ⚠ `devicectl` is broken on macOS 26 ("Unexpected devicectl JSON version output") — affects PHYSICAL device connection only, not simulators. |
| Report reason values in DB | Stable i18n keys (`report_reason_spam` etc.), NOT localized labels. |
| GitHub repo | **Public** at `https://github.com/Oscar-HHY/pet-companion`. Initial commit `f597e45` on `main`. |
| License | MIT |
| Reviewer demo accounts | `bei.chen725+reviewer1@gmail.com` / `bei.chen725+reviewer2@gmail.com`, both password `<REVIEWER_PASSWORD>`. Pre-seed via SQL in `APP_STORE_REVIEWER_DEMO.md`. |
| `community_posts` reaction schema | `hugs_users text[]` + `tissues_users text[]` (arrays of user IDs; count = `.length`). |
| `pets` table PK | `user_id` (one pet per user; upsert `onConflict: 'user_id'`). No `id` column. |
| **`pets` RLS (session 9)** | SELECT is now **`USING (true)`** for authenticated (any logged-in user can view any pet profile — social surface). INSERT/UPDATE/DELETE stay owner-only (`auth.uid() = user_id`). |
| Edge Function: `generate-pixel-pet` response | `{ imageUrl }` only — `prompt` intentionally dropped (don't leak the safety prefix). |
| Vaccination reminder fire time | 9:00 AM local time on the next-due date. |
| App Store Support URL | `https://github.com/Oscar-HHY/pet-companion/issues` — **Issues must be enabled on the repo before submission** (default off). |
| Pet health data privacy label | Health & Fitness → Health. |
| Share feature | **Deferred to v1.1.** Both entry points (pet-profile + community) were unfinished and hidden in session 9 — see below. |

---

## ✅ Parts 1–7 + sessions 6–8 (DONE — see prior HANDOFF revisions)
In-code fixes, Apple compliance UI, compliance/grants/pet_activities/chat-realtime/vaccination-reminder migrations, dev client on physical iPhone, both Edge Functions, RLS sweep, realtime + chat read-state, vaccination reminders, code-check sweep, launch-copy bug fixes, Apple approval + App ID guidance + Metro stale-path fix.

## ✅ Session 9 — naming, iPhone-only, App Store Connect record, 2 rejection-risk fixes + 1 RLS bug (DONE)

| Item | What happened |
|---|---|
| Code verification | `npx tsc --noEmit` exit 0. Reviewed 6 uncommitted source/function diffs (badge dual friendship subscription, chat mark-read guard, SeedreamAPI prompt drop, notifications iOS-only denial check, delete-account storage pagination, generate-pixel-pet prompt omission) — all sound, no dangling refs. Still uncommitted. No automated tests exist; full functional test requires the device/TestFlight. |
| App name → 萌宠无忧 | `APP_STORE_LISTING.md` rewritten: zh-Hans now PRIMARY (section reordered), name 萌宠无忧, descriptions updated, keyword logic flipped (see Decisions). On-device: `ios/mobileapp/Info.plist` `CFBundleDisplayName` + `app.json` `expo.name` → 萌宠无忧. |
| English name conflict | "Pet Companion" already taken on App Store → en name is now **Pet Companion: Care & Memory**. en keywords adjusted (removed care/memory, added pixel/walks). |
| `✓` → `•` in descriptions | App Store Connect Description rejected `✓` ("invalid characters", both langs). Replaced all `✓` with `•` in `APP_STORE_LISTING.md`. Provided clean paste-ready zh + en description blocks. |
| iPhone-only | `app.json` `supportsTablet: false`; `project.pbxproj` 4× `TARGETED_DEVICE_FAMILY "1,2"→"1"`. Avoids iPad screenshots/review. Needs native rebuild. |
| App Store Connect record | Created: Bundle ID com.beichen.petcompanion, Primary Language zh-Hans, SKU petcompanion-001, Full Access. Age Rating done → **13+**. Pricing=Free + App Privacy nutrition labels done by user. Version-page text (keywords, support URL, version 1.0.0, copyright, descriptions) filled. |
| Hid "share pet profile" button | `PetProfileScreen.tsx` ~L620 — removed the `<TouchableOpacity style={styles.shareButton}>` that had **no `onPress`** (dead button = guideline 2.1 rejection). Kept logout button. |
| Hid community share | `CommunityScreen.tsx` — removed per-post share `<TouchableOpacity>` + `handleShare` (showed `Alert "分享功能即将上线，敬请期待！"` = "coming soon" placeholder, a rejection trigger) + cleaned `onShare` prop/type/call-site. `community_share*` + `pet_share` i18n keys left in place (unused, will be reused in v1.1). |
| RLS bug: friends' pets invisible | **Root cause:** `pets` SELECT policy was `USING (auth.uid()=user_id)` → friends' pet rows filtered out → `getPetProfile()` returned null → screen showed "Ta还没创建宠物档案". **Fix:** migration `supabase/migrations/20260528000000_pets_public_read.sql` (DROP old policy, CREATE SELECT `USING (true)`). **Applied to prod** via pooler psql; verified via `pg_policies` (SELECT qual = `true`, modify ops still owner-only). No app rebuild needed for this fix. |
| Metro recurring "No script URL" | `expo run:ios` kept launching the app before/without Metro → red "No script URL provided / unsanitizedScriptURLString = (null)". Confirmed 8081 empty each time. Started Metro in background: `cd mobile_app && npx expo start --dev-client --clear` (bound to 8081). User reloads sim with ⌘R. |
| Simulator media | Guided `xcrun simctl addmedia booted <file>` to inject a video into the sim Photos library (drag-drop unreliable; needs H.264/HEVC mp4/mov). |

---

## ⚠ Active bugs / things to verify, NOT YET resolved

- **`pet_activities` may also be owner-only RLS.** When viewing a friend's pet, `getPetActivities(friendId)` runs. If the friend's pet profile now shows but their activity/companion history is empty, the `pet_activities` SELECT policy likely has the same owner-only restriction as `pets` did. **Unconfirmed** — could be intended (private activity log). Verify on the sim; if it should be visible, apply the same `USING (true)` fix to `pet_activities`. |

---

## ⚠ Action items still pending on the user (cumulative)

### 🔄 IN PROGRESS (Phase E — screenshots)
- **Capture App Store screenshots** from the **iPhone 17 Pro Max simulator** (1320×2868), both zh + en, ~4–6 scenes each (pet profile/avatar, health, companion timer, memory palace, community, optional chat/AI-avatar). Stage attractive content first (login, add pet, records, posts). `⌘S` in the focused sim saves PNGs to Desktop. Optional clean status bar: `xcrun simctl status_bar booted override --time "9:41" --batteryLevel 100 --batteryState charged --wifiBars 3 --cellularBars 4`. Upload under version page → iPhone 6.9″ slot, per language. Leave iPad blank (iPhone-only now).

### 1. Native rebuild required (NOW carries name + iPhone-only changes) (carry-over, expanded)
`cd mobile_app && npx expo run:ios --device "超级无敌霸王小朋友"` (or the Pro Max sim). Needed to apply: (a) `expo-notifications` native module, (b) **萌宠无忧 display name**, (c) **iPhone-only device family**. Symptom of stale binary: `Cannot find native module 'ExpoPushTokenManager'`.

### 2. Enable Issues on GitHub repo (before submission) (carry-over)
`https://github.com/Oscar-HHY/pet-companion/settings` → Features → ☑ Issues, so the Support URL doesn't 404. (gh CLI not logged in — do it in browser.)

### 3. Update Supabase Dashboard URL configuration (carry-over)
Set to Apple EULA placeholder — replace with a real deep-linkable landing page before re-enabling email confirmation.

### 4. Rotate Supabase DB password (DEFER to after launch) (carry-over)
DB password `<DB_PASSWORD>` is in the chat transcript + `.claude/settings.local.json` permission rule. Anon key is RLS-safe; the DB password bypasses RLS via direct Postgres. Reset at the dashboard AFTER Phase I; then update the settings.local.json rule.

### 5. (resolved-ish) English Name re-save in ASC
After the "Pet Companion already in use" error, en Name must be saved as **Pet Companion: Care & Memory** (the en Subtitle save was blocked only as a cascade of the invalid Name). Confirm it saved.

---

## 🧭 App Store launch process — phase tracker

- [x] **Phase A — Unblock:** Metro stale-path (S8); Metro "No script URL" mitigated (S9, background Metro). A2 enable GitHub Issues *(pending user)*. A3 password rotation *(deferred)*.
- [x] **Phase B — Apple Developer Program approval** ✅ 2026-05-28
- [x] **Phase C — App identity:** C1 App IDs (both already existed); C2 App Store Connect record created (zh-Hans primary, text/age-rating/pricing/privacy-labels done).
- [~] **Phase D — Reviewer backend:** create 2 reviewer auth users (Auto-Confirm, copy UUIDs) + run seed SQL from `APP_STORE_REVIEWER_DEMO.md`. *(not started)*
- [~] **Phase E — Screenshots** *(IN PROGRESS — iPhone 17 Pro Max sim, 1320×2868, zh+en)*
- [ ] **Phase F — Production build:** native rebuild (applies name + iPhone-only) → `npx eas build:configure` → `eas build --platform ios --profile production`, OR Xcode archive. No `eas.json` yet.
- [ ] **Phase G — TestFlight smoke test** (sign in as reviewer1, run walkthrough)
- [ ] **Phase H — Submit:** App Review Info (demo account) + attach build + Submit for Review
- [ ] **Phase I — Apple review**

### Pre-launch checklist (content readiness)
- [x] Privacy Policy hosted + wired
- [x] App icon 1024×1024 PNG, no alpha
- [x] Listing copy (zh primary + en secondary) finalized — name 萌宠无忧 / Pet Companion: Care & Memory
- [x] Privacy Nutrition Labels filled (S9, by user)
- [x] Age rating 13+ (S9)
- [x] Pricing Free (S9, by user)
- [x] Reviewer seed SQL ready
- [x] Account deletion flow (5.1.1(v))
- [x] Content moderation (report + block + EULA gate)
- [x] RLS policies audited (+ pets SELECT opened S9)
- [x] Server-side AI key
- [x] Realtime + read-state
- [x] Vaccination reminders
- [x] Unfinished share feature hidden (S9)
- [ ] Screenshots (IN PROGRESS)
- [ ] Production build uploaded

---

## State of Supabase

- ✅ CLI installed (v2.101.0), authenticated, linked: `Pet_Companionship_0.1` (`pzozanrirwjnlrgvqlzj`, Seoul)
- ✅ Pooler works for DB ops (VPN blocks direct). psql binary: `/opt/homebrew/opt/libpq/bin/psql` (NOT on PATH). Apply via:
  `PGPASSWORD='<DB_PASSWORD>' /opt/homebrew/opt/libpq/bin/psql -h aws-1-ap-northeast-2.pooler.supabase.com -p 5432 -U postgres.pzozanrirwjnlrgvqlzj -d postgres -f <file>`
  (note: password contains `?` so it can't go in a URL — use `PGPASSWORD` env, not `--db-url`).
- 📁 `supabase/migrations/` — **7 files** (1 new this session):
  - `20260523110053_compliance_tables.sql`
  - `20260523140743_compliance_grants.sql`
  - `20260524234900_pet_activities_duration_and_delete.sql`
  - `20260525030819_pets_delete_policy_fix.sql`
  - `20260525035707_chat_realtime_and_update_policy.sql`
  - `20260525040915_vaccinations_reminder_id.sql`
  - **`20260528000000_pets_public_read.sql`** ← session 9, applied to prod via psql (not via `supabase db push`, so it may NOT be in the remote `supabase_migrations` history table — a future `db push` could see it as pending; the SQL uses `DROP POLICY IF EXISTS` so re-running the DROP is safe but the CREATE would error if re-applied).
- 📁 `supabase/functions/` — 2 deployed (`generate-pixel-pet`, `delete-account`). ⚠ Both have **uncommitted local edits** (prompt omission; storage list pagination) — deployed state may match working tree (deployed S6) but git does not.
- 📡 Realtime publication: `chat_messages`, `friendships`

---

## State of iOS dev environment

| Component | Value |
|---|---|
| Xcode | 26.5 (17F42); iOS SDK iPhoneOS26.5 |
| macOS | 26 (devicectl JSON bug → physical-device connect unreliable; simulators fine) |
| CocoaPods | 1.16.2; xcodeproj gem 1.27.0 |
| Xcode project | `ios/mobileapp.xcodeproj` (target `mobileapp`); workspace `ios/mobileapp.xcworkspace`; `objectVersion` 77 |
| DEVELOPMENT_TEAM | `HW5J57WXQ8` (4 occurrences) |
| TARGETED_DEVICE_FAMILY | **`1`** (iPhone-only, set S9; 4 configs) |
| Display name | **萌宠无忧** (`CFBundleDisplayName`, set S9; needs rebuild to show) |
| Entitlements | empty `<dict/>` |
| Simulators available | iOS 26.4/26.5: iPhone 17 / 17 Pro / **17 Pro Max** / 17e, iPad Pro/Air/mini. **Use iPhone 17 Pro Max for 6.9″ screenshots.** |
| EAS | not configured (no `eas.json`) |
| Launch cmd (physical) | `cd mobile_app && npx expo run:ios --device "超级无敌霸王小朋友"` |
| Metro (this session) | started in background: `cd mobile_app && npx expo start --dev-client --clear` |

---

## File-level reference: what changed in this session (session 9)

```
EDITED (mobile app source)
mobile_app/src/screens/PetProfileScreen.tsx      [removed no-op "分享宠物档案" share button (~L620)]
mobile_app/src/screens/CommunityScreen.tsx       [removed per-post share icon + handleShare + onShare prop/type/call-site]
mobile_app/ios/mobileapp/Info.plist              [CFBundleDisplayName: Pet Companion → 萌宠无忧]
mobile_app/app.json                              [expo.name → 萌宠无忧; supportsTablet → false]
mobile_app/ios/mobileapp.xcodeproj/project.pbxproj  [TARGETED_DEVICE_FAMILY 4× "1,2" → "1"]

EDITED (listing copy)
APP_STORE_LISTING.md   [zh-Hans now primary (reordered); names 萌宠无忧 / Pet Companion: Care & Memory; primary language zh-Hans; zh+en keyword adjustments; ✓→• in descriptions; copyright 2026 Hengyu He]

NEW
supabase/migrations/20260528000000_pets_public_read.sql   [pets SELECT policy → USING(true); APPLIED to prod via psql]

NOTE: nothing committed to git. Memory file project_app_name_and_locale.md updated during session.
NOT changed: privacy-policy page copy, GitHub repo name, expo-media-library permission strings still say "Pet Companion".
```

## File-level reference: what changed in session 8 (for context)

```
EDITED
HANDOFF.md   [session 8 status — Apple-approved, Metro stale-path fix, App ID capability decision]
RUNTIME ACTIONS (not file edits): killed stale Downloads-path expo server PIDs; cleared metro caches; freed 8081.
NO source/migration/function/git changes in session 8.
```
