"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from "next/navigation";
import { createClient } from '@supabase/supabase-js';
import dynamic from "next/dynamic";

// html5-qrcode は SSR 回避
const Html5Qrcode = dynamic(() => import('html5-qrcode').then(mod => mod.Html5Qrcode), { ssr: false });

const supabaseUrl = 'https://sumqfcjvndnpuoirpkrb.supabase.co';
const supabaseKey = 'sb_publishable_z_PWS1V9c_Pf8dBTyyHAtA_d0HDKnJ6';
const supabase = createClient(supabaseUrl, supabaseKey);

// ----------------- Supabase 関数 -----------------
async function fetchBooksFromSupabase() { /* 既存コード */ }
async function saveBooksToSupabase(books) { /* 既存コード */ }
async function fetchWikidata(isbn) { /* 既存コード */ }
async function fetchOpenBD(isbn) { /* 既存コード */ }
async function fetchOpenLibrary(isbn) { /* 既存コード */ }
async function fetchNDL(isbn) { /* 既存コード */ }
async function fetchBookInfo(isbn) { /* 既存コード */ }

// ----------------- メインコンポーネント -----------------
export default function BookScannerPage() {
  const router = useRouter();

  // 認証チェック
  useEffect(() => {
    const loggedIn = sessionStorage.getItem("loggedIn");
    if (!loggedIn) router.push("/login");
  }, []);

  // 状態管理
  const [scanning, setScanning] = useState(false);
  const [isbnInput, setIsbnInput] = useState('');
  const [books, setBooks] = useState([]);
  const [msg, setMsg] = useState('準備中…');
  const [searchText, setSearchText] = useState('');

  const html5QrcodeRef = useRef(null);
  const lastScannedRef = useRef({});
  const scannedISBNsRef = useRef(new Set());
  const videoStartedRef = useRef(false);

  // クライアントサイドのみ処理
  useEffect(() => {
    (async () => {
      const data = await fetchBooksFromSupabase();
      setBooks(data);
      setMsg('スキャンできます');
    })();
  }, []);

  // Supabase保存
  useEffect(() => {
    if (books.length > 0) saveBooksToSupabase(books);
  }, [books]);

  // Audio & DOM 操作もクライアント内で
  const playBeep = () => {
    if (typeof window !== "undefined") {
      try { new Audio('/beep.mp3').play(); } catch {}
    }
  };
  const playBuzzer = () => {
    if (typeof window !== "undefined") {
      try { new Audio('/buzzer.mp3').play(); } catch {}
    }
  };

  async function handleISBN(isbn) { /* 既存コード */ }

  async function startScan() {
    if (scanning || typeof window === "undefined") return;
    setScanning(true);

    const id = 'reader';
    if (!html5QrcodeRef.current) {
      html5QrcodeRef.current = new Html5Qrcode(id);
    }

    await html5QrcodeRef.current.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 250 },
      (decoded) => {
        if (/^97[89]\d{10}$/.test(decoded)) handleISBN(decoded);
      }
    );
    videoStartedRef.current = true;
  }

  async function stopScan() {
    setScanning(false);
    if (html5QrcodeRef.current && videoStartedRef.current) {
      await html5QrcodeRef.current.stop();
      videoStartedRef.current = false;
    }
  }

  function filteredBooks() { /* 既存コード */ }

  return (
    <div style={{ padding: 20 }}>
      <h1>蔵書スキャナー（Netlify ビルド安全版）</h1>
      <p>{msg}</p>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={startScan} disabled={scanning}>スキャン開始</button>
        <button onClick={stopScan} disabled={!scanning}>停止</button>
      </div>

      <div id="reader" style={{ width: 300, marginTop: 10 }}></div>

      <h2 style={{ marginTop: 20 }}>ISBN 手入力（13桁）</h2>
      <input
        value={isbnInput}
        onChange={(e) => setIsbnInput(e.target.value)}
        style={{ width: 200 }}
      />
      <button
        onClick={() => { if (/^97[89]\d{10}$/.test(isbnInput)) handleISBN(isbnInput); }}
      >手動登録</button>

      <h2>検索（書名・著者・出版社・ISBN・棚）</h2>
      <input
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ width: '50%' }}
      />

      <h2>登録一覧（{filteredBooks().length}件）</h2>

      {filteredBooks().map((b, i) => (
        <div
          key={i}
          style={{
            border: '1px solid #ccc', padding: 10, marginBottom: 10,
            background: b.duplicate ? '#fee' : '#fff', color: b.duplicate ? 'red' : 'black'
          }}
        >
          {/* 既存の入力フォームや表示内容はそのまま */}
        </div>
      ))}
    </div>
  );
}
