/* ============================================================
   app.js — Request Tracker
   Structure:
     1. CONFIG        — options shown in the form & filters
     2. STATE         — requests + active filters
     3. ELEMENTS      — cached DOM lookups
     4. SETUP         — populate selects, wire events
     5. FORM          — validation + submit
     6. RENDERING     — queue, meter, counts, empty states
     7. ACTIONS       — status change, delete, CSV export
     8. HELPERS       — escaping, time formatting, toast
   ============================================================ */

/* ---------------- 1. CONFIG ---------------- */

// Update PRODUCTS with the options provided in the recruitment email.
const PRODUCTS = ["Photomed", "Photomed Web", "Photomed Mobile", "Other"];

const REQUEST_TYPES = ["Bug", "Feature Request", "General Feedback", "Partnership", "Other"];
const PRIORITIES = ["Low", "Medium", "High"];
const STATUSES = ["New", "In Review", "Resolved", "Rejected"];

const STATUS_COLORS = {
  New: "var(--status-new)",
  "In Review": "var(--status-review)",
  Resolved: "var(--status-resolved)",
  Rejected: "var(--status-rejected)",
};

/* ---------------- 2. STATE ---------------- */

let requests = Storage.loadRequests();

const filters = {
  search: "",
  status: "",
  type: "",
  priority: "",
  product: "",
};

/* ---------------- 3. ELEMENTS ---------------- */

const el = {
  form: document.getElementById("request-form"),
  productSelect: document.getElementById("product"),
  typeSelect: document.getElementById("type"),
  priorityGroup: document.getElementById("priority-group"),
  list: document.getElementById("request-list"),
  emptyState: document.getElementById("empty-state"),
  queueCount: document.getElementById("queue-count"),
  meterBar: document.getElementById("meter-bar"),
  meterLegend: document.getElementById("meter-legend"),
  searchInput: document.getElementById("search-input"),
  filterStatus: document.getElementById("filter-status"),
  filterType: document.getElementById("filter-type"),
  filterPriority: document.getElementById("filter-priority"),
  filterProduct: document.getElementById("filter-product"),
  clearFilters: document.getElementById("clear-filters"),
  exportCsv: document.getElementById("export-csv"),
  toast: document.getElementById("toast"),
};

/* ---------------- 4. SETUP ---------------- */

function populateSelect(select, options) {
  for (const option of options) {
    const opt = document.createElement("option");
    opt.value = option;
    opt.textContent = option;
    select.appendChild(opt);
  }
}

function populateFilterSelect(select, label, options) {
  const all = document.createElement("option");
  all.value = "";
  all.textContent = label;
  select.appendChild(all);
  populateSelect(select, options);
}

function buildPriorityPills() {
  for (const priority of PRIORITIES) {
    const label = document.createElement("label");
    label.className = "priority-pill";
    label.dataset.priority = priority;
    label.innerHTML = `
      <input type="radio" name="priority" value="${priority}" />
      <span>${priority}</span>
    `;
    el.priorityGroup.appendChild(label);
  }
}

function init() {
  populateSelect(el.productSelect, PRODUCTS);
  populateSelect(el.typeSelect, REQUEST_TYPES);
  buildPriorityPills();

  populateFilterSelect(el.filterStatus, "All statuses", STATUSES);
  populateFilterSelect(el.filterType, "All types", REQUEST_TYPES);
  populateFilterSelect(el.filterPriority, "All priorities", PRIORITIES);
  populateFilterSelect(el.filterProduct, "All products", PRODUCTS);

  el.form.addEventListener("submit", handleSubmit);

  el.searchInput.addEventListener("input", () => {
    filters.search = el.searchInput.value.trim().toLowerCase();
    render();
  });

  const filterMap = [
    [el.filterStatus, "status"],
    [el.filterType, "type"],
    [el.filterPriority, "priority"],
    [el.filterProduct, "product"],
  ];

  for (const [select, key] of filterMap) {
    select.addEventListener("change", () => {
      filters[key] = select.value;
      select.classList.toggle("active", select.value !== "");
      render();
    });
  }

  el.clearFilters.addEventListener("click", clearAllFilters);
  el.exportCsv.addEventListener("click", exportCsv);

  render();
}

