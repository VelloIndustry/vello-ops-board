(function () {
  const LS_KEY = "vello-ops-board-v1";
  const API = "api/board";
  const SEED = "data.json";
  const DEFAULT_COLUMNS = [
    { id: "blocked", label: "Blocked" },
    { id: "waiting_ryan", label: "Waiting on Ryan" },
    { id: "doing", label: "Doing" },
    { id: "scheduled", label: "Scheduled" },
    { id: "backlog", label: "Backlog" }
  ];
  const BOOKS = ["Allocent", "Chamba", "Personal", "GrowthX", "Crypto", "Ops"];

  let state = { updated: "", columns: DEFAULT_COLUMNS.slice(), cards: [] };
  let persistMode = "local"; // shared | local
  let saveTimer = null;
  let editingId = null;
  let dragCardId = null;
  let dropTarget = null;
  let ghostEl = null;
  let dragging = false;

  const $ = (id) => document.getElementById(id);
  const boardEl = $("board");
  const overlay = $("overlay");
  const toast = $("statusToast");

  function setToast(mode, text) {
    toast.className = "toast " + (mode || "");
    toast.textContent = text;
  }

  function todayBogota() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  }

  function persistLocal() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function scheduleSave() {
    state.updated = todayBogota();
    $("lastUpdated").textContent = "Updated " + state.updated;
    persistLocal();
    setToast("saving", "Saving…");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 400);
  }

  async function doSave() {
    saveTimer = null;
    const payload = {
      updated: state.updated,
      columns: state.columns,
      cards: state.cards
    };
    persistLocal();
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.status === 501) {
        persistMode = "local";
        setToast("ok", "This browser");
        return;
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      const saved = await res.json();
      if (saved && saved.updated) {
        state.updated = saved.updated;
        $("lastUpdated").textContent = "Updated " + state.updated;
        persistLocal();
      }
      persistMode = "shared";
      setToast("ok", "Shared");
    } catch (_) {
      persistMode = "local";
      setToast("ok", "This browser");
    }
  }

  async function load() {
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (res.ok && res.status !== 204) {
        const data = await res.json();
        if (data && Array.isArray(data.cards)) {
          persistMode = "shared";
          applyData(data);
          persistLocal();
          setToast("ok", "Shared");
          return;
        }
      }
    } catch (_) {}

    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        persistMode = "local";
        applyData(JSON.parse(raw));
        setToast("ok", "This browser");
        return;
      }
    } catch (_) {}

    try {
      const res = await fetch(SEED, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      persistMode = "local";
      applyData(await res.json());
      persistLocal();
      setToast("ok", "Seeded");
    } catch (_) {
      applyData({ updated: "", columns: DEFAULT_COLUMNS, cards: [] });
      setToast("offline", "Empty");
    }
  }

  function applyData(data) {
    state = {
      updated: data.updated || "",
      columns: data.columns && data.columns.length ? data.columns : DEFAULT_COLUMNS.slice(),
      cards: Array.isArray(data.cards) ? data.cards : []
    };
    $("lastUpdated").textContent = state.updated ? ("Updated " + state.updated) : "—";
    render();
  }

  function cardsIn(status) {
    return state.cards.filter((c) => c.status === status);
  }

  function render() {
    boardEl.innerHTML = "";
    const statusSelect = $("fStatus");
    statusSelect.innerHTML = "";
    state.columns.forEach((col) => {
      const opt = document.createElement("option");
      opt.value = col.id;
      opt.textContent = col.label;
      statusSelect.appendChild(opt);

      const colEl = document.createElement("section");
      colEl.className = "col";
      colEl.dataset.status = col.id;

      const head = document.createElement("div");
      head.className = "col-head";
      const h2 = document.createElement("h2");
      h2.textContent = col.label;
      const count = document.createElement("span");
      count.className = "count";
      const list = cardsIn(col.id);
      count.textContent = String(list.length);
      head.appendChild(h2);
      head.appendChild(count);

      const body = document.createElement("div");
      body.className = "col-body";
      body.dataset.status = col.id;

      list.forEach((card) => body.appendChild(renderCard(card)));

      const foot = document.createElement("div");
      foot.className = "col-foot";
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn";
      addBtn.textContent = "+ Add card";
      addBtn.addEventListener("click", () => openNew(col.id));
      foot.appendChild(addBtn);

      colEl.appendChild(head);
      colEl.appendChild(body);
      colEl.appendChild(foot);
      boardEl.appendChild(colEl);
    });
  }

  function renderCard(card) {
    const el = document.createElement("article");
    el.className = "card";
    el.dataset.id = card.id;
    const bookClass = BOOKS.includes(card.book) ? card.book : "Ops";
    el.innerHTML =
      '<span class="badge book-' + escapeAttr(bookClass) + '">' + escapeHtml(card.book || "") + "</span>" +
      '<p class="card-title">' + escapeHtml(card.title || "") + "</p>" +
      '<p class="card-detail">' + escapeHtml(card.detail || "") + "</p>" +
      '<div class="card-meta"><span>' + escapeHtml(card.date || "—") + "</span>" +
      '<span class="owner">' + escapeHtml(card.owner || "") + "</span></div>";
    el.addEventListener("pointerdown", (e) => onCardPointerDown(e, card, el));
    return el;
  }

  function onCardPointerDown(e, card, el) {
    if (e.button !== 0) return;
    if (e.target.closest("button, a, input, select, textarea")) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const isTouch = e.pointerType === "touch";
    const delay = isTouch ? 180 : 0;
    let started = false;
    let holdTimer = null;
    const pointerId = e.pointerId;

    function startDrag() {
      if (started) return;
      started = true;
      dragging = true;
      dragCardId = card.id;
      el.classList.add("dragging");
      ghostEl = el.cloneNode(true);
      ghostEl.classList.add("ghost");
      ghostEl.style.width = el.offsetWidth + "px";
      document.body.appendChild(ghostEl);
      moveGhost(startX, startY);
      try { el.setPointerCapture(pointerId); } catch (_) {}
    }

    function moveGhost(x, y) {
      if (!ghostEl) return;
      ghostEl.style.left = x - ghostEl.offsetWidth / 2 + "px";
      ghostEl.style.top = y - 18 + "px";
    }

    function updateDropFromPoint(x, y) {
      if (ghostEl) ghostEl.style.visibility = "hidden";
      const under = document.elementFromPoint(x, y);
      if (ghostEl) ghostEl.style.visibility = "visible";
      clearDropHints();
      const overCard = under && under.closest(".card");
      const overCol = under && under.closest(".col-body");
      if (overCard && overCard.dataset.id !== card.id) {
        const rect = overCard.getBoundingClientRect();
        const before = y < rect.top + rect.height / 2;
        overCard.classList.add(before ? "drop-before" : "drop-after");
        const status = overCard.closest(".col-body").dataset.status;
        dropTarget = {
          status,
          beforeId: before ? overCard.dataset.id : nextSiblingId(overCard.dataset.id)
        };
      } else if (overCol) {
        overCol.classList.add("drag-over");
        dropTarget = { status: overCol.dataset.status, beforeId: null };
      }
      autoScroll(x, y, overCol);
    }

    function onMove(ev) {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!started) {
        // Touch: vertical move before the long-press starts = scroll the column.
        if (isTouch && Math.hypot(dx, dy) > 8) {
          cleanup(false);
          return;
        }
        if (Math.hypot(dx, dy) < 8) return;
        startDrag();
      }
      ev.preventDefault();
      moveGhost(ev.clientX, ev.clientY);
      updateDropFromPoint(ev.clientX, ev.clientY);
    }

    function onUp(ev) {
      if (ev.pointerId !== pointerId) return;
      const wasDragging = started;
      cleanup(wasDragging);
      if (wasDragging) {
        applyDrop();
      } else if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 8) {
        openEdit(card.id);
      }
    }

    function cleanup(wasDragging) {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      try { el.releasePointerCapture(pointerId); } catch (_) {}
      el.classList.remove("dragging");
      if (ghostEl) {
        ghostEl.remove();
        ghostEl = null;
      }
      if (!wasDragging) {
        dragCardId = null;
        dragging = false;
        clearDropHints();
      }
    }

    function onCancel(ev) {
      if (ev.pointerId !== pointerId) return;
      cleanup(false);
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    if (delay) {
      holdTimer = setTimeout(startDrag, delay);
    }
  }

  function autoScroll(x, y, overCol) {
    const wrap = $("boardWrap");
    const edge = 48;
    if (x < edge) wrap.scrollLeft -= 18;
    else if (x > window.innerWidth - edge) wrap.scrollLeft += 18;
    if (overCol) {
      const rect = overCol.getBoundingClientRect();
      if (y < rect.top + edge) overCol.scrollTop -= 14;
      else if (y > rect.bottom - edge) overCol.scrollTop += 14;
    }
  }

  function nextSiblingId(id) {
    const card = state.cards.find((c) => c.id === id);
    if (!card) return null;
    const siblings = cardsIn(card.status);
    const idx = siblings.findIndex((c) => c.id === id);
    if (idx < 0 || idx >= siblings.length - 1) return null;
    return siblings[idx + 1].id;
  }

  function clearDropHints() {
    document.querySelectorAll(".drop-before, .drop-after, .drag-over").forEach((n) => {
      n.classList.remove("drop-before", "drop-after", "drag-over");
    });
  }

  function applyDrop() {
    if (!dragCardId || !dropTarget) {
      clearDropHints();
      dragCardId = null;
      dragging = false;
      return;
    }
    const card = state.cards.find((c) => c.id === dragCardId);
    if (!card) {
      clearDropHints();
      dragCardId = null;
      dragging = false;
      return;
    }
    const toStatus = dropTarget.status;
    card.status = toStatus;

    const others = state.cards.filter((c) => c.id !== dragCardId);
    const destCards = others.filter((c) => c.status === toStatus);
    let insertAt;
    if (dropTarget.beforeId) {
      const bi = destCards.findIndex((c) => c.id === dropTarget.beforeId);
      insertAt = bi >= 0 ? bi : destCards.length;
    } else {
      insertAt = destCards.length;
    }
    destCards.splice(insertAt, 0, card);
    const rebuilt = [];
    const seen = new Set();
    state.columns.forEach((col) => {
      if (col.id === toStatus) {
        destCards.forEach((c) => {
          rebuilt.push(c);
          seen.add(c.id);
        });
      } else {
        others.filter((c) => c.status === col.id).forEach((c) => {
          rebuilt.push(c);
          seen.add(c.id);
        });
      }
    });
    others.forEach((c) => {
      if (!seen.has(c.id)) rebuilt.push(c);
    });
    state.cards = rebuilt;
    dragCardId = null;
    dropTarget = null;
    dragging = false;
    clearDropHints();
    render();
    scheduleSave();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function openEdit(id) {
    if (dragging) return;
    const card = state.cards.find((c) => c.id === id);
    if (!card) return;
    editingId = id;
    $("modalTitle").textContent = "Edit card";
    $("fBook").value = BOOKS.includes(card.book) ? card.book : "Ops";
    $("fTitle").value = card.title || "";
    $("fDetail").value = card.detail || "";
    $("fDate").value = card.date || "";
    $("fOwner").value = card.owner || "";
    $("fStatus").value = card.status || "backlog";
    $("btnDelete").style.display = "";
    overlay.classList.add("open");
    $("fTitle").focus();
  }

  function openNew(status) {
    editingId = null;
    $("modalTitle").textContent = "New card";
    $("fBook").value = "Ops";
    $("fTitle").value = "";
    $("fDetail").value = "";
    $("fDate").value = "";
    $("fOwner").value = "CoS";
    $("fStatus").value = status || "backlog";
    $("btnDelete").style.display = "none";
    overlay.classList.add("open");
    $("fTitle").focus();
  }

  function closeModal() {
    overlay.classList.remove("open");
    editingId = null;
  }

  function uid() {
    return "card-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function saveModal() {
    const book = $("fBook").value;
    const title = $("fTitle").value.trim();
    const detail = $("fDetail").value.trim();
    const date = $("fDate").value.trim() || "—";
    const owner = $("fOwner").value.trim();
    const status = $("fStatus").value;
    if (!title) {
      $("fTitle").focus();
      return;
    }
    if (editingId) {
      const card = state.cards.find((c) => c.id === editingId);
      if (card) Object.assign(card, { book, title, detail, date, owner, status });
    } else {
      state.cards.push({ id: uid(), book, title, detail, date, owner, status });
    }
    closeModal();
    render();
    scheduleSave();
  }

  function deleteCard() {
    if (!editingId) return;
    if (!confirm("Delete this card?")) return;
    state.cards = state.cards.filter((c) => c.id !== editingId);
    closeModal();
    render();
    scheduleSave();
  }

  $("btnCancel").addEventListener("click", closeModal);
  $("btnSave").addEventListener("click", saveModal);
  $("btnDelete").addEventListener("click", deleteCard);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) {
      e.preventDefault();
      closeModal();
    }
    if (e.key === "Enter" && overlay.classList.contains("open") && e.target && e.target.id !== "fDetail") {
      if (e.target.tagName === "TEXTAREA") return;
      e.preventDefault();
      saveModal();
    }
  });
  $("btnAddGlobal").addEventListener("click", () => openNew("backlog"));
  $("btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "vello-ops-board-" + (state.updated || "export") + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("btnImport").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.cards || !Array.isArray(data.cards)) throw new Error("Invalid board JSON");
      applyData(data);
      scheduleSave();
    } catch (err) {
      alert("Import failed: " + err.message);
    }
  });

  load();
})();
