import React from "react";
import { Calendar, Flame, Trash2, Search, UtensilsCrossed } from "lucide-react";
import { ScannedFood } from "../types";

interface HistoryListProps {
  history: ScannedFood[];
  onDeleteItem: (id: number, e: React.MouseEvent) => void;
  onItemClick: (item: ScannedFood) => void;
  emptyMessageTitle?: string;
  emptyMessageDescription?: string;
}

export const HistoryList: React.FC<HistoryListProps> = ({
  history,
  onDeleteItem,
  onItemClick,
  emptyMessageTitle = "Belum Ada Riwayat",
  emptyMessageDescription = "Mulai pindaian makanan pertama Anda dengan mengambil gambar atau memilih dari galeri!",
}) => {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 mb-4">
          <Search size={32} />
        </div>
        <h3 className="text-base font-bold text-gray-800">{emptyMessageTitle}</h3>
        <p className="text-xs text-gray-500 max-w-xs mt-1 leading-relaxed">
          {emptyMessageDescription}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4">
      {history.map((food) => (
        <div
          key={food.id}
          onClick={() => onItemClick(food)}
          className="bg-white rounded-2xl border border-gray-100 p-3 flex items-center shadow-xs hover:border-gray-200 transition-all cursor-pointer active:scale-[0.99]"
        >
          {/* Thumbnail image */}
          <div className="w-20 h-20 bg-gray-50 rounded-xl overflow-hidden shrink-0 flex items-center justify-center border border-gray-100">
            {food.imagePath ? (
              <img
                src={food.imagePath}
                alt={food.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : food.recipeThumb ? (
              <img
                src={food.recipeThumb}
                alt={food.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <UtensilsCrossed size={28} className="text-emerald-500" />
            )}
          </div>

          {/* Details info */}
          <div className="ml-4 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h4 className="text-sm font-bold text-gray-900 truncate">{food.name}</h4>
            </div>
            <span className="text-[11px] font-bold text-emerald-600 block mt-0.5">
              Akurasi: {Math.round(food.confidence * 100)}%
            </span>

            {/* Micro nutrition list */}
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-500">
              <span className="flex items-center gap-0.5 font-medium">
                <Flame size={12} className="text-orange-500 shrink-0" /> {food.calories} kkal
              </span>
              <span className="font-medium">🍗 {food.protein}g P</span>
              <span className="font-medium">🥑 {food.fat}g L</span>
            </div>

            {/* Timestamp */}
            <div className="flex items-center gap-1 text-[9px] text-gray-400 mt-2">
              <Calendar size={10} />
              <span>{formatDate(food.timestamp)}</span>
            </div>
          </div>

          {/* Delete Action Button */}
          <button
            onClick={(e) => onDeleteItem(food.id, e)}
            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0 ml-2"
            title="Hapus Item"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};
