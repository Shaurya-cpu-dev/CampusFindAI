// CampusFind AI - Firebase Auth Module (browser SDK, module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
  reload
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let currentUser = null;
let idToken = null;
let listeners = [];

function notifyAuthListeners(user) {
  listeners.forEach(cb => cb(user));
}

async function refreshToken() {
  if (!auth.currentUser) { idToken = null; return null; }
  try {
    idToken = await auth.currentUser.getIdToken(true);
    return idToken;
  } catch (e) {
    console.error("Failed to refresh token", e);
    return null;
  }
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    try { await reload(user); } catch {}
    idToken = await user.getIdToken();
  } else {
    idToken = null;
  }
  notifyAuthListeners(user);
  window.dispatchEvent(new CustomEvent("campusfind-auth-changed", { detail: { user } }));
});

export function onAuthChange(cb) {
  listeners.push(cb);
  if (currentUser!== undefined) cb(currentUser);
}
export function getCurrentUser() { return currentUser; }
export function getIdToken() { return idToken; }
export async function getIdTokenForced() {
  if (!auth.currentUser) return null;
  idToken = await auth.currentUser.getIdToken(true);
  return idToken;
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
  await refreshToken();
  return cred.user;
}

export async function login({ email, password }) {
  if (!email ||!password) throw new Error("Email and password required.");
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await reload(cred.user);
  await refreshToken();
  return cred.user;
}

export async function logout() {
  await signOut(auth);
  currentUser = null;
  idToken = null;
  notifyAuthListeners(null);
}

export async function resendVerification() {
  if (!auth.currentUser) throw new Error("Not logged in");
  await reload(auth.currentUser);
  if (auth.currentUser.emailVerified) throw new Error("Email already verified.");
  await sendEmailVerification(auth.currentUser);
}

export async function checkEmailVerified() {
  if (!auth.currentUser) return false;
  await reload(auth.currentUser);
  await refreshToken();
  return!!auth.currentUser.emailVerified;
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