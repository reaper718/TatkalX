(function () {
  const baseURL = window.FOODLOOP_CONFIG.API_BASE_URL;
  const http = axios.create({ baseURL, timeout: 15000 });

  http.interceptors.request.use((config) => {
    const token = sessionStorage.getItem("foodloop_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  http.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        sessionStorage.removeItem("foodloop_token");
        sessionStorage.removeItem("foodloop_user");
      }
      return Promise.reject(error);
    },
  );

  function unwrap(response) {
    const body = response?.data ?? response;
    if (body && body.success === false)
      throw new Error(body.message || body.error?.message || "Request failed");
    return body?.data ?? body;
  }

  window.FoodLoopAPI = {
    async request(method, url, data, config = {}) {
      const response = await http.request({ method, url, data, ...config });
      return unwrap(response);
    },
    get: (url, config) =>
      window.FoodLoopAPI.request("GET", url, undefined, config),
    post: (url, data, config) =>
      window.FoodLoopAPI.request("POST", url, data, config),
    patch: (url, data, config) =>
      window.FoodLoopAPI.request("PATCH", url, data, config),
    raw: http,
  };

  window.FoodLoopUtils = {
    getToken: () => sessionStorage.getItem("foodloop_token"),
    getUser: () => {
      try {
        return JSON.parse(sessionStorage.getItem("foodloop_user") || "null");
      } catch {
        return null;
      }
    },
    saveSession(token, user) {
      sessionStorage.setItem("foodloop_token", token);
      sessionStorage.setItem("foodloop_user", JSON.stringify(user));
    },
    clearSession() {
      sessionStorage.removeItem("foodloop_token");
      sessionStorage.removeItem("foodloop_user");
    },
    showAlert(message, type = "danger") {
      const box = document.getElementById("alertBox");
      if (box)
        box.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${escapeHtml(message)}<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>`;
    },
    escapeHtml,
    formatDate(value) {
      if (!value) return "—";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
    },
    moneyOrNumber(value) {
      return value === null || value === undefined
        ? "—"
        : Number(value).toLocaleString();
    },
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  }
})();
