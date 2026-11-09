# Google Play: App content and store settings

Answers for the Play Console **Policy and programs → App content** forms and **Store presence → Store settings**, checked against the code and [the privacy policy](https://morse-code-studio.web.app/privacy.html). Re-check them whenever the app starts handling data differently; the forms and the privacy policy must always agree.

## What the answers are based on

- No account, sign-in, ads, analytics or tracking. The source makes no network requests other than loading the app from Firebase Hosting and the opt-in RTDB relay.
- Settings, presets and preferences stay in the browser's local storage on the device.
- Microphone sound is analysed on the device only. Play does not count on-device processing as data collection.
- The Firebase connection is created only when the user switches the relay on (`FirebaseRtdbService.ensureInitialized()`). Relay sending writes only `char`, `name`, `wpm`, an optional `col` (colour) and a server time stamp to the user's chosen channel; each character overwrites the previous one.
- The Android wrapper declares no permissions of its own and has no ads or analytics library (only `androidbrowserhelper`). Microphone, MIDI and other device access is requested by Chrome, not by the app package.

## App content forms

| Form | Answer |
|---|---|
| Privacy policy | `https://morse-code-studio.web.app/privacy.html` |
| App access | All functionality is available without any access restrictions. (The relay channel name and secret are chosen by the user; there are no developer-issued credentials.) |
| Ads | No, the app does not contain ads. |
| Advertising ID | No, the app does not use an advertising ID. |
| Government apps | No. |
| Financial features | The app provides no financial features. |
| Health | No health features. |
| News app | Not asked by Play for this app. |

All ten declarations were actioned on 9 November 2026: privacy policy, sign-in details, ads, content ratings, target audience, data safety, government apps, financial features, advertising ID and health.

### Content rating (IARC questionnaire)

The questionnaire offers only Yes/No answers; the notes here explain each answer and are not entered anywhere.

- Contact email: the developer email already public in the privacy policy.
- Category: **All other app types** (the options are Game, Social or communication, All other app types). Not "Social or communication": the relay is optional, and the app's main purpose is Morse training, keying and decoding. Agree to the IARC terms.
- Users can interact or exchange content: **Yes**. The opt-in relay sends Morse characters and a chosen name between devices on the same channel. Follow-up questions:
  - Shared, user-generated content is the primary source of content: **No** (the relay is optional; the app's content is generated on the device).
  - Public sharing of nudity: **No**. Public sharing of real-world graphic violence: **No** (the relay carries only single text characters and a name, never images, video or audio).
  - Block users or content: **No**. Report users or content: **No**. Chat moderation: **No**.
  - Interactions can be limited to invited friends only: **Yes** (a relay channel is reached only with its channel name and secret, which users share with the people they choose).
- Web browser or search engine: **No** (the app shows only its own site).
- Primarily a news or educational product: **Yes** (Morse learning and practice: Koch lessons, copy and send practice, the Teach wizard and built-in Help).
- All other questions (violence, fear, sexuality, language, controlled substances, crude humour, gambling, age-restricted products, location sharing, digital purchases): **No**.

Resulting ratings (9 November 2026): ESRB Everyone, PEGI 3, USK all ages (descriptor "Content for different age groups"), ClassInd all ages, IARC Generic and Google Play 3+. Every region carries the "Users interact" element. The rating describes content suitability; it is separate from the 13+ target audience below.

### Target audience and content

- Target age groups: **13–15, 16–17, 18 and over**. Do not select any under-13 group: that would place the app under the Families policy, and the privacy policy says it is intended for ages 13 and over.
- With no under-13 group selected, Play does not ask whether the listing could appeal to children.

### Data safety

- Does the app collect or share any of the required user data types? **Yes** (only because of the opt-in relay).
- Is all user data encrypted in transit? **Yes** (HTTPS and secure WebSocket to Firebase).
- Account creation: **My app does not allow users to create an account.**
- With no account, Play did not ask about data deletion requests. Users can still ask by email (privacy policy), and relay data is overwritten by the next character on the channel.
- Additional badges (independent security review, UPI): not applied for.
- Data types: tick only the two below. Do not tick App activity → Other user-generated content: the relayed characters are already declared as messages.

Data types to declare (all others: not collected):

| Data type | Collected | Shared | Processed ephemerally | Required or optional | Purpose |
|---|---|---|---|---|---|
| Personal info → Name (the relay sender name, which may be a nickname or callsign) | Yes | No | No | Optional | App functionality |
| Messages → Other in-app messages (the relayed Morse characters) | Yes | No | No | Optional | App functionality |

"Shared" is **No** because Firebase acts as the developer's service provider and other relay users receive the characters only because the sender chose to send them to that channel; Play exempts both from "sharing".

Store listing preview (9 November 2026): no data shared with third parties; Name and Other in-app messages collected, both optional, for app functionality; data encrypted in transit; privacy policy URL shown.

Not collected: location, contacts, audio (microphone is analysed on the device only), photos, files, calendar, app activity, web browsing, app info and performance (no crash reporting or diagnostics), device or other IDs, financial info, health.

## Store settings

Unlike the App content forms, saving the store contact details asks "Publish change on Google Play?" and goes live straight away; it is not held for review in Publishing overview. This publishes only those details, not the app.

The saved App content and store settings were included in Play Console submission 1 on 9 November 2026. The submission was marked **Published** at 21:46 as part of the Alpha closed-test release; the app is not publicly available through production.

| Field | Value |
|---|---|
| App category | **Education** (selected by the owner). |
| Tags | Optional. |
| Email address (public) | The developer email already public in the privacy policy. |
| Website | `https://morse-code-studio.web.app/` |
| Phone number | Leave empty (optional). |
| External marketing | Leave **Advertise my app outside Google Play** ticked (the default). Google may promote the published listing on its own surfaces at no cost to the developer; it never adds ads to the app. Changes take up to 60 days. |
