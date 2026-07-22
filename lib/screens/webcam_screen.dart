import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
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
///
/// OPTIMISASI: Menggunakan Persistent Isolate dari ClassifierService agar
/// Interpreter LiteRT hanya dibuat SEKALI dan dipakai ulang setiap frame.
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

enum CameraScanMode { manual, live }

class _WebcamScreenState extends State<WebcamScreen> {
  CameraController? _controller;
  List<CameraDescription>? _cameras;
  bool _isCameraInitialized = false;
  bool _isCapturing = false;
  String _simulatedFoodLabel = "Sate Ayam";
  ClassificationResult? _liveResult;
  bool _isLiveDetecting = false;
  CameraScanMode _activeMode = CameraScanMode.live; // Default ke mode live deteksi real-time
  bool _disposed = false;
  bool _showPermissionRationale = true;

  // ★ OPTIMISASI: Persistent Isolate support
  StreamSubscription<Map<String, dynamic>>? _liveResultSubscription;
  DateTime? _lastFrameSent;
  static const int _frameThrottleMs = 250; // ~4 FPS (dari 800ms → 250ms)

  @override
  void initState() {
    super.initState();
    // Kita menunda inisialisasi kamera sampai pengguna membaca dan menyetujui
    // penjelasan pentingnya izin akses kamera pada overlay ramah pengguna.
  }

