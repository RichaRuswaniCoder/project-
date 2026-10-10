/**
 * ==============================================================================
 * SkyPulse Weather Dashboard - Application Logic
 * Modern Vanilla JavaScript (ES6+) with Fetch API, Async/Await, & LocalStorage
 * ==============================================================================
 */

"use strict";

/* ------------------------------------------------------------------------------
   1. Configuration & Security
   ------------------------------------------------------------------------------
   NOTE FOR GITHUB & PUBLIC REPOSITORIES:
   - Never commit sensitive production API keys to public repositories.
   - Replace DEFAULT_API_KEY with 'YOUR_API_KEY_HERE' prior to pushing to GitHub.
   - Visitors and evaluators can safely input their own API key via the in-app
     Settings Modal, which stores the key securely in browser localStorage only.
   - For enterprise production deployments, route queries through a backend proxy
     (e.g., Node.js / Express or Cloudflare Workers) to hide keys entirely.
   ------------------------------------------------------------------------------ */
const CONFIG = {
    // Replace with your personal 32-character key from https://home.openweathermap.org/api_keys
    DEFAULT_API_KEY: "YOUR_API_KEY_HERE",
    API_BASE_URL: "https://api.openweathermap.org/data/2.5",
    STORAGE_KEYS: {
        RECENT_SEARCHES: "skypulse_recent_searches",
        LAST_CITY: "skypulse_last_city",
        UNIT_PREFERENCE: "skypulse_unit_pref",
        CUSTOM_API_KEY: "skypulse_custom_api_key"
    },
    MAX_RECENT_SEARCHES: 5
};

/* ------------------------------------------------------------------------------
   2. Application State
   ------------------------------------------------------------------------------ */
const state = {
    currentUnit: "metric", // 'metric' (°C, m/s) or 'imperial' (°F, mph)
    isLoading: false,
    lastQueriedCity: "",
    rawWeatherData: null,
    rawForecastData: null
};

/* ------------------------------------------------------------------------------
   3. DOM Element References Cache
   ------------------------------------------------------------------------------ */
const DOM = {
    // Search & Header
    searchForm: document.getElementById("search-form"),
    cityInput: document.getElementById("city-input"),
    searchBtn: document.getElementById("search-btn"),
    locationBtn: document.getElementById("location-btn"),
    clearSearchBtn: document.getElementById("clear-search-btn"),
    validationMsg: document.getElementById("validation-msg"),
    unitToggle: document.getElementById("unit-toggle"),
    unitC: document.getElementById("unit-c"),
    unitF: document.getElementById("unit-f"),

    // Recents
    recentContainer: document.getElementById("recent-searches-container"),
    recentChips: document.getElementById("recent-chips"),
    clearRecentsBtn: document.getElementById("clear-recents-btn"),

    // Status Cards
    statusContainer: document.getElementById("status-container"),
    welcomeState: document.getElementById("welcome-state"),
    loadingState: document.getElementById("loading-state"),
    errorState: document.getElementById("error-state"),
    errorTitle: document.getElementById("error-title"),
    errorDesc: document.getElementById("error-desc"),
    retryBtn: document.getElementById("retry-btn"),

    // Weather Display
    dashboard: document.getElementById("weather-dashboard"),
    cityName: document.getElementById("city-name"),
    countryBadge: document.getElementById("country-badge"),
    localTime: document.getElementById("local-time"),
    currentTemp: document.getElementById("current-temp"),
    tempUnit: document.getElementById("temp-unit"),
    weatherDesc: document.getElementById("weather-description"),
    tempMax: document.getElementById("temp-max"),
    tempMin: document.getElementById("temp-min"),
    weatherIcon: document.getElementById("weather-icon"),

    // Metrics
    metricFeelsLike: document.getElementById("metric-feels-like"),
    metricHumidity: document.getElementById("metric-humidity"),
    metricWind: document.getElementById("metric-wind"),
    metricPressure: document.getElementById("metric-pressure"),
    metricVisibility: document.getElementById("metric-visibility"),
    metricSunrise: document.getElementById("metric-sunrise"),
    metricSunset: document.getElementById("metric-sunset"),

    // Forecast
    forecastCards: document.getElementById("forecast-cards"),

    // API Key Settings Modal
    apiModalBtn: document.getElementById("api-modal-btn"),
    apiModal: document.getElementById("api-modal"),
    closeModalBtn: document.getElementById("close-modal-btn"),
    customApiKeyInput: document.getElementById("custom-api-key-input"),
    saveApiKeyBtn: document.getElementById("save-api-key-btn"),
    resetApiKeyBtn: document.getElementById("reset-api-key-btn")
};

