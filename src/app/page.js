"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Html5Qrcode } from "html5-qrcode";

/* ---------------- Supabase ---------------- */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/* ---------------- util ---------------- */
const isMobileDevice = () => {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768;
};

/* ========================================================= */
export default function Home() {
  const [books, setBooks] = useState([]);
  const [shelves, setShelves] = useState([]);
  const [selectedShelf, setSelectedShelf] = useState("");
  const [search, setSearch] = useState("");
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [recent, setRecent] = useState([]);

  const [isMobile, setIsMobile] = useState(false);
  const [lastIsbn, setLastIsbn] = useState("");

  const qrRef = useRef(null);
  const beepRef = useRef(null);
  const warnRef = useRef(null);

  /* ---------------- 初期化 ---------------- */
  useEffect(() => {
    setIsMobile(isMobileDevice());
    loadBooks();
    loadShelves();
  }, []);

  /* ---------------- データ取得 ---------------- */
  async function loadBooks() {
    const { data } = await supabase
      .from("books")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setBooks(data);
      setFilteredBooks(data);
    }
  }

  async function loadShelves() {
    const { data } = await supabase
      .from("shelves")
      .select("*")
      .order("created_at");

    if (data) {
      setShelves(data);
      if (!selectedShelf && data.length > 0) {
        setSelectedShelf(data[0].name);
      }
    }
  }

  /* ---------------- OpenBD ---------------- */
  async function fetchOpenBD(isbn) {
    try {
      const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
      const json = await res.json();
      const s = json?.[0]?.summary;
      if (!s) return null;

      return {
        title: s.title,
        authors: s.author?.split(" / ") ?? [],
        publisher: s.publisher,
        cover: s.cover ?? "",
      };
    } catch {
      return null;
    }
  }

  /* ---------------- ISBN 検出 ---------------- */
  async function handleDetectedIsbn(isbn) {
    if (!/^978\d{10}$/.test(isbn)) return;
    if (isbn === lastIsbn) return;
    setLastIsbn(isbn);

    const info = await fetchOpenBD(isbn);
    if (!info) return;

    const exists = books.some((b) => b.isbn === isbn);

    if (exists) warnRef.current?.play().catch(() => {});
    else {
      beepRef.current?.play().catch(() => {});
      navigator.vibrate?.(80);
    }

    const { data } = await supabase
      .from("books")
      .upsert(
        {
          isbn,
          title: info.title || "(書名なし)",
          authors: info.authors,
          publisher: info.publisher,
          cover: info.cover,
          shelf: selectedShelf || "未設定",
          location: "", // 物理的な場所
        },
        { onConflict: "isbn" }
      )
      .select()
      .single();

    if (data) {
      setBooks((prev) => [data, ...prev.filter((b) => b.isbn !== data.isbn)]);
      setRecent((prev) => [data, ...prev].slice(0, 3));
    }
  }

  /* ---------------- カメラ ---------------- */
  async function startScan() {
    if (qrRef.current) return;

    qrRef.current = new Html5Qrcode("reader");
    await qrRef.current.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      (text) => handleDetectedIsbn(text.replace(/[^0-9]/g, ""))
    );
  }

  async function stopScan() {
    if (!qrRef.current) return;
    await qrRef.current.stop();
    qrRef.current.clear();
    qrRef.current = null;
  }

  /* ---------------- 更新・削除（PC用） ---------------- */
  async function updateBook(isbn, patch) {
    const { data } = await supabase
      .from("books")
      .update(patch)
      .eq("isbn", isbn)
      .select()
      .single();

    if (data) {
      setBooks((prev) => prev.map((b) => (b.isbn === isbn ? data : b)));
    }
  }

  async function deleteBook(isbn) {
    if (!confirm("この本を削除しますか？")) return;
    await supabase.from("books").delete().eq("isbn", isbn);
    setBooks((prev) => prev.filter((b) => b.isbn !== isbn));
  }

  /* ---------------- 検索（PC） ---------------- */
  useEffect(() => {
    if (!search) setFilteredBooks(books);
    else {
      const s = search.toLowerCase();
      setFilteredBooks(
        books.filter(
          (b) =>
            b.title.toLowerCase().includes(s) ||
            b.isbn.includes(s) ||
            b.authors.join(" ").toLowerCase().includes(s) ||
            (b.shelf ?? "").toLowerCase().includes(s) ||
            (b.location ?? "").toLowerCase().includes(s)
        )
      );
    }
  }, [search, books]);

  /* ========================================================= */
  return (
    <main style={{ padding: 16 }}>
      <h1>蔵書管理</h1>

      <audio ref={beepRef} src="/beep.mp3" />
      <audio ref={warnRef} src="/warn.mp3" />

      {isMobile ? (
        <MobileView startScan={startScan} stopScan={stopScan} recent={recent} />
      ) : (
        <DesktopView
          books={filteredBooks}
          shelves={shelves || []}
          search={search}
          setSearch={setSearch}
          updateBook={updateBook}
          deleteBook={deleteBook}
        />
      )}
    </main>
  );
}

/* ========================================================= */
/* ======================= Mobile ========================== */
function MobileView({ startScan, stopScan, recent }) {
  return (
    <>
      <section>
        <button onClick={startScan}>📷 読み取り開始</button>
        <button onClick={stopScan}>停止</button>
        <div id="reader" style={{ width: "100%" }} />
      </section>

      <section>
        <h2>🕒 直前3冊</h2>
        {recent.map((b) => (
          <div key={b.isbn}>
            {b.title} ({b.isbn})
          </div>
        ))}
      </section>
    </>
  );
}

/* ========================================================= */
/* ======================= Desktop ========================= */
function DesktopView({ books, shelves, search, setSearch, updateBook, deleteBook }) {
  // 本棚ごとにグループ化
  const grouped = {};
  books.forEach((b) => {
    const shelf = b.shelf || "未設定";
    if (!grouped[shelf]) grouped[shelf] = [];
    grouped[shelf].push(b);
  });

  return (
    <>
      <section>
        <input
          placeholder="検索（タイトル・ISBN・著者・本棚・場所）"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </section>

      {Object.keys(grouped).map((shelfName) => (
        <section key={shelfName} style={{ marginTop: 20 }}>
          <h3>{shelfName}</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, 160px)",
              gap: 16,
            }}
          >
            {grouped[shelfName].map((b) => (
              <div key={b.isbn} style={{ border: "1px solid #ccc", padding: 8 }}>
                {b.cover && (
                  <img
                    src={b.cover}
                    alt={b.title}
                    style={{ width: "100%", height: 220, objectFit: "cover" }}
                  />
                )}
                <input
                  value={b.title}
                  onChange={(e) => updateBook(b.isbn, { title: e.target.value })}
                  style={{ width: "100%" }}
                />
                <select
                  value={b.shelf || "未設定"}
                  onChange={(e) => updateBook(b.isbn, { shelf: e.target.value })}
                  style={{ width: "100%", marginTop: 4 }}
                >
                  {(shelves || []).map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="場所"
                  value={b.location ?? ""}
                  onChange={(e) => updateBook(b.isbn, { location: e.target.value })}
                  style={{ width: "100%", marginTop: 4 }}
                />
                <button onClick={() => deleteBook(b.isbn)} style={{ marginTop: 4 }}>
                  削除
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
