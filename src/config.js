// ═══════════════════════════════════════════════════════════════
// CONFIGURATION — Fill in your Firebase + OAuth credentials
// ═══════════════════════════════════════════════════════════════
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAEWlsy09Xhw0XMcTauGw9Hw_2lSn_GlYI",
  authDomain: "kinetix-crm.firebaseapp.com",
  databaseURL: "https://kinetix-crm-default-rtdb.firebaseio.com",
  projectId: "kinetix-crm",
  storageBucket: "kinetix-crm.firebasestorage.app",
  messagingSenderId: "237587368689",
  appId: "1:237587368689:web:057f7df683ca5bfa463750"
};

// Gmail API — create at console.cloud.google.com → APIs → Gmail API → OAuth 2.0 Client ID (Web)
export const GMAIL_CLIENT_ID = '237587368689-el02uv5n88eajgriee29q0jgms7vn8kr.apps.googleusercontent.com';
// Microsoft Graph — register at portal.azure.com → App registrations → SPA redirect
export const AZURE_CLIENT_ID = 'd15eea69-a75a-4022-bb50-7de0b6253e97';
export const AZURE_TENANT = '99d791ae-d620-4252-8a2e-19883a2e2af5'; // Kinetix M365 tenant (app is single-tenant, /common not allowed)

// Allowed user emails (Firebase Auth). Leave empty = anyone can sign in.
export const ALLOWED_EMAILS = ['leif.berger26@gmail.com','tommy@kinetix-industries.com','leif@kinetixcap.com'];
