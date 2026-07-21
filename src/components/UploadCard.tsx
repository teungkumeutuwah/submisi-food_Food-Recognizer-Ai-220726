import React, { useRef, useState } from "react";
import { Camera, ImageUp, Video } from "lucide-react";

interface UploadCardProps {
  onImageSelected: (file: File) => void;
  onCameraClick: () => void;
  onLiveCameraClick: () => void;
}

export const UploadCard: React.FC<UploadCardProps> = ({
  onImageSelected,
  onCameraClick,
  onLiveCameraClick,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImageSelected(e.target.files[0]);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith("image/")) {
        onImageSelected(file);
      }
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`bg-white rounded-3xl border p-5 shadow-xs transition-all text-center relative ${
        isDragging
          ? "border-emerald-400 bg-emerald-50/50 scale-[1.01]"
          : "border-gray-100 hover:border-gray-200"
      }`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {isDragging ? (
        <div className="py-6 flex flex-col items-center justify-center">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center animate-bounce mb-3">
            <ImageUp size={24} />
          </div>
          <span className="text-sm font-bold text-emerald-700">Letakkan gambar di sini</span>
          <span className="text-xs text-emerald-500 mt-1">Untuk langsung mengidentifikasi makanan</span>
        </div>
      ) : (
        <>
          <h3 className="text-sm font-bold text-gray-800">Unggah atau Ambil Gambar</h3>
          <p className="text-[11px] text-gray-400 mt-1">
            Drag & drop foto makanan Anda ke sini, atau gunakan tombol di bawah
          </p>

          <div className="flex gap-3 mt-4">
            <button
              onClick={onCameraClick}
              className="flex-1 h-12 bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-white rounded-xl flex items-center justify-center font-bold text-xs gap-1.5 shadow-sm shadow-emerald-100 transition-all cursor-pointer"
            >
              <Camera size={16} />
              <span>Kamera</span>
            </button>

            <button
              onClick={triggerFileSelect}
              className="flex-1 h-12 bg-sky-500 hover:bg-sky-600 active:scale-98 text-white rounded-xl flex items-center justify-center font-bold text-xs gap-1.5 shadow-sm shadow-sky-100 transition-all cursor-pointer"
            >
              <ImageUp size={16} />
              <span>Galeri</span>
            </button>
          </div>

          <div className="mt-3">
            <button
              onClick={onLiveCameraClick}
              className="w-full h-11 bg-white border border-emerald-100 hover:bg-emerald-50/30 text-emerald-600 hover:text-emerald-700 active:scale-98 rounded-xl flex items-center justify-center font-semibold text-xs gap-1.5 transition-all cursor-pointer"
            >
              <Video size={16} />
              <span>Identifikasi Real-Time (Camera Feed)</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
