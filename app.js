import { APP_CONFIG, dbService } from "./firebase-config.js";

// State Global
let services = [];
let parts = [];
let mechanics = [];
let expenses = [];
let directSales = [];
let posCart = [];

let pendingRole = null;
let adminFilter = "all";
let ownerPeriod = "today";
let activeTrackQuery = "";

const STATUS_FLOW = ["Antre", "Dicek", "Menunggu Konfirmasi", "Dikerjakan", "Selesai"];
const todayStr = new Date().toISOString().split("T")[0];
const monthPrefix = todayStr.slice(0, 7); // YYYY-MM

const formatRp = (num) => "Rp " + Number(num || 0).toLocaleString("id-ID");

function normalizePhone(phone) {
  let clean = String(phone || "").replace(/\D/g, "");
  if (clean.startsWith("0")) clean = "62" + clean.slice(1);
  return clean;
}

function isDateInOwnerPeriod(dateStr) {
  if (!dateStr) return false;
  if (ownerPeriod === "today") return dateStr === todayStr;
  if (ownerPeriod === "month") return dateStr.startsWith(monthPrefix);
  if (ownerPeriod === "custom") {
    const start = document.getElementById("owner-date-start").value;
    const end = document.getElementById("owner-date-end").value;
    if (start && dateStr < start) return false;
    if (end && dateStr > end) return false;
    return true;
  }
  return true;
}

// ==========================================
// INISIALISASI APLIKASI
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("nav-shop-name").textContent = APP_CONFIG.shopName;
  document.getElementById("exp-date").value = todayStr;
  document.getElementById("owner-date-start").value = todayStr;
  document.getElementById("owner-date-end").value = todayStr;

  const badge = document.getElementById("storage-mode-badge");
  if (dbService.isCloud) {
    badge.textContent = "Cloud Sync (Firebase)";
    badge.className = "text-[11px] text-emerald-400";
  }

  // Subscribe Real-time Collections
  dbService.subscribeParts((data) => {
    parts = data;
    renderPartDropdowns();
    renderOwnerCatalog();
  });

  dbService.subscribeMechanics((data) => {
    mechanics = data;
    renderMechanicSelects();
    renderOwnerMechanicsManage();
    renderOwnerFinanceAndMetrics();
  });

  dbService.subscribeServices((data) => {
    services = data;
    renderAdminDashboard();
    renderHistoryAndReminders();
    renderOwnerFinanceAndMetrics();
    if (activeTrackQuery) renderCustomerTracking(activeTrackQuery);
  });

  dbService.subscribeExpenses((data) => {
    expenses = data;
    renderOwnerFinanceAndMetrics();
  });

  dbService.subscribeDirectSales((data) => {
    directSales = data;
    renderPosHistory();
    renderOwnerFinanceAndMetrics();
  });

  // Cek parameter link tracking (?track=SRV-101)
  const trackParam = new URLSearchParams(window.location.search).get("track");
  if (trackParam) {
    document.getElementById("input-track-query").value = trackParam;
    activeTrackQuery = trackParam.trim().toUpperCase();
    setTimeout(() => renderCustomerTracking(activeTrackQuery), 400);
  }

  setupEventListeners();
});

// ==========================================
// NAVIGASI ROLE & SUB-TAB
// ==========================================
window.switchRole = function (role) {
  ["customer", "admin", "owner"].forEach((r) => {
    document.getElementById(`view-${r}`).classList.toggle("hidden", r !== role);
    document.getElementById(`tab-${r}`).classList.toggle("active", r === role);
  });
};

window.requestRoleAccess = function (targetRole) {
  if (sessionStorage.getItem(`unlocked_${targetRole}`) === "true") {
    switchRole(targetRole);
    return;
  }
  pendingRole = targetRole;
  document.getElementById("pin-modal-title").textContent =
    targetRole === "owner" ? "Login Dashboard Owner" : "Login Panel Admin";
  document.getElementById("input-pin").value = "";
  openModal("modal-pin");
};

window.switchAdminSubTab = function (sub, btnEl) {
  ["queue", "pos", "history"].forEach((s) => {
    document.getElementById(`admin-sub-${s}`).classList.toggle("hidden", s !== sub);
  });
  document.querySelectorAll(".admin-subtab").forEach((b) => {
    b.classList.remove("active");
    b.classList.add("text-slate-600");
  });
  btnEl.classList.add("active");
  btnEl.classList.remove("text-slate-600");
};

window.switchOwnerSubTab = function (sub, btnEl) {
  ["finance", "catalog", "mechanics"].forEach((s) => {
    document.getElementById(`owner-sub-${s}`).classList.toggle("hidden", s !== sub);
  });
  document.querySelectorAll(".owner-subtab").forEach((b) => {
    b.classList.remove("active");
    b.classList.add("text-slate-600");
  });
  btnEl.classList.add("active");
  btnEl.classList.remove("text-slate-600");
};

window.openModal = (id) => {
  const el = document.getElementById(id);
  el.classList.remove("hidden");
  el.classList.add("flex");
};

window.closeModal = (id) => {
  const el = document.getElementById(id);
  el.classList.add("hidden");
  el.classList.remove("flex");
};

