import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/scanned_food.dart';
import '../widgets/upload_card.dart';
import '../widgets/history_list.dart';
import '../services/classifier_service.dart';
import '../services/gemini_service.dart';
import '../services/mealdb_service.dart';
import 'result_screen.dart';
import 'webcam_screen.dart';

/// Halaman utama Dashboard Food Recognizer AI yang memuat pelacak gizi harian,
/// grafik lingkaran interaktif (fl_chart), pemicu kamera/galeri, dan riwayat scan ter-enkapsulasi.
class HomeScreen extends StatefulWidget {
  const HomeScreen({Key? key}) : super(key: key);

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final ClassifierService _classifierService = ClassifierService();
  final GeminiService _geminiService = GeminiService();
  
  List<ScannedFood> _history = [];
  bool _isLoadingModel = true;
  bool _isProcessingImage = false;

  // Nilai Asupan Harian Target (BPOM / Kemenkes RI standar)
  final double _targetCalories = 2100.0;
  final double _targetCarbs = 300.0;
  final double _targetProtein = 60.0;
  final double _targetFat = 70.0;

  double _todayCalories = 0.0;
  double _todayCarbs = 0.0;
  double _todayProtein = 0.0;
  double _todayFat = 0.0;

  @override
  void initState() {
    super.initState();
    _initializeModel();
    _loadHistory();
  }

