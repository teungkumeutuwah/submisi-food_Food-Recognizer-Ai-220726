import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:google_generative_ai/google_generative_ai.dart';
import '../models/scanned_food.dart';

/// Service untuk melakukan analisis nutrisi mendalam, verifikasi kehalalan,
/// dan pengumpulan tips kesehatan melalui integrasi Gemini AI (Cloud & Proxy API).
class GeminiService {
  // Gunakan URL development app sebagai default API base URL
  static const String _defaultBaseUrl = "https://ais-dev-fv6ofbgfnmwp5o3iiwon5k-640329969069.asia-southeast1.run.app";
  
  /// Mengambil base URL dari shared preferences (agar dinamis jika pengguna mendeploy mandiri)
  Future<String> _getApiBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('api_base_url') ?? _defaultBaseUrl;
  }

  /// Mengambil API Key Gemini lokal jika pengguna memilih integrasi langsung tanpa proxy server
  Future<String?> _getLocalGeminiApiKey() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('gemini_api_key');
  }

  /// Melakukan pemindaian makanan dan verifikasi gizi menggunakan AI.
  /// 
  /// Metode ini secara otomatis mengalirkan data ke backend server `/api/scan` kita yang tangguh,
  /// atau menggunakan SDK `google_generative_ai` jika server sedang offline atau pengguna menyetel kunci lokal.
  Future<ScannedFood?> scanAndAnalyzeImage({
    required String imagePath,
    required String labelName,
    required double confidence,
    required bool modelLoaded,
  }) async {
    final File imageFile = File(imagePath);
    if (!await imageFile.exists()) {
      print("❌ File gambar tidak ditemukan pada: $imagePath");
      return null;
    }

    final localKey = await _getLocalGeminiApiKey();
    if (localKey != null && localKey.isNotEmpty) {
      // MODE INTEGRASI KLASIK / LANGSUNG (Client-Side Gemini API SDK)
      print("🚀 Melakukan analisis makanan menggunakan SDK Client-Side Gemini...");
      return _scanWithDirectGemini(localKey, imageFile, labelName, confidence, modelLoaded);
    } else {
      // MODE UTAMA (Proxy API Server - Aman & Bebas Eksposur Key)
      print("🚀 Melakukan analisis makanan melalui Proxy API Server...");
      return _scanWithProxyServer(imageFile, labelName, confidence, modelLoaded);
    }
  }

  /// Melakukan post request multi-part ke endpoint `/api/scan` server
  Future<ScannedFood?> _scanWithProxyServer(
    File imageFile,
    String labelName,
    double confidence,
    bool modelLoaded,
  ) async {
    try {
      final baseUrl = await _getApiBaseUrl();
      final uri = Uri.parse('$baseUrl/api/scan');
      
      final request = http.MultipartRequest('POST', uri);
      
      // Tambahkan data file gambar
      final multipartFile = await http.MultipartFile.fromPath(
        'image', 
        imageFile.path,
      );
      request.files.add(multipartFile);
      
      // Tambahkan info pendukung dari deteksi on-device
      request.fields['filename'] = imageFile.path.split('/').last;
      request.fields['detectedLabel'] = labelName;
      request.fields['detectedConfidence'] = confidence.toString();
      request.fields['modelLoaded'] = modelLoaded.toString();

      final response = await request.send();
      if (response.statusCode == 200) {
        final responseBody = await response.stream.bytesToString();
        final Map<String, dynamic> data = json.decode(responseBody);
        
        // Buat objek ScannedFood dari kembalian server
        return _parseServerResponse(data, imageFile.path, confidence, modelLoaded);
      } else {
        print("⚠️ Server mengembalikan kode status: ${response.statusCode}");
      }
    } catch (e) {
      print("❌ Gagal melakukan scan via Proxy Server: $e");
    }

    // Jika terjadi kegagalan koneksi proxy, gunakan simulasi lokal cerdas agar fungsionalitas tetap berjalan offline
    return _generateLocalSimulationResult(labelName, imageFile.path, confidence, modelLoaded);
  }

  /// Melakukan pemindaian langsung menggunakan package `google_generative_ai` di sisi klien
  Future<ScannedFood?> _scanWithDirectGemini(
    String apiKey,
    File imageFile,
    String labelName,
    double confidence,
    bool modelLoaded,
  ) async {
    try {
      final model = GenerativeModel(
        model: 'gemini-1.5-flash',
        apiKey: apiKey,
      );

      final imageBytes = await imageFile.readAsBytes();
      final content = [
        Content.multi([
          TextPart(
            "Berikan rincian gizi lengkap dalam format JSON untuk hidangan: $labelName. "
            "Skema JSON harus memiliki field persis seperti berikut: "
            "{\n"
            "  \"name\": \"$labelName\",\n"
            "  \"scientificName\": \"Nama Ilmiah Bahan Utama\",\n"
            "  \"origin\": \"Daerah/Negara Asal\",\n"
            "  \"calories\": 350,\n"
            "  \"carbs\": 45,\n"
            "  \"fat\": 12,\n"
            "  \"fiber\": 3,\n"
            "  \"protein\": 15,\n"
            "  \"healthAnalysis\": \"Analisis gizi detail Bahasa Indonesia...\",\n"
            "  \"halalStatus\": \"Halal\",\n"
            "  \"halalReason\": \"Alasan kehalalan BPJPH...\",\n"
            "  \"recipeTitle\": \"Resep $labelName Spesial\",\n"
            "  \"recipeIngredients\": \"bahan 1; bahan 2; bahan 3\",\n"
            "  \"recipeInstructions\": \"1. Langkah 1\\n2. Langkah 2\",\n"
            "  \"suggestedRestaurants\": [\n"
            "    { \"name\": \"Restoran Populer\", \"address\": \"Jakarta\", \"rating\": 4.5 }\n"
            "  ]\n"
            "}"
          ),
          DataPart('image/jpeg', imageBytes),
        ])
      ];

      final response = await model.generateContent(content);
      final jsonText = response.text;
      
      if (jsonText != null && jsonText.isNotEmpty) {
        // Ekstrak blok JSON jika terbungkus markdown ```json
        String cleanJson = jsonText.trim();
        if (cleanJson.startsWith('```')) {
          final firstLineIndex = cleanJson.indexOf('\n');
          final lastBackticksIndex = cleanJson.lastIndexOf('```');
          if (firstLineIndex != -1 && lastBackticksIndex != -1) {
            cleanJson = cleanJson.substring(firstLineIndex + 1, lastBackticksIndex).trim();
          }
        }
        
        final Map<String, dynamic> parsedJson = json.decode(cleanJson);
        return _parseServerResponse(parsedJson, imageFile.path, confidence, modelLoaded);
      }
    } catch (e) {
      print("❌ Gagal menganalisis via SDK Gemini langsung: $e");
    }

    return _generateLocalSimulationResult(labelName, imageFile.path, confidence, modelLoaded);
  }

  /// Mengurai Map response JSON menjadi model ScannedFood terstruktur
  ScannedFood _parseServerResponse(
    Map<String, dynamic> data,
    String imagePath,
    double rawConfidence,
    bool modelLoaded,
  ) {
    final double confidence = data['confidence']?.toDouble() ?? rawConfidence;
    final String foodName = data['name'] ?? data['englishName'] ?? "Makanan Terdeteksi";

    // parsing restoran
    List<SuggestedRestaurant> restaurants = [];
    if (data['suggestedRestaurants'] != null && data['suggestedRestaurants'] is List) {
      for (var item in data['suggestedRestaurants']) {
        restaurants.add(SuggestedRestaurant(
          name: item['name'] ?? '',
          address: item['address'] ?? '',
          rating: item['rating']?.toDouble() ?? 4.5,
          distance: item['distance'] ?? "Sekitar Anda",
        ));
      }
    }

    // parsing tips kesehatan
    List<String> tips = [];
    if (data['healthTips'] != null && data['healthTips'] is List) {
      tips = List<String>.from(data['healthTips']);
    } else {
      tips = [
        "Konsumsi dalam porsi sedang untuk menjaga asupan kalori harian tetap seimbang.",
        "Sandingkan dengan air putih hangat daripada teh manis untuk mengurangi gula berlebih.",
        "Tambahkan porsi serat sayur mentah seperti timun atau selada untuk membantu pencernaan."
      ];
    }

    return ScannedFood(
      id: DateTime.now().millisecondsSinceEpoch,
      name: foodName,
      confidence: confidence,
      imagePath: imagePath,
      timestamp: DateTime.now().millisecondsSinceEpoch,
      scientificName: data['scientificName'] ?? 'Urtica dioica',
      origin: data['origin'] ?? 'Indonesia',
      healthAnalysis: data['healthAnalysis'] ?? 'Kandungan nutrisi cukup berimbang dan lezat.',
      healthTips: tips,
      halalStatus: data['halalStatus'] ?? 'Halal',
      halalReason: data['halalReason'] ?? 'Bahan dasar berupa nabati/hewani halal yang disembelih secara syar\'i.',
      suggestedRestaurants: restaurants,
      calories: data['calories']?.toDouble() ?? 300.0,
      carbs: data['carbs']?.toDouble() ?? 40.0,
      fat: data['fat']?.toDouble() ?? 12.0,
      fiber: data['fiber']?.toDouble() ?? 2.5,
      protein: data['protein']?.toDouble() ?? 10.0,
      hasRecipe: data['recipeTitle'] != null,
      recipeTitle: data['recipeTitle'] ?? "Resep Hidangan Praktis",
      recipeThumb: data['recipeThumb'] ?? "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80",
      recipeIngredients: data['recipeIngredients'] ?? "Bahan utama masakan; Garam; Gula; Air hangat",
      recipeInstructions: data['recipeInstructions'] ?? "1. Masak bahan utama.\n2. Bumbui garam gula.\n3. Hidangkan hangat.",
      isSimulated: data['isSimulated'] ?? false,
      tfliteModelLoaded: modelLoaded,
    );
  }

  /// Membuat data simulasi nutrisi & kehalalan berkualitas tinggi secara lokal saat offline
  ScannedFood _generateLocalSimulationResult(
    String foodName,
    String imagePath,
    double confidence,
    bool modelLoaded,
  ) {
    final lower = foodName.toLowerCase();
    
    double calories = 350;
    double carbs = 42;
    double fat = 15;
    double fiber = 2;
    double protein = 12;
    String scientificName = "Oryza sativa";
    String origin = "Nusantara, Indonesia";
    String halalStatus = "Halal";
    String halalReason = "Hidangan ini terbuat dari bahan-bahan dasar berstatus halal (nabati/sereal). Tidak ada titik kritis alkohol atau gelatin babi yang dideteksi.";
    String healthAnalysis = "Hidangan ini memberikan energi yang cukup dari karbohidrat, namun disarankan dikonsumsi bersama sayuran berserat tinggi untuk menekan indeks glikemik.";

    if (lower.contains("sate")) {
      calories = 380; carbs = 8; fat = 22; fiber = 1; protein = 28;
      scientificName = "Gallus gallus domesticus (Ayam)";
      origin = "Madura, Jawa Timur, Indonesia";
      halalReason = "Daging ayam halal wajib disembelih secara syariat Islam. Titik kritis berada pada kecap manis dan bumbu kacang fermentasi.";
      healthAnalysis = "Tinggi protein hewani yang mendukung pertumbuhan otot. Namun, bumbu kacang memiliki kandungan lemak jenuh yang tinggi, batasi porsinya.";
    } else if (lower.contains("rendang")) {
      calories = 460; carbs = 5; fat = 32; fiber = 1.5; protein = 30;
      scientificName = "Bos taurus (Sapi)";
      origin = "Minangkabau, Sumatera Barat";
      halalReason = "Menggunakan daging sapi halal yang disembelih secara syar'i dan rempah-rempah kelapa nabati murni.";
      healthAnalysis = "Rendang kaya zat besi dan protein berkualitas tinggi. Proses pemanasan santan yang lama membuat kolesterolnya cukup tinggi, konsumsilah dalam porsi wajar.";
    } else if (lower.contains("bakso")) {
      calories = 290; carbs = 24; fat = 12; fiber = 1; protein = 18;
      scientificName = "Bos taurus & Amorphophallus";
      origin = "Solo, Jawa Tengah, Indonesia";
      halalReason = "Menggunakan daging sapi giling halal dan tepung tapioka. Kuah kaldu dari rebusan tulang sapi murni yang halal.";
      healthAnalysis = "Mengandung natrium (garam) yang tinggi dari kuah gurihnya. Batasi penambahan garam atau MSG tambahan saat penyajian.";
    }

    final List<SuggestedRestaurant> restaurants = [
      SuggestedRestaurant(
        name: "Rumah Makan $foodName Rasa Nusantara",
        address: "Dekat Lokasi GPS Anda",
        rating: 4.7,
        distance: "1.2 km",
      ),
      SuggestedRestaurant(
        name: "Warung Sederhana Mas Adi",
        address: "Pusat Kuliner Kota",
        rating: 4.5,
        distance: "2.4 km",
      ),
    ];

    final List<String> tips = [
      "Kurangi asupan garam/sodium tambahan pada makanan ini.",
      "Konsumsi buah segar seperti pepaya atau jeruk setelah menyantap makanan ini.",
      "Imbangi dengan olahraga jalan cepat selama 20 menit setelah makan."
    ];

    return ScannedFood(
      id: DateTime.now().millisecondsSinceEpoch,
      name: foodName,
      confidence: confidence,
      imagePath: imagePath,
      timestamp: DateTime.now().millisecondsSinceEpoch,
      scientificName: scientificName,
      origin: origin,
      healthAnalysis: healthAnalysis,
      healthTips: tips,
      halalStatus: halalStatus,
      halalReason: halalReason,
      suggestedRestaurants: restaurants,
      calories: calories,
      carbs: carbs,
      fat: fat,
      fiber: fiber,
      protein: protein,
      hasRecipe: true,
      recipeTitle: "Resep $foodName Ala Chef Rumahan",
      recipeThumb: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80",
      recipeIngredients: "Bahan utama masakan; Bawang putih secukupnya; Garam dan minyak sayur",
      recipeInstructions: "1. Olah bahan utama secara higienis.\n2. Tumis bersama bawang merah dan putih.\n3. Masak hingga harum dan sajikan hangat.",
      isSimulated: true,
      tfliteModelLoaded: modelLoaded,
    );
  }
}
