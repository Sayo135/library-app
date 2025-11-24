"use client";

import { useState, useEffect, useRef } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/browser";
import { createClient } from "@supabase/supabase-js";

// Supabase 設定
const supabaseUrl = "https://sumqfcjvndnpuoirpkrb.supabase.co
";
const supabaseKey = "sb_publishable_z_PWS1V9c_Pf8dBTyyHAtA_d0HDKnJ6";
const supabase = createClient(supabaseUrl, supabaseKey);

// Supabase: books テーブル取得
async function fetchBooksFromSupabase() {
const { data, error } = await supabase.from("books").select("*").order("created_at", { ascending: false });
if (error) return [];
return data || [];
}

// Supabase: books テーブル保存（Upsert）
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
created_at: b.created_at || new Date().toISOString()
}));
const { error } = await supabase.from("books").upsert(rows, { onConflict: ["isbn"] });
return !error;
}

// OpenBD から書誌情報取得
async function fetchOpenBD(isbn) {
try {
const res = await fetch("https://api.openbd.jp/v1/get?isbn=
" + isbn);
if (!res.ok) return null;
const j = await res.json();
if (!j || !j[0] || !j[0].summary) return null;
const s = j[0].summary;
return {
title: s.title || "",
authors: s.author ? s.author.split(",") : [],
publisher: s.publisher || "",
pubdate: s.pubdate || "",
image: s.cover || ""
};
} catch {
return null;
}
}

// APIを順に試す（ここでは OpenBD のみ）
async function fetchBookInfo(isbn) {
const f1 = await fetchOpenBD(isbn);
if (f1) return f1;
return null;
}

// UI 本体
export default function Home() {
const [isbn, setIsbn] = useState("");
const [books, setBooks] = useState([]);
const [scanning, setScanning] = useState(false);
const videoRef = useRef(null);
const codeReader = useRef(null);

useEffect(() => {
loadBooks();
codeReader.current = new BrowserMultiFormatReader();
return () => { stopScan(); };
}, []);

async function loadBooks() {
const data = await fetchBooksFromSupabase();
setBooks(data);
}

async function startScan() {
if (scanning) return;
setScanning(true);
try {
const videoElement = videoRef.current;
if (!videoElement) return;
await codeReader.current.decodeFromConstraints(
{ video: { facingMode: "environment" } },
videoElement,
result => {
if (result) {
setIsbn(result.getText());
stopScan();
}
}
);
} catch (err) {
if (!(err instanceof NotFoundException)) console.error(err);
}
}

async function stopScan() {
if (codeReader.current) {
try { await codeReader.current.reset(); } catch {}
setScanning(false);
}
}

async function searchAndSave() {
if (!isbn) return;
const info = await fetchBookInfo(isbn);
if (!info) { alert("書誌データが見つかりませんでした"); return; }
const newBook = {
isbn: isbn,
title: info.title,
authors: info.authors,
publisher: info.publisher,
pubdate: info.pubdate,
image: info.image,
shelf: "",
created_at: new Date().toISOString()
};
const ok = await saveBooksToSupabase([newBook]);
if (ok) { alert("保存しました"); loadBooks(); }
else { alert("保存に失敗しました"); }
}

return (
<div style={{ padding: 20 }}>
<h2>蔵書管理アプリ（完全版）</h2>
<div style={{ width: "100%", maxHeight: "50vh", overflow: "hidden", marginBottom: 10 }}>
<video ref={videoRef} style={{ width: "100%" }} />
</div>

  {!scanning && <button onClick={startScan} style={{ padding: 10, marginTop: 10 }}>カメラでISBNを読み取る</button>}
  {scanning && <button onClick={stopScan} style={{ padding: 10, marginTop: 10 }}>カメラ停止</button>}

  <input
    type="text"
    placeholder="ISBN 手入力"
    value={isbn}
    onChange={e => setIsbn(e.target.value)}
    style={{ width: "100%", padding: 10, marginTop: 20 }}
  />

  <button onClick={searchAndSave} style={{ width: "100%", padding: 10, marginTop: 10 }}>書誌取得して保存</button>

  <h3 style={{ marginTop: 30 }}>保存済みの本</h3>
  {books.map(b => (
    <div key={b.isbn} style={{ marginBottom: 20 }}>
      <div>ISBN: {b.isbn}</div>
      <div>タイトル: {b.title}</div>
      <div>著者: {b.authors ? b.authors.join(", ") : ""}</div>
    </div>
  ))}
</div>


);
}