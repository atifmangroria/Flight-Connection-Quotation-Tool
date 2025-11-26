// firebase.js
// Firebase initialization and helper functions for Firestore and Auth

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDx3Qxt84vJlz_-mXuxiC0W2flaLadr9Ws",
  authDomain: "fc-quotation-tool.firebaseapp.com",
  projectId: "fc-quotation-tool",
  storageBucket: "fc-quotation-tool.appspot.com",
  messagingSenderId: "370566945624",
  appId: "1:370566945624:web:a84b20d5a8f99d20a6e32d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Save data for the logged-in user
export async function saveUserData(data) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in");
  const userDoc = doc(db, "quotations", user.uid);
  await setDoc(userDoc, { quotations: data }, { merge: true });
}

// Load data for the logged-in user
export async function loadUserData() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in");
  const userDoc = doc(db, "quotations", user.uid);
  const docSnap = await getDoc(userDoc);
  return docSnap.exists() ? docSnap.data().quotations : null;
}

// Listen for auth state changes
export function onUserStateChanged(callback) {
  onAuthStateChanged(auth, callback);
}

export { auth, db };