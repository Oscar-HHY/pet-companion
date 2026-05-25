# Pet Companion — App Store Launch Prep Handoff

**Last updated:** 2026-05-24 (session 4)
**Status:** Dev client running on iPhone (no more Expo Go). Manual test pass turned up 5 bug categories — all fixed in code, ReportModal payload migrated, Companion Dock now records history with duration + delete. Part 4.2 (Edge Function `generate-pixel-pet`) and 4.3 (`delete-account`) still pending.

---

## How to resume next session

In a new Claude Code session, `cd /Users/poutine./Downloads/Pet_Companionship` then say:

> "Read `HANDOFF.md` and continue from where we left off."

The Supabase CLI is already installed, authenticated, and linked to project `pzozanrirwjnlrgvqlzj` (Seoul). Claude can run migrations + deploy Edge Functions via the pooler URL.

**There is a `conclusion` skill registered at `.claude/skills/conclusion/SKILL.md`** — when the user says "conclusion", "总结", or asks to wrap up the session, this file should be regenerated to reflect the latest state.

---

## Decisions already locked in

| Topic | Choice |
|---|---|
| Bundle ID | `com.beichen.petcompanion` (iOS + Android) |
| Display name | `Pet Companion` |
| Internal slug | `petcompanion` |
| Dark mode | Follows system; users can override in Settings |
| `user_profiles` schema | Has `email` + `contact_info` columns (Settings UI keeps writing them) |
| Workflow | Batch fixes, pause for user review between Parts |
| Privacy Policy URL | Placeholder `https://example.com/pet-companion/privacy` — **must replace before submission** |
| EULA URL | Apple standard `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/` |
| Email confirm redirect | Currently Apple's EULA page (placeholder). PKCE flow doesn't work end-to-end with a static landing page — email confirmation disabled in Supabase Dashboard for dev; needs proper deep-linking for production |
| MARKETING_VERSION | `1.0.0` for both main app + Live Activity extension (must match for App Store) |
| iOS dev signing team | `HW5J57WXQ8` (Personal Team for Apple ID `1207252615@qq.com`). The cert's CN says `(6C392CL7VQ)` but the OU is `HW5J57WXQ8` — Xcode's account list also says `HW5J57WXQ8`. Use this team ID in `DEVELOPMENT_TEAM` (set in 4 build configs in `project.pbxproj`). |
| pbxproj `objectVersion` | `77` (Xcode 16 format). Was `70` originally — CocoaPods 1.16.2's bundled `xcodeproj` 1.27.0 only recognizes 63 and 77, not 70, so pod install fails. **Do not change back.** |
| Test iPhone | `超级无敌霸王小朋友` (iPhone 16, model `iPhone17,3`). New UDID `82B5CE3B-3ABA-5057-98FB-164EC83662CC`; legacy UDID `00008140-000C6D421141801C`. Use the name (Chinese) with `expo run:ios --device` — UDID lookup is broken on Expo SDK 54 against macOS 26's devicectl. |
| Report reason values in DB | **Stable i18n keys** (e.g., `report_reason_spam`), NOT localized labels. `ReportModal` was previously storing `t(reasonKey)` — fixed in session 4. Migration ran to convert the 5 existing pre-fix rows. |

---

## ✅ Part 1 — Safe in-code fixes (DONE — session 1)
See session-1 entries in `MIGRATION_GUIDE.md` / earlier handoffs. Summary in older HANDOFF revisions.

## ✅ Part 2 — Decisions-locked fixes (DONE — session 1)
Dark mode, bundle ID rename, schema updates for `email`/`contact_info`.

## ✅ Part 3 — Apple compliance UI (DONE — session 2)
Report button, Block, Delete Account modal, Privacy/EULA rows, EULA gate.

## ✅ Part 4.1 — Compliance tables migration (DONE — session 2)
File: `supabase/migrations/20260523110053_compliance_tables.sql` — `content_reports`, `blocked_users` tables + RLS.

## ✅ Part 4.1-grants — RLS grants migration (DONE — session 3)
File: `supabase/migrations/20260523140743_compliance_grants.sql` — INSERT/SELECT/CRUD grants on the compliance tables.

## ✅ Part 4.5 — pet_activities migration (DONE — session 4)

