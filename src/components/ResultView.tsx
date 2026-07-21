import React, { useState, useEffect } from "react";
import { ArrowLeft, Check, Leaf, AlertCircle, UtensilsCrossed, MapPin, Activity, ShieldCheck, Star, Volume2, VolumeX } from "lucide-react";
import { ScannedFood } from "../types";
import { MacroCard } from "./MacroCard";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

interface ResultViewProps {
  foodItem: ScannedFood | null;
  loading: boolean;
  error: string;
  onBack: () => void;
}

export const ResultView: React.FC<ResultViewProps> = ({
  foodItem,
  loading,
  error,
  onBack,
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [healthTips, setHealthTips] = useState<string[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);

  useEffect(() => {
    if (!foodItem) {
      setHealthTips([]);
      return;
    }

    if (foodItem.healthTips && foodItem.healthTips.length > 0) {
      setHealthTips(foodItem.healthTips);
      return;
    }

    const fetchTips = async () => {
      setTipsLoading(true);
      try {
        const response = await fetch("/api/health-tips", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: foodItem.name,
            calories: foodItem.calories,
            carbs: foodItem.carbs,
            fat: foodItem.fat,
            protein: foodItem.protein,
            fiber: foodItem.fiber,
            healthAnalysis: foodItem.healthAnalysis,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.healthTips) {
            setHealthTips(data.healthTips);
          }
        }
      } catch (err) {
        console.error("Gagal mengambil tips kesehatan:", err);
      } finally {
        setTipsLoading(false);
      }
    };

    fetchTips();
  }, [foodItem]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleToggleSpeech = () => {
    if (!foodItem || typeof window === "undefined" || !window.speechSynthesis) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const originText = foodItem.origin ? `Makanan ini khas berasal dari ${foodItem.origin}. ` : "";
    const text = `Hasil analisis makanan. Menu ini diidentifikasi sebagai ${foodItem.name}. ${originText}` +
      `Kandungan gizi terdiri dari: kalori sebesar ${foodItem.calories} kilo kalori, ` +
      `protein ${foodItem.protein} gram, karbohidrat ${foodItem.carbs} gram, ` +
      `dan lemak ${foodItem.fat} gram. ` +
      `Makanan ini bersertifikat ${foodItem.halalStatus || "Halal"}.`;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.rate = 0.9;

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white text-center">
        <div className="relative flex items-center justify-center">
          {/* Circular Spinner */}
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <UtensilsCrossed size={24} className="absolute text-emerald-500 animate-pulse" />
        </div>
        <h2 className="text-lg font-extrabold text-gray-900 mt-6 animate-pulse">
          Menganalisis Makanan...
        </h2>
        <p className="text-xs text-gray-500 max-w-xs mt-2 leading-relaxed">
          Kecerdasan Buatan sedang menganalisis gambar untuk mengidentifikasi bahan, resep, dan info nutrisi secara mendalam.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white text-center">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4 shadow-sm shadow-red-100">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Terjadi Kesalahan</h2>
        <p className="text-xs text-red-500 max-w-xs mt-2 bg-red-50/50 p-3 rounded-xl border border-red-100 leading-relaxed font-medium">
          {error}
        </p>
        <button
          onClick={onBack}
          className="mt-6 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-100 transition-all cursor-pointer"
        >
          Kembali
        </button>
      </div>
    );
  }

  if (!foodItem) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white text-center">
        <p className="text-sm text-gray-500 font-medium">Tidak ada data pemindaian aktif</p>
        <button
          onClick={onBack}
          className="mt-4 px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
        >
          Kembali ke Beranda
        </button>
      </div>
    );
  }

  const ingredientsList = foodItem.recipeIngredients
    ? foodItem.recipeIngredients.split("; ").filter(Boolean)
    : [];

  const radarData = [
    { subject: "Protein (g)", value: foodItem.protein || 0 },
    { subject: "Karbohidrat (g)", value: foodItem.carbs || 0 },
    { subject: "Lemak (g)", value: foodItem.fat || 0 },
    { subject: "Serat (g)", value: foodItem.fiber || 0 },
  ];

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-y-auto pb-12">
      {/* Top Navbar */}
      <div className="sticky top-0 bg-white border-b border-gray-100 p-4 flex items-center justify-between shrink-0 z-10 shadow-xs">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="p-2 text-gray-700 hover:bg-gray-100 rounded-full transition-colors mr-3"
            aria-label="Kembali"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-extrabold text-gray-900 text-base">Hasil Analisis Kuliner</h1>
        </div>
        <div className="flex items-center gap-1.5">
          {foodItem && (
            <button
              onClick={handleToggleSpeech}
              className={`px-3 py-1.5 rounded-full transition-all duration-300 flex items-center gap-1.5 cursor-pointer text-xs font-bold ${
                isSpeaking
                  ? "bg-emerald-50 text-emerald-600 ring-2 ring-emerald-500/20 animate-pulse"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
              title={isSpeaking ? "Hentikan Suara" : "Dengarkan Analisis"}
            >
              {isSpeaking ? <VolumeX size={15} /> : <Volume2 size={15} />}
              <span>
                {isSpeaking ? "Membaca..." : "Suara AI"}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Main Details Body */}
      <div className="flex-1 max-w-xl mx-auto w-full">
        {foodItem.isSimulated && foodItem.simulationReason === "quota_exceeded" && (
          <div className="mx-4 mt-4 bg-amber-50/80 backdrop-blur-xs border border-amber-200/60 rounded-2xl p-4 flex gap-3 shadow-xs">
            <AlertCircle className="text-amber-500 shrink-0 w-5 h-5 mt-0.5" />
            <div className="text-xs text-amber-800 leading-relaxed">
              <p className="font-extrabold mb-1">💡 Mode Simulasi Aktif (API Limit)</p>
              <span>Sistem mendeteksi batas kuota harian/gratis API Gemini Anda saat ini telah terlampaui (Error 429). Aplikasi secara otomatis beralih ke <strong>Mode Deteksi Lokal & Simulasi Cerdas</strong> agar fitur scan tetap berfungsi lancar tanpa terhenti!</span>
            </div>
          </div>
        )}

        {/* Model ML Status Indicator */}
        <div className="mx-4 mt-4">
          {foodItem.tfliteModelLoaded ? (
            <div className="bg-emerald-50/80 backdrop-blur-xs border border-emerald-200/60 rounded-2xl p-3.5 flex gap-3 shadow-xs">
              <div className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center shrink-0 text-xs font-black shadow-sm shadow-emerald-200">
                🤖
              </div>
              <div className="text-xs text-emerald-800 leading-relaxed">
                <p className="font-extrabold mb-0.5">Model ML On-Device Aktif</p>
                <span>Sistem mendeteksi model <strong>model.tflite</strong> (MobileNetV2 food classifier) terpasang di folder assets. Klasifikasi citra divalidasi secara lokal!</span>
              </div>
            </div>
          ) : (
            <div className="bg-rose-50/80 backdrop-blur-xs border border-rose-200/60 rounded-2xl p-3.5 flex gap-3 shadow-xs">
              <div className="w-8 h-8 bg-rose-500 text-white rounded-lg flex items-center justify-center shrink-0 text-xs font-black shadow-sm shadow-rose-200">
                ⚠️
              </div>
              <div className="text-xs text-rose-800 leading-relaxed">
                <p className="font-extrabold mb-0.5">Model ML On-Device Tidak Ditemukan</p>
                <span>File model <strong>model.tflite</strong> belum berada di folder assets/. Aplikasi beralih ke <strong>Mode Simulasi Cerdas</strong>.</span>
              </div>
            </div>
          )}
        </div>

        {/* 1. Food Picture Header */}
        <div className="relative w-full h-64 bg-gray-900 overflow-hidden">
          {foodItem.imagePath ? (
            <img
              src={foodItem.imagePath}
              alt={foodItem.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : foodItem.recipeThumb ? (
            <img
              src={foodItem.recipeThumb}
              alt={foodItem.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full bg-emerald-500/10 flex items-center justify-center">
              <UtensilsCrossed size={64} className="text-emerald-500/30" />
            </div>
          )}

          {/* Dark picture bottom gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent"></div>

          {/* Overlapping floating card */}
          <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-xs p-4 rounded-2xl border border-gray-100/50 shadow-lg flex items-center justify-between">
            <div className="flex-1 min-w-0 pr-4">
              <h2 className="text-lg font-black text-gray-900 truncate leading-tight">
                {foodItem.name}
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 mt-1">
                {/* Scientific name label */}
                <span className="text-xs font-semibold text-emerald-600 italic">
                  {foodItem.scientificName || "Cibus deliciosis"}
                </span>
                {foodItem.origin && (
                  <>
                    <span className="text-gray-300 text-xs shrink-0">•</span>
                    <span className="text-xs font-semibold text-gray-500 flex items-center gap-0.5">
                      <MapPin size={11} className="text-rose-500 shrink-0" />
                      {foodItem.origin}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Confidence progress */}
            <div className="flex flex-col items-end shrink-0">
              <span className="text-lg font-black text-emerald-600 leading-none mb-1">
                {Math.round(foodItem.confidence * 100)}%
              </span>
              <div className="w-16 h-1.5 bg-emerald-50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${foodItem.confidence * 100}%` }}
                ></div>
              </div>
              <span className="text-[9px] text-gray-400 mt-0.5 font-bold uppercase tracking-wider">Akurasi AI</span>
            </div>
          </div>
        </div>

        {/* 2. Scientific Name, Origin, & Halal Status Badges */}
        <div className={`mt-4 px-4 grid grid-cols-1 ${foodItem.origin ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-3`}>
          {/* Scientific Name Card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-50 rounded-xl flex items-center justify-center text-sky-500 shrink-0">
              <Leaf size={20} />
            </div>
            <div>
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Nama Ilmiah</span>
              <span className="text-sm font-bold text-gray-800 italic block">
                {foodItem.scientificName || "Cibus deliciosis"}
              </span>
            </div>
          </div>

          {/* Origin Card */}
          {foodItem.origin && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-500 shrink-0">
                <MapPin size={20} />
              </div>
              <div>
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Asal Kuliner</span>
                <span className="text-sm font-bold text-gray-800 block">
                  {foodItem.origin}
                </span>
              </div>
            </div>
          )}

          {/* Halal Status Card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              foodItem.halalStatus === "Halal" ? "bg-emerald-50 text-emerald-600" :
              foodItem.halalStatus === "Syubhah" ? "bg-amber-50 text-amber-600" :
              (foodItem.halalStatus === "Bukan Makanan" || foodItem.halalStatus === "Tidak Berlaku") ? "bg-slate-100 text-slate-500" :
              "bg-red-50 text-red-600"
            }`}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Regulasi Halal</span>
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-black ${
                  foodItem.halalStatus === "Halal" ? "text-emerald-600" :
                  foodItem.halalStatus === "Syubhah" ? "text-amber-600" :
                  (foodItem.halalStatus === "Bukan Makanan" || foodItem.halalStatus === "Tidak Berlaku") ? "text-slate-500" :
                  "text-red-600"
                }`}>
                  {foodItem.halalStatus || "Halal"}
                </span>
                {foodItem.halalStatus !== "Bukan Makanan" && foodItem.halalStatus !== "Tidak Berlaku" && (
                  <span className="text-[10px] text-gray-400 font-bold bg-gray-100 px-1.5 py-0.5 rounded-md">BPJPH</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Halal Explanation banner */}
        {foodItem.halalReason && (
          <div className={`mt-3 mx-4 p-3.5 rounded-2xl text-xs leading-relaxed shadow-3xs border ${
            foodItem.halalStatus === "Halal" ? "bg-emerald-50/40 border-emerald-100 text-gray-600" :
            foodItem.halalStatus === "Syubhah" ? "bg-amber-50/40 border-amber-100 text-gray-600" :
            (foodItem.halalStatus === "Bukan Makanan" || foodItem.halalStatus === "Tidak Berlaku") ? "bg-slate-50/70 border-slate-200 text-slate-600" :
            "bg-red-50/40 border-red-100 text-gray-600"
          }`}>
            <strong className={`font-bold block mb-0.5 ${
              foodItem.halalStatus === "Halal" ? "text-emerald-700" :
              foodItem.halalStatus === "Syubhah" ? "text-amber-700" :
              (foodItem.halalStatus === "Bukan Makanan" || foodItem.halalStatus === "Tidak Berlaku") ? "text-slate-700" :
              "text-red-700"
            }`}>
              {(foodItem.halalStatus === "Bukan Makanan" || foodItem.halalStatus === "Tidak Berlaku") ? "Informasi Regulasi BPJPH RI:" : "Analisis Titik Kritis Halal (BPJPH):"}
            </strong>
            {foodItem.halalReason}
          </div>
        )}

        {/* 3. Nutrition Section */}
        {foodItem.halalStatus !== "Bukan Makanan" && foodItem.halalStatus !== "Tidak Berlaku" && (
          <div className="mt-6 px-4">
          <h3 className="text-xs font-black tracking-wider text-emerald-600 uppercase mb-3">
            Kandungan Gizi & Nutrisi
          </h3>

          <div className="flex gap-2">
            <MacroCard
              label="KALORI"
              value={`${foodItem.calories}`}
              labelColor="text-emerald-500"
              valueColor="text-emerald-600 text-lg"
              emoji="🔥"
            />
            <MacroCard
              label="PROTEIN"
              value={`${foodItem.protein}g`}
              labelColor="text-gray-400"
              valueColor="text-gray-900 text-sm"
              emoji="🍗"
            />
            <MacroCard
              label="KARBO"
              value={`${foodItem.carbs}g`}
              labelColor="text-gray-400"
              valueColor="text-gray-900 text-sm"
              emoji="🍞"
            />
            <MacroCard
              label="LEMAK"
              value={`${foodItem.fat}g`}
              labelColor="text-gray-400"
              valueColor="text-gray-900 text-sm"
              emoji="🥑"
            />
          </div>

          {/* Fiber badge */}
          {foodItem.fiber > 0 && (
            <div className="mt-3 bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between shadow-xs">
              <div className="flex items-center text-xs font-semibold text-gray-700">
                <Leaf size={16} className="text-emerald-500 mr-2 shrink-0" />
                <span>Serat Makanan (Fiber)</span>
              </div>
              <span className="text-sm font-bold text-emerald-600">{foodItem.fiber}g</span>
            </div>
          )}

          {/* Graphic Visualization Card */}
          <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-4 shadow-xs">
            <h4 className="text-xs font-black text-gray-700 tracking-wide mb-3 flex items-center gap-1.5">
              <span>📊</span> Grafik Distribusi Kalori & Makronutrisi
            </h4>

            <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
              {/* Left Column: Donut SVG Chart */}
              <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
                <svg
                  viewBox="0 0 100 100"
                  className="w-full h-full transform -rotate-90"
                >
                  {/* Background Track */}
                  <circle
                    cx="50"
                    cy="50"
                    r={38}
                    fill="transparent"
                    stroke="#f9fafb"
                    strokeWidth={9}
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={38}
                    fill="transparent"
                    stroke="#f3f4f6"
                    strokeWidth={8}
                  />

                  {/* SVG Chained Segments */}
                  {(() => {
                    const pGrams = foodItem.protein || 0;
                    const cGrams = foodItem.carbs || 0;
                    const fGrams = foodItem.fat || 0;
                    const totalGrams = pGrams + cGrams + fGrams;

                    if (totalGrams === 0) {
                      return (
                        <circle
                          cx="50"
                          cy="50"
                          r={38}
                          fill="transparent"
                          stroke="#e5e7eb"
                          strokeWidth={8}
                        />
                      );
                    }

                    const pPct = (pGrams / totalGrams) * 100;
                    const cPct = (cGrams / totalGrams) * 100;
                    const fPct = (fGrams / totalGrams) * 100;

                    const segments = [
                      { pct: pPct, color: "#f97316" }, // Protein - Orange-500
                      { pct: cPct, color: "#eab308" }, // Carbs - Yellow-500
                      { pct: fPct, color: "#10b981" }, // Fat - Emerald-500
                    ];

                    const radius = 38;
                    const circumference = 2 * Math.PI * radius; // ~238.76
                    let localAccumulated = 0;

                    return segments.map((segment, index) => {
                      if (segment.pct === 0) return null;
                      const strokeDash = (segment.pct / 100) * circumference;
                      const strokeOffset = circumference - (localAccumulated / 100) * circumference;
                      localAccumulated += segment.pct;

                      return (
                        <circle
                          key={index}
                          cx="50"
                          cy="50"
                          r={radius}
                          fill="transparent"
                          stroke={segment.color}
                          strokeWidth={8}
                          strokeDasharray={`${strokeDash} ${circumference}`}
                          strokeDashoffset={strokeOffset}
                          className="transition-all duration-700 ease-out origin-center"
                          style={{
                            transformOrigin: "50px 50px",
                          }}
                        />
                      );
                    });
                  })()}
                </svg>

                {/* Floating Absolute Center Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-black text-gray-900 leading-none">
                    {foodItem.calories}
                  </span>
                  <span className="text-[10px] font-black text-gray-400 tracking-wider uppercase mt-0.5">
                    kkal
                  </span>
                </div>
              </div>

              {/* Right Column: Breakdown List */}
              <div className="flex-1 w-full space-y-3">
                {(() => {
                  const pGrams = foodItem.protein || 0;
                  const cGrams = foodItem.carbs || 0;
                  const fGrams = foodItem.fat || 0;
                  const totalGrams = pGrams + cGrams + fGrams;

                  const pPct = totalGrams > 0 ? (pGrams / totalGrams) * 100 : 0;
                  const cPct = totalGrams > 0 ? (cGrams / totalGrams) * 100 : 0;
                  const fPct = totalGrams > 0 ? (fGrams / totalGrams) * 100 : 0;

                  const pKcal = pGrams * 4;
                  const cKcal = cGrams * 4;
                  const fKcal = fGrams * 9;
                  const totalKcal = pKcal + cKcal + fKcal;

                  const segments = [
                    {
                      name: "Protein",
                      grams: pGrams,
                      pct: pPct,
                      kcal: pKcal,
                      bgColor: "bg-orange-500",
                      emoji: "Protein 🍗"
                    },
                    {
                      name: "Karbohidrat",
                      grams: cGrams,
                      pct: cPct,
                      kcal: cKcal,
                      bgColor: "bg-yellow-500",
                      emoji: "Karbohidrat 🍞"
                    },
                    {
                      name: "Lemak",
                      grams: fGrams,
                      pct: fPct,
                      kcal: fKcal,
                      bgColor: "bg-emerald-500",
                      emoji: "Lemak 🥑"
                    }
                  ];

                  return segments.map((segment, index) => {
                    const percentOfMass = Math.round(segment.pct);
                    const caloriePct = totalKcal > 0 ? Math.round((segment.kcal / totalKcal) * 100) : 0;

                    return (
                      <div key={index} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center font-bold text-gray-800 gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full ${segment.bgColor}`} />
                            <span>{segment.emoji}</span>
                          </div>
                          <div className="text-right text-gray-900 font-extrabold">
                            {segment.grams}g <span className="text-[10px] text-gray-400 font-normal">({percentOfMass}%)</span>
                          </div>
                        </div>

                        {/* Custom Track and Progress bar */}
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${segment.bgColor} transition-all duration-700 ease-out`}
                            style={{ width: `${percentOfMass}%` }}
                          />
                        </div>

                        {/* Energy contributions */}
                        <div className="flex justify-between text-[10px] text-gray-500 font-medium px-0.5">
                          <span>Kontribusi Kalori:</span>
                          <span className="font-bold text-gray-700">
                            {segment.kcal} kkal ({caloriePct}%)
                          </span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Quick energy disclaimer / info tip */}
            <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between text-[10px] text-gray-400 font-medium">
              <span>Standard: 1g Protein/Karbo = 4 kkal • 1g Lemak = 9 kkal</span>
              <span className="text-emerald-500 font-semibold">Gizi Seimbang ⚖️</span>
            </div>
          </div>

          {/* Radar Chart Nutrition Profile Card */}
          <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-4 shadow-xs">
            <h4 className="text-xs font-black text-gray-700 tracking-wide mb-1 flex items-center gap-1.5">
              <span>🕸️</span> Radar Profil Gizi Makronutrisi & Serat
            </h4>
            <p className="text-[10px] text-gray-400 mb-4">
              Visualisasi perbandingan proporsi kandungan gizi dalam satuan gram (g).
            </p>
            <div className="h-64 w-full flex items-center justify-center overflow-hidden">
              <RadarChart width={320} height={240} cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="#f3f4f6" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: '#4b5563', fontSize: 10, fontWeight: 600 }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 'auto']}
                  tick={{ fill: '#9ca3af', fontSize: 8 }}
                />
                <Radar
                  name="Kandungan Gizi"
                  dataKey="value"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.25}
                />
              </RadarChart>
            </div>
          </div>
        </div>
        )}

        {/* Tips Kesehatan Section */}
        {foodItem && foodItem.halalStatus !== "Bukan Makanan" && foodItem.halalStatus !== "Tidak Berlaku" && (
          <div className="mt-6 px-4">
            <h3 className="text-xs font-black tracking-wider text-emerald-600 uppercase mb-3 flex items-center gap-1.5 animate-fade-in">
              <Leaf size={16} className="text-emerald-500" />
              <span>Tips Kesehatan & Saran Konsumsi</span>
            </h3>

            <div className="bg-emerald-50/20 rounded-2xl border border-emerald-100/60 p-4 shadow-3xs space-y-3">
              {tipsLoading ? (
                <div className="flex flex-col items-center justify-center py-4 space-y-2">
                  <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] font-bold text-gray-500">Memuat saran nutrisi...</span>
                </div>
              ) : healthTips.length > 0 ? (
                <div className="space-y-3">
                  {healthTips.map((tip, index) => (
                    <div key={index} className="flex gap-2.5 items-start">
                      <div className="w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center shrink-0 text-[10px] font-extrabold shadow-xs shadow-emerald-200 mt-0.5">
                        {index + 1}
                      </div>
                      <p className="text-xs text-gray-700 font-bold leading-relaxed">
                        {tip}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">
                  Tidak ada tips kesehatan khusus yang tersedia untuk makanan ini.
                </p>
              )}
            </div>
          </div>
        )}

        {/* 4. Health & Nutrition Analysis Block */}
        {foodItem.halalStatus !== "Bukan Makanan" && foodItem.halalStatus !== "Tidak Berlaku" && (
          <div className="mt-6 px-4">
            <h3 className="text-xs font-black tracking-wider text-rose-500 uppercase mb-3 flex items-center gap-1.5">
              <Activity size={16} />
              <span>1. Analisis Kesehatan & Gizi</span>
            </h3>
            <div className="bg-rose-50/25 rounded-2xl border border-rose-100/60 p-4 shadow-xs">
              <p className="text-xs text-gray-700 leading-relaxed font-semibold">
                {foodItem.healthAnalysis || "Masakan ini menyajikan kombinasi zat gizi esensial yang sangat penting untuk mendukung tingkat metabolisme dan kebugaran fisik harian Anda. Konsumsi sewajarnya sebagai bagian dari diet seimbang harian."}
              </p>
            </div>
          </div>
        )}

        {/* 5. Places to Buy (Nearby Restaurant Search) */}
        {foodItem.halalStatus !== "Bukan Makanan" && foodItem.halalStatus !== "Tidak Berlaku" && (
          <div className="mt-6 px-4">
          <h3 className="text-xs font-black tracking-wider text-sky-600 uppercase mb-3 flex items-center gap-1.5">
            <MapPin size={16} />
            <span>2. Cek Tempat yang Menjual Makanan Ini</span>
          </h3>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-50">
              <div className="min-w-0 pr-4">
                <h4 className="text-xs font-black text-gray-800">Cari Sekitar Anda</h4>
                <p className="text-[10px] text-gray-400 mt-0.5">Dapatkan penunjuk arah langsung di Google Maps</p>
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(foodItem.name + ' terdekat')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-black shadow-xs transition-colors cursor-pointer"
              >
                <span>Cari di Peta</span>
              </a>
            </div>

            {/* Recommendations List */}
            <div className="space-y-3">
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Rekomendasi Restoran Populer</span>
              {foodItem.suggestedRestaurants && foodItem.suggestedRestaurants.length > 0 ? (
                <div className="space-y-2.5">
                  {foodItem.suggestedRestaurants.map((restaurant, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between p-3 rounded-xl border border-gray-50 hover:bg-gray-50/50 transition-colors"
                    >
                      <div className="min-w-0 pr-3">
                        <h5 className="text-xs font-bold text-gray-800 truncate">
                          {restaurant.name}
                        </h5>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">
                          {restaurant.address}
                        </p>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1.5">
                        {restaurant.rating && (
                          <div className="flex items-center gap-1 bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-md text-[10px] font-black">
                            <Star size={10} className="fill-amber-500 text-amber-500" />
                            <span>{restaurant.rating.toFixed(1)}</span>
                          </div>
                        )}
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.name + ' ' + restaurant.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] font-black text-sky-600 hover:underline"
                        >
                          Rute Jalan ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-400 text-xs">
                  Saran restoran tidak tersedia. Silakan gunakan tombol "Cari di Peta" di atas untuk mencari secara langsung.
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* 6. Recipe Section */}
        {foodItem.halalStatus !== "Bukan Makanan" && foodItem.halalStatus !== "Tidak Berlaku" && (
          <div className="mt-6 px-4">
          <h3 className="text-xs font-black tracking-wider text-amber-600 uppercase mb-3 flex items-center gap-1.5">
            <UtensilsCrossed size={16} />
            <span>3. Resep & Cara Memasak</span>
          </h3>

          {foodItem.hasRecipe ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs">
              <div className="flex items-center mb-4 pb-4 border-b border-gray-50">
                {foodItem.recipeThumb ? (
                  <img
                    src={foodItem.recipeThumb}
                    alt={foodItem.recipeTitle}
                    className="w-12 h-12 rounded-lg object-cover shrink-0 border border-gray-100"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-lg flex items-center justify-center shrink-0 border border-amber-100">
                    <UtensilsCrossed size={20} />
                  </div>
                )}
                <div className="ml-3 min-w-0">
                  <h4 className="text-sm font-bold text-gray-900 truncate">
                    {foodItem.recipeTitle}
                  </h4>
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full inline-block mt-0.5">
                    Resep & Langkah Siap
                  </span>
                </div>
              </div>

              {/* Ingredients block */}
              {ingredientsList.length > 0 && (
                <div className="mb-4">
                  <h5 className="text-xs font-extrabold text-gray-800 mb-2">Bahan-bahan:</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                    {ingredientsList.map((ing, idx) => (
                      <div key={idx} className="flex items-center text-xs text-gray-600">
                        <Check size={14} className="text-emerald-500 mr-2 shrink-0" />
                        <span className="truncate">{ing}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Instructions steps */}
              {foodItem.recipeInstructions && (
                <div className="mt-4 pt-4 border-t border-gray-50">
                  <h5 className="text-xs font-extrabold text-gray-800 mb-2">
                    Langkah Pembuatan:
                  </h5>
                  <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">
                    {foodItem.recipeInstructions}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs text-center">
              <div className="w-10 h-10 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-3">
                <UtensilsCrossed size={18} />
              </div>
              <h4 className="text-xs font-bold text-gray-700">Resep Tidak Ditemukan</h4>
              <p className="text-[11px] text-gray-400 mt-1 max-w-xs mx-auto leading-relaxed">
                Tidak dapat menemukan atau menyusun resep untuk "{foodItem.name}".
                Silakan coba memindai makanan umum lainnya.
              </p>
            </div>
          )}
        </div>
        )}

        {/* Empty state for Non-food Items */}
        {(foodItem.halalStatus === "Bukan Makanan" || foodItem.halalStatus === "Tidak Berlaku") && (
          <div className="mt-8 mx-4 bg-slate-50 border border-slate-200/60 p-6 rounded-2xl text-center shadow-3xs flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <AlertCircle size={24} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-700">Analisis Khusus Makanan Dinonaktifkan</h4>
              <p className="text-xs text-slate-400 mt-1.5 max-w-xs mx-auto leading-relaxed">
                Kandungan gizi, analisis kesehatan, resep makanan, serta rekomendasi restoran dinonaktifkan karena objek ini diidentifikasi sebagai non-makanan berdasarkan regulasi BPJPH.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Button for Text-to-Speech */}
      {foodItem && (
        <button
          onClick={handleToggleSpeech}
          className={`fixed bottom-6 right-6 z-50 px-4 py-3.5 rounded-full shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center gap-2 border border-white/20 ${
            isSpeaking
              ? "bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/30 animate-pulse"
              : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/30"
          }`}
          title={isSpeaking ? "Hentikan Suara" : "Dengarkan Analisis Makanan (TTS)"}
        >
          {isSpeaking ? (
            <>
              <VolumeX size={18} />
              <span className="text-xs font-extrabold tracking-wide uppercase">Stop Suara</span>
            </>
          ) : (
            <>
              <Volume2 size={18} className="animate-bounce" />
              <span className="text-xs font-extrabold tracking-wide uppercase">Dengar AI</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};