/* ---------------- 5. FORM ---------------- */

const validators = {
  name: (value) => (value.trim() ? "" : "Enter your full name."),
  email: (value) => {
    if (!value.trim()) return "Enter your email address.";
    // Simple shape check: text@text.text
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? "" : "That email doesn't look right.";
  },
  product: (value) => (value ? "" : "Select a product."),
  type: (value) => (value ? "" : "Select a request type."),
  priority: (value) => (value ? "" : "Choose a priority."),
  message: (value) =>
    value.trim().length >= 10 ? "" : "Add a little more detail (at least 10 characters).",
};

function setFieldError(name, message) {
  const errorEl = el.form.querySelector(`[data-error-for="${name}"]`);
  const field = errorEl.closest(".field");
  errorEl.textContent = message;
  field.classList.toggle("invalid", Boolean(message));
}

function handleSubmit(event) {
  event.preventDefault();

  const data = new FormData(el.form);
  const values = {
    name: data.get("name") || "",
    email: data.get("email") || "",
    product: data.get("product") || "",
    type: data.get("type") || "",
    priority: data.get("priority") || "",
    message: data.get("message") || "",
  };

  let firstInvalid = null;
  for (const [name, validate] of Object.entries(validators)) {
    const message = validate(values[name]);
    setFieldError(name, message);
    if (message && !firstInvalid) firstInvalid = name;
  }

  if (firstInvalid) {
    const input = el.form.querySelector(`[name="${firstInvalid}"]`);
    if (input) input.focus();
    return;
  }

  const request = {
    id: crypto.randomUUID(),
    ref: `REQ-${String(Storage.nextSequence()).padStart(4, "0")}`,
    name: values.name.trim(),
    email: values.email.trim(),
    product: values.product,
    type: values.type,
    priority: values.priority,
    message: values.message.trim(),
    status: "New",
    createdAt: new Date().toISOString(),
  };

  requests.unshift(request); // newest first
  Storage.saveRequests(requests);

  el.form.reset();
  showToast(`${request.ref} added to the queue`);
  render();
}

/* ---------------- 6. RENDERING ---------------- */

function getVisibleRequests() {
  return requests.filter((req) => {
    if (filters.status && req.status !== filters.status) return false;
    if (filters.type && req.type !== filters.type) return false;
    if (filters.priority && req.priority !== filters.priority) return false;
    if (filters.product && req.product !== filters.product) return false;

    if (filters.search) {
      const haystack = `${req.name} ${req.email} ${req.message} ${req.ref}`.toLowerCase();
      if (!haystack.includes(filters.search)) return false;
    }

    return true;
  });
}

function render() {
  const visible = getVisibleRequests();

  renderList(visible);
  renderMeter();
  renderEmptyState(visible);

  el.queueCount.textContent =
    visible.length === requests.length ? requests.length : `${visible.length} / ${requests.length}`;

  const anyFilterActive =
    filters.search || filters.status || filters.type || filters.priority || filters.product;
  el.clearFilters.hidden = !anyFilterActive;
}

