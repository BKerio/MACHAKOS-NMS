// Handles push notifications while this tab isn't in the foreground.
// Config mirrors the `eoc-mcg` Firebase project's Web app (see
// src/lib/firebasePush.ts) - keep the two in sync if it's ever reconfigured.

// Where a click on a case alert should land (the crew's live case page).
const ALERT_PATH = '/operator/assignment';
const ICON = '/push-icon.png';

// Registered BEFORE the Firebase scripts load, so it runs ahead of the SDK's
// own click handler (which only follows an absolute fcm_options.link, and the
// backend doesn't know the dashboard's URL). Focuses an open dashboard tab and
// sends it to the case, or opens one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.stopImmediatePropagation();
  const target = new URL(ALERT_PATH, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) {
        await open.focus();
        if ('navigate' in open) await open.navigate(target).catch(() => {});
        return;
      }
      await self.clients.openWindow(target);
    }),
  );
});

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCT8X20v-ds0qrmAShwafizdAi7hDvKVGQ',
  appId: '1:1072219330481:web:5ebc5ed0d60b5b3503cf90',
  messagingSenderId: '1072219330481',
  projectId: 'eoc-mcg',
  authDomain: 'eoc-mcg.firebaseapp.com',
  storageBucket: 'eoc-mcg.firebasestorage.app',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // Messages with a `notification` block (every case alert the backend sends)
  // are already displayed by the Firebase SDK. Showing them here too was
  // producing each alert twice - only draw data-only messages ourselves.
  if (payload.notification) return;
  const data = payload.data || {};
  self.registration.showNotification(data.title || 'Machakos EOC', {
    body: data.body,
    icon: ICON,
    badge: ICON,
    data,
    requireInteraction: true,
  });
});
