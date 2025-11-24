"use client";
import { useEffect, useRef } from "react";

export default function CameraTest() {
  const videoRef = useRef(null);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: "environment" } },
          audio: false
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        console.error(e);
        alert("カメラの起動に失敗しました: " + e.message);
      }
    }
    startCamera();
  }, []);

  return <video ref={videoRef} playsInline autoPlay muted style={{ width: "100%" }} />;
}
