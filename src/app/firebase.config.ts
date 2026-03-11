/**
 * Morse Code Studio — Firebase Configuration
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 *
 * Replace the placeholder values below with your Firebase project's
 * configuration. You can find these in the Firebase Console under
 * Project Settings → General → Your Apps → Firebase SDK snippet.
 *
 * IMPORTANT: Enable the Realtime Database in the Firebase Console
 * (Build → Realtime Database → Create Database).
 *
 * RTDB Security Rules & Limits:
 * ─────────────────────────────
 * The application stores data under `/morse-code-studio/channels/{name}/{secret}`.
 * Each entry contains only the last letter sent (minimal data).
 *
 * To limit the number of channels and enforce automatic cleanup, configure
 * your Firebase Realtime Database Security Rules. Example:
 *
 *   {
 *     "rules": {
 *       "morse-code-studio": {
 *         "channels": {
 *           "$channelName": {
 *             "$secret": {
 *               ".read": true,
 *               ".write": true,
 *               ".validate": "newData.hasChildren(['char', 'name', 'ts', 'wpm'])
 *                             && newData.child('char').isString()
 *                             && newData.child('char').val().length <= 5
 *                             && newData.child('name').isString()
 *                             && newData.child('name').val().length <= 20
 *                             && newData.child('ts').val() === now
 *                             && newData.child('wpm').isNumber()
 *                             && newData.child('wpm').val() >= 5
 *                             && newData.child('wpm').val() <= 60"
 *             }
 *           }
 *         }
 *       }
 *     }
 *   }
 *
 * To enforce automatic expiry (TTL) of stale channels, deploy a scheduled
 * Cloud Function that deletes entries older than N hours:
 *
 *   // In your Firebase Functions project:
 *   exports.cleanupStaleChannels = functions.pubsub
 *     .schedule('every 1 hours')
 *     .onRun(async () => {
 *       const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
 *       const snap = await admin.database()
 *         .ref('morse-code-studio/channels')
 *         .orderByChild('ts')
 *         .endAt(cutoff)
 *         .once('value');
 *       const updates: Record<string, null> = {};
 *       snap.forEach(ch => { updates[ch.key!] = null; });
 *       if (Object.keys(updates).length) {
 *         await admin.database()
 *           .ref('morse-code-studio/channels')
 *           .update(updates);
 *       }
 *     });
 *
 * These limits are NOT enforced by the application — they must be
 * configured in the Firebase Console or deployed as Cloud Functions.
 */
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  databaseURL: 'https://YOUR_PROJECT-default-rtdb.firebaseio.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
