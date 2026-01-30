// app.js - Mine Map Frontend (Complete & Stable)
let map;
let markers = [];
let isAddMode = false;
let autocomplete;

// デプロイ済みGAS URL
const GAS_URL = "https://script.google.com/macros/s/AKfycbznVXoA-Kel1Q-u4_cS5aVVu3MuOfyG4Xv2K-VrNYkLLFS__iECmWceTVT-NTLkowvh/exec";

// アイコンとラベルの定義
const icons = {
    wait: '⏳',
    location: '🗺️',
    attitude: '😡',
    parking: '🚲',
    other: '💣'
};

const labels = {
    wait: '調理待ちが長い',
    location: '場所がわかりにくい',
    attitude: '店員の態度が悪い',
    parking: '駐輪スペースなし',
    other: 'その他'
};

async function initMap() {
    console.log("Initializing Map...");
    try {
        const { Map } = await google.maps.importLibrary("maps");
        const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
        const { Geocoder } = await google.maps.importLibrary("geocoding");
        const { Autocomplete } = await google.maps.importLibrary("places");

        // デフォルト: 東京駅
        let initialCenter = { lat: 35.6812, lng: 139.7671 };

        // 保存された位置があれば読み込み
        const savedPos = localStorage.getItem('mapCenter');
        if (savedPos) {
            try {
                initialCenter = JSON.parse(savedPos);
            } catch (e) { console.error("Failed to parse saved position", e); }
        }

        map = new Map(document.getElementById("map"), {
            center: initialCenter,
            zoom: 13,
            mapId: "DEMO_MAP_ID",
            disableDefaultUI: false,
        });

        // 位置保存
        map.addListener('idle', () => {
            const center = map.getCenter();
            if (center) {
                localStorage.setItem('mapCenter', JSON.stringify({
                    lat: center.lat(),
                    lng: center.lng()
                }));
            }
        });

        // 現在地取得
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const pos = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    };
                    map.setCenter(pos);
                },
                () => {
                    console.log("Geolocation failed or denied.");
                }
            );
        }

        initAutocomplete(Autocomplete);
        fetchIncidents();

        map.addListener("click", (e) => {
            if (!isAddMode) {
                closeInfoPanel();
                return;
            }
            handleMapClick(e.latLng, Geocoder);
        });

    } catch (error) {
        console.error("Map Load Error:", error);
    }
}

function initAutocomplete(Autocomplete) {
    const input = document.getElementById("pac-input");
    autocomplete = new Autocomplete(input, {
        fields: ["geometry", "name", "formatted_address"],
        componentRestrictions: { country: "jp" }
    });

    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) return;

        map.setCenter(place.geometry.location);
        map.setZoom(17);

        if (isAddMode) {
            document.getElementById('lat').value = place.geometry.location.lat();
            document.getElementById('lng').value = place.geometry.location.lng();
            document.getElementById('store-name').value = place.name || "";
            document.getElementById('add-modal').classList.remove('hidden');
            toggleAddMode(false);
        }
    });
}

async function fetchIncidents() {
    if (!GAS_URL) return;
    try {
        const response = await fetch(GAS_URL);
        const data = await response.json();
        markers.forEach(m => m.setMap(null));
        markers = [];
        data.forEach(incident => addMarkerToMap(incident));
    } catch (e) {
        console.error("Fetch failed", e);
    }
}

async function addMarkerToMap(incident) {
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
    const position = { lat: parseFloat(incident.lat), lng: parseFloat(incident.lng) };
    if (isNaN(position.lat) || isNaN(position.lng)) return;

    const content = document.createElement('div');
    content.className = 'custom-marker';
    content.textContent = icons[incident.hazardType] || icons.other;
    content.style.fontSize = '24px';
    content.style.cursor = 'pointer';

    const marker = new AdvancedMarkerElement({
        map,
        position,
        content,
        title: incident.storeName
    });

    marker.element.addEventListener('click', (e) => {
        e.stopPropagation();
        showInfoPanel(incident);
    });
    markers.push(marker);
}