// ==========================================
// EVENT LISTENERS SEMUA FORM
// ==========================================
function setupEventListeners() {
  // PIN Login
  document.getElementById("form-pin").addEventListener("submit", (e) => {
    e.preventDefault();
    const pin = document.getElementById("input-pin").value;
    const validPin = pendingRole === "owner" ? APP_CONFIG.ownerPin : APP_CONFIG.adminPin;
    if (pin === validPin) {
      sessionStorage.setItem(`unlocked_${pendingRole}`, "true");
      closeModal("modal-pin");
      switchRole(pendingRole);
    } else {
      alert("PIN salah!");
    }
  });

  // Tracking Customer
  document.getElementById("form-track").addEventListener("submit", (e) => {
    e.preventDefault();
    activeTrackQuery = document.getElementById("input-track-query").value.trim().toUpperCase();
    renderCustomerTracking(activeTrackQuery);
  });

  // Auto-isi Riwayat Plat Nomor
  document.getElementById("srv-plate").addEventListener("input", (e) => {
    const val = e.target.value.trim().toUpperCase();
    const hintBox = document.getElementById("plate-history-hint");
    if (val.length < 4) {
      hintBox.classList.add("hidden");
      return;
    }
    const prev = services.find((s) => s.plate.replace(/\s+/g, "") === val.replace(/\s+/g, ""));
    if (prev) {
      document.getElementById("srv-bike").value = prev.bike;
      document.getElementById("srv-customer").value = prev.customer;
      document.getElementById("srv-phone").value = prev.phone;
      document.getElementById("plate-history-text").textContent = `Terakhir: ${prev.date} (${prev.km || "-"} KM)`;
      document.getElementById("btn-view-plate-hint").onclick = () => openPlateHistoryModal(prev.plate);
      hintBox.classList.remove("hidden");
    } else {
      hintBox.classList.add("hidden");
    }
  });

  // Pendaftaran Servis Baru
  document.getElementById("form-new-service").addEventListener("submit", async (e) => {
    e.preventDefault();
    const mechName = document.getElementById("srv-mechanic").value;
    const mechObj = mechanics.find((m) => m.name === mechName);
    const randomNum = Math.floor(100 + Math.random() * 900);

    await dbService.addService({
      code: `SRV-${randomNum}`,
      date: todayStr,
      plate: document.getElementById("srv-plate").value.trim().toUpperCase(),
      bike: document.getElementById("srv-bike").value.trim(),
      km: Number(document.getElementById("srv-km").value) || 0,
      nextKm: 0,
      customer: document.getElementById("srv-customer").value.trim(),
      phone: normalizePhone(document.getElementById("srv-phone").value),
      mechanic: mechName,
      mechanicCommissionRate: mechObj ? Number(mechObj.commissionRate) : APP_CONFIG.defaultCommissionRate,
      eta: document.getElementById("srv-eta").value,
      complaint: document.getElementById("srv-complaint").value.trim(),
      status: "Antre",
      paymentStatus: "unpaid",
      paymentMethod: "",
      stockDeducted: false,
      items: []
    });

    e.target.reset();
    document.getElementById("plate-history-hint").classList.add("hidden");
  });

  // Tambah Part/Jasa ke Motor (Katalog maupun Manual Belanja Luar)
  document.getElementById("form-add-service-item").addEventListener("submit", async (e) => {
    e.preventDefault();
    const srvId = document.getElementById("modal-service-id").value;
    const mode = document.getElementById("add-item-mode").value;
    const qty = Number(document.getElementById("input-item-qty").value) || 1;
    const approval = document.getElementById("input-item-approval").value;

    const srv = services.find((s) => s.id === srvId);
    if (!srv) return;

    let newItem = null;
    if (mode === "catalog") {
      const partId = document.getElementById("select-master-part").value;
      const part = parts.find((p) => p.id === partId);
      if (!part) return;
      newItem = {
        uid: "itm-" + Date.now(),
        partId: part.id,
        name: part.name,
        type: part.type,
        cost: part.cost,
        price: part.price,
        qty,
        approval
      };
    } else {
      const manualName = document.getElementById("manual-item-name").value.trim();
      if (!manualName) return alert("Isi nama barang/jasa terlebih dahulu.");
      newItem = {
        uid: "itm-" + Date.now(),
        partId: "manual",
        name: manualName + " [Luar]",
        type: document.getElementById("manual-item-type").value,
        cost: Number(document.getElementById("manual-item-cost").value) || 0,
        price: Number(document.getElementById("manual-item-price").value) || 0,
        qty,
        approval
      };
    }

    const updatedItems = [...(srv.items || []), newItem];
    const updates = { items: updatedItems };
    if (approval === "pending") updates.status = "Menunggu Konfirmasi";

    await dbService.updateService(srvId, updates);
    document.getElementById("manual-item-name").value = "";
    closeModal("modal-add-item");
  });

  // Pelunasan Kasir Servis
  document.getElementById("form-payment").addEventListener("submit", async (e) => {
    e.preventDefault();
    const srvId = document.getElementById("pay-service-id").value;
    const srv = services.find((s) => s.id === srvId);
    if (!srv) return;

    await deductStockIfNeeded(srv);

    await dbService.updateService(srvId, {
      status: "Selesai",
      paymentStatus: "paid",
      paymentMethod: document.getElementById("pay-method").value,
      nextKm: Number(document.getElementById("pay-next-km").value) || 0,
      paidDate: todayStr,
      stockDeducted: true
    });
    closeModal("modal-payment");
  });

  // Checkout Beli Putus Sparepart
  document.getElementById("form-pos-checkout").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (posCart.length === 0) return alert("Keranjang belanja masih kosong!");

    const totalRevenue = posCart.reduce((s, i) => s + i.price * i.qty, 0);
    const totalCost = posCart.reduce((s, i) => s + i.cost * i.qty, 0);

    // Potong Stok Master Part
    for (const item of posCart) {
      const master = parts.find((p) => p.id === item.partId);
      if (master && master.type === "part") {
        await dbService.updatePart(master.id, {
          stock: Math.max(0, Number(master.stock) - Number(item.qty))
        });
      }
    }

    await dbService.addDirectSale({
      date: todayStr,
      customer: document.getElementById("pos-customer").value.trim() || "Walk-in Customer",
      paymentMethod: document.getElementById("pos-payment-method").value,
      items: posCart,
      total: totalRevenue,
      totalCost
    });

    posCart = [];
    renderPosCart();
    e.target.reset();
    alert("Transaksi beli putus berhasil & stok terpotong!");
  });

  // Tambah Master Part (Owner)
  document.getElementById("form-new-part").addEventListener("submit", async (e) => {
    e.preventDefault();
    await dbService.addPart({
      name: document.getElementById("part-name").value.trim(),
      type: document.getElementById("part-type").value,
      stock: Number(document.getElementById("part-stock").value) || 0,
      cost: Number(document.getElementById("part-cost").value) || 0,
      price: Number(document.getElementById("part-price").value) || 0
    });
    e.target.reset();
    closeModal("modal-part");
  });

  // Tambah Mekanik Baru (Owner)
  document.getElementById("form-new-mechanic").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ratePct = Number(document.getElementById("mech-rate").value) || 0;
    await dbService.addMechanic({
      name: document.getElementById("mech-name").value.trim(),
      commissionRate: ratePct / 100,
      active: true
    });
    e.target.reset();
  });

  // Tambah Pengeluaran Kas (Owner)
  document.getElementById("form-new-expense").addEventListener("submit", async (e) => {
    e.preventDefault();
    await dbService.addExpense({
      title: document.getElementById("exp-title").value.trim(),
      amount: Number(document.getElementById("exp-amount").value) || 0,
      category: document.getElementById("exp-category").value,
      date: document.getElementById("exp-date").value || todayStr
    });
    document.getElementById("exp-title").value = "";
    document.getElementById("exp-amount").value = "";
  });
}

