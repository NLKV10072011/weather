// TODO: trong môi trường thực tế, key này nên được gọi qua một backend proxy
// thay vì để lộ trực tiếp trong JS phía client.
const apiKey = "124e819940bb3a1a016da54c44ab4074";

// ----- Trạng thái toàn cục -----
let weatherMap = null;
let tempChart = null;
let currentUnit = localStorage.getItem("unit") || "metric"; // 'metric' (°C) | 'imperial' (°F)
let lastCurrentData = null;
let lastForecastData = null;

// ----- Tham chiếu DOM dùng nhiều lần -----
const cityInput = document.getElementById("city-input");
const suggestionsContainer = document.getElementById("suggestions");
const weatherInfoEl = document.getElementById("weather-info");
const errorEl = document.getElementById("error-message");
const loadingEl = document.getElementById("loading");
const searchBtn = document.getElementById("search-btn");
const geoBtn = document.getElementById("geo-btn");

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

async function fetchWeather(queryParam) {
    setLoading(true);
    hideError();

    try {
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?${queryParam}&appid=${apiKey}&units=metric&lang=vi`;
        const currentResponse = await fetch(currentUrl);
        const currentData = await currentResponse.json();

        if (!currentResponse.ok) {
            showError(currentResponse.status === 404 ? "Không tìm thấy thành phố!" : "Lỗi lấy dữ liệu thời tiết!");
            return;
        }

        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?${queryParam}&appid=${apiKey}&units=metric&lang=vi`;
        const forecastResponse = await fetch(forecastUrl);
        const forecastData = await forecastResponse.json();

        if (!forecastResponse.ok) {
            showError("Lỗi lấy dữ liệu dự báo!");
            return;
        }

        lastCurrentData = currentData;
        lastForecastData = forecastData;

        renderCurrentWeather(currentData);
        renderForecast(forecastData);
        updateUVIndex(currentData.coord.lat, currentData.coord.lon);
        updateAirQuality(currentData.coord.lat, currentData.coord.lon);
        updateWeatherMap(currentData.coord.lat, currentData.coord.lon);
        updateTemperatureChart(forecastData);

        weatherInfoEl.classList.remove("hidden");
        hideError();

        // Map/canvas được khởi tạo trong khi container đang ẩn (height: 0) sẽ
        // render sai kích thước — nên phải "đánh thức" lại sau khi hiện ra.
        requestAnimationFrame(() => {
            if (weatherMap) weatherMap.invalidateSize();
            if (tempChart) tempChart.resize();
        });
    } catch (error) {
        console.error("Lỗi lấy dữ liệu:", error);
        showError("Lỗi kết nối, vui lòng thử lại!");
    } finally {
        setLoading(false);
    }
}

// ============ Hiển thị thời tiết hiện tại ============

function renderCurrentWeather(data) {
    const country = data.sys && data.sys.country ? `, ${data.sys.country}` : "";
    document.getElementById("city-name").innerText = `${data.name}${country}`;
    document.getElementById("temperature").innerText = formatTemp(data.main.temp);
    document.getElementById("weather-description").innerText = data.weather[0].description;

    const iconCode = data.weather[0].icon;
    const weatherIcon = document.getElementById("weather-icon");
    weatherIcon.src = `https://openweathermap.org/img/wn/${iconCode}@4x.png`;
    weatherIcon.alt = data.weather[0].description;
    weatherIcon.onerror = function () {
        this.src = "https://openweathermap.org/img/wn/02d@4x.png";
    };

    updateLocalTime(data.timezone);

    document.getElementById("humidity").innerText = `${data.main.humidity}%`;
    document.getElementById("wind-speed").innerText = formatSpeed(data.wind.speed * 3.6);
    document.getElementById("pressure").innerText = `${data.main.pressure} hPa`;
    document.getElementById("feels-like").innerText = formatTemp(data.main.feels_like);

    const sunrise = new Date((data.sys.sunrise + data.timezone) * 1000);
    const sunset = new Date((data.sys.sunset + data.timezone) * 1000);
    document.getElementById("sunrise").innerHTML = `
        <div class="sun-info"><i class="fas fa-sun"></i>${sunrise.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</div>
    `;
    document.getElementById("sunset").innerHTML = `
        <div class="sun-info"><i class="fas fa-moon"></i>${sunset.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</div>
    `;

    document.getElementById("visibility").innerText = `${(data.visibility / 1000).toFixed(1)} km`;

    saveToRecentSearches(data.name);
}

function updateLocalTime(timezone) {
    const now = new Date();
    const localTime = new Date(now.getTime() + timezone * 1000);
    document.getElementById("local-time").textContent = localTime.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    document.getElementById("date").textContent = localTime.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" });
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

    // Dùng lại dữ liệu đã tải, không cần gọi API lại chỉ để đổi đơn vị hiển thị.
    if (lastCurrentData) renderCurrentWeather(lastCurrentData);
    if (lastForecastData) {
        renderForecast(lastForecastData);
        updateTemperatureChart(lastForecastData);
    }
}

