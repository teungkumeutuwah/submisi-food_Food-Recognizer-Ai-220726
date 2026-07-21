export interface ScannedFood {
  id: number;
  name: string;
  confidence: number;
  imagePath: string; // Data URL / Object URL for display
  timestamp: number;
  
  // New Fields requested by user
  scientificName?: string;     // Scientific Name (Nama Ilmiah)
  origin?: string;             // Food Origin (Asal Makanan)
  healthAnalysis?: string;     // Qualitative Health & Nutrition Analysis
  healthTips?: string[];       // Dynamic health & consumption tips (Tips Kesehatan)
  halalStatus?: string;        // Halal status ("Halal", "Syubhah", "Non-Halal")
  halalReason?: string;        // Explanation of halal status
  suggestedRestaurants?: Array<{
    name: string;
    address: string;
    rating?: number;
    distance?: string;
  }>;
  
  // Nutrition Info
  calories: number;
  carbs: number;
  fat: number;
  fiber: number;
  protein: number;
  
  // Recipe Info (from MealDB)
  hasRecipe: boolean;
  recipeTitle: string;
  recipeThumb: string;
  recipeIngredients: string; // Semicolon separated list
  recipeInstructions: string;
  isSimulated?: boolean; // True if returned from server simulation due to API limits
  simulationReason?: "quota_exceeded" | "missing_api_key" | "other_error" | null;
  tfliteModelLoaded?: boolean;
  isFavorite?: boolean;
}
