# Firebase Realtime Database Setup Guide

Step-by-step instructions for configuring Firebase RTDB so two instances of
Morse Code Studio can exchange decoded morse letters in real time.

---

## Step 1 — Create a Firebase Project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **Create a new Firebase project**
3. Name it something like `morse-code-studio-rtdb` (or anything you like)
4. Google Analytics — you can disable it (not needed), then click **Create project**
5. Wait for it to provision, then click **Continue**

## Step 2 — Register a Web App

1. On the project overview page, click the **web icon** (`</>`) to add a web app
2. Nickname: `morse-code-studio-rtdb`
3. **Do NOT** check "Also set up Firebase Hosting" (you already have `firebase.json` for that)
4. Click **Register app**
5. You will see a code snippet like this:

```js
const firebaseConfig = {
  apiKey: "AIzaSyB...",
  authDomain: "morse-code-studio-xxxxx.firebaseapp.com",
  databaseURL: "https://morse-code-studio-xxxxx-default-rtdb.firebaseio.com",
  projectId: "morse-code-studio-xxxxx",
  storageBucket: "morse-code-studio-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

6. **Copy these values** — you will paste them into `src/app/firebase.config.ts` in Step 5
7. Click **Continue to console**

## Step 3 — Create the Realtime Database

1. In the left sidebar, click **Build → Realtime Database**
2. Click **Create Database**
3. Choose a location (pick the one closest to you geographically, e.g.
   `us-central1` or `europe-west1`). **This cannot be changed later.**
4. Select **Start in locked mode** (we will set proper rules next)
5. Click **Enable**

## Step 4 — Set Security Rules

1. In the Realtime Database page, click the **Rules** tab
2. Replace the entire contents with:

```json
{
  "rules": {
    "morse-code-studio": {
      "channels": {
        "$channelName": {
          "$secret": {
            ".read": true,
            ".write": true,
            ".validate": "newData.hasChildren(['char', 'userName', 'ts', 'wpm'])
                          && newData.child('char').isString()
                          && newData.child('char').val().length <= 5
                          && newData.child('userName').isString()
                          && newData.child('userName').val().length <= 20
                          && newData.child('ts').val() === now
            							&& newData.child('wpm').isNumber()
            							&& newData.child('wpm').val() >= 5
            							&& newData.child('wpm').val() <= 60"
          }
        }
      }
    }
  }
}
```

3. Click **Publish**

This allows anyone to read/write channel data but validates that each entry
has the correct shape. Reads/writes outside
`/morse-code-studio/channels/{name}/{secret}` are denied.

## Step 5 — Paste Config Values

Open `src/app/firebase.config.ts` and replace the placeholder values with the
ones you copied in Step 2. For example if your project ID was
`morse-code-studio-abc12`:

```typescript
export const firebaseConfig = {
  apiKey: 'AIzaSyB...',
  authDomain: 'morse-code-studio-abc12.firebaseapp.com',
  databaseURL: 'https://morse-code-studio-abc12-default-rtdb.firebaseio.com',
  projectId: 'morse-code-studio-abc12',
  storageBucket: 'morse-code-studio-abc12.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef123456',
};
```

> **Important:** The `databaseURL` must match the region you chose in Step 3.
> If you picked a European region it may look like
> `https://morse-code-studio-abc12-default-rtdb.europe-west1.firebasedatabase.app`.
> The Firebase Console shows the exact URL at the top of the Realtime Database
> page — use that.

## Step 6 — Build and Run Locally

```bash
ng serve
```

Open two browser windows/tabs to `http://localhost:4200`.

## Step 7 — Configure Both Instances

### Window A (sender)

1. Open **Settings → Outputs** tab
2. Expand **Firebase RTDB** (Realtime Database Output)
3. Toggle it **ON**
4. Channel Name: `test-channel`
5. Channel Secret: `my-secret-123`
6. User Name: (or your CALLSIGN)
7. Forward: **TX only** (or Both)
8. Click **Save Settings**

### Window B (receiver)

1. Open **Settings → Inputs** tab
2. Expand **Firebase RTDB** (Realtime Database Input)
3. Toggle it **ON**
4. Used for: **RX**
5. Channel Name: `test-channel` (same as Window A)
6. Channel Secret: `my-secret-123` (same as Window A)
7. Click **Save Settings**

## Step 8 — Test

1. In **Window A**, type something in the Morse Encoder and send it (e.g. type
   `CQ CQ` and press Enter or use live mode)
2. In **Window B**, the letters should appear in the decoder conversation,
   prefixed with `[CALLSIGN]`
3. You can verify data is flowing by checking the Firebase Console →
   Realtime Database → **Data** tab. You should see entries under
   `morse-code-studio/channels/test-channel/my-secret-123`

For **two-way** communication, configure both windows with both Input and
Output sections, using the same channel name and secret but different User
Names.

## Step 9 — (Optional) Restrict API Key

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Select your project
3. Click the **Browser key** (auto-created by Firebase)
4. Under **Application restrictions**, select **HTTP referrers**
5. Add your allowed domains: `localhost`, `your-domain.com/*`,
   `your-project.web.app/*`
6. Click **Save**

## Step 10 — (Optional) Deploy to Firebase Hosting

```bash
ng build --configuration=production
firebase deploy --only hosting
```

Both users can then access the app at `https://your-project.web.app`.

---

## Notes

- **No server code required.** The Realtime Database handles all
  communication directly from the browser.
- **Offline caching is disabled.** RTDB features only work when online; the
  app shows a warning if you are offline.
- **Minimal data stored.** Only the last letter per channel+secret is kept.
- **Channel cleanup (optional).** To automatically delete stale channels,
  deploy a scheduled Cloud Function. See the comments in
  `src/app/firebase.config.ts` for an example.
