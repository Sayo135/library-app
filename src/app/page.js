"use client";

import { useState, useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { createClient } from "@supabase/supabase-js";

// Supabase 設定
const supabaseUrl = "https://sumqfcjvndnpuoirpkrb.supabase.co";
const supabaseKey = "sb_publishable_z_PWS1V9c_Pf8dBTyyHAtA_d0HDKnJ6";
const supabase = createClient(supabaseUrl, supabaseKey);

// Supabase操作関数
async function fetchBooks() {
  const { data, error } = await supabase.from("books").select("*").order("created_at", { ascending: false });
  if (error) return [];
  return data || [];
}

async function upsertBook(book) {
  const { error } = await supabase.from("books").upsert([book], { onConflict: ["isbn"] });
  return !error;
}

async function deleteBook(isbn) {
  const { error } = await supabase.from("books").delete().eq("isbn", isbn);
  return !error;
}

// OpenBD取得
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

// Wikidata取得
async function fetchWikidata(isbn) {
  try {
    const query = `
      SELECT ?item ?itemLabel ?publisher ?publisherLabel ?image WHERE {
        ?item wdt:P212 "${isbn}" .
        OPTIONAL { ?item wdt:P123 ?publisher. }
        OPTIONAL { ?item wdt:P18 ?image. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],ja". }
      } LIMIT 1
    `;
    const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.results.bindings[0];
    if (!result) return null;
    return {
      publisher: result.publisherLabel?.value || "",
      image: result.image?.value || ""
    };
  } catch {
    return null;
  }
}

// API統合
async function fetchBookInfo(isbn) {
  let info = await fetchOpenBD(isbn);
  const wd = await fetchWikidata(isbn);
  if (!info) info = { title: "", authors: [], publisher: "", pubdate: "", image: "" };
  if (wd) {
    if (wd.publisher) info.publisher = wd.publisher;
    if (wd.image) info.image = wd.image;
  }
  return info;
}

// UI
export default function Home() {
  const [isbn, setIsbn] = useState("");
  const [books, setBooks] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [searchShelf, setSearchShelf] = useState("");
  const videoRef = useRef(null);
  const codeReader = useRef(null);
  const beepRef = useRef(null);

  useEffect(() => {
    loadBooks();
    codeReader.current = new BrowserMultiFormatReader();
    return () => stopScan();
  }, []);

  async function loadBooks() {
    const data = await fetchBooks();
    setBooks(data);
  }

  async function startScan() {
    if (scanning) return;
    setScanning(true);
    try {
      const videoElement = videoRef.current;
      if (!videoElement) return;
      const constraints = {
        video: { facingMode: /iPhone|Android/.test(navigator.userAgent) ? "environment" : undefined }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = stream;
      videoElement.play();

      codeReader.current.decodeFromVideoDevice(undefined, videoElement, (result, err) => {
        if (result) {
          const text = result.getText();
          if (text.startsWith("978") && text.length === 13) {
            setIsbn(text);
            stopScan();
            searchAndSave(text);
          }
        }
      });
    } catch (err) {
      console.error(err);
      alert("カメラの起動に失敗しました: " + err.message);
      setScanning(false);
    }
  }

  async function stopScan() {
    if (codeReader.current) {
      try { await codeReader.current.reset(); } catch {}
      const videoElement = videoRef.current;
      if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
      }
      setScanning(false);
    }
  }

  async function searchAndSave(inputIsbn) {
    let info = await fetchBookInfo(inputIsbn);
    const exists = books.find(b => b.isbn === inputIsbn);
    const newBook = {
      isbn: inputIsbn,
      title: info.title,
      authors: info.authors,
      publisher: info.publisher,
      pubdate: info.pubdate,
      image: info.image,
      shelf: exists?.shelf || "",
      duplicate: exists ? true : false,
      created_at: new Date().toISOString()
    };
    const ok = await upsertBook(newBook);
    if (ok) loadBooks();
    if (exists && beepRef.current) beepRef.current.play();
  }

  async function handleDelete(isbn) {
    if (confirm("本当に削除しますか？")) {
      const ok = await deleteBook(isbn);
      if (ok) loadBooks();
      else alert("削除に失敗しました");
    }
  }

  async function handleEdit(b, key, value) {
    const updated = { ...b, [key]: value };
    await upsertBook(updated);
    loadBooks();
  }

  const filteredBooks = books.filter(b => !searchShelf || (b.shelf && b.shelf.includes(searchShelf)));

  return (
    <div style={{ padding: 20 }}>
      <audio ref={beepRef} src="/beep.mp3" />
      <h2>蔵書管理アプリ</h2>

      <div style={{ width: "100%", maxHeight: "40vh", overflow: "hidden", marginBottom: 10 }}>
        <video ref={videoRef} style={{ width: "100%" }} />
      </div>
      {!scanning && <button onClick={startScan}>カメラでISBNを読み取る</button>}
      {scanning && <button onClick={stopScan}>カメラ停止</button>}

      <input placeholder="ISBN手入力" value={isbn} onChange={e => setIsbn(e.target.value)} />
      <input placeholder="本棚検索" value={searchShelf} onChange={e => setSearchShelf(e.target.value)} />
      <button onClick={() => searchAndSave(isbn)}>書誌取得して保存</button>

      <h3>保存済みの本</h3>
      {filteredBooks.map(b => (
        <div key={b.isbn} style={{ marginBottom: 20, border: "1px solid #ccc", padding: 10, color: b.duplicate ? "red" : "black" }}>
          {b.image && <img src={b.image} alt={b.title} style={{ maxWidth: 100, display: "block" }} />}
          <div>
            <input value={b.title} onChange={e => handleEdit(b, "title", e.target.value)} placeholder="タイトル" />
          </div>
          <div>
            <input value={b.authors.join(", ")} onChange={e => handleEdit(b, "authors", e.target.value.split(","))} placeholder="著者" />
          </div>
          <div>
            <input value={b.publisher} onChange={e => handleEdit(b, "publisher", e.target.value)} placeholder="出版社" />
          </div>
          <div>
            <input value={b.pubdate} onChange={e => handleEdit(b, "pubdate", e.target.value)} placeholder="出版日" />
          </div>
          <div>
            <input value={b.shelf} onChange={e => handleEdit(b, "shelf", e.target.value)} placeholder="本棚" />
          </div>
          <button onClick={() => handleDelete(b.isbn)}>削除</button>
        </div>
      ))}
    </div>
  );
}
