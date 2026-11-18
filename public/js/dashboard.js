document.addEventListener("DOMContentLoaded", async () => {
  const token = FoodLoopUtils.getToken();
  let user = FoodLoopUtils.getUser();
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  try {
    const me = await FoodLoopAPI.get("/auth/me");
    user = me.user || me;
    sessionStorage.setItem("foodloop_user", JSON.stringify(user));
  } catch (error) {
    // Use the login response user if /auth/me returns a different shape.
    if (!user) {
      FoodLoopUtils.clearSession();
      window.location.href = "login.html";
      return;
    }
  }

  const role = String(
    user?.systemRole || user?.system_role || "USER",
  ).toUpperCase();
  const memberships =
    user?.organizationMemberships ||
    user?.organization_memberships ||
    user?.memberships ||
    [];
  const membership = memberships[0] || {};
  const org = membership.organization || membership.Organisation || {};
  const orgType = String(
    org.type || membership.organizationType || user?.organizationType || "",
  ).toUpperCase();
  const effectiveRole = role === "ADMIN" ? "ADMIN" : orgType || "NGO";
  const name =
    user?.fullName || user?.full_name || user?.name || "FoodLoop User";

  document.getElementById("userName").textContent = name;
  document.getElementById("userRole").textContent = effectiveRole;
  document.getElementById("userInitial").textContent = name
    .charAt(0)
    .toUpperCase();
  document.getElementById("roleEyebrow").textContent =
    `${effectiveRole} WORKSPACE`;

  const nav =
    {
      DONOR: [
        ["Overview", "overview"],
        ["Create donation", "create"],
        ["My donations", "donations"],
        ["Reservations", "reservations"],
        ["Allocations", "allocations"],
      ],
      NGO: [
        ["Overview", "overview"],
        ["Nearby donations", "nearby"],
        ["My reservations", "reservations"],
        ["My allocations", "allocations"],
      ],
      ADMIN: [
        ["Overview", "overview"],
        ["Pending organizations", "pending"],
        ["All organizations", "organizations"],
        ["Donations", "admin-donations"],
        ["Audit logs", "audit"],
      ],
    }[effectiveRole] || [];

  const navEl = document.getElementById("sidebarNav");
  navEl.innerHTML = nav
    .map(
      (item, i) =>
        `<a class="nav-link ${i === 0 ? "active" : ""}" href="#" data-view="${item[1]}">${item[0]}</a>`,
    )
    .join("");
  document.getElementById("logoutButton").addEventListener("click", () => {
    FoodLoopUtils.clearSession();
    window.location.href = "login.html";
  });
  navEl.addEventListener("click", (event) => {
    const link = event.target.closest("[data-view]");
    if (!link) return;
    event.preventDefault();
    navEl
      .querySelectorAll(".nav-link")
      .forEach((a) => a.classList.remove("active"));
    link.classList.add("active");
    renderView(effectiveRole, link.dataset.view);
  });
  renderView(effectiveRole, "overview");
});

const esc = FoodLoopUtils.escapeHtml;

async function renderView(role, view) {
  const content = document.getElementById("dashboardContent");
  const titles = {
    overview: "Dashboard",
    create: "Create donation",
    donations: "My donations",
    reservations:
      role === "DONOR" ? "Incoming reservations" : "My reservations",
    allocations: "Allocations",
    nearby: "Nearby donations",
    pending: "Pending organizations",
    organizations: "Organizations",
    "admin-donations": "All donations",
    audit: "Audit logs",
  };
  document.getElementById("pageTitle").textContent =
    titles[view] || "Dashboard";
  content.innerHTML = `<div class="empty-state">Loading…</div>`;
  try {
    if (view === "overview") return await renderOverview(role, content);
    if (view === "create") return renderCreateDonation(content);
    if (view === "donations") return await renderDonations(content);
    if (view === "nearby") return await renderNearby(content);
    if (view === "reservations") return await renderReservations(role, content);
    if (view === "allocations") return await renderAllocations(role,content);
    if (view === "pending") return await renderPendingOrganizations(content);
    if (view === "organizations") return await renderOrganizations(content);
    if (view === "admin-donations") return await renderAdminDonations(content);
    if (view === "audit") return await renderAuditLogs(content);
  } catch (error) {
    content.innerHTML = `<div class="alert alert-danger">${esc(error.response?.data?.message || error.message || "Could not load this page")}</div>`;
  }
}

