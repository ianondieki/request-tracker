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

// When set, the form is editing an existing request instead of creating one.
let editingId = null;

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
  submitBtn: document.getElementById("submit-btn"),
  editingBanner: document.getElementById("editing-banner"),
  editingRef: document.getElementById("editing-ref"),
  cancelEdit: document.getElementById("cancel-edit"),
  formPanel: document.querySelector(".panel-form"),
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
  el.cancelEdit.addEventListener("click", cancelEditing);

  // Clear a field's error as soon as the user starts fixing it.
  el.form.addEventListener("input", (event) => {
    const name = event.target.name;
    if (name && validators[name]) setFieldError(name, "");
  });

  // Keep relative timestamps ("5 min ago") fresh without re-rendering the list.
  setInterval(() => {
    document.querySelectorAll(".req-time").forEach((time) => {
      time.textContent = formatTimeLabel(time.getAttribute("datetime"), time.dataset.edited === "true");
    });
  }, 60_000);

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

  if (editingId) {
    // Update the existing request, keeping its ref, status and created time.
    const req = requests.find((r) => r.id === editingId);
    if (req) {
      Object.assign(req, {
        name: values.name.trim(),
        email: values.email.trim(),
        product: values.product,
        type: values.type,
        priority: values.priority,
        message: values.message.trim(),
        updatedAt: new Date().toISOString(),
      });
      Storage.saveRequests(requests);
      showToast(`${req.ref} updated`);
    }
    cancelEditing();
    render();
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

/** Load an existing request into the form so it can be edited. */
function startEditing(id) {
  const req = requests.find((r) => r.id === id);
  if (!req) return;

  editingId = id;

  el.form.elements.name.value = req.name;
  el.form.elements.email.value = req.email;
  el.form.elements.product.value = req.product;
  el.form.elements.type.value = req.type;
  el.form.elements.message.value = req.message;
  const radio = el.form.querySelector(`input[name="priority"][value="${req.priority}"]`);
  if (radio) radio.checked = true;

  el.editingRef.textContent = req.ref;
  el.editingBanner.hidden = false;
  el.submitBtn.textContent = "Save changes";
  el.formPanel.classList.add("editing");

  el.formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  el.form.elements.name.focus();
}

/** Leave edit mode and return the form to its blank "create" state. */
function cancelEditing() {
  editingId = null;
  el.form.reset();
  el.editingBanner.hidden = true;
  el.submitBtn.textContent = "Add to queue";
  el.formPanel.classList.remove("editing");
  for (const name of Object.keys(validators)) setFieldError(name, "");
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

    const edited = Boolean(req.updatedAt);

    item.innerHTML = `
      <div class="card-top">
        <span class="req-id">${req.ref}</span>
        <time class="req-time" datetime="${req.createdAt}" data-edited="${edited}">${formatTimeLabel(req.createdAt, edited)}</time>
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
          <button type="button" class="btn-card btn-edit" aria-label="Edit ${req.ref}">Edit</button>
          <button type="button" class="btn-card btn-delete" aria-label="Delete ${req.ref}">Delete</button>
        </div>
      </div>
    `;

    item.querySelector(".status-select").addEventListener("change", (e) => {
      updateStatus(req.id, e.target.value);
    });

    item.querySelector(".btn-edit").addEventListener("click", () => {
      startEditing(req.id);
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
    const button = document.createElement("button");
    button.type = "button";
    button.className = "legend-btn";
    button.innerHTML = `<span class="dot" style="background:${STATUS_COLORS[status]}"></span>${status} ${counts[status]}`;

    // The legend doubles as a filter: click a status to filter by it, click again to clear.
    const isActive = filters.status === status;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.addEventListener("click", () => {
      filters.status = isActive ? "" : status;
      el.filterStatus.value = filters.status;
      el.filterStatus.classList.toggle("active", filters.status !== "");
      render();
    });

    li.appendChild(button);
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
  if (editingId === id) cancelEditing(); // don't leave the form editing a ghost
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

/** "just now", "5 min ago", "2 h ago", or a date for older requests; marks edited ones. */
function formatTimeLabel(isoString, edited = false) {
  const seconds = Math.floor((Date.now() - new Date(isoString)) / 1000);
  let label;
  if (seconds < 60) label = "just now";
  else if (seconds < 3600) label = `${Math.floor(seconds / 60)} min ago`;
  else if (seconds < 86400) label = `${Math.floor(seconds / 3600)} h ago`;
  else if (seconds < 604800) label = `${Math.floor(seconds / 86400)} d ago`;
  else
    label = new Date(isoString).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return edited ? `${label} · edited` : label;
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
