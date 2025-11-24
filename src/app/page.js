"use client";

import { useState, useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { createClient } from "@supabase/supabase-js";

// Supabase 設定
const supabaseUrl = "https://sumqfcjvndnpuoirpkrb.supabase.co";
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

// Google Books API から書誌情報取得
async function fetchGoogleBooks(isbn) {
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    if (!res.ok) return null;
    const j = await res.json();
    if (!j.items || j.items.length === 0) return null;
    const v = j.items[0].volumeInfo;
    return {
      title: v.title || "",
      authors: v.authors || [],
      publisher: v.publisher || "",
      pubdate: v.publishedDate || "",
      image: v.imageLinks ? v.imageLinks.thumbnail : ""
    };
  } catch {
    return null;
  }
}

// Wikidata から書誌情報取得（出版社・画像も取得）
async function fetchWikidata(isbn) {
  try {
    const query = `
      SELECT ?item ?itemLabel ?authorLabel ?pubDate ?publisherLabel ?cover WHERE {
        ?item wdt:P212 "${isbn}".
        OPTIONAL { ?item wdt:P50 ?author. ?author rdfs:label ?authorLabel FILTER(LANG(?authorLabel)="ja") }
        OPTIONAL { ?item wdt:P577 ?pubDate. }
        OPTIONAL { ?item wdt:P123 ?publisher. ?publisher rdfs:label ?publisherLabel FILTER(LANG(?publisherLabel)="ja") }
        OPTIONAL { ?item wdt:P18 ?cover. }
      }
      LIMIT 1
    `;
    const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query);
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    if (!j.results || !j.results.bindings || j.results.bindings.length === 0) return null;
    const b = j.results.bindings[0];
    return {
      title: b.itemLabel ? b.itemLabel.value : "",
      authors: b.authorLabel ? [b.authorLabel.value] : [],
      publisher: b.publisherLabel ? b.publisherLabel.value : "",
      pubdate: b.pubDate ? b.pubDate.value.split("T")[0] : "",
      image: b.cover ? b.cover.value : ""
    };
  } catch {
    return null;
  }
}

// APIを順に試す（OpenBD → Google Books → Wikidata）
async function fetchBookInfo(isbn) {
  const openbd = await fetchOpenBD(isbn);
  if (openbd) return openbd;
  const google = await fetchGoogleBooks(isbn);
  if (google) return google;
  const wikidata = await fetchWikidata(isbn);
  if (wikidata) return wikidata;
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
        async result => {
          if (result) {
            const code = result.getText();
            // 13桁で978から始まるISBNのみ
            if (/^978\d{10}$/.test(code)) {
              setIsbn(code);
              await autoFetchAndSave(code); // 自動書誌取得
            }
            stopScan();
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

  async function autoFetchAndSave(isbn) {
    const info = await fetchBookInfo(isbn);
    if (!info) { alert("書誌データが見つかりませんでした"); return; }
    const newBook = {
      isbn,
      title: info.title,
      authors: info.authors,
      publisher: info.publisher,
      pubdate: info.pubdate,
      image: info.image,
      shelf: "",
      created_at: new Date().toISOString()
    };
    const ok = await saveBooksToSupabase([newBook]);
    if (ok) { loadBooks(); } 
    else { alert("保存に失敗しました"); }
  }

  async function manualFetchAndSave() {
    if (!isbn) return;
    await autoFetchAndSave(isbn);
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>蔵書管理アプリ（OpenBD・Google・Wikidata対応）</h2>
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

      <button onClick={manualFetchAndSave} style={{ width: "100%", padding: 10, marginTop: 10 }}>書誌取得して保存</button>

      <h3 style={{ marginTop: 30 }}>保存済みの本</h3>
      {books.map(b => (
        <div key={b.isbn} style={{ marginBottom: 20 }}>
          <div>ISBN: {b.isbn}</div>
          <div>タイトル: {b.title}</div>
          <div>著者: {b.authors ? b.authors.join(", ") : ""}</div>
          <div>出版社: {b.publisher}</div>
          {b.image && <img src={b.image} alt={b.title} style={{ maxWidth: 100, marginTop: 5 }} />}
        </div>
      ))}
    </div>
  );
}
