"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

// Supabase連携
import { createClient } from "@supabase/supabase-js";
const supabaseUrl = "https://sumqfcjvndnpuoirpkrb.supabase.co
";
const supabaseKey = "sb_publishable_z_PWS1V9c_Pf8dBTyyHAtA_d0HDKnJ6";
const supabase = createClient(supabaseUrl, supabaseKey);

// dynamic import（SSR回避）
let Html5Qrcode;
if (typeof window !== "undefined") {
Html5Qrcode = dynamic(() => import("html5-qrcode").then(mod => mod.Html5Qrcode), { ssr: false });
}

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

// --- API呼び出し関数 ---
async function fetchBookInfo(isbn) {
try {
const res = await fetch(https://api.openbd.jp/v1/get?isbn=${isbn});
const data = await res.json();
if (!data || !data[0] || !data[0].summary) return {};
const s = data[0].summary;
return {
title: s.title,
authors: s.author,
publisher: s.publisher,
pubdate: s.pubdate,
image: s.cover,
};
} catch {
return {};
}
}

export default function BookScannerPage() {
const [scanning, setScanning] = useState(false);
const [books, setBooks] = useState([]);
const [msg, setMsg] = useState("準備中…");

const html5QrcodeRef = useRef(null);
const lastScannedRef = useRef({});
const scannedISBNsRef = useRef(new Set());
const videoStartedRef = useRef(false);

useEffect(() => {
(async () => {
const data = await fetchBooksFromSupabase();
setBooks(data);
setMsg("スキャンできます");

  if (Html5Qrcode) {
    html5QrcodeRef.current = new Html5Qrcode("reader");
  }
})();


}, []);

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

setMsg("処理中... " + isbn);

const info = await fetchBookInfo(isbn);
const duplicate = scannedISBNsRef.current.has(isbn);

if (!duplicate) playBeep();
else playBuzzer();

scannedISBNsRef.current.add(isbn);

setBooks((prev) => [{ isbn, ...info, shelf: "", duplicate }, ...prev]);
setMsg(duplicate ? "重複登録: " + isbn : "登録完了: " + isbn);


};

const startScan = async () => {
if (scanning || !html5QrcodeRef.current) return;
setScanning(true);

await html5QrcodeRef.current.start(
  { facingMode: "environment" },
  { fps: 10, qrbox: 250 },
  (decoded) => {
    if (/^97[89]\d{10}$/.test(decoded)) handleISBN(decoded);
  }
);

videoStartedRef.current = true;


};

const stopScan = async () => {
setScanning(false);
if (html5QrcodeRef.current && videoStartedRef.current) {
await html5QrcodeRef.current.stop();
videoStartedRef.current = false;
}
};

return (
<div>
<h1>本スキャナー</h1>
<p>{msg}</p>

  <div id="reader" style={{ width: "400px", height: "300px" }}></div>

  <button onClick={startScan} disabled={scanning}>
    スキャン開始
  </button>
  <button onClick={stopScan} disabled={!scanning}>
    スキャン停止
  </button>

  <h2>登録済みの本</h2>
  <div>
    {books.map((b) => (
      <div key={b.isbn} style={{ border: "1px solid #ccc", margin: "4px", padding: "4px" }}>
        <img src={b.image} alt={b.title} style={{ width: "80px" }} />
        <div>ISBN: {b.isbn}</div>
        <div>タイトル: {b.title}</div>
        <div>著者: {b.authors}</div>
        <div>出版社: {b.publisher}</div>
        <div>出版日: {b.pubdate}</div>
        {b.duplicate && <div style={{ color: "red" }}>重複登録</div>}
      </div>
    ))}
  </div>
</div>


);
}