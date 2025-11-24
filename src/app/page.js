"use client";

import { useState, useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
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
const rows = books.map(b => ({
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

// Wikidata から出版社・画像取得
async function fetchWikidata(isbn) {
try {
const res = await fetch(https://www.wikidata.org/w/api.php?action=wbgetentities&sites=isbn&titles=${isbn}&format=json&origin=*);
if (!res.ok) return null;
const j = await res.json();
const entities = j.entities;
if (!entities) return null;
const entityKey = Object.keys(entities)[0];
const entity = entities[entityKey];
let publisher = "";
let image = "";
if (entity && entity.claims) {
if (entity.claims.P123) publisher = entity.claims.P123[0].mainsnak.datavalue.value;
if (entity.claims.P18) image = "https://commons.wikimedia.org/wiki/Special:FilePath/
" + entity.claims.P18[0].mainsnak.datavalue.value;
}
return { publisher, image };
} catch {
return null;
}
}

// API を順に試す
async function fetchBookInfo(isbn) {
let info = await fetchOpenBD(isbn);
if (!info) info = { title: "", authors: [], publisher: "", pubdate: "", image: "" };
const wikidataInfo = await fetchWikidata(isbn);
if (wikidataInfo) {
if (!info.publisher) info.publisher = wikidataInfo.publisher || "";
if (!info.image) info.image = wikidataInfo.image || "";
}
return info;
}

// 音再生用
function playBeep() {
const audio = new Audio("/beep.mp3");
audio.play();
}
function playBuzz() {
const audio = new Audio("/buzz.mp3");
audio.play();
}

// UI 本体
export default function Home() {
const [isbn, setIsbn] = useState("");
const [books, setBooks] = useState([]);
const [scanning, setScanning] = useState(false);
const [search, setSearch] = useState("");
const videoRef = useRef(null);
const codeReader = useRef(null);
const isbnMap = useRef({});

useEffect(() => {
loadBooks();
codeReader.current = new BrowserMultiFormatReader();
return () => { stopScan(); };
}, []);

async function loadBooks() {
const data = await fetchBooksFromSupabase();
setBooks(data);
const map = {};
data.forEach(b => { map[b.isbn] = b; });
isbnMap.current = map;
}

async function startScan() {
if (scanning) return;
setScanning(true);
try {
const videoElement = videoRef.current;
if (!videoElement) return;
await codeReader.current.decodeFromConstraints(
{ video: { facingMode: "environment", width: 400, height: 300 } },
videoElement,
async result => {
if (result) {
const code = result.getText();
if (!code.startsWith("978")) return;
setIsbn(code);
await handleScan(code);
}
}
);
} catch (err) {
console.error(err);
}
}

async function stopScan() {
if (codeReader.current) {
try { await codeReader.current.reset(); } catch {}
setScanning(false);
}
}

async function handleScan(scannedIsbn) {
const info = await fetchBookInfo(scannedIsbn);
const duplicate = !!isbnMap.current[scannedIsbn];
const newBook = {
isbn: scannedIsbn,
title: info.title,
authors: info.authors,
publisher: info.publisher,
pubdate: info.pubdate,
image: info.image,
shelf: "",
duplicate,
created_at: new Date().toISOString()
};
const ok = await saveBooksToSupabase([newBook]);
if (ok) {
if (duplicate) playBuzz();
else playBeep();
loadBooks();
} else {
alert("保存に失敗しました");
}
}

const filteredBooks = books.filter(b =>
b.title.toLowerCase().includes(search.toLowerCase()) ||
b.authors.join(" ").toLowerCase().includes(search.toLowerCase()) ||
b.shelf.toLowerCase().includes(search.toLowerCase())
);

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

  <input
    type="text"
    placeholder="検索（タイトル・著者・棚）"
    value={search}
    onChange={e => setSearch(e.target.value)}
    style={{ width: "100%", padding: 10, marginTop: 10 }}
  />

  <h3 style={{ marginTop: 30 }}>保存済みの本</h3>
  {filteredBooks.map(b => (
    <div key={b.isbn} style={{ marginBottom: 20, color: b.duplicate ? "red" : "black" }}>
      <div>ISBN: {b.isbn}</div>
      <div>タイトル: {b.title}</div>
      <div>著者: {b.authors ? b.authors.join(", ") : ""}</div>
      <div>出版社: {b.publisher}</div>
      <div>棚: {b.shelf}</div>
      {b.image && <img src={b.image} alt={b.title} style={{ width: 100, marginTop: 5 }} />}
    </div>
  ))}
</div>


);
}