function showInfoPanel(incident) {
    const panel = document.getElementById('info-panel');
    const content = document.getElementById('panel-content');

    let extraHtml = "";
    if (incident.waitTime) extraHtml += `<p><strong>目安待ち時間:</strong> ${incident.waitTime}分</p>`;
    if (incident.originalMapUrl) extraHtml += `<p><a href="${incident.originalMapUrl}" target="_blank" class="external-link">🔗 Googleマップで見る</a></p>`;
    if (incident.photoUrl && incident.photoUrl.startsWith('http')) {
        extraHtml += `<div class="info-photo"><img src="${incident.photoUrl}" alt="証拠写真" style="max-width:100%; border-radius:8px; margin-top:10px;"></div>`;
    }

    content.innerHTML = `
        <div class="incident-detail">
            <h3>${labels[incident.hazardType] || '地雷情報'} ${icons[incident.hazardType] || ''}</h3>
            <p><strong>店名:</strong> ${incident.storeName || '不明'}</p>
            <div class="desc">${incident.comment || ''}</div>
            <div class="extra-info">${extraHtml}</div>
        </div>
    `;
    panel.classList.remove('hidden');
}

function closeInfoPanel() {
    document.getElementById('info-panel').classList.add('hidden');
}

async function handleMapClick(latLng, Geocoder) {
    document.getElementById('lat').value = latLng.lat();
    document.getElementById('lng').value = latLng.lng();
    const geocoder = new Geocoder();
    try {
        const response = await geocoder.geocode({ location: latLng });
        if (response.results[0]) {
            document.getElementById('store-name').value = response.results[0].formatted_address;
        }
    } catch (e) { }
    toggleAddMode(false);
    document.getElementById('add-modal').classList.remove('hidden');
}

// 投稿フォーム送信
document.getElementById('incident-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newIncident = {
        id: Date.now(),
        lat: parseFloat(document.getElementById('lat').value),
        lng: parseFloat(document.getElementById('lng').value),
        hazardType: document.getElementById('hazard-type').value,
        storeName: document.getElementById('store-name').value,
        waitTime: document.getElementById('wait-time').value,
        comment: document.getElementById('comment').value,
        originalMapUrl: document.getElementById('map-url').value,
        photoBase64: document.getElementById('photo-base64').value
    };

    try {
        showToast("送信中...");
        const response = await fetch(GAS_URL, {
            method: "POST",
            body: JSON.stringify(newIncident)
        });
        const result = await response.json();
        if (result.status === "success") {
            showToast("報告が完了しました！💣");
            fetchIncidents();
            document.getElementById('add-modal').classList.add('hidden');
            e.target.reset();
            document.getElementById('photo-preview').src = "";
            document.getElementById('preview-area').classList.add('hidden');
        } else {
            throw new Error(result.message);
        }
    } catch (err) {
        showToast("エラー: " + err.message);
    }
});

// URL自動解析
document.getElementById('map-url').addEventListener('change', async (e) => {
    const url = e.target.value.trim();
    if (!url || !url.includes('maps')) return;

    try {
        showToast("情報を抽出中...");
        const response = await fetch(`${GAS_URL}?action=analyze&url=${encodeURIComponent(url)}`);
        const result = await response.json();

        if (result.status === "success" && result.data) {
            const data = result.data;
            if (data.storeName) document.getElementById('store-name').value = data.storeName;
            if (data.lat && data.lng) {
                document.getElementById('lat').value = data.lat;
                document.getElementById('lng').value = data.lng;
                const loc = { lat: parseFloat(data.lat), lng: parseFloat(data.lng) };
                map.setCenter(loc);
                map.setZoom(17);
                showToast("場所を特定しました！");
            }
        }
    } catch (err) {
        console.error(err);
    }
});

// 写真処理
document.getElementById('photo-btn').addEventListener('click', () => document.getElementById('photo').click());
document.getElementById('photo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('file-name').textContent = file.name;
    const reader = new FileReader();
    reader.onload = (event) => {
        document.getElementById('photo-base64').value = event.target.result;
        document.getElementById('photo-preview').src = event.target.result;
        document.getElementById('preview-area').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
});

// UI制御
document.getElementById('close-panel').addEventListener('click', closeInfoPanel);
document.querySelector('.close-modal').addEventListener('click', () => document.getElementById('add-modal').classList.add('hidden'));
document.getElementById('add-mode-btn').addEventListener('click', () => toggleAddMode(!isAddMode));
document.getElementById('wait-time').addEventListener('input', (e) => document.getElementById('wait-time-val').textContent = `${e.target.value}分`);

function toggleAddMode(active) {
    isAddMode = active;
    const btn = document.getElementById('add-mode-btn');
    btn.classList.toggle('active', isAddMode);
    document.body.style.cursor = isAddMode ? "crosshair" : "default";
    if (isAddMode) showToast("地図上をクリックして報告");
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMap);
} else {
    initMap();
}
