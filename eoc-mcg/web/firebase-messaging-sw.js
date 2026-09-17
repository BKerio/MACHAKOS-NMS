// Handles push notifications while the web app isn't in the foreground.
// Config mirrors the `web` FirebaseOptions in lib/firebase_options.dart -
// keep the two in sync if the project is ever reconfigured.
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
  const title = payload.notification?.title ?? 'New notification';
  const options = {
    body: payload.notification?.body,
    icon: '/icons/Icon-192.png',
    data: payload.data,
  };
  self.registration.showNotification(title, options);
});
