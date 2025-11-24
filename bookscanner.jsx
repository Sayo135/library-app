"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

// Supabase 連携
import { createClient } from "@supabase/supabase-js";
const supabaseUrl = "https://sumqfcjvndnpuoirpkrb.supabase.co";
const supabaseKey = "sb_publishable_z_PWS1V9c_Pf8dBTyyHAtA_d0HDKnJ6";
const supabase = createClient(supabaseUrl, supabaseKey);

// dynamic import（SSR回避）
const Html5Qrcode = dynamic(
  () => import("html5-qrcode").then(mod => mod.Html5Qrcode),
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

// --- API呼び出し関数（OpenBD / OpenLibrary / NDL / Wikidata） ---
async function fetchBookInfo(isbn) {
  try {
    const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
    const data = await res.json();
    const bookData = data[0]?.summary || {};
    return {
      title: bookData.title || "",
      authors: bookData.author || "",
      publisher: bookData.publisher || "",
      pubdate: bookData.pubdate || "",
      image: bookData.cover || "",
    };
  } catch {
    return { title: "", authors: "", publisher: "", pubdate: "", image: "" };
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

      if (typeof window !== "undefined" && Html5Qrcode) {
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
    if (now - (lastScannedRef.current[isbn] || 0) < 1500) return;
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
      <h1>本スキャン</h1>
      <p>{msg}</p>
      <div id="reader" style={{ width: 400, height: 300, border: "1px solid gray" }} />
      <button onClick={startScan} disabled={scanning}>スキャン開始</button>
      <button onClick={stopScan} disabled={!scanning}>スキャン停止</button>

      <ul>
        {books.map((b) => (
          <li key={b.isbn}>
            {b.title} ({b.isbn}) {b.duplicate ? "[重複]" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
