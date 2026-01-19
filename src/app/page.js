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
  return window.matchMedia("(max-width: 767px)").matches;
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
    const detect = () => setIsMobile(isMobileDevice());
    detect();
    window.addEventListener("resize", detect);

    loadBooks();
    loadShelves();

    return () => window.removeEventListener("resize", detect);
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

    if (data && data.length) {
      setShelves(data);
      if (!selectedShelf) setSelectedShelf(data[0].name);
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
    (exists ? warnRef : beepRef).current?.play().catch(() => {});
    if (!exists) navigator.vibrate?.(80);

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
          shelf_no: "",
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

  /* ---------------- 更新・削除 ---------------- */
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

  /* ---------------- 検索 ---------------- */
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
            (b.shelf_no ?? "").includes(s)
        )
      );
    }
  }, [search, books]);

  /* ========================================================= */
  return (
    <main style={{ padding: 16 }}>
      <h1>蔵書管理</h1>

      <audio ref={beepRef} src="/beep.mp3" preload="auto" />
      <audio ref={warnRef} src="/warn.mp3" preload="auto" />

      {isMobile ? (
        <MobileView startScan={startScan} stopScan={stopScan} recent={recent} />
      ) : (
        <DesktopView
          books={filteredBooks}
          search={search}
          setSearch={setSearch}
          updateBook={updateBook}
          deleteBook={deleteBook}
        />
      )}
    </main>
  );
}

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
            {b.title}（{b.isbn}）
          </div>
        ))}
      </section>
    </>
  );
}

/* ======================= Desktop ========================= */
function DesktopView({
  books,
  shelves,
  search,
  setSearch,
  updateBook,
  deleteBook,
}) {
  const [editingShelf, setEditingShelf] = useState(null);
  const [tempShelf, setTempShelf] = useState("");

  return (
    <>
      <section>
        <input
          placeholder="検索（タイトル・ISBN・著者・本棚番号）"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, 160px)",
          gap: 16,
          marginTop: 16,
        }}
      >
        {books.map((b) => (
          <div
            key={b.isbn}
            style={{ border: "1px solid #ccc", padding: 8 }}
          >
            {b.cover && (
              <img
                src={b.cover}
                alt={b.title}
                style={{
                  width: "100%",
                  height: 220,
                  objectFit: "cover",
                }}
              />
            )}

            <div style={{ fontWeight: "bold", marginTop: 4 }}>
              {b.title}
            </div>

            <div style={{ fontSize: 12, color: "#555" }}>
              本棚番号：{b.shelf_no || "未設定"}
            </div>

            {editingShelf === b.isbn ? (
              <>
                <input
                  placeholder="新しい本棚番号"
                  value={tempShelf}
                  onChange={(e) => setTempShelf(e.target.value)}
                  style={{ width: "100%", marginTop: 6 }}
                />

                <button
                  onClick={() => {
                    updateBook(b.isbn, { shelf_no: tempShelf });
                    setEditingShelf(null);
                  }}
                  style={{ marginTop: 4, width: "100%" }}
                >
                  保存
                </button>

                <button
                  onClick={() => setEditingShelf(null)}
                  style={{ marginTop: 2, width: "100%" }}
                >
                  キャンセル
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setEditingShelf(b.isbn);
                  setTempShelf(b.shelf_no || "");
                }}
                style={{ marginTop: 6, width: "100%" }}
              >
                本棚変更
              </button>
            )}

            <button
              onClick={() => deleteBook(b.isbn)}
              style={{ marginTop: 6, width: "100%" }}
            >
              削除
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