async function renderOverview(role, el) {
  let primary = [];
  try {
    if (role === "DONOR")
      primary = asArray(await FoodLoopAPI.get("/donations/mine"));
    else if (role === "NGO")
      primary = asArray(await FoodLoopAPI.get("/reservations/mine"));
    else
      primary = asArray(await FoodLoopAPI.get("/admin/organizations/pending"));
  } catch {}
  const label =
    role === "DONOR"
      ? "Your donations"
      : role === "NGO"
        ? "Your reservations"
        : "Pending organizations";
  el.innerHTML = `
    <div class="row g-3 mb-4">
      <div class="col-md-4"><div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${primary.length}</div></div></div>
      <div class="col-md-4"><div class="stat-card"><div class="stat-label">Workspace</div><div class="stat-value fs-4">${role}</div></div></div>
      <div class="col-md-4"><div class="stat-card"><div class="stat-label">Pilot location</div><div class="stat-value fs-4">Indore</div></div></div>
    </div>
    <div class="panel"><div class="panel-title">Getting started</div>
      <p class="muted mb-2">${role === "DONOR" ? "Publish a donation, then review incoming NGO reservations." : role === "NGO" ? "Find nearby surplus food, request a quantity, and track approved allocations." : "Review pending organizations before they participate in FoodLoop."}</p>
      <p class="small muted mb-0">The counts above are live API results where the corresponding endpoint is available.</p>
    </div>`;
}

