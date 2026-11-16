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
// 3. DATA AWAL MASTER SPAREPART & JASA
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

let hasSeededParts = false;

// ==========================================
// 4. DATABASE SERVICE (CLOUD FIRESTORE)
// ==========================================
export const dbService = {
  isCloud: isFirebaseConfigured,

  subscribeServices(callback) {
    let unsub = () => {};
    getFirestoreModule()
      .then(({ db, collection, onSnapshot }) => {
        unsub = onSnapshot(
          collection(db, "services"),
          (snap) => {
            const list = snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            callback(list);
          },
          (err) => {
            console.error("Firestore Services Error:", err);
            alert("Gagal baca data Firestore. Pastikan Firestore Database sudah dibuat & Rules di-set allow read, write.");
          }
        );
      })
      .catch((err) => console.error("Firebase Init Error:", err));

    return () => unsub();
  },

  async addService(data) {
    const { db, collection, addDoc } = await getFirestoreModule();
    return await addDoc(collection(db, "services"), {
      ...data,
      createdAt: Date.now()
    });
  },

  async updateService(id, updates) {
    const { db, doc, updateDoc } = await getFirestoreModule();
    return await updateDoc(doc(db, "services", id), updates);
  },

  async deleteService(id) {
    const { db, doc, deleteDoc } = await getFirestoreModule();
    return await deleteDoc(doc(db, "services", id));
  },

  subscribeParts(callback) {
    let unsub = () => {};
    getFirestoreModule()
      .then(({ db, collection, addDoc, onSnapshot }) => {
        unsub = onSnapshot(
          collection(db, "parts"),
          async (snap) => {
            // Auto-isi data contoh jika collection 'parts' masih kosong melompong
            if (snap.empty && !hasSeededParts) {
              hasSeededParts = true;
              for (const item of DEFAULT_PARTS) {
                await addDoc(collection(db, "parts"), item);
              }
              return;
            }
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            callback(list);
          },
          (err) => {
            console.error("Firestore Parts Error:", err);
          }
        );
      })
      .catch((err) => console.error("Firebase Init Error:", err));

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
  }
};
