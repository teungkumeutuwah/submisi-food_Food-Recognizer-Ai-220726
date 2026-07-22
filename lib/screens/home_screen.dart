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

  /// Menghitung data konsumsi harian selama 7 hari terakhir
  List<DailyIntake> _getWeeklyIntakeData() {
    final List<DailyIntake> data = [];
    final now = DateTime.now();
    
    // Ambil 7 hari terakhir (dari 6 hari lalu sampai hari ini)
    for (int i = 6; i >= 0; i--) {
      final date = now.subtract(Duration(days: i));
      double cal = 0.0;
      double carbs = 0.0;
      double protein = 0.0;
      double fat = 0.0;
      
      for (var item in _history) {
        final itemDate = DateTime.fromMillisecondsSinceEpoch(item.timestamp);
        if (itemDate.year == date.year && itemDate.month == date.month && itemDate.day == date.day) {
          cal += item.calories;
          carbs += item.carbs;
          protein += item.protein;
          fat += item.fat;
        }
      }
      
      data.add(DailyIntake(
        date: date,
        calories: cal,
        carbs: carbs,
        protein: protein,
        fat: fat,
      ));
    }
    
    return data;
  }

  /// Mendapatkan nama hari kustom bahasa Indonesia
  String _getDayName(DateTime date) {
    const dayNames = {
      DateTime.monday: "Sen",
      DateTime.tuesday: "Sel",
      DateTime.wednesday: "Rab",
      DateTime.thursday: "Kam",
      DateTime.friday: "Jum",
      DateTime.saturday: "Sab",
      DateTime.sunday: "Min",
    };
    return dayNames[date.weekday] ?? "";
  }

  /// Mendapatkan saran gizi berbasis konsumsi kalori mingguan
  String _getWeeklyIntakeFeedback(double avgCal, List<DailyIntake> data) {
    if (avgCal == 0) {
      return "Anda belum memindai hidangan apa pun minggu ini. Silakan pindai foto hidangan atau gunakan kamera live untuk melacak konsumsi dan asupan nutrisi mingguan Anda secara presisi!";
    }
    
    if (avgCal < 1200) {
      return "Asupan kalori mingguan Anda berada di bawah rata-rata kebutuhan harian minimum. Pastikan Anda mengonsumsi porsi makan yang cukup dengan proporsi Karbohidrat, Protein, dan Lemak yang seimbang demi menjaga metabolisme tubuh tetap optimal.";
    } else if (avgCal > _targetCalories * 1.15) {
      return "Asupan kalori mingguan Anda cenderung melebihi target rekomendasi harian BPOM RI (${_targetCalories.toStringAsFixed(0)} kkal). Cobalah untuk membatasi makanan tinggi lemak/minyak dan seimbangkan dengan asupan berserat seperti sayur dan buah lokal.";
    } else {
      return "Luar biasa! Pola makan dan asupan energi mingguan Anda sangat seimbang dan berada di rentang ideal target harian harian Anda. Pertahankan konsistensi ini untuk stamina tubuh yang prima dan kesehatan jangka panjang!";
    }
  }

  /// Menampilkan modal rincian mingguan interaktif
  void _showWeeklyAnalysisSheet() {
    final weeklyData = _getWeeklyIntakeData();
    
    double totalCal = 0.0;
    double maxCal = 0.0;
    String peakDay = "Belum Ada";
    
    for (var d in weeklyData) {
      totalCal += d.calories;
      if (d.calories > maxCal) {
        maxCal = d.calories;
        peakDay = "${_getDayName(d.date)} (${d.date.day}/${d.date.month})";
      }
    }
    
    final avgCal = totalCal / 7;
    
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Container(
              height: MediaQuery.of(context).size.height * 0.82,
              decoration: const BoxDecoration(
                color: Color(0xFF0F172A), // Premium Dark Slate Background
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(28),
                  topRight: Radius.circular(28),
                ),
              ),
              child: Stack(
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 12),
                      Center(
                        child: Container(
                          width: 48,
                          height: 5,
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  "Analisis Gizi Mingguan",
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w900,
                                    color: Colors.white,
                                    letterSpacing: -0.2,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  "Perkembangan asupan kalori & nutrisi makro 7 hari terakhir",
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: Colors.grey[400],
                                  ),
                                ),
                              ],
                            ),
                            GestureDetector(
                              onTap: () => Navigator.pop(context),
                              child: Container(
                                padding: const EdgeInsets.all(6),
                                decoration: BoxDecoration(
                                  color: Colors.white.withOpacity(0.08),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.close, color: Colors.white70, size: 18),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                      
                      Expanded(
                        child: SingleChildScrollView(
                          physics: const BouncingScrollPhysics(),
                          padding: const EdgeInsets.symmetric(horizontal: 24),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                height: 210,
                                width: double.infinity,
                                padding: const EdgeInsets.only(top: 16, right: 16, left: 0, bottom: 8),
                                decoration: BoxDecoration(
                                  color: Colors.black.withOpacity(0.2),
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(
                                    color: Colors.white.withOpacity(0.05),
                                    width: 1,
                                  ),
                                ),
                                child: _buildWeeklyBarChart(weeklyData),
                              ),
                              const SizedBox(height: 20),
                              
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  _buildLegendItem(const Color(0xFF3B82F6), "Karbohidrat"),
                                  const SizedBox(width: 16),
                                  _buildLegendItem(const Color(0xFFF97316), "Protein"),
                                  const SizedBox(width: 16),
                                  _buildLegendItem(const Color(0xFFEAB308), "Lemak"),
                                ],
                              ),
                              const SizedBox(height: 24),
                              
                              const Text(
                                "Ringkasan Nutrisi",
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                              ),
                              const SizedBox(height: 12),
                              
                              Row(
                                children: [
                                  Expanded(
                                    child: _buildSummaryStatBox(
                                      title: "Rata-rata Kalori",
                                      value: "${avgCal.toStringAsFixed(0)} kkal",
                                      icon: Icons.insights_rounded,
                                      color: const Color(0xFF3B82F6),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: _buildSummaryStatBox(
                                      title: "Total Mingguan",
                                      value: "${totalCal.toStringAsFixed(0)} kkal",
                                      icon: Icons.dashboard_outlined,
                                      color: const Color(0xFF10B981),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              
                              Row(
                                children: [
                                  Expanded(
                                    child: _buildSummaryStatBox(
                                      title: "Konsumsi Tertinggi",
                                      value: maxCal > 0 ? "${maxCal.toStringAsFixed(0)} kkal" : "N/A",
                                      subText: maxCal > 0 ? "Hari $peakDay" : null,
                                      icon: Icons.trending_up_rounded,
                                      color: const Color(0xFFF59E0B),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: _buildSummaryStatBox(
                                      title: "Target Harian",
                                      value: "${_targetCalories.toStringAsFixed(0)} kkal",
                                      subText: "BPOM RI Standard",
                                      icon: Icons.track_changes_rounded,
                                      color: const Color(0xFFEC4899),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 24),
                              
                              Container(
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: Colors.white.withOpacity(0.04),
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                    color: Colors.white.withOpacity(0.06),
                                    width: 1,
                                  ),
                                ),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Icon(
                                      Icons.wb_sunny_rounded,
                                      color: Color(0xFFEAB308),
                                      size: 20,
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          const Text(
                                            "Rekomendasi Ahli Gizi AI",
                                            style: TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.bold,
                                              color: Colors.white,
                                            ),
                                          ),
                                          const SizedBox(height: 6),
                                          Text(
                                            _getWeeklyIntakeFeedback(avgCal, weeklyData),
                                            style: TextStyle(
                                              fontSize: 11,
                                              color: Colors.grey[300],
                                              height: 1.5,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 40),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  /// Membuat visualisasi grafik batang fl_chart untuk rincian kalori mingguan
  Widget _buildWeeklyBarChart(List<DailyIntake> data) {
    double maxVal = _targetCalories * 1.2;
    for (var d in data) {
      if (d.calories > maxVal) {
        maxVal = d.calories;
      }
    }
    maxVal = (maxVal / 500).ceil() * 500.0;
    if (maxVal < 1000) maxVal = 2500.0;

    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceAround,
        maxY: maxVal,
        barTouchData: BarTouchData(
          enabled: true,
          touchTooltipData: BarTouchTooltipData(
            getTooltipColor: (group) => const Color(0xFF1E293B),
            tooltipPadding: const EdgeInsets.all(10),
            tooltipMargin: 8,
            getTooltipItem: (group, groupIndex, rod, rodIndex) {
              final d = data[groupIndex];
              return BarTooltipItem(
                "${_getDayName(d.date)}\n",
                const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
                children: [
                  TextSpan(
                    text: "${d.calories.toStringAsFixed(0)} kkal\n",
                    style: const TextStyle(
                      color: Color(0xFF3B82F6),
                      fontWeight: FontWeight.w900,
                      fontSize: 13,
                    ),
                  ),
                  TextSpan(
                    text: "K: ${d.carbs.toStringAsFixed(0)}g  |  P: ${d.protein.toStringAsFixed(0)}g  |  L: ${d.fat.toStringAsFixed(0)}g",
                    style: TextStyle(
                      color: Colors.grey[300],
                      fontWeight: FontWeight.normal,
                      fontSize: 10,
                    ),
                  ),
                ],
              );
            },
          ),
        ),
        titlesData: FlTitlesData(
          show: true,
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (value, meta) {
                final int idx = value.toInt();
                if (idx >= 0 && idx < data.length) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      _getDayName(data[idx].date),
                      style: const TextStyle(
                        color: Colors.white60,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  );
                }
                return const SizedBox();
              },
              reservedSize: 32,
            ),
          ),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 42,
              getTitlesWidget: (value, meta) {
                if (value == 0) return const SizedBox();
                return Text(
                  "${value.toInt()}",
                  style: const TextStyle(
                    color: Colors.white30,
                    fontSize: 9,
                  ),
                );
              },
            ),
          ),
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          getDrawingHorizontalLine: (value) {
            return FlLine(
              color: Colors.white.withOpacity(0.04),
              strokeWidth: 1,
              dashArray: [5, 5],
            );
          },
        ),
        borderData: FlBorderData(show: false),
        barGroups: List.generate(data.length, (index) {
          final d = data[index];
          return BarChartGroupData(
            x: index,
            barRods: [
              BarChartRodData(
                toY: d.calories,
                gradient: const LinearGradient(
                  colors: [Color(0xFF3B82F6), Color(0xFF10B981)],
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                ),
                width: 14,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(6),
                  topRight: Radius.circular(6),
                ),
                backDrawRodData: BackgroundBarChartRodData(
                  show: true,
                  toY: maxVal,
                  color: Colors.white.withOpacity(0.02),
                ),
              ),
            ],
          );
        }),
      ),
    );
  }

  /// Membuat box ringkasan statistik
  Widget _buildSummaryStatBox({
    required String title,
    required String value,
    String? subText,
    required IconData icon,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Colors.white.withOpacity(0.05),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 10,
                    color: Colors.grey,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
                if (subText != null) ...[
                  const SizedBox(height: 1),
                  Text(
                    subText,
                    style: const TextStyle(
                      fontSize: 9,
                      color: Colors.white60,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Membuat item legenda grafik
  Widget _buildLegendItem(Color color, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(
            fontSize: 10,
            color: Colors.white70,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
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
        final ScannedFood baseFood = scannedFood;
        ScannedFood finalFood = baseFood;
        // 3. Panggil MealDB API menggunakan nama makanan dari LiteRT
        try {
          final mealDbService = MealDBService();
          final mealDbRecipe = await mealDbService.fetchRecipe(detectedLabel);
          
          finalFood = ScannedFood(
            id: baseFood.id,
            name: baseFood.name,
            confidence: baseFood.confidence,
            imagePath: baseFood.imagePath,
            timestamp: baseFood.timestamp,
            scientificName: baseFood.scientificName,
            origin: baseFood.origin,
            healthAnalysis: baseFood.healthAnalysis,
            healthTips: baseFood.healthTips,
            halalStatus: baseFood.halalStatus,
            halalReason: baseFood.halalReason,
            suggestedRestaurants: baseFood.suggestedRestaurants,
            calories: baseFood.calories,
            carbs: baseFood.carbs,
            fat: baseFood.fat,
            fiber: baseFood.fiber,
            protein: baseFood.protein,
            hasRecipe: mealDbRecipe['hasRecipe'] ?? false,
            recipeTitle: mealDbRecipe['title'] ?? detectedLabel,
            recipeThumb: mealDbRecipe['thumb'] ?? '',
            recipeIngredients: mealDbRecipe['ingredients'] ?? '',
            recipeInstructions: mealDbRecipe['instructions'] ?? '',
            isSimulated: baseFood.isSimulated,
            tfliteModelLoaded: baseFood.tfliteModelLoaded,
            isFavorite: baseFood.isFavorite,
          );
        } catch (recipeErr) {
          print("⚠️ Gagal mengambil resep dari MealDB: $recipeErr");
        }

        // Simpan ke riwayat lokal
        await _saveToHistory(finalFood);

        // Arahkan langsung ke halaman hasil rincian
        if (mounted) {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => ResultScreen(
                food: finalFood,
                onFavoriteToggle: () {
                  setState(() {
                    finalFood.isFavorite = !finalFood.isFavorite;
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
                const SizedBox(height: 14),
                // Tombol rincian analisis konsumsi mingguan
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: _showWeeklyAnalysisSheet,
                    icon: const Icon(
                      Icons.bar_chart_rounded,
                      color: Color(0xFF3B82F6),
                      size: 16,
                    ),
                    label: const Text(
                      "Analisis Mingguan",
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF3B82F6),
                      ),
                    ),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      backgroundColor: Colors.white.withOpacity(0.05),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                        side: BorderSide(
                          color: Colors.white.withOpacity(0.08),
                          width: 1,
                        ),
                      ),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
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

class DailyIntake {
  final DateTime date;
  final double calories;
  final double carbs;
  final double protein;
  final double fat;

  DailyIntake({
    required this.date,
    required this.calories,
    required this.carbs,
    required this.protein,
    required this.fat,
  });
}

