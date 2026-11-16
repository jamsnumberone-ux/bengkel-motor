import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================================
// 1. PENGATURAN BENGKEL & KEAMANAN
// ==========================================
export const APP_CONFIG = {
  shopName: "Bengkel Motor Pro",
  adminPin: "1234",
  ownerPin: "9999",
  mechanicCommissionRate: 0.4 // 40% dari total biaya Jasa masuk ke mekanik
};

// ==========================================
// 2. KONFIGURASI FIREBASE FIRESTORE
// Paste config dari Firebase Console lu di bawah ini
// ==========================================
const firebaseConfig = {
  apiKey: "GANTI_DENGAN_API_KEY_KAMU",
  authDomain: "project-kamu.firebaseapp.com",
  projectId: "project-kamu",
  storageBucket: "project-kamu.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

const isFirebaseConfigured =
  firebaseConfig.apiKey && firebaseConfig.apiKey !== "GANTI_DENGAN_API_KEY_KAMU";

let db = null;
if (isFirebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

// ==========================================
// 3. DATA SIMULASI AWAL (JIKA MODE LOCAL DEMO)
// ==========================================
const todayStr = new Date().toISOString().split("T")[0];

const DEFAULT_PARTS = [
  { id: "p1", name: "Oli MPX2 0.8L", type: "part", cost: 43000, price: 58000, stock: 24 },
  { id: "p2", name: "Oli Gardan Matic", type: "part", cost: 12000, price: 20000, stock: 18 },
  { id: "p3", name: "Kampas Rem Depan", type: "part", cost: 35000, price: 55000, stock: 4 },
  { id: "p4", name: "V-Belt + Roller Set", type: "part", cost: 115000, price: 165000, stock: 6 },
  { id: "p5", name: "Jasa Servis Ringan & Injeksi", type: "service", cost: 0, price: 45000, stock: 999 },
  { id: "p6", name: "Jasa Servis CVT", type: "service", cost: 0, price: 35000, stock: 999 },
  { id: "p7", name: "Jasa Ganti Oli & Rem", type: "service", cost: 0, price: 15000, stock: 999 }
];

const DEFAULT_SERVICES = [
  {
    id: "srv-demo-1",
    code: "SRV-101",
    date: todayStr,
    plate: "B 4821 KTZ",
    bike: "Honda Vario 150",
    km: 24500,
    customer: "Rizky Pratama",
    phone: "6281234567890",
    mechanic: "Kang Asep",
    eta: "15:30",
    complaint: "Tarikan awal gredeg, ganti oli mesin",
    status: "Menunggu Konfirmasi",
    stockDeducted: false,
    items: [
      { partId: "p1", name: "Oli MPX2 0.8L", type: "part", cost: 43000, price: 58000, qty: 1, approval: "approved" },
      { partId: "p6", name: "Jasa Servis CVT", type: "service", cost: 0, price: 35000, qty: 1, approval: "approved" },
      { partId: "p3", name: "Kampas Rem Depan", type: "part", cost: 35000, price: 55000, qty: 1, approval: "pending" }
    ]
  },
  {
    id: "srv-demo-2",
    code: "SRV-102",
    date: todayStr,
    plate: "B 6190 VXY",
    bike: "Yamaha NMAX",
    km: 19200,
    customer: "Dian Sastro",
    phone: "6281298765432",
    mechanic: "Mas Dimas",
    eta: "16:15",
    complaint: "Servis berkala & cek rem",
    status: "Dikerjakan",
    stockDeducted: false,
    items: [
      { partId: "p5", name: "Jasa Servis Ringan & Injeksi", type: "service", cost: 0, price: 45000, qty: 1, approval: "approved" }
    ]
  }
];

function getLocal(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
  return JSON.parse(raw);
}

function setLocal(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new Event("local-db-updated"));
}

// ==========================================
// 4. DATABASE SERVICE ADAPTER (FIRESTORE / LOCAL)
// ==========================================
export const dbService = {
  isCloud: isFirebaseConfigured,

  subscribeServices(callback) {
    if (isFirebaseConfigured) {
      const q = query(collection(db, "services"), orderBy("createdAt", "desc"));
      return onSnapshot(q, (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback(list);
      });
    } else {
      const load = () => callback(getLocal("bengkel_services", DEFAULT_SERVICES));
      load();
      window.addEventListener("local-db-updated", load);
      return () => window.removeEventListener("local-db-updated", load);
    }
  },

  async addService(data) {
    if (isFirebaseConfigured) {
      return await addDoc(collection(db, "services"), { ...data, createdAt: Date.now() });
    }
    const list = getLocal("bengkel_services", DEFAULT_SERVICES);
    list.unshift({ id: "srv-" + Date.now(), ...data });
    setLocal("bengkel_services", list);
  },

  async updateService(id, updates) {
    if (isFirebaseConfigured) {
      return await updateDoc(doc(db, "services", id), updates);
    }
    const list = getLocal("bengkel_services", DEFAULT_SERVICES).map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );
    setLocal("bengkel_services", list);
  },

  async deleteService(id) {
    if (isFirebaseConfigured) {
      return await deleteDoc(doc(db, "services", id));
    }
    const list = getLocal("bengkel_services", DEFAULT_SERVICES).filter((item) => item.id !== id);
    setLocal("bengkel_services", list);
  },

  subscribeParts(callback) {
    if (isFirebaseConfigured) {
      return onSnapshot(collection(db, "parts"), (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback(list);
      });
    } else {
      const load = () => callback(getLocal("bengkel_parts", DEFAULT_PARTS));
      load();
      window.addEventListener("local-db-updated", load);
      return () => window.removeEventListener("local-db-updated", load);
    }
  },

  async addPart(data) {
    if (isFirebaseConfigured) {
      return await addDoc(collection(db, "parts"), data);
    }
    const list = getLocal("bengkel_parts", DEFAULT_PARTS);
    list.push({ id: "part-" + Date.now(), ...data });
    setLocal("bengkel_parts", list);
  },

  async updatePart(id, updates) {
    if (isFirebaseConfigured) {
      return await updateDoc(doc(db, "parts", id), updates);
    }
    const list = getLocal("bengkel_parts", DEFAULT_PARTS).map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );
    setLocal("bengkel_parts", list);
  },

  async deletePart(id) {
    if (isFirebaseConfigured) {
      return await deleteDoc(doc(db, "parts", id));
    }
    const list = getLocal("bengkel_parts", DEFAULT_PARTS).filter((item) => item.id !== id);
    setLocal("bengkel_parts", list);
  }
};
