"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

// Supabase連携
import { createClient } from "@supabase/supabase-js";
const supabaseUrl = "[https://sumqfcjvndnpuoirpkrb.supabase.co](https://sumqfcjvndnpuoirpkrb.supabase.co)";
const supabaseKey = "sb_publishable_z_PWS1V9c_Pf8dBTyyHAtA_d0HDKnJ6";
const supabase = createClient(supabaseUrl, supabaseKey);

// dynamic import（SSR回避）
const Html5Qrcode = dynamic(
() => import("html5-qrcode").then((mod) => mod.Html5Qrcode),
{ ssr: false }
);

// --- Supabase関連関数 ---
async function fetchBooksFromSupabase() {
const { data, error } = await supabase
.from("books")
.select("*")
.order("created_at", { ascending: false });
if (error) return [];
return data || [];
}

async function saveBooksToSupabase(books) {
const rows = books.map((b) => ({
isbn: b.isbn,
title: b.title,
authors: b.authors,
publisher: b.publisher,
pubdate: b.pubdate,
image: b.image,
shelf: b.shelf,
duplicate: b.duplicate || false,
created_at: b.created_at || new Date().toISOString(),
}));
const { error } = await supabase.from("books").upsert(rows, { onConflict: ["isbn"] });
return !error;
}

// --- ここに fetchBookInfo / fetchOpenBD / fetchOpenLibrary / fetchNDL / fetchWikidata のコードをそのまま貼る ---

export default function BookScannerPage() {
const [scanning, setScanning] = useState(false);
const [isbnInput, setIsbnInput] = useState("");
const [books, setBooks] = useState([]);
const [msg, setMsg] = useState("準備中…");
const [searchText, setSearchText] = useState("");

const html5QrcodeRef = useRef(null);
const videoStartedRef = useRef(false);
const lastScannedRef = useRef({});
const scannedISBNsRef = useRef(new Set());

// Supabase初期データ取得＆Html5Qrcode初期化
useEffect(() => {
(async () => {
const data = await fetchBooksFromSupabase();
setBooks(data);
setMsg("スキャンできます");

```
  if (typeof window !== "undefined" && Html5Qrcode) {
    html5QrcodeRef.current = new Html5Qrcode("reader");
  }
})();
```

}, []);

// Supabase保存
useEffect(() => {
if (books.length > 0) saveBooksToSupabase(books);
}, [books]);

const playBeep = () => new Audio("/beep.mp3").play().catch(() => {});
const playBuzzer = () => new Audio("/buzzer.mp3").play().catch(() => {});

const handleISBN = async (isbn) => {
const now = Date.now();
const last = lastScannedRef.current[isbn] || 0;
if (now - last < 1500) return;
lastScannedRef.current[isbn] = now;

```
setMsg("処理中... " + isbn);

const info = await fetchBookInfo(isbn);
const duplicate = scannedISBNsRef.current.has(isbn);

if (!duplicate) playBeep();
else playBuzzer();

scannedISBNsRef.current.add(isbn);

setBooks((prev) => [{ isbn, ...info, shelf: "", duplicate }, ...prev]);
setMsg(duplicate ? "重複登録: " + isbn : "登録完了: " + isbn);
```

};

const startScan = async () => {
if (scanning || !html5QrcodeRef.current) return;
setScanning(true);

```
await html5QrcodeRef.current.start(
  { facingMode: "environment" },
  { fps: 10, qrbox: 250 },
  (decoded) => {
    if (/^97[89]\d{10}$/.test(decoded)) handleISBN(decoded);
  }
);

videoStartedRef.current = true;
```

};

const stopScan = async () => {
setScanning(false);
if (html5QrcodeRef.current && videoStartedRef.current) {
await html5QrcodeRef.current.stop();
videoStartedRef.current = false;
}
};

const filteredBooks = () => {
const t = searchText.trim();
if (!t) return books;
return books.filter((b) =>
(b.title + b.publisher + b.isbn + b.authors.join(",") + (b.shelf || "")).includes(t)
);
};

return (
<div style={{ padding: 20 }}> <h1>蔵書スキャナー（OpenBD / OpenLibrary / NDL）</h1> <p>{msg}</p>

```
  <div style={{ display: "flex", gap: 12 }}>
    <button onClick={startScan} disabled={scanning}>スキャン開始</button>
    <button onClick={stopScan} disabled={!scanning}>停止</button>
  </div>

  <div id="reader" style={{ width: 300, marginTop: 10 }}></div>

  <h2>ISBN 手入力（13桁）</h2>
  <input
    value={isbnInput}
    onChange={(e) => setIsbnInput(e.target.value)}
    style={{ width: 200 }}
  />
  <button
    onClick={() => {
      if (/^97[89]\d{10}$/.test(isbnInput)) handleISBN(isbnInput);
    }}
  >
    手動登録
  </button>

  <h2>検索（書名・著者・出版社・ISBN・棚）</h2>
  <input
    value={searchText}
    onChange={(e) => setSearchText(e.target.value)}
    style={{ width: "50%" }}
  />

  <h2>登録一覧（{filteredBooks().length}件）</h2>
  {filteredBooks().map((b, i) => (
    <div
      key={i}
      style={{
        border: "1px solid #ccc",
        padding: 10,
        marginBottom: 10,
        background: b.duplicate ? "#fee" : "#fff",
        color: b.duplicate ? "red" : "black",
      }}
    >
      <div><strong>書名:</strong> {b.title}</div>
      <div>著者: {b.authors.join(", ")}</div>
      <div>出版社: {b.publisher}</div>
      <div>発行日: {b.pubdate}</div>
      <div>ISBN: {b.isbn}</div>
      <div>本棚: {b.shelf}</div>
      {b.image ? (
        <img src={b.image} alt="cover" style={{ width: 120, marginTop: 6 }} />
      ) : (
        <span style={{ color: "#888", fontStyle: "italic" }}>書影なし</span>
      )}
    </div>
  ))}
</div>
```

);
}
