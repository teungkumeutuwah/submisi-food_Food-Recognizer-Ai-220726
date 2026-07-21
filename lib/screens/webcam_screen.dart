import 'dart:io';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:path_provider/path_provider.dart';
import '../models/scanned_food.dart';
import '../services/classifier_service.dart';
import '../services/gemini_service.dart';
import '../services/mealdb_service.dart';
import 'result_screen.dart';

/// Halaman interaktif pemindaian langsung (Live Camera Viewfinder) dengan overlay
/// pemandu bidik, shutter cerdas, dan detektor on-device ter-integrasi.
class WebcamScreen extends StatefulWidget {
  final ClassifierService classifierService;
  final GeminiService geminiService;
  final Function(ScannedFood result) onResultAnalyzed;

  const WebcamScreen({
    Key? key,
    required this.classifierService,
    required this.geminiService,
    required this.onResultAnalyzed,
  }) : super(key: key);

  @override
  State<WebcamScreen> createState() => _WebcamScreenState();
}

class _WebcamScreenState extends State<WebcamScreen> {
  CameraController? _controller;
  List<CameraDescription>? _cameras;
  bool _isCameraInitialized = false;
  bool _isCapturing = false;
  String _simulatedFoodLabel = "Sate Ayam";

  @override
  void initState() {
    super.initState();
    _setupCamera();
  }

  /// Menginisialisasi perangkat keras kamera jika tersedia di sistem
  Future<void> _setupCamera() async {
    try {
      _cameras = await availableCameras();
      if (_cameras != null && _cameras!.isNotEmpty) {
        // Gunakan kamera utama (belakang) jika ada
        final backCam = _cameras!.firstWhere(
          (cam) => cam.lensDirection == CameraLensDirection.back,
          orElse: () => _cameras!.first,
        );

        _controller = CameraController(
          backCam,
          ResolutionPreset.medium,
          enableAudio: false,
        );

        await _controller!.initialize();
        if (mounted) {
          setState(() {
            _isCameraInitialized = true;
          });
        }
      } else {
        print("⚠️ Perangkat kamera tidak dideteksi (kemungkinan berjalan di simulator).");
      }
    } catch (e) {
      print("⚠️ Kesalahan saat mendeteksi kamera: $e");
    }
  }

