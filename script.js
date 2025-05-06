const apiKey = "124e819940bb3a1a016da54c44ab4074"; // Thay bằng API key từ OpenWeatherMap

// Biến toàn cục cho map và chart
let weatherMap = null;
let tempChart = null;

async function getWeather() {
    const city = document.getElementById("city-input").value;
    if (city === "") {
        showError("Vui lòng nhập thành phố!");
        return;
    }

    try {
        // Lấy thời tiết hiện tại
        const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric&lang=vi`;
        const currentResponse = await fetch(currentWeatherUrl);
        const currentData = await currentResponse.json();

        if (currentData.cod === "404") {
            showError("Không tìm thấy thành phố!");
            return;
        }

        // Lấy dự báo 5 ngày
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${apiKey}&units=metric&lang=vi`;
        const forecastResponse = await fetch(forecastUrl);
        const forecastData = await forecastResponse.json();

        // Cập nhật thông tin thời tiết hiện tại
        updateCurrentWeather(currentData);
        // Cập nhật dự báo 5 ngày
        updateForecast(forecastData);
        // Cập nhật UV index
        updateUVIndex(currentData.coord.lat, currentData.coord.lon);
        // Cập nhật chất lượng không khí
        updateAirQuality(currentData.coord.lat, currentData.coord.lon);
        // Cập nhật bản đồ thời tiết
        updateWeatherMap(currentData.coord.lat, currentData.coord.lon);
        // Cập nhật biểu đồ nhiệt độ
        updateTemperatureChart(forecastData);

        document.getElementById("weather-info").classList.remove("hidden");
        document.getElementById("error-message").classList.add("hidden");
    } catch (error) {
        showError("Lỗi lấy dữ liệu!");
    }
}

function updateCurrentWeather(data) {
    document.getElementById("city-name").innerText = data.name;
    document.getElementById("temperature").innerText = `${Math.round(data.main.temp)}°C`;
    document.getElementById("weather-description").innerText = data.weather[0].description;
    
    // Cập nhật weather icon với kích thước lớn hơn và đường dẫn chính xác
    const iconCode = data.weather[0].icon;
    const iconUrl = `https://openweathermap.org/img/wn/${iconCode}@4x.png`;
    const weatherIcon = document.getElementById("weather-icon");
    weatherIcon.src = iconUrl;
    weatherIcon.alt = data.weather[0].description;
    
    // Thêm class để xử lý lỗi hình ảnh
    weatherIcon.onerror = function() {
        this.src = 'https://openweathermap.org/img/wn/02d@4x.png'; // Hình ảnh dự phòng
        console.log('Lỗi tải hình ảnh thời tiết');
    };
    
    // Cập nhật thời gian địa phương
    updateLocalTime(data.timezone);
    
    // Cập nhật chi tiết thời tiết
    document.getElementById("humidity").innerText = `${data.main.humidity}%`;
    document.getElementById("wind-speed").innerText = `${(data.wind.speed * 3.6).toFixed(1)} km/h`;
    document.getElementById("pressure").innerText = `${data.main.pressure} hPa`;
    document.getElementById("feels-like").innerText = `${Math.round(data.main.feels_like)}°C`;
    
    // Cập nhật thông tin mặt trời
    const sunrise = new Date((data.sys.sunrise + data.timezone) * 1000);
    const sunset = new Date((data.sys.sunset + data.timezone) * 1000);
    document.getElementById("sunrise").innerHTML = `
        <div class="sun-info">
            <i class="fas fa-sun"></i>
            ${sunrise.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}
        </div>
    `;
    document.getElementById("sunset").innerHTML = `
        <div class="sun-info">
            <i class="fas fa-moon"></i>
            ${sunset.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}
        </div>
    `;
    
    // Cập nhật tầm nhìn
    document.getElementById("visibility").innerText = `${(data.visibility / 1000).toFixed(1)} km`;
    
    // Lưu thành phố vào lịch sử tìm kiếm
    saveToRecentSearches(data.name);
}

function updateLocalTime(timezone) {
    const now = new Date();
    const localTime = new Date(now.getTime() + timezone * 1000);
    
    document.getElementById("local-time").textContent = 
        localTime.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
    
    document.getElementById("date").textContent = 
        localTime.toLocaleDateString('vi-VN', {weekday: 'long', day: 'numeric', month: 'long'});
}

