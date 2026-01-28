// app.js - Mine Map Frontend
let map;
let markers = [];
let isAddMode = false;
let autocomplete;

// デプロイ済みGAS URL
const GAS_URL = "https://script.google.com/macros/s/AKfycbyvYRzHMwNLWdoszGPrH-vplaRcbRHUBB-iKTgiyyqaRBN7syjb3zlll4K3UHiEC3_J/exec";

// マーカーアイコン定義 (地雷タイプ別)
const icons = {
    fire: '🔥',
    suicide: '👻',
    murder: '🔪',
    solitary: '🍂',
    other: '⚠️'
};

async function initMap() {
    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
    const { Geocoder } = await google.maps.importLibrary("geocoding");
    const { Autocomplete } = await google.maps.importLibrary("places");

    map = new Map(document.getElementById("map"), {
        center: { lat: 35.6895, lng: 139.6917 },
        zoom: 13,
        mapId: "DEMO_MAP_ID",
        disableDefaultUI: true,
    });

    // 検索機能のセットアップ
    initAutocomplete(Autocomplete);

    // データのロード
    fetchIncidents();

    // マップクリックイベント
    map.addListener("click", (e) => {
        if (!isAddMode) {
            closeInfoPanel();
            return;
        }
        handleMapClick(e.latLng, Geocoder);
    });
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

        // 地図を移動
        map.setCenter(place.geometry.location);
        map.setZoom(17);

        // 投稿モードならフォームに住所をセット
        if (isAddMode) {
            document.getElementById('lat').value = place.geometry.location.lat();
            document.getElementById('lng').value = place.geometry.location.lng();
            document.getElementById('address').value = place.formatted_address || place.name;
            document.getElementById('add-modal').classList.remove('hidden');
            toggleAddMode(false);
        } else {
            showToast(`${place.name} に移動しました。投稿するには + ボタンを押してください。`);
        }
    });
}

// データ取得
async function fetchIncidents() {
    if (!GAS_URL) {
        console.warn("GAS_URLが未設定です。ローカルストレージを使用します。");
        loadIncidentsFromLocal();
        return;
    }

    try {
        const response = await fetch(GAS_URL);
        const data = await response.json();

        // 既存マーカーをクリア
        markers.forEach(m => m.setMap(null));
        markers = [];

        data.forEach(incident => addMarkerToMap(incident));
        showToast("最新データを読み込みました。");
    } catch (e) {
        console.error("Fetch failed", e);
        showToast("データの読み込みに失敗しました。");
        loadIncidentsFromLocal();
    }
}

// 予備: ローカルストレージからの読み込み
function loadIncidentsFromLocal() {
    const stored = localStorage.getItem('ghost_map_data');
    if (!stored) return;
    const incidents = JSON.parse(stored);
    markers.forEach(m => m.setMap(null));
    markers = [];
    incidents.forEach(incident => addMarkerToMap(incident));
}

async function addMarkerToMap(incident) {
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    // lat/lngが文字列で来ることがあるため数値変換
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
    content.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))';

    const marker = new AdvancedMarkerElement({
        map: map,
        position: position,
        content: content,
        title: incident.type
    });

    marker.element.addEventListener('click', () => {
        showInfoPanel(incident);
    });

    markers.push(marker);
}

