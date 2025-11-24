"use client";

import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { createClient } from "@supabase/supabase-js";

// Supabase設定（環境変数優先）。Netlifyでは `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定してください。
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://sumqfcjvndnpuoirpkrb.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_z_PWS1V9c_Pf8dBTyyHAtA_d0HDKnJ6";
const supabase = createClient(supabaseUrl, supabaseKey);

// Supabase: booksテーブルから取得
async function fetchBooksFromSupabase() {
const { data, error } = await supabase
.from("books")
.select("*")
.order("created_at", { ascending: false });
if (error) return [];
return data || [];
}

// Supabase: booksテーブルに保存（Upsert）
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

// OpenBD
async function fetchOpenBD(isbn) {
  try {
    const res = await fetch("https://api.openbd.jp/v1/get?isbn=" + isbn);
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

// OpenLibrary
async function fetchOpenLibrary(isbn) {
  try {
    const res = await fetch("https://openlibrary.org/isbn/" + isbn + ".json");
if (!res.ok) return null;
const j = await res.json();

let authors = [];
if (j.authors && j.authors.length > 0) {
  const ares = await fetch("https://openlibrary.org" + j.authors[0].key + ".json");
  if (ares.ok) {
    const aj = await ares.json();
    authors = [aj.name];
  }
}

let image = "";
if (j.covers && j.covers.length > 0) {
  image = "https://covers.openlibrary.org/b/id/" + j.covers[0] + "-L.jpg";
}

return {
  title: j.title || "",
  authors: authors,
  publisher: j.publishers ? j.publishers.join(",") : "",
  pubdate: j.publish_date || "",
  image: image
};


} catch {
return null;
}
}

// NDLサーチ
async function fetchNDL(isbn) {
  try {
    const res = await fetch("https://iss.ndl.go.jp/api/opensearch?isbn=" + isbn);
if (!res.ok) return null;

const txt = await res.text();
const xml = new DOMParser().parseFromString(txt, "text/xml");
const item = xml.querySelector("item");
if (!item) return null;

const title = item.querySelector("title")?.textContent || "";
const author = item.querySelector("dc\\:creator")?.textContent || "";
const publisher = item.querySelector("dc\\:publisher")?.textContent || "";
const date = item.querySelector("dc\\:date")?.textContent || "";

return {
  title: title,
  authors: author ? [author] : [],
  publisher: publisher,
  pubdate: date,
  image: ""
};


} catch {
return null;
}
}

// Wikidata
async function fetchWikidata(isbn) {
  try {
    const endpoint = "https://query.wikidata.org/sparql";
    const query = `SELECT ?item ?itemLabel ?authorLabel ?pubdate ?publisherLabel ?image WHERE {
      ?item wdt:P212|wdt:P957 "${isbn}".
      OPTIONAL { ?item rdfs:label ?itemLabel. FILTER (lang(?itemLabel)='ja') }
      OPTIONAL { ?item wdt:P50 ?author. ?author rdfs:label ?authorLabel. FILTER (lang(?authorLabel)='ja') }
      OPTIONAL { ?item wdt:P577 ?pubdate. }
      OPTIONAL { ?item wdt:P123 ?publisher. ?publisher rdfs:label ?publisherLabel. FILTER (lang(?publisherLabel)='ja') }
      OPTIONAL { ?item wdt:P18 ?image. }
    } LIMIT 1`;

    const url = endpoint + "?query=" + encodeURIComponent(query) + "&format=json";

const res = await fetch(url);
if (!res.ok) return null;

const data = await res.json();
const b = data.results.bindings[0];
if (!b) return null;

return {
  title: b.itemLabel ? b.itemLabel.value : "",
  authors: b.authorLabel ? [b.authorLabel.value] : [],
  publisher: b.publisherLabel ? b.publisherLabel.value : "",
  pubdate: b.pubdate ? b.pubdate.value : "",
  image: b.image ? b.image.value : ""
};


} catch {
return null;
}
}

// API を順に試す（最初に成功したものを採用）
async function fetchBookInfo(isbn) {
const f1 = await fetchOpenBD(isbn);
if (f1) return f1;

const f2 = await fetchOpenLibrary(isbn);
if (f2) return f2;

const f3 = await fetchNDL(isbn);
if (f3) return f3;

const f4 = await fetchWikidata(isbn);
if (f4) return f4;

return null;
}

// UI本体
export default function Home() {
const [isbn, setIsbn] = useState("");
const [books, setBooks] = useState([]);
const [scanning, setScanning] = useState(false);
const html5QrCode = useRef(null);

// 初回ロード時に Supabase から books を取得
useEffect(() => {
loadBooks();
}, []);

async function loadBooks() {
const data = await fetchBooksFromSupabase();
setBooks(data);
}

// スキャン開始
async function startScan() {
if (scanning) return;

setScanning(true);

html5QrCode.current = new Html5Qrcode("reader");

await html5QrCode.current.start(
  { facingMode: "environment" },
  { fps: 10, qrbox: 250 },
  (decoded) => {
    if (decoded) {
      setIsbn(decoded);
      stopScan();
    }
  }
);


}

// スキャン停止
async function stopScan() {
if (html5QrCode.current) {
await html5QrCode.current.stop();
await html5QrCode.current.clear();
html5QrCode.current = null;
setScanning(false);
}
}

// 検索 → 保存
async function searchAndSave() {
const info = await fetchBookInfo(isbn);
if (!info) {
alert("書誌データが見つかりませんでした");
return;
}

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
if (ok) {
  alert("保存しました");
  loadBooks();
} else {
  alert("保存に失敗しました");
}


}

return (
<div style={{ padding: 20 }}>
<h2>蔵書管理アプリ（完全版）</h2>

  <div
    id="reader"
    style={{ width: "100%", height: scanning ? 300 : 0, overflow: "hidden" }}
  ></div>

  {!scanning && (
    <button onClick={startScan} style={{ padding: 10, marginTop: 10 }}>
      カメラでISBNを読み取る
    </button>
  )}

  {scanning && (
    <button onClick={stopScan} style={{ padding: 10, marginTop: 10 }}>
      カメラ停止
    </button>
  )}

  <input
    type="text"
    placeholder="ISBN 手入力"
    value={isbn}
    onChange={(e) => setIsbn(e.target.value)}
    style={{ width: "100%", padding: 10, marginTop: 20 }}
  />

  <button
    onClick={searchAndSave}
    style={{ width: "100%", padding: 10, marginTop: 10 }}
  >
    書誌取得して保存
  </button>

  <h3 style={{ marginTop: 30 }}>保存済みの本</h3>
  {books.map((b) => (
    <div key={b.isbn} style={{ marginBottom: 20 }}>
      <div>ISBN: {b.isbn}</div>
      <div>タイトル: {b.title}</div>
      <div>著者: {b.authors ? b.authors.join(", ") : ""}</div>
    </div>
  ))}
</div>

);
}