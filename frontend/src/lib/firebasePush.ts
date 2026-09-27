import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import api from '@/api/client';

// Same `eoc-mcg` Firebase project/Web app used by the mobile crew app (see
// eoc-mcg/lib/firebase_options.dart) - operators using the web dashboard get
// pushed the same new-case alerts, through the same backend gateway.
const firebaseConfig = {
  apiKey: 'AIzaSyCT8X20v-ds0qrmAShwafizdAi7hDvKVGQ',
  appId: '1:1072219330481:web:5ebc5ed0d60b5b3503cf90',
  messagingSenderId: '1072219330481',
  projectId: 'eoc-mcg',
  authDomain: 'eoc-mcg.firebaseapp.com',
  storageBucket: 'eoc-mcg.firebasestorage.app',
};

let messaging: Messaging | null = null;

/** This browser's token as last registered, so sign-out removes only it. */
let registeredToken: string | null = null;

async function getMessagingInstance(): Promise<Messaging | null> {
  if (messaging) return messaging;
  if (!(await isSupported())) return null; // e.g. Safari without web push, or non-browser context
  const app = initializeApp(firebaseConfig);
  messaging = getMessaging(app);
  return messaging;
}

/**
 * Requests notification permission, registers the FCM service worker, and
 * hands the resulting token to the backend (POST /notifications/token) -
 * the same endpoint the mobile crew app registers through. Safe to call
 * repeatedly; a no-op if push isn't supported or permission is denied.
 */
export async function registerWebPush(): Promise<void> {
  try {
    const msg = await getMessagingInstance();
    if (!msg) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
    if (!vapidKey) {
      console.warn('VITE_FIREBASE_VAPID_KEY is not set - web push token cannot be requested.');
      return;
    }

    const token = await getToken(msg, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return;

    // The backend keeps one row per device, so this browser and the crew
    // app on the same user's phone both receive alerts.
    await api.post('/notifications/token', { fcmToken: token, platform: 'WEB' });
    registeredToken = token;
  } catch (err) {
    console.warn('Web push registration failed:', err);
  }
}

/**
 * Clears this browser's push token on sign-out. Only this browser's: the
 * same user's phone must keep getting case alerts.
 */
export async function unregisterWebPush(bearer?: string | null): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return; // never registered here - nothing of ours to remove
  try {
    // [bearer] is the session captured when push was registered: on sign-out
    // the store's token is already gone, and without it this call would 401
    // and leave the signed-out browser still receiving case alerts.
    await api.delete('/notifications/token', {
      data: { fcmToken: token },
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
    });
  } catch {
    // Best-effort - the token naturally stops being usable once the session ends.
  }
}

/** Foreground messages don't trigger the service worker's notification popup
 *  on their own - `onMessageHandler` lets the caller route them into the
 *  app's own in-app notification drawer instead. */
export async function onForegroundMessage(
  handler: (payload: { title?: string; body?: string }) => void,
): Promise<() => void> {
  const msg = await getMessagingInstance();
  if (!msg) return () => {};
  // Returns the unsubscribe, so re-registering (e.g. sign out then in again
  // in the same tab) doesn't stack handlers and duplicate every alert.
  return onMessage(msg, (payload) => {
    handler({ title: payload.notification?.title, body: payload.notification?.body });
  });
}
