// ==========================================
// 1. PENGATURAN BENGKEL & KEAMANAN
// ==========================================
export const APP_CONFIG = {
  shopName: "Bengkel Motor Pro",
  adminPin: "1234",
  ownerPin: "9999",
  defaultCommissionRate: 0.4
};

// ==========================================
// 2. KONFIGURASI FIREBASE PROJECT KAMU
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDot4MgQNCb9aLIP6bHasUaesI1ta81chk",
  authDomain: "bengkel-motor-a2d8f.firebaseapp.com",
  projectId: "bengkel-motor-a2d8f",
  storageBucket: "bengkel-motor-a2d8f.firebasestorage.app",
  messagingSenderId: "67444699116",
  appId: "1:67444699116:web:45e390029ddf53caee1ac9",
  measurementId: "G-PFWTS6GX91"
};

const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let firestorePromise = null;
function getFirestoreModule() {
  if (!firestorePromise) {
    firestorePromise = (async () => {
      const { initializeApp } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"
      );
      const fs = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
      );
      const app = initializeApp(firebaseConfig);
      const db = fs.getFirestore(app);
      return { db, ...fs };
    })();
  }
  return firestorePromise;
}

// ==========================================
// 3. DATA SEED AWAL (OTOMATIS JIKA MASIH KOSONG)
// ==========================================
const DEFAULT_PARTS = [
  { name: "Oli MPX2 0.8L", type: "part", cost: 43000, price: 58000, stock: 24 },
  { name: "Oli Gardan Matic", type: "part", cost: 12000, price: 20000, stock: 18 },
  { name: "Kampas Rem Depan", type: "part", cost: 35000, price: 55000, stock: 4 },
  { name: "V-Belt + Roller Set", type: "part", cost: 115000, price: 165000, stock: 6 },
  { name: "Jasa Servis Ringan & Injeksi", type: "service", cost: 0, price: 45000, stock: 999 },
  { name: "Jasa Servis CVT", type: "service", cost: 0, price: 35000, stock: 999 },
  { name: "Jasa Ganti Oli & Rem", type: "service", cost: 0, price: 15000, stock: 999 }
];

const DEFAULT_MECHANICS = [
  { name: "Kang Asep", commissionRate: 0.4, active: true },
  { name: "Mas Dimas", commissionRate: 0.4, active: true },
  { name: "Bang Rendi", commissionRate: 0.35, active: true }
];

let hasSeededParts = false;
let hasSeededMechanics = false;

// ==========================================
// 4. DATABASE SERVICE (CLOUD FIRESTORE)
// ==========================================
export const dbService = {
  isCloud: isFirebaseConfigured,

  // --- SERVICES ---
  subscribeServices(callback) {
    let unsub = () => {};
    getFirestoreModule().then(({ db, collection, onSnapshot }) => {
      unsub = onSnapshot(collection(db, "services"), (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        callback(list);
      });
    });
    return () => unsub();
  },
  async addService(data) {
    const { db, collection, addDoc } = await getFirestoreModule();
    return await addDoc(collection(db, "services"), { ...data, createdAt: Date.now() });
  },
  async updateService(id, updates) {
    const { db, doc, updateDoc } = await getFirestoreModule();
    return await updateDoc(doc(db, "services", id), updates);
  },
  async deleteService(id) {
    const { db, doc, deleteDoc } = await getFirestoreModule();
    return await deleteDoc(doc(db, "services", id));
  },

  // --- PARTS ---
  subscribeParts(callback) {
    let unsub = () => {};
    getFirestoreModule().then(({ db, collection, addDoc, onSnapshot }) => {
      unsub = onSnapshot(collection(db, "parts"), async (snap) => {
        if (snap.empty && !hasSeededParts) {
          hasSeededParts = true;
          for (const item of DEFAULT_PARTS) await addDoc(collection(db, "parts"), item);
          return;
        }
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    });
    return () => unsub();
  },
  async addPart(data) {
    const { db, collection, addDoc } = await getFirestoreModule();
    return await addDoc(collection(db, "parts"), data);
  },
  async updatePart(id, updates) {
    const { db, doc, updateDoc } = await getFirestoreModule();
    return await updateDoc(doc(db, "parts", id), updates);
  },
  async deletePart(id) {
    const { db, doc, deleteDoc } = await getFirestoreModule();
    return await deleteDoc(doc(db, "parts", id));
  },

  // --- MECHANICS ---
  subscribeMechanics(callback) {
    let unsub = () => {};
    getFirestoreModule().then(({ db, collection, addDoc, onSnapshot }) => {
      unsub = onSnapshot(collection(db, "mechanics"), async (snap) => {
        if (snap.empty && !hasSeededMechanics) {
          hasSeededMechanics = true;
          for (const m of DEFAULT_MECHANICS) await addDoc(collection(db, "mechanics"), m);
          return;
        }
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    });
    return () => unsub();
  },
  async addMechanic(data) {
    const { db, collection, addDoc } = await getFirestoreModule();
    return await addDoc(collection(db, "mechanics"), data);
  },
  async updateMechanic(id, updates) {
    const { db, doc, updateDoc } = await getFirestoreModule();
    return await updateDoc(doc(db, "mechanics", id), updates);
  },
  async deleteMechanic(id) {
    const { db, doc, deleteDoc } = await getFirestoreModule();
    return await deleteDoc(doc(db, "mechanics", id));
  },

  // --- EXPENSES (KAS KELUAR) ---
  subscribeExpenses(callback) {
    let unsub = () => {};
    getFirestoreModule().then(({ db, collection, onSnapshot }) => {
      unsub = onSnapshot(collection(db, "expenses"), (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        callback(list);
      });
    });
    return () => unsub();
  },
  async addExpense(data) {
    const { db, collection, addDoc } = await getFirestoreModule();
    return await addDoc(collection(db, "expenses"), { ...data, createdAt: Date.now() });
  },
  async deleteExpense(id) {
    const { db, doc, deleteDoc } = await getFirestoreModule();
    return await deleteDoc(doc(db, "expenses", id));
  },

  // --- DIRECT SALES (BELI PUTUS) ---
  subscribeDirectSales(callback) {
    let unsub = () => {};
    getFirestoreModule().then(({ db, collection, onSnapshot }) => {
      unsub = onSnapshot(collection(db, "direct_sales"), (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        callback(list);
      });
    });
    return () => unsub();
  },
  async addDirectSale(data) {
    const { db, collection, addDoc } = await getFirestoreModule();
    return await addDoc(collection(db, "direct_sales"), { ...data, createdAt: Date.now() });
  },
  async deleteDirectSale(id) {
    const { db, doc, deleteDoc } = await getFirestoreModule();
    return await deleteDoc(doc(db, "direct_sales", id));
  }
};