/* ------------------------------------------------------------------------------
   4. API Key Resolution
   ------------------------------------------------------------------------------ */
function getActiveApiKey() {
    const customKey = localStorage.getItem(CONFIG.STORAGE_KEYS.CUSTOM_API_KEY);
    if (customKey && customKey.trim().length > 0) {
        return customKey.trim();
    }
    return CONFIG.DEFAULT_API_KEY.trim();
}

function hasValidApiKey() {
    const key = getActiveApiKey();
    return Boolean(key && key !== "YOUR_API_KEY_HERE" && key.length >= 20);
}

/* ------------------------------------------------------------------------------
   5. Utility Functions
   ------------------------------------------------------------------------------ */

/**
 * Converts Celsius to Fahrenheit if unit is imperial
 */
function formatTemperature(tempCelsius) {
    if (tempCelsius === null || tempCelsius === undefined) return "--";
    if (state.currentUnit === "imperial") {
        const tempFahrenheit = (tempCelsius * 9) / 5 + 32;
        return Math.round(tempFahrenheit);
    }
    return Math.round(tempCelsius);
}

/**
 * Converts wind speed (m/s) to imperial mph if needed
 */
function formatWindSpeed(speedMps) {
    if (speedMps === null || speedMps === undefined) return "--";
    if (state.currentUnit === "imperial") {
        const speedMph = speedMps * 2.23694;
        return `${speedMph.toFixed(1)} mph`;
    }
    return `${speedMps.toFixed(1)} m/s`;
}

/**
 * Converts degrees into a readable cardinal wind direction (e.g. N, SW, ENE)
 */
function getWindDirection(degrees) {
    if (degrees === undefined || degrees === null) return "";
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const index = Math.round((degrees % 360) / 22.5) % 16;
    return directions[index];
}

/**
 * Formats a UNIX timestamp into the city's local time string using the timezone offset
 */
function formatLocalTime(unixTimestamp, timezoneOffsetSeconds) {
    if (!unixTimestamp) return "—";
    const localMillis = (unixTimestamp + timezoneOffsetSeconds) * 1000;
    const date = new Date(localMillis);

    const options = {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC"
    };
    return `${date.toLocaleDateString("en-US", options)} (Local)`;
}

/**
 * Formats sunrise/sunset times into HH:MM (12-hour or 24-hour style) based on timezone
 */
function formatSunTime(unixTimestamp, timezoneOffsetSeconds) {
    if (!unixTimestamp) return "--:--";
    const localMillis = (unixTimestamp + timezoneOffsetSeconds) * 1000;
    const date = new Date(localMillis);

    return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC"
    });
}

/**
 * Capitalizes every word in a weather description string
 */
