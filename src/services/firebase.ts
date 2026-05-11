import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getMessaging } from "firebase/messaging";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDQcCqckJrfOav-oh5ibsO6dyusCGSpMRI",
  authDomain: "app-gestao-domestica.firebaseapp.com",
  projectId: "app-gestao-domestica",
  storageBucket: "app-gestao-domestica.firebasestorage.app",
  messagingSenderId: "215152852193",
  appId: "1:215152852193:web:4a253c831b6c85a169cba0",
  measurementId: "G-Z8CB92C7RS"
};

export const app = initializeApp(firebaseConfig);

let analyticsInstance = null;
if (typeof window !== 'undefined') {
  try {
    analyticsInstance = getAnalytics(app);
  } catch (error) {
    console.warn("Analytics could not be initialized:", error);
  }
}
export const analytics = analyticsInstance;

export const db = getFirestore(app);
export const messaging = typeof window !== 'undefined' && 'Notification' in window ? getMessaging(app) : null;
