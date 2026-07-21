import 'dart:convert';

/// Model data untuk menyimpan riwayat hasil pemindaian makanan,
/// kandungan gizi, status kehalalan, serta resep tradisional terkait.
class ScannedFood {
  final int id;
  final String name;
  final double confidence;
  final String imagePath;
  final int timestamp;
  
  final String? scientificName;
  final String? origin;
  final String? healthAnalysis;
  final List<String>? healthTips;
  final String? halalStatus; // "Halal", "Syubhah", "Non-Halal"
  final String? halalReason;
  final List<SuggestedRestaurant>? suggestedRestaurants;
  
  // Informasi Nilai Gizi
  final double calories;
  final double carbs;
  final double fat;
  final double fiber;
  final double protein;
  
  // Informasi Resep (MealDB atau Fallback)
  final bool hasRecipe;
  final String recipeTitle;
  final String recipeThumb;
  final String recipeIngredients; // Semicolon (;) separated list
  final String recipeInstructions;
  final bool isSimulated;
  final bool tfliteModelLoaded;
  bool isFavorite;

  ScannedFood({
    required this.id,
    required this.name,
    required this.confidence,
    required this.imagePath,
    required this.timestamp,
    this.scientificName,
    this.origin,
    this.healthAnalysis,
    this.healthTips,
    this.halalStatus,
    this.halalReason,
    this.suggestedRestaurants,
    required this.calories,
    required this.carbs,
    required this.fat,
    required this.fiber,
    required this.protein,
    required this.hasRecipe,
    required this.recipeTitle,
    required this.recipeThumb,
    required this.recipeIngredients,
    required this.recipeInstructions,
    this.isSimulated = false,
    this.tfliteModelLoaded = true,
    this.isFavorite = false,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'confidence': confidence,
      'imagePath': imagePath,
      'timestamp': timestamp,
      'scientificName': scientificName,
      'origin': origin,
      'healthAnalysis': healthAnalysis,
      'healthTips': healthTips,
      'halalStatus': halalStatus,
      'halalReason': halalReason,
      'suggestedRestaurants': suggestedRestaurants?.map((x) => x.toMap()).toList(),
      'calories': calories,
      'carbs': carbs,
      'fat': fat,
      'fiber': fiber,
      'protein': protein,
      'hasRecipe': hasRecipe,
      'recipeTitle': recipeTitle,
      'recipeThumb': recipeThumb,
      'recipeIngredients': recipeIngredients,
      'recipeInstructions': recipeInstructions,
      'isSimulated': isSimulated,
      'tfliteModelLoaded': tfliteModelLoaded,
      'isFavorite': isFavorite,
    };
  }

  factory ScannedFood.fromMap(Map<String, dynamic> map) {
    return ScannedFood(
      id: map['id']?.toInt() ?? 0,
      name: map['name'] ?? '',
      confidence: map['confidence']?.toDouble() ?? 0.0,
      imagePath: map['imagePath'] ?? '',
      timestamp: map['timestamp']?.toInt() ?? 0,
      scientificName: map['scientificName'],
      origin: map['origin'],
      healthAnalysis: map['healthAnalysis'],
      healthTips: map['healthTips'] != null ? List<String>.from(map['healthTips']) : null,
      halalStatus: map['halalStatus'],
      halalReason: map['halalReason'],
      suggestedRestaurants: map['suggestedRestaurants'] != null
          ? List<SuggestedRestaurant>.from(map['suggestedRestaurants']?.map((x) => SuggestedRestaurant.fromMap(x)))
          : null,
      calories: map['calories']?.toDouble() ?? 0.0,
      carbs: map['carbs']?.toDouble() ?? 0.0,
      fat: map['fat']?.toDouble() ?? 0.0,
      fiber: map['fiber']?.toDouble() ?? 0.0,
      protein: map['protein']?.toDouble() ?? 0.0,
      hasRecipe: map['hasRecipe'] ?? false,
      recipeTitle: map['recipeTitle'] ?? '',
      recipeThumb: map['recipeThumb'] ?? '',
      recipeIngredients: map['recipeIngredients'] ?? '',
      recipeInstructions: map['recipeInstructions'] ?? '',
      isSimulated: map['isSimulated'] ?? false,
      tfliteModelLoaded: map['tfliteModelLoaded'] ?? true,
      isFavorite: map['isFavorite'] ?? false,
    );
  }

  String toJson() => json.encode(toMap());

  factory ScannedFood.fromJson(String source) => ScannedFood.fromMap(json.decode(source));
}

/// Model untuk rekomendasi restoran terdekat
class SuggestedRestaurant {
  final String name;
  final String address;
  final double? rating;
  final String? distance;

  SuggestedRestaurant({
    required this.name,
    required this.address,
    this.rating,
    this.distance,
  });

  Map<String, dynamic> toMap() {
    return {
      'name': name,
      'address': address,
      'rating': rating,
      'distance': distance,
    };
  }

  factory SuggestedRestaurant.fromMap(Map<String, dynamic> map) {
    return SuggestedRestaurant(
      name: map['name'] ?? '',
      address: map['address'] ?? '',
      rating: map['rating']?.toDouble(),
      distance: map['distance'],
    );
  }
}
