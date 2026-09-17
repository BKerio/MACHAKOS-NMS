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

    await api.post('/notifications/token', { fcmToken: token });
  } catch (err) {
    console.warn('Web push registration failed:', err);
  }
}

/** Clears this browser's push token on sign-out, mirroring the mobile app. */
export async function unregisterWebPush(): Promise<void> {
  try {
    await api.delete('/notifications/token');
  } catch {
    // Best-effort - the token naturally stops being usable once the session ends.
  }
}

/** Foreground messages don't trigger the service worker's notification popup
 *  on their own - `onMessageHandler` lets the caller route them into the
 *  app's own in-app notification drawer instead. */
export async function onForegroundMessage(handler: (payload: { title?: string; body?: string }) => void): Promise<void> {
  const msg = await getMessagingInstance();
  if (!msg) return;
  onMessage(msg, (payload) => {
    handler({ title: payload.notification?.title, body: payload.notification?.body });
  });
}
