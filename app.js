import { APP_CONFIG, dbService } from "./firebase-config.js";

// State Global
let services = [];
let parts = [];
let currentRole = "customer";
let pendingRole = null;
let adminFilter = "all";
let activeTrackQuery = "";

const STATUS_FLOW = ["Antre", "Dicek", "Menunggu Konfirmasi", "Dikerjakan", "Selesai"];
const todayStr = new Date().toISOString().split("T")[0];

// Format Rupiah
const formatRp = (num) => "Rp " + Number(num || 0).toLocaleString("id-ID");

// Normalisasi No HP ke format 628xxx untuk WhatsApp
function normalizePhone(phone) {
  let clean = String(phone || "").replace(/\D/g, "");
  if (clean.startsWith("0")) clean = "62" + clean.slice(1);
  return clean;
}

// ==========================================
// INISIALISASI APLIKASI
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("nav-shop-name").textContent = APP_CONFIG.shopName;
  const badge = document.getElementById("storage-mode-badge");
  if (dbService.isCloud) {
    badge.textContent = "Cloud Sync (Firebase)";
    badge.className = "text-[11px] text-emerald-400";
  }

  // Subscribe Data Real-time
  dbService.subscribeParts((data) => {
    parts = data;
    renderMasterPartSelect();
    renderOwnerDashboard();
  });

  dbService.subscribeServices((data) => {
    services = data;
    renderAdminDashboard();
    renderOwnerDashboard();
    if (activeTrackQuery) renderCustomerTracking(activeTrackQuery);
  });

  // Cek apakah dibuka dari link tracking customer (?track=SRV-101)
  const urlParams = new URLSearchParams(window.location.search);
  const trackParam = urlParams.get("track");
  if (trackParam) {
    document.getElementById("input-track-query").value = trackParam;
    activeTrackQuery = trackParam.trim().toUpperCase();
    // Tunggu data termuat lalu render
    setTimeout(() => renderCustomerTracking(activeTrackQuery), 300);
  }

  setupEventListeners();
});