function capitalizeWords(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

/* ------------------------------------------------------------------------------
   6. UI State Management
   ------------------------------------------------------------------------------ */

function showLoading() {
    state.isLoading = true;
    DOM.welcomeState.classList.add("hidden");
    DOM.errorState.classList.add("hidden");
    DOM.dashboard.classList.add("hidden");
    DOM.loadingState.classList.remove("hidden");
    DOM.validationMsg.classList.add("hidden");

    DOM.searchBtn.disabled = true;
    DOM.locationBtn.disabled = true;
}

function hideLoading() {
    state.isLoading = false;
    DOM.loadingState.classList.add("hidden");
    DOM.searchBtn.disabled = false;
    DOM.locationBtn.disabled = false;
}

function showError(title, message) {
    hideLoading();
    DOM.welcomeState.classList.add("hidden");
    DOM.dashboard.classList.add("hidden");
    DOM.errorState.classList.remove("hidden");

    DOM.errorTitle.textContent = title;
    DOM.errorDesc.textContent = message;
}

function showValidationMessage(message) {
    DOM.validationMsg.textContent = message;
    DOM.validationMsg.classList.remove("hidden");
    DOM.cityInput.focus();
}

function clearValidationMessage() {
    DOM.validationMsg.textContent = "";
    DOM.validationMsg.classList.add("hidden");
}

/* ------------------------------------------------------------------------------
   7. Data Fetching (Current Weather & 5-Day Forecast)
   ------------------------------------------------------------------------------ */

/**
 * Core fetch function handling current weather + 5-day forecast
 */
async function fetchWeather({ query, lat, lon }) {
    if (!hasValidApiKey()) {
        showError(
            "API Key Required",
            "Please configure your OpenWeather API key via the settings gear icon (top right) or configure CONFIG.DEFAULT_API_KEY in script.js."
        );
        openApiModal();
        return;
    }

    const apiKey = getActiveApiKey();
    showLoading();

    // Construct query parameters
    const queryParam = query
        ? `q=${encodeURIComponent(query)}`
        : `lat=${lat}&lon=${lon}`;

    const weatherUrl = `${CONFIG.API_BASE_URL}/weather?${queryParam}&appid=${apiKey}&units=metric`;
    const forecastUrl = `${CONFIG.API_BASE_URL}/forecast?${queryParam}&appid=${apiKey}&units=metric`;

    try {
        // Fetch current conditions and 5-day forecast in parallel
        const [weatherRes, forecastRes] = await Promise.all([
            fetch(weatherUrl),
            fetch(forecastUrl)
        ]);

        // Handle HTTP response codes
        if (!weatherRes.ok) {
            handleHttpError(weatherRes.status, query);
            return;
        }

        const weatherData = await weatherRes.json();
        let forecastData = null;

        if (forecastRes.ok) {
            forecastData = await forecastRes.json();
        }

        // Cache raw responses in application state for instantaneous unit switching
        state.rawWeatherData = weatherData;
        state.rawForecastData = forecastData;
        state.lastQueriedCity = weatherData.name;

        // Render dashboard
        renderWeatherDashboard(weatherData, forecastData);

        // Update recent searches list
        saveRecentSearch(weatherData.name);

        // Save last searched city
        localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_CITY, weatherData.name);

    } catch (error) {
        console.error("Weather App Network Error:", error);
        showError(
            "Connection Problem",
            "Unable to reach the meteorological service. Please check your internet connection."
        );
    } finally {
        hideLoading();
    }
}

/**
 * Specific HTTP error handler with helpful messages
 */
function handleHttpError(status, cityQuery) {
    switch (status) {
        case 404:
            showError(
                "City Not Found",
                `We could not find "${cityQuery || "the specified location"}". Please verify spelling and try again.`
            );
            break;
        case 401:
            showError(
                "Authentication Failed",
                "Your OpenWeather API key is invalid or pending activation. Please check your key in settings."
            );
            break;
        case 429:
            showError(
                "Rate Limit Exceeded",
                "You have exceeded the OpenWeather API free tier request limit. Please wait a minute and try again."
            );
            break;
        default:
            showError(
                "Server Error",
                `The weather service returned error code ${status}. Please try again later.`
            );
    }
}

/* ------------------------------------------------------------------------------
   8. Rendering Engine
   ------------------------------------------------------------------------------ */

