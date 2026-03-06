// ─── Chart Wars — Firebase Configuration ────────────────────────────────────
// Replace the placeholder values below with your Firebase project config.
// Get these from: Firebase Console → Project Settings → General → Your apps → Config

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyC-vHuDin8XtVk4C85QLbzMJVInQI6-PCE",
    authDomain: "chart-wars.firebaseapp.com",
    databaseURL: "https://chart-wars-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "chart-wars",
    storageBucket: "chart-wars.firebasestorage.app",
    messagingSenderId: "458075139077",
    appId: "1:458075139077:web:49a4243f6976f76c5c806c"
};

// ── Initialise Firebase (only if SDK loaded) ─────────────────────────────────
if (typeof firebase !== "undefined") {
    firebase.initializeApp(FIREBASE_CONFIG);
    window.FirebaseDB = firebase.database();
    console.log("🔥 Firebase connected");
} else {
    console.warn("Firebase SDK not loaded — multiplayer unavailable");
    window.FirebaseDB = null;
}