// ============ Tìm kiếm gần đây ============

function saveToRecentSearches(city) {
    let recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");
    recentSearches = recentSearches.filter((item) => item !== city);
    recentSearches.unshift(city);
    recentSearches = recentSearches.slice(0, 5);
    localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
    updateRecentSearchesUI();
}

function updateRecentSearchesUI() {
    const recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");
    const container = document.getElementById("recent-cities");
    const section = document.getElementById("recent-searches-section");

    container.innerHTML = "";
    section.classList.toggle("hidden", recentSearches.length === 0);

    recentSearches.forEach((city) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "recent-city";
        btn.textContent = city;
        btn.addEventListener("click", () => selectCity(city));
        container.appendChild(btn);
    });
}

// ============ Dự báo 5 ngày ============

function renderForecast(data) {
    const forecastContainer = document.getElementById("forecast");
    forecastContainer.innerHTML = "";

    const dailyForecasts = data.list.filter((item) => item.dt_txt.includes("12:00:00"));

    dailyForecasts.forEach((forecast) => {
        const date = new Date(forecast.dt * 1000);
        const dayName = date.toLocaleDateString("vi-VN", { weekday: "short" });

        const forecastDay = document.createElement("div");
        forecastDay.className = "forecast-day";
        forecastDay.innerHTML = `
            <div class="date">${dayName}, ${date.getDate()}/${date.getMonth() + 1}</div>
            <img src="https://openweathermap.org/img/wn/${forecast.weather[0].icon}.png" alt="${forecast.weather[0].description}">
            <div class="temp">${formatTemp(forecast.main.temp)}</div>
            <div class="temp-range">
                <span class="temp-min">${formatTemp(forecast.main.temp_min)}</span>
                <span class="temp-max">${formatTemp(forecast.main.temp_max)}</span>
            </div>
            <div class="description">${forecast.weather[0].description}</div>
        `;
        forecastContainer.appendChild(forecastDay);
    });
}

// ============ Trạng thái tải / lỗi ============

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

// ============ Chuyển đổi giao diện sáng/tối ============

const themeToggle = document.getElementById("theme-toggle");

themeToggle.addEventListener("change", function () {
    document.body.classList.toggle("light-mode", this.checked);
    localStorage.setItem("theme", this.checked ? "light" : "dark");
});

const savedTheme = localStorage.getItem("theme");
if (savedTheme === "light") {
    themeToggle.checked = true;
    document.body.classList.add("light-mode");
}

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
    const uvElement = document.getElementById("uv-index");
    try {
        const uvResponse = await fetch(`https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&appid=${apiKey}&exclude=minutely,hourly,daily,alerts`);
        const uvData = await uvResponse.json();

        if (!uvResponse.ok || typeof uvData?.current?.uvi !== "number") {
            throw new Error("UV index không khả dụng");
        }

        const uvIndex = Math.round(uvData.current.uvi);
        uvElement.innerHTML = `<span>${uvIndex}</span> <i class="fas fa-sun"></i>`;
        uvElement.className = "";
        if (uvIndex <= 2) uvElement.classList.add("uv-low");
        else if (uvIndex <= 5) uvElement.classList.add("uv-moderate");
        else if (uvIndex <= 7) uvElement.classList.add("uv-high");
        else if (uvIndex <= 10) uvElement.classList.add("uv-very-high");
        else uvElement.classList.add("uv-extreme");
    } catch (error) {
        uvElement.textContent = "--";
        uvElement.className = "";
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

// ============ Icon dự tải trước ============

function preloadWeatherIcons() {
    const iconCodes = ["01d", "02d", "03d", "04d", "09d", "10d", "11d", "13d", "50d", "01n", "02n", "03n", "04n", "09n", "10n", "11n", "13n", "50n"];
    iconCodes.forEach((code) => {
        const img = new Image();
        img.src = `https://openweathermap.org/img/wn/${code}@4x.png`;
    });
}

// ============ Bản đồ thời tiết ============
// Map chỉ được khởi tạo lần đầu khi có dữ liệu (container lúc đó mới hiện ra
// và có kích thước thật) — khởi tạo sớm hơn khi container đang ẩn sẽ khiến
// Leaflet tính sai kích thước và hiển thị bản đồ xám/lệch.

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

    const weatherLayer = L.tileLayer(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${apiKey}`, {
        opacity: 0.5,
    });
    weatherLayer.addTo(weatherMap);
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
                    borderColor: "#a0d8ff",
                    backgroundColor: "rgba(160, 216, 255, 0.1)",
                    tension: 0.4,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true, labels: { color: "#fff" } },
            },
            scales: {
                y: { beginAtZero: false, grid: { color: "rgba(255, 255, 255, 0.1)" }, ticks: { color: "#fff" } },
                x: { grid: { color: "rgba(255, 255, 255, 0.1)" }, ticks: { color: "#fff" } },
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
    document.getElementById(currentUnit === "metric" ? "unit-c" : "unit-f").classList.add("active");
    updateRecentSearchesUI();
    preloadWeatherIcons();
});
