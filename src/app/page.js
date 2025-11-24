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
async function saveBooksToSupabase(book) {
  const { error } = await supabase.from("books").insert([book]);
  return !error;
}

// Supabase: books 更新
async function updateBookInSupabase(book) {
  const { error } = await supabase.from("books").update(book).eq("isbn", book.isbn).eq("created_at", book.created_at);
  return !error;
}

// Supabase: 本削除
async function deleteBookFromSupabase(id) {
  const { error } = await supabase.from("books").delete().eq("id", id);
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

// Wikidata から出版社・画像取得
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

// APIを順に試す
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

// UI 本体
export default function Home() {
  const [books, setBooks] = useState([]);
  const [searchShelf, setSearchShelf] = useState("");
  const videoRef = useRef(null);
  const codeReader = useRef(null);
  const beepRef = useRef(null);
  const buzzerRef = useRef(null);

  useEffect(() => {
    loadBooks();
    codeReader.current = new BrowserMultiFormatReader();
    startScan();
    return () => { stopScan(); };
  }, []);

  async function loadBooks() {
    const data = await fetchBooksFromSupabase();
    setBooks(data);
  }

  async function startScan() {
    try {
      const videoElement = videoRef.current;
      if (!videoElement) return;
      await codeReader.current.decodeFromVideoDevice(null, videoElement, async (result, err) => {
        if (result) {
          const isbn = result.getText();
          if (isbn.startsWith("978") && isbn.length === 13) {
            await handleScan(isbn);
          }
        }
      });
    } catch (err) {
      console.error("カメラ起動失敗:", err);
      alert("カメラの起動に失敗しました");
    }
  }

  async function stopScan() {
    if (codeReader.current) {
      try { await codeReader.current.reset(); } catch {}
    }
  }

  async function handleScan(isbn) {
    const info = await fetchBookInfo(isbn);
    const newBook = {
      isbn,
      title: info.title || "(書名なし)",
      authors: info.authors.length ? info.authors : ["(著者なし)"],
      publisher: info.publisher || "(出版社なし)",
      pubdate: info.pubdate || "(出版日なし)",
      image: info.image || "",
      shelf: "",
      duplicate: books.some(b => b.isbn === isbn),
      created_at: new Date().toISOString()
    };
    const ok = await saveBooksToSupabase(newBook);
    if (ok) {
      setBooks(prev => [newBook, ...prev]);
      if (newBook.duplicate) {
        buzzerRef.current.load();
        buzzerRef.current.play();
      } else {
        beepRef.current.load();
        beepRef.current.play();
      }
    }
  }

  async function deleteBook(id) {
    const ok = await deleteBookFromSupabase(id);
    if (ok) loadBooks();
  }

  async function updateBook(book) {
    const ok = await updateBookInSupabase(book);
    if (ok) loadBooks();
  }

  const shelves = [...new Set(books.map(b => b.shelf || "未設定"))];

  return (
    <div style={{ padding: 20 }}>
      <audio ref={beepRef} src="/beep.mp3" preload="auto" />
      <audio ref={buzzerRef} src="/buzzer.mp3" preload="auto" />
      <h2>蔵書管理アプリ</h2>

      <div style={{ width: "100%", maxHeight: "40vh", overflow: "hidden", marginBottom: 10 }}>
        <video ref={videoRef} style={{ width: "100%" }} />
      </div>

      <input
        type="text"
        placeholder="本棚検索"
        value={searchShelf}
        onChange={e => setSearchShelf(e.target.value)}
        style={{ width: "100%", padding: 10, marginTop: 10 }}
      />

      {shelves.filter(s => !searchShelf || s.includes(searchShelf)).map(shelf => (
        <div key={shelf} style={{ marginTop: 20 }}>
          <h3>{shelf}</h3>
          {books.filter(b => (b.shelf || "未設定") === shelf).map(b => (
            <div key={b.created_at} style={{ marginBottom: 15, color: b.duplicate ? "red" : "black", border: "1px solid #ccc", padding: 10 }}>
              {b.image ? <img src={b.image} alt={b.title} style={{ maxWidth: 100, display: "block", marginBottom: 5 }} /> : <div>(書影なし)</div>}
              <div>ISBN: {b.isbn}</div>
              <div>
                タイトル: <input value={b.title} onChange={e => b.title = e.target.value} onBlur={() => updateBook(b)} />
              </div>
              <div>
                著者: <input value={b.authors.join(", ")} onChange={e => { b.authors = e.target.value.split(","); }} onBlur={() => updateBook(b)} />
              </div>
              <div>
                出版社: <input value={b.publisher} onChange={e => b.publisher = e.target.value} onBlur={() => updateBook(b)} />
              </div>
              <div>
                出版日: <input value={b.pubdate} onChange={e => b.pubdate = e.target.value} onBlur={() => updateBook(b)} />
              </div>
              <div>
                本棚: <input value={b.shelf} onChange={e => b.shelf = e.target.value} onBlur={() => updateBook(b)} />
              </div>
              <button onClick={() => deleteBook(b.id)} style={{ marginTop: 5 }}>削除</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
