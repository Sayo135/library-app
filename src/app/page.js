"use client";

import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { createClient } from "@supabase/supabase-js";

// Supabase設定（直接埋め込み）
const supabaseUrl = "https://sumqfcjvndnpuoirpkrb.supabase.co";
const supabaseKey = "sb_publishable_z_PWS1V9c_Pf8dBTyyHAtA_d0HDKnJ6";
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

// 各種API: OpenBD / OpenLibrary / NDL / Wikidata
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
      image: s.cover || "",
    };
  } catch {
    return null;
  }
}

async function fetchOpenLibrary(isbn) {
  try {
    const res = await fetch("https://openlibrary.org/isbn/" + isbn + ".json");
    if (!res.ok) return null;
    const j = await res.json();
    let authors = [];
    if (j.authors?.length > 0) {
      const ares = await fetch("https://openlibrary.org" + j.authors[0].key + ".json");
      if (ares.ok) {
        const aj = await ares.json();
        authors = [aj.name];
      }
    }
    let image = "";
    if (j.covers?.length > 0) image = "https://covers.openlibrary.org/b/id/" + j.covers[0] + "-L.jpg";
    return {
      title: j.title || "",
      authors,
      publisher: j.publishers?.join(",") || "",
      pubdate: j.publish_date || "",
      image,
    };
  } catch {
    return null;
  }
}

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
    return { title, authors: author ? [author] : [], publisher, pubdate: date, image: "" };
  } catch {
    return null;
  }
}

async function fetchWikidata(isbn) {
  try {
    const endpoint = "https://query.wikidata.org/sparql";
    const query =
      'SELECT ?item ?itemLabel ?authorLabel ?pubdate ?publisherLabel ?image WHERE { ?item wdt:P212|wdt:P957 "' +
      isbn +
      '". OPTIONAL { ?item rdfs:label ?itemLabel. FILTER (lang(?itemLabel)="ja") } OPTIONAL { ?item wdt:P50 ?author. ?author rdfs:label ?authorLabel. FILTER (lang(?authorLabel)="ja") } OPTIONAL { ?item wdt:P577 ?pubdate. } OPTIONAL { ?item wdt:P123 ?publisher. ?publisher rdfs:label ?publisherLabel. FILTER (lang(?publisherLabel)="ja") } OPTIONAL { ?item wdt:P18 ?image. } } LIMIT 1';
    const res = await fetch(endpoint + "?query=" + encodeURIComponent(query) + "&format=json");
    if (!res.ok) return null;
    const data = await res.json();
    const b = data.results.bindings[0];
    if (!b) return null;
    return {
      title: b.itemLabel?.value || "",
      authors: b.authorLabel ? [b.authorLabel.value] : [],
      publisher: b.publisherLabel?.value || "",
      pubdate: b.pubdate?.value?.split("T")[0] || "",
      image: b.image?.value || "",
    };
  } catch {
    return null;
  }
}

async function fetchBookInfo(isbn) {
  return (
    (await fetchOpenBD(isbn)) ||
    (await fetchOpenLibrary(isbn)) ||
    (await fetchNDL(isbn)) ||
    (await fetchWikidata(isbn)) ||
    { title: "", authors: [], publisher: "", pubdate: "", image: "" }
  );
}

// ---------------------------
// Reactコンポーネント
// ---------------------------
export default function Page() {
  const [books, setBooks] = useState([]);
  const [scanning, setScanning] = useState(false);
  const html5QrcodeRef = useRef(null);

  useEffect(() => {
    fetchBooksFromSupabase().then(setBooks);
  }, []);

  const startScan = () => {
    if (scanning) return;
    setScanning(true);
    const html5QrCode = new Html5Qrcode("reader");
    html5QrcodeRef.current = html5QrCode;
    html5QrCode.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: 250,
      },
      async (decodedText) => {
        const bookInfo = await fetchBookInfo(decodedText);
        const newBooks = [bookInfo, ...books];
        setBooks(newBooks);
        await saveBooksToSupabase(newBooks);
        html5QrCode.stop();
        setScanning(false);
      },
      (error) => {}
    );
  };

  const stopScan = () => {
    if (html5QrcodeRef.current) {
      html5QrcodeRef.current.stop();
      setScanning(false);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>蔵書管理アプリ</h1>
      <div>
        <button onClick={startScan} disabled={scanning}>スキャン開始</button>
        <button onClick={stopScan} disabled={!scanning}>スキャン停止</button>
      </div>
      <div id="reader" style={{ width: 300, height: 300, marginTop: 20 }}></div>
      <h2>蔵書一覧</h2>
      <ul>
        {books.map((b, i) => (
          <li key={i}>
            <img src={b.image} alt={b.title} style={{ width: 50, verticalAlign: "middle" }} />{" "}
            <strong>{b.title}</strong> ({b.authors.join(", ")}) - {b.publisher} [{b.pubdate}]
          </li>
        ))}
      </ul>
    </div>
  );
}
