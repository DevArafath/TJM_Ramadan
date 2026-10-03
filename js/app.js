const TJM = {
  STORAGE_KEY: "tjm_ramadan_registrations",
  MEMBER_CACHE_KEY: "tjm_master_members_cache",

  getRecords() {
    try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; }
    catch { return []; }
  },

  saveRecords(records) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
  },

  async loadMembers() {
    const response = await fetch("master_members.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load master_members.json");
    const members = await response.json();
    localStorage.setItem(this.MEMBER_CACHE_KEY, JSON.stringify(members));
    return members;
  },

  async getMembers() {
    try {
      return await this.loadMembers();
    } catch {
      try {
        return JSON.parse(localStorage.getItem(this.MEMBER_CACHE_KEY)) || [];
      } catch { return []; }
    }
  },

  findMember(members, id) {
    const clean = String(id || "").trim().toLowerCase();
    return members.find(m => String(m.id).trim().toLowerCase() === clean);
  },

  formatDateTime(value) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true
    }).format(new Date(value));
  },

  playSound(file) {
    const audio = new Audio(`sounds/${file}`);
    audio.play().catch(() => {});
  },

  initials(name) {
    return String(name || "?").trim().split(/\s+/).slice(0,2)
      .map(x => x[0]).join("").toUpperCase();
  }
};

document.addEventListener("DOMContentLoaded", () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(console.warn);
  }

  const installBtn = document.querySelector(".install-btn");
  let deferredPrompt;

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    if (installBtn) installBtn.style.display = "inline-flex";
  });

  installBtn?.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.style.display = "none";
  });
});