import React, { useState, useEffect } from "react";
import { 
  Edit2, 
  Check, 
  Sparkles, 
  Plus, 
  Minus, 
  Calendar, 
  TrendingUp, 
  ChevronDown, 
  ChevronUp, 
  Scale
} from "lucide-react";
import { ScannedFood } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface DailyIntakeDashboardProps {
  history: ScannedFood[];
}

interface IntakeTargets {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

const DEFAULT_TARGETS: IntakeTargets = {
  calories: 2000,
  protein: 65,
  fat: 65,
  carbs: 275,
};

export const DailyIntakeDashboard: React.FC<DailyIntakeDashboardProps> = ({ history }) => {
  // Navigation Period Toggle ("today" | "all")
  const [period, setPeriod] = useState<"today" | "all">("today");

  // Targets state
  const [targets, setTargets] = useState<IntakeTargets>(DEFAULT_TARGETS);
  const [isEditing, setIsEditing] = useState(false);
  const [tempTargets, setTempTargets] = useState<IntakeTargets>(DEFAULT_TARGETS);

  // Expanded items in the list of active scans
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});

  // Load custom targets from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("food_recognizer_targets");
    if (saved) {
      try {
        setTargets(JSON.parse(saved));
      } catch (err) {
        console.error("Failed to parse intake targets:", err);
      }
    }
  }, []);

  // Filter history to find items scanned today (calendar day in user's local timezone)
  const todayItems = history.filter((item) => {
    const scanDate = new Date(item.timestamp);
    const today = new Date();
    return (
      scanDate.getDate() === today.getDate() &&
      scanDate.getMonth() === today.getMonth() &&
      scanDate.getFullYear() === today.getFullYear()
    );
  });

  // Determine active list based on period selection
  const activeItems = period === "today" ? todayItems : history;

  // Calculate total consumed macronutrients for active period
  const totals = activeItems.reduce(
    (acc, item) => {
      acc.calories += Number(item.calories) || 0;
      acc.protein += Number(item.protein) || 0;
      acc.fat += Number(item.fat) || 0;
      acc.carbs += Number(item.carbs) || 0;
      acc.fiber += Number(item.fiber) || 0;
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }
  );

  // Round values for display
  const roundedTotals = {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fiber: Math.round(totals.fiber * 10) / 10,
  };

  // Percentages relative to targets (applicable for daily view)
  const calPercent = Math.min(100, Math.round((roundedTotals.calories / targets.calories) * 100)) || 0;
  const proteinPercent = Math.min(100, Math.round((roundedTotals.protein / targets.protein) * 100)) || 0;
  const fatPercent = Math.min(100, Math.round((roundedTotals.fat / targets.fat) * 100)) || 0;
  const carbsPercent = Math.min(100, Math.round((roundedTotals.carbs / targets.carbs) * 100)) || 0;

  // Target quick adjustments helper
  const adjustTarget = (field: keyof IntakeTargets, amount: number) => {
    setTargets((prev) => {
      let minVal = 5;
      let maxVal = 1000;
      if (field === "calories") {
        minVal = 500;
        maxVal = 10000;
      } else if (field === "protein" || field === "fat") {
        minVal = 10;
        maxVal = 300;
      } else if (field === "carbs") {
        minVal = 30;
        maxVal = 1000;
      }

      const newVal = Math.max(minVal, Math.min(maxVal, prev[field] + amount));
      const updated = {
        ...prev,
        [field]: newVal,
      };
      localStorage.setItem("food_recognizer_targets", JSON.stringify(updated));
      return updated;
    });
  };

  const handleStartEdit = () => {
    setTempTargets({ ...targets });
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const validated = {
      calories: Math.max(500, Math.min(10000, Number(tempTargets.calories) || DEFAULT_TARGETS.calories)),
      protein: Math.max(10, Math.min(300, Number(tempTargets.protein) || DEFAULT_TARGETS.protein)),
      fat: Math.max(10, Math.min(300, Number(tempTargets.fat) || DEFAULT_TARGETS.fat)),
      carbs: Math.max(30, Math.min(1000, Number(tempTargets.carbs) || DEFAULT_TARGETS.carbs)),
    };
    setTargets(validated);
    localStorage.setItem("food_recognizer_targets", JSON.stringify(validated));
    setIsEditing(false);
  };

  // Stacked Calorie Split Calculation (using active period values)
  // protein: 4 kcal/g, carbs: 4 kcal/g, fat: 9 kcal/g
  const proteinKcal = roundedTotals.protein * 4;
  const carbsKcal = roundedTotals.carbs * 4;
  const fatKcal = roundedTotals.fat * 9;
  const macroCalTotal = proteinKcal + carbsKcal + fatKcal;

  let proteinContributionPct = 0;
  let carbsContributionPct = 0;
  let fatContributionPct = 0;

  if (macroCalTotal > 0) {
    proteinContributionPct = Math.round((proteinKcal / macroCalTotal) * 100);
    carbsContributionPct = Math.round((carbsKcal / macroCalTotal) * 100);
    // Ensure total is exactly 100%
    fatContributionPct = 100 - proteinContributionPct - carbsContributionPct;
    if (fatContributionPct < 0) fatContributionPct = 0;
  }

  // Dynamic Healthy Tips & Balances
  const getDynamicHealthInsight = () => {
    if (activeItems.length === 0) {
      return {
        text: period === "today" 
          ? "Pindai hidangan pertama Anda hari ini untuk mulai memetakan status kalori dan keseimbangan gizi makro Anda secara real-time!"
          : "Pindai beberapa hidangan makanan untuk melihat rangkuman statistik nutrisi makro dan analisis diet All-Time Anda.",
        color: "text-gray-500 bg-gray-50 border-gray-100",
        state: "empty"
      };
    }

    // Checking macronutrient proportions based on standard recommendation (e.g. Protein 15-25%, Carbs 45-60%, Fat 20-35%)
    if (carbsContributionPct > 60) {
      return {
        text: `Kandungan Karbohidrat Anda tinggi (${carbsContributionPct}% kkal). Kurangi makanan bertepung atau porsi nasi putih berlebih, dan imbangi dengan protein atau sayuran hijau tinggi serat.`,
        color: "text-amber-700 bg-amber-50 border-amber-100",
        state: "high-carbs"
      };
    }

    if (fatContributionPct > 35) {
      return {
        text: `Kandungan Lemak Anda tinggi (${fatContributionPct}% kkal). Batasi asupan gorengan, makanan bersantan atau mentega berlebih, dan ganti dengan lemak sehat (seperti alpukat, almond, atau ikan).`,
        color: "text-rose-700 bg-rose-50 border-rose-100",
        state: "high-fats"
      };
    }

    if (proteinContributionPct < 15 && macroCalTotal > 100) {
      return {
        text: `Kandungan Protein Anda rendah (${proteinContributionPct}% kkal). Tambahkan lauk dada ayam, ikan, putih telur, tahu, tempe, atau kacang-kacangan untuk membantu metabolisme otot dan rasa kenyang yang stabil.`,
        color: "text-blue-700 bg-blue-50 border-blue-100",
        state: "low-protein"
      };
    }

    return {
      text: `Rasio gizi makro Anda sangat ideal! (${proteinContributionPct}% Protein, ${carbsContributionPct}% Karbohidrat, ${fatContributionPct}% Lemak). Pertahankan kombinasi makanan seimbang ini.`,
      color: "text-emerald-700 bg-emerald-50 border-emerald-100",
      state: "balanced"
    };
  };

  const healthInsight = getDynamicHealthInsight();

  const toggleItemExpansion = (idx: number) => {
    setExpandedItems((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  // SVG Config for Radial Circle Indicator (applicable for Today view)
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (calPercent / 100) * circumference;

  return (
    <div id="daily-intake-dashboard" className="bg-white rounded-3xl border border-gray-100 p-4 shadow-xs transition-all duration-300">
      {/* Interactive Period Toggling Header */}
      <div className="flex items-center justify-between mb-4 border-b border-gray-50 pb-2.5">
        <div className="flex bg-gray-100/80 p-0.5 rounded-xl border border-gray-100">
          <button
            onClick={() => setPeriod("today")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wide transition-all cursor-pointer ${
              period === "today"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <Calendar size={11} />
            HARI INI
          </button>
          <button
            onClick={() => setPeriod("all")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wide transition-all cursor-pointer ${
              period === "all"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <TrendingUp size={11} />
            SEMUA (ALL-TIME)
          </button>
        </div>

        {period === "today" && (
          <div>
            {!isEditing ? (
              <button
                onClick={handleStartEdit}
                className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-emerald-600 transition-colors cursor-pointer"
              >
                <Edit2 size={10} />
                Ubah Target
              </button>
            ) : (
              <button
                onClick={handleSaveEdit}
                className="flex items-center gap-1 text-[10px] font-black text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
              >
                <Check size={12} />
                Selesai
              </button>
            )}
          </div>
        )}
      </div>

      {/* Targets Adjustment & Quick +/- Controls (Today Period only) */}
      <AnimatePresence mode="wait">
        {period === "today" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {isEditing ? (
              <div className="grid grid-cols-4 gap-2 mb-4 bg-gray-50/70 p-2.5 rounded-2xl border border-dashed border-gray-200">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-gray-400 mb-1">KALORI (kkal)</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => adjustTarget("calories", -100)}
                      className="p-1 bg-white border border-gray-200 rounded-md text-gray-500 hover:text-red-500 hover:border-red-300 transition-colors cursor-pointer"
                    >
                      <Minus size={8} />
                    </button>
                    <span className="text-xs font-black text-gray-800">{targets.calories}</span>
                    <button
                      onClick={() => adjustTarget("calories", 100)}
                      className="p-1 bg-white border border-gray-200 rounded-md text-gray-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors cursor-pointer"
                    >
                      <Plus size={8} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-gray-400 mb-1">PROTEIN (g)</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => adjustTarget("protein", -5)}
                      className="p-1 bg-white border border-gray-200 rounded-md text-gray-500 hover:text-red-500 hover:border-red-300 transition-colors cursor-pointer"
                    >
                      <Minus size={8} />
                    </button>
                    <span className="text-xs font-black text-gray-800">{targets.protein}</span>
                    <button
                      onClick={() => adjustTarget("protein", 5)}
                      className="p-1 bg-white border border-gray-200 rounded-md text-gray-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors cursor-pointer"
                    >
                      <Plus size={8} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-gray-400 mb-1">LEMAK (g)</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => adjustTarget("fat", -5)}
                      className="p-1 bg-white border border-gray-200 rounded-md text-gray-500 hover:text-red-500 hover:border-red-300 transition-colors cursor-pointer"
                    >
                      <Minus size={8} />
                    </button>
                    <span className="text-xs font-black text-gray-800">{targets.fat}</span>
                    <button
                      onClick={() => adjustTarget("fat", 5)}
                      className="p-1 bg-white border border-gray-200 rounded-md text-gray-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors cursor-pointer"
                    >
                      <Plus size={8} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-gray-400 mb-1">KARBO (g)</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => adjustTarget("carbs", -10)}
                      className="p-1 bg-white border border-gray-200 rounded-md text-gray-500 hover:text-red-500 hover:border-red-300 transition-colors cursor-pointer"
                    >
                      <Minus size={8} />
                    </button>
                    <span className="text-xs font-black text-gray-800">{targets.carbs}</span>
                    <button
                      onClick={() => adjustTarget("carbs", 10)}
                      className="p-1 bg-white border border-gray-200 rounded-md text-gray-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors cursor-pointer"
                    >
                      <Plus size={8} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between mb-3 bg-emerald-50/20 px-3 py-2 rounded-2xl border border-emerald-500/10">
                <div className="flex items-center gap-2">
                  <Scale size={13} className="text-emerald-500" />
                  <span className="text-[10px] font-bold text-gray-500">Target Harian:</span>
                </div>
                <div className="flex gap-3 text-[10px] font-black text-gray-700">
                  <span>🔥 {targets.calories} kkal</span>
                  <span>🍗 P: {targets.protein}g</span>
                  <span>🥑 L: {targets.fat}g</span>
                  <span>🍚 K: {targets.carbs}g</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Stats Visualization Grid */}
      <div className="flex flex-col items-center gap-4 mb-4">
        {period === "today" ? (
          /* Today Circle */
          <div className="relative w-28 h-28 flex items-center justify-center shrink-0 mx-auto">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 128 128">
              <circle
                cx="64"
                cy="64"
                r={radius}
                className="stroke-gray-100"
                strokeWidth="10"
                fill="transparent"
              />
              <motion.circle
                cx="64"
                cy="64"
                r={radius}
                className="stroke-emerald-500"
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                strokeLinecap="round"
              />
            </svg>
            
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-[8px] font-black text-gray-400 tracking-wider uppercase leading-none">HARI INI</span>
              <span className="text-lg font-black text-gray-900 leading-tight mt-0.5">
                {roundedTotals.calories}
              </span>
              <span className="text-[8px] font-bold text-gray-400 leading-none">
                / {targets.calories} kkal
              </span>
              <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md mt-1">
                {calPercent}%
              </span>
            </div>
          </div>
        ) : (
          /* All-Time Stats Card (replaces progress ring) */
          <div className="relative w-full p-3.5 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 rounded-2xl border border-emerald-500/5 flex flex-col justify-center shrink-0">
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingUp size={13} className="text-emerald-500" />
              <h4 className="text-[10px] font-black tracking-wider text-gray-400 uppercase">
                Statistik Akumulasi All-Time
              </h4>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white border border-gray-50 p-2 rounded-xl text-center shadow-xs">
                <span className="text-[8px] font-black text-gray-400 block uppercase mb-1">Total Scan</span>
                <span className="text-sm font-black text-gray-900">{activeItems.length}</span>
                <span className="text-[8px] text-gray-400 block mt-0.5">hidangan</span>
              </div>
              <div className="bg-white border border-gray-50 p-2 rounded-xl text-center shadow-xs">
                <span className="text-[8px] font-black text-gray-400 block uppercase mb-1">Rerata Kalori</span>
                <span className="text-sm font-black text-emerald-600">
                  {activeItems.length > 0 ? Math.round(roundedTotals.calories / activeItems.length) : 0}
                </span>
                <span className="text-[8px] text-gray-400 block mt-0.5">kkal / scan</span>
              </div>
              <div className="bg-white border border-gray-50 p-2 rounded-xl text-center shadow-xs">
                <span className="text-[8px] font-black text-gray-400 block uppercase mb-1">Total Kalori</span>
                <span className="text-sm font-black text-orange-500">{roundedTotals.calories}</span>
                <span className="text-[8px] text-gray-400 block mt-0.5">kkal total</span>
              </div>
            </div>
          </div>
        )}

        {/* Macronutrient Progress Bars */}
        <div className="flex-grow w-full space-y-2.5">
          {/* Protein */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between text-[10px] font-bold text-gray-700 mb-0.5">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Protein
              </span>
              <span className="text-gray-900 font-extrabold">
                {roundedTotals.protein}g {period === "today" && <span className="text-gray-400 font-bold">/ {targets.protein}g</span>}
              </span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${period === "today" ? proteinPercent : Math.min(100, (roundedTotals.protein / (activeItems.length * (targets.protein / 3) || 1)) * 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Lemak */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between text-[10px] font-bold text-gray-700 mb-0.5">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Lemak
              </span>
              <span className="text-gray-900 font-extrabold">
                {roundedTotals.fat}g {period === "today" && <span className="text-gray-400 font-bold">/ {targets.fat}g</span>}
              </span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-amber-500"
                initial={{ width: 0 }}
                animate={{ width: `${period === "today" ? fatPercent : Math.min(100, (roundedTotals.fat / (activeItems.length * (targets.fat / 3) || 1)) * 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Karbohidrat */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between text-[10px] font-bold text-gray-700 mb-0.5">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Karbohidrat
              </span>
              <span className="text-gray-900 font-extrabold">
                {roundedTotals.carbs}g {period === "today" && <span className="text-gray-400 font-bold">/ {targets.carbs}g</span>}
              </span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-rose-500"
                initial={{ width: 0 }}
                animate={{ width: `${period === "today" ? carbsPercent : Math.min(100, (roundedTotals.carbs / (activeItems.length * (targets.carbs / 3) || 1)) * 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Visual Calorie Split (Stacked Ratio Bar) */}
      <div className="mb-4 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-[10px] font-black tracking-wider text-gray-400 uppercase">
            Kontribusi Kalori dari Gizi Makro
          </h4>
          <span className="text-[9px] font-bold text-gray-400">
            1g P/K = 4 kkal • 1g L = 9 kkal
          </span>
        </div>

        {macroCalTotal === 0 ? (
          <div className="h-3 w-full bg-gray-100 rounded-lg flex items-center justify-center text-[8px] text-gray-400 font-bold">
            Belum ada data nutrisi makro untuk divisualisasikan
          </div>
        ) : (
          <div className="space-y-1.5">
            {/* Stacked Ratio Bar */}
            <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden flex shadow-inner">
              <motion.div
                className="h-full bg-blue-500"
                style={{ width: `${proteinContributionPct}%` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                title={`Protein: ${proteinContributionPct}%`}
              />
              <motion.div
                className="h-full bg-rose-500"
                style={{ width: `${carbsContributionPct}%` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                title={`Karbohidrat: ${carbsContributionPct}%`}
              />
              <motion.div
                className="h-full bg-amber-500"
                style={{ width: `${fatContributionPct}%` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                title={`Lemak: ${fatContributionPct}%`}
              />
            </div>

            {/* Labels and contribution values */}
            <div className="flex justify-between items-center text-[9px] font-black text-gray-500">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span>Protein 🍗 {proteinContributionPct}%</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Karbo 🍚 {carbsContributionPct}%</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Lemak 🥑 {fatContributionPct}%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dynamic Healthy Insights panel */}
      <div className={`p-3 rounded-2xl border flex items-start gap-2.5 mb-4 ${healthInsight.color} transition-all duration-300`}>
        <Sparkles size={14} className="shrink-0 mt-0.5 text-emerald-500 animate-pulse" />
        <div className="flex flex-col">
          <span className="text-[8px] font-black tracking-wider uppercase mb-0.5">Analisis Keseimbangan Diet</span>
          <p className="text-[10px] font-bold leading-relaxed">
            {healthInsight.text}
          </p>
        </div>
      </div>

      {/* Expandable/Collapsible Scanned Items List inside Dashboard */}
      <div className="pt-3 border-t border-gray-100">
        <h4 className="text-[10px] font-black tracking-wider text-gray-400 uppercase mb-2.5">
          {period === "today" ? "Hidangan Terpindai Hari Ini" : "Semua Hidangan Terpindai"} ({activeItems.length})
        </h4>
        {activeItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 bg-gray-50/50 rounded-2xl border border-dashed border-gray-100 text-center">
            <span className="text-xs font-semibold text-gray-400">Belum ada pemindaian tercatat</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {activeItems.map((item, idx) => {
              const isExpanded = !!expandedItems[item.id || idx];
              const itemCal = Number(item.calories) || 0;

              return (
                <div 
                  key={item.id || idx} 
                  className="bg-gray-50/40 rounded-2xl border border-gray-100/70 overflow-hidden hover:border-emerald-500/20 transition-all duration-200"
                >
                  {/* Collapsed Header Bar */}
                  <div 
                    onClick={() => toggleItemExpansion(item.id || idx)}
                    className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-gray-50/80 active:bg-gray-100/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 max-w-[70%]">
                      {item.imagePath ? (
                        <img 
                          src={item.imagePath} 
                          alt={item.name} 
                          className="w-8 h-8 rounded-lg object-cover border border-gray-100 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-500 text-xs font-black shrink-0">
                          🍽️
                        </div>
                      )}
                      <div className="flex flex-col truncate">
                        <span className="text-[10px] font-black text-gray-800 truncate leading-tight">{item.name}</span>
                        <span className="text-[8px] font-bold text-gray-400 mt-0.5">
                          {new Date(item.timestamp).toLocaleDateString([], { day: 'numeric', month: 'short' })} • {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-gray-900 bg-white border border-gray-100 px-2 py-0.5 rounded-lg">
                        {itemCal} kkal
                      </span>
                      {isExpanded ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-white border-t border-gray-50"
                      >
                        <div className="p-3 space-y-3">
                          {/* Visual Row with Thumbnail, Scientific Name, Origin */}
                          <div className="flex gap-2.5">
                            {item.imagePath && (
                              <img 
                                src={item.imagePath} 
                                alt={item.name} 
                                className="w-14 h-14 rounded-xl object-cover border border-gray-100 shrink-0"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            <div className="flex-grow flex flex-col justify-center">
                              {item.scientificName && (
                                <span className="text-[9px] font-bold italic text-gray-500">
                                  {item.scientificName}
                                </span>
                              )}
                              {item.origin && (
                                <span className="text-[9px] font-bold text-gray-600 mt-0.5">
                                  📍 Asal: <span className="font-extrabold text-emerald-600">{item.origin}</span>
                                </span>
                              )}
                              {item.halalStatus && (
                                <div className="mt-1 flex items-center gap-1">
                                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md ${
                                    item.halalStatus === "Halal" 
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                      : item.halalStatus === "Syubhah"
                                        ? "bg-amber-50 text-amber-700 border border-amber-100"
                                        : "bg-red-50 text-red-700 border border-red-100"
                                  }`}>
                                    {item.halalStatus}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Nutrition Grid inside expander */}
                          <div className="grid grid-cols-4 gap-1.5 bg-gray-50 p-2 rounded-xl text-center">
                            <div className="flex flex-col">
                              <span className="text-[7px] font-black text-gray-400 uppercase">Protein</span>
                              <span className="text-xs font-black text-blue-600">{item.protein || 0}g</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[7px] font-black text-gray-400 uppercase">Lemak</span>
                              <span className="text-xs font-black text-amber-600">{item.fat || 0}g</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[7px] font-black text-gray-400 uppercase">Karbo</span>
                              <span className="text-xs font-black text-rose-600">{item.carbs || 0}g</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[7px] font-black text-gray-400 uppercase">Serat</span>
                              <span className="text-xs font-black text-purple-600">{item.fiber || 0}g</span>
                            </div>
                          </div>

                          {/* Halal Explanation Reason */}
                          {item.halalReason && (
                            <div className="text-[9px] leading-relaxed text-gray-500 bg-gray-50/50 p-2 rounded-xl border border-gray-100">
                              <span className="font-bold text-gray-700 block mb-0.5">Analisis Titik Kritis Halal:</span>
                              {item.halalReason}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
