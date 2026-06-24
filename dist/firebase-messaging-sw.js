
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB2Zgvi2NcjOtwlCjyZPzhPd3F7s7_4mrc",
  authDomain: "hoopsatlas-e16e4.firebaseapp.com",
  projectId: "hoopsatlas-e16e4",
  storageBucket: "hoopsatlas-e16e4.firebasestorage.app",
  messagingSenderId: "627950543256",
  appId: "1:627950543256:web:9b23dc7198ce33dbb14bed"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
