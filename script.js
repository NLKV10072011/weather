// TODO: trong môi trường thực tế, key này nên được gọi qua một backend proxy
// thay vì để lộ trực tiếp trong JS phía client.
const apiKey = "124e819940bb3a1a016da54c44ab4074";
const AUTO_REFRESH_MS = 10 * 60 * 1000;

// ----- Trạng thái toàn cục -----
let weatherMap = null;
let tempChart = null;
let currentUnit = localStorage.getItem("unit") || "metric"; // 'metric' (°C) | 'imperial' (°F)
let lastCurrentData = null;
let lastForecastData = null;
let lastQueryParam = null;
let refreshTimer = null;
let toastTimer = null;

// ----- Tham chiếu DOM -----
const cityInput = document.getElementById("city-input");
const suggestionsContainer = document.getElementById("suggestions");
const weatherInfoEl = document.getElementById("weather-info");
const errorEl = document.getElementById("error-message");
const loadingEl = document.getElementById("loading");
const searchBtn = document.getElementById("search-btn");
const geoBtn = document.getElementById("geo-btn");
const themeToggle = document.getElementById("theme-toggle");

// ============ Lấy thời tiết ============

async function getWeather(cityOverride) {
    const city = (cityOverride ?? cityInput.value).trim();
    if (city === "") {
        showError("Vui lòng nhập thành phố!");
        return;
    }
    await fetchWeather(`q=${encodeURIComponent(city)}`);
}

function getWeatherByLocation() {
    if (!navigator.geolocation) {
        showError("Trình duyệt không hỗ trợ định vị!");
        return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            fetchWeather(`lat=${latitude}&lon=${longitude}`);
        },
        () => {
            setLoading(false);
            showError("Không thể lấy vị trí hiện tại. Vui lòng cho phép quyền truy cập vị trí.");
        }
    );
}

function manualRefresh() {
    if (lastQueryParam) fetchWeather(lastQueryParam);
}

async function fetchWeather(queryParam, { silent = false } = {}) {
    if (!silent) {
        setLoading(true);
        hideError();
    }

    try {
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?${queryParam}&appid=${apiKey}&units=metric&lang=vi`;
        const currentResponse = await fetch(currentUrl);
        const currentData = await currentResponse.json();

        if (!currentResponse.ok) {
            if (!silent) showError(currentResponse.status === 404 ? "Không tìm thấy thành phố!" : "Lỗi lấy dữ liệu thời tiết!");
            return;
        }

        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?${queryParam}&appid=${apiKey}&units=metric&lang=vi`;
        const forecastResponse = await fetch(forecastUrl);
        const forecastData = await forecastResponse.json();

        if (!forecastResponse.ok) {
            if (!silent) showError("Lỗi lấy dữ liệu dự báo!");
            return;
        }

        lastCurrentData = currentData;
        lastForecastData = forecastData;
        lastQueryParam = queryParam;

        applyConditionTheme(currentData);
        renderCurrentWeather(currentData);
        renderForecast(forecastData);
        updateUVIndex(currentData.coord.lat, currentData.coord.lon);
        updateAirQuality(currentData.coord.lat, currentData.coord.lon);
        updateWeatherMap(currentData.coord.lat, currentData.coord.lon);
        updateTemperatureChart(forecastData);

        weatherInfoEl.classList.remove("hidden");
        hideError();
        scheduleAutoRefresh();

        requestAnimationFrame(() => {
            if (weatherMap) weatherMap.invalidateSize();
            if (tempChart) tempChart.resize();
        });
    } catch (error) {
        console.error("Lỗi lấy dữ liệu:", error);
        if (!silent) showError("Lỗi kết nối, vui lòng thử lại!");
    } finally {
        if (!silent) setLoading(false);
    }
}

function scheduleAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
        if (lastQueryParam) fetchWeather(lastQueryParam, { silent: true });
    }, AUTO_REFRESH_MS);
}

// ============ Hiển thị thời tiết hiện tại ============

function cityLabelFromData(data) {
    const country = data.sys && data.sys.country ? `, ${data.sys.country}` : "";
    return `${data.name}${country}`;
}

