"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from "next/navigation";
import { Html5Qrcode } from 'html5-qrcode';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sumqfcjvndnpuoirpkrb.supabase.co';
const supabaseKey = 'sb_publishable_z_PWS1V9c_Pf8dBTyyHAtA_d0HDKnJ6';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Supabase 関数など既存コードはそのまま ---
async function fetchBooksFromSupabase() { /* ... */ }
async function saveBooksToSupabase(books) { /* ... */ }
async function fetchWikidata(isbn) { /* ... */ }
async function fetchOpenBD(isbn) { /* ... */ }
async function fetchOpenLibrary(isbn) { /* ... */ }
async function fetchNDL(isbn) { /* ... */ }
async function fetchBookInfo(isbn) { /* ... */ }

// ----------------- 認証チェック -----------------
export default function BookScannerPage() {
  const router = useRouter();

  useEffect(() => {
    const loggedIn = sessionStorage.getItem("loggedIn");
    if (!loggedIn) {
      router.push("/login"); // 未ログイン時は /login にリダイレクト
    }
  }, []);

  // 以下は既存の状態管理・スキャン処理
  const [scanning, setScanning] = useState(false);
  const [isbnInput, setIsbnInput] = useState('');
  const [shelfInput, setShelfInput] = useState('');
  const [books, setBooks] = useState([]);
  const [msg, setMsg] = useState('準備中…');
  const [searchText, setSearchText] = useState('');

  const html5QrcodeRef = useRef(null);
  const lastScannedRef = useRef({});
  const scannedISBNsRef = useRef(new Set());
  const videoStartedRef = useRef(false);

  // Supabaseから初期データ取得
  useEffect(() => {
    (async () => {
      const data = await fetchBooksFromSupabase();
      setBooks(data);
      setMsg('スキャンできます');
    })();
  }, []);

  // Supabaseへ保存
  useEffect(() => {
    if (books.length > 0) {
      saveBooksToSupabase(books);
    }
  }, [books]);

  // Buzzer（AudioContext再利用 & async化）
  const playBeep = () => { try { new Audio('/beep.mp3').play(); } catch(e){} };
  const playBuzzer = () => { try { new Audio('/buzzer.mp3').play(); } catch(e){} };

  // ISBN ハンドリング
  async function handleISBN(isbn) { /* 既存コード */ }

  // カメラスキャン開始/停止
  async function startScan() { /* 既存コード */ }
  async function stopScan() { /* 既存コード */ }

  // フィルタリング
  function filteredBooks() { /* 既存コード */ }

  return (
    <div style={{ padding: 20 }}>
      <h1>蔵書スキャナー（OpenBD / OpenLibrary / NDL）</h1>
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
        onClick={() => {
          if (/^97[89]\d{10}$/.test(isbnInput)) handleISBN(isbnInput);
        }}
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