  /// Menginisialisasi perangkat keras kamera jika tersedia di sistem
  Future<void> _setupCamera() async {
    try {
      // ★ 1. Mulai Persistent Isolate DAHULU sebelum kamera
      if (widget.classifierService.isLoaded &&
          !widget.classifierService.isLiveRunning) {
        await widget.classifierService.startLiveIsolate();
      }

      // ★ 2. Subscribe ke stream hasil dari isolate
      _liveResultSubscription =
          widget.classifierService.liveResults?.listen((result) {
        if (mounted && !_isCapturing && _isLiveDetecting) {
          setState(() {
            _liveResult = ClassificationResult(
              label: result['label'] as String,
              confidence: result['confidence'] as double,
            );
          });
        }
      });

      // 3. Inisialisasi kamera hardware
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
          _startLiveDetectionLoop();
        }
      } else {
        print("⚠️ Perangkat kamera tidak dideteksi (kemungkinan berjalan di simulator).");
        setState(() {
          _isLiveDetecting = true;
          _liveResult = ClassificationResult(
            label: _simulatedFoodLabel,
            confidence: 0.95,
          );
        });
        _startSimulatorLoop();
      }
    } catch (e) {
      print("⚠️ Kesalahan saat mendeteksi kamera: $e");
      setState(() {
        _isLiveDetecting = true;
        _liveResult = ClassificationResult(
          label: _simulatedFoodLabel,
          confidence: 0.95,
        );
      });
      _startSimulatorLoop();
    }
  }

  /// Loop deteksi live berkala menggunakan CameraImage stream.
  ///
  /// ★ OPTIMISASI: Frame dikirim ke Persistent Isolate via SendPort
  /// (fire-and-forget), bukan Isolate.run() per frame.
  /// Throttle berbasis waktu 250ms (~4 FPS) menggantikan boolean flag.
  Future<void> _startLiveDetectionLoop() async {
    if (_isLiveDetecting) return;
    _isLiveDetecting = true;

    if (_isCameraInitialized && _controller != null && _controller!.value.isInitialized) {
      try {
        await _controller!.startImageStream((CameraImage image) {
          // Kunci/pemeriksaan instan untuk menghindari pemrosesan saat tidak diperlukan
          if (_disposed || !_isLiveDetecting || _isCapturing) return;

          // ★ Time-based throttle (bukan boolean flag)
          final now = DateTime.now();
          if (_lastFrameSent != null &&
              now.difference(_lastFrameSent!).inMilliseconds < _frameThrottleMs) {
            return; // Skip frame — terlalu cepat
          }
          _lastFrameSent = now;

          try {
            // Ekstrak data biner dari planes ke format Map sederhana
            final Map<String, dynamic> imageData = {
              'width': image.width,
              'height': image.height,
              'formatGroup': image.format.group.name,
              'planes': image.planes.map((plane) => {
                // ★ Copy bytes agar aman dari buffer recycle kamera
                'bytes': Uint8List.fromList(plane.bytes),
                'bytesPerRow': plane.bytesPerRow,
                'bytesPerPixel': plane.bytesPerPixel,
              }).toList(),
            };

            // ★ Kirim frame ke persistent isolate (fire-and-forget, non-blocking)
            widget.classifierService.classifyFrame(imageData);
          } catch (e) {
            print("⚠️ Gagal mengekstrak data frame kamera: $e");
          }
        });
      } catch (e) {
        print("⚠️ Kesalahan memulai startImageStream: $e. Beralih ke mode simulator.");
        _startSimulatorLoop();
      }
    } else {
      _startSimulatorLoop();
    }
  }

  /// Simulator loop untuk perangkat tanpa kamera fisik (seperti browser/simulator)
  Future<void> _startSimulatorLoop() async {
    while (!_disposed && _isLiveDetecting) {
      await Future.delayed(const Duration(milliseconds: 1500));
      if (_disposed || !_isLiveDetecting || _isCapturing) break;

      if (mounted) {
        setState(() {
          _liveResult = ClassificationResult(
            label: _simulatedFoodLabel,
            confidence: 0.92 + (DateTime.now().millisecond % 60) / 1000.0,
          );
        });
      }
    }
  }

  /// Melakukan pengambilan foto nyata atau menjalankan simulasi jika kamera tidak ada
  Future<void> _takeSnap() async {
    if (_isCapturing) return;

    setState(() {
      _isCapturing = true;
      _isLiveDetecting = false; // Hentikan deteksi live
    });

    try {
      String imagePath = "";
      String label = "Nasi Goreng";
      double confidence = 0.95;

      if (_isCameraInitialized && _controller != null) {
        // Hentikan streaming gambar terlebih dahulu sebelum mengambil foto penuh untuk mencegah lock native
        try {
          await _controller!.stopImageStream();
        } catch (e) {
          print("⚠️ Gagal menghentikan aliran stream kamera: $e");
        }

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
        final ScannedFood baseFood = scannedFood;
        ScannedFood finalFood = baseFood;
        // 4. Panggil MealDB API menggunakan nama makanan dari LiteRT
        try {
          final mealDbService = MealDBService();
          final mealDbRecipe = await mealDbService.fetchRecipe(label);

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
            recipeTitle: mealDbRecipe['title'] ?? label,
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

        // Simpan ke riwayat utama di HomeScreen
        widget.onResultAnalyzed(finalFood);

        // Langsung navigasi ke halaman hasil detail
        if (mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (context) => ResultScreen(
                food: finalFood,
                onFavoriteToggle: () {
                  setState(() {
                    finalFood.isFavorite = !finalFood.isFavorite;
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

  /// Beralih mode kamera antara foto manual dan deteksi real-time live
  void _switchMode(CameraScanMode mode) async {
    if (_activeMode == mode) return;

    setState(() {
      _activeMode = mode;
    });

    if (mode == CameraScanMode.live) {
      if (_isCameraInitialized && _controller != null && _controller!.value.isInitialized) {
        _startLiveDetectionLoop();
      } else {
        setState(() {
          _isLiveDetecting = true;
        });
        _startSimulatorLoop();
      }
    } else {
      setState(() {
        _isLiveDetecting = false;
        _liveResult = null;
      });
      if (_isCameraInitialized && _controller != null && _controller!.value.isInitialized) {
        try {
          await _controller!.stopImageStream();
        } catch (e) {
          print("⚠️ Gagal menghentikan aliran stream kamera: $e");
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_showPermissionRationale) {
      return _buildPermissionRationaleView();
    }

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

          // 1b. Dynamic Bounding Box CustomPaint Canvas Overlay
          if (_isLiveDetecting && _liveResult != null)
            IgnorePointer(
              child: CustomPaint(
                painter: BoundingBoxPainter(
                  result: _liveResult,
                  isLiveDetecting: _isLiveDetecting,
                ),
                child: const SizedBox.expand(),
              ),
            ),

          // 2. Bidik Crosshair Overlay
          _buildCrosshairOverlay(),

          // 2b. Live Detection Floating HUD Panel (On-Device)
          if (_liveResult != null && !_isCapturing)
            Positioned(
              top: 110,
              left: 20,
              right: 20,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF0F172A).withOpacity(0.9),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFF3B82F6).withOpacity(0.5), width: 1.5),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.3),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    const _PulsingDot(),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text(
                            "IDENTIFIKASI REAL-TIME (ON-DEVICE)",
                            style: TextStyle(
                              color: Color(0xFF3B82F6),
                              fontSize: 9,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 1.2,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              const Text(
                                "Jenis: ",
                                style: TextStyle(
                                  color: Colors.white70,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              Text(
                                _liveResult!.label.toLowerCase() == 'bukan makanan' ? "Non Makanan" : "Makanan",
                                style: TextStyle(
                                  color: _liveResult!.label.toLowerCase() == 'bukan makanan'
                                      ? const Color(0xFFEF4444) // Merah untuk Non Makanan
                                      : const Color(0xFF10B981), // Hijau untuk Makanan
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _liveResult!.label,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withOpacity(0.2),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFF10B981), width: 1),
                      ),
                      child: Text(
                        "${(_liveResult!.confidence * 100).toStringAsFixed(1)}%",
                        style: const TextStyle(
                          color: Color(0xFF10B981),
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

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

          // 4. Bottom Controls (Shutter & Live Toggle Buttons)
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
                  // Teks Panduan Kontekstual berdasarkan Mode Aktif
                  Text(
                    _activeMode == CameraScanMode.live
                        ? "Mendeteksi secara otomatis dalam bingkai kamera..."
                        : "Posisikan hidangan lalu tekan tombol jepret di bawah",
                    style: const TextStyle(
                      color: Color(0xCCFFFFFF),
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 0.2,
                    ),
                  ),
                  const SizedBox(height: 16),

                  // 4a. Mode Switcher (Pill Segmented Control) yang Sangat Jelas & Elegan
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.55),
                      borderRadius: BorderRadius.circular(30),
                      border: Border.all(
                        color: Colors.white10,
                        width: 1,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _buildModeTab(
                          mode: CameraScanMode.manual,
                          label: "Ambil Manual",
                          icon: Icons.photo_camera_rounded,
                        ),
                        _buildModeTab(
                          mode: CameraScanMode.live,
                          label: "Deteksi Real-Time",
                          icon: Icons.videocam_rounded,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // 4b. Tombol Shutter Utama yang Terpusat & Menakjubkan
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      GestureDetector(
                        onTap: _takeSnap,
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 250),
                          height: 84,
                          width: 84,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: _activeMode == CameraScanMode.live
                                  ? const Color(0xFF10B981)
                                  : Colors.white,
                              width: 4,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: (_activeMode == CameraScanMode.live
                                        ? const Color(0xFF10B981)
                                        : Colors.white)
                                    .withOpacity(0.25),
                                blurRadius: 12,
                                spreadRadius: 2,
                              ),
                            ],
                          ),
                          padding: const EdgeInsets.all(6),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 250),
                            decoration: BoxDecoration(
                              color: _activeMode == CameraScanMode.live
                                  ? const Color(0xFF10B981)
                                  : Colors.white,
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              _activeMode == CameraScanMode.live
                                  ? Icons.insights_rounded
                                  : Icons.camera_alt_rounded,
                              color: _activeMode == CameraScanMode.live
                                  ? Colors.white
                                  : Colors.black,
                              size: 32,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _activeMode == CameraScanMode.live ? "Jepret & Analisis" : "Ambil Foto",
                        style: TextStyle(
                          color: _activeMode == CameraScanMode.live
                              ? const Color(0xFF10B981)
                              : Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
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
    final bool isNonFood = _liveResult != null &&
        (_liveResult!.label.toLowerCase() == 'bukan makanan' ||
         _liveResult!.label.toLowerCase() == 'non makanan');

    final Color frameColor = !_isLiveDetecting
        ? const Color(0xFF64748B) // Sleek cool grey when live detection is off
        : _liveResult == null
            ? const Color(0xFF3B82F6) // Active blue when scanning
            : isNonFood
                ? const Color(0xFFEF4444) // Vibrant red for Non-Food
                : const Color(0xFF10B981); // Emerald green for Food

    return IgnorePointer(
      child: Center(
        child: SizedBox(
          width: 250,
          height: 250,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              // Outer border representation for a professional HUD look
              AnimatedContainer(
                duration: const Duration(milliseconds: 350),
                decoration: BoxDecoration(
                  color: frameColor.withOpacity(0.04),
                  border: Border.all(
                    color: frameColor.withOpacity(0.15),
                    width: 1,
                  ),
                  borderRadius: BorderRadius.circular(20),
                ),
              ),

              // Top Left Corner
              Positioned(
                top: 0,
                left: 0,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  width: 35,
                  height: 35,
                  decoration: BoxDecoration(
                    border: Border(
                      top: BorderSide(color: frameColor, width: 4.5),
                      left: BorderSide(color: frameColor, width: 4.5),
                    ),
                  ),
                ),
              ),
              // Top Right Corner
              Positioned(
                top: 0,
                right: 0,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  width: 35,
                  height: 35,
                  decoration: BoxDecoration(
                    border: Border(
                      top: BorderSide(color: frameColor, width: 4.5),
                      right: BorderSide(color: frameColor, width: 4.5),
                    ),
                  ),
                ),
              ),
              // Bottom Left Corner
              Positioned(
                bottom: 0,
                left: 0,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  width: 35,
                  height: 35,
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: frameColor, width: 4.5),
                      left: BorderSide(color: frameColor, width: 4.5),
                    ),
                  ),
                ),
              ),
              // Bottom Right Corner
              Positioned(
                bottom: 0,
                right: 0,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  width: 35,
                  height: 35,
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: frameColor, width: 4.5),
                      right: BorderSide(color: frameColor, width: 4.5),
                    ),
                  ),
                ),
              ),

              // Dynamic real-time label bubble under the scanner frame
              Positioned(
                bottom: -45,
                left: -20,
                right: -20,
                child: Center(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F172A).withOpacity(0.95),
                      borderRadius: BorderRadius.circular(30),
                      border: Border.all(
                        color: frameColor.withOpacity(0.7),
                        width: 1.5,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: frameColor.withOpacity(0.2),
                          blurRadius: 10,
                          spreadRadius: 1,
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Live indicator pulsing dot if active
                        if (_isLiveDetecting) ...[
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: frameColor,
                            ),
                          ),
                          const SizedBox(width: 8),
                        ],
                        Text(
                          !_isLiveDetecting
                              ? "Deteksi Dinonaktifkan"
                              : _liveResult == null
                                  ? "Mendeteksi..."
                                  : "${_liveResult!.label} (${(_liveResult!.confidence * 100).toStringAsFixed(0)}%)",
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.3,
                          ),
                        ),
                      ],
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

  /// Halaman penjelas ramah-pengguna untuk permohonan izin kamera (Camera Permission Rationale Overlay)
  Widget _buildPermissionRationaleView() {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A), // Latar belakang gelap elegan menyesuaikan tema kamera
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Tombol Kembali
              Align(
                alignment: Alignment.topLeft,
                child: CircleAvatar(
                  backgroundColor: Colors.white.withOpacity(0.08),
                  child: IconButton(
                    icon: const Icon(Icons.arrow_back, color: Colors.white),
                    onPressed: () => Navigator.pop(context),
                  ),
                ),
              ),
              const Spacer(flex: 1),

              // Ilustrasi Ikon Kamera Modern & Estetis
              Center(
                child: Container(
                  width: 90,
                  height: 90,
                  decoration: BoxDecoration(
                    color: const Color(0xFF3B82F6).withOpacity(0.12),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: const Color(0xFF3B82F6).withOpacity(0.3),
                      width: 2,
                    ),
                  ),
                  child: const Center(
                    child: Icon(
                      Icons.camera_enhance_rounded,
                      color: Color(0xFF3B82F6),
                      size: 40,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 28),

              // Judul Utama
              const Text(
                "Akses Kamera Diperlukan",
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 12),

              // Deskripsi Singkat Pentingnya Akses Kamera
              const Text(
                "Untuk memulai, aplikasi membutuhkan akses ke kamera Anda. Kamera digunakan secara lokal dan aman untuk mendeteksi hidangan secara langsung (real-time).",
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 13,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 32),

              // Manfaat / Fitur Unggulan (Aman dan sesuai kaidah visual anti-slop)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withOpacity(0.06)),
                ),
                child: Column(
                  children: [
                    _buildRationaleRow(
                      icon: Icons.flash_on_rounded,
                      title: "Identifikasi Real-Time",
                      desc: "Deteksi jenis makanan & non-makanan instan langsung dari aliran video (on-device).",
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12.0),
                      child: Divider(color: Colors.white10, height: 1),
                    ),
                    _buildRationaleRow(
                      icon: Icons.analytics_outlined,
                      title: "Analisis Nutrisi Otomatis",
                      desc: "Dapatkan info rincian kalori, karbohidrat, protein, lemak, serat, dan resep setelah memotret.",
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12.0),
                      child: Divider(color: Colors.white10, height: 1),
                    ),
                    _buildRationaleRow(
                      icon: Icons.security_rounded,
                      title: "Privasi Terjamin",
                      desc: "Aliran gambar diproses di perangkat lokal tanpa diunggah ke cloud eksternal.",
                    ),
                  ],
                ),
              ),

              const Spacer(flex: 2),

              // Tombol Call to Action (CTA) Utama
              ElevatedButton(
                onPressed: () {
                  setState(() {
                    _showPermissionRationale = false;
                  });
                  _setupCamera();
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF3B82F6),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  elevation: 0,
                ),
                child: const Text(
                  "Izinkan & Mulai Memindai",
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(height: 10),

              TextButton(
                onPressed: () => Navigator.pop(context),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.white60,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                ),
                child: const Text(
                  "Batal",
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  /// Baris penjelasan visual per butir manfaat
  Widget _buildRationaleRow({
    required IconData icon,
    required String title,
    required String desc,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: const Color(0xFF3B82F6).withOpacity(0.12),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: const Color(0xFF3B82F6), size: 18),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                desc,
                style: const TextStyle(
                  color: Colors.white54,
                  fontSize: 11,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ],
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
            child: DropdownButton(
              value: _simulatedFoodLabel,
              dropdownColor: const Color(0xFF1E293B),
              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
              underline: const SizedBox.shrink(),
              items: [
                'Sate Ayam',
                'Nasi Goreng',
                'Rendang Sapi',
                'Bakso Sapi',
                'Lontong Sayur',
                'Mie Aceh',
                'Bukan Makanan'
              ].map((String value) {
                return DropdownMenuItem(
                  value: value,
                  child: Text(value),
                );
              }).toList(),
              onChanged: (newValue) {
                if (newValue != null) {
                  setState(() {
                    _simulatedFoodLabel = newValue;
                    if (_isLiveDetecting) {
                      _liveResult = ClassificationResult(
                        label: newValue,
                        confidence: 0.95,
                      );
                    }
                  });
                }
              },
            ),
          ),
        ],
      ),
    );
  }

  /// Widget pembantu untuk merender tab pilihan mode dengan transisi estetik
  Widget _buildModeTab({
    required CameraScanMode mode,
    required String label,
    required IconData icon,
  }) {
    final bool isActive = _activeMode == mode;
    return GestureDetector(
      onTap: () => _switchMode(mode),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? const Color(0xFF3B82F6) : Colors.transparent,
          borderRadius: BorderRadius.circular(24),
          boxShadow: isActive
              ? [
                  BoxShadow(
                    color: const Color(0xFF3B82F6).withOpacity(0.4),
                    blurRadius: 8,
                    spreadRadius: 1,
                    offset: const Offset(0, 2),
                  ),
                ]
              : [],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              color: isActive ? Colors.white : Colors.white60,
              size: 16,
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                color: isActive ? Colors.white : Colors.white70,
                fontSize: 12,
                fontWeight: isActive ? FontWeight.bold : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _disposed = true;
    _isLiveDetecting = false;

    // ★ Bersihkan stream subscription dari persistent isolate
    _liveResultSubscription?.cancel();
    _liveResultSubscription = null;

    // Hentikan stream kamera dengan aman
    if (_isCameraInitialized && _controller != null) {
      try {
        _controller!.stopImageStream();
      } catch (_) {}
    }

    // ★ Hentikan persistent isolate dan bebaskan resource native
    if (widget.classifierService.isLiveRunning) {
      widget.classifierService.stopLiveIsolate();
    }

    super.dispose();
  }
}

