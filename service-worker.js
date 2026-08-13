const CACHE_NAME = "tram-thoi-tiet-v1";

// Chỉ cache "vỏ" ứng dụng (giao diện tĩnh), không cache dữ liệu thời tiết
// vì dữ liệu đó cần luôn mới.
const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "./icon.svg",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Chỉ can thiệp cache cho tài nguyên cùng gốc (app shell).
    // Request tới OpenWeatherMap, Leaflet, Chart.js, font... luôn đi thẳng ra mạng
    // để dữ liệu thời tiết và bản đồ luôn mới.
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return response;
                })
                .catch(() => cached);
            // Ưu tiên trả cache ngay (mở nhanh, dùng được khi mất mạng),
            // đồng thời vẫn âm thầm cập nhật cache từ mạng ở nền.
            return cached || network;
        })
    );
});