function detectPickupLocation() {
  const latitudeInput = document.getElementById("latitude");
  const longitudeInput = document.getElementById("longitude");
  const status = document.getElementById("locationStatus");
  const button = document.getElementById("detectLocationBtn");

  if (!navigator.geolocation) {
    status.textContent = "Geolocation is not supported by your browser.";
    return;
  }

  status.textContent = "Getting your location...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      latitudeInput.value = latitude;
      longitudeInput.value = longitude;

      status.textContent = "Location detected successfully.";
    },
    (error) => {
      console.error("Geolocation error:", error);

      const messages = {
        1: "Location permission denied. Please allow access.",
        2: "Unable to determine your location.",
        3: "Location request timed out."
      };

      status.textContent =
        messages[error.code] || "Could not detect your location.";
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

function renderCreateDonation(el) {
  el.innerHTML = `
  <form id="createDonationForm" class="form-section">
    <div class="section-heading">Donation information</div>
    <div class="row g-3">
      ${field("title", "Food title", "text", true, "e.g. Fresh vegetarian meals")}
      ${field("category", "Category", "text", true, "e.g. PREPARED_MEALS")}
      <div class="col-md-6"><label class="form-label">Dietary type</label><select class="form-select" id="dietaryType"><option value="UNKNOWN">Unknown</option><option>VEGETARIAN</option><option>NON_VEGETARIAN</option><option>VEGAN</option></select></div>
      ${field("totalQuantity", "Total quantity", "number", true, "100")}
      ${field("unit", "Unit", "text", true, "MEALS")}
      ${field("preparedAt", "Prepared at", "datetime-local", false)}
      ${field("pickupDeadline", "Pickup deadline", "datetime-local", true)}
      ${field("safeDeadline", "Safe consumption deadline", "datetime-local", false)}
      <div class="col-12"><label class="form-label">Description</label><textarea class="form-control" id="description" rows="2"></textarea></div>
      <div class="col-md-6"><label class="form-label">Storage instructions</label><textarea class="form-control" id="storageInstructions" rows="2"></textarea></div>
      <div class="col-md-6"><label class="form-label">Packaging details</label><textarea class="form-control" id="packagingDetails" rows="2"></textarea></div>
      <div class="col-12"><label class="form-label">Known allergens (comma-separated)</label><input class="form-control" id="allergens" placeholder="e.g. peanuts, dairy"></div>
      <div class="col-12"><div class="section-heading mt-3">Pickup location</div></div>
      ${field("pickupAddress", "Pickup address", "text", true, "Full pickup address")}
      <div class="col-12">
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <button type="button" class="btn btn-outline-primary" id="detectLocationBtn">
          <i class="bi bi-geo-alt"></i> Use my current location
        </button>
        <span id="locationStatus" class="small muted">
          Detecting your location...
        </span>
      </div>
    </div>

    ${field("latitude", "Latitude", "number", true, "Detecting...", "any")}
    ${field("longitude", "Longitude", "number", true, "Detecting...", "any")}
    </div>
    <div class="d-flex gap-2 mt-4"><button class="btn btn-primary" type="submit">Create donation draft</button></div>
    <p class="small muted mt-3 mb-0">After creating the draft, publish it from My donations if your backend has the publish endpoint enabled.</p>
  </form>`;
  detectPickupLocation();

  document
    .getElementById("detectLocationBtn")
    .addEventListener("click", detectPickupLocation);
    
  document
    .getElementById("createDonationForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        title: val("title"),
        category: val("category"),
        dietaryType: val("dietaryType"),
        totalQuantity: Number(val("totalQuantity")),
        unit: val("unit"),
        preparedAt: toIso("preparedAt"),
        pickupDeadline: toIso("pickupDeadline"),
        safeConsumptionDeadline: toIso("safeDeadline"),
        description: val("description"),
        storageInstructions: val("storageInstructions"),
        packagingDetails: val("packagingDetails"),
        allergens: val("allergens")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        pickupAddress: val("pickupAddress"),
        latitude: Number(val("latitude")),
        longitude: Number(val("longitude")),
      };
      try {
        const created = await FoodLoopAPI.post("/donations", payload);
        FoodLoopUtils.showAlert(
          "Donation draft created successfully.",
          "success",
        );
        e.target.reset();
      } catch (error) {
        FoodLoopUtils.showAlert(error.response?.data?.message || error.message);
      }
    });
}

async function renderDonations(el) {
  const items = asArray(await FoodLoopAPI.get("/donations/mine"));
  if (!items.length)
    return (el.innerHTML = empty(
      "No donations yet",
      "Create your first surplus-food donation.",
    ));
  el.innerHTML = `<div class="panel"><div class="panel-title">Your donations</div><div class="table-responsive"><table class="table"><thead><tr><th>Donation</th><th>Quantity</th><th>Available</th><th>Deadline</th><th>Status</th><th>Action</th></tr></thead><tbody>
  ${items.map((d) => `<tr><td><strong>${esc(d.title)}</strong><div class="small muted">${esc(d.category)}</div></td><td>${esc(d.total_quantity ?? d.totalQuantity)} ${esc(d.unit)}</td><td>${available(d)}</td><td>${FoodLoopUtils.formatDate(d.pickup_deadline || d.pickupDeadline)}</td><td>${statusBadge(d.status)}</td><td>${String(d.status).toUpperCase() === "DRAFT" ? `<button class="btn btn-sm btn-primary" data-publish="${esc(d.id)}">Publish</button>` : "—"}</td></tr>`).join("")}
  </tbody></table></div></div>`;
  el.querySelectorAll("[data-publish]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        await FoodLoopAPI.post(`/donations/${btn.dataset.publish}/publish`, {});
        await renderDonations(el);
      } catch (e) {
        FoodLoopUtils.showAlert(e.response?.data?.message || e.message);
      }
    }),
  );
}

