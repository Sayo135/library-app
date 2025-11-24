import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: "本スキャナー",
  description: "Supabase 連携",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body className={inter.variable}>
        {children}
      </body>
    </html>
  );
}
