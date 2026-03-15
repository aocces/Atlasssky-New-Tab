const WEATHER_TEXT_MAP = {
    0: "晴朗",
    1: "大部晴朗",
    2: "局部多云",
    3: "阴天",
    45: "有雾",
    48: "有雾",
    51: "小毛毛雨",
    53: "毛毛雨",
    55: "浓毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    80: "阵雨",
    81: "强阵雨",
    82: "暴雨",
    95: "雷暴"
};

const WEATHER_ICON_MAP = {
    0: "☀",
    1: "🌤",
    2: "⛅",
    3: "☁",
    45: "🌫",
    48: "🌫",
    51: "🌦",
    53: "🌦",
    55: "🌧",
    61: "🌦",
    63: "🌧",
    65: "🌧",
    71: "❄",
    73: "❄",
    75: "❄",
    80: "🌦",
    81: "🌧",
    82: "⛈",
    95: "⛈"
};

function renderWeather(weatherData) {

    const weatherIcon = document.getElementById("weatherIcon");
    const weatherText = document.getElementById("weatherText");
    const weatherBox = document.getElementById("weatherBox");

    if (!weatherIcon || !weatherText || !weatherBox) return;

    const current = weatherData?.current;

    if (!current) {
        weatherIcon.textContent = "☁";
        weatherText.textContent = "天气不可用";
        return;
    }

    const code = current.weather_code;
    const temp = Math.round(current.temperature_2m);

    const text = WEATHER_TEXT_MAP[code] || "未知天气";
    const icon = WEATHER_ICON_MAP[code] || "☁";

    weatherIcon.textContent = icon;
    weatherText.textContent = `${temp}° ${text}`;

    weatherBox.style.cursor = "pointer";

    weatherBox.onclick = () => {
        window.open("https://www.msn.com/weather", "_blank");
    };

}

function renderWeatherError(message = "天气不可用") {

    const weatherIcon = document.getElementById("weatherIcon");
    const weatherText = document.getElementById("weatherText");

    if (weatherIcon) weatherIcon.textContent = "☁";
    if (weatherText) weatherText.textContent = message;

}

async function fetchWeatherByCoords(latitude, longitude) {

    const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,weather_code&timezone=auto`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("天气接口请求失败");
    }

    return await response.json();

}

function initWeather() {

    try {

        const settings =
            JSON.parse(localStorage.getItem("settings") || "{}");

        if (!settings.weather) return;

        if (!navigator.geolocation) {
            renderWeatherError("设备不支持定位");
            return;
        }

        navigator.geolocation.getCurrentPosition(

            async (position) => {

                try {

                    const latitude = position.coords.latitude;
                    const longitude = position.coords.longitude;

                    const weatherData =
                        await fetchWeatherByCoords(latitude, longitude);

                    renderWeather(weatherData);

                } catch (error) {

                    console.error("天气请求失败：", error);
                    renderWeatherError("天气不可用");

                }

            },

            (error) => {

                console.error("定位失败：", error);
                renderWeatherError("请允许定位");

            },

            {
                enableHighAccuracy: false,
                timeout: 8000,
                maximumAge: 10 * 60 * 1000
            }

        );

    } catch (error) {

        console.error("天气初始化失败：", error);
        renderWeatherError("天气不可用");

    }

}

window.initWeather = initWeather;

window.addEventListener("load", initWeather);