function renderWeatherDashboard(weather, forecast) {
    DOM.welcomeState.classList.add("hidden");
    DOM.errorState.classList.add("hidden");
    DOM.dashboard.classList.remove("hidden");

    const tz = weather.timezone || 0;
    const unitSymbol = state.currentUnit === "imperial" ? "°F" : "°C";

    // 1. Hero Card Info
    DOM.cityName.textContent = weather.name;
    DOM.countryBadge.textContent = weather.sys?.country || "—";
    DOM.localTime.textContent = formatLocalTime(weather.dt, tz);

    DOM.currentTemp.textContent = formatTemperature(weather.main?.temp);
    DOM.tempUnit.textContent = unitSymbol;
    DOM.weatherDesc.textContent = capitalizeWords(weather.weather?.[0]?.description || "");

    DOM.tempMax.textContent = `${formatTemperature(weather.main?.temp_max)}${unitSymbol}`;
    DOM.tempMin.textContent = `${formatTemperature(weather.main?.temp_min)}${unitSymbol}`;

    // High resolution OpenWeather Icon
    const iconCode = weather.weather?.[0]?.icon || "01d";
    DOM.weatherIcon.src = `https://openweathermap.org/img/wn/${iconCode}@4x.png`;
    DOM.weatherIcon.alt = weather.weather?.[0]?.description || "Weather icon";

    // 2. Detailed Metrics
    DOM.metricFeelsLike.textContent = `${formatTemperature(weather.main?.feels_like)}${unitSymbol}`;
    DOM.metricHumidity.textContent = `${weather.main?.humidity ?? "--"}%`;

    const windDir = getWindDirection(weather.wind?.deg);
    DOM.metricWind.textContent = formatWindSpeed(weather.wind?.speed);
    document.getElementById("metric-wind-dir").textContent = windDir ? `Bearing: ${windDir} (${weather.wind.deg}°)` : "Velocity";

    DOM.metricPressure.textContent = weather.main?.pressure ? `${weather.main.pressure} hPa` : "--";

    // Visibility in kilometers (or miles)
    if (weather.visibility !== undefined) {
        if (state.currentUnit === "imperial") {
            const miles = (weather.visibility / 1609.34).toFixed(1);
            DOM.metricVisibility.textContent = `${miles} mi`;
        } else {
            const km = (weather.visibility / 1000).toFixed(1);
            DOM.metricVisibility.textContent = `${km} km`;
        }
    } else {
        DOM.metricVisibility.textContent = "--";
    }

    // Sunrise & Sunset (Local to queried city)
    DOM.metricSunrise.textContent = formatSunTime(weather.sys?.sunrise, tz);
    DOM.metricSunset.textContent = formatSunTime(weather.sys?.sunset, tz);

    // 3. Render 5-Day Forecast
    renderForecast(forecast, tz);
}

/**
 * Groups 3-hour forecasts into 5 distinct calendar days
 */
function renderForecast(forecast, timezoneOffset) {
    DOM.forecastCards.innerHTML = "";

    if (!forecast || !forecast.list || forecast.list.length === 0) {
        DOM.forecastCards.innerHTML = `<p class="metric-subtext">5-day forecast data not available.</p>`;
        return;
    }

    const unitSymbol = state.currentUnit === "imperial" ? "°F" : "°C";

    // Group forecast data by local date string
    const dailyMap = new Map();

    forecast.list.forEach(item => {
        const localDate = new Date((item.dt + timezoneOffset) * 1000);
        const dateKey = localDate.toISOString().split("T")[0]; // YYYY-MM-DD

        if (!dailyMap.has(dateKey)) {
            dailyMap.set(dateKey, []);
        }
        dailyMap.get(dateKey).push(item);
    });

    // Skip today's remainder if we have enough days, or pick the next 5 days
    const daysKeys = Array.from(dailyMap.keys()).slice(0, 5);

    daysKeys.forEach(dateKey => {
        const dayReadings = dailyMap.get(dateKey);

        // Pick mid-day reading (closest to 12:00:00) for general condition representation
        const midDayReading = dayReadings.reduce((closest, curr) => {
            const currHour = new Date((curr.dt + timezoneOffset) * 1000).getUTCHours();
            const closestHour = new Date((closest.dt + timezoneOffset) * 1000).getUTCHours();
            return Math.abs(currHour - 12) < Math.abs(closestHour - 12) ? curr : closest;
        }, dayReadings[0]);

        // Calculate true day min and max
        const temps = dayReadings.map(r => r.main.temp);
        const dayMin = Math.min(...temps);
        const dayMax = Math.max(...temps);

        const dateObj = new Date((midDayReading.dt + timezoneOffset) * 1000);
        const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
        const shortDate = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

        const iconCode = midDayReading.weather?.[0]?.icon || "01d";
        const conditionDesc = capitalizeWords(midDayReading.weather?.[0]?.description || "");

        const card = document.createElement("div");
        card.className = "forecast-card";
        card.setAttribute("role", "listitem");
        card.innerHTML = `
            <span class="forecast-day">${dayName}</span>
            <span class="forecast-date">${shortDate}</span>
            <img class="forecast-icon" src="https://openweathermap.org/img/wn/${iconCode}@2x.png" alt="${conditionDesc}" width="58" height="58">
            <span class="forecast-desc">${conditionDesc}</span>
            <span class="forecast-temp">${formatTemperature(midDayReading.main.temp)}${unitSymbol}</span>
            <span class="forecast-minmax">H: ${formatTemperature(dayMax)}° • L: ${formatTemperature(dayMin)}°</span>
        `;
        DOM.forecastCards.appendChild(card);
    });
}

