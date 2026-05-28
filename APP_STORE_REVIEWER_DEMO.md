# Demo Reviewer Account — Setup Guide

Apple's reviewer must be able to log in and exercise the app's features without creating their own account. If they can't, the submission is auto-rejected with the message *"We were unable to evaluate your app because we could not sign in."*

This guide creates **two linked reviewer accounts** so the reviewer can see the full social / chat loop, not just a logged-in empty shell.

---

## Why two accounts?

Pet Companion's distinct features include:
- Friend requests + accept/reject flow
- Direct messaging
- Profile visit tracking ("recent visitors")
- Community posts + comments

Most of these require *another user*. If we ship only one demo account, the reviewer can't exercise the social half of the app. Two accounts that are already friends fix that.

---

## Step 1 — Create the two auth users (~3 min)

In the Supabase Dashboard:

1. Open https://supabase.com/dashboard/project/pzozanrirwjnlrgvqlzj/auth/users
2. Click **"Add user"** → **"Create new user"**
3. **Reviewer #1**:
   - Email: `bei.chen725+reviewer1@gmail.com`
   - Password: `<REVIEWER_PASSWORD>` (or generate your own — note it down)
   - ✅ check **"Auto Confirm User"** so no email confirmation is needed
   - Click **Create user**
4. Repeat for **Reviewer #2**:
   - Email: `bei.chen725+reviewer2@gmail.com`
   - Password: `<REVIEWER_PASSWORD>`
   - ✅ Auto Confirm User
5. After creation, click each user row and **copy their UUID** — you'll need them for the seed SQL.

> *Why `+reviewer1` / `+reviewer2`?* Gmail's plus-addressing means both emails forward to `bei.chen725@gmail.com`, so if Apple ever triggers a password reset email during review, it lands in your inbox.

Write the two UUIDs down here for later:

```
REVIEWER_1_UUID = <paste-here>
REVIEWER_2_UUID = <paste-here>
```

---

## Step 2 — Run the seed SQL (~1 min)

In the Supabase Dashboard:

1. Open https://supabase.com/dashboard/project/pzozanrirwjnlrgvqlzj/sql/new
2. Replace `REVIEWER_1_UUID` and `REVIEWER_2_UUID` at the top with the UUIDs from Step 1
3. Paste the entire block below
4. Click **Run**

```sql
-- ====================================================================
-- Pet Companion — App Store Reviewer demo data seed
-- Replace the two UUIDs below with the ones from Auth → Users.
-- ====================================================================

DO $$
DECLARE
  reviewer1 text := 'REVIEWER_1_UUID';   -- Mocha's owner
  reviewer2 text := 'REVIEWER_2_UUID';   -- Pixel's owner
BEGIN

-- 1. user_profiles
INSERT INTO user_profiles (id, nickname, search_handle, email)
VALUES
  (reviewer1, 'Mocha''s Mom', 'pet_reviewer01', 'bei.chen725+reviewer1@gmail.com'),
  (reviewer2, 'Pixel''s Dad', 'pet_reviewer02', 'bei.chen725+reviewer2@gmail.com')
ON CONFLICT (id) DO UPDATE
  SET nickname = EXCLUDED.nickname,
      search_handle = EXCLUDED.search_handle,
      email = EXCLUDED.email;

-- 2. Pet for each account. pets PK is user_id (no separate id column); client upserts with onConflict: 'user_id'.
INSERT INTO pets (user_id, name, breed, age, bio, status)
VALUES
  (reviewer1, 'Mocha', 'Labrador Retriever', '3 years', 'Loves long walks and peanut butter.', 'idle'),
  (reviewer2, 'Pixel', 'Persian Cat',        '2 years', 'Indoor cat with a strong opinion on cardboard boxes.', 'idle');

-- 3. Vaccinations — one upcoming so the Health screen shows a reminder
INSERT INTO vaccinations (id, user_id, vaccine_date, dose_number, next_due_date)
VALUES
  (gen_random_uuid(), reviewer1, '2026-04-15', '2', (CURRENT_DATE + 14)::text),
  (gen_random_uuid(), reviewer1, '2025-12-20', '1', '2026-04-15'),
  (gen_random_uuid(), reviewer2, '2026-03-10', '2', (CURRENT_DATE + 21)::text);

-- 4. Weight records — give the Health screen something to chart
INSERT INTO weight_records (id, user_id, weight)
VALUES
  (gen_random_uuid(), reviewer1, 27.5),
  (gen_random_uuid(), reviewer1, 28.0),
  (gen_random_uuid(), reviewer2, 4.2);

-- 5. Medical record
INSERT INTO medical_records (id, user_id, clinic_name, diagnosis, treatment, medications, notes)
VALUES
  (gen_random_uuid(), reviewer1, 'Sunshine Animal Clinic', 'Annual wellness check', 'Routine exam — all healthy', 'None', 'Recommended switching to senior food next year');

-- 6. Memory diary entry
INSERT INTO memory_diaries (id, user_id, title, content, created_at)
VALUES
  (gen_random_uuid(), reviewer1, 'First snow', 'Mocha saw snow for the first time today and tried to eat it. Pure joy.', now() - interval '5 days');

-- 7. Community posts (one each). hugs_users / tissues_users are text[] arrays of user IDs;
--    the UI derives counts via .length. Seeding each post with the other reviewer's UUID in
--    hugs_users gives each post 1 hug for a non-empty display.
INSERT INTO community_posts (user_id, author_name, title, content, hugs_users, tissues_users, created_at)
VALUES
  (reviewer1, 'Mocha''s Mom', 'Looking for hiking buddies', 'Mocha and I hike every Sunday morning. Anyone with a friendly dog want to join?', ARRAY[reviewer2]::text[], ARRAY[]::text[], now() - interval '2 days'),
  (reviewer2, 'Pixel''s Dad', 'Best cardboard boxes ranked', 'After extensive Pixel-led testing: Amazon boxes > Costco boxes > shipping tubes. Discuss.', ARRAY[reviewer1]::text[], ARRAY[]::text[], now() - interval '1 day');

-- 8. Friendship — accepted both ways so they show in each other's friends list
INSERT INTO friendships (requester_id, receiver_id, status)
VALUES (reviewer1, reviewer2, 'accepted');

-- 9. A short chat history so the chat screen isn't empty
INSERT INTO chat_messages (sender_id, receiver_id, content, is_read, created_at)
VALUES
  (reviewer1, reviewer2, 'Hey! How is Pixel doing?', true,  now() - interval '3 hours'),
  (reviewer2, reviewer1, 'Great! Just discovered another box.', true,  now() - interval '2 hours 50 minutes'),
  (reviewer1, reviewer2, 'Send pictures!', false, now() - interval '10 minutes');

END $$;

-- ====================================================================
-- Verify
-- ====================================================================
SELECT 'user_profiles' AS what, count(*) FROM user_profiles WHERE id IN ('REVIEWER_1_UUID', 'REVIEWER_2_UUID')
UNION ALL SELECT 'pets',          count(*) FROM pets          WHERE user_id IN ('REVIEWER_1_UUID', 'REVIEWER_2_UUID')
UNION ALL SELECT 'vaccinations',  count(*) FROM vaccinations  WHERE user_id IN ('REVIEWER_1_UUID', 'REVIEWER_2_UUID')
UNION ALL SELECT 'community_posts', count(*) FROM community_posts WHERE user_id IN ('REVIEWER_1_UUID', 'REVIEWER_2_UUID')
UNION ALL SELECT 'friendships',   count(*) FROM friendships   WHERE requester_id IN ('REVIEWER_1_UUID', 'REVIEWER_2_UUID') OR receiver_id IN ('REVIEWER_1_UUID', 'REVIEWER_2_UUID')
UNION ALL SELECT 'chat_messages', count(*) FROM chat_messages WHERE sender_id IN ('REVIEWER_1_UUID', 'REVIEWER_2_UUID') OR receiver_id IN ('REVIEWER_1_UUID', 'REVIEWER_2_UUID');
```