function renderCurrentWeather(data) {
    document.getElementById("city-name").innerText = cityLabelFromData(data);
    document.getElementById("updated-at").textContent = `Cập nhật lúc ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;

    document.getElementById("temperature").innerText = formatTemp(data.main.temp);
    document.getElementById("weather-description").innerText = data.weather[0].description;
    document.getElementById("feels-like-inline").innerText = `Cảm giác như ${formatTemp(data.main.feels_like)}`;

    const iconCode = data.weather[0].icon;
    const weatherIcon = document.getElementById("weather-icon");
    weatherIcon.src = `https://openweathermap.org/img/wn/${iconCode}@4x.png`;
    weatherIcon.alt = data.weather[0].description;
    weatherIcon.onerror = function () {
        this.src = "https://openweathermap.org/img/wn/02d@4x.png";
    };

    document.getElementById("humidity").innerText = `${data.main.humidity}%`;
    document.getElementById("wind-speed").innerText = formatSpeed(data.wind.speed * 3.6);
    document.getElementById("pressure").innerText = `${data.main.pressure} hPa`;
    document.getElementById("visibility").innerText = `${(data.visibility / 1000).toFixed(1)} km`;

    const windArrow = document.getElementById("wind-arrow");
    const windDirection = document.getElementById("wind-direction");
    if (typeof data.wind.deg === "number") {
        windArrow.style.transform = `rotate(${data.wind.deg}deg)`;
        windDirection.textContent = degToCompass(data.wind.deg);
    } else {
        windArrow.style.transform = "";
        windDirection.textContent = "--";
    }

    const sunrise = new Date((data.sys.sunrise + data.timezone) * 1000);
    const sunset = new Date((data.sys.sunset + data.timezone) * 1000);
    document.getElementById("sunrise").textContent = sunrise.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    document.getElementById("sunset").textContent = sunset.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

    saveToRecentSearches(cityLabelFromData(data));
    updateFavoriteButtonState();
}

function degToCompass(deg) {
    const dirs = ["Bắc", "Đông Bắc", "Đông", "Đông Nam", "Nam", "Tây Nam", "Tây", "Tây Bắc"];
    return dirs[Math.round(deg / 45) % 8];
}

function applyConditionTheme(data) {
    const main = (data.weather[0].main || "").toLowerCase();
    const isNight = (data.weather[0].icon || "").endsWith("n");
    document.body.dataset.condition = `${main}-${isNight ? "night" : "day"}`;
}

// ============ Đơn vị đo (°C / °F, km/h / mph) ============

function celsiusToFahrenheit(c) {
    return (c * 9) / 5 + 32;
}

function kmhToMph(kmh) {
    return kmh * 0.621371;
}

function formatTemp(celsius) {
    return currentUnit === "metric" ? `${Math.round(celsius)}°C` : `${Math.round(celsiusToFahrenheit(celsius))}°F`;
}

function formatSpeed(kmh) {
    return currentUnit === "metric" ? `${kmh.toFixed(1)} km/h` : `${kmhToMph(kmh).toFixed(1)} mph`;
}

function setUnit(unit) {
    currentUnit = unit;
    localStorage.setItem("unit", unit);
    document.getElementById("unit-c").classList.toggle("active", unit === "metric");
    document.getElementById("unit-f").classList.toggle("active", unit === "imperial");

    if (lastCurrentData) renderCurrentWeather(lastCurrentData);
    if (lastForecastData) {
        renderForecast(lastForecastData);
        updateTemperatureChart(lastForecastData);
    }
}

// ============ Yêu thích & tìm kiếm gần đây ============

function getFavorites() {
    return JSON.parse(localStorage.getItem("favoriteCities") || "[]");
}

function saveFavorites(list) {
    localStorage.setItem("favoriteCities", JSON.stringify(list));
}

function isFavorite(cityLabel) {
    return getFavorites().includes(cityLabel);
}

function toggleFavorite(cityLabel) {
    let favs = getFavorites();
    favs = favs.includes(cityLabel) ? favs.filter((c) => c !== cityLabel) : [cityLabel, ...favs];
    saveFavorites(favs);
    renderFavoritesUI();
    updateRecentSearchesUI();
    updateFavoriteButtonState();
}

function toggleFavoriteCurrent() {
    if (!lastCurrentData) return;
    toggleFavorite(cityLabelFromData(lastCurrentData));
}

function updateFavoriteButtonState() {
    if (!lastCurrentData) return;
    const btn = document.getElementById("favorite-btn");
    const fav = isFavorite(cityLabelFromData(lastCurrentData));
    btn.innerHTML = fav ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
    btn.classList.toggle("active", fav);
    btn.setAttribute("aria-label", fav ? "Bỏ yêu thích" : "Đánh dấu yêu thích");
}

