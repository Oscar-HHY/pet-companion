# Pet Companion (萌宠无忧) — Handoff

**Last updated:** 2026-10-13 (sessions 13–14)
**Status:** v1.0.0 (build 3) is **LIVE on the App Store** since 2026-06-02 (non-mainland regions). **v1.1.0 (build 4) is code-complete, reviewed, committed locally — BLOCKED on Apple Developer identity verification** (can't accept the new Program License Agreement → Xcode can't sign → can't archive/upload). Backend for v1.1 (DB migrations + 3 edge functions) is **already live in production** and is backward-compatible with the v1.0.0 app.

**Next step:** user resolves Apple ID verification (see Blocker below) → tell Claude → Claude archives build 4 → TestFlight on device → App Store Connect submission (step list under "Release checklist").

---

## How to resume next session

In Claude Code: `cd ~/Desktop/Pet_Companionship` (this Mac: `/Users/chaojiwudibawangxiaopengyou/Desktop/Pet_Companionship`), then:

> "Read `HANDOFF.md` and continue from where we left off."

- **Supabase**: use the Supabase MCP tools (`apply_migration`, `execute_sql`, `get_advisors`, `deploy_edge_function`, `get_logs`). **The supabase CLI is NOT installed on this Mac.** Edge functions are deployed via MCP `deploy_edge_function` with files `<fn>/index.ts` + `_shared/{ai,auth,usage}.ts`, `verify_jwt: true`.
- **Deno type-check** (no global deno): `~/.npm/_npx/7eac5a3a53225c60/node_modules/@deno/darwin-arm64/deno check supabase/functions/<fn>/index.ts`
- **Workflow (user preference)**: Claude writes specs/migrations and reviews; **Codex implements code** via `codex exec -s workspace-write -C ~/Desktop/Pet_Companionship -o <result.md> - < <task.md>` (codex at `~/.npm-global/bin/codex`).
- **Simulator**: iPhone 17 (`E40E03D2-D13A-489F-945D-F9586AD1FA18`); Metro: `cd mobile_app && npx expo start --clear --port 8081`.
- **Credentials not in git**: reviewer password is in `HANDOFF.secrets.local.md` (gitignored, local only).

---

## ⛔ Blocker: Apple Developer identity verification (2026-10-12)

- Archive fails with *"PLA Update available … agree to the latest Program License Agreement"*. Agreeing (Apple Developer app) shows **"Developer requires ID Verification"**.
- developer.apple.com/account banner: *请验证你的身份并查阅最新版许可协议 … 通过 Apple Developer App 验证身份*. Apple's doc: Developer app → 账户 → 使用开发者 Apple 账户登录 → **验证身份** (姓名/身份证号/电话 + 自拍, run by CFCA for mainland China). Requires the same device throughout, 2FA, iCloud signed in, latest app.
- **User checked iPhone + Mac Developer app: no 验证身份 entry.** → Must go through **Apple Developer Support**: developer.apple.com/contact → 会员资格与帐号 → 其他会员资格或帐号问题. Phone callback (only during business hours) is fastest; email form was filled with a bilingual description (Team ID HW5J57WXQ8, Apple ID `1207252615@qq.com`) but **not confirmed sent**.
- Live v1.0.0 is unaffected. Nothing else can proceed on the release until this is resolved.
- Also done this session: **Xcode had no Apple account signed in** (archive error "No Accounts") — user signed in via Xcode → Settings → Accounts. Should persist now.

---

## v1.1.0 — what shipped in code (sessions 13–14, 2026-10-10 → 10-13)

### Features
1. **AI 宠物助手 (Pet Assistant)** — `PetAssistantScreen.tsx` + `PetAssistantService.ts`, entry from drawer. ChatGPT-style:
   - Opens on a new empty chat; left slide-in panel (80% width) lists conversations (newest first), delete with confirm; header "new chat" button.
   - Per-user consent screen before first use (AsyncStorage `ai_assistant_consent_${userId}`).
   - Edge function **`pet-assistant-chat`** (v6): request `{message, tz?, conversation_id?}` → `{reply, remaining, conversation_id, title}`. Loads ALL the caller's records with their JWT (RLS): pet, health questionnaires, medical records incl. OCR text, vaccinations, weights, 90-day activities, Memory Palace diaries (30k-char budget) + video/voice titles. History = last 10 messages of that conversation. Conversation created only after a successful answer; title = first 30 chars of the first question. Limit **30 answers / rolling 24h**.
2. **病历拍照识别 (Medical report OCR)** — HealthScreen medical-record modal: upload up to 6 photos → edge function **`extract-medical-report`** (v7) → pre-fills clinic/date/diagnosis/treatment/meds/notes (never overwrites typed input) and stores full `report_ocr_text` on the record (that's what the assistant reads). **Explicit per-user consent Alert before first OCR** (AsyncStorage `ai_ocr_consent_${userId}`) — App Store 5.1.2(i). Limit **20 / 24h**. Photos in private bucket `medical_reports/${userId}/…`; removed photos / cancelled uploads / deleted records clean up their files.
3. Medical records gained `visit_date`; vaccinations gained `vaccine_name` (both in UI).
4. **delete-account** (v8) also wipes `ai_chat_messages`, `ai_conversations`, `ai_usage_events`, and the `medical_reports` bucket.

### AI provider (all via secrets, switchable without an app release)
- **Volcengine Ark Beijing** — `AI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3`, `AI_CHAT_MODEL` = `AI_VISION_MODEL` = `doubao-seed-2-1-lite-260915`, **one shared `AI_API_KEY`** (falls back to `SEEDREAM_API_KEY`). No separate key needed for OCR vs chat.
- `_shared/ai.ts` → `chatCompletionStream()` (only client): SSE streaming, `thinking: {type:'disabled'}` (sent only to volces.com hosts), 120 s timeout, logs one line per call: `[ai:<chat|ocr>] outcome=… headers_ms=… first_content_ms=… total_ms=… usage=…` — **read this in edge-function logs first when AI fails.**
- **Latency lessons (Seoul → Beijing):** (a) never send images as base64 — a 2.7 MB PNG body got no response in 120 s; images now go as **10-min signed URLs** that Ark downloads (OCR ≈ 19 s). (b) Doubao Seed has **deep thinking ON by default** → chat timed out at 60 s once records grew; disabled → answers in seconds.

### DB migrations (all applied to prod via MCP, files in `supabase/migrations/`)
| File | What |
|---|---|
| `20261010000000_pet_assistant.sql` | `ai_chat_messages`, `ai_usage_events` (RLS on, no policies = service-role only), `medical_reports` bucket + owner-folder policies, `medical_records.visit_date/report_image_paths/report_ocr_text`, `vaccinations.vaccine_name` |
| `20261011000000_ai_tables_service_role_grants.sql` | grants for service_role on AI tables |
| `20261011010000_ai_conversations.sql` | `ai_conversations` (owner RLS); `ai_chat_messages.conversation_id` NOT NULL FK ON DELETE CASCADE; insert policy requires owning the conversation |
| `20261013000000_lock_down_report_view_and_drop_dead_fn.sql` | **Security fix**: `content_reports_with_content` (SECURITY DEFINER moderation view exposing reporter names + reported private chat text) was SELECT-able by every signed-in user → revoked from anon/authenticated (dashboard/postgres still works). Dropped unused + broken `mark_messages_as_read` (ambiguous `sender_id = sender_id`). |

### Review pass (session 14) — results
- `tsc --noEmit` ✅, `deno check` on all 3 changed functions ✅ (fixed a pre-existing type error in `delete-account` `listAllUnder` param), no `console.log` in app src.
- Fixed: OCR had no explicit consent (compliance); unused non-streaming `chatCompletion` removed; malformed SSE chunk no longer turns into a 500.
- Tried adding `expo-image-manipulator` (downscale report photos to 2048 px) — **reverted** because **CocoaPods is not installed on this Mac** (and system Ruby 2.6 is too old for CocoaPods 1.16 deps). Picker `quality: 0.7` JPEG keeps typical photos ~2–5 MB, under the 8 MB OCR limit. Adding any new native module later needs CocoaPods (→ Homebrew + newer Ruby first).
- Deployed functions verified identical to local files.

---

## Release checklist for v1.1.0 (after the blocker clears)

1. ✅ Version bumped: `MARKETING_VERSION 1.1.0` / build **4** (pbxproj ×4 + hardcoded `Info.plist CFBundleVersion` + `app.json version`).
2. ✅ `PRIVACY.md` updated (per-conversation delete, effective 2026-10-12). ⚠ The **live policy URL is a different repo** — `https://oscar-hhy.github.io/pet-companion-privacy/` → copy the updated text there too (pushing this repo alone does NOT update it).
3. ✅ Committed locally on `main` (not pushed). **Push to `origin` (public GitHub) only after the user OKs it.**
4. Archive (command below) → Organizer → Distribute → App Store Connect → Upload.
5. TestFlight on the user's iPhone: AI assistant (new/switch/delete chat; ask about 萌爪动物医院 record), real camera-photo OCR (incl. consent alert), quick regression (login, post, pet profile).
6. App Store Connect: create version **1.1.0**, select build 4, "What's New" (新增 AI 宠物助手、病历拍照识别), update **App Privacy** (confirm Photos / Health / Other User Content cover report photos + AI chat; data is sent to Volcengine Ark for processing), App Review notes: where the AI features are + that consent is asked first; reviewer1 account has seed data.
7. Submit → after approval **user clicks Release** (manual release).

### Production archive command
```
cd mobile_app/ios
rm -rf build/mobileapp.xcarchive
xcodebuild -workspace mobileapp.xcworkspace -scheme mobileapp -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$PWD/build/mobileapp.xcarchive" \
  -allowProvisioningUpdates archive
open build/mobileapp.xcarchive   # Organizer → Distribute App → App Store Connect → Upload
```
"Upload Symbols Failed" warnings for React/Hermes/ReactNativeDependencies are benign.

### ⚠ Build-number gotcha
Main app `ios/mobileapp/Info.plist` **hardcodes `CFBundleVersion`**; the Live Activity extension uses `$(CURRENT_PROJECT_VERSION)`. Bump BOTH:
1. `sed -i '' 's/CURRENT_PROJECT_VERSION = N;/CURRENT_PROJECT_VERSION = N+1;/g' ios/mobileapp.xcodeproj/project.pbxproj`
2. `/usr/libexec/PlistBuddy -c "Set :CFBundleVersion N+1" ios/mobileapp/Info.plist`

### ⚠ Xcode signing gotchas
- "Personal Team is not enrolled" → Xcode cached pre-enrollment state: ⌘Q Xcode and reopen.
- "No Accounts" → sign in at Xcode → Settings → Accounts.
- "PLA Update available" → accept the new agreement at developer.apple.com (currently blocked by ID verification, see above).

---

## Decisions already locked in

| Topic | Choice |
|---|---|
| Bundle ID | `com.beichen.petcompanion` (+ `.CompanionLiveActivityExtension`) |
| App Store name | zh-Hans (primary) **萌宠无忧** · en-US **Pet Companion: Care & Memory** |
| Device support | iPhone-only |
| Xcode | `ios/mobileapp.xcworkspace`, scheme `mobileapp`, Automatic signing, `DEVELOPMENT_TEAM=HW5J57WXQ8` |
| Apple Developer Program | Individual, Team `HW5J57WXQ8`, Apple ID `1207252615@qq.com`, renews 2027-05-29 |
| Release mode | **Manual release** |
| Age rating / price | 13+ / Free |
| Privacy Policy URL | `https://oscar-hhy.github.io/pet-companion-privacy/` (separate repo) |
| Support | in-app `somethingimportant002@gmail.com`; App Store Support URL = GitHub Issues of `Oscar-HHY/pet-companion` |
| Reviewer accounts | `bei.chen725+reviewer1@gmail.com`, `+reviewer2@gmail.com` (password in `HANDOFF.secrets.local.md`; `<REVIEWER_PASSWORD>` placeholder in committed docs). UUIDs `0ed1480c-428f-42c6-bc37-e2230fa567ea` / `5b9af0f9-4873-4c03-abc1-94945d5ba7ff` |
| Supabase | project `pzozanrirwjnlrgvqlzj`, AWS Seoul, Postgres 17, **Free plan** |
| RLS | `pets`/`pet_activities` SELECT public to authenticated, writes owner-only; health/medical/vaccine/weight/memory/AI tables owner-only; `ai_usage_events` service-role only |
| `pets` | one pet per user (`UNIQUE(user_id)`, upsert on `user_id`) |
| Storage | `pets`, `avatars` public; `memory_media`, `medical_reports` private (signed URLs); paths `${userId}/…`, owner-folder-scoped writes |
| AI | Volcengine Ark (see above); data leaves Seoul to Beijing for AI processing — disclosed in-app + PRIVACY.md §4 |
| Mainland China App Store | **Not pursued** — needs ICP备案 + App备案 + mainland backend (PIPL). Est. cost if ever: Aliyun 2C4G ≈ ¥199–298/yr (+ RDS ≈ ¥228/yr); the real work is migrating ~19 files / ~98 `.from()` calls / auth / storage / realtime / 4 edge functions; ICP may need a company entity. Recommendation: stay on Supabase; if migrating, self-host Supabase on a CN cloud. |

---

## Open items (non-blocking, cumulative)

1. **Supabase Free tier**: auto-pauses after ~1 week idle; **no automated backups**. Consider Pro ($25/mo) before growth.
2. **Leaked-password protection**: Pro-only, can't enable on Free.
3. **Performance advisors** (not bugs at current scale): 63 RLS policies call `auth.uid()` per row (wrap as `(select auth.uid())`), 11 unindexed FKs (chat_messages, post_comments, memory_*, friendships, profile_visits).
4. **Forgot-password email**: Free built-in SMTP is rate-limited → configure custom SMTP (e.g. Brevo) — server-side, no re-review.
5. `EMAIL_CONFIRM_REDIRECT_URL` in `supabaseClient.ts` is still the Apple EULA placeholder (only matters if a link-based email flow is ever enabled; email confirmation is OFF, reset uses an 8-digit OTP).
6. `app.json` permission strings still say "Pet Companion" (cosmetic).
7. Rotate Supabase DB password (deferred).
8. Monetization: v1.x later, freemium subscription preferred over ads.
9. Post-launch smoke test of the **live** App Store build (login, post, health record, forgot-password).

---

## Git

- `75ca691` (pushed) — v1.0.0 state.
- Local, **unpushed**: v1.1.0 commit (AI assistant + OCR + version bump + privacy) and session-14 review fixes + this HANDOFF. Push only with the user's OK.
- `.gitignore` now ignores `*.secrets.local.md`.

## History (condensed)
- **S1–9**: compliance fixes, migrations, edge functions (generate-pixel-pet, delete-account), RLS sweep, chat realtime, vaccine reminders, rename → 萌宠无忧, iPhone-only, ASC record.
- **S10**: full submission — reviewer accounts + seed, 8 zh screenshots, pixel-cat icon, cross-account avatar-cache fix, About/support email, builds 1→3, App Privacy labels, storage lockdown migration, submitted.
- **S11**: auth/email facts (email confirmation OFF; reset = 8-digit OTP; recovery template shows `{{ .Token }}`).
- **S12**: mainland-China availability investigated → deferred.
- **S13–14 (2026-10-10 → 10-13)**: v1.1.0 AI assistant (multi-conversation) + medical report OCR, Ark latency fixes, version bump, review pass + DB security fix; release blocked on Apple ID verification.