function saveToRecentSearches(city) {
    let recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
    recentSearches = recentSearches.filter(item => item !== city);
    recentSearches.unshift(city);
    recentSearches = recentSearches.slice(0, 5);
    localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
    updateRecentSearchesUI();
}

function updateRecentSearchesUI() {
    const recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
    const container = document.getElementById('recent-cities');
    container.innerHTML = recentSearches.map(city => `
        <div class="recent-city" onclick="selectCity('${city}')">
            ${city}
        </div>
    `).join('');
}

function updateForecast(data) {
    const forecastContainer = document.getElementById("forecast");
    forecastContainer.innerHTML = "";

    // Lọc dữ liệu để lấy 1 điểm dữ liệu mỗi ngày (12:00)
    const dailyForecasts = data.list.filter(item => item.dt_txt.includes("12:00:00"));

    dailyForecasts.forEach(forecast => {
        const date = new Date(forecast.dt * 1000);
        const dayName = date.toLocaleDateString('vi-VN', { weekday: 'short' });
        const day = date.getDate();
        const month = date.getMonth() + 1;

        const forecastDay = document.createElement("div");
        forecastDay.className = "forecast-day";
        forecastDay.innerHTML = `
            <div class="date">${dayName}, ${day}/${month}</div>
            <img src="https://openweathermap.org/img/wn/${forecast.weather[0].icon}.png" alt="${forecast.weather[0].description}">
            <div class="temp">${Math.round(forecast.main.temp)}°C</div>
            <div class="temp-range">
                <span class="temp-min">${Math.round(forecast.main.temp_min)}°</span>
                <span class="temp-max">${Math.round(forecast.main.temp_max)}°</span>
            </div>
            <div class="description">${forecast.weather[0].description}</div>
        `;
        forecastContainer.appendChild(forecastDay);
    });
}

function showError(message) {
    const errorElement = document.getElementById("error-message");
    errorElement.innerText = message;
    errorElement.classList.remove("hidden");
    document.getElementById("weather-info").classList.add("hidden");
}

// Xử lý chuyển đổi theme
const themeToggle = document.querySelector('.switch input');

themeToggle.addEventListener('change', function() {
    document.body.classList.toggle('light-mode', this.checked);
    localStorage.setItem('theme', this.checked ? 'light' : 'dark');
});

// Khôi phục theme
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') {
    themeToggle.checked = true;
    document.body.classList.add('light-mode');
} else {
    themeToggle.checked = false;
    document.body.classList.remove('light-mode');
}

// Tự động hoàn thành khi nhập thành phố
const cityInput = document.getElementById("city-input");
const suggestionsContainer = document.getElementById("suggestions");

