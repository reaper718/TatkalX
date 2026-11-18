document.addEventListener("DOMContentLoaded", () => {
  const donationForm = document.getElementById("donationForm");
  const tableBody = document.getElementById("donationsTableBody");
  const messageBox = document.getElementById("message");

  // Display success/error messages
  function showMessage(message, type = "danger") {
    messageBox.innerHTML = `
            <div class="alert alert-${type} alert-dismissible fade show">
                ${escapeHtml(message)}
                <button type="button" class="btn-close"
                        data-bs-dismiss="alert"></button>
            </div>
        `;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[char],
    );
  }

  // Handle different response wrappers
  function getDonationArray(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response.donations)) return response.donations;
    if (Array.isArray(response.data?.donations)) return response.data.donations;
    if (Array.isArray(response.data)) return response.data;
    return [];
  }

  function toISODateTime(value) {
    return new Date(value).toISOString();
  }

  // CREATE DONATION
  donationForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = document.getElementById("createDonationButton");
    button.disabled = true;
    button.textContent = "Creating...";

    try {
      const preparedAt = document.getElementById("preparedAt").value;
      const pickupDeadline = document.getElementById("pickupDeadline").value;
      const safeDeadline = document.getElementById(
        "safeConsumptionDeadline",
      ).value;

      if (new Date(pickupDeadline) <= new Date()) {
        throw new Error("Pickup deadline must be in the future.");
      }

      if (new Date(safeDeadline) < new Date(pickupDeadline)) {
        throw new Error(
          "Safe consumption deadline must be after the pickup deadline.",
        );
      }

      const latitude = Number(document.getElementById("latitude").value);
      const longitude = Number(document.getElementById("longitude").value);

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw new Error("Enter valid latitude and longitude.");
      }

      const payload = {
        title: document.getElementById("title").value.trim(),
        description: document.getElementById("description").value.trim(),
        category: document.getElementById("category").value,
        dietaryType: document.getElementById("dietaryType").value,
        totalQuantity: Number(document.getElementById("totalQuantity").value),
        unit: document.getElementById("unit").value,
        preparedAt: toISODateTime(preparedAt),
        pickupDeadline: toISODateTime(pickupDeadline),
        safeConsumptionDeadline: toISODateTime(safeDeadline),
        allergens: document
          .getElementById("allergens")
          .value.split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        pickupAddress: document.getElementById("pickupAddress").value.trim(),
        latitude,
        longitude,
        storageInstructions: document
          .getElementById("storageInstructions")
          .value.trim(),
        packagingDetails: document
          .getElementById("packagingDetails")
          .value.trim(),
      };

      const result = await FoodLoopAPI.post("/donations", payload);

      showMessage(
        result.message || "Donation created successfully.",
        "success",
      );

      donationForm.reset();

      // Reload the donor's donations
      await loadMyDonations();
    } catch (error) {
      console.error("Create donation error:", error);

      showMessage(
        error.response?.data?.message ||
          error.message ||
          "Unable to create donation.",
      );
    } finally {
      button.disabled = false;
      button.textContent = "Create donation";
    }
  });

  // GET MY DONATIONS
  async function loadMyDonations() {
    tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">Loading...</td>
            </tr>
        `;

    try {
      const response = await FoodLoopAPI.get("/donations/mine");
      const donations = getDonationArray(response);

      if (donations.length === 0) {
        tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center text-muted">
                            You haven't created any donations yet.
                        </td>
                    </tr>
                `;
        return;
      }

      tableBody.innerHTML = donations
        .map((donation) => {
          const total = Number(
            donation.totalQuantity ?? donation.total_quantity ?? 0,
          );
          const reserved = Number(
            donation.reservedQuantity ?? donation.reserved_quantity ?? 0,
          );
          const allocated = Number(
            donation.allocatedQuantity ?? donation.allocated_quantity ?? 0,
          );
          const available = total - reserved - allocated;

          const status = donation.status || "UNKNOWN";
          const id = donation.id;

          const actionButton =
            status === "DRAFT"
              ? `<button class="btn btn-sm btn-success"
                               data-action="publish"
                               data-id="${escapeHtml(id)}">
                           Publish
                       </button>`
              : status === "PUBLISHED"
                ? `<button class="btn btn-sm btn-outline-danger"
                               data-action="cancel"
                               data-id="${escapeHtml(id)}">
                           Cancel
                       </button>`
                : `<span class="text-muted">No action</span>`;

          return `
                    <tr>
                        <td>
                            <strong>${escapeHtml(donation.title)}</strong>
                            <div class="small text-muted">
                                ${escapeHtml(donation.category)}
                            </div>
                        </td>
                        <td>${total} ${escapeHtml(donation.unit)}</td>
                        <td>${available} ${escapeHtml(donation.unit)}</td>
                        <td>
                            <span class="badge text-bg-secondary">
                                ${escapeHtml(status)}
                            </span>
                        </td>
                        <td>${actionButton}</td>
                    </tr>
                `;
        })
        .join("");
    } catch (error) {
      console.error("Load donations error:", error);

      tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-danger">
                        ${escapeHtml(
                          error.response?.data?.message ||
                            error.message ||
                            "Unable to load donations.",
                        )}
                    </td>
                </tr>
            `;
    }
  }

  // PUBLISH OR CANCEL DONATION
  tableBody.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const donationId = button.dataset.id;
    const action = button.dataset.action;

    const confirmed = window.confirm(
      action === "publish"
        ? "Are you sure you want to publish this donation?"
        : "Are you sure you want to cancel this donation?",
    );

    if (!confirmed) return;

    button.disabled = true;

    try {
      if (action === "publish") {
        await FoodLoopAPI.post(`/donations/${donationId}/publish`);

        showMessage("Donation published successfully.", "success");
      } else if (action === "cancel") {
        await FoodLoopAPI.post(`/donations/${donationId}/cancel`);

        showMessage("Donation cancelled successfully.", "success");
      }

      await loadMyDonations();
    } catch (error) {
      console.error(`${action} donation error:`, error);

      showMessage(
        error.response?.data?.message ||
          error.message ||
          `Unable to ${action} donation.`,
      );

      button.disabled = false;
    }
  });

  // REFRESH BUTTON
  document
    .getElementById("refreshDonationsButton")
    .addEventListener("click", loadMyDonations);

  // Initial load
  loadMyDonations();
});
