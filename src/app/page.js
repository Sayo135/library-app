"use client";

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

// Html5Qrcode は SSR 回避で動的インポート
const Html5Qrcode = dynamic(
  () => import('html5-qrcode').then(mod => mod.Html5Qrcode),
  { ssr: false }
);

// Supabase 設定
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://sumqfcjvndnpuoirpkrb.supabase.co';
const supabaseKey = 'sb_publishable_z_PWS1V9c_Pf8dBTyyHAtA_d0HDKnJ6';
const supabase = createClient(supabaseUrl, supabaseKey);

// Supabaseから取得
async function fetchBooksFromSupabase() {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .order('created_at', { ascending: false });
  return data || [];
}

// Supabaseへ保存
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
  const { error } = await supabase
    .from('books')
    .upsert(rows, { onConflict: ['isbn'] });
  return !error;
}

// fetch OpenBD / OpenLibrary / NDL / Wikidata
async function fetchOpenBD(isbn) {
  try {
    const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || !j[0] || !j[0].summary) return null;
    const s = j[0].summary;
    return {
      title: s.title || '',
      authors: s.author ? s.author.split(',') : [],
      publisher: s.publisher || '',
      pubdate: s.pubdate || '',
      image: s.cover || ''
    };
  } catch {
    return null;
  }
}

// filter utility
function safeJoin(arr) {
  return Array.isArray(arr) ? arr.join(', ') : '';
}

export default function BookScannerPage() {
  const [books, setBooks] = useState([]);
  const [msg, setMsg] = useState('準備中…');
  const [isbnInput, setIsbnInput] = useState('');
  const [searchText, setSearchText] = useState('');
  const [scanning, setScanning] = useState(false);

  const html5QrcodeRef = useRef(null);
  const scannedISBNsRef = useRef(new Set());
  const lastScannedRef = useRef({});
  const videoStartedRef = useRef(false);

  // AudioContext / beep
  const playBeep = () => {
    if (typeof window === 'undefined') return;
    const audio = new Audio('/beep.mp3');
    audio.play().catch(() => {});
  };
  const playBuzzer = () => {
    if (typeof window === 'undefined') return;
    const audio = new Audio('/buzzer.mp3');
    audio.play().catch(() => {});
  };

  // 初期データ取得
  useEffect(() => {
    (async () => {
      const data = await fetchBooksFromSupabase();
      setBooks(data);
      setMsg('スキャンできます');
    })();
  }, []);

  // books 保存
  useEffect(() => {
    if (books.length > 0) saveBooksToSupabase(books);
  }, [books]);

  // ISBN 登録
  const handleISBN = async (isbn) => {
    const now = Date.now();
    if ((now - (lastScannedRef.current[isbn] || 0)) < 1500) return;
    lastScannedRef.current[isbn] = now;

    setMsg('処理中... ' + isbn);
    const info = await fetchOpenBD(isbn) || { title: '', authors: [], publisher: '', pubdate: '', image: '' };
    const duplicate = scannedISBNsRef.current.has(isbn);
    scannedISBNsRef.current.add(isbn);

    if (!duplicate) playBeep();
    else playBuzzer();

    setBooks(prev => [{ isbn, ...info, shelf: '', duplicate }, ...prev]);
    setMsg(duplicate ? '重複登録: ' + isbn : '登録完了: ' + isbn);
  };

  // スキャン開始 / 停止
  const startScan = async () => {
    if (scanning || typeof window === 'undefined') return;
    setScanning(true);
    if (!html5QrcodeRef.current) html5QrcodeRef.current = new Html5Qrcode('reader');
    await html5QrcodeRef.current.start(
      { facingMode: 'environment' },
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

  const filteredBooks = () => {
    const t = searchText?.trim() || '';
    if (!books) return [];
    if (!t) return books;
    return books.filter(b =>
      (b.title + b.publisher + b.isbn + safeJoin(b.authors) + (b.shelf || '')).includes(t)
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>蔵書スキャナー（OpenBD）</h1>
      <p>{msg}</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={startScan} disabled={scanning}>スキャン開始</button>
        <button onClick={stopScan} disabled={!scanning}>停止</button>
      </div>
      <div id="reader" style={{ width: 300, marginTop: 10 }}></div>

      <h2>ISBN 手入力（13桁）</h2>
      <input value={isbnInput} onChange={e => setIsbnInput(e.target.value)} style={{ width: 200 }} />
      <button onClick={() => /^97[89]\d{10}$/.test(isbnInput) && handleISBN(isbnInput)}>手動登録</button>

      <h2>検索</h2>
      <input value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: '50%' }} />

      <h2>登録一覧（{filteredBooks().length}件）</h2>
      {filteredBooks().map((b, i) => (
        <div key={i} style={{ border: '1px solid #ccc', padding: 10, marginBottom: 10, background: b.duplicate ? '#fee' : '#fff', color: b.duplicate ? 'red' : 'black' }}>
          <div>書名: <input value={b.title} onChange={e => setBooks(prev => prev.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))} /></div>
          <div>著者: <input value={safeJoin(b.authors)} onChange={e => setBooks(prev => prev.map((x, idx) => idx === i ? { ...x, authors: e.target.value.split(',').map(s => s.trim()) } : x))} /></div>
          <div>出版社: <input value={b.publisher} onChange={e => setBooks(prev => prev.map((x, idx) => idx === i ? { ...x, publisher: e.target.value } : x))} /></div>
          <div>発行日: <input value={b.pubdate} onChange={e => setBooks(prev => prev.map((x, idx) => idx === i ? { ...x, pubdate: e.target.value } : x))} /></div>
          <div>ISBN: {b.isbn}</div>
          <div>本棚: <input value={b.shelf || ''} onChange={e => setBooks(prev => prev.map((x, idx) => idx === i ? { ...x, shelf: e.target.value } : x))} /></div>
          <div>{b.image ? <img src={b.image} alt="cover" style={{ width: 120, marginTop: 6 }} /> : <span style={{ color: '#888', fontStyle: 'italic' }}>書影なし</span>}</div>
          <button onClick={() => setBooks(prev => prev.filter((_, idx) => idx !== i))} style={{ marginTop: 6 }}>削除</button>
        </div>
      ))}
    </div>
  );
}
