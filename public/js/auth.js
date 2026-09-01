// CampusFind AI - Firebase Auth Module (browser SDK, module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onIdTokenChanged,
  updateProfile,
  sendEmailVerification,
  reload
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let currentUser = null;
let idToken = null;
let authStateResolved = false;
const listeners = new Set();

function notifyAuthListeners(user) {
  listeners.forEach(cb => {
    try { cb(user); } catch (error) { console.error("Auth state listener failed", error); }
  });
  window.dispatchEvent(new CustomEvent("campusfind-auth-changed", { detail: { user } }));
}

async function syncAuthState(user = auth.currentUser, forceRefresh = false) {
  if (!user) {
    currentUser = null;
    idToken = null;
    authStateResolved = true;
    notifyAuthListeners(null);
    return null;
  }

  try {
    // Reload is important after the user returns from the email-verification link.
    await reload(user);
  } catch (e) {
    console.warn("Could not reload Firebase user", e);
  }

  currentUser = auth.currentUser || user;
  try {
    idToken = await currentUser.getIdToken(forceRefresh);
  } catch (e) {
    idToken = null;
    console.error("Failed to refresh Firebase ID token", e);
  }
  authStateResolved = true;
  notifyAuthListeners(currentUser);
  return currentUser;
}

// This fires for sign-in/sign-out and token refreshes, unlike onAuthStateChanged.
onIdTokenChanged(auth, (user) => {
  syncAuthState(user, false);
});

// Refresh verification status when the user comes back from the verification email.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && auth.currentUser) {
    syncAuthState(auth.currentUser, true);
  }
});

export function onAuthChange(cb) {
  listeners.add(cb);
  if (authStateResolved) cb(currentUser);
  return () => listeners.delete(cb);
}
export function getCurrentUser() { return currentUser; }
export function getIdToken() { return idToken; }
export async function getIdTokenForced() {
  if (!auth.currentUser) {
    idToken = null;
    return null;
  }
  try {
    // Do not publish an auth-state event here: callers such as the notification
    // loader use authFetch, and publishing would recursively re-trigger them.
    idToken = await auth.currentUser.getIdToken(true);
    return idToken;
  } catch (error) {
    idToken = null;
    console.error("Failed to refresh Firebase ID token", error);
    return null;
  }
}
export function isLoggedIn() { return!!currentUser; }
export function isVerified() { return!!currentUser?.emailVerified; }

export async function register({ nickname, email, password, confirmPassword }) {
  const nick = (nickname || "").trim();
  if (!nick || nick.length < 2) throw new Error("Nickname must be at least 2 characters.");
  if (nick.length > 30) throw new Error("Nickname too long (max 30).");
  if (!/^[a-zA-Z0-9 _-]+$/.test(nick)) throw new Error("Nickname can only contain letters, numbers, space, _ and -.");
  if (!email ||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email address.");
  if (!password || password.length < 6) throw new Error("Password must be at least 6 characters.");
  if (password!== confirmPassword) throw new Error("Passwords do not match.");
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: nick });
  await sendEmailVerification(cred.user);
  return syncAuthState(cred.user, true);
}

export async function login({ email, password }) {
  if (!email ||!password) throw new Error("Email and password required.");
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return syncAuthState(cred.user, true);
}

export async function logout() {
  await signOut(auth);
  await syncAuthState(null);
}

export async function resendVerification() {
  if (!auth.currentUser) throw new Error("Not logged in");
  await reload(auth.currentUser);
  if (auth.currentUser.emailVerified) throw new Error("Email already verified.");
  await sendEmailVerification(auth.currentUser);
}

export async function checkEmailVerified() {
  if (!auth.currentUser) return false;
  const user = await syncAuthState(auth.currentUser, true);
  return !!user?.emailVerified;
}

export async function authFetch(url, options = {}) {
  const token = await getIdTokenForced();
  const headers = {...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!headers["Content-Type"] && options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  return fetch(url, {...options, headers });
}

window.CampusFindAuth = { auth, register, login, logout, resendVerification, checkEmailVerified, getCurrentUser, getIdToken, authFetch, onAuthChange };
