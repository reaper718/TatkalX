document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");

    const detectLocationBtn = document.getElementById("detectLocationBtn");

    if (detectLocationBtn) {
        detectRegistrationLocation();

        detectLocationBtn.addEventListener("click", detectRegistrationLocation);
    }

    
    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const button = document.getElementById("loginButton");
            button.disabled = true;
            button.textContent = "Signing in…";

            try {
                const result = await FoodLoopAPI.post("/auth/login", {
                    email: document.getElementById("email").value.trim(),
                    password: document.getElementById("password").value,
                });

                const token = result.token;

                if (!token) {
                    throw new Error("Authentication token not found.");
                }

                const userResponse = await FoodLoopAPI.get("/auth/me", {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });

                const user = userResponse.user ||
                            userResponse.data?.user ||
                            userResponse;

                if (!user || !user.id) {
                    throw new Error("Unable to retrieve logged-in user details.");
                }

                FoodLoopUtils.saveSession(token, user);

                window.location.href = "dashboard.html";

            } catch (error) {
                console.error("Login error:", error);

                FoodLoopUtils.showAlert(
                    error.response?.data?.message ||
                    error.message ||
                    "Unable to sign in"
                );
            } finally {
                button.disabled = false;
                button.textContent = "Sign in";
            }
        });
    }


    if (registerForm) {
        registerForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const button = document.getElementById("registerButton");
            button.disabled = true;
            button.textContent = "Creating account…";
            try {
                const payload = {
                    fullName: document.getElementById("fullName").value.trim(),
                    email: document.getElementById("email").value.trim(),
                    password: document.getElementById("password").value,
                    phone: document.getElementById("phone").value.trim(),
                    organization: {
                        name: document.getElementById("orgName").value.trim(),
                        type: document.getElementById("orgType").value,
                        address: document.getElementById("address").value.trim(),
                        city: document.getElementById("city").value.trim(),
                        latitude: Number(document.getElementById("latitude").value),
                        longitude: Number(document.getElementById("longitude").value),
                    },
                };
                const result = await FoodLoopAPI.post("/auth/register", payload);
                FoodLoopUtils.showAlert(
                    result.message ||
                    "Registration submitted. Your organization is pending verification.",
                    "success",
                );
                registerForm.reset();
                window.location.href = 'register.html';
            } catch (error) {
                FoodLoopUtils.showAlert(
                    error.response?.data?.message ||
                    error.message ||
                    "Unable to register",
                );
            } finally {
                button.disabled = false;
                button.textContent = "Create account";
            }
        });
    }
});

function detectRegistrationLocation() {
    const latitudeInput = document.getElementById("latitude");
    const longitudeInput = document.getElementById("longitude");
    const status = document.getElementById("locationStatus");

    if (!navigator.geolocation) {
        status.textContent = "Geolocation is not supported by your browser.";
        return;
    }

    status.textContent = "Detecting your location...";

    navigator.geolocation.getCurrentPosition(
        (position) => {
            latitudeInput.value = position.coords.latitude;
            longitudeInput.value = position.coords.longitude;

            status.textContent = "Location detected successfully.";
        },
        (error) => {
            console.error("Location detection error:", error);

            const messages = {
                1: "Location permission denied. Please allow location access.",
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