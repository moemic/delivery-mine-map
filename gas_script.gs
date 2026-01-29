/**
 * Mine Map Backend (地雷店舗マップ)
 * 
 * 機能:
 * 1. 店舗データの保存 (画像付き)
 * 2. Google Driveへの画像保存
 * 3. GoogleマップURLの解析
 * 
 * ■ 事前準備
 * 1. Google Driveに画像を保存するためのフォルダを新規作成してください。
 * 2. そのフォルダのURL末尾のID部分（folders/の後ろの文字列）をコピーし、
 *    以下の DRIVE_FOLDER_ID に貼り付けてください。
 * 3. スプレッドシートの1行目を以下のように書き換えてください:
 *    id, lat, lng, storeName, hazardType, waitTime, comment, photoUrl, originalMapUrl, created_at
 */

const DRIVE_FOLDER_ID = "1GC4IYQJndrp3SZmycrfID38TGzf3yNdD"; // ★ここを変更！

function doGet(e) {
  const action = e.parameter.action;
  
  // マップURL解析アクション
  if (action === "analyze") {
    const url = e.parameter.url;
    return analyzeMapUrl(url);
  }

  // テストデータ投入アクション
  if (action === "seed") {
    return createDummyData();
  }

  // 通常のデータ取得
  return getAllData();
}

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // 画像処理
    let photoUrl = "";
    if (params.photoBase64) {
      photoUrl = saveImageToDrive(params.photoBase64);
    }

    // データの保存
    sheet.appendRow([
      params.id || Date.now(),
      params.lat,
      params.lng,
      params.storeName,
      params.hazardType,
      params.waitTime,
      params.comment,
      photoUrl,
      params.originalMapUrl || "",
      new Date()
    ]);
    
    return createJsonResponse({ status: "success" });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

// ---------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------

// 全データ取得
function getAllData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  const json = rows.map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });
  
  return createJsonResponse(json);
}

// 画像をDriveに保存
function saveImageToDrive(base64Data) {
  try {
    if (!DRIVE_FOLDER_ID || DRIVE_FOLDER_ID.includes("ここ")) {
      return ""; // フォルダID未設定時はスキップ
    }
    
    // データURLスキームの除去 (data:image/jpeg;base64,...)
    const contentType = base64Data.split(';')[0].split(':')[1];
    const data = base64Data.split(',')[1];
    const blob = Utilities.newBlob(Utilities.base64Decode(data), contentType, "store_photo_" + Date.now());
    
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const file = folder.createFile(blob);
    
    // 公開設定（全員が閲覧可能にする）
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // 画像の直リンクURLを生成（thumbnailLink等は不安定なため、export=view形式などを検討するが、今回はDownloadUrlを使用）
    // ※<img>タグで表示するためには webContentLink などを利用する工夫が必要
    // ここではサムネイル表示用に thumbnailLink を返すか、webContentLink を加工して返す
    return `https://drive.google.com/uc?export=view&id=${file.getId()}`;
  } catch (e) {
    return "Error: " + e.toString();
  }
}

// GoogleマップURLの解析
function analyzeMapUrl(url) {
  if (!url) return createJsonResponse({ status: "error", message: "No URL" });

  try {
    // 短縮URLの場合はリダイレクト先を取得
    let targetUrl = url;
    const response = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
    
    if (response.getResponseCode() >= 300 && response.getResponseCode() < 400) {
      targetUrl = response.getHeaders()['Location'];
    }

    // 座標の抽出 (@lat,lng または !3d...!4d...)
    let lat = "", lng = "";
    
    // パターン1: @35.123,139.123
    const matchAt = targetUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (matchAt) {
      lat = matchAt[1];
      lng = matchAt[2];
    } else {
      // パターン2: !3d35.123!4d139.123
      const match3d = targetUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      if (match3d) {
        lat = match3d[1];
        lng = match3d[2];
      }
    }

    // 店名の抽出（簡易的：リダイレクト後のタイトル取得は困難な場合が多いが、HTMLから試みる）
    // ※今回は正確性を期すため、座標だけ返してフロントのReverse Geocodingに任せるのが無難だが
    // 一応HTMLタイトル取得を試みる
    let storeName = "";
    try {
      const htmlRes = UrlFetchApp.fetch(targetUrl);
      const titleMatch = htmlRes.getContentText().match(/<title>(.*?)<\/title>/);
      if (titleMatch) {
         storeName = titleMatch[1].replace(" - Google マップ", "").trim();
      }
    } catch (e) {
      // HTML取得エラーは無視
    }

    return createJsonResponse({ 
      status: "success", 
      data: { lat, lng, storeName, originalUrl: targetUrl } 
    });

  } catch (e) {
    return createJsonResponse({ status: "error", message: e.toString() });
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// テストデータ生成
function createDummyData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  // 既存データを確認し、空ならヘッダーとデータを追加
  if (sheet.getLastRow() <= 1) {
    // ヘッダーがなければ追加
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["id", "lat", "lng", "storeName", "hazardType", "waitTime", "comment", "photoUrl", "originalMapUrl", "created_at"]);
    }
    
    // データ追加
    sheet.appendRow([1, 35.6581, 139.7017, "渋谷の激混み店", "wait", 30, "いつも30分以上待たされます。1階の入り口が狭いので注意。", "", "https://maps.app.goo.gl/dummy1", new Date()]);
    sheet.appendRow([2, 35.6595, 139.7005, "迷宮のハンバーガー屋", "location", 5, "雑居ビルの3階で看板がありません。エレベーターの裏側にあります。", "", "https://maps.app.goo.gl/dummy2", new Date()]);
    sheet.appendRow([3, 35.6980, 139.7710, "秋葉原の不機嫌カフェ", "attitude", 10, "店員さんが常に怒ってます。商品の受け渡しが雑。", "", "https://maps.app.goo.gl/dummy3", new Date()]);
    
    return createJsonResponse({ status: "success", message: "Dummy data created." });
  }
  return createJsonResponse({ status: "error", message: "Data already exists." });
}
// End of GAS Script