function showInfoPanel(incident) {
    const panel = document.getElementById('info-panel');
    const content = document.getElementById('panel-content');

    const typeLabel = {
        fire: '火災', suicide: '自殺', murder: '殺人', solitary: '孤独死', other: 'その他'
    }[incident.type];

    let extraHtml = "";
    if (incident.price) extraHtml += `<p><strong>価格:</strong> <span style="color:var(--accent-color); font-weight:bold;">${incident.price}</span></p>`;
    if (incident.area) extraHtml += `<p><strong>面積:</strong> ${incident.area}</p>`;
    if (incident.url) extraHtml += `<p><a href="${incident.url}" target="_blank" class="external-link">🔗 物件情報を詳しく見る</a></p>`;

    content.innerHTML = `
        <div class="incident-detail">
            <h3>${typeLabel} ${icons[incident.type]}</h3>
            <span class="date">発生日: ${incident.date}</span>
            <p><strong>場所:</strong> ${incident.address}</p>
            <div class="desc">${incident.description}</div>
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
            document.getElementById('address').value = response.results[0].formatted_address;
        } else {
            document.getElementById('address').value = "住所不明";
        }
    } catch (e) {
        document.getElementById('address').value = "取得失敗";
    }

    toggleAddMode(false);
    document.getElementById('add-modal').classList.remove('hidden');
}

// 投稿機能
document.getElementById('incident-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const newIncident = {
        id: Date.now(),
        lat: parseFloat(document.getElementById('lat').value),
        lng: parseFloat(document.getElementById('lng').value),
        type: document.getElementById('type').value,
        address: document.getElementById('address').value,
        date: document.getElementById('date').value,
        description: document.getElementById('description').value,
        url: document.getElementById('url').value,
        price: document.getElementById('price').value,
        area: document.getElementById('area').value
    };

    if (GAS_URL) {
        try {
            showToast("保存中...");
            await fetch(GAS_URL, {
                method: "POST",
                body: JSON.stringify(newIncident)
            });
            showToast("スプレッドシートに保存されました！");
            fetchIncidents(); // 再取得してマーカー更新
        } catch (err) {
            console.error(err);
            showToast("GASへの保存に失敗しました。ローカルに保存します。");
            saveToLocal(newIncident);
        }
    } else {
        saveToLocal(newIncident);
    }

    document.getElementById('add-modal').classList.add('hidden');
    e.target.reset();
});

function saveToLocal(item) {
    const stored = localStorage.getItem('ghost_map_data');
    let incidents = stored ? JSON.parse(stored) : [];
    incidents.push(item);
    localStorage.setItem('ghost_map_data', JSON.stringify(incidents));
    addMarkerToMap(item);
    showToast("ブラウザに保存されました。");
}

// UI操作
document.getElementById('close-panel').addEventListener('click', closeInfoPanel);
document.querySelector('.close-modal').addEventListener('click', () => {
    document.getElementById('add-modal').classList.add('hidden');
});
document.getElementById('add-mode-btn').addEventListener('click', () => {
    toggleAddMode(!isAddMode);
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

// URL入力時の自動スクレイピング
document.getElementById('url').addEventListener('change', async (e) => {
    const url = e.target.value.trim();
    if (!url || !url.startsWith('http') || !GAS_URL) return;

    try {
        showToast("物件情報を自動取得中...");
        document.getElementById('url').classList.add('loading');

        const response = await fetch(`${GAS_URL}?action=scrape&url=${encodeURIComponent(url)}`);
        const result = await response.json();

        if (result.status === "success" && result.data) {
            const data = result.data;
            if (data.address) document.getElementById('address').value = data.address;
            if (data.price) document.getElementById('price').value = data.price;
            if (data.area) document.getElementById('area').value = data.area;
            if (data.type) document.getElementById('type').value = data.type;

            showToast("情報を抽出しました。場所を特定します...");

            // 住所から緯度経度を自動取得
            if (data.address) {
                const geocoder = new google.maps.Geocoder();
                geocoder.geocode({ address: data.address }, (results, status) => {
                    if (status === "OK") {
                        const loc = results[0].geometry.location;
                        document.getElementById('lat').value = loc.lat();
                        document.getElementById('lng').value = loc.lng();
                        map.setCenter(loc);
                        map.setZoom(17);
                        showToast("場所の特定に成功しました！");
                    }
                });
            }
        } else {
            showToast("自動取得に失敗しました。手動で入力してください。");
        }
    } catch (err) {
        console.error(err);
        showToast("通信エラーが発生しました。");
    } finally {
        document.getElementById('url').classList.remove('loading');
    }
});

initMap();