/* ------------------------------------------------------------------------------
   9. Recent Searches Management (LocalStorage)
   ------------------------------------------------------------------------------ */

function getRecentSearches() {
    try {
        const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.RECENT_SEARCHES);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveRecentSearch(city) {
    if (!city) return;
    let recents = getRecentSearches();

    // Remove duplicates (case-insensitive)
    recents = recents.filter(c => c.toLowerCase() !== city.toLowerCase());
    // Prepend latest city
    recents.unshift(city);

    // Limit to configured maximum
    if (recents.length > CONFIG.MAX_RECENT_SEARCHES) {
        recents = recents.slice(0, CONFIG.MAX_RECENT_SEARCHES);
    }

    localStorage.setItem(CONFIG.STORAGE_KEYS.RECENT_SEARCHES, JSON.stringify(recents));
    renderRecentSearches();
}

function renderRecentSearches() {
    const recents = getRecentSearches();
    DOM.recentChips.innerHTML = "";

    if (recents.length === 0) {
        DOM.recentContainer.classList.add("hidden");
        return;
    }

    DOM.recentContainer.classList.remove("hidden");

    recents.forEach(city => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip-btn";
        chip.textContent = city;
        chip.setAttribute("aria-label", `Search weather for ${city}`);
        chip.addEventListener("click", () => {
            DOM.cityInput.value = city;
            clearValidationMessage();
            fetchWeather({ query: city });
        });
        DOM.recentChips.appendChild(chip);
    });
}

function clearRecentSearches() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.RECENT_SEARCHES);
    renderRecentSearches();
}

/* ------------------------------------------------------------------------------
   10. Unit Toggle System (°C / °F)
   ------------------------------------------------------------------------------ */

function setTemperatureUnit(unit) {
    state.currentUnit = unit;
    localStorage.setItem(CONFIG.STORAGE_KEYS.UNIT_PREFERENCE, unit);

    if (unit === "imperial") {
        DOM.unitC.classList.remove("active");
        DOM.unitF.classList.add("active");
    } else {
        DOM.unitC.classList.add("active");
        DOM.unitF.classList.remove("active");
    }

    // If active data exists in memory, immediately re-render without refetching API!
    if (state.rawWeatherData) {
        renderWeatherDashboard(state.rawWeatherData, state.rawForecastData);
    }
}

function toggleTemperatureUnit() {
    const nextUnit = state.currentUnit === "metric" ? "imperial" : "metric";
    setTemperatureUnit(nextUnit);
}

/* ------------------------------------------------------------------------------
   11. Geolocation Handler
   ------------------------------------------------------------------------------ */

function handleGeolocation() {
    clearValidationMessage();

    if (!navigator.geolocation) {
        showError(
            "Geolocation Unsupported",
            "Your browser does not support automatic location detection. Please enter your city name above."
        );
        return;
    }

    showLoading();

    navigator.geolocation.getCurrentPosition(
        position => {
            const { latitude, longitude } = position.coords;
            fetchWeather({ lat: latitude, lon: longitude });
        },
        error => {
            hideLoading();
            let errorMessage = "Unable to retrieve your location coordinates.";
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = "Location access was denied. Please allow location access or type your city name.";
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = "Location information is unavailable on your device.";
                    break;
                case error.TIMEOUT:
                    errorMessage = "Location request timed out. Please try searching manually.";
                    break;
            }
            showError("Location Access Error", errorMessage);
        },
        { timeout: 10000, enableHighAccuracy: false }
    );
}

/* ------------------------------------------------------------------------------
   12. API Key Modal Controls
   ------------------------------------------------------------------------------ */

