// app.js - Mine Map Frontend (Stable Version)
let map;
let markers = [];
let isAddMode = false;
let autocomplete;

// デプロイ済みGAS URL
const GAS_URL = "https://script.google.com/macros/s/AKfycbyvYRzHMwNLWdoszGPrH-vplaRcbRHUBB-iKTgiyyqaRBN7syjb3zlll4K3UHiEC3_J/exec";

// 地雷タイプ別の絵文字
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

        map = new Map(document.getElementById("map"), {
            center: { lat: 35.6895, lng: 139.6917 },
            zoom: 13,
            mapId: "DEMO_MAP_ID",
            disableDefaultUI: false,
        });

        // 検索機能のセットアップ
        initAutocomplete(Autocomplete);

        // データのロード
        fetchIncidents();

        // マッパー追加用クリックイベント
        map.addListener("click", (e) => {
            if (!isAddMode) {
                closeInfoPanel();
                return;
            }
            handleMapClick(e.latLng, Geocoder);
        });

        console.log("Map initialized successfully.");
    } catch (error) {
        console.error("Error during Map initialization:", error);
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
        if (!place.geometry || !place.geometry.location) {
            return;
        }

        map.setCenter(place.geometry.location);
        map.setZoom(17);

        if (isAddMode) {
            document.getElementById('lat').value = place.geometry.location.lat();
            document.getElementById('lng').value = place.geometry.location.lng();
            document.getElementById('store-name').value = place.name || "";
            document.getElementById('add-modal').classList.remove('hidden');
            toggleAddMode(false);
        } else {
            showToast(`${place.name} に移動しました。`);
        }
    });
}

// データ取得
async function fetchIncidents() {
    if (!GAS_URL) return;

    try {
        const response = await fetch(GAS_URL);
        const data = await response.json();

        // 既存マーカーをクリア
        markers.forEach(m => m.setMap(null));
        markers = [];

        data.forEach(incident => addMarkerToMap(incident));
    } catch (e) {
        console.error("Fetch failed", e);
    }
}

async function addMarkerToMap(incident) {
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    const position = {
        lat: parseFloat(incident.lat),
        lng: parseFloat(incident.lng)
    };

    if (isNaN(position.lat) || isNaN(position.lng)) return;

    const content = document.createElement('div');
    content.className = 'custom-marker';
    content.textContent = icons[incident.type] || icons.other;
    content.style.fontSize = '24px';
    content.style.cursor = 'pointer';

    const marker = new AdvancedMarkerElement({
        map: map,
        position: position,
        content: content,
        title: labels[incident.type] || incident.type
    });

    marker.element.addEventListener('click', () => {
        showInfoPanel(incident);
    });

    markers.push(marker);
}

function showInfoPanel(incident) {
    const panel = document.getElementById('info-panel');
    const content = document.getElementById('panel-content');

    let extraHtml = "";
    if (incident.waitTime) extraHtml += `<p><strong>目安待ち時間:</strong> ${incident.waitTime}分</p>`;
    if (incident.url) extraHtml += `<p><a href="${incident.url}" target="_blank" class="external-link">🔗 Googleマップで見る</a></p>`;
    if (incident.photoUrl) {
        extraHtml += `<div class="info-photo"><img src="${incident.photoUrl}" alt="証拠写真" style="max-width:100%; border-radius:8px; margin-top:10px;"></div>`;
    }

    content.innerHTML = `
        <div class="incident-detail">
            <h3>${labels[incident.type] || '地雷情報'} ${icons[incident.type] || ''}</h3>
            <p><strong>店名:</strong> ${incident.storeName || '不明'}</p>
            <div class="desc">${incident.comment || ''}</div>
            <div class="extra-info">
                ${extraHtml}
            </div>
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

// 投稿機能
document.getElementById('incident-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const newIncident = {
        lat: parseFloat(document.getElementById('lat').value),
        lng: parseFloat(document.getElementById('lng').value),
        type: document.getElementById('hazard-type').value,
        storeName: document.getElementById('store-name').value,
        waitTime: document.getElementById('wait-time').value,
        comment: document.getElementById('comment').value,
        url: document.getElementById('map-url').value,
        photo: document.getElementById('photo-base64').value // base64
    };

    try {
        showToast("保存中...");
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
            document.getElementById('file-name').textContent = "選択されていません";
        } else {
            throw new Error(result.message);
        }
    } catch (err) {
        console.error(err);
        showToast("保存に失敗しました。再度お試しください。");
    }
});

// 写真のBase64エンコード処理
document.getElementById('photo-btn').addEventListener('click', () => {
    document.getElementById('photo').click();
});

document.getElementById('photo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('file-name').textContent = file.name;

    const reader = new FileReader();
    reader.onload = (event) => {
        const base64 = event.target.result.split(',')[1];
        document.getElementById('photo-base64').value = base64;

        // プレビュー表示
        const preview = document.getElementById('photo-preview');
        preview.src = event.target.result;
        document.getElementById('preview-area').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
});

// UI操作
document.getElementById('close-panel').addEventListener('click', closeInfoPanel);
document.querySelector('.close-modal').addEventListener('click', () => {
    document.getElementById('add-modal').classList.add('hidden');
});
document.getElementById('add-mode-btn').addEventListener('click', () => {
    toggleAddMode(!isAddMode);
});

// 待ち時間スライダー
document.getElementById('wait-time').addEventListener('input', (e) => {
    document.getElementById('wait-time-val').textContent = `${e.target.value}分`;
});

function toggleAddMode(active) {
    isAddMode = active;
    const btn = document.getElementById('add-mode-btn');
    if (isAddMode) {
        btn.classList.add('active');
        showToast("場所を検索するか、地図をクリックしてください");
        document.body.style.cursor = "crosshair";
    } else {
        btn.classList.remove('active');
        document.body.style.cursor = "default";
    }
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
}

// URL入力時の自動取得
document.getElementById('map-url').addEventListener('change', async (e) => {
    const url = e.target.value.trim();
    if (!url || !url.includes('maps')) return;

    try {
        showToast("店舗情報を取得中...");
        const response = await fetch(`${GAS_URL}?action=scrape&url=${encodeURIComponent(url)}`);
        const result = await response.json();

        if (result.status === "success" && result.data) {
            const data = result.data;
            if (data.name) document.getElementById('store-name').value = data.name;
            if (data.lat \u0026\u0026 data.lng) {
    document.getElementById('lat').value = data.lat;
    document.getElementById('lng').value = data.lng;
    const loc = { lat: parseFloat(data.lat), lng: parseFloat(data.lng) };
    map.setCenter(loc);
    map.setZoom(17);
    showToast("店舗を特定しました！");
}
        }
    } catch (err) {
    console.error(err);
}
});

// 確実に初期化を実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMap);
} else {
    initMap();
}