function createChip(cityLabel) {
    const chip = document.createElement("div");
    chip.className = "chip";

    const nameBtn = document.createElement("button");
    nameBtn.type = "button";
    nameBtn.className = "chip-name";
    nameBtn.textContent = cityLabel;
    nameBtn.addEventListener("click", () => selectCity(cityLabel));

    const starBtn = document.createElement("button");
    starBtn.type = "button";
    starBtn.className = "chip-star";
    const fav = isFavorite(cityLabel);
    starBtn.innerHTML = fav ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
    starBtn.classList.toggle("is-favorite", fav);
    starBtn.setAttribute("aria-label", fav ? "Bỏ yêu thích" : "Thêm vào yêu thích");
    starBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavorite(cityLabel);
    });

    chip.appendChild(nameBtn);
    chip.appendChild(starBtn);
    return chip;
}

function saveToRecentSearches(city) {
    let recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");
    recentSearches = recentSearches.filter((item) => item !== city);
    recentSearches.unshift(city);
    recentSearches = recentSearches.slice(0, 6);
    localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
    updateRecentSearchesUI();
}

function updateRecentSearchesUI() {
    const recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");
    const container = document.getElementById("recent-cities");
    const section = document.getElementById("recent-searches-section");

    container.innerHTML = "";
    section.classList.toggle("hidden", recentSearches.length === 0);
    recentSearches.forEach((city) => container.appendChild(createChip(city)));
}

function renderFavoritesUI() {
    const favs = getFavorites();
    const container = document.getElementById("favorite-cities");
    const section = document.getElementById("favorites-section");

    container.innerHTML = "";
    section.classList.toggle("hidden", favs.length === 0);
    favs.forEach((city) => container.appendChild(createChip(city)));
}

// ============ Dự báo (theo giờ & 5 ngày) ============

function buildForecastCard({ label, iconCode, iconAlt, temp, range }) {
    const card = document.createElement("div");
    card.className = "forecast-card";

    const labelEl = document.createElement("div");
    labelEl.className = "label";
    labelEl.textContent = label;

    const img = document.createElement("img");
    img.src = `https://openweathermap.org/img/wn/${iconCode}.png`;
    img.alt = iconAlt;
    img.loading = "lazy";

    const tempEl = document.createElement("div");
    tempEl.className = "temp";
    tempEl.textContent = temp;

    card.append(labelEl, img, tempEl);

    if (range) {
        const rangeEl = document.createElement("div");
        rangeEl.className = "temp-range";
        const minEl = document.createElement("span");
        minEl.textContent = range.min;
        const maxEl = document.createElement("span");
        maxEl.textContent = range.max;
        rangeEl.append(minEl, maxEl);
        card.appendChild(rangeEl);
    }

    return card;
}

function renderForecast(forecastData) {
    renderHourlyForecast(forecastData);
    renderDailyForecast(forecastData);
}

function renderHourlyForecast(forecastData) {
    const container = document.getElementById("hourly-forecast");
    container.innerHTML = "";
    forecastData.list.slice(0, 8).forEach((item) => {
        const time = new Date(item.dt * 1000);
        const label = time.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
        container.appendChild(
            buildForecastCard({
                label,
                iconCode: item.weather[0].icon,
                iconAlt: item.weather[0].description,
                temp: formatTemp(item.main.temp),
            })
        );
    });
}

function renderDailyForecast(forecastData) {
    const container = document.getElementById("forecast");
    container.innerHTML = "";
    const dailyForecasts = forecastData.list.filter((item) => item.dt_txt.includes("12:00:00"));

    dailyForecasts.forEach((forecast) => {
        const date = new Date(forecast.dt * 1000);
        const label = `${date.toLocaleDateString("vi-VN", { weekday: "short" })}, ${date.getDate()}/${date.getMonth() + 1}`;
        container.appendChild(
            buildForecastCard({
                label,
                iconCode: forecast.weather[0].icon,
                iconAlt: forecast.weather[0].description,
                temp: formatTemp(forecast.main.temp),
                range: { min: formatTemp(forecast.main.temp_min), max: formatTemp(forecast.main.temp_max) },
            })
        );
    });
}

function switchForecastTab(tab) {
    const isHourly = tab === "hourly";
    document.getElementById("tab-hourly").classList.toggle("active", isHourly);
    document.getElementById("tab-hourly").setAttribute("aria-selected", String(isHourly));
    document.getElementById("tab-daily").classList.toggle("active", !isHourly);
    document.getElementById("tab-daily").setAttribute("aria-selected", String(!isHourly));
    document.getElementById("hourly-forecast").classList.toggle("hidden", !isHourly);
    document.getElementById("forecast").classList.toggle("hidden", isHourly);
}

// ============ Trạng thái tải / lỗi / thông báo ============

