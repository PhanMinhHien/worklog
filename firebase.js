import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAgw8Em-dm-VqmGfKjdS_WIV37WwrmJESw",
  authDomain: "manage-task-5f536.firebaseapp.com",
  projectId: "manage-task-5f536",
  storageBucket: "manage-task-5f536.firebasestorage.app",
  messagingSenderId: "17070787295",
  appId: "1:17070787295:web:5bbe9c804e9df119d2776a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

try {
  await enableIndexedDbPersistence(db);
} catch (error) {
  console.warn("Offline persistence unavailable:", error.code || error.message);
}

await signInAnonymously(auth);

export { app, auth, db };