async function renderNearby(el) {
  el.innerHTML = `<div class="panel mb-3"><form id="nearbyForm" class="row g-2 align-items-end"><div class="col-sm-4"><label class="form-label">Search radius (meters)</label><input class="form-control" id="radius" type="number" value="10000" min="500" max="50000"></div><div class="col-sm-4"><label class="form-label">Category (optional)</label><input class="form-control" id="categoryFilter" placeholder="PREPARED_MEALS"></div><div class="col-sm-4"><button class="btn btn-primary w-100">Search donations</button></div></form></div><div id="nearbyResults"></div>`;
  const search = async (e) => {
    if (e) e.preventDefault();
    const params = { radius: Number(val("radius")), page: 1, limit: 30 };
    if (val("categoryFilter")) params.category = val("categoryFilter");
    const results = asArray(
      await FoodLoopAPI.get("/discover/donations/nearby", { params }),
    );
    const target = document.getElementById("nearbyResults");
    target.innerHTML = results.length
      ? `<div class="row g-3">${results
          .map(
            (d) => `
      <div class="col-md-6 col-xl-4"><div class="donation-card">
        <div class="d-flex justify-content-between"><span class="badge badge-soft">${esc(d.category)}</span><span class="donation-meta">${d.distanceMeters ?? d.distance_meters ?? "—"} m away</span></div>
        <h5 class="mt-3">${esc(d.title)}</h5><p class="donation-meta">${esc(d.description || "Surplus food available for collection.")}</p>
        <div class="small mb-2"><strong>${available(d)}</strong> ${esc(d.unit || "")} available</div>
        <div class="donation-meta mb-3">Pickup by ${FoodLoopUtils.formatDate(d.pickupDeadline || d.pickup_deadline)}</div>
        <form class="request-form" data-id="${esc(d.id)}"><div class="input-group"><input class="form-control" type="number" min="0.01" step="0.01" name="quantity" placeholder="Quantity" required><button class="btn btn-primary">Request</button></div></form>
      </div></div>`,
          )
          .join("")}</div>`
      : empty(
          "No matching donations",
          "Try increasing the search radius or changing the category.",
        );
    target.querySelectorAll(".request-form").forEach((form) =>
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const quantity = Number(new FormData(form).get("quantity"));
        try {
          await FoodLoopAPI.post(
            `/donations/${form.dataset.id}/reservations`,
            { quantity },
            { headers: { "Idempotency-Key": crypto.randomUUID() } },
          );
          FoodLoopUtils.showAlert("Reservation request submitted.", "success");
          form.reset();
        } catch (err) {
          FoodLoopUtils.showAlert(err.response?.data?.message || err.message);
        }
      }),
    );
  };
  document.getElementById("nearbyForm").addEventListener("submit", search);
  await search();
}

async function renderReservations(role, el) {
  const donor = role === "DONOR";
  const items = donor
    ? await fetchDonationReservationsForDonor()
    : asArray(await FoodLoopAPI.get("/reservations/mine"));
  if (!items.length)
    return (el.innerHTML = empty(
      "No reservations found",
      "Reservation requests will appear here.",
    ));
  el.innerHTML = `<div class="panel"><div class="panel-title">${donor ? "Incoming NGO requests" : "Your reservation requests"}</div><div class="table-responsive"><table class="table"><thead><tr><th>Reservation</th><th>Quantity</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead><tbody>
  ${items.map((r) => `<tr><td><strong>${esc(r.donation?.title || r.donation_title || r.donatonId)}</strong><div class="small muted">${esc(r.ngo?.name || r.ngoOrganization?.name || r.ngo_organization?.name || "")}</div></td><td>${esc(r.quantity)}</td><td>${statusBadge(r.status)}</td><td>${FoodLoopUtils.formatDate(r.expires_at || r.expiresAt)}</td><td>${donor && String(r.status).toUpperCase() === "PENDING" ? `<button class="btn btn-sm btn-primary me-1" data-approve="${esc(r.reservationId || r.id)}">Approve</button><button class="btn btn-sm btn-outline-danger" data-reject="${esc(r.reservationId || r.id)}">Reject</button>` : "—"}</td></tr>`).join("")}
  </tbody></table></div></div>`;
  el.querySelectorAll("[data-approve]").forEach((b) =>
    b.addEventListener("click", () =>
      reservationAction(b.dataset.approve, "approve", el, role),
    ),
  );
  el.querySelectorAll("[data-reject]").forEach((b) =>
    b.addEventListener("click", () =>
      reservationAction(b.dataset.reject, "reject", el, role),
    ),
  );
}

