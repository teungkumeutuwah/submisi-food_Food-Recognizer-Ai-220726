import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Sparkles, AlertCircle, Upload, Image as ImageIcon, Volume2, VolumeX } from "lucide-react";

interface WebcamScannerProps {
  onCapture: (base64Image: string) => void;
  onBack: () => void;
}

const PRESET_SAMPLES = [
  {
    name: "Sate Ayam",
    url: "https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=400&q=80",
    isFood: true,
  },
  {
    name: "Nasi Goreng",
    url: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=400&q=80",
    isFood: true,
  },
  {
    name: "Rendang Sapi",
    url: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=400&q=80",
    isFood: true,
  },
  {
    name: "Mie Aceh",
    url: "https://images.unsplash.com/photo-1574894709920-11b28e7367e3?auto=format&fit=crop&w=400&q=80",
    isFood: true,
  },
  {
    name: "Kopi Susu",
    url: "https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&w=400&q=80",
    isFood: true,
  },
  {
    name: "Laptop",
    url: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=400&q=80",
    isFood: false,
  }
];

// Helper to convert an image URL to Base64 using canvas
const imageUrlToBase64 = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(img.width, 512);
      canvas.height = Math.min(img.height, 512);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      } else {
        reject(new Error("Failed to get canvas 2D context"));
      }
    };
    img.onerror = (e) => reject(e);
    img.src = url;
  });
};

// Helper to play a subtle camera shutter sound effect dynamically using Web Audio API
const playShutterSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    
    // 1. Shutter "click" - high frequency white noise burst
    const bufferSize = audioCtx.sampleRate * 0.08; // 80ms
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const bandpass = audioCtx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(1200, audioCtx.currentTime);
    bandpass.Q.setValueAtTime(4, audioCtx.currentTime);
    
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.12, audioCtx.currentTime); // Subtle volume
    noiseGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.07);
    
    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    
    // 2. High-pitch mechanical spring tone
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(1800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, audioCtx.currentTime + 0.04);
    
    oscGain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.04);
    
    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);
    
    // 3. Low-pitch hollow body closing clack (starts at 30ms)
    const closeOsc = audioCtx.createOscillator();
    const closeGain = audioCtx.createGain();
    
    closeOsc.type = "triangle";
    closeOsc.frequency.setValueAtTime(450, audioCtx.currentTime + 0.03);
    closeOsc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.08);
    
    closeGain.gain.setValueAtTime(0, audioCtx.currentTime);
    closeGain.gain.setValueAtTime(0.15, audioCtx.currentTime + 0.03);
    closeGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
    
    closeOsc.connect(closeGain);
    closeGain.connect(audioCtx.destination);
    
    // Start all
    noise.start(audioCtx.currentTime);
    osc.start(audioCtx.currentTime);
    closeOsc.start(audioCtx.currentTime + 0.03);
    
    // Stop all
    noise.stop(audioCtx.currentTime + 0.08);
    osc.stop(audioCtx.currentTime + 0.04);
    closeOsc.stop(audioCtx.currentTime + 0.09);
  } catch (err) {
    console.log("Web Audio API not supported or interaction missing:", err);
  }
};

// Helper to speak the given text in Indonesian using Web Speech Synthesis API
const speakText = (text: string) => {
  try {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // Stop any pending speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.rate = 1.05; // Slightly rapid and natural
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Speech synthesis failed:", err);
  }
};