// ==========================================
// HELPER POTONG STOK OTOMATIS
// ==========================================
async function deductStockIfNeeded(srv) {
  if (srv.stockDeducted) return;
  const approvedParts = (srv.items || []).filter(
    (i) => i.type === "part" && i.approval === "approved" && i.partId !== "manual"
  );
  for (const item of approvedParts) {
    const master = parts.find((p) => p.id === item.partId);
    if (master) {
      const newStock = Math.max(0, Number(master.stock) - Number(item.qty));
      await dbService.updatePart(master.id, { stock: newStock });
    }
  }
}

// ==========================================
// 1. RENDER TRACKING CUSTOMER
// ==========================================
function renderCustomerTracking(queryStr) {
  const container = document.getElementById("customer-result");
  container.classList.remove("hidden");

  const cleanQuery = queryStr.replace(/\s+/g, "");
  const match = services.find(
    (s) =>
      s.code.toUpperCase() === queryStr ||
      s.plate.replace(/\s+/g, "").toUpperCase() === cleanQuery
  );

  if (!match) {
    container.innerHTML = `
      <div class="bg-white p-6 rounded-2xl border border-rose-200 text-center">
        <p class="font-bold text-rose-600">Data servis tidak ditemukan</p>
        <p class="text-xs text-slate-500 mt-1">Pastikan Plat Nomor atau Kode Servis sesuai dengan struk pendaftaran.</p>
      </div>`;
    return;
  }

  const currentIdx = STATUS_FLOW.indexOf(match.status);
  const activeItems = (match.items || []).filter((i) => i.approval !== "rejected");
  const totalBiaya = activeItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const pendingItems = (match.items || []).filter((i) => i.approval === "pending");

  container.innerHTML = `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div class="bg-slate-900 text-white p-5 flex flex-wrap justify-between items-center gap-2">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-amber-400 font-mono font-bold">${match.code}</span>
            ${
              match.paymentStatus === "paid"
                ? `<span class="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] px-2 py-0.5 rounded-full font-bold">LUNAS (${match.paymentMethod})</span>`
                : `<span class="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] px-2 py-0.5 rounded-full font-bold">BELUM BAYAR</span>`
            }
          </div>
          <h3 class="text-xl font-bold mt-0.5">${match.plate} — ${match.bike}</h3>
          <p class="text-xs text-slate-300">Mekanik: ${match.mechanic} • Estimasi Selesai: <b>${match.eta || "-"}</b></p>
        </div>
        <span class="px-3 py-1 rounded-full text-xs font-bold badge-${match.status}">${match.status}</span>
      </div>

      <!-- Stepper -->
      <div class="p-5 border-b border-slate-100">
        <div class="flex justify-between">
          ${STATUS_FLOW.map((step, idx) => {
            const isDone = idx <= currentIdx;
            return `
              <div class="step-item ${idx < currentIdx ? "completed" : ""}">
                <div class="relative z-10 w-7 h-7 mx-auto rounded-full flex items-center justify-center text-xs font-bold ${
                  isDone ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                }">
                  ${idx < currentIdx ? '<i class="fa-solid fa-check"></i>' : idx + 1}
                </div>
                <p class="text-[10px] sm:text-xs mt-1.5 font-medium ${isDone ? "text-slate-900" : "text-slate-400"}">${step}</p>
              </div>`;
          }).join("")}
        </div>
      </div>

      <!-- Konfirmasi Part Tambahan -->
      ${
        pendingItems.length > 0
          ? `<div class="bg-amber-50 border-b border-amber-200 p-4 space-y-3">
              <p class="font-bold text-xs sm:text-sm text-amber-900">
                <i class="fa-solid fa-triangle-exclamation text-amber-600 mr-1"></i> Konfirmasi Penggantian Sparepart Tambahan:
              </p>
              <div class="space-y-2">
                ${pendingItems
                  .map(
                    (item, idx) => `
                  <div class="bg-white p-3 rounded-xl border border-amber-200 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p class="font-bold text-sm text-slate-900">${item.name} (${item.qty}x)</p>
                      <p class="text-xs text-slate-600">${formatRp(item.price * item.qty)}</p>
                    </div>
                    <div class="flex gap-2">
                      <button onclick="customerRespondItem('${match.id}', '${item.uid || item.partId}', 'rejected')"
                        class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-100 text-rose-700">Tolak</button>
                      <button onclick="customerRespondItem('${match.id}', '${item.uid || item.partId}', 'approved')"
                        class="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white">Setuju Ganti</button>
                    </div>
                  </div>`
                  )
                  .join("")}
              </div>
            </div>`
          : ""
      }

      <!-- Rincian Biaya -->
      <div class="p-5 space-y-3">
        <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Rincian Sparepart & Jasa</p>
        ${
          activeItems.length === 0
            ? `<p class="text-sm text-slate-500 italic">Belum ada rincian sparepart/jasa.</p>`
            : `<ul class="divide-y divide-slate-100 text-sm">
                ${activeItems
                  .map(
                    (i) => `
                  <li class="py-2 flex justify-between items-center">
                    <div>
                      <span class="font-medium text-slate-800">${i.name}</span>
                      <span class="text-xs text-slate-500 ml-1">(${i.qty}x)</span>
                      ${i.approval === "pending" ? '<span class="ml-1 text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">Menunggu ACC</span>' : ""}
                    </div>
                    <span class="font-semibold text-slate-900">${formatRp(i.price * i.qty)}</span>
                  </li>`
                  )
                  .join("")}
              </ul>`
        }
        <div class="pt-3 border-t border-slate-200 flex justify-between items-center">
          <span class="font-bold text-slate-700">Total Biaya</span>
          <span class="text-lg font-extrabold text-slate-900">${formatRp(totalBiaya)}</span>
        </div>
        ${
          match.nextKm
            ? `<div class="bg-blue-50 text-blue-800 text-xs p-3 rounded-xl font-medium">
                <i class="fa-solid fa-gauge-high mr-1"></i> Rekomendasi servis / ganti oli berikutnya pada <b>${Number(match.nextKm).toLocaleString("id-ID")} KM</b>.
              </div>`
            : ""
        }
      </div>
    </div>`;
}