cityInput.addEventListener("input", debounce(async (e) => {
    const input = e.target.value;
    if (input.length < 2) {
        suggestionsContainer.classList.add("hidden");
        return;
    }

    try {
        const response = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${input}&limit=5&appid=${apiKey}`);
        const data = await response.json();
        
        if (data.length > 0) {
            suggestionsContainer.innerHTML = data.map(city => `
                <div class="suggestion-item" onclick="selectCity('${city.name}, ${city.country}')">
                    ${city.name}, ${city.country}
                </div>
            `).join('');
            suggestionsContainer.classList.remove("hidden");
        } else {
            suggestionsContainer.classList.add("hidden");
        }
    } catch (error) {
        console.error("Lỗi tìm kiếm thành phố:", error);
        suggestionsContainer.classList.add("hidden");
    }
}, 500));

function selectCity(city) {
    cityInput.value = city;
    suggestionsContainer.classList.add("hidden");
    getWeather();
}

// Đóng suggestions khi click ra ngoài
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) {
        suggestionsContainer.classList.add("hidden");
    }
});

// Hàm debounce để giới hạn số lần gọi API
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Thêm hàm cập nhật UV index
async function updateUVIndex(lat, lon) {
    try {
        const uvResponse = await fetch(`https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&appid=${apiKey}`);
        const uvData = await uvResponse.json();
        
        const uvIndex = Math.round(uvData.value);
        const uvElement = document.getElementById("uv-index");
        uvElement.innerHTML = `
            <span>${uvIndex}</span>
            <i class="fas fa-sun"></i>
        `;
        
        // Thêm class dựa trên mức độ UV
        uvElement.className = '';
        if (uvIndex <= 2) uvElement.classList.add('uv-low');
        else if (uvIndex <= 5) uvElement.classList.add('uv-moderate');
        else if (uvIndex <= 7) uvElement.classList.add('uv-high');
        else if (uvIndex <= 10) uvElement.classList.add('uv-very-high');
        else uvElement.classList.add('uv-extreme');
    } catch (error) {
        console.error("Lỗi lấy UV index:", error);
    }
}

// Thêm hàm cập nhật chất lượng không khí
async function updateAirQuality(lat, lon) {
    try {
        const aqiResponse = await fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`);
        const aqiData = await aqiResponse.json();
        
        const aqi = aqiData.list[0].main.aqi;
        const components = aqiData.list[0].components;
        
        const aqiElement = document.getElementById("aqi-value");
        const levelElement = document.getElementById("aqi-level");
        
        aqiElement.textContent = aqi;
        
        // Cập nhật màu sắc và mức độ AQI
        let level = "";
        let className = "";
        switch(aqi) {
            case 1:
                level = "Tốt";
                className = "aqi-good";
                break;
            case 2:
                level = "Trung bình";
                className = "aqi-moderate";
                break;
            case 3:
                level = "Kém";
                className = "aqi-unhealthy";
                break;
            case 4:
                level = "Xấu";
                className = "aqi-very-unhealthy";
                break;
            case 5:
                level = "Rất xấu";
                className = "aqi-hazardous";
                break;
        }
        
        levelElement.textContent = level;
        aqiElement.className = className;
        levelElement.className = className;
        
        // Cập nhật các chỉ số ô nhiễm
        document.getElementById("pm25").textContent = `${components.pm2_5.toFixed(1)} µg/m³`;
        document.getElementById("pm10").textContent = `${components.pm10.toFixed(1)} µg/m³`;
        document.getElementById("no2").textContent = `${components.no2.toFixed(1)} µg/m³`;
    } catch (error) {
        console.error("Lỗi lấy chất lượng không khí:", error);
    }
}

// Thêm hàm preloadWeatherIcons để tải trước các icon thời tiết
function preloadWeatherIcons() {
    const iconCodes = ['01d', '02d', '03d', '04d', '09d', '10d', '11d', '13d', '50d',
                      '01n', '02n', '03n', '04n', '09n', '10n', '11n', '13n', '50n'];
    
    iconCodes.forEach(code => {
        const img = new Image();
        img.src = `https://openweathermap.org/img/wn/${code}@4x.png`;
    });
}

// Hàm khởi tạo bản đồ
function initWeatherMap() {
    if (!weatherMap) {
        weatherMap = L.map('map').setView([21.0285, 105.8542], 5); // Mặc định hiển thị Hà Nội
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(weatherMap);
    }
}

// Hàm cập nhật bản đồ thời tiết
function updateWeatherMap(lat, lon) {
    if (!weatherMap) {
        initWeatherMap();
    }
    
    weatherMap.setView([lat, lon], 10);
    
    // Xóa các marker cũ
    weatherMap.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
            weatherMap.removeLayer(layer);
        }
    });
    
    // Thêm marker mới
    L.marker([lat, lon]).addTo(weatherMap);
    
    // Thêm layer thời tiết
    const weatherLayer = L.tileLayer(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${apiKey}`, {
        opacity: 0.5
    });
    weatherMap.addLayer(weatherLayer);
}

// Hàm khởi tạo biểu đồ nhiệt độ
function initTemperatureChart() {
    const ctx = document.getElementById('tempChart').getContext('2d');
    if (tempChart) {
        tempChart.destroy();
    }
    tempChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Nhiệt độ (°C)',
                data: [],
                borderColor: '#a0d8ff',
                backgroundColor: 'rgba(160, 216, 255, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#fff'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#fff'
                    }
                }
            }
        }
    });
}

// Hàm cập nhật biểu đồ nhiệt độ
function updateTemperatureChart(forecastData) {
    const labels = [];
    const temperatures = [];
    
    forecastData.list.slice(0, 8).forEach(item => {
        const time = new Date(item.dt * 1000);
        labels.push(time.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'}));
        temperatures.push(Math.round(item.main.temp));
    });
    
    if (!tempChart) {
        initTemperatureChart();
    }
    
    tempChart.data.labels = labels;
    tempChart.data.datasets[0].data = temperatures;
    tempChart.update();
}

// Khởi tạo khi trang web được tải
document.addEventListener('DOMContentLoaded', () => {
    updateRecentSearchesUI();
    preloadWeatherIcons();
    initWeatherMap();
    initTemperatureChart();
});