export const WebcamScanner: React.FC<WebcamScannerProps> = ({
  onCapture,
  onBack,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isAnalyzingRef = useRef<boolean>(false);
  
  const [permissionState, setPermissionState] = useState<"prompt" | "granted" | "denied">("prompt");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [activeMode, setActiveMode] = useState<"live" | "shutter">("live");
  
  // Scanned / Loaded image state (for simulator/upload mode - initialized empty for a clean state)
  const [activeImage, setActiveImage] = useState<string>("");
  const [activeImageBase64, setActiveImageBase64] = useState<string>("");
  const [selectedPresetName, setSelectedPresetName] = useState<string>("");

  // Automatic recognition states
  const [autoDetectedFood, setAutoDetectedFood] = useState<string>("Belum ada objek");
  const [autoDetectedConf, setAutoDetectedConf] = useState<number>(0);
  const [autoIsFood, setAutoIsFood] = useState<boolean>(true);
  const [isAnalyzingLive, setIsAnalyzingLive] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState<boolean>(true);
  const lastSpokenFoodRef = useRef<string>("");

  // Speak detected food when it changes
  useEffect(() => {
    if (!isVoiceEnabled) return;
    if (
      !autoDetectedFood ||
      autoDetectedFood === "Belum ada objek" ||
      autoDetectedFood === "Mengambil foto..." ||
      autoDetectedFood === "Mengunduh sampel..." ||
      autoDetectedFood.includes("Bidikan Simulasi")
    ) {
      return;
    }

    if (autoDetectedFood !== lastSpokenFoodRef.current) {
      lastSpokenFoodRef.current = autoDetectedFood;
      speakText(autoDetectedFood);
    }
  }, [autoDetectedFood, isVoiceEnabled]);

  const handleResetToCamera = () => {
    setActiveImage("");
    setActiveImageBase64("");
    setSelectedPresetName("");
    setAutoDetectedFood("Belum ada objek");
    setAutoDetectedConf(0);
    lastSpokenFoodRef.current = "";
  };

  // Initialize camera
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
      console.warn("Camera access blocked or not found. Entering elegant automatic simulation mode.", err);
      setPermissionState("granted");
      setErrorMsg("Kamera fisik tidak tersedia. Gunakan uploader atau pilih sampel objek untuk dipindai otomatis oleh Gemini AI.");
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

  // Assign stream to video element
  useEffect(() => {
    if (permissionState === "granted" && streamRef.current && videoRef.current && !errorMsg) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [permissionState, errorMsg]);

  // Real-Time Simulator Fluctuation Loop to make the simulator feel "live" and identical to a device
  useEffect(() => {
    if (activeMode !== "live" || !errorMsg || !activeImage) {
      return;
    }

    const intervalId = setInterval(() => {
      if (isAnalyzingLive || !autoDetectedFood || autoDetectedFood.includes("...")) {
        return;
      }
      // Fluctuate confidence score slightly to mimic a real-time active tracking scan
      setAutoDetectedConf((prev) => {
        const delta = (Math.random() * 0.04) - 0.02;
        const next = Math.max(0.85, Math.min(0.99, (prev || 0.95) + delta));
        return parseFloat(next.toFixed(3));
      });
    }, 2000);

    return () => clearInterval(intervalId);
  }, [activeMode, errorMsg, activeImage, isAnalyzingLive, autoDetectedFood]);

  // Real-Time Camera Classification Loop (only if camera is active and no errorMsg)
  useEffect(() => {
    if (activeMode !== "live" || !!errorMsg) {
      return;
    }

    let isMounted = true;
    const intervalId = setInterval(async () => {
      if (!videoRef.current || !streamRef.current || isAnalyzingRef.current) {
        return;
      }

      const video = videoRef.current;
      if (video.readyState < 2) {
        return;
      }

      try {
        isAnalyzingRef.current = true;
        setIsAnalyzingLive(true);
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const base64Frame = canvas.toDataURL("image/jpeg", 0.7);

          const res = await fetch("/api/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
        isAnalyzingRef.current = false;
        if (isMounted) {
          setIsAnalyzingLive(false);
        }
      }
    }, 3500);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [activeMode, errorMsg]);

  // Helper to trigger classification for a specific base64 frame
  const classifyBase64 = async (base64: string, presetName?: string) => {
    isAnalyzingRef.current = true;
    setIsAnalyzingLive(true);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, presetName }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.name) {
          setAutoDetectedFood(data.name);
          setAutoDetectedConf(data.confidence);
          setAutoIsFood(data.isFood !== undefined ? data.isFood : true);
        }
      }
    } catch (err) {
      console.error("Gemini automatic classification failed:", err);
    } finally {
      isAnalyzingRef.current = false;
      setIsAnalyzingLive(false);
    }
  };

  // Convert and classify Unsplash Preset
  const loadAndClassifyPreset = async (name: string, url: string) => {
    setSelectedPresetName(name);
    setActiveImage(url);
    
    if (activeMode !== "live") {
      // Manual Mode: Just load image and show ready status without automatic analysis!
      setAutoDetectedFood(`Bidikan Simulasi (${name})`);
      setAutoDetectedConf(0);
      setAutoIsFood(name !== "Laptop");
      try {
        const base64 = await imageUrlToBase64(url);
        setActiveImageBase64(base64);
      } catch (err) {
        console.log("Failed to preload preset base64:", err);
      }
      return;
    }

    setIsAnalyzingLive(true);
    setAutoDetectedFood("Mengunduh sampel...");
    
    try {
      const base64 = await imageUrlToBase64(url);
      setActiveImageBase64(base64);
      setAutoDetectedFood("Menganalisis objek...");
      await classifyBase64(base64, name);
    } catch (err) {
      console.log("Failed to load preset image:", err);
      // Fallback in case of network issues
      setAutoDetectedFood(name);
      setAutoDetectedConf(0.95);
      setAutoIsFood(name !== "Laptop");
      setIsAnalyzingLive(false);
    }
  };

  // Handle uploaded/dragged files
  const handleFileProcess = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Harap pilih file gambar saja!");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setActiveImage(base64);
      setActiveImageBase64(base64);
      setSelectedPresetName("");
      
      if (activeMode !== "live") {
        // Manual Mode: Do not trigger automatic classification!
        setAutoDetectedFood("Gambar Terunggah (Siap Jepret)");
        setAutoDetectedConf(0);
        setAutoIsFood(true);
        return;
      }

      setAutoDetectedFood("Membaca gambar...");
      await classifyBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  // Drag and drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileProcess(e.target.files[0]);
    }
  };

  // Capture current viewfinder image
  const handleCapture = () => {
    // Play subtle camera shutter click sound
    playShutterSound();

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
      }
    } else {
      // In simulator/upload mode, use the current base64 image
      if (activeImageBase64) {
        onCapture(activeImageBase64);
      } else {
        // Fallback to active image URL if base64 not yet generated
        imageUrlToBase64(activeImage)
          .then((b64) => onCapture(b64))
          .catch(() => onCapture(activeImage));
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col z-50 overflow-hidden text-white font-sans">
      
      {/* Hidden File Input accessible anywhere */}
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* ── TOP HEADER ── */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-slate-950/90 via-slate-950/40 to-transparent flex items-center justify-between z-20">
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
            <p className="text-[10px] text-slate-300">Sistem AI Penganalisis Objek & Gizi</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Voice/TTS Toggle Button */}
          <button
            onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
            className={`p-2 rounded-full border transition-all flex items-center justify-center cursor-pointer ${
              isVoiceEnabled
                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/35 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300"
            }`}
            title={isVoiceEnabled ? "Mute Suara Asisten" : "Aktifkan Suara Asisten"}
          >
            {isVoiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {errorMsg && (
            <div className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold py-1 px-2.5 rounded-full flex items-center">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse mr-1.5"></span>
              Scan Cerdas Aktif
            </div>
          )}
        </div>
      </div>

      {/* ── VIEWPORT CONTAINER ── */}
      <div className="relative flex-grow flex items-center justify-center bg-black overflow-hidden mt-14 mb-[280px]">
        
        {/* Real Live Video Feed */}
        {!errorMsg ? (
          <div className="relative w-full h-full">
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
            {/* If activeImage is chosen/uploaded as an overlay */}
            {activeImage && (
              <div className="absolute inset-0 bg-slate-950 z-10 flex items-center justify-center">
                <img src={activeImage} className="w-full h-full object-cover" alt="Selected Preview" referrerPolicy="no-referrer" />
                <button
                  onClick={handleResetToCamera}
                  className="absolute top-4 right-4 bg-black/70 hover:bg-black/90 text-white rounded-full px-3 py-1.5 flex items-center justify-center transition-colors border border-white/20 shadow-lg cursor-pointer"
                >
                  <Camera size={14} className="mr-1.5" />
                  <span className="text-[10px] font-black">Kembali ke Kamera</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          // Visual Simulator dengan Uploader & Dropzone Area
          <div 
            className={`absolute inset-0 bg-slate-900 transition-all duration-300 flex flex-col items-center justify-center p-6 text-center select-none ${
              dragActive ? "bg-sky-950/90 border-4 border-dashed border-sky-400" : ""
            }`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {activeImage ? (
              <div 
                className="absolute inset-0 bg-cover bg-center opacity-80 transition-all duration-500"
                style={{ backgroundImage: `url('${activeImage}')` }}
              />
            ) : (
              <div className="relative z-10 max-w-sm">
                <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-400/30 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-bounce">
                  <Upload size={24} />
                </div>
                <h4 className="text-xs font-extrabold text-white mb-1">
                  Pilih Sampel Objek / Klik untuk Unggah Foto
                </h4>
                <p className="text-[10px] text-slate-400 leading-relaxed px-4 max-w-xs mx-auto">
                  Ketuk salah satu pilihan sampel di bagian bawah, atau unggah foto dari galeri Anda untuk disimulasikan secara instan.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Efek Garis Pemindai (Scanline Laser) - Hanya tampil jika mode Live aktif */}
        {activeMode === "live" && activeImage !== "" && (
          <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_10px_rgba(16,185,129,0.8)] pointer-events-none z-10" 
               style={{
                 animation: 'scanEffect 3s ease-in-out infinite'
               }}
          />
        )}

        {/* ── RETICLE OVERLAY (Sleek Visual Reticle) ── */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className={`w-[240px] h-[240px] border rounded-[32px] relative flex items-center justify-center transition-all duration-300 ${
            activeMode === "shutter"
              ? "border-white/40 shadow-[0_0_15px_rgba(255,255,255,0.05)] border-dashed"
              : isAnalyzingLive 
                ? "border-sky-500/80 shadow-[0_0_15px_rgba(56,189,248,0.3)] border-2" 
                : !autoIsFood && autoDetectedFood !== "Mengambil foto..." && autoDetectedFood !== "Belum ada objek"
                  ? "border-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.3)] border-2" 
                  : "border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.3)] border-2"
          }`}>
            {/* Corner brackets */}
            <div className={`absolute top-4 left-4 w-5 h-5 border-t-2 border-l-2 transition-colors ${activeMode === 'shutter' ? 'border-white/60' : isAnalyzingLive ? 'border-sky-400' : (!autoIsFood && autoDetectedFood !== "Belum ada objek" ? 'border-amber-400' : 'border-emerald-400')}`}></div>
            <div className={`absolute top-4 right-4 w-5 h-5 border-t-2 border-r-2 transition-colors ${activeMode === 'shutter' ? 'border-white/60' : isAnalyzingLive ? 'border-sky-400' : (!autoIsFood && autoDetectedFood !== "Belum ada objek" ? 'border-amber-400' : 'border-emerald-400')}`}></div>
            <div className={`absolute bottom-4 left-4 w-5 h-5 border-b-2 border-l-2 transition-colors ${activeMode === 'shutter' ? 'border-white/60' : isAnalyzingLive ? 'border-sky-400' : (!autoIsFood && autoDetectedFood !== "Belum ada objek" ? 'border-amber-400' : 'border-emerald-400')}`}></div>
            <div className={`absolute bottom-4 right-4 w-5 h-5 border-b-2 border-r-2 transition-colors ${activeMode === 'shutter' ? 'border-white/60' : isAnalyzingLive ? 'border-sky-400' : (!autoIsFood && autoDetectedFood !== "Belum ada objek" ? 'border-amber-400' : 'border-emerald-400')}`}></div>

            {/* Pulsing Dot */}
            {activeMode === "live" && activeImage !== "" && (
              <div className={`w-3 h-3 rounded-full absolute transition-colors ${isAnalyzingLive ? 'bg-sky-400' : (!autoIsFood ? 'bg-amber-400' : 'bg-emerald-400')} animate-ping opacity-70`} />
            )}
          </div>
        </div>

        {/* ── LIVE INTERACTIVE DETECTION PANEL (AI Overlay) ── */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[92%] max-w-sm pointer-events-auto z-20">
          {activeMode === "live" ? (
            <div className="bg-slate-950/90 backdrop-blur-md border border-slate-800/80 p-3 rounded-xl flex items-center justify-between shadow-2xl transition-all">
              <div className="flex items-center space-x-3 min-w-0 flex-1">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  isAnalyzingLive 
                    ? "bg-sky-500/10 text-sky-400" 
                    : !autoIsFood && autoDetectedFood !== "Belum ada objek"
                      ? "bg-amber-500/10 text-amber-400" 
                      : "bg-emerald-500/10 text-emerald-400"
                }`}>
                  {isAnalyzingLive ? (
                    <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                  ) : !autoIsFood && autoDetectedFood !== "Belum ada objek" ? (
                    <AlertCircle size={18} />
                  ) : (
                    <Sparkles size={16} className="animate-pulse" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[8px] uppercase tracking-wider text-slate-400 font-extrabold block">
                    {isAnalyzingLive ? "Menganalisis Gemini AI..." : "Terdeteksi secara Otomatis"}
                  </span>
                  <h3 className="text-xs font-black text-white truncate">
                    {autoDetectedFood}
                  </h3>
                  {!autoIsFood && !isAnalyzingLive && autoDetectedFood !== "Belum ada objek" && (
                    <span className="text-[8px] text-amber-300 font-bold block bg-amber-500/10 py-0.5 px-1.5 rounded w-max mt-0.5">
                      Objek Non-Makanan
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0 pl-3">
                <span className={`text-xs font-black ${
                  isAnalyzingLive 
                    ? "text-sky-400" 
                    : !autoIsFood && autoDetectedFood !== "Belum ada objek"
                      ? "text-amber-400" 
                      : "text-emerald-400"
                }`}>
                  {autoDetectedFood === "Belum ada objek" ? "0%" : `${(autoDetectedConf * 100).toFixed(0)}%`}
                </span>
                <p className="text-[8px] text-slate-400">akurasi</p>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/90 backdrop-blur-md border border-slate-800/80 p-3 rounded-xl flex items-center justify-between shadow-2xl transition-all">
              <div className="flex items-center space-x-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-lg bg-slate-900 text-slate-400 flex items-center justify-center shrink-0">
                  <Camera size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[8px] uppercase tracking-wider text-slate-400 font-extrabold block">
                    Mode Shutter Manual
                  </span>
                  <h3 className="text-xs font-black text-white truncate">
                    {activeImage ? "Siap Mengambil Gambar" : "Posisikan hidangan dalam bingkai"}
                  </h3>
                </div>
              </div>
              <div className="text-right shrink-0 pl-3">
                <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 py-0.5 px-1.5 rounded-md">
                  READY
                </span>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── BOTTOM CONTROL DASHBOARD ── */}
      <div className="absolute bottom-0 left-0 right-0 h-[280px] bg-gradient-to-t from-slate-950 via-slate-950 to-slate-950/95 border-t border-slate-900 p-4 flex flex-col justify-between z-20">
        
        {/* Mode Switcher AND Presets/Upload Area */}
        <div className="w-full flex flex-col">
          {/* Mode Switcher is ALWAYS rendered first! */}
          <div className="bg-slate-900 border border-slate-800 p-0.5 rounded-full flex items-center w-full max-w-xs mx-auto mb-3">
            <button
              onClick={() => {
                setActiveMode("live");
                if (!activeImage && PRESET_SAMPLES.length > 0 && errorMsg) {
                  loadAndClassifyPreset(PRESET_SAMPLES[0].name, PRESET_SAMPLES[0].url);
                }
              }}
              className={`flex-1 py-1.5 px-3 text-[10px] font-black rounded-full transition-all flex items-center justify-center space-x-1.5 ${
                activeMode === "live"
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeMode === 'live' ? 'bg-white' : 'bg-slate-400'} animate-pulse`}></span>
              <span>Live Deteksi</span>
            </button>
            <button
              onClick={() => setActiveMode("shutter")}
              className={`flex-1 py-1.5 px-3 text-[10px] font-black rounded-full transition-all flex items-center justify-center space-x-1.5 ${
                activeMode === "shutter"
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Camera size={12} />
              <span>Shutter Manual</span>
            </button>
          </div>

          {/* Preset Samples & Gallery Upload for Simulator Mode */}
          {errorMsg && (
            <div className="w-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Uji Coba Objek Simulasi:
                </span>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] text-sky-400 font-black hover:underline flex items-center space-x-1"
                >
                  <Upload size={10} />
                  <span>Unggah Foto Sendiri</span>
                </button>
              </div>
              
              {/* Horizontal scrolling preset cards */}
              <div className="flex space-x-2.5 overflow-x-auto pb-2 scrollbar-none">
                {PRESET_SAMPLES.map((preset) => {
                  const isSelected = selectedPresetName === preset.name;
                  return (
                    <button
                      key={preset.name}
                      onClick={() => loadAndClassifyPreset(preset.name, preset.url)}
                      className={`flex items-center space-x-2 p-1.5 px-3 rounded-lg border shrink-0 transition-all ${
                        isSelected
                          ? "bg-emerald-500/10 border-emerald-500 text-white shadow-md shadow-emerald-500/5"
                          : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <div className="w-6 h-6 rounded-md overflow-hidden bg-slate-800 shrink-0">
                        <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-[10px] font-bold">{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Trigger Button Area */}
        <div className="w-full flex flex-col items-center">
          
          <div className="w-full flex items-center justify-between px-6 max-w-sm mb-3">
            {/* Left: Gallery Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-12 h-12 rounded-full bg-slate-900/80 border border-slate-800 text-slate-200 flex flex-col items-center justify-center hover:bg-slate-800 active:scale-90 transition-all cursor-pointer shadow-lg"
              title="Ambil dari Galeri"
            >
              <ImageIcon size={20} />
              <span className="text-[7px] font-bold mt-0.5 text-slate-400">Galeri</span>
            </button>

            {/* Center: Large Shutter Button (Jepret) */}
            <button
              onClick={handleCapture}
              disabled={!activeImage && !!errorMsg}
              className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all cursor-pointer border-4 ${
                !activeImage && errorMsg
                  ? "border-slate-800 bg-slate-900 text-slate-500 cursor-not-allowed"
                  : activeMode === "live"
                    ? "border-emerald-500/50 bg-emerald-500 hover:bg-emerald-600 active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                    : "border-white/50 bg-white hover:bg-slate-100 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
              }`}
              title={activeMode === "live" ? "Jepret & Analisis Cerdas" : "Jepret Foto Manual"}
            >
              {activeMode === "live" ? (
                <Sparkles size={26} className="text-white animate-pulse" />
              ) : (
                <Camera size={26} className="text-slate-950" />
              )}
            </button>

            {/* Right: Quick Back Button */}
            <button
              onClick={onBack}
              className="w-12 h-12 rounded-full bg-slate-900/80 border border-slate-800 text-slate-200 flex flex-col items-center justify-center hover:bg-slate-800 active:scale-90 transition-all cursor-pointer shadow-lg"
              title="Kembali ke Dashboard"
            >
              <ArrowLeft size={20} />
              <span className="text-[7px] font-bold mt-0.5 text-slate-400">Kembali</span>
            </button>
          </div>

          <span className="text-[10px] font-black tracking-wider text-slate-300 block mb-1">
            {activeMode === "live" 
              ? (autoDetectedFood !== "Belum ada objek" ? `Jepret: ${autoDetectedFood}` : "Jepret & Analisis Cerdas") 
              : "Jepret Foto Manual"}
          </span>
          
          <p className="text-[8px] text-slate-400 text-center leading-relaxed max-w-xs px-2">
            {errorMsg 
              ? activeMode === "live"
                ? "Mode Simulasi Real-Time: Pilih sampel makanan di atas atau klik Galeri untuk unggah dan pindaian otomatis oleh Gemini AI."
                : "Mode Simulasi Manual: Pilih sampel makanan di atas lalu ketuk tombol jepret di tengah untuk memproses secara manual."
              : activeMode === "live"
                ? "Arahkan kamera ke hidangan. AI mengenali makanan secara otomatis secara real-time. Ketuk tombol Jepret Cerdas di tengah untuk analisis gizi."
                : "Arahkan kamera ke hidangan. Cukup bidik objek dalam bingkai, lalu ketuk tombol Jepret Putih di tengah untuk mengambil gambar dan menganalisis."}
          </p>
        </div>

      </div>

      {/* ── PERSISTENT CSS STYLES FOR THE ANIMATED SCAN LASER LINE ── */}
      <style>{`
        @keyframes scanEffect {
          0% { top: 10%; opacity: 0.2; }
          50% { top: 90%; opacity: 1; }
          100% { top: 10%; opacity: 0.2; }
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};
