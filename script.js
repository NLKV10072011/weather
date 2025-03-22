const apiKey = "124e819940bb3a1a016da54c44ab4074"; // Thay bằng API key từ OpenWeatherMap

async function getWeather() {
    const city = document.getElementById("city-input").value;
    if (city === "") {
        alert("Vui lòng nhập thành phố!");
        return;
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric&lang=vi`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.cod === "404") {
            alert("Không tìm thấy thành phố!");
            return;
        }

        document.getElementById("city-name").innerText = `Thành phố: ${data.name}`;
        document.getElementById("temperature").innerText = `Nhiệt độ: ${data.main.temp}°C`;
        document.getElementById("weather-description").innerText = `Trạng thái: ${data.weather[0].description}`;
        document.getElementById("weather-icon").src = `https://openweathermap.org/img/wn/${data.weather[0].icon}.png`;

        document.getElementById("weather-info").classList.remove("hidden");
    } catch (error) {
        alert("Lỗi lấy dữ liệu!");
    }
}

// Xử lý chuyển đổi
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