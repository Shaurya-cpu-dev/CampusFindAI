import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onIdTokenChanged,
  updateProfile,
  sendEmailVerification,
  reload
} from "firebase/auth";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

let currentUser = null;
let idToken = null;
const listeners = new Set();

function notify() {
  listeners.forEach(cb => {
    try { cb(currentUser, idToken); } catch (e) { console.error("Auth listener error", e); }
  });
}

onIdTokenChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    try {
      await reload(user);
    } catch {}
    try {
      idToken = await user.getIdToken();
    } catch {
      idToken = null;
    }
  } else {
    idToken = null;
  }
  notify();
});

export function onAuth(cb) {
  listeners.add(cb);
  cb(currentUser, idToken);
  return () => listeners.delete(cb);
}

export function getCurrentUser() { return currentUser; }
export function getIdToken() { return idToken; }

export async function getIdTokenForced() {
  if (!auth.currentUser) return null;
  idToken = await auth.currentUser.getIdToken(true);
  return idToken;
}

export async function authFetch(url, options = {}) {
  const token = await getIdTokenForced();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }
  return fetch(url, { ...options, headers });
}

export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function registerUser({ nickname, email, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (nickname) {
    await updateProfile(cred.user, { displayName: nickname });
  }
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function logoutUser() {
  await signOut(auth);
}

export async function resendVerificationEmail() {
  if (!auth.currentUser) throw new Error("No user logged in");
  await sendEmailVerification(auth.currentUser);
}