async function fetchDonationReservationsForDonor() {
  const donations = asArray(await FoodLoopAPI.get("/donations/mine"));
  const groups = await Promise.all(
    donations.map((d) =>
      FoodLoopAPI.get(`/donations/${d.id}/reservations`).catch(() => []),
    ),
  );
  // return groups.flatMap(asArray);

  const reservations = groups.flatMap(asArray);

  console.log("Reservation API response:", reservations);

  return reservations;
}
async function reservationAction(id, action, el, role) {
  try {
    await FoodLoopAPI.post(`/reservations/${id}/${action}`, {});
    await renderReservations(role, el);
  } catch (e) {
    FoodLoopUtils.showAlert(e.response?.data?.message || e.message);
  }
}

async function renderAllocations(role, el) {
  const items = asArray(await FoodLoopAPI.get("/allocations/mine"));

  if (!items.length)
    return (el.innerHTML = empty(
      "No allocations yet",
      "Approved reservations will become allocations."
    ));

  el.innerHTML = `
    <div class="panel">
      <div class="panel-title">Allocations</div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Allocation</th>
              <th>Status</th>
              <th>Confirmed</th>
              <th>Update status</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((a) => {
              const status = String(a.status).toUpperCase();

              let options = "";

              if (role === "DONOR" && status === "READY_FOR_PICKUP") {
                options = `<option value="PICKED_UP">PICKED UP</option>`;
              }

              if (role === "NGO" && status === "PICKED_UP") {
                options = `<option value="DELIVERED">DELIVERED</option>`;
              }

              if (role === "ADMIN") {
                options = `
                  <option value="PICKED_UP">PICKED UP</option>
                  <option value="DELIVERED">DELIVERED</option>
                  <option value="FAILED">FAILED</option>
                `;
              }

              return `
                <tr>
                  <td>${esc(a.id)}</td>
                  <td>${statusBadge(a.status)}</td>
                  <td>${FoodLoopUtils.formatDate(a.confirmed_at || a.confirmedAt)}</td>
                  <td>
                    ${
                      options
                        ? `<select class="form-select form-select-sm allocation-status" data-id="${esc(a.id)}">
                             <option value="">Choose...</option>
                             ${options}
                           </select>`
                        : "—"
                    }
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  el.querySelectorAll(".allocation-status").forEach((s) =>
    s.addEventListener("change", async () => {
      if (!s.value) return;

      try {
        await FoodLoopAPI.patch(`/allocations/${s.dataset.id}/status`, {
          status: s.value,
        });

        await renderAllocations(role, el);
      } catch (e) {
        FoodLoopUtils.showAlert(
          e.response?.data?.message || e.message
        );
        s.value = "";
      }
    })
  );
}

