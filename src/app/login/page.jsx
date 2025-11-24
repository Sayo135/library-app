"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password === process.env.NEXT_PUBLIC_SITE_PASSWORD) {
      sessionStorage.setItem("loggedIn", "true");
      router.push("/"); // トップページへ遷移
    } else {
      setError("パスワードが間違っています");
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: "20vh" }}>
      <form onSubmit={handleSubmit}>
        <h2>ログイン</h2>
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">ログイン</button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>
    </div>
  );
}
