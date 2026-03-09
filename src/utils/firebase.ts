import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAuto-generated-placeholder",
  authDomain: "tpl-form-check.firebaseapp.com",
  projectId: "tpl-form-check",
  storageBucket: "tpl-form-check.firebasestorage.app",
  messagingSenderId: "743013736033",
  appId: "1:743013736033:web:a5b82e03ff78f53b731420",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export interface RepRecord {
  repNumber: number;
  score: number;
  corrections: string[];
  sessionId: string;
  personName: string;
  uploadedAt: string;
  timestamp?: unknown;
}

// Write a completed rep to Firestore
export async function publishRep(rep: Omit<RepRecord, 'timestamp'>) {
  try {
    await addDoc(collection(db, 'reps'), {
      ...rep,
      timestamp: serverTimestamp(),
    });
    console.log(`Rep ${rep.repNumber} published to Firestore`);
  } catch (e) {
    console.warn('Failed to publish rep to Firestore:', e);
  }
}