window.customerRespondItem = async function (serviceId, itemKey, decision) {
  const srv = services.find((s) => s.id === serviceId);
  if (!srv) return;
  const updatedItems = srv.items.map((item) =>
    (item.uid === itemKey || item.partId === itemKey) && item.approval === "pending"
      ? { ...item, approval: decision }
      : item
  );
  const stillPending = updatedItems.some((i) => i.approval === "pending");
  await dbService.updateService(serviceId, {
    items: updatedItems,
    status: stillPending ? "Menunggu Konfirmasi" : "Dikerjakan"
  });
};

// ==========================================
// 2. RENDER PANEL ADMIN (ANTREAN, POS, RIWAYAT)
// ==========================================
function renderMechanicSelects() {
  const sel = document.getElementById("srv-mechanic");
  if (!sel) return;
  const activeMechs = mechanics.filter((m) => m.active !== false);
  sel.innerHTML = activeMechs.length
    ? activeMechs.map((m) => `<option value="${m.name}">${m.name}</option>`).join("")
    : `<option value="Mekanik Umum">Mekanik Umum</option>`;
}

function renderPartDropdowns() {
  const catalogSel = document.getElementById("select-master-part");
  const posSel = document.getElementById("pos-part-select");
  if (catalogSel) {
    catalogSel.innerHTML = parts
      .map(
        (p) =>
          `<option value="${p.id}">${p.name} — ${formatRp(p.price)} ${
            p.type === "part" ? `(Stok: ${p.stock})` : "[Jasa]"
          }</option>`
      )
      .join("");
  }
  if (posSel) {
    posSel.innerHTML = parts
      .filter((p) => p.type === "part")
      .map((p) => `<option value="${p.id}">${p.name} — ${formatRp(p.price)} (Stok: ${p.stock})</option>`)
      .join("");
  }
}

window.setAdminFilter = function (filter, btnEl) {
  adminFilter = filter;
  document.querySelectorAll(".filter-chip").forEach((btn) => {
    btn.classList.remove("active");
    btn.classList.add("bg-slate-100", "text-slate-700");
  });
  btnEl.classList.add("active");
  btnEl.classList.remove("bg-slate-100", "text-slate-700");
  renderAdminDashboard();
};