Expected verify output: 2 user_profiles, 2 pets, 3 vaccinations, 2 community_posts, 1 friendship, 3 chat_messages.

---

## Step 3 — What to paste into App Store Connect

When you submit your build for review, App Store Connect shows a section called **"App Review Information"**. Fill it in like this:

### Sign-In Information

```
Sign-In Required: Yes
User Name: bei.chen725+reviewer1@gmail.com
Password: <REVIEWER_PASSWORD>
```

### Notes (Notes to Reviewer)

```
Hi Apple Review Team,

Pet Companion is a pet care + memory + light social app. Below are credentials and walkthrough tips for testing.

— Demo accounts —
Primary:   bei.chen725+reviewer1@gmail.com  / <REVIEWER_PASSWORD>
Secondary: bei.chen725+reviewer2@gmail.com  / <REVIEWER_PASSWORD>

Both accounts are pre-seeded with a pet, vaccination records, and a couple of community posts. They are already friends, so the chat and friend-list features can be tested by logging in with the primary account.

— Walkthrough tips —
1. Sign in with the primary account.
2. "宠物" / "Pet" tab — see Mocha's profile, tap "散步 / Walk" to start a Companion Dock session. The Live Activity appears on the Lock Screen / Dynamic Island.
3. "健康 / Health" tab — see logged vaccinations, weight records, and one medical record. An upcoming vaccination shows a reminder banner.
4. "社区 / Community" tab — view two sample posts. Tap to comment or report.
5. "好友 / Friends" tab — open the chat with "Pixel's Dad" to see prior messages and send a new one.
6. "我的 / Me" tab — open Settings to test language toggle (中文 / English), dark mode, and theme color picker.

— Vaccination reminders —
Local notification only (no remote push). Triggered at 9:00 AM on the next-due date. iOS may prompt for notification permission on first use.

— Account deletion —
Available under "我的 / Me" → "删除账号 / Delete Account". Implements App Store Review Guideline 5.1.1(v).

— Privacy Policy —
https://oscar-hhy.github.io/pet-companion-privacy/

Thank you for reviewing!
```

### Contact Information

```
First Name: Bei
Last Name: Chen
Phone:     <your phone number>
Email:     bei.chen725@gmail.com
```

### Attachment (optional)

Apple lets you attach screenshots showing where to tap if any feature is non-obvious. Pet Companion's UI is straightforward — usually no attachment needed.

---

## After Apple review

When approval lands, you can either:
- Keep the demo accounts active (recommended — useful for any future re-submission)
- Delete them via your in-app "Delete Account" flow (verifies that the flow works end-to-end!)

If you delete them, just re-run the seed before any future Apple review.

---

## Common rejection causes this guide prevents

| Apple rejection reason | How this guide avoids it |
|---|---|
| "Could not sign in to demo account" | Auto-confirmed user, plaintext password in submission notes |
| "Couldn't test feature X because no data" | Pre-seeded data covers all major screens |
| "Account deletion not working" | Demo accounts can actually be deleted via our delete-account function (battle-tested this session) |
| "App requires registration but no demo" | Two accounts with clear walkthrough |