function openApiModal() {
    const activeKey = localStorage.getItem(CONFIG.STORAGE_KEYS.CUSTOM_API_KEY) || "";
    DOM.customApiKeyInput.value = activeKey;
    DOM.apiModal.classList.remove("hidden");
    DOM.customApiKeyInput.focus();
}

function closeApiModal() {
    DOM.apiModal.classList.add("hidden");
}

function saveCustomApiKey() {
    const key = DOM.customApiKeyInput.value.trim();
    if (!key) {
        alert("Please enter a valid key or click Reset.");
        return;
    }
    localStorage.setItem(CONFIG.STORAGE_KEYS.CUSTOM_API_KEY, key);
    closeApiModal();

    // If city input is populated, retry fetch immediately
    const query = DOM.cityInput.value.trim() || state.lastQueriedCity;
    if (query) {
        fetchWeather({ query });
    }
}

function resetCustomApiKey() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.CUSTOM_API_KEY);
    DOM.customApiKeyInput.value = "";
    closeApiModal();
}

/* ------------------------------------------------------------------------------
   13. Event Listeners & Binding
   ------------------------------------------------------------------------------ */

function bindEventListeners() {
    // Form submission (Click or Enter Key)
    DOM.searchForm.addEventListener("submit", event => {
        event.preventDefault();
        const city = DOM.cityInput.value.trim();

        if (!city) {
            showValidationMessage("Please enter a city name before searching.");
            return;
        }

        clearValidationMessage();
        fetchWeather({ query: city });
    });

    // Clear search text button
    DOM.cityInput.addEventListener("input", () => {
        if (DOM.cityInput.value.length > 0) {
            DOM.clearSearchBtn.classList.remove("hidden");
        } else {
            DOM.clearSearchBtn.classList.add("hidden");
        }
        clearValidationMessage();
    });

    DOM.clearSearchBtn.addEventListener("click", () => {
        DOM.cityInput.value = "";
        DOM.clearSearchBtn.classList.add("hidden");
        DOM.cityInput.focus();
    });

    // Current location button
    DOM.locationBtn.addEventListener("click", handleGeolocation);

    // Temperature Unit toggle button
    DOM.unitToggle.addEventListener("click", toggleTemperatureUnit);

    // Clear recent searches
    DOM.clearRecentsBtn.addEventListener("click", clearRecentSearches);

    // Retry button on error card
    DOM.retryBtn.addEventListener("click", () => {
        const city = DOM.cityInput.value.trim() || state.lastQueriedCity;
        if (city) {
            fetchWeather({ query: city });
        } else {
            handleGeolocation();
        }
    });

    // Modal controls
    DOM.apiModalBtn.addEventListener("click", openApiModal);
    DOM.closeModalBtn.addEventListener("click", closeApiModal);
    DOM.saveApiKeyBtn.addEventListener("click", saveCustomApiKey);
    DOM.resetApiKeyBtn.addEventListener("click", resetCustomApiKey);

    // Close modal on click outside
    DOM.apiModal.addEventListener("click", event => {
        if (event.target === DOM.apiModal) {
            closeApiModal();
        }
    });

    // Close modal on Escape key
    window.addEventListener("keydown", event => {
        if (event.key === "Escape" && !DOM.apiModal.classList.contains("hidden")) {
            closeApiModal();
        }
    });
}

/* ------------------------------------------------------------------------------
   14. Application Initialization
   ------------------------------------------------------------------------------ */

function initApp() {
    bindEventListeners();
    renderRecentSearches();

    // Restore unit preference
    const savedUnit = localStorage.getItem(CONFIG.STORAGE_KEYS.UNIT_PREFERENCE) || "metric";
    setTemperatureUnit(savedUnit);

    // Check if user previously queried a city
    const lastCity = localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_CITY);
    if (lastCity && hasValidApiKey()) {
        DOM.cityInput.value = lastCity;
        DOM.clearSearchBtn.classList.remove("hidden");
        fetchWeather({ query: lastCity });
    } else {
        // Display welcome card
        DOM.welcomeState.classList.remove("hidden");
    }
}

// Boot application once DOM content is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}