function renderAdminDashboard() {
  const todayServices = services.filter((s) => s.date === todayStr);
  document.getElementById("stat-admin-total").textContent = todayServices.length;
  document.getElementById("stat-admin-queue").textContent = todayServices.filter((s) =>
    ["Antre", "Dicek", "Menunggu Konfirmasi"].includes(s.status)
  ).length;
  document.getElementById("stat-admin-progress").textContent = todayServices.filter(
    (s) => s.status === "Dikerjakan"
  ).length;
  document.getElementById("stat-admin-done").textContent = todayServices.filter(
    (s) => s.status === "Selesai"
  ).length;
  document.getElementById("stat-admin-unpaid").textContent = services.filter(
    (s) => s.paymentStatus !== "paid"
  ).length;

  let filtered = services;
  if (adminFilter === "active") filtered = services.filter((s) => s.status !== "Selesai");
  else if (adminFilter === "unpaid") filtered = services.filter((s) => s.paymentStatus !== "paid");
  else if (adminFilter === "paid") filtered = services.filter((s) => s.paymentStatus === "paid");

  const listEl = document.getElementById("admin-service-list");
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="bg-white p-8 rounded-2xl border border-slate-200 text-center text-sm text-slate-500">Tidak ada data servis di kategori ini.</div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((srv) => {
      const approvedItems = (srv.items || []).filter((i) => i.approval !== "rejected");
      const total = approvedItems.reduce((sum, i) => sum + i.price * i.qty, 0);
      const isPaid = srv.paymentStatus === "paid";

      return `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
        <div class="flex flex-wrap justify-between items-start gap-2">
          <div>
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-xs font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-700">${srv.code}</span>
              <h4 class="font-bold text-base text-slate-900">${srv.plate} • ${srv.bike}</h4>
              <button onclick="openPlateHistoryModal('${srv.plate}')" class="text-[11px] text-blue-600 hover:underline font-semibold">
                [Riwayat]
              </button>
              ${
                isPaid
                  ? `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">LUNAS • ${srv.paymentMethod}</span>`
                  : `<span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full">BELUM BAYAR</span>`
              }
            </div>
            <p class="text-xs text-slate-500 mt-1">
              Customer: <b>${srv.customer}</b> (${srv.phone}) • Mekanik: <b>${srv.mechanic}</b> • KM: ${srv.km || "-"}
            </p>
            <p class="text-xs text-slate-600 mt-1 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
              Keluhan: ${srv.complaint}
            </p>
          </div>

          <select onchange="changeServiceStatus('${srv.id}', this.value)"
            class="text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer badge-${srv.status}">
            ${STATUS_FLOW.map((st) => `<option value="${st}" ${srv.status === st ? "selected" : ""}>${st}</option>`).join("")}
          </select>
        </div>

        <!-- Rincian Part & Jasa -->
        <div class="border-t border-slate-100 pt-3">
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs font-bold text-slate-500">Kebutuhan Sparepart & Jasa:</span>
            <button onclick="openAddItemModal('${srv.id}')" class="text-xs font-bold text-amber-600 hover:text-amber-700">
              + Tambah Part / Jasa
            </button>
          </div>
          ${
            (srv.items || []).length === 0
              ? `<p class="text-xs text-slate-400 italic">Belum ada item ditambahkan.</p>`
              : `<div class="space-y-1.5">
                  ${srv.items
                    .map(
                      (item, idx) => `
                    <div class="flex justify-between items-center text-xs bg-slate-50 px-3 py-1.5 rounded-lg">
                      <div>
                        <span class="font-medium ${item.approval === "rejected" ? "line-through text-slate-400" : "text-slate-800"}">
                          ${item.name} (${item.qty}x)
                        </span>
                        ${
                          item.approval === "pending"
                            ? '<span class="ml-1 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-semibold">Menunggu ACC</span>'
                            : item.approval === "rejected"
                            ? '<span class="ml-1 bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded text-[10px]">Ditolak</span>'
                            : ""
                        }
                      </div>
                      <div class="flex items-center gap-3">
                        <span class="font-semibold">${formatRp(item.price * item.qty)}</span>
                        <button onclick="removeServiceItem('${srv.id}', ${idx})" class="text-rose-500 hover:text-rose-700">
                          <i class="fa-solid fa-trash-can"></i>
                        </button>
                      </div>
                    </div>`
                    )
                    .join("")}
                </div>`
          }
        </div>

        <!-- Footer Aksi -->
        <div class="border-t border-slate-100 pt-3 flex flex-wrap justify-between items-center gap-2">
          <div>
            <span class="text-xs text-slate-500">Total:</span>
            <span class="text-base font-extrabold text-slate-900 ml-1">${formatRp(total)}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            ${
              !isPaid
                ? `<button onclick="openPaymentModal('${srv.id}')"
                    class="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl">
                    <i class="fa-solid fa-cash-register mr-1"></i> Bayar / Lunas
                  </button>`
                : ""
            }
            <button onclick="sendWhatsAppUpdate('${srv.id}')"
              class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5">
              <i class="fa-brands fa-whatsapp text-sm"></i> ${isPaid ? "Struk Lunas WA" : "Tracking WA"}
            </button>
            <button onclick="deleteServiceOrder('${srv.id}')" class="text-slate-400 hover:text-rose-600 px-2 py-1.5 text-xs">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

window.changeServiceStatus = async function (serviceId, newStatus) {
  const srv = services.find((s) => s.id === serviceId);
  if (!srv) return;
  const updates = { status: newStatus };
  if (newStatus === "Selesai" && !srv.stockDeducted) {
    await deductStockIfNeeded(srv);
    updates.stockDeducted = true;
  }
  await dbService.updateService(serviceId, updates);
};

window.switchAddItemMode = function (mode) {
  document.getElementById("add-item-mode").value = mode;
  const isCatalog = mode === "catalog";
  document.getElementById("group-item-catalog").classList.toggle("hidden", !isCatalog);
  document.getElementById("group-item-manual").classList.toggle("hidden", isCatalog);

  document.getElementById("btn-mode-catalog").className = isCatalog
    ? "py-2 rounded-lg bg-white text-slate-900 shadow-sm"
    : "py-2 rounded-lg text-slate-600";
  document.getElementById("btn-mode-manual").className = !isCatalog
    ? "py-2 rounded-lg bg-white text-slate-900 shadow-sm"
    : "py-2 rounded-lg text-slate-600";
};

window.openAddItemModal = function (serviceId) {
  document.getElementById("modal-service-id").value = serviceId;
  document.getElementById("input-item-qty").value = 1;
  switchAddItemMode("catalog");
  openModal("modal-add-item");
};

window.openPaymentModal = function (serviceId) {
  const srv = services.find((s) => s.id === serviceId);
  if (!srv) return;
  const approvedItems = (srv.items || []).filter((i) => i.approval !== "rejected");
  const total = approvedItems.reduce((sum, i) => sum + i.price * i.qty, 0);

  document.getElementById("pay-service-id").value = serviceId;
  document.getElementById("pay-total-display").textContent = formatRp(total);
  document.getElementById("pay-next-km").value = srv.km ? Number(srv.km) + 2000 : "";
  openModal("modal-payment");
};

window.removeServiceItem = async function (serviceId, itemIndex) {
  const srv = services.find((s) => s.id === serviceId);
  if (!srv) return;
  await dbService.updateService(serviceId, {
    items: srv.items.filter((_, idx) => idx !== itemIndex)
  });
};

window.deleteServiceOrder = async function (serviceId) {
  if (confirm("Hapus data servis ini?")) await dbService.deleteService(serviceId);
};

// Kirim WhatsApp (Tracking atau Struk Lunas)
window.sendWhatsAppUpdate = function (serviceId) {
  const srv = services.find((s) => s.id === serviceId);
  if (!srv) return;

  const baseUrl = window.location.origin + window.location.pathname;
  const trackUrl = `${baseUrl}?track=${encodeURIComponent(srv.code)}`;
  const approvedItems = (srv.items || []).filter((i) => i.approval !== "rejected");
  const total = approvedItems.reduce((sum, i) => sum + i.price * i.qty, 0);

  let msg = "";
  if (srv.paymentStatus === "paid") {
    msg = `*STRUK LUNAS - ${APP_CONFIG.shopName}*\n`;
    msg += `No. Nota: *${srv.code}* (${srv.paidDate || srv.date})\n`;
    msg += `Motor: *${srv.bike} (${srv.plate})*\n`;
    msg += `Mekanik: ${srv.mechanic}\n\n*Rincian Pekerjaan:*\n`;
    approvedItems.forEach((i) => {
      msg += `• ${i.name} (${i.qty}x) = ${formatRp(i.price * i.qty)}\n`;
    });
    msg += `\n*TOTAL BAYAR: ${formatRp(total)}* (${srv.paymentMethod})\n`;
    if (srv.nextKm) msg += `Saran Ganti Oli Berikutnya: *${Number(srv.nextKm).toLocaleString("id-ID")} KM*\n`;
    msg += `\nTerima kasih sudah servis di tempat kami!`;
  } else {
    msg = `Halo Kak *${srv.customer}*, info servis motor *${srv.bike} (${srv.plate})* di *${APP_CONFIG.shopName}*:\n\n`;
    msg += `• Kode Servis: *${srv.code}*\n• Status: *${srv.status}*\n• Estimasi Biaya: *${formatRp(total)}*\n\n`;
    if (srv.status === "Menunggu Konfirmasi") {
      msg += `⚠️ *Ada sparepart tambahan yang perlu persetujuan Kakak.*\n`;
    }
    msg += `Cek progres & rincian part secara live di:\n${trackUrl}`;
  }

  window.open(`https://wa.me/${srv.phone}?text=${encodeURIComponent(msg)}`, "_blank");
};

// ==========================================
// KASIR BELI PUTUS (POS SPAREPART LANGSUNG)
// ==========================================
window.addPosCartItem = function () {
  const partId = document.getElementById("pos-part-select").value;
  const qty = Number(document.getElementById("pos-part-qty").value) || 1;
  const part = parts.find((p) => p.id === partId);
  if (!part) return;
  if (part.stock < qty) return alert(`Stok ${part.name} tidak cukup (sisa: ${part.stock}).`);

  const existing = posCart.find((c) => c.partId === partId);
  if (existing) existing.qty += qty;
  else posCart.push({ partId: part.id, name: part.name, cost: part.cost, price: part.price, qty });
  renderPosCart();
};

window.removePosCartItem = function (idx) {
  posCart.splice(idx, 1);
  renderPosCart();
};

function renderPosCart() {
  const listEl = document.getElementById("pos-cart-list");
  if (posCart.length === 0) {
    listEl.innerHTML = `<p class="text-slate-400 italic">Belum ada barang dipilih.</p>`;
    document.getElementById("pos-cart-total").textContent = "Rp 0";
    return;
  }
  listEl.innerHTML = posCart
    .map(
      (c, idx) => `
      <div class="flex justify-between items-center bg-slate-50 px-2.5 py-1.5 rounded-lg">
        <span>${c.name} (${c.qty}x)</span>
        <div class="flex items-center gap-2">
          <b>${formatRp(c.price * c.qty)}</b>
          <button type="button" onclick="removePosCartItem(${idx})" class="text-rose-500"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>`
    )
    .join("");
  const total = posCart.reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById("pos-cart-total").textContent = formatRp(total);
}

function renderPosHistory() {
  const el = document.getElementById("pos-history-list");
  if (!el) return;
  if (directSales.length === 0) {
    el.innerHTML = `<p class="text-xs text-slate-400 italic">Belum ada transaksi beli putus.</p>`;
    return;
  }
  el.innerHTML = directSales
    .slice(0, 15)
    .map(
      (sale) => `
      <div class="p-3 rounded-xl border border-slate-100 bg-slate-50 flex justify-between items-center">
        <div>
          <p class="font-bold text-slate-900">${sale.customer} <span class="text-xs font-normal text-slate-500">(${sale.date} • ${sale.paymentMethod})</span></p>
          <p class="text-xs text-slate-600">${(sale.items || []).map((i) => `${i.name} (${i.qty}x)`).join(", ")}</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="font-bold text-emerald-700">${formatRp(sale.total)}</span>
          <button onclick="deleteDirectSaleItem('${sale.id}')" class="text-slate-400 hover:text-rose-600 text-xs">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>`
    )
    .join("");
}

window.deleteDirectSaleItem = async function (id) {
  if (confirm("Hapus riwayat penjualan ini?")) await dbService.deleteDirectSale(id);
};

// ==========================================
// RIWAYAT KENDARAAN & REMINDER GANTI OLI
// ==========================================
window.openPlateHistoryModal = function (plate) {
  const clean = plate.replace(/\s+/g, "").toUpperCase();
  const logs = services.filter((s) => s.plate.replace(/\s+/g, "").toUpperCase() === clean);
  document.getElementById("history-modal-title").textContent = `Riwayat Servis: ${plate}`;

  const body = document.getElementById("history-modal-body");
  if (logs.length === 0) {
    body.innerHTML = `<p class="text-slate-500">Belum ada riwayat servis.</p>`;
  } else {
    body.innerHTML = logs
      .map((l) => {
        const itemsStr = (l.items || [])
          .filter((i) => i.approval === "approved")
          .map((i) => `${i.name} (${i.qty}x)`)
          .join(", ");
        return `
        <div class="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
          <div class="flex justify-between font-bold text-slate-900">
            <span>${l.date} • ${l.code}</span>
            <span>KM: ${l.km || "-"}</span>
          </div>
          <p class="text-slate-600">Keluhan: ${l.complaint}</p>
          <p class="text-slate-700 font-medium">Part/Jasa: ${itemsStr || "-"}</p>
          <p class="text-[11px] text-slate-500">Mekanik: ${l.mechanic} • Status: ${l.status}</p>
        </div>`;
      })
      .join("");
  }
  openModal("modal-plate-history");
};

function renderHistoryAndReminders() {
  const container = document.getElementById("vehicle-reminder-list");
  if (!container) return;

  const query = (document.getElementById("history-search-input")?.value || "").trim().toUpperCase();
  const dueOnly = document.getElementById("filter-due-only")?.checked || false;

  // Kelompokkan berdasarkan plat nomor unik (ambil servis terakhir)
  const vehicleMap = {};
  services.forEach((s) => {
    const key = s.plate.replace(/\s+/g, "").toUpperCase();
    if (!vehicleMap[key]) {
      vehicleMap[key] = { ...s, visitCount: 1 };
    } else {
      vehicleMap[key].visitCount += 1;
    }
  });

  const nowMs = Date.now();
  const list = Object.values(vehicleMap).filter((v) => {
    const daysSince = Math.floor((nowMs - new Date(v.date).getTime()) / (1000 * 60 * 60 * 24));
    v.daysSince = Math.max(0, daysSince);
    if (dueOnly && v.daysSince < 30) return false;
    if (query && !v.plate.includes(query) && !v.customer.toUpperCase().includes(query)) return false;
    return true;
  });

  if (list.length === 0) {
    container.innerHTML = `<div class="col-span-2 bg-white p-6 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">Tidak ada data kendaraan yang cocok.</div>`;
    return;
  }

  container.innerHTML = list
    .map(
      (v) => `
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between gap-3">
        <div>
          <div class="flex justify-between items-start">
            <div>
              <h4 class="font-bold text-slate-900">${v.plate} — ${v.bike}</h4>
              <p class="text-xs text-slate-500">${v.customer} (${v.phone}) • Total ${v.visitCount}x servis</p>
            </div>
            <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${
              v.daysSince >= 30 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
            }">
              ${v.daysSince} hari lalu
            </span>
          </div>
          <p class="text-xs text-slate-600 mt-2">
            Servis Terakhir: <b>${v.date}</b> (KM ${v.km || "-"}) ${
              v.nextKm ? `• Target Berikutnya: <b>${Number(v.nextKm).toLocaleString("id-ID")} KM</b>` : ""
            }
          </p>
        </div>
        <div class="flex gap-2 pt-2 border-t border-slate-100">
          <button onclick="openPlateHistoryModal('${v.plate}')" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2 rounded-xl">
            Lihat Semua Riwayat
          </button>
          <button onclick="sendReminderWA('${v.id}')" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 rounded-xl">
            <i class="fa-brands fa-whatsapp mr-1"></i> Reminder Ganti Oli
          </button>
        </div>
      </div>`
    )
    .join("");
}

window.sendReminderWA = function (serviceId) {
  const srv = services.find((s) => s.id === serviceId);
  if (!srv) return;
  let msg = `Halo Kak *${srv.customer}*, salam dari *${APP_CONFIG.shopName}* 👋\n\n`;
  msg += `Sekadar mengingatkan untuk jadwal pengecekan & ganti oli rutin motor *${srv.bike} (${srv.plate})*.\n`;
  msg += `Servis terakhir tercatat pada tanggal *${srv.date}*`;
  if (srv.nextKm) msg += ` dengan rekomendasi servis berikutnya di *${Number(srv.nextKm).toLocaleString("id-ID")} KM*`;
  msg += `.\n\nYuk mampir biar tarikan motor tetap enteng dan awet!`;
  window.open(`https://wa.me/${srv.phone}?text=${encodeURIComponent(msg)}`, "_blank");
};

// ==========================================
// 3. RENDER DASHBOARD OWNER
// ==========================================
window.setOwnerPeriod = function (period, btnEl) {
  ownerPeriod = period;
  if (btnEl) {
    document.querySelectorAll(".owner-period-btn").forEach((b) => {
      b.classList.remove("active");
      b.classList.add("bg-slate-100", "text-slate-700");
    });
    btnEl.classList.add("active");
    btnEl.classList.remove("bg-slate-100", "text-slate-700");
  }
  renderOwnerFinanceAndMetrics();
};

function renderOwnerFinanceAndMetrics() {
  const paidServices = services.filter(
    (s) => s.paymentStatus === "paid" && isDateInOwnerPeriod(s.paidDate || s.date)
  );
  const periodDirectSales = directSales.filter((d) => isDateInOwnerPeriod(d.date));
  const periodExpenses = expenses.filter((e) => isDateInOwnerPeriod(e.date));

  let totalRevenue = 0;
  let totalCost = 0;
  let totalCommission = 0;
  const paySplit = { Tunai: 0, QRIS: 0, Transfer: 0 };
  const mechReportMap = {};

  paidServices.forEach((srv) => {
    const rate = srv.mechanicCommissionRate ?? APP_CONFIG.defaultCommissionRate;
    if (!mechReportMap[srv.mechanic]) {
      mechReportMap[srv.mechanic] = { count: 0, serviceFee: 0, commission: 0 };
    }
    mechReportMap[srv.mechanic].count += 1;

    let srvTotal = 0;
    (srv.items || [])
      .filter((i) => i.approval === "approved")
      .forEach((item) => {
        const sub = item.price * item.qty;
        srvTotal += sub;
        totalRevenue += sub;
        if (item.type === "part") {
          totalCost += (item.cost || 0) * item.qty;
        } else {
          const comm = sub * rate;
          totalCommission += comm;
          mechReportMap[srv.mechanic].serviceFee += sub;
          mechReportMap[srv.mechanic].commission += comm;
        }
      });

    if (paySplit[srv.paymentMethod] !== undefined) paySplit[srv.paymentMethod] += srvTotal;
  });

  periodDirectSales.forEach((sale) => {
    totalRevenue += Number(sale.total) || 0;
    totalCost += Number(sale.totalCost) || 0;
    if (paySplit[sale.paymentMethod] !== undefined) paySplit[sale.paymentMethod] += Number(sale.total) || 0;
  });

  const totalExpense = periodExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const netProfit = totalRevenue - totalCost - totalCommission - totalExpense;

  document.getElementById("owner-revenue").textContent = formatRp(totalRevenue);
  document.getElementById("owner-payment-split").textContent =
    `Tunai: ${formatRp(paySplit.Tunai)} | QRIS: ${formatRp(paySplit.QRIS)} | TF: ${formatRp(paySplit.Transfer)}`;
  document.getElementById("owner-cost").textContent = formatRp(totalCost);
  document.getElementById("owner-commission").textContent = formatRp(totalCommission);
  document.getElementById("owner-expense").textContent = formatRp(totalExpense);
  document.getElementById("owner-profit").textContent = formatRp(netProfit);

  // Render Komisi Mekanik
  const mechReportEl = document.getElementById("owner-mechanic-report");
  const entries = Object.entries(mechReportMap);
  mechReportEl.innerHTML =
    entries.length === 0
      ? `<p class="text-xs text-slate-400 italic">Belum ada servis lunas pada periode ini.</p>`
      : entries
          .map(
            ([name, d]) => `
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center">
              <div>
                <p class="font-bold text-slate-900">${name}</p>
                <p class="text-xs text-slate-500">${d.count} motor lunas • Total Jasa ${formatRp(d.serviceFee)}</p>
              </div>
              <div class="text-right">
                <p class="text-[11px] text-slate-400">Hak Komisi</p>
                <p class="font-bold text-amber-600">${formatRp(d.commission)}</p>
              </div>
            </div>`
          )
          .join("");

  // Render Daftar Pengeluaran
  const expEl = document.getElementById("owner-expense-list");
  expEl.innerHTML =
    periodExpenses.length === 0
      ? `<p class="py-3 text-xs text-slate-400 italic">Belum ada catatan pengeluaran pada periode ini.</p>`
      : periodExpenses
          .map(
            (e) => `
            <div class="py-2.5 flex justify-between items-center">
              <div>
                <p class="font-semibold text-slate-800">${e.title}</p>
                <p class="text-[11px] text-slate-400">${e.date} • ${e.category}</p>
              </div>
              <div class="flex items-center gap-3">
                <span class="font-bold text-rose-600">-${formatRp(e.amount)}</span>
                <button onclick="deleteExpenseItem('${e.id}')" class="text-slate-400 hover:text-rose-600"><i class="fa-solid fa-trash"></i></button>
              </div>
            </div>`
          )
          .join("");
}

window.deleteExpenseItem = async function (id) {
  if (confirm("Hapus catatan pengeluaran ini?")) await dbService.deleteExpense(id);
};

// Render Master Sparepart & Jasa
function renderOwnerCatalog() {
  const tbody = document.getElementById("owner-parts-table");
  if (!tbody) return;
  tbody.innerHTML = parts
    .map((p) => {
      const isLow = p.type === "part" && p.stock <= 5;
      return `
      <tr>
        <td class="py-2.5 px-2 font-medium text-slate-900">${p.name}</td>
        <td class="py-2.5 px-2">
          <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            p.type === "part" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
          }">${p.type === "part" ? "Sparepart" : "Jasa"}</span>
        </td>
        <td class="py-2.5 px-2 text-slate-500">${formatRp(p.cost)}</td>
        <td class="py-2.5 px-2 font-semibold text-slate-800">${formatRp(p.price)}</td>
        <td class="py-2.5 px-2">
          ${
            p.type === "service"
              ? "-"
              : `<span class="font-bold ${isLow ? "text-rose-600" : "text-slate-800"}">${p.stock} ${isLow ? "(Tipis!)" : ""}</span>`
          }
        </td>
        <td class="py-2.5 px-2 text-right space-x-2">
          ${p.type === "part" ? `<button onclick="restockPart('${p.id}', ${p.stock})" class="text-emerald-600 font-semibold text-xs">+Stok</button>` : ""}
          <button onclick="deleteMasterPart('${p.id}')" class="text-rose-500 text-xs"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    })
    .join("");
}

window.restockPart = async function (partId, currentStock) {
  const addQty = prompt("Tambah berapa stok masuk?", "10");
  if (addQty && !isNaN(addQty)) {
    await dbService.updatePart(partId, { stock: Number(currentStock) + Number(addQty) });
  }
};

window.deleteMasterPart = async function (partId) {
  if (confirm("Hapus item ini?")) await dbService.deletePart(partId);
};

// Render Kelola Mekanik
function renderOwnerMechanicsManage() {
  const el = document.getElementById("owner-mechanics-manage-list");
  if (!el) return;
  el.innerHTML = mechanics
    .map(
      (m) => `
      <div class="p-3 rounded-xl border border-slate-200 flex justify-between items-center">
        <div>
          <p class="font-bold text-slate-900">${m.name}
            <span class="ml-1.5 text-[10px] px-2 py-0.5 rounded-full ${
              m.active !== false ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
            }">${m.active !== false ? "Aktif" : "Libur / Nonaktif"}</span>
          </p>
          <p class="text-xs text-slate-500">Komisi Jasa: <b>${Math.round((m.commissionRate || 0) * 100)}%</b></p>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="toggleMechanicStatus('${m.id}', ${m.active !== false})"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200">
            ${m.active !== false ? "Set Libur" : "Aktifkan"}
          </button>
          <button onclick="deleteMechanicItem('${m.id}')" class="text-rose-500 px-2 py-1 text-xs">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>`
    )
    .join("");
}

window.toggleMechanicStatus = async function (id, currentActive) {
  await dbService.updateMechanic(id, { active: !currentActive });
};

window.deleteMechanicItem = async function (id) {
  if (confirm("Hapus data mekanik ini?")) await dbService.deleteMechanic(id);
};