// ==========================================
// NAVIGASI & KEAMANAN PIN ROLE
// ==========================================
window.switchRole = function (role) {
  currentRole = role;
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
// EVENT LISTENERS FORM
// ==========================================
function setupEventListeners() {
  // Validasi PIN
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

  // Form Tracking Customer
  document.getElementById("form-track").addEventListener("submit", (e) => {
    e.preventDefault();
    activeTrackQuery = document.getElementById("input-track-query").value.trim().toUpperCase();
    renderCustomerTracking(activeTrackQuery);
  });

  // Auto-cek Riwayat Plat Nomor saat Admin mengetik
  document.getElementById("srv-plate").addEventListener("input", (e) => {
    const val = e.target.value.trim().toUpperCase();
    const hint = document.getElementById("plate-history-hint");
    if (val.length < 4) {
      hint.classList.add("hidden");
      return;
    }
    const prev = services.find((s) => s.plate.toUpperCase() === val);
    if (prev) {
      document.getElementById("srv-bike").value = prev.bike;
      document.getElementById("srv-customer").value = prev.customer;
      document.getElementById("srv-phone").value = prev.phone;
      hint.textContent = `Riwayat ditemukan: Servis terakhir ${prev.date} (${prev.km || "-"} KM) - ${prev.complaint}`;
      hint.classList.remove("hidden");
    } else {
      hint.classList.add("hidden");
    }
  });

  // Form Pendaftaran Servis Baru (Admin)
  document.getElementById("form-new-service").addEventListener("submit", async (e) => {
    e.preventDefault();
    const randomNum = Math.floor(100 + Math.random() * 900);
    const newOrder = {
      code: `SRV-${randomNum}`,
      date: todayStr,
      plate: document.getElementById("srv-plate").value.trim().toUpperCase(),
      bike: document.getElementById("srv-bike").value.trim(),
      km: Number(document.getElementById("srv-km").value) || 0,
      customer: document.getElementById("srv-customer").value.trim(),
      phone: normalizePhone(document.getElementById("srv-phone").value),
      mechanic: document.getElementById("srv-mechanic").value,
      eta: document.getElementById("srv-eta").value,
      complaint: document.getElementById("srv-complaint").value.trim(),
      status: "Antre",
      stockDeducted: false,
      items: []
    };

    await dbService.addService(newOrder);
    e.target.reset();
    document.getElementById("plate-history-hint").classList.add("hidden");
  });

  // Form Tambah Item Sparepart/Jasa ke Motor
  document.getElementById("form-add-service-item").addEventListener("submit", async (e) => {
    e.preventDefault();
    const srvId = document.getElementById("modal-service-id").value;
    const partId = document.getElementById("select-master-part").value;
    const qty = Number(document.getElementById("input-item-qty").value) || 1;
    const approval = document.getElementById("input-item-approval").value;

    const srv = services.find((s) => s.id === srvId);
    const part = parts.find((p) => p.id === partId);
    if (!srv || !part) return;

    const updatedItems = [
      ...(srv.items || []),
      {
        partId: part.id,
        name: part.name,
        type: part.type,
        cost: part.cost,
        price: part.price,
        qty,
        approval
      }
    ];

    const updates = { items: updatedItems };
    if (approval === "pending") {
      updates.status = "Menunggu Konfirmasi";
    }

    await dbService.updateService(srvId, updates);
    closeModal("modal-add-item");
  });

  // Form Tambah Master Sparepart Baru (Owner)
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
      <!-- Header Nota -->
      <div class="bg-slate-900 text-white p-5 flex flex-wrap justify-between items-center gap-2">
        <div>
          <span class="text-xs text-amber-400 font-mono font-bold">${match.code}</span>
          <h3 class="text-xl font-bold">${match.plate} — ${match.bike}</h3>
          <p class="text-xs text-slate-300">Mekanik: ${match.mechanic} • Estimasi Selesai: <b>${match.eta || "-"}</b></p>
        </div>
        <span class="px-3 py-1 rounded-full text-xs font-bold badge-${match.status}">
          ${match.status}
        </span>
      </div>

      <!-- Stepper Status -->
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
                <p class="text-[10px] sm:text-xs mt-1.5 font-medium ${
                  isDone ? "text-slate-900" : "text-slate-400"
                }">${step}</p>
              </div>`;
          }).join("")}
        </div>
      </div>

      <!-- Alert Konfirmasi Tambahan Sparepart -->
      ${
        pendingItems.length > 0
          ? `<div class="bg-amber-50 border-b border-amber-200 p-4 space-y-3">
              <div class="flex items-start gap-2.5">
                <i class="fa-solid fa-triangle-exclamation text-amber-600 mt-0.5"></i>
                <div class="text-xs sm:text-sm">
                  <p class="font-bold text-amber-900">Konfirmasi Penggantian Sparepart Tambahan</p>
                  <p class="text-amber-800">Mekanik menemukan komponen yang perlu diganti. Silakan setujui atau tolak sebelum dipasang:</p>
                </div>
              </div>
              <div class="space-y-2">
                ${pendingItems
                  .map(
                    (item) => `
                  <div class="bg-white p-3 rounded-xl border border-amber-200 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p class="font-bold text-sm text-slate-900">${item.name} (${item.qty}x)</p>
                      <p class="text-xs text-slate-600">${formatRp(item.price * item.qty)}</p>
                    </div>
                    <div class="flex gap-2">
                      <button onclick="customerRespondItem('${match.id}', '${item.partId}', 'rejected')"
                        class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-100 text-rose-700 hover:bg-rose-200">
                        Tolak
                      </button>
                      <button onclick="customerRespondItem('${match.id}', '${item.partId}', 'approved')"
                        class="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700">
                        Setuju Ganti
                      </button>
                    </div>
                  </div>`
                  )
                  .join("")}
              </div>
            </div>`
          : ""
      }

      <!-- Rincian Pekerjaan & Sparepart -->
      <div class="p-5 space-y-3">
        <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Rincian Sparepart & Jasa</p>
        ${
          activeItems.length === 0
            ? `<p class="text-sm text-slate-500 italic">Belum ada rincian sparepart/jasa yang diinput.</p>`
            : `<ul class="divide-y divide-slate-100 text-sm">
                ${activeItems
                  .map(
                    (i) => `
                  <li class="py-2 flex justify-between items-center">
                    <div>
                      <span class="font-medium text-slate-800">${i.name}</span>
                      <span class="text-xs text-slate-500 ml-1">(${i.qty}x)</span>
                      ${
                        i.approval === "pending"
                          ? '<span class="ml-1.5 text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">Menunggu Persetujuan</span>'
                          : ""
                      }
                    </div>
                    <span class="font-semibold text-slate-900">${formatRp(i.price * i.qty)}</span>
                  </li>`
                  )
                  .join("")}
              </ul>`
        }

        <div class="pt-3 border-t border-slate-200 flex justify-between items-center">
          <span class="font-bold text-slate-700">Estimasi Total Biaya</span>
          <span class="text-lg font-extrabold text-slate-900">${formatRp(totalBiaya)}</span>
        </div>
      </div>
    </div>
  `;
}