function renderList(visible) {
  el.list.innerHTML = "";

  for (const req of visible) {
    const item = document.createElement("li");
    item.className = "request-card";
    item.dataset.status = req.status;

    const statusOptions = STATUSES.map(
      (s) => `<option value="${s}" ${s === req.status ? "selected" : ""}>${s}</option>`
    ).join("");

    item.innerHTML = `
      <div class="card-top">
        <span class="req-id">${req.ref}</span>
        <time class="req-time" datetime="${req.createdAt}">${formatRelativeTime(req.createdAt)}</time>
      </div>
      <h3 class="card-title">${escapeHtml(req.name)}</h3>
      <p class="card-email">${escapeHtml(req.email)}</p>
      <p class="card-message">${escapeHtml(req.message)}</p>
      <div class="card-meta">
        <span class="tag">${escapeHtml(req.product)}</span>
        <span class="tag">${req.type}</span>
        <span class="tag tag-priority-${req.priority}">${req.priority} priority</span>
        <div class="card-actions">
          <select class="status-select" aria-label="Status for ${req.ref}">${statusOptions}</select>
          <button type="button" class="btn-delete" aria-label="Delete ${req.ref}">Delete</button>
        </div>
      </div>
    `;

    item.querySelector(".status-select").addEventListener("change", (e) => {
      updateStatus(req.id, e.target.value);
    });

    item.querySelector(".btn-delete").addEventListener("click", () => {
      deleteRequest(req.id, req.ref);
    });

    el.list.appendChild(item);
  }
}

function renderMeter() {
  el.meterBar.innerHTML = "";
  el.meterLegend.innerHTML = "";

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const req of requests) counts[req.status] = (counts[req.status] || 0) + 1;

  for (const status of STATUSES) {
    if (counts[status] > 0) {
      const seg = document.createElement("div");
      seg.className = "seg";
      seg.style.flexGrow = counts[status];
      seg.style.background = STATUS_COLORS[status];
      el.meterBar.appendChild(seg);
    }

    const li = document.createElement("li");
    li.innerHTML = `<span class="dot" style="background:${STATUS_COLORS[status]}"></span>${status} ${counts[status]}`;
    el.meterLegend.appendChild(li);
  }
}

function renderEmptyState(visible) {
  const isEmpty = visible.length === 0;
  el.emptyState.hidden = !isEmpty;

  if (isEmpty) {
    const title = el.emptyState.querySelector(".empty-title");
    const sub = el.emptyState.querySelector(".empty-sub");
    if (requests.length === 0) {
      title.textContent = "The queue is empty";
      sub.textContent = "Submit a request with the form to see it appear here.";
    } else {
      title.textContent = "No matching requests";
      sub.textContent = "Try a different search term or clear the filters.";
    }
  }
}

/* ---------------- 7. ACTIONS ---------------- */

function updateStatus(id, status) {
  const req = requests.find((r) => r.id === id);
  if (!req) return;
  req.status = status;
  Storage.saveRequests(requests);
  render();
}

function deleteRequest(id, ref) {
  const confirmed = window.confirm(`Delete ${ref}? This can't be undone.`);
  if (!confirmed) return;
  requests = requests.filter((r) => r.id !== id);
  Storage.saveRequests(requests);
  showToast(`${ref} deleted`);
  render();
}

function clearAllFilters() {
  filters.search = "";
  filters.status = "";
  filters.type = "";
  filters.priority = "";
  filters.product = "";

  el.searchInput.value = "";
  for (const select of [el.filterStatus, el.filterType, el.filterPriority, el.filterProduct]) {
    select.value = "";
    select.classList.remove("active");
  }

  render();
}

function exportCsv() {
  if (requests.length === 0) {
    showToast("Nothing to export yet");
    return;
  }

  const headers = ["Ref", "Name", "Email", "Product", "Type", "Priority", "Status", "Created", "Message"];
  const rows = requests.map((r) =>
    [r.ref, r.name, r.email, r.product, r.type, r.priority, r.status, r.createdAt, r.message]
      .map(csvEscape)
      .join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `requests-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/* ---------------- 8. HELPERS ---------------- */

/** Prevent user-typed text from being interpreted as HTML (XSS protection). */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/** Wrap a CSV value in quotes and escape any quotes inside it. */
function csvEscape(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** "just now", "5 min ago", "2 h ago", or a date for older requests. */
function formatRelativeTime(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} d ago`;
  return new Date(isoString).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

let toastTimer;
function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2600);
}

/* ---------------- Boot ---------------- */

init();