function setLoading(isLoading) {
    loadingEl.classList.toggle("hidden", !isLoading);
    searchBtn.disabled = isLoading;
    geoBtn.disabled = isLoading;
}

function showError(message) {
    errorEl.innerText = message;
    errorEl.classList.remove("hidden");
    weatherInfoEl.classList.add("hidden");
}

function hideError() {
    errorEl.classList.add("hidden");
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 2500);
}

// ============ Chia sẻ ============

function shareWeather() {
    if (!lastCurrentData) return;
    const d = lastCurrentData;
    const text = `Thời tiết tại ${cityLabelFromData(d)}: ${formatTemp(d.main.temp)}, ${d.weather[0].description}. Cảm giác như ${formatTemp(d.main.feels_like)}.`;

    if (navigator.share) {
        navigator.share({ title: "Thời tiết", text }).catch(() => {});
    } else if (navigator.clipboard) {
        navigator.clipboard
            .writeText(text)
            .then(() => showToast("Đã sao chép vào bộ nhớ tạm"))
            .catch(() => showToast("Không thể sao chép"));
    } else {
        showToast(text);
    }
}

// ============ Chuyển đổi giao diện sáng/tối ============

themeToggle.addEventListener("change", function () {
    document.body.classList.toggle("light-mode", this.checked);
    localStorage.setItem("theme", this.checked ? "light" : "dark");
});

// ============ Gợi ý tự động hoàn thành ============

cityInput.addEventListener(
    "input",
    debounce(async (e) => {
        const input = e.target.value.trim();
        if (input.length < 2) {
            suggestionsContainer.classList.add("hidden");
            return;
        }
        try {
            const response = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(input)}&limit=5&appid=${apiKey}`);
            const data = await response.json();
            renderSuggestions(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Lỗi tìm kiếm thành phố:", error);
            suggestionsContainer.classList.add("hidden");
        }
    }, 500)
);

cityInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        suggestionsContainer.classList.add("hidden");
        getWeather();
    }
});

function renderSuggestions(cities) {
    suggestionsContainer.innerHTML = "";
    if (cities.length === 0) {
        suggestionsContainer.classList.add("hidden");
        return;
    }
    cities.forEach((city) => {
        const label = `${city.name}, ${city.country}`;
        const div = document.createElement("div");
        div.className = "suggestion-item";
        div.textContent = label;
        div.addEventListener("click", () => selectCity(label));
        suggestionsContainer.appendChild(div);
    });
    suggestionsContainer.classList.remove("hidden");
}

function selectCity(city) {
    cityInput.value = city;
    suggestionsContainer.classList.add("hidden");
    getWeather(city);
}

document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrapper")) {
        suggestionsContainer.classList.add("hidden");
    }
});

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

// ============ Chỉ số UV ============
// Lưu ý: endpoint "onecall" của OpenWeatherMap hiện yêu cầu gói thuê bao
// riêng (One Call 3.0) với hầu hết API key mới. Nếu không có quyền truy cập,
// mục UV sẽ hiển thị "--" thay vì làm hỏng cả trang.
async function updateUVIndex(lat, lon) {
    const uvNumberEl = document.getElementById("uv-index");
    const uvBarEl = document.getElementById("uv-bar-fill");
    const uvLabelEl = document.getElementById("uv-label");

    try {
        const uvResponse = await fetch(`https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&appid=${apiKey}&exclude=minutely,hourly,daily,alerts`);
        const uvData = await uvResponse.json();

        if (!uvResponse.ok || typeof uvData?.current?.uvi !== "number") {
            throw new Error("UV index không khả dụng");
        }

        const uvIndex = Math.round(uvData.current.uvi);
        let level = "Thấp";
        let className = "uv-low";
        if (uvIndex > 10) { level = "Cực đoan"; className = "uv-extreme"; }
        else if (uvIndex > 7) { level = "Rất cao"; className = "uv-very-high"; }
        else if (uvIndex > 5) { level = "Cao"; className = "uv-high"; }
        else if (uvIndex > 2) { level = "Trung bình"; className = "uv-moderate"; }

        uvNumberEl.textContent = uvIndex;
        uvNumberEl.className = `uv-number ${className}`;
        uvBarEl.style.width = `${Math.min(uvIndex / 11, 1) * 100}%`;
        uvLabelEl.textContent = level;
    } catch (error) {
        uvNumberEl.textContent = "--";
        uvNumberEl.className = "uv-number";
        uvBarEl.style.width = "0%";
        uvLabelEl.textContent = "";
    }
}

// ============ Chất lượng không khí ============

async function updateAirQuality(lat, lon) {
    try {
        const aqiResponse = await fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`);
        const aqiData = await aqiResponse.json();
        if (!aqiResponse.ok || !aqiData.list || !aqiData.list.length) throw new Error("Không có dữ liệu AQI");

        const aqi = aqiData.list[0].main.aqi;
        const components = aqiData.list[0].components;

        const aqiElement = document.getElementById("aqi-value");
        const levelElement = document.getElementById("aqi-level");
        aqiElement.textContent = aqi;

        const levels = {
            1: ["Tốt", "aqi-good"],
            2: ["Trung bình", "aqi-moderate"],
            3: ["Kém", "aqi-unhealthy"],
            4: ["Xấu", "aqi-very-unhealthy"],
            5: ["Rất xấu", "aqi-hazardous"],
        };
        const [level, className] = levels[aqi] || ["--", ""];

        levelElement.textContent = level;
        aqiElement.className = className;
        levelElement.className = className;

        document.getElementById("pm25").textContent = `${components.pm2_5.toFixed(1)} µg/m³`;
        document.getElementById("pm10").textContent = `${components.pm10.toFixed(1)} µg/m³`;
        document.getElementById("no2").textContent = `${components.no2.toFixed(1)} µg/m³`;
    } catch (error) {
        console.error("Lỗi lấy chất lượng không khí:", error);
    }
}

