import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// 사파리 등에서 WebChannel Listen 이 멈추면 롱 폴링으로 넘어가게 한다.
// Realtime Database 는 초기화하지 않는다. 접속·방문 집계를 쓰지 않으며, 투표자 화면에서 getDatabase 가 돌면 Spark 동시접속 한도를 쓴다.
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