File: `supabase/migrations/20260524234900_pet_activities_duration_and_delete.sql`
- Added `pet_activities.duration_seconds INT` column (NULL for pre-migration rows)
- **Fixed an RLS bug**: the policy named `"Enable delete for authenticated users only"` was misconfigured as `FOR INSERT WITH CHECK` (copy-paste error), so DELETEs were silently rejected. Dropped it and added a proper `FOR DELETE USING (auth.uid()::text = user_id)` policy.
- Granted `DELETE ON pet_activities TO authenticated` (RLS isn't a substitute for table privileges — same pattern as Part 4.1-grants).
- Applied via `supabase db push --db-url <pooler>`. Verified `duration_seconds` exists.

## ✅ Part 5 — Dev client setup on physical iPhone (DONE — session 4)

Replaces Expo Go. Multiple gotchas resolved (see "Session 4 bugfixes" below for details):

1. **`pbxproj objectVersion 70 → 77`** — CocoaPods couldn't parse 70.
2. **macOS 26 DDI prep** — user opened Xcode → Window → Devices and Simulators → waited for "Preparing iPhone for development" to finish.
3. **Apple ID added to Xcode** → Manage Certificates → `+` → Apple Development. Created a cert.
4. **AppleWWDRCAG3 intermediate** — re-added to login keychain via `security add-certificates`; this forced trust evaluation refresh. Without it, the cert showed `CSSMERR_TP_NOT_TRUSTED` and `find-identity -p codesigning` returned 0 valid identities.
5. **Correct team ID discovered** — `defaults read com.apple.dt.Xcode` revealed `IDEProvisioningTeamByIdentifier.teamID = HW5J57WXQ8`, not the `6C392CL7VQ` shown in the cert CN. Set `DEVELOPMENT_TEAM = HW5J57WXQ8` in all 4 build configs of `project.pbxproj` (main Debug, main Release, ext Debug, ext Release).
6. **`xcodebuild -allowProvisioningUpdates`** ran once to register the bundle IDs with Apple and download profiles into `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`. After this, `expo run:ios` succeeds without that flag.
7. **Trust profile on iPhone** — user did Settings → General → VPN & Device Management → Trust.
8. **Manual launch via icon shows "No script URL provided"** if the app is launched without Metro. Solution: always launch via `npx expo run:ios --device "超级无敌霸王小朋友"` so Metro URL is embedded in the launch args.

Persisted artifacts:
- `~/Library/Developer/Xcode/UserData/Provisioning Profiles/40f4bfa7-...mobileprovision` (main app)
- `~/Library/Developer/Xcode/UserData/Provisioning Profiles/8d9e253b-...mobileprovision` (Live Activity extension)
- Cached DerivedData at `~/Library/Developer/Xcode/DerivedData/mobileapp-aabxyowlhubgradnekkfsrnltukw/`

## ✅ Session 4 bugfixes from manual test pass

| Bug | Root cause | Fix |
|---|---|---|
| Community post composer + comment input: typed text invisible in dark mode | `styles.modalInput` and `styles.commentInput` had hardcoded `backgroundColor: colors.softCream` (light cream); `themeTextColor` made text white in dark mode → white on cream is invisible | `CommunityScreen.tsx`: inline `backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.softCream` plus matching border on both inputs |
| AboutScreen `宠物伴侣` title invisible in dark mode | Whole screen used `colors.slate900` for text and `colors.white` for cards — none of it was theme-aware | `AboutScreen.tsx`: header title, app name, legal rows, slogan card, back button all now use `themeTextColor` / `themeCardBg` / `themeSecondaryText` |
| Language toggle didn't translate `灵动陪伴舱` and its action labels | Hardcoded Chinese strings in `PetProfileScreen` (line ~452, 470, 473, 243), `WidgetAssetGeneratorScreen` (title, subtitle, slot labels, tips, alerts), pet status badges in `PetAvatar.tsx` (config.label) | Added i18n keys `companion_*`, `widget_manager_*`, `status_*`; switched all UI strings to `t(...)`. `PetAvatar.tsx` now calls `useT()` directly so badges render in current language. |
| Settings screen: theme color labels (`奶白`/`奶茶`/...) and font-size labels (`小`/`标准`/...) ignored language toggle | Hardcoded `opt.label` in `THEME_OPTIONS` and `FONT_SIZE_OPTIONS` | Switched to `labelKey` pattern + `t(opt.labelKey)`; added `theme_label_*` and `font_size_*` keys |
| Settings header `Settings` text invisible in dark mode | `color: colors.slate900` on dark background | Header uses `themeTextColor`, back button uses `themeCardBg` |
| Settings: when color chips wrap to 2 rows, labels stayed in 1 row (misaligned + cut off) | `optionRow` had `flexWrap: 'wrap'` but `labelRow` was a separate sibling with no wrap. Chip and its label couldn't move together | Restructured: each chip + label paired in one `<View style={styles.optionItem}>{chip}{label}</View>`. The parent `optionGrid` wraps the pair atomically. |
| BadgeContext didn't track pending incoming friend requests → user B saw no badge on `我的` tab and no auto-refresh of `新朋友` count when A sent a request | `BadgeContext.refreshBadge` summed only visitor + comment counts; friend requests only loaded on `UserProfileScreen` mount | Added `getPendingFriendRequestCount(userId)` service; `BadgeContext` now also tracks `pendingFriendCount` and includes it in `unreadCount`. `UserProfileScreen` uses `useFocusEffect` to refetch on focus and a `useEffect` on `pendingFriendCount` for real-time poll-driven refresh |
| ReportModal stored localized Chinese label (e.g., `"垃圾内容"`) in `content_reports.reason` instead of the i18n key | `submitContentReport(..., t(reasonKey), ...)` was passing the translated string | Changed to `submitContentReport(..., reasonKey, ...)`. Migrated 5 existing rows via SQL: `CASE reason WHEN '垃圾内容' THEN 'report_reason_spam' ... END`. |
| New "My Reports" list — UI existed only in design until session 4 | — | Built it: `getMyReports(reporterId)` service + new row in `UserProfileScreen` self mode (`flag` icon) + modal showing each report's type / reason / status / timestamp / details. `MyReportItem.id` typed as `number` (bigint in DB). |
| Companion Dock had no history — tapping 散步/洗澡/陪玩 only updated UI + native Live Activity; nothing persisted | Stop handler dropped elapsed seconds | `handleStopCompanion` now captures `finishedType` and `finishedDuration` before clearing local state, then calls `addPetActivity(uid, finishedType, finishedDuration)`. Timeline rows in `pet_recent_log` now show `walk · 03:42`-style duration + a delete button (own pet only). |

## ✅ Session 4 Supabase work (admin tooling)

**View created:** `content_reports_with_content` — joins each `content_reports` row to its source content.

```sql
-- Use it in SQL Editor or browse in Table Editor → Views
SELECT id, status, content_type, reason, reporter_name, content_id, reported_content
FROM content_reports_with_content
WHERE status = 'pending'
ORDER BY created_at DESC;
```

The view safely casts `content_id` (text) to bigint or uuid depending on `content_type`, falling back to `(invalid id format)` on cast failure. Definition is preserved server-side; next session can `\d+ content_reports_with_content` via SQL Editor to see the body.

**Data migrations applied this session:**
1. `UPDATE content_reports SET reason = ...` — converted 5 rows from Chinese labels to stable i18n keys
2. `UPDATE content_reports SET status = 'dismissed' WHERE status = 'pending'` — cleared 5 dogfooding reports

**How the user triages reports going forward** (documented in-session):
- Table Editor → Views → `content_reports_with_content` → double-click `status` cell to change
- OR SQL Editor: `UPDATE content_reports SET status = 'reviewed' WHERE id = <numeric_id>;`
- Status updates propagate to the user's "My Reports" modal next time they open it.

## ✅ Session 4 theme palette update

`SettingsScreen.tsx` `THEME_OPTIONS`:

| Slot | Was | Now | Hex |
|---|---|---|---|
| 4 | `theme_label_mint` (#ecfdf5) | `theme_label_cream_yellow` (奶黄 / Cream Yellow) | `#fef9c3` |
| 5 | `theme_label_sky_blue` (#eff6ff) | `theme_label_baby_pink` (稚嫩粉 / Baby Pink) | `#fce7f3` |
| 6 | `theme_label_lavender` (#f5f3ff, barely visible) | `theme_label_lavender` (more saturated) | `#ddd6fe` |

Users who previously saved one of the deprecated hex values (`#ecfdf5`, `#eff6ff`, `#f5f3ff`) won't crash but won't see a selected chip — they'll need to re-pick a theme. Acceptable since app hasn't shipped.

---

## ⚠ Active bugs discovered, NOT YET fixed

| Bug | Diagnosis | Next step |
|---|---|---|
| iPhone tab badge update for incoming friend requests has up to 60s latency | `BadgeContext` polls every 60s while foregrounded. Real-time would need Supabase Realtime subscription on `friendships` table. | Acceptable for v1; if user wants real-time, subscribe to `postgres_changes` on `friendships` in `BadgeContext.useEffect`. |

(No other open bugs from session 4 testing.)

---

## ⚠ Action items still pending on the user (cumulative)

### ✅ RESOLVED THIS SESSION
- ~~Disable email confirmation in Supabase Dashboard~~ — done by user
- ~~Install custom dev build on iPhone~~ — done (see Part 5 above)
- ~~Clean rebuild for bundle ID change~~ — implicitly done by `expo run:ios`

### 1. Manual re-test pass on the dev client (NEW — session 4 bugs are landed but not user-verified)

Reload the JS bundle (shake → Reload) and verify:
- **Dark mode** — community post composer, comment input, About screen, Settings screen → all text/cards visible
- **Language toggle** — flip to English, walk through Settings + PetProfile + Widget Manager → no leftover Chinese except brand name in Chinese mode
- **Friend request badge** — log in as account A → send friend request to B → switch to B account → wait <60s → "我的" tab badge should bump and 新朋友 row should show the request without manual navigation. Also try B navigating directly to "我的" tab → should refetch on focus (instant).
- **Companion Dock history** — start 散步 → wait some seconds → stop → row should appear in 最近记录 with `walk · MM:SS`. Tap trash icon → confirm → row disappears.
- **My Reports** — submit a fresh report on a community post → open "My Reports" in self profile → entry should appear with translated reason. Then in Supabase SQL Editor: `UPDATE content_reports SET status='reviewed' WHERE id = <newest>;` → reopen My Reports → status label should update.
- **Theme colors** — Settings → tap 奶黄 / 稚嫩粉 / 薰衣草 → background should change and labels stay aligned with chips.

### 2. Update Supabase Dashboard URL configuration (carry-over)

Already configured during session 3 to Apple EULA. Must be replaced with a real landing page before App Store submission.

### 3. Rotate the Supabase CLI access token (security, carry-over)

A prior CLI access token was leaked into chat during session 3 and has since been revoked + replaced. If anything legacy still references it, regenerate at https://supabase.com/dashboard/account/tokens → `! supabase login --token <new-token>` (do not paste tokens to Claude).

### 4. Register App IDs in Apple Developer Portal (when ready, carry-over)

- Main app: `com.beichen.petcompanion`
- Live Activity extension: `com.beichen.petcompanion.CompanionLiveActivityExtension`

Currently using free Personal Team `HW5J57WXQ8` → 7-day expiry on dev builds. Paid Developer Program ($99/yr) needed for App Store submission.

### 5. Replace placeholder Privacy Policy URL before submission (carry-over)

In `src/screens/AboutScreen.tsx` constant `PRIVACY_POLICY_URL`. Apple rejects apps with broken/placeholder privacy URLs.

### 6. Re-test Part 3 UI in the dev build (carry-over — partially done)

User has been testing throughout session 4. Remaining items:
- Self profile → 删除账号 → DELETE confirm modal (will error until Part 4.3 deploys the function)
- Live Activity: PetProfile → tap 散步/洗澡/陪玩 → Dynamic Island + lock-screen banner appear (now that Companion Dock records history too)

---

## 🔜 Part 4.2 — Edge Function: `generate-pixel-pet` (pending — likely next session focus)

- Replaces direct Seedream call in `src/services/SeedreamAPI.ts`
- Holds `SEEDREAM_API_KEY` server-side (`supabase secrets set SEEDREAM_API_KEY=…`)
- Validates Supabase JWT; rate-limits per user
- Client calls via `supabase.functions.invoke('generate-pixel-pet', { body: { imageUri } })`
- Remove `EXPO_PUBLIC_SEEDREAM_API_KEY` from `.env`

## 🔜 Part 4.3 — Edge Function: `delete-account` (pending — blocks Part 3.3 from working)

- Uses service_role key (server-only)
- Deletes from `auth.users` (cascades to all `user_id`-keyed tables via FK)
- Also wipes storage objects under `<userId>/` in buckets `pets`, `avatars`, `memory_media`
- Client already calls via `supabase.functions.invoke('delete-account')` (wired in Part 3.3)

## 🔜 Part 4.4 — RLS verification sweep (pending — DELETE policies are the risk)

Per session-4 discovery on `pet_activities`, RLS policies in the DB can be misconfigured (e.g., a "delete" policy actually being `FOR INSERT`). Sweep these tables for similar bugs:

```sql
-- Find policies whose name suggests one action but cmd says another
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname='public'
ORDER BY tablename, policyname;

-- Confirm DELETE is allowed where it should be
-- Tables to audit: pets, health_questionnaires, medical_records, vaccinations,
-- weight_records, memory_diaries, memory_videos, chat_messages, post_comments,
-- community_posts
```

If any "delete" policy is actually `INSERT`/`UPDATE`, drop and recreate (template in `20260524234900_pet_activities_duration_and_delete.sql`).

---

## 🧭 Remaining App Store launch checklist (after Part 4)

- [ ] Create Apple Developer account ($99/yr) — register both App IDs
- [ ] Privacy Policy URL hosted publicly + wired into `PRIVACY_POLICY_URL`
- [ ] Proper email confirmation flow (re-enable + deep link OR landing page)
- [ ] App Store Connect listing: screenshots (6.7", 6.5"), description, keywords, support URL, marketing URL, age rating, demo account credentials for reviewer, app review notes
- [ ] App icon 1024×1024 PNG with no alpha
- [ ] EAS build setup: `npm i -g eas-cli` → `eas login` → `eas build:configure` → `eas build --platform ios --profile production`
- [ ] First TestFlight build → invite testers
- [ ] Submit via `eas submit --platform ios`

---

## State of Supabase CLI integration

- ✅ Installed (`brew install supabase/tap/supabase` — v2.101.0)
- ✅ Authenticated (token stored in `~/.supabase/access-token`)
- ✅ Project linked: `Pet_Companionship_0.1` (`pzozanrirwjnlrgvqlzj`, Seoul)
- ✅ Pooler URL works for DB ops (direct connection blocked by VPN)
- 📁 `supabase/migrations/` has 3 applied files:
  - `20260523110053_compliance_tables.sql`
  - `20260523140743_compliance_grants.sql`
  - `20260524234900_pet_activities_duration_and_delete.sql`
- 📊 Views in DB: `content_reports_with_content` (created session 4 — admin moderation tool)

**Pooler URL for `--db-url` flag** (password redacted — read from your own Supabase Dashboard → Settings → Database):
`postgresql://postgres.pzozanrirwjnlrgvqlzj:<DB_PASSWORD>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres`

---

## State of iOS dev environment

| Component | Value |
|---|---|
| Xcode | 26.5 (17F42) |
| iOS SDK | iPhoneOS26.5.sdk |
| CocoaPods | 1.16.2 (brew bottle, ruby 4.0.2) |
| xcodeproj gem | 1.27.0 (bundled with brew CocoaPods) |
| `objectVersion` in pbxproj | 77 (Xcode 16 format — required for pod install) |
| DEVELOPMENT_TEAM | `HW5J57WXQ8` (4 occurrences in pbxproj) |
| Signing certificate | `Apple Development: 1207252615@qq.com (6C392CL7VQ)` SHA-1 `0FD5A97DA68486167F34C96B53739BB1D008AE7E` — bound to team `HW5J57WXQ8` despite CN showing `6C392CL7VQ` |
| Intermediate CA | `AppleWWDRCAG3` (in login keychain; trust evaluated) |
| Provisioning profiles | `40f4bfa7-…` (main app), `8d9e253b-…` (extension) — in `~/Library/Developer/Xcode/UserData/Provisioning Profiles/` |
| Test device | `超级无敌霸王小朋友` (iPhone 16 / iPhone17,3, modern UDID `82B5CE3B-3ABA-5057-98FB-164EC83662CC`, legacy `00008140-000C6D421141801C`). Connect via USB; pass to expo as `--device "超级无敌霸王小朋友"` (Chinese name), NOT the UDID. |
| Launch command | `cd mobile_app && npx expo run:ios --device "超级无敌霸王小朋友"` |

---

## Xcode warning classification (for future reference)

When the user pastes a long list of Xcode "issues", most are upstream library noise. Quick triage:

- **Actionable:** anything in `mobile_app/src/` or in the project's own Swift files (`CompanionActivityModule.swift`, files under `CompanionLiveActivityExtension/`); "duplicate build file" warnings; CFBundleShortVersionString mismatches; "Update to recommended settings" suggestion; missing/unsigned entitlements
- **Ignore (upstream library noise):** anything under `node_modules/expo-*`, `node_modules/react-native-*`, `ios/Pods/Headers/Public/`, `hermes-engine`; nullability specifier missing; "deprecated in iOS X.Y"; "has no symbols"; "implicit conversion loses precision"; the static analyzer "Class X does not conform to protocol Y" / "Method definition not found" false positives on Expo modules

The library noise gets fixed by Expo/Meta upstream over time. Apple does not reject for warnings.

---

## File-level reference: what changed in this session (session 4)

```
supabase/migrations/20260524234900_pet_activities_duration_and_delete.sql   [new — duration column + DELETE policy fix + grant]
mobile_app/ios/mobileapp.xcodeproj/project.pbxproj                          [edited — objectVersion 70→77; DEVELOPMENT_TEAM=HW5J57WXQ8 in 4 build configs]
mobile_app/src/services/PetDatabaseService.ts                               [edited — added getPendingFriendRequestCount, getMyReports, deletePetActivity; PetActivity.duration_seconds; MyReportItem]
mobile_app/src/services/liveActivity.ts                                     [unchanged this session — already had getModuleStatus from session 3]
mobile_app/src/components/ReportModal.tsx                                   [edited — submit reasonKey not t(reasonKey) so DB stores stable i18n key]
mobile_app/src/components/PetAvatar.tsx                                     [edited — useT() to translate status badges (status_idle / status_eating / ...)]
mobile_app/src/context/BadgeContext.tsx                                     [edited — added pendingFriendCount tracking, included in unreadCount sum]
mobile_app/src/screens/CommunityScreen.tsx                                  [edited — dark-mode backgrounds for modalInput + commentInput; isDark-conditional]
mobile_app/src/screens/AboutScreen.tsx                                      [edited — full theming via themeTextColor / themeCardBg / themeSecondaryText]
mobile_app/src/screens/SettingsScreen.tsx                                   [rewrite — i18n labels via labelKey, theme-aware header/cards, grouped chip+label, theme colors updated]
mobile_app/src/screens/PetProfileScreen.tsx                                 [edited — companion dock i18n; handleStopCompanion records duration; handleDeleteActivity + trash button; status_${item} via t(); timelineDeleteBtn style]
mobile_app/src/screens/WidgetAssetGeneratorScreen.tsx                       [edited — full i18n sweep: title, subtitle, alerts, slot labels, tips, preview label]
mobile_app/src/screens/UserProfileScreen.tsx                                [edited — useFocusEffect refetch on focus + pendingFriendCount-triggered refetch; My Reports row + modal; openMyReports lazy fetch; keyExtractor String(item.id)]
mobile_app/src/i18n/index.ts                                                [edited — added companion_*, widget_manager_*, status_*, theme_label_*, font_size_*, settings_preview_text, user_my_reports, report_type_*, report_status_*, pet_delete_activity_*, etc.]
HANDOFF.md                                                                  [this file]
```

**Supabase changes (server-side, no local file diff):**
```
content_reports.reason          [DATA — 5 rows migrated from Chinese label to stable i18n key]
content_reports.status          [DATA — 5 test rows marked dismissed]
content_reports_with_content    [NEW VIEW — joins each report to its source content]
pet_activities                  [SCHEMA — duration_seconds added; DELETE policy fixed]
```

## File-level reference: what changed in session 3 (for context)

```
supabase/migrations/20260523140743_compliance_grants.sql                   [new — grants migration]
mobile_app/src/screens/CommunityScreen.tsx                                 [edited — fix comment→report modal stacking]
mobile_app/ios/mobileapp.xcodeproj/project.pbxproj                         [edited — MARKETING_VERSION 1.0→1.0.0; removed 4 boilerplate file refs; simplified sync-group exceptions; dedup'd duplicate Sources entries]
mobile_app/ios/CompanionLiveActivityExtension/CompanionLiveActivityExtension*.swift  [4 files DELETED — boilerplate]
mobile_app/src/services/liveActivity.ts                                    [edited — getModuleStatus returns specific failure reason]
mobile_app/src/services/supabaseClient.ts                                  [edited — added EMAIL_CONFIRM_REDIRECT_URL export]
mobile_app/src/screens/RegisterScreen.tsx                                  [edited — passes options.emailRedirectTo to signUp]
.claude/skills/conclusion/SKILL.md                                          [new — auto-update-handoff skill]
```