async function renderPendingOrganizations(el) {
  const items = asArray(await FoodLoopAPI.get("/admin/organizations/pending"));
  if (!items.length)
    return (el.innerHTML = empty(
      "No pending organizations",
      "New registrations awaiting review will appear here.",
    ));
  el.innerHTML = `<div class="panel"><div class="panel-title">Organizations awaiting verification</div><div class="table-responsive"><table class="table"><thead><tr><th>Organization</th><th>Type</th><th>Location</th><th>Action</th></tr></thead><tbody>
  ${items.map((o) => `<tr><td><strong>${esc(o.name)}</strong><div class="small muted">${esc(o.email || "")}</div></td><td>${esc(o.type)}</td><td>${esc(o.city || o.address || "—")}</td><td><button class="btn btn-sm btn-primary me-1" data-verify="${esc(o.id)}">Verify</button><button class="btn btn-sm btn-outline-danger" data-reject-org="${esc(o.id)}">Reject</button></td></tr>`).join("")}
  </tbody></table></div></div>`;
  el.querySelectorAll("[data-verify]").forEach((b) =>
    b.addEventListener("click", () =>
      verifyOrg(b.dataset.verify, "VERIFIED", el),
    ),
  );
  el.querySelectorAll("[data-reject-org]").forEach((b) =>
    b.addEventListener("click", () =>
      verifyOrg(b.dataset.rejectOrg, "REJECTED", el),
    ),
  );
}
async function verifyOrg(id, status, el) {
  try {
    await FoodLoopAPI.patch(`/admin/organizations/${id}/verification`, {
      status,
    });
    await renderPendingOrganizations(el);
  } catch (e) {
    FoodLoopUtils.showAlert(e.response?.data?.message || e.message);
  }
}

async function renderOrganizations(el) {
  const items = asArray(await FoodLoopAPI.get("/admin/organizations"));
  el.innerHTML = tableSimple(
    items,
    ["name", "type", "city", "verification_status"],
    "Organizations",
  );
}
async function renderAdminDonations(el) {
  const items = asArray(await FoodLoopAPI.get("/admin/donations"));
  el.innerHTML = tableSimple(
    items,
    ["title", "category", "status", "pickup_deadline"],
    "Donations",
  );
}
async function renderAuditLogs(el) {
  const items = asArray(await FoodLoopAPI.get("/admin/audit-logs"));
  el.innerHTML = tableSimple(
    items,
    ["action", "entity_type", "entity_id", "created_at"],
    "Audit logs",
  );
}

function tableSimple(items, keys, title) {
  if (!items.length)
    return empty(
      `No ${title.toLowerCase()} found`,
      "Records will appear here when available.",
    );
  return `<div class="panel"><div class="panel-title">${title}</div><div class="table-responsive"><table class="table"><thead><tr>${keys.map((k) => `<th>${esc(k.replaceAll("_", " "))}</th>`).join("")}</tr></thead><tbody>${items.map((row) => `<tr>${keys.map((k) => `<td>${esc(row[k] ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
}
function field(
  id,
  label,
  type = "text",
  required = false,
  placeholder = "",
  step,
) {
  return `<div class="col-md-6"><label class="form-label" for="${id}">${label}</label><input class="form-control" id="${id}" type="${type}" ${required ? "required" : ""} ${placeholder ? `placeholder="${placeholder}"` : ""} ${step ? `step="${step}"` : ""}></div>`;
}
function val(id) {
  return document.getElementById(id)?.value?.trim() || "";
}
function toIso(id) {
  const v = val(id);
  return v ? new Date(v).toISOString() : null;
}
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.organizations)) return value.organizations;
  if (Array.isArray(value?.donations)) return value.donations;
  if (Array.isArray(value?.reservations)) return value.reservations;
  if (Array.isArray(value?.allocations)) return value.allocations;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}
function available(d) {
  const total = Number(d.total_quantity ?? d.totalQuantity ?? 0),
    reserved = Number(d.reserved_quantity ?? d.reservedQuantity ?? 0),
    allocated = Number(d.allocated_quantity ?? d.allocatedQuantity ?? 0);
  return (
    d.availableQuantity ?? d.available_quantity ?? total - reserved - allocated
  );
}
function statusBadge(status) {
  const s = String(status || "UNKNOWN").toUpperCase();
  const cls = ["VERIFIED", "PUBLISHED", "DELIVERED", "PICKED_UP"].includes(s)
    ? "badge-soft"
    : ["PENDING", "DRAFT", "READY_FOR_PICKUP"].includes(s)
      ? "badge-pending"
      : "badge-danger-soft";
  return `<span class="badge ${cls}">${esc(s.replaceAll("_", " "))}</span>`;
}
function empty(title, desc) {
  return `<div class="empty-state"><strong>${esc(title)}</strong>${esc(desc)}</div>`;
}