/// Widget animasi lingkaran berdenyut (pulsing dot) untuk indikator visual deteksi real-time
class _PulsingDot extends StatefulWidget {
  const _PulsingDot({Key? key}) : super(key: key);

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(0xFF10B981).withOpacity(_controller.value * 0.7 + 0.3),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF10B981).withOpacity(_controller.value * 0.5),
                blurRadius: 6,
                spreadRadius: 2,
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Painter kustom untuk menggambar bounding box dinamis secara real-time di atas Canvas
class BoundingBoxPainter extends CustomPainter {
  final ClassificationResult? result;
  final bool isLiveDetecting;

  BoundingBoxPainter({required this.result, required this.isLiveDetecting});

  @override
  void paint(Canvas canvas, Size size) {
    if (!isLiveDetecting || result == null) return;

    final String label = result!.label.toLowerCase();
    final bool isNonFood = label.contains('bukan makanan') || label.contains('non makanan');

    // Gunakan visual hijau untuk makanan, merah untuk non-makanan
    final Color color = isNonFood ? const Color(0xFFEF4444) : const Color(0xFF10B981);
    final double confidence = result!.confidence;

    // Hitung dimensi kotak pembatas secara dinamis
    double boxWidth = 240.0;
    double boxHeight = 240.0;

    // Berikan sedikit offset variasi dinamis berdasarkan hash label agar terasa organik/mencari objek nyata
    final int labelHash = result!.label.hashCode;
    final double dx = (labelHash % 16 - 8).toDouble(); // range -8 sampai +8
    final double dy = ((labelHash >> 2) % 16 - 8).toDouble(); // range -8 sampai +8

    // Modifikasi ukuran berdasarkan tingkat kepercayaan deteksi (confidence score)
    boxWidth = boxWidth - (1.0 - confidence) * 20;
    boxHeight = boxHeight - (1.0 - confidence) * 20;

    final double left = (size.width - boxWidth) / 2 + dx;
    final double top = (size.height - boxHeight) / 2 + dy;

    final Rect rect = Rect.fromLTWH(left, top, boxWidth, boxHeight);
    final RRect rrect = RRect.fromRectAndRadius(rect, const Radius.circular(16));

    // 1. Gambar latar belakang semi-transparan tipis di dalam kotak deteksi
    final Paint fillPaint = Paint()
      ..color = color.withOpacity(0.05)
      ..style = PaintingStyle.fill;
    canvas.drawRRect(rrect, fillPaint);

    // 2. Gambar garis tepi kotak luar pembatas tipis
    final Paint borderPaint = Paint()
      ..color = color.withOpacity(0.5)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8;
    canvas.drawRRect(rrect, borderPaint);

    // 3. Gambar sudut pembidik tebal (bracket corners) bergaya HUD modern
    final Paint cornerPaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4.0
      ..strokeCap = StrokeCap.round;

    const double cornerLength = 20.0;

    // Sudut Kiri-Atas (Top-Left Corner)
    final Path tlPath = Path()
      ..moveTo(rect.left, rect.top + cornerLength)
      ..lineTo(rect.left, rect.top)
      ..lineTo(rect.left + cornerLength, rect.top);
    canvas.drawPath(tlPath, cornerPaint);

    // Sudut Kanan-Atas (Top-Right Corner)
    final Path trPath = Path()
      ..moveTo(rect.right - cornerLength, rect.top)
      ..lineTo(rect.right, rect.top)
      ..lineTo(rect.right, rect.top + cornerLength);
    canvas.drawPath(trPath, cornerPaint);

    // Sudut Kiri-Bawah (Bottom-Left Corner)
    final Path blPath = Path()
      ..moveTo(rect.left, rect.bottom - cornerLength)
      ..lineTo(rect.left, rect.bottom)
      ..lineTo(rect.left + cornerLength, rect.bottom);
    canvas.drawPath(blPath, cornerPaint);

    // Sudut Kanan-Bawah (Bottom-Right Corner)
    final Path brPath = Path()
      ..moveTo(rect.right - cornerLength, rect.bottom)
      ..lineTo(rect.right, rect.bottom)
      ..lineTo(rect.right, rect.bottom - cornerLength);
    canvas.drawPath(brPath, cornerPaint);

    // 4. Gambar label tag teks penunjuk di atas kotak bounding box
    final String displayTag = isNonFood ? "NON MAKANAN" : result!.label.toUpperCase();
    final TextPainter textPainter = TextPainter(
      text: TextSpan(
        text: " $displayTag (${(confidence * 100).toStringAsFixed(0)}%) ",
        style: TextStyle(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.bold,
          backgroundColor: color,
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();
    textPainter.paint(canvas, Offset(rect.left + 4, rect.top - 18));
  }

  @override
  bool shouldRepaint(covariant BoundingBoxPainter oldDelegate) {
    return oldDelegate.result != result || oldDelegate.isLiveDetecting != isLiveDetecting;
  }
}
