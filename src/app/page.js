"use client";

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { createClient } from "@supabase/supabase-js";

// Supabase設定
const supabaseUrl = "https://sumqfcjvndnpuoirpkrb.supabase.co
";
const supabaseKey = "sb_publishable_z_PWS1V9c_Pf8dBTyyHAtA_d0HDKnJ6";
const supabase = createClient(supabaseUrl, supabaseKey);

// Supabase: booksテーブル取得
async function fetchBooksFromSupabase() {
const { data, error } = await supabase.from('books').select('*').order('created_at', { ascending: false });
if (error) return [];
return data || [];
}

// Supabase: booksテーブル保存（Upsert）
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
const { error } = await supabase.from('books').upsert(rows, { onConflict: ['isbn'] });
return !error;
}

// API: OpenBD
async function fetchOpenBD(isbn) {
try {
const res = await fetch('https://api.openbd.jp/v1/get?isbn=
' + isbn);
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
} catch { return null; }
}

// API: OpenLibrary
async function fetchOpenLibrary(isbn) {
try {
const res = await fetch('https://openlibrary.org/isbn/
' + isbn + '.json');
if (!res.ok) return null;
const j = await res.json();
let authors = [];
if (j.authors && j.authors.length > 0) {
const ares = await fetch('https://openlibrary.org
' + j.authors[0].key + '.json');
if (ares.ok) {
const aj = await ares.json();
authors = [aj.name];
}
}
let image = '';
if (j.covers && j.covers.length > 0) {
image = 'https://covers.openlibrary.org/b/id/
' + j.covers[0] + '-L.jpg';
}
return {
title: j.title || '',
authors,
publisher: j.publishers ? j.publishers.join(',') : '',
pubdate: j.publish_date || '',
image
};
} catch { return null; }
}

// API: NDL
async function fetchNDL(isbn) {
try {
const url = 'https://iss.ndl.go.jp/api/opensearch?isbn=
' + isbn;
const res = await fetch(url);
if (!res.ok) return null;
const txt = await res.text();
const xml = new DOMParser().parseFromString(txt, 'text/xml');
const item = xml.querySelector('item');
if (!item) return null;
const title = item.querySelector('title')?.textContent || '';
const author = item.querySelector('dc\:creator')?.textContent || '';
const publisher = item.querySelector('dc\:publisher')?.textContent || '';
const date = item.querySelector('dc\:date')?.textContent || '';
return {
title,
authors: author ? [author] : [],
publisher,
pubdate: date,
image: ''
};
} catch { return null; }
}

// Fetch book info
async function fetchBookInfo(isbn) {
const a = await fetchOpenBD(isbn);
if (a) return a;
const b = await fetchOpenLibrary(isbn);
if (b) return b;
const c = await fetchNDL(isbn);
if (c) return c;
return { title: '', authors: [], publisher: '', pubdate: '', image: '' };
}

export default function BookScannerPage() {
const [scanning, setScanning] = useState(false);
const [isbnInput, setIsbnInput] = useState('');
const [books, setBooks] = useState([]);
const [msg, setMsg] = useState('準備中…');
const [searchText, setSearchText] = useState('');

const html5QrcodeRef = useRef(null);
const lastScannedRef = useRef({});
const scannedISBNsRef = useRef(new Set());
const videoStartedRef = useRef(false);

// 初期データ取得
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

// 音再生
const playBeep = () => { new Audio('/beep.mp3').play().catch(() => {}); };
const playBuzzer = () => { new Audio('/buzzer.mp3').play().catch(() => {}); };

// Handle scanned ISBN
async function handleISBN(isbn) {
const now = Date.now();
if ((now - (lastScannedRef.current[isbn] || 0)) < 1500) return;
lastScannedRef.current[isbn] = now;

setMsg('処理中… ' + isbn);

const info = await fetchBookInfo(isbn);
const duplicate = scannedISBNsRef.current.has(isbn);

if (!duplicate) playBeep();
else playBuzzer();

scannedISBNsRef.current.add(isbn);

setBooks(prev => [{ isbn, ...info, shelf: '', duplicate }, ...prev]);
setMsg(duplicate ? '重複登録: ' + isbn : '登録完了: ' + isbn);


}

// カメラ開始
async function startScan() {
if (scanning) return;
setScanning(true);

if (!html5QrcodeRef.current) html5QrcodeRef.current = new Html5Qrcode('reader');

await html5QrcodeRef.current.start(
  { facingMode: 'environment' },
  { fps: 10, qrbox: { width: 250, height: 250 } },
  decoded => {
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

function filteredBooks() {
const t = searchText.trim();
if (!t) return books;
return books.filter(b => (b.title + b.publisher + b.isbn + b.authors.join(',') + (b.shelf || '')).includes(t));
}

return (
<div style={{ padding: 16 }}>
<h1>蔵書スキャナー（モバイル最適化版）</h1>
<p>{msg}</p>

  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
    <button onClick={startScan} disabled={scanning} style={{ padding: 12 }}>スキャン開始</button>
    <button onClick={stopScan} disabled={!scanning} style={{ padding: 12 }}>停止</button>
  </div>

  <div id="reader" style={{ width: '100%', maxWidth: 400, marginTop: 10 }}></div>

  <h2>ISBN 手入力</h2>
  <input value={isbnInput} onChange={e => setIsbnInput(e.target.value)} style={{ width: '60%', padding: 8 }} />
  <button
    onClick={() => { if (/^97[89]\d{10}$/.test(isbnInput)) handleISBN(isbnInput); }}
    style={{ padding: 8, marginLeft: 8 }}
  >手動登録</button>

  <h2>検索（書名・著者・出版社・ISBN・棚）</h2>
  <input
    value={searchText}
    onChange={e => setSearchText(e.target.value)}
    style={{ width: '100%', maxWidth: 400, padding: 8 }}
  />

  <h2>登録一覧（{filteredBooks().length}件）</h2>

  {filteredBooks().map((b, i) => (
    <div key={i} style={{ border: '1px solid #ccc', padding: 10, marginBottom: 10, background: b.duplicate ? '#fee' : '#fff', color: b.duplicate ? 'red' : 'black' }}>
      <div>
        <strong>書名: </strong>
        <input value={b.title} onChange={e => { const v=e.target.value; setBooks(prev => prev.map((x, idx)=>idx===i?{...x,title:v}:x)); }} style={{ width: '100%' }} />
      </div>
      <div>
        著者:
        <input value={b.authors.join(', ')} onChange={e => { const v=e.target.value; setBooks(prev => prev.map((x, idx)=>idx===i?{...x,authors:v.split(',').map(s=>s.trim())}:x)); }} style={{ width: '100%' }} />
      </div>
      <div>
        出版社:
        <input value={b.publisher} onChange={e => { const v=e.target.value; setBooks(prev => prev.map((x, idx)=>idx===i?{...x,publisher:v}:x)); }} style={{ width: '100%' }} />
      </div>
      <div>
        発行日:
        <input value={b.pubdate} onChange={e => { const v=e.target.value; setBooks(prev => prev.map((x, idx)=>idx===i?{...x,pubdate:v}:x)); }} style={{ width: 120 }} />
      </div>
      <div>ISBN: {b.isbn}</div>
      <div>
        本棚:
        <input value={b.shelf || ''} onChange={e => { const v=e.target.value; setBooks(prev => prev.map((x, idx)=>idx===i?{...x,shelf:v}:x)); }} style={{ width: '100%' }} />
      </div>
      <div>{b.image ? <img src={b.image} alt="cover" style={{ width: '100px', border: '1px solid #888', background: '#fafafa' }} /> : <span style={{ color: '#888', fontStyle: 'italic' }}>書影なし</span>}</div>
      <button onClick={()=>setBooks(prev => prev.filter((_, idx)=>idx!==i))} style={{ marginTop: 6 }}>削除</button>
    </div>
  ))}
</div>


);
}