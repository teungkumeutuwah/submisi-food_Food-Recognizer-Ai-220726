import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Info, ShieldAlert } from "lucide-react";

interface WebcamScannerProps {
  onCapture: (base64Image: string) => void;
  onBack: () => void;
}

export const WebcamScanner: React.FC<WebcamScannerProps> = ({
  onCapture,
  onBack,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permissionState, setPermissionState] = useState<"prompt" | "granted" | "denied">("prompt");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const startCamera = async () => {
    try {
      setErrorMsg("");
      // Request rear camera if available, otherwise fallback to default video device
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setPermissionState("granted");
    } catch (err: any) {
      console.error("Camera access error:", err);
      setPermissionState("denied");
      setErrorMsg(
        err.message ||
          "Aplikasi memerlukan akses kamera untuk mengidentifikasi makanan secara langsung."
      );
    }
  };

  useEffect(() => {
    startCamera();

    return () => {
      // Stop webcam on component unmount to release camera hardware
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleCapture = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Mirror if it's user facing (though ideal was environment, user may use front camera)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      onCapture(dataUrl);
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50 overflow-hidden">
      {/* Top Header */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent flex items-center z-10">
        <button
          onClick={onBack}
          className="p-2 text-white hover:bg-white/15 rounded-full transition-colors mr-3"
          aria-label="Kembali"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-white font-bold text-lg">Pindai Real-Time</h1>
      </div>

      {permissionState === "granted" && (
        <div className="relative flex-1 flex items-center justify-center">
          {/* Live Video Feed */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* Reticle Overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[240px] h-[240px] border-2 border-white/80 rounded-[24px] relative flex items-center justify-center">
              {/* Corner crosshairs */}
              <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-sky-400"></div>
              <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-sky-400"></div>
              <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-sky-400"></div>
              <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-sky-400"></div>

              {/* Center Dot */}
              <div className="w-2.5 h-2.5 bg-white/80 rounded-full animate-ping"></div>
              <div className="w-2 h-2 bg-white/80 rounded-full absolute"></div>
            </div>
          </div>

          {/* Guidance Card at top */}
          <div className="absolute top-18 left-1/2 -translate-x-1/2 w-[90%] max-w-sm">
            <div className="bg-black/60 backdrop-blur-xs text-white text-[11px] font-medium py-2 px-4 rounded-xl flex items-center shadow-md">
              <Info size={16} className="text-white mr-2 shrink-0" />
              <span>Arahkan makanan ke tengah bingkai lalu ketuk tombol ambil</span>
            </div>
          </div>

          {/* Shutter capture button at the bottom */}
          <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center">
            <button
              onClick={handleCapture}
              className="w-20 h-20 bg-white border-4 border-white/50 rounded-full p-1 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              title="Ambil Foto"
            >
              <div className="w-full h-full bg-white rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
                <Camera size={36} className="text-black" />
              </div>
            </button>
          </div>
        </div>
      )}

      {permissionState === "denied" && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-white bg-gray-950">
          <ShieldAlert size={72} className="text-gray-500 mb-6" />
          <h2 className="text-xl font-bold mb-2">Izin Kamera Diperlukan</h2>
          <p className="text-sm text-gray-400 max-w-xs mb-8">
            {errorMsg ||
              "Aplikasi memerlukan akses kamera untuk mengidentifikasi makanan secara langsung (real-time stream)."}
          </p>
          <button
            onClick={startCamera}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-colors shadow-lg active:scale-98"
          >
            Izinkan Akses Kamera
          </button>
          <button
            onClick={onBack}
            className="mt-4 px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-colors active:scale-98"
          >
            Gunakan Unggah File / Galeri
          </button>
        </div>
      )}

      {permissionState === "prompt" && (
        <div className="flex-1 flex items-center justify-center bg-black">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-white text-sm mt-4 font-medium">Memulai kamera...</span>
          </div>
        </div>
      )}
    </div>
  );
};