// Customer Setuju / Tolak Sparepart Tambahan
window.customerRespondItem = async function (serviceId, partId, decision) {
  const srv = services.find((s) => s.id === serviceId);
  if (!srv) return;

  const updatedItems = srv.items.map((item) =>
    item.partId === partId && item.approval === "pending" ? { ...item, approval: decision } : item
  );

  const stillPending = updatedItems.some((i) => i.approval === "pending");
  const nextStatus = stillPending ? "Menunggu Konfirmasi" : "Dikerjakan";

  await dbService.updateService(serviceId, {
    items: updatedItems,
    status: nextStatus
  });
};

// ==========================================
// 2. RENDER PANEL ADMIN / KASIR
// ==========================================
window.setAdminFilter = function (filter) {
  adminFilter = filter;
  document.querySelectorAll(".filter-chip").forEach((btn) => {
    btn.classList.remove("active", "bg-slate-900", "text-white");
    btn.classList.add("bg-slate-100", "text-slate-700");
  });
  event.target.classList.add("active");
  renderAdminDashboard();
};

function renderAdminDashboard() {
  const todayServices = services.filter((s) => s.date === todayStr);

  // KPI Hari Ini
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

  // Filter Daftar
  let filtered = services;
  if (adminFilter === "active") {
    filtered = services.filter((s) => s.status !== "Selesai");
  } else if (adminFilter === "Selesai") {
    filtered = services.filter((s) => s.status === "Selesai");
  }

  const listEl = document.getElementById("admin-service-list");
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="bg-white p-8 rounded-2xl border border-slate-200 text-center text-sm text-slate-500">Belum ada data motor di kategori ini.</div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((srv) => {
      const approvedItems = (srv.items || []).filter((i) => i.approval !== "rejected");
      const total = approvedItems.reduce((sum, i) => sum + i.price * i.qty, 0);

      return `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
        <div class="flex flex-wrap justify-between items-start gap-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-700">${srv.code}</span>
              <h4 class="font-bold text-base text-slate-900">${srv.plate} • ${srv.bike}</h4>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">
              Customer: <b>${srv.customer}</b> (${srv.phone}) • Mekanik: <b>${srv.mechanic}</b> • ETA: ${srv.eta || "-"}
            </p>
            <p class="text-xs text-slate-600 mt-1 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
              Keluhan: ${srv.complaint}
            </p>
          </div>

          <select onchange="changeServiceStatus('${srv.id}', this.value)"
            class="text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer badge-${srv.status}">
            ${STATUS_FLOW.map(
              (st) => `<option value="${st}" ${srv.status === st ? "selected" : ""}>${st}</option>`
            ).join("")}
          </select>
        </div>

        <!-- List Sparepart & Jasa Terpasang -->
        <div class="border-t border-slate-100 pt-3">
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs font-bold text-slate-500">Kebutuhan Sparepart & Jasa:</span>
            <button onclick="openAddItemModal('${srv.id}')"
              class="text-xs font-bold text-amber-600 hover:text-amber-700">
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
                      <div class="flex items-center gap-2">
                        <span class="font-medium ${
                          item.approval === "rejected" ? "line-through text-slate-400" : "text-slate-800"
                        }">${item.name} (${item.qty}x)</span>
                        ${
                          item.approval === "pending"
                            ? '<span class="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-semibold">Menunggu ACC</span>'
                            : item.approval === "rejected"
                            ? '<span class="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded text-[10px]">Ditolak Customer</span>'
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

        <!-- Footer Card: Total & Tombol WhatsApp -->
        <div class="border-t border-slate-100 pt-3 flex flex-wrap justify-between items-center gap-2">
          <div>
            <span class="text-xs text-slate-500">Total Tagihan:</span>
            <span class="text-base font-extrabold text-slate-900 ml-1">${formatRp(total)}</span>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="sendWhatsAppUpdate('${srv.id}')"
              class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5">
              <i class="fa-brands fa-whatsapp text-sm"></i> Kirim Link Tracking WA
            </button>
            <button onclick="deleteServiceOrder('${srv.id}')" title="Hapus"
              class="text-slate-400 hover:text-rose-600 px-2 py-1.5 text-xs">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

// Ubah Status & Auto-Potong Stok saat Selesai
window.changeServiceStatus = async function (serviceId, newStatus) {
  const srv = services.find((s) => s.id === serviceId);
  if (!srv) return;

  const updates = { status: newStatus };

  // Jika ditandai Selesai & stok belum dipotong sebelumnya
  if (newStatus === "Selesai" && !srv.stockDeducted) {
    const approvedParts = (srv.items || []).filter(
      (i) => i.type === "part" && i.approval === "approved"
    );
    for (const item of approvedParts) {
      const master = parts.find((p) => p.id === item.partId);
      if (master) {
        const newStock = Math.max(0, Number(master.stock) - Number(item.qty));
        await dbService.updatePart(master.id, { stock: newStock });
      }
    }
    updates.stockDeducted = true;
  }

  await dbService.updateService(serviceId, updates);
};

window.openAddItemModal = function (serviceId) {
  document.getElementById("modal-service-id").value = serviceId;
  document.getElementById("input-item-qty").value = 1;
  openModal("modal-add-item");
};

window.removeServiceItem = async function (serviceId, itemIndex) {
  const srv = services.find((s) => s.id === serviceId);
  if (!srv) return;
  const updatedItems = srv.items.filter((_, idx) => idx !== itemIndex);
  await dbService.updateService(serviceId, { items: updatedItems });
};

window.deleteServiceOrder = async function (serviceId) {
  if (confirm("Hapus data antrean servis ini?")) {
    await dbService.deleteService(serviceId);
  }
};

// Kirim Link Tracking via WhatsApp
window.sendWhatsAppUpdate = function (serviceId) {
  const srv = services.find((s) => s.id === serviceId);
  if (!srv) return;

  const baseUrl = window.location.origin + window.location.pathname;
  const trackUrl = `${baseUrl}?track=${encodeURIComponent(srv.code)}`;
  const approvedItems = (srv.items || []).filter((i) => i.approval !== "rejected");
  const total = approvedItems.reduce((sum, i) => sum + i.price * i.qty, 0);

  let msg = `Halo Kak *${srv.customer}*, berikut info servis motor *${srv.bike} (${srv.plate})* di *${APP_CONFIG.shopName}*:\n\n`;
  msg += `• Kode Servis: *${srv.code}*\n`;
  msg += `• Status Saat Ini: *${srv.status}*\n`;
  msg += `• Estimasi Biaya: *${formatRp(total)}*\n\n`;

  if (srv.status === "Menunggu Konfirmasi") {
    msg += `⚠️ *Ada sparepart tambahan yang perlu persetujuan Kakak.*\n`;
  }

  msg += `Cek progres & rincian part secara live di link berikut:\n${trackUrl}`;

  const waUrl = `https://wa.me/${srv.phone}?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, "_blank");
};

// ==========================================
// 3. RENDER DASHBOARD OWNER
// ==========================================
function renderMasterPartSelect() {
  const select = document.getElementById("select-master-part");
  if (!select) return;
  select.innerHTML = parts
    .map(
      (p) =>
        `<option value="${p.id}">${p.name} — ${formatRp(p.price)} ${
          p.type === "part" ? `(Stok: ${p.stock})` : "[Jasa]"
        }</option>`
    )
    .join("");
}

window.openPartModal = () => openModal("modal-part");

function renderOwnerDashboard() {
  const doneToday = services.filter((s) => s.date === todayStr && s.status === "Selesai");

  let revenueToday = 0;
  let costToday = 0;
  let serviceFeeToday = 0;
  const mechanicMap = {};

  doneToday.forEach((srv) => {
    if (!mechanicMap[srv.mechanic]) {
      mechanicMap[srv.mechanic] = { count: 0, serviceFee: 0 };
    }
    mechanicMap[srv.mechanic].count += 1;

    (srv.items || [])
      .filter((i) => i.approval === "approved")
      .forEach((item) => {
        const subTotal = item.price * item.qty;
        revenueToday += subTotal;
        if (item.type === "part") {
          costToday += (item.cost || 0) * item.qty;
        } else {
          serviceFeeToday += subTotal;
          mechanicMap[srv.mechanic].serviceFee += subTotal;
        }
      });
  });

  const commissionToday = serviceFeeToday * APP_CONFIG.mechanicCommissionRate;
  const netProfitToday = revenueToday - costToday - commissionToday;

  document.getElementById("owner-revenue-today").textContent = formatRp(revenueToday);
  document.getElementById("owner-cost-today").textContent = formatRp(costToday);
  document.getElementById("owner-commission-today").textContent = formatRp(commissionToday);
  document.getElementById("owner-profit-today").textContent = formatRp(netProfitToday);

  // Render Rekap Mekanik
  const mechEl = document.getElementById("owner-mechanic-list");
  const mechEntries = Object.entries(mechanicMap);
  if (mechEntries.length === 0) {
    mechEl.innerHTML = `<p class="text-xs text-slate-500 italic">Belum ada servis selesai hari ini.</p>`;
  } else {
    mechEl.innerHTML = mechEntries
      .map(([name, data]) => {
        const comm = data.serviceFee * APP_CONFIG.mechanicCommissionRate;
        return `
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center">
          <div>
            <p class="font-bold text-slate-900">${name}</p>
            <p class="text-xs text-slate-500">${data.count} motor selesai • Jasa ${formatRp(data.serviceFee)}</p>
          </div>
          <div class="text-right">
            <p class="text-[11px] text-slate-400">Komisi (40%)</p>
            <p class="font-bold text-amber-600">${formatRp(comm)}</p>
          </div>
        </div>`;
      })
      .join("");
  }

  // Render Tabel Master Sparepart & Jasa
  const tbody = document.getElementById("owner-parts-table");
  tbody.innerHTML = parts
    .map((p) => {
      const isLowStock = p.type === "part" && p.stock <= 5;
      return `
      <tr>
        <td class="py-2.5 px-2 font-medium text-slate-900">${p.name}</td>
        <td class="py-2.5 px-2">
          <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            p.type === "part" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
          }">
            ${p.type === "part" ? "Sparepart" : "Jasa"}
          </span>
        </td>
        <td class="py-2.5 px-2 text-slate-500">${formatRp(p.cost)}</td>
        <td class="py-2.5 px-2 font-semibold text-slate-800">${formatRp(p.price)}</td>
        <td class="py-2.5 px-2">
          ${
            p.type === "service"
              ? '<span class="text-slate-400">-</span>'
              : `<span class="font-bold ${isLowStock ? "text-rose-600" : "text-slate-800"}">
                  ${p.stock} ${isLowStock ? "(Tipis!)" : ""}
                </span>`
          }
        </td>
        <td class="py-2.5 px-2 text-right space-x-2">
          ${
            p.type === "part"
              ? `<button onclick="restockPart('${p.id}', ${p.stock})" class="text-emerald-600 hover:underline text-xs font-semibold">+Stok</button>`
              : ""
          }
          <button onclick="deleteMasterPart('${p.id}')" class="text-rose-500 hover:text-rose-700 text-xs">
            <i class="fa-solid fa-trash"></i>
          </button>
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
  if (confirm("Hapus item ini dari master data?")) {
    await dbService.deletePart(partId);
  }
};