  /// Melakukan pengambilan foto nyata atau menjalankan simulasi jika kamera tidak ada
  Future<void> _takeSnap() async {
    if (_isCapturing) return;

    setState(() {
      _isCapturing = true;
    });

    try {
      String imagePath = "";
      String label = "Nasi Goreng";
      double confidence = 0.95;

      if (_isCameraInitialized && _controller != null) {
        // 1. Ambil foto asli menggunakan kamera HP
        final XFile file = await _controller!.takePicture();
        imagePath = file.path;

        // 2. Klasifikasikan on-device secara instan
        if (widget.classifierService.isLoaded) {
          final res = await widget.classifierService.classifyImage(imagePath);
          if (res != null) {
            label = res.label;
            confidence = res.confidence;
          }
        }
      } else {
        // MODE SIMULATOR FALLBACK: Buat dummy file gambar lokal agar tidak crash
        print("💡 Berjalan di Simulator: Menjalankan pengambilan foto simulasi...");
        final directory = await getTemporaryDirectory();
        final dummyFile = File('${directory.path}/simulated_capture.jpg');
        
        // Buat file byte kosong atau unduh gambar stock sebagai representasi
        await dummyFile.writeAsBytes([0, 1, 2, 3, 4]); // representasi byte minimal
        imagePath = dummyFile.path;
        label = _simulatedFoodLabel;
        confidence = 0.98;
      }

      // 3. Jalankan analisis Gemini untuk menghasilkan gizi, resep, sertifikasi halal
      var scannedFood = await widget.geminiService.scanAndAnalyzeImage(
        imagePath: imagePath,
        labelName: label,
        confidence: confidence,
        modelLoaded: widget.classifierService.isLoaded,
      );

      if (scannedFood != null) {
        // 4. Panggil MealDB API menggunakan nama makanan dari LiteRT
        try {
          final mealDbService = MealDBService();
          final mealDbRecipe = await mealDbService.fetchRecipe(label);
          
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
            recipeTitle: mealDbRecipe['title'] ?? label,
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

        // Simpan ke riwayat utama di HomeScreen
        widget.onResultAnalyzed(scannedFood);

        // Langsung navigasi ke halaman hasil detail
        if (mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (context) => ResultScreen(
                food: scannedFood!,
                onFavoriteToggle: () {
                  setState(() {
                    scannedFood!.isFavorite = !scannedFood!.isFavorite;
                  });
                },
              ),
            ),
          );
        }
      } else {
        throw Exception("Gagal mendapatkan rincian analisis pangan dari Gemini AI.");
      }
    } catch (e) {
      print("❌ Pengambilan gambar gagal: $e");
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Gagal menangkap gambar: ${e.toString()}')),
      );
      setState(() {
        _isCapturing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. Viewfinder Kamera atau Simulator Fallback
          _isCameraInitialized && _controller != null
              ? Center(
                  child: CameraPreview(_controller!),
                )
              : _buildSimulatorFallbackView(),

          // 2. Bidik Crosshair Overlay
          _buildCrosshairOverlay(),

          // 3. Header Controls
          Positioned(
            top: 44,
            left: 16,
            child: CircleAvatar(
              backgroundColor: Colors.black.withOpacity(0.5),
              child: IconButton(
                icon: const Icon(Icons.arrow_back, color: Colors.white),
                onPressed: () => Navigator.pop(context),
              ),
            ),
          ),

          // 4. Bottom Controls (Shutter Button)
          Positioned(
            bottom: 40,
            left: 0,
            right: 0,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_isCapturing)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.7),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        ),
                        SizedBox(width: 12),
                        Text(
                          "Memindai & Menganalisis...",
                          style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  )
                else ...[
                  const Text(
                    "Posisikan makanan tepat di tengah bingkai",
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Shutter Button
                  GestureDetector(
                    onTap: _takeSnap,
                    child: Container(
                      height: 84,
                      width: 84,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 4),
                      ),
                      padding: const EdgeInsets.all(6),
                      child: Container(
                        decoration: const BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.camera_alt,
                          color: Colors.black,
                          size: 32,
                        ),
                      ),
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

  /// Desain visual pembidik target pemindai makanan
  Widget _buildCrosshairOverlay() {
    return IgnorePointer(
      child: Center(
        child: SizedBox(
          width: 250,
          height: 250,
          child: Stack(
            children: [
              // Top Left Corner
              Positioned(
                top: 0,
                left: 0,
                child: Container(
                  width: 30,
                  height: 30,
                  decoration: const BoxDecoration(
                    border: Border(
                      top: BorderSide(color: Color(0xFF3B82F6), width: 4),
                      left: BorderSide(color: Color(0xFF3B82F6), width: 4),
                    ),
                  ),
                ),
              ),
              // Top Right Corner
              Positioned(
                top: 0,
                right: 0,
                child: Container(
                  width: 30,
                  height: 30,
                  decoration: const BoxDecoration(
                    border: Border(
                      top: BorderSide(color: Color(0xFF3B82F6), width: 4),
                      right: BorderSide(color: Color(0xFF3B82F6), width: 4),
                    ),
                  ),
                ),
              ),
              // Bottom Left Corner
              Positioned(
                bottom: 0,
                left: 0,
                child: Container(
                  width: 30,
                  height: 30,
                  decoration: const BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: Color(0xFF3B82F6), width: 4),
                      left: BorderSide(color: Color(0xFF3B82F6), width: 4),
                    ),
                  ),
                ),
              ),
              // Bottom Right Corner
              Positioned(
                bottom: 0,
                right: 0,
                child: Container(
                  width: 30,
                  height: 30,
                  decoration: const BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: Color(0xFF3B82F6), width: 4),
                      right: BorderSide(color: Color(0xFF3B82F6), width: 4),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Mock camera stream untuk simulator
  Widget _buildSimulatorFallbackView() {
    return Container(
      color: const Color(0xFF0F172A),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.videocam_off, color: Colors.grey[600], size: 64),
          const SizedBox(height: 18),
          const Text(
            "Simulator Camera Feed",
            style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 40),
            child: Text(
              "Kamera fisik tidak tersedia. Anda dapat memilih hidangan simulasi di bawah ini untuk menguji tangkapan layar cerdas.",
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey, fontSize: 12, height: 1.4),
            ),
          ),
          const SizedBox(height: 24),
          // Dropdown selector for simulated dishes to allow easy testing
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.08),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.white.withOpacity(0.2)),
            ),
            child: DropdownButton<String>(
              value: _simulatedFoodLabel,
              dropdownColor: const Color(0xFF1E293B),
              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
              underline: const SizedBox.shrink(),
              items: <String>[
                'Sate Ayam',
                'Nasi Goreng',
                'Rendang Sapi',
                'Bakso Sapi',
                'Lontong Sayur',
                'Mie Aceh'
              ].map((String value) {
                return DropdownMenuItem<String>(
                  value: value,
                  child: Text(value),
                );
              }).toList(),
              onChanged: (newValue) {
                if (newValue != null) {
                  setState(() {
                    _simulatedFoodLabel = newValue;
                  });
                }
              },
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }
}
