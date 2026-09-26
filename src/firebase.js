import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBUOUDJaobn-WYzFa_m0aaK32WjTx-6Rvg",
  authDomain: "smart-medicine-cabinet-e7c26.firebaseapp.com",
  databaseURL:
    "https://smart-medicine-cabinet-e7c26-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smart-medicine-cabinet-e7c26",
  storageBucket: "smart-medicine-cabinet-e7c26.firebasestorage.app",
  messagingSenderId: "743883180936",
  appId: "1:743883180936:web:75be6cdffa0d837223c83d",
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);
export const auth = getAuth(app);
