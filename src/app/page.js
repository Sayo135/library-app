"use client";

import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { createClient } from "@supabase/supabase-js";

// Supabase設定
const supabaseUrl = "https://sumqfcjvndnpuoirpkrb.supabase.co
";
const supabaseKey = "sb_publishable_z_PWS1V9c_Pf8dBTyyHAtA_d0HDKnJ6";
const supabase = createClient(supabaseUrl, supabaseKey);

// Supabase: books取得
async function fetchBooksFromSupabase() {
const { data, error } = await supabase
.from("books")
.select("*")
.order("created_at", { ascending: false });
if (error) return [];
return data || [];
}

// Supabase: books保存
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

// API: OpenBD / OpenLibrary / NDL / Wikidata
async function fetchOpenBD(isbn) {
try {
const res = await fetch(https://api.openbd.jp/v1/get?isbn=${isbn});
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
const res = await fetch(https://openlibrary.org/isbn/${isbn}.json);
if (!res.ok) return null;
const j = await res.json();
let authors = [];
if (j.authors?.length > 0) {
const ares = await fetch(https://openlibrary.org${j.authors[0].key}.json);
if (ares.ok) {
const aj = await ares.json();
authors = [aj.name];
}
}
let image = "";
if (j.covers?.length > 0) image = https://covers.openlibrary.org/b/id/${j.covers[0]}-L.jpg;
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
const res = await fetch(https://iss.ndl.go.jp/api/opensearch?isbn=${isbn});
if (!res.ok) return null;
const txt = await res.text();
const xml = new DOMParser().parseFromString(txt, "text/xml");
const item = xml.querySelector("item");
if (!item) return null;
const title = item.querySelector("title")?.textContent || "";
const author = item.querySelector("dc\:creator")?.textContent || "";
const publisher = item.querySelector("dc\:publisher")?.textContent || "";
const date = item.querySelector("dc\:date")?.textContent || "";
return { title, authors: author ? [author] : [], publisher, pubdate: date, image: "" };
} catch {
return null;
}
}

async function fetchWikidata(isbn) {
try {
const endpoint = "https://query.wikidata.org/sparql
";
const query = SELECT ?item ?itemLabel ?authorLabel ?pubdate ?publisherLabel ?image WHERE { ?item wdt:P212|wdt:P957 "${isbn}". OPTIONAL { ?item rdfs:label ?itemLabel. FILTER (lang(?itemLabel)="ja") } OPTIONAL { ?item wdt:P50 ?author. ?author rdfs:label ?authorLabel. FILTER (lang(?authorLabel)="ja") } OPTIONAL { ?item wdt:P577 ?pubdate. } OPTIONAL { ?item wdt:P123 ?publisher. ?publisher rdfs:label ?publisherLabel. FILTER (lang(?publisherLabel)="ja") } OPTIONAL { ?item wdt:P18 ?image. } } LIMIT 1;
const url = ${endpoint}?query=${encodeURIComponent(query)}&format=json;
const res = await fetch(url);
if (!res.ok) return null;
const data = await res.json();
const b = data.results.bindings[0];
if (!b) return null;
return {
title: b.itemLabel?.value || "",
authors: b.authorLabel ? [b.authorLabel.value] : [],
publisher: b.publisherLabel?.value || "",
pubdate: b.pubdate?.value ? b.pubdate.value.split("T")[0] : "",
image: b.image?.value || "",
};
} catch {
return null;
}
}

async function fetchBookInfo(isbn) {
const sources = [fetchOpenBD, fetchOpenLibrary, fetchNDL, fetchWikidata];
for (const fn of sources) {
const res = await fn(isbn);
if (res) return res;
}
return { title: "", authors: [], publisher: "", pubdate: "", image: "" };
}

export default function BookScannerPage() {
const [scanning, setScanning] = useState(false);
const [isbnInput, setIsbnInput] = useState("");
const [books, setBooks] = useState([]);
const [msg, setMsg] = useState("準備中…");
const [searchText, setSearchText] = useState("");

const html5QrcodeRef = useRef(null);
const lastScannedRef = useRef({});
const scannedISBNsRef = useRef(new Set());
const videoStartedRef = useRef(false);

useEffect(() => {
(async () => {
const data = await fetchBooksFromSupabase();
setBooks(data);
data.forEach((b) => scannedISBNsRef.current.add(b.isbn));
setMsg("スキャンできます");
})();
}, []);

useEffect(() => {
if (books.length > 0) saveBooksToSupabase(books);
}, [books]);

const playBeep = () => {
try {
const audio = new Audio("/beep.mp3");
audio.play();
} catch {}
};
const playBuzzer = () => {
try {
const audio = new Audio("/buzzer.mp3");
audio.play();
} catch {}
};

async function handleISBN(isbn) {
const now = Date.now();
const last = lastScannedRef.current[isbn] || 0;
if (now - last < 1500) return;
lastScannedRef.current[isbn] = now;

setMsg("処理中... " + isbn);
const info = await fetchBookInfo(isbn);
const duplicate = scannedISBNsRef.current.has(isbn);
if (!duplicate) playBeep();
else playBuzzer();
scannedISBNsRef.current.add(isbn);
setBooks((prev) => [{ isbn, ...info, shelf: "", duplicate }, ...prev]);
setMsg(duplicate ? "重複登録: " + isbn : "登録完了: " + isbn);


}

async function startScan() {
if (scanning) return;
setScanning(true);
const id = "reader";
if (!html5QrcodeRef.current) html5QrcodeRef.current = new Html5Qrcode(id);
await html5QrcodeRef.current.start(
{ facingMode: "environment" },
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

const filteredBooks = () => {
const t = searchText.trim();
if (!t) return books;
return books.filter(
(b) => (b.title + b.publisher + b.isbn + b.authors.join(",") + (b.shelf || "")).includes(t)
);
};

return (
<div style={{ padding: 16, fontSize: 14 }}>
<h1 style={{ fontSize: 18 }}>蔵書スキャナー（OpenBD / OpenLibrary / NDL / Wikidata）</h1>
<p>{msg}</p>
<div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
<button onClick={startScan} disabled={scanning}>
スキャン開始
</button>
<button onClick={stopScan} disabled={!scanning}>
停止
</button>
</div>
<div id="reader" style={{ width: "100%", maxWidth: 320, marginBottom: 12 }}></div>

  <h2>ISBN 手入力（13桁）</h2>
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <input
      value={isbnInput}
      onChange={(e) => setIsbnInput(e.target.value)}
      style={{ width: 160 }}
    />
    <button
      onClick={() => {
        if (/^97[89]\d{10}$/.test(isbnInput)) handleISBN(isbnInput);
      }}
    >
      手動登録
    </button>
  </div>

  <h2>検索（書名・著者・出版社・ISBN・棚）</h2>
  <input
    value={searchText}
    onChange={(e) => setSearchText(e.target.value)}
    style={{ width: "100%", maxWidth: 300, marginBottom: 10 }}
  />

  <h2>登録一覧（{filteredBooks().length}件）</h2>
  {filteredBooks().map((b, i) => (
    <div
      key={i}
      style={{
        border: "1px solid #ccc",
        padding: 8,
        marginBottom: 8,
        background: b.duplicate ? "#fee" : "#fff",
        color: b.duplicate ? "red" : "black",
      }}
    >
      <div>
        <label>
          <strong>書名: </strong>
          <input
            value={b.title}
            onChange={(e) =>
              setBooks((prev) => prev.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)))
            }
            style={{ width: "70%" }}
          />
        </label>
      </div>
      <div>
        <label>
          著者:
          <input
            value={b.authors.join(", ")}
            onChange={(e) =>
              setBooks((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, authors: e.target.value.split(",").map((s) => s.trim()) } : x))
              )
            }
            style={{ width: "70%" }}
          />
        </label>
      </div>
      <div>
        <label>
          出版社:
          <input
            value={b.publisher}
            onChange={(e) =>
              setBooks((prev) => prev.map((x, idx) => (idx === i ? { ...x, publisher: e.target.value } : x)))
            }
            style={{ width: "70%" }}
          />
        </label>
      </div>
      <div>
        <label>
          発行日:
          <input
            value={b.pubdate}
            onChange={(e) =>
              setBooks((prev) => prev.map((x, idx) => (idx === i ? { ...x, pubdate: e.target.value } : x)))
            }
            style={{ width: 120 }}
          />
        </label>
      </div>
      <div>ISBN: {b.isbn}</div>
      <div>
        本棚:
        <input
          value={b.shelf || ""}
          onChange={(e) =>
            setBooks((prev) => prev.map((x, idx) => (idx === i ? { ...x, shelf: e.target.value } : x)))
          }
          style={{ width: 120, marginLeft: 6 }}
        />
      </div>
      <div style={{ marginTop: 4 }}>
        {b.image ? (
          <img src={b.image} alt="cover" style={{ width: 120, border: "1px solid #888", background: "#fafafa" }} />
        ) : (
          <span style={{ color: "#888", fontStyle: "italic" }}>書影なし</span>
        )}
      </div>
      <button
        onClick={() => setBooks((prev) => prev.filter((_, idx) => idx !== i))}
        style={{ marginTop: 4 }}
      >
        削除
      </button>
    </div>
  ))}
</div>


);
}