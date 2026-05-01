importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// ATENÇÃO: Os valores abaixo precisam ser substituídos pelos do seu painel Firebase
// pois o Service Worker roda em um contexto separado e não tem acesso ao import.meta.env do Vite.
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_AUTH_DOMAIN",
  projectId: "SEU_PROJECT_ID",
  storageBucket: "SEU_STORAGE_BUCKET",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Notificação recebida em background: ', payload);
    const notificationTitle = payload.notification?.title || 'Nova Notificação';
    const notificationOptions = {
      body: payload.notification?.body || '',
      icon: '/icon.svg',
      badge: '/icon.svg'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch (error) {
  console.error('[firebase-messaging-sw.js] Erro ao inicializar o Firebase no Service Worker', error);
}
