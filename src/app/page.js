"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { createClient } from "@supabase/supabase-js";

// Supabase設定
const supabaseUrl = "https://sumqfcjvndnpuoirpkrb.supabase.co";
const supabaseKey = "sb_publishable_z_PWS1V9c_Pf8dBTyyHAtA_d0HDKnJ6";
const supabase = createClient(supabaseUrl, supabaseKey);

// Supabaseから取得
async function fetchBooksFromSupabase() {
  const { data } = await supabase
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });
  return data || [];
}

// Supabaseに保存
async function saveBooksToSupabase(books) {
  const rows = books.map((b) => ({
    isbn: b.isbn,
    title: b.title,
    authors: b.authors,
    publisher: b.publisher,
    pubdate: b.pubdate,
    image: b.image,
    shelf: b.shelf,
    created_at: b.created_at || new Date().toISOString(),
  }));

  const { error } = await supabase.from("books").upsert(rows, {
    onConflict: ["isbn"],
  });
  return !error;
}

// OpenBD
async function fetchOpenBD(isbn) {
  try {
    const r = await fetch("https://api.openbd.jp/v1/get?isbn=" + isbn);
    const j = await r.json();
    if (!j || !j[0] || !j[0].summary) return null;

    const s = j[0].summary;
    return {
      title: s.title,
      authors: s.author ? s.author.split(",") : [],
      publisher: s.publisher,
      pubdate: s.pubdate,
      image: s.cover,
    };
  } catch {
    return null;
  }
}

// OpenLibrary
async function fetchOpenLibrary(isbn) {
  try {
    const r = await fetch("https://openlibrary.org/isbn/" + isbn + ".json");
    if (!r.ok) return null;
    const j = await r.json();

    let authors = [];
    if (j.authors && j.authors.length > 0) {
      const a = await fetch("https://openlibrary.org" + j.authors[0].key + ".json");
      const aj = await a.json();
      authors = [aj.name];
    }

    let image = "";
    if (j.covers && j.covers.length > 0) {
      image = "https://covers.openlibrary.org/b/id/" + j.covers[0] + "-L.jpg";
    }

    return {
      title: j.title || "",
      authors,
      publisher: j.publishers ? j.publishers.join(",") : "",
      pubdate: j.publish_date || "",
      image,
    };
  } catch {
    return null;
  }
}

// NDL
async function fetchNDL(isbn) {
  try {
    const r = await fetch("https://iss.ndl.go.jp/api/opensearch?isbn=" + isbn);
    const txt = await r.text();
    const xml = new DOMParser().parseFromString(txt, "text/xml");
    const item = xml.querySelector("item");
    if (!item) return null;

    return {
      title: item.querySelector("title")?.textContent || "",
      authors: [item.querySelector("dc\\:creator")?.textContent || ""],
      publisher: item.querySelector("dc\\:publisher")?.textContent || "",
      pubdate: item.querySelector("dc\\:date")?.textContent || "",
      image: "",
    };
  } catch {
    return null;
  }
}

// 書誌データ取得（優先順）
async function fetchBookInfo(isbn) {
  return (
    (await fetchOpenBD(isbn)) ||
    (await fetchOpenLibrary(isbn)) ||
    (await fetchNDL(isbn))
  );
}

export default function Home() {
  const [isbn, setIsbn] = useState("");
  const [books, setBooks] = useState([]);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const codeReader = useRef(null);

  useEffect(() => {
    loadBooks();
  }, []);

  async function loadBooks() {
    const data = await fetchBooksFromSupabase();
    setBooks(data);
  }

  // バーコード読み取り開始 (ZXing)
  async function startScan() {
    if (scanning) return;

    setScanning(true);

    codeReader.current = new BrowserMultiFormatReader();

    const devices = await BrowserMultiFormatReader.listVideoInputDevices();
    if (!devices || devices.length === 0) {
      alert("カメラが見つかりません");
      setScanning(false);
      return;
    }

    const backCamera = devices.find((d) =>
      d.label.toLowerCase().includes("back")
    );

    const deviceId = backCamera ? backCamera.deviceId : devices[0].deviceId;

    codeReader.current.decodeFromVideoDevice(
      deviceId,
      videoRef.current,
      (result, err) => {
        if (result) {
          const ean = result.getText();
          setIsbn(ean);
          stopScan();
        }
      }
    );
  }

  async function stopScan() {
    if (codeReader.current) {
      codeReader.current.reset();
      codeReader.current = null;
    }
    setScanning(false);
  }

  async function searchAndSave() {
    const info = await fetchBookInfo(isbn);
    if (!info) {
      alert("書誌データが見つかりません");
      return;
    }

    const newBook = {
      isbn,
      title: info.title,
      authors: info.authors,
      publisher: info.publisher,
      pubdate: info.pubdate,
      image: info.image,
      shelf: "",
      created_at: new Date().toISOString(),
    };

    const ok = await saveBooksToSupabase([newBook]);
    if (ok) {
      alert("保存しました");
      loadBooks();
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>蔵書管理アプリ（ZXingバーコード対応版）</h2>

      <video
        ref={videoRef}
        style={{
          width: "100%",
          maxHeight: "50vh", // ← 画面の半分まで
          background: "#000",
          borderRadius: 8,
        }}
        muted
        playsInline
      ></video>

      {!scanning && (
        <button onClick={startScan} style={{ padding: 10, marginTop: 10 }}>
          バーコードを読み取る
        </button>
      )}

      {scanning && (
        <button onClick={stopScan} style={{ padding: 10, marginTop: 10 }}>
          カメラ停止
        </button>
      )}

      <input
        type="text"
        value={isbn}
        placeholder="ISBN 手入力"
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
          <div>著者: {b.authors?.join(", ")}</div>
        </div>
      ))}
    </div>
  );
}