  /// Memuat model klasifikasi TFLite/LiteRT on-device di latar belakang
  Future<void> _initializeModel() async {
    try {
      await _classifierService.loadModel();
    } catch (e) {
      print("⚠️ Model TFLite gagal dimuat. Sistem beralih ke Mode Simulasi Cerdas (Gemini Backup).");
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingModel = false;
        });
      }
    }
  }

  /// Memuat riwayat scan dari SharedPreferences dan menghitung akumulasi nutrisi hari ini
  Future<void> _loadHistory() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final String? jsonStr = prefs.getString('food_scans_history');
      if (jsonStr != null && jsonStr.isNotEmpty) {
        final List<dynamic> decoded = json.decode(jsonStr);
        final List<ScannedFood> loadedList = decoded
            .map((item) => ScannedFood.fromMap(Map<String, dynamic>.from(item)))
            .toList();
        
        // Urutkan berdasarkan waktu pengerjaan terbaru di atas
        loadedList.sort((a, b) => b.timestamp.compareTo(a.timestamp));

        if (mounted) {
          setState(() {
            _history = loadedList;
            _calculateTodayNutrients();
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _history = [];
            _todayCalories = 0.0;
            _todayCarbs = 0.0;
            _todayProtein = 0.0;
            _todayFat = 0.0;
          });
        }
      }
    } catch (e) {
      print("❌ Gagal memuat riwayat: $e");
    }
  }

  /// Menghitung total nutrisi makanan yang discan pada HARI INI
  void _calculateTodayNutrients() {
    final now = DateTime.now();
    double cal = 0.0;
    double carb = 0.0;
    double prot = 0.0;
    double fat = 0.0;

    for (var item in _history) {
      final date = DateTime.fromMillisecondsSinceEpoch(item.timestamp);
      if (date.year == now.year && date.month == now.month && date.day == now.day) {
        cal += item.calories;
        carb += item.carbs;
        prot += item.protein;
        fat += item.fat;
      }
    }

    _todayCalories = cal;
    _todayCarbs = carb;
    _todayProtein = prot;
    _todayFat = fat;
  }

  /// Menambahkan item baru ke riwayat dan menyimpannya secara lokal
  Future<void> _saveToHistory(ScannedFood newFood) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _history.insert(0, newFood); // taruh di posisi teratas
      
      final String jsonStr = json.encode(_history.map((x) => x.toMap()).toList());
      await prefs.setString('food_scans_history', jsonStr);
      
      setState(() {
        _calculateTodayNutrients();
      });
    } catch (e) {
      print("❌ Gagal menyimpan riwayat baru: $e");
    }
  }

  /// Menghapus item dari riwayat
  Future<void> _deleteFromHistory(ScannedFood food) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _history.removeWhere((item) => item.id == food.id);
      
      final String jsonStr = json.encode(_history.map((x) => x.toMap()).toList());
      await prefs.setString('food_scans_history', jsonStr);

      // Hapus file gambar lokal jika ada
      final file = File(food.imagePath);
      if (await file.exists() && !food.imagePath.contains('/assets/')) {
        await file.delete();
      }

      setState(() {
        _calculateTodayNutrients();
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Riwayat scan "${food.name}" berhasil dihapus.')),
      );
    } catch (e) {
      print("❌ Gagal menghapus riwayat: $e");
    }
  }

  /// Menangani gambar yang dipilih (Kamera/Galeri)
  Future<void> _processImageSelection(String imagePath) async {
    setState(() {
      _isProcessingImage = true;
    });

    try {
      String detectedLabel = "Makanan Umum";
      double confidence = 0.90;

      // 1. Jalankan On-Device Classifier jika model termuat
      if (_classifierService.isLoaded) {
        final result = await _classifierService.classifyImage(imagePath);
        if (result != null) {
          detectedLabel = result.label;
          confidence = result.confidence;
          print("🎯 Deteksi On-Device: $detectedLabel (${(confidence*100).toStringAsFixed(1)}%)");
        }
      }

      // 2. Jalankan Analisis Gemini AI untuk Gizi, Halal, & Resep Lengkap
      var scannedFood = await _geminiService.scanAndAnalyzeImage(
        imagePath: imagePath,
        labelName: detectedLabel,
        confidence: confidence,
        modelLoaded: _classifierService.isLoaded,
      );

      if (scannedFood != null) {
        // 3. Panggil MealDB API menggunakan nama makanan dari LiteRT
        try {
          final mealDbService = MealDBService();
          final mealDbRecipe = await mealDbService.fetchRecipe(detectedLabel);
          
          scannedFood = ScannedFood(
            id: scannedFood.id,
            name: scannedFood.name,
            confidence: scannedFood.confidence,
            imagePath: scannedFood.imagePath,
            timestamp: scannedFood.timestamp,
            scientificName: scannedFood.scientificName,
            origin: scannedFood.origin,
            healthAnalysis: scannedFood.healthAnalysis,
            healthTips: scannedFood.healthTips,
            halalStatus: scannedFood.halalStatus,
            halalReason: scannedFood.halalReason,
            suggestedRestaurants: scannedFood.suggestedRestaurants,
            calories: scannedFood.calories,
            carbs: scannedFood.carbs,
            fat: scannedFood.fat,
            fiber: scannedFood.fiber,
            protein: scannedFood.protein,
            hasRecipe: mealDbRecipe['hasRecipe'] ?? false,
            recipeTitle: mealDbRecipe['title'] ?? detectedLabel,
            recipeThumb: mealDbRecipe['thumb'] ?? '',
            recipeIngredients: mealDbRecipe['ingredients'] ?? '',
            recipeInstructions: mealDbRecipe['instructions'] ?? '',
            isSimulated: scannedFood.isSimulated,
            tfliteModelLoaded: scannedFood.tfliteModelLoaded,
            isFavorite: scannedFood.isFavorite,
          );
        } catch (recipeErr) {
          print("⚠️ Gagal mengambil resep dari MealDB: $recipeErr");
        }

        // Simpan ke riwayat lokal
        await _saveToHistory(scannedFood);

        // Arahkan langsung ke halaman hasil rincian
        if (mounted) {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => ResultScreen(
                food: scannedFood,
                onFavoriteToggle: () {
                  setState(() {
                    scannedFood!.isFavorite = !scannedFood!.isFavorite;
                    _loadHistory();
                  });
                },
              ),
            ),
          );
        }
      } else {
        throw Exception("Gagal mendapatkan hasil analisis dari server.");
      }
    } catch (e) {
      print("❌ Proses klasifikasi gagal: $e");
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Gagal menganalisis gambar: ${e.toString()}')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isProcessingImage = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text(
          "NutriHalal AI",
          style: TextStyle(
            fontWeight: FontWeight.w900,
            fontSize: 20,
            color: Color(0xFF0F172A),
            letterSpacing: -0.5,
          ),
        ),
        centerTitle: false,
        elevation: 0,
        backgroundColor: Colors.transparent,
        actions: [
          // Live Webcam Scan Action
          IconButton(
            icon: const Icon(Icons.videocam_outlined, color: Color(0xFF3B82F6), size: 26),
            tooltip: "Mulai Deteksi Kamera Live",
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => WebcamScreen(
                    classifierService: _classifierService,
                    geminiService: _geminiService,
                    onResultAnalyzed: (ScannedFood scannedFood) {
                      _saveToHistory(scannedFood);
                    },
                  ),
                ),
              ).then((_) => _loadHistory());
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: _isProcessingImage
          ? _buildLoadingOverlay()
          : SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 1. Pelacak Gizi Donut Chart Card
                  _buildNutritionTrackerCard(),
                  const SizedBox(height: 24),

                  // 2. Upload Box untuk Ambil Gambar
                  UploadCard(
                    onImageSelected: _processImageSelection,
                  ),
                  const SizedBox(height: 28),

                  // 3. Header Riwayat
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        "Riwayat Pemindaian",
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1E293B),
                        ),
                      ),
                      if (_history.isNotEmpty)
                        TextButton(
                          onPressed: () {
                            showDialog(
                              context: context,
                              builder: (context) => AlertDialog(
                                title: const Text("Hapus Semua Riwayat?"),
                                content: const Text("Tindakan ini akan menghapus semua rekaman riwayat secara permanen dari perangkat Anda."),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.pop(context),
                                    child: const Text("Batal"),
                                  ),
                                  TextButton(
                                    onPressed: () async {
                                      final prefs = await SharedPreferences.getInstance();
                                      await prefs.remove('food_scans_history');
                                      Navigator.pop(context);
                                      _loadHistory();
                                    },
                                    child: const Text("Hapus Semua", style: TextStyle(color: Colors.red)),
                                  ),
                                ],
                              ),
                            );
                          },
                          child: const Text("Bersihkan", style: TextStyle(color: Color(0xFFEF4444))),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // 4. List Riwayat
                  HistoryList(
                    items: _history,
                    onTapItem: (food) {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => ResultScreen(
                            food: food,
                            onFavoriteToggle: () {
                              setState(() {
                                food.isFavorite = !food.isFavorite;
                                _loadHistory();
                              });
                            },
                          ),
                        ),
                      );
                    },
                    onDeleteItem: _deleteFromHistory,
                  ),
                  const SizedBox(height: 30),
                ],
              ),
            ),
    );
  }

  /// Donut Chart Card yang menyajikan rincian target kalori & makro harian
  Widget _buildNutritionTrackerCard() {
    final double calPercent = (_todayCalories / _targetCalories) * 100;
    
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A), // Premium Dark Slate Background
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0F172A).withOpacity(0.2),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          // Left: Interactive Donut Chart using fl_chart
          SizedBox(
            width: 110,
            height: 110,
            child: Stack(
              children: [
                PieChart(
                  PieChartData(
                    sectionsSpace: 4,
                    centerSpaceRadius: 40,
                    startDegreeOffset: 270,
                    sections: [
                      // Carbs (Blue)
                      PieChartSectionData(
                        color: const Color(0xFF3B82F6),
                        value: _todayCarbs.clamp(1, double.infinity),
                        title: '',
                        radius: 8,
                      ),
                      // Protein (Orange)
                      PieChartSectionData(
                        color: const Color(0xFFF97316),
                        value: _todayProtein.clamp(1, double.infinity),
                        title: '',
                        radius: 8,
                      ),
                      // Fat (Yellow)
                      PieChartSectionData(
                        color: const Color(0xFFEAB308),
                        value: _todayFat.clamp(1, double.infinity),
                        title: '',
                        radius: 8,
                      ),
                      // Target Empty Gap (Grey if today's intake is low)
                      if (_todayCalories < 1)
                        PieChartSectionData(
                          color: Colors.white.withOpacity(0.1),
                          value: 100,
                          title: '',
                          radius: 5,
                        ),
                    ],
                  ),
                ),
                // Center text
                Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        _todayCalories.toStringAsFixed(0),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                        ),
                      ),
                      const Text(
                        "kkal",
                        style: TextStyle(
                          fontSize: 10,
                          color: Colors.grey,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 22),
          // Right: Macro List
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Asupan Gizi Hari Ini",
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  "Target: ${_targetCalories.toStringAsFixed(0)} kkal harian (${calPercent.toStringAsFixed(0)}% tercapai)",
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.grey[400],
                  ),
                ),
                const SizedBox(height: 12),
                // Macro detail indicators
                _buildMacroBarIndicator(
                  "Karbohidrat", 
                  _todayCarbs, 
                  _targetCarbs, 
                  const Color(0xFF3B82F6),
                ),
                const SizedBox(height: 6),
                _buildMacroBarIndicator(
                  "Protein", 
                  _todayProtein, 
                  _targetProtein, 
                  const Color(0xFFF97316),
                ),
                const SizedBox(height: 6),
                _buildMacroBarIndicator(
                  "Lemak", 
                  _todayFat, 
                  _targetFat, 
                  const Color(0xFFEAB308),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Sub-widget to show a simple custom bar progress
  Widget _buildMacroBarIndicator(String label, double current, double target, Color color) {
    final double pct = (current / target).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              label,
              style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w500),
            ),
            Text(
              "${current.toStringAsFixed(0)}g / ${target.toStringAsFixed(0)}g",
              style: TextStyle(fontSize: 10, color: Colors.grey[300], fontWeight: FontWeight.bold),
            ),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(3),
          child: LinearProgressIndicator(
            value: pct,
            backgroundColor: Colors.white.withOpacity(0.08),
            valueColor: AlwaysStoppedAnimation<Color>(color),
            minHeight: 4,
          ),
        ),
      ],
    );
  }

  /// Full-screen modern loading overlay during scanning
  Widget _buildLoadingOverlay() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SizedBox(
              width: 60,
              height: 60,
              child: CircularProgressIndicator(
                strokeWidth: 4.5,
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF3B82F6)),
              ),
            ),
            const SizedBox(height: 32),
            const Text(
              "Menganalisis Makanan",
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              "Gemini AI sedang memperhitungkan gizi lengkap, merumuskan resep hidangan, dan melakukan audit status kehalalan...",
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey[500],
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _classifierService.dispose();
    super.dispose();
  }
}
