import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Sparkles, AlertCircle } from "lucide-react";

interface WebcamScannerProps {
  onCapture: (base64Image: string) => void;
  onBack: () => void;
}

const SIMULATED_FOOD_DATA: Record<string, { base64Mock: string; confidence: number; isFood: boolean }> = {
  "Sate Ayam": {
    confidence: 0.94,
    isFood: true,
    base64Mock: "https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=400&q=80",
  },
  "Nasi Goreng": {
    confidence: 0.97,
    isFood: true,
    base64Mock: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=400&q=80",
  },
  "Rendang Sapi": {
    confidence: 0.96,
    isFood: true,
    base64Mock: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=400&q=80",
  },
  "Soto Ayam": {
    confidence: 0.92,
    isFood: true,
    base64Mock: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=400&q=80",
  },
  "Mie Aceh": {
    confidence: 0.95,
    isFood: true,
    base64Mock: "https://images.unsplash.com/photo-1574894709920-11b28e7367e3?auto=format&fit=crop&w=400&q=80",
  },
  "Bukan Makanan": {
    confidence: 0.99,
    isFood: false,
    base64Mock: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=400&q=80",
  },
};

export const WebcamScanner: React.FC<WebcamScannerProps> = ({
  onCapture,
  onBack,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permissionState, setPermissionState] = useState<"prompt" | "granted" | "denied">("prompt");
  const [errorMsg, setErrorMsg] = useState<string>("");
  
  // Fitur Segmented Control Mode seperti Flutter (live vs manual)
  const [activeMode, setActiveMode] = useState<"live" | "shutter">("live");
  const [simulatedFood, setSimulatedFood] = useState<string>("Sate Ayam");
  const [liveConf, setLiveConf] = useState<number>(0.94);

  const [autoDetectedFood, setAutoDetectedFood] = useState<string>("");
  const [autoDetectedConf, setAutoDetectedConf] = useState<number>(0);
  const [autoIsFood, setAutoIsFood] = useState<boolean>(true);
  const [isAnalyzingLive, setIsAnalyzingLive] = useState<boolean>(false);

  const startCamera = async () => {
    try {
      setErrorMsg("");
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
      setPermissionState("granted");
    } catch (err: any) {
      console.warn("Camera access failed, fallback to interactive simulator:", err);
      // Demi kenyamanan pengujian di browser preview AI Studio, fallback otomatis ke "granted" dengan preview visual simulasi interaktif
      setPermissionState("granted");
      setErrorMsg("Berjalan dalam Mode Simulator (Webcam tidak terdeteksi atau diblokir browser)");
    }
  };

  useEffect(() => {
    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Pasangkan stream ke elemen video setelah komponen di-render dan elemen video tersedia
  useEffect(() => {
    if (permissionState === "granted" && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [permissionState]);

  // Update real-time confidence float subtle animation
  useEffect(() => {
    const timer = setInterval(() => {
      const baseConf = SIMULATED_FOOD_DATA[simulatedFood]?.confidence || 0.95;
      const variation = (Math.sin(Date.now() / 600) * 0.015);
      setLiveConf(Math.min(1.0, Math.max(0.7, baseConf + variation)));
    }, 300);
    return () => clearInterval(timer);
  }, [simulatedFood]);

  // Real-Time Automatic Object Detection Loop using Gemini API
  useEffect(() => {
    // Only run if activeMode is 'live' and we have a working camera stream (no errorMsg)
    if (activeMode !== "live" || !!errorMsg) {
      return;
    }

    let isMounted = true;
    const intervalId = setInterval(async () => {
      if (!videoRef.current || !streamRef.current || isAnalyzingLive) {
        return;
      }

      const video = videoRef.current;
      // Skip if video is not ready
      if (video.readyState < 2) {
        return;
      }

      try {
        setIsAnalyzingLive(true);
        const canvas = document.createElement("canvas");
        // Keep classification frame size small for rapid network transmission
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const base64Frame = canvas.toDataURL("image/jpeg", 0.7);

          const res = await fetch("/api/classify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ image: base64Frame }),
          });

          if (res.ok && isMounted) {
            const data = await res.json();
            if (data.name) {
              setAutoDetectedFood(data.name);
              setAutoDetectedConf(data.confidence);
              setAutoIsFood(data.isFood !== undefined ? data.isFood : true);
            }
          }
        }
      } catch (err) {
        console.warn("Background auto-classification failed:", err);
      } finally {
        if (isMounted) {
          setIsAnalyzingLive(false);
        }
      }
    }, 3500); // scan every 3.5 seconds

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [activeMode, errorMsg, isAnalyzingLive]);

  const handleCapture = () => {
    // Jika kamera hardware aktif, ambil gambar frame nyata dari video stream
    if (videoRef.current && streamRef.current && !errorMsg) {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        onCapture(dataUrl);
        return;
      }
    }

    // Fallback: gunakan mock image berbasis dropdown simulasi agar proses scan API bekerja tanpa kamera fisik
    const foodConfig = SIMULATED_FOOD_DATA[simulatedFood];
    if (foodConfig) {
      // Mengubah URL gambar mockup menjadi dataUrl atau melemparkan string langsung yang didukung app.tsx
      onCapture(foodConfig.base64Mock);
    }
  };

  const isNonFood = errorMsg 
    ? simulatedFood === "Bukan Makanan" 
    : (autoDetectedFood ? !autoIsFood : false);

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col z-50 overflow-hidden text-white font-sans">
      
      {/* ── TOP HEADER ── */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-slate-950/80 via-slate-950/50 to-transparent flex items-center justify-between z-10">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="p-2 text-white hover:bg-white/10 rounded-full transition-colors mr-3"
            aria-label="Kembali"
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-white font-black text-sm tracking-tight">Kamera Deteksi Cerdas</h1>
            <p className="text-[10px] text-slate-300">Detektor on-device ter-integrasi</p>
          </div>
        </div>

        {/* Status Indikator Mode Simulator */}
        {errorMsg && (
          <div className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold py-1 px-2.5 rounded-full flex items-center">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse mr-1.5"></span>
            Simulasi Aktif
          </div>
        )}
      </div>

      {/* ── VIEWPORT CONTAINER ── */}
      {permissionState === "granted" && (
        <div className="relative flex-1 flex items-center justify-center bg-black">
          
          {/* Real Live Video Feed atau Visual Mockup Simulator */}
          {(!errorMsg) ? (
            <video
              ref={(el) => {
                videoRef.current = el;
                if (el && streamRef.current && el.srcObject !== streamRef.current) {
                  el.srcObject = streamRef.current;
                }
              }}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            // Visual Simulator Elegan jika webcam terblokir di browser preview
            <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-6 text-center select-none">
              <div 
                className="absolute inset-0 bg-cover bg-center opacity-30 blur-xs transition-all duration-500"
                style={{ backgroundImage: `url('${SIMULATED_FOOD_DATA[simulatedFood]?.base64Mock}')` }}
              />
              <div className="relative z-10 max-w-sm mt-8">
                <div className="w-16 h-16 bg-sky-500/10 border border-sky-400/20 text-sky-400 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-bounce">
                  <Camera size={28} />
                </div>
                <p className="text-xs text-slate-300 leading-relaxed px-4">
                  Menggunakan visual simulasi untuk browser. Gunakan kontrol dropdown di bawah untuk beralih target deteksi secara real-time.
                </p>
              </div>
            </div>
          )}

          {/* Efek Garis Pemindai (Scanline Laser) yang bergerak pada mode Live */}
          {activeMode === "live" && (
            <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-sky-400 to-transparent shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse" 
                 style={{
                   animationDuration: '2.2s',
                   top: '40%',
                   animation: 'scanEffect 4s ease-in-out infinite'
                 }}
            />
          )}

          {/* ── RETICLE OVERLAY (Sleek Anti-Slop Visual Reticle) ── */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`w-[260px] h-[260px] border-2 rounded-[28px] relative flex items-center justify-center transition-colors duration-300 ${
              activeMode !== "live" 
                ? "border-white/30" 
                : isNonFood 
                  ? "border-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.2)]" 
                  : "border-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
            }`}>
              {/* Corner brackets */}
              <div className={`absolute top-4 left-4 w-5 h-5 border-t-3 border-l-3 transition-colors ${activeMode === 'live' ? (isNonFood ? 'border-red-400' : 'border-emerald-400') : 'border-white/50'}`}></div>
              <div className={`absolute top-4 right-4 w-5 h-5 border-t-3 border-r-3 transition-colors ${activeMode === 'live' ? (isNonFood ? 'border-red-400' : 'border-emerald-400') : 'border-white/50'}`}></div>
              <div className={`absolute bottom-4 left-4 w-5 h-5 border-b-3 border-l-3 transition-colors ${activeMode === 'live' ? (isNonFood ? 'border-red-400' : 'border-emerald-400') : 'border-white/50'}`}></div>
              <div className={`absolute bottom-4 right-4 w-5 h-5 border-b-3 border-r-3 transition-colors ${activeMode === 'live' ? (isNonFood ? 'border-red-400' : 'border-emerald-400') : 'border-white/50'}`}></div>

              {/* Pulsing Dot */}
              {activeMode === "live" && (
                <div className={`w-3 h-3 rounded-full absolute transition-colors ${isNonFood ? 'bg-red-400' : 'bg-emerald-400'} animate-ping opacity-75`} />
              )}
            </div>
          </div>

          {/* ── LIVE INTERACTIVE DETECTION PANEL (Real-Time AI Overlay) ── */}
          {activeMode === "live" && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[90%] max-w-xs pointer-events-auto z-20">
              <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between shadow-2xl transition-all">
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isNonFood ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                    {isAnalyzingLive ? (
                      <div className={`w-5 h-5 border-2 ${isNonFood ? 'border-red-400' : 'border-emerald-400'} border-t-transparent rounded-full animate-spin`} />
                    ) : isNonFood ? (
                      <AlertCircle size={20} />
                    ) : (
                      <Sparkles size={18} className="animate-pulse" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                      {isAnalyzingLive ? "Menganalisis..." : "Terdeteksi (Real-time)"}
                    </span>
                    <h3 className="text-sm font-black text-white truncate">
                      {errorMsg ? simulatedFood : (autoDetectedFood || "Mengarahkan kamera...")}
                    </h3>
                  </div>
                </div>
                <div className="text-right shrink-0 pl-3">
                  <span className={`text-xs font-black ${isNonFood ? "text-red-400" : "text-emerald-400"}`}>
                    {errorMsg 
                      ? (liveConf * 100).toFixed(1) 
                      : autoDetectedConf > 0 
                        ? (autoDetectedConf * 100).toFixed(1) 
                        : "0.0"}%
                  </span>
                  <p className="text-[8px] text-slate-400">akurasi</p>
                </div>
              </div>
            </div>
          )}

          {/* ── CONTROL DASHBOARD (SWITCHER & TRIGGER BUTTONS) ── */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent flex flex-col items-center z-10">
            
            {/* 1. Mode Switcher (Pill Segmented Control) */}
            <div className="bg-slate-900 border border-slate-800/80 p-0.5 rounded-full flex items-center mb-5 max-w-xs w-full">
              <button
                onClick={() => setActiveMode("live")}
                className={`flex-1 py-1.5 px-3 text-xs font-black rounded-full transition-all flex items-center justify-center space-x-1.5 ${
                  activeMode === "live"
                    ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${activeMode === 'live' ? 'bg-white' : 'bg-slate-400'} animate-pulse`}></span>
                <span>Live Deteksi</span>
              </button>
              <button
                onClick={() => setActiveMode("shutter")}
                className={`flex-1 py-1.5 px-3 text-xs font-black rounded-full transition-all flex items-center justify-center space-x-1.5 ${
                  activeMode === "shutter"
                    ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Camera size={13} />
                <span>Shutter Manual</span>
              </button>
            </div>

            {/* 2. Live Simulator Dropdown - agar interaktif langsung di browser preview */}
            {activeMode === "live" && (
              <div className="w-full max-w-xs bg-slate-900/60 border border-slate-800/60 rounded-xl px-3 py-1.5 mb-5 flex items-center justify-between">
                <span className="text-[10px] text-slate-300 font-bold">Simulasi Hidangan:</span>
                <select
                  value={simulatedFood}
                  onChange={(e) => setSimulatedFood(e.target.value)}
                  className="bg-transparent border-none text-[11px] font-black text-sky-400 focus:outline-none cursor-pointer"
                >
                  {Object.keys(SIMULATED_FOOD_DATA).map((food) => (
                    <option key={food} value={food} className="bg-slate-900 text-white font-medium">
                      {food}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 3. Action Button Trigger */}
            <div className="w-full flex justify-center items-center">
              {activeMode === "live" ? (
                // Tombol Konfirmasi Cepat untuk mode Live
                <button
                  onClick={handleCapture}
                  className="w-full max-w-xs py-3.5 bg-sky-500 hover:bg-sky-600 text-white font-black text-xs rounded-xl transition-all shadow-lg active:scale-98 flex items-center justify-center space-x-2"
                >
                  <Sparkles size={16} />
                  <span>Ambil & Analisis "{errorMsg ? simulatedFood : (autoDetectedFood || "Hidangan")}"</span>
                </button>
              ) : (
                // Tombol Ambil Foto Shutter manual tradisional
                <button
                  onClick={handleCapture}
                  className="w-20 h-20 bg-white border-4 border-white/45 rounded-full p-1 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                  title="Ambil Foto"
                >
                  <div className="w-full h-full bg-white rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors">
                    <Camera size={34} className="text-slate-900" />
                  </div>
                </button>
              )}
            </div>

            {/* Penjelasan Pendukung di bawah tombol */}
            <p className="text-[9px] text-slate-400 text-center mt-4 max-w-xs leading-relaxed">
              {activeMode === "live"
                ? "Teknologi deteksi pintar mendeteksi secara konstan tanpa tombol rana. Ketuk Ambil & Analisis untuk rincian nutrisi."
                : "Arahkan hidangan, pastikan cahaya cukup, lalu tekan tombol shutter putih untuk memotret."}
            </p>

          </div>
        </div>
      )}

      {/* ── PERSISTENT CSS STYLES FOR THE ANIMATED SCAN LASER LINE ── */}
      <style>{`
        @keyframes scanEffect {
          0% { top: 20%; opacity: 0.3; }
          50% { top: 75%; opacity: 1; }
          100% { top: 20%; opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};