// ============ Bản đồ thời tiết ============
// Map chỉ được khởi tạo lần đầu khi có dữ liệu thật (container lúc đó mới
// hiện ra và có kích thước) — khởi tạo sớm hơn khi container đang ẩn sẽ
// khiến Leaflet tính sai kích thước.

function initWeatherMap() {
    if (!weatherMap) {
        weatherMap = L.map("map").setView([21.0285, 105.8542], 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors",
        }).addTo(weatherMap);
    }
}

function updateWeatherMap(lat, lon) {
    if (!weatherMap) initWeatherMap();

    weatherMap.setView([lat, lon], 10);
    weatherMap.eachLayer((layer) => {
        if (layer instanceof L.Marker) weatherMap.removeLayer(layer);
    });
    L.marker([lat, lon]).addTo(weatherMap);

    L.tileLayer(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${apiKey}`, { opacity: 0.5 }).addTo(weatherMap);
}

// ============ Biểu đồ nhiệt độ ============

function initTemperatureChart() {
    const ctx = document.getElementById("tempChart").getContext("2d");
    if (tempChart) tempChart.destroy();
    tempChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                {
                    label: currentUnit === "metric" ? "Nhiệt độ (°C)" : "Nhiệt độ (°F)",
                    data: [],
                    borderColor: "#4FA3D1",
                    backgroundColor: "rgba(79, 163, 209, 0.15)",
                    tension: 0.4,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            plugins: { legend: { display: true, labels: { color: getComputedStyle(document.body).getPropertyValue("--text").trim() } } },
            scales: {
                y: { beginAtZero: false, grid: { color: "rgba(128,128,128,0.15)" }, ticks: { color: getComputedStyle(document.body).getPropertyValue("--text").trim() } },
                x: { grid: { color: "rgba(128,128,128,0.15)" }, ticks: { color: getComputedStyle(document.body).getPropertyValue("--text").trim() } },
            },
        },
    });
}

function updateTemperatureChart(forecastData) {
    const labels = [];
    const temperatures = [];

    forecastData.list.slice(0, 8).forEach((item) => {
        const time = new Date(item.dt * 1000);
        labels.push(time.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
        temperatures.push(currentUnit === "metric" ? Math.round(item.main.temp) : Math.round(celsiusToFahrenheit(item.main.temp)));
    });

    if (!tempChart) initTemperatureChart();

    tempChart.data.labels = labels;
    tempChart.data.datasets[0].label = currentUnit === "metric" ? "Nhiệt độ (°C)" : "Nhiệt độ (°F)";
    tempChart.data.datasets[0].data = temperatures;
    tempChart.update();
}

// ============ Khởi tạo trang ============

document.addEventListener("DOMContentLoaded", () => {
    const savedTheme = localStorage.getItem("theme");
    const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    const useLight = savedTheme ? savedTheme === "light" : prefersLight;
    themeToggle.checked = useLight;
    document.body.classList.toggle("light-mode", useLight);

    document.getElementById(currentUnit === "metric" ? "unit-c" : "unit-f").classList.add("active");

    renderFavoritesUI();
    updateRecentSearchesUI();
});
