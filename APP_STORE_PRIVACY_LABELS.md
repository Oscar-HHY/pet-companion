# App Store Privacy Nutrition Labels — Pet Companion

Use this as a fill-in answer key when you reach the **Privacy** section in App Store Connect (App Information → Privacy → "Get Started" under "Data Types").

Apple asks 4 questions for each data type:
1. **Do you collect this data?** — Yes / No
2. **Is it linked to the user's identity?** — Yes / No (almost always Yes for us, since every row in our DB is tied to a `user_id`)
3. **Is it used for tracking?** — Yes / No
4. **What's it used for?** — pick one or more: *App Functionality, Analytics, Developer Advertising, Third-Party Advertising, Personalization, Other Purposes*

For Pet Companion, the short version is:
- ✅ We collect ~9 data types
- ✅ Almost everything is **Linked to identity** (all rows keyed by user_id)
- ❌ **Nothing is used for Tracking** (Apple's definition: linking with third-party data for ads, or sharing with data brokers — we do neither)
- ✅ Sole purpose is always **App Functionality** (no analytics, no ads, no personalization in Apple's sense)

---

## Full answer key — go through these in order

### Contact Info

| Subtype | Collected? | Linked? | Tracking? | Purpose | Note |
|---|---|---|---|---|---|
| **Name** | ✅ Yes | Yes | No | App Functionality | User-chosen nickname stored in `user_profiles.nickname` |
| **Email Address** | ✅ Yes | Yes | No | App Functionality | Auth email + optional public email field |
| **Phone Number** | ❌ No | — | — | — | Not collected |
| **Physical Address** | ❌ No | — | — | — | Not collected |
| **Other User Contact Info** | ✅ Yes | Yes | No | App Functionality | The free-form `user_profiles.contact_info` field (only if user fills it in) |

### Health & Fitness

| Subtype | Collected? | Linked? | Tracking? | Purpose | Note |
|---|---|---|---|---|---|
| **Health** | ✅ Yes | Yes | No | App Functionality | Pet health questionnaires, medical records, vaccinations, weight. Even though it's *pet* data not human data, Apple's category is broad — safer to declare. |
| **Fitness** | ❌ No | — | — | — | We track pet activities (walks etc.), not human fitness |

### Financial Info

❌ **Nothing collected.** No payments, no IAPs, no credit info.

### Location

❌ **Nothing collected.** No GPS, no IP geolocation, no coarse location.

### Sensitive Info

❌ **Nothing collected.** Apple's definition: racial/ethnic data, sexual orientation, pregnancy, disability, religious beliefs, trade union, political opinion, genetic info, biometric data. We don't ask for any of these.

### Contacts

❌ **Not collected.** We don't access the iOS Contacts app.

### User Content

| Subtype | Collected? | Linked? | Tracking? | Purpose | Note |
|---|---|---|---|---|---|
| **Emails or Text Messages** | ✅ Yes | Yes | No | App Functionality | The `chat_messages` between friends |
| **Photos or Videos** | ✅ Yes | Yes | No | App Functionality | Pet photos, avatars, memory videos uploaded to Supabase Storage |
| **Audio Data** | ✅ Yes | Yes | No | App Functionality | `memory_echos` voice recordings |
| **Gameplay Content** | ❌ No | — | — | — | Not a game |
| **Customer Support** | ❌ No | — | — | — | No in-app support chat |
| **Other User Content** | ✅ Yes | Yes | No | App Functionality | Posts, comments, memory diaries, health questionnaires, content reports |

### Browsing History

❌ **Not collected.** No web browsing tracked.

### Search History

❌ **Not collected.** User-handle searches are not stored as history.

### Identifiers

| Subtype | Collected? | Linked? | Tracking? | Purpose | Note |
|---|---|---|---|---|---|
| **User ID** | ✅ Yes | Yes | No | App Functionality | Supabase auth UUID + the public `search_handle` (e.g. `pet_abc12345`) |
| **Device ID** | ❌ No | — | — | — | No IDFA, no device fingerprinting |

### Purchases

❌ **Not collected.** No IAPs, no purchase history.

### Usage Data

| Subtype | Collected? | Linked? | Tracking? | Purpose | Note |
|---|---|---|---|---|---|
| **Product Interaction** | ✅ Yes | Yes | No | App Functionality | The `profile_visits` table records "who viewed whose profile" to power the *Recent Visitors* feature. No analytics SDK, no taps/scrolling logged. |
| **Advertising Data** | ❌ No | — | — | — | No ads |
| **Other Usage Data** | ❌ No | — | — | — | Nothing else |

### Diagnostics

| Subtype | Collected? | Linked? | Tracking? | Purpose | Note |
|---|---|---|---|---|---|
| **Crash Data** | ❌ No | — | — | — | No Sentry / Crashlytics / Bugsnag integrated |
| **Performance Data** | ❌ No | — | — | — | No performance monitoring SDK |
| **Other Diagnostic Data** | ❌ No | — | — | — | Nothing else |

> **Note:** If you ever add a crash reporter (Sentry, Bugsnag, etc.) before launch, **you must update this section** — change Crash Data to ✅, Linked = depends on SDK config, Purpose = App Functionality.

### Other Data

| Subtype | Collected? | Linked? | Tracking? | Purpose | Note |
|---|---|---|---|---|---|
| **Other Data Types** | ✅ Yes | Yes | No | App Functionality | Pet name + species/breed, pet activity durations (walks/baths/playtime), friendship and block records. Doesn't fit any other Apple category. |

---

## After the questionnaire — special declarations

Apple may also ask:

### "Data Used to Track You"
**Answer: We do not use data to track users.**

(This unlocks a green "Data Not Used to Track You" badge in your App Store listing — good signal to privacy-conscious users.)

### "Data Linked to You"
You'll need to list everything from the ✅ rows above. Expect to see roughly:
- Contact Info (Name, Email, Other)
- Health & Fitness (Health)
- User Content (Messages, Photos, Audio, Other)
- Identifiers (User ID)
- Usage Data (Product Interaction)
- Other Data

### "Data Not Linked to You"
**Empty.** (Everything is tied to a Supabase user_id.)

---

## Service providers vs. third parties (important)

Apple distinguishes between:
- **Third parties** (data brokers, ad networks) — counts as tracking / data sharing
- **Service providers** (backend hosting, image generation we control) — does NOT count as third parties

Our backend stack:
- **Supabase** (Seoul) — service provider. We control what's sent, they don't use it for anything else.
- **Volcengine Seedream API** (China) — service provider. Only sends a single pet photo + a system prompt when generating a pixel avatar. They have their own data policy but they're processing on our behalf.

**Neither counts as tracking or third-party sharing for the privacy label.** Don't list them under tracking.

(They DO need to be disclosed in your Privacy Policy text — already done in `PRIVACY.md` Section 4.)

---

## Quick FAQ — likely questions Apple's questionnaire will throw at you

> **"You said you collect Email — is that for account creation or for marketing?"**
For account creation/authentication only. Select **App Functionality**, NOT Developer Communications.

> **"Why is Health data Linked? Could it be anonymous?"**
Because it's pet health records keyed to a specific user_id (the pet owner). Anonymous would mean we couldn't tie a vaccination record back to "your pet" — feature wouldn't work.

> **"Do you collect Product Interaction for analytics?"**
No. We collect it only to power the *Recent Visitors* user-facing feature. No analytics SDK is integrated.

> **"Do you share data with third parties?"**
No third parties. Only service providers (Supabase, Volcengine) processing data on our behalf — Apple's framework treats those as part of our app.

---

## Estimated time to fill in App Store Connect

With this answer key open in another window: **15–20 minutes** for the privacy section.
Without it: **1–2 hours** of figuring out what counts as what.
