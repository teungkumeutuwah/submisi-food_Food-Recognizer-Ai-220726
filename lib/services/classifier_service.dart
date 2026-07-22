import 'dart:async';
import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:image/image.dart' as img;
import 'package:flutter_litert/flutter_litert.dart';

/// Service kelas kustom untuk menangani klasifikasi citra makanan on-device
/// menggunakan model LiteRT (TFLite) dan paket modern `flutter_litert`.
///
/// Untuk deteksi real-time (kamera live), service ini menggunakan **Persistent Isolate**
/// agar Interpreter hanya dibuat SEKALI dan dipakai ulang untuk setiap frame,
/// menghilangkan overhead 100-500ms per frame dari pembuatan ulang interpreter.
class ClassifierService {
  Uint8List? _modelBytes;
  List<String>? _labels;
  bool _isLoaded = false;

  // ── Persistent Isolate (untuk live camera) ──
  Isolate? _liveIsolate;
  SendPort? _liveSendPort;
  ReceivePort? _liveReceivePort;
  StreamController<Map<String, dynamic>>? _resultController;
  StreamSubscription? _receiveSubscription;
  bool _isLiveRunning = false;

  bool get isLoaded => _isLoaded;
  bool get isLiveRunning => _isLiveRunning;
  Stream<Map<String, dynamic>>? get liveResults => _resultController?.stream;

  // ═══════════════════════════════════════════════
  // 1. MODEL LOADING
  // ═══════════════════════════════════════════════

  Future<void> loadModel() async {
    try {
      final ByteData modelData = await rootBundle.load('assets/model.tflite');
      _modelBytes = modelData.buffer.asUint8List();

      final labelsData = await rootBundle.loadString('assets/labels.txt');
      _labels = labelsData
          .split('\n')
          .map((label) => label.trim())
          .where((label) => label.isNotEmpty)
          .toList();

      _isLoaded = true;
      print("✅ Model LiteRT dan Labels berhasil dimuat ke memori.");
    } catch (e) {
      print("❌ Gagal memuat model atau label LiteRT: $e");
      _isLoaded = false;
      rethrow;
    }
  }

  // ═══════════════════════════════════════════════
  // 2. FILE-BASED CLASSIFICATION (one-shot, Isolate.run)
  //    Cocok untuk classifyImage() yang dipanggil sesekali.
  // ═══════════════════════════════════════════════

  Future<ClassificationResult?> classifyImage(String imagePath) async {
    if (!_isLoaded || _modelBytes == null || _labels == null) {
      print("⚠️ Model belum dimuat secara sempurna.");
      return null;
    }

    try {
      final File imageFile = File(imagePath);
      if (!await imageFile.exists()) {
        throw Exception("File gambar tidak ditemukan di path: $imagePath");
      }
      final Uint8List imageBytes = await imageFile.readAsBytes();
      final Uint8List modelBytesLocal = _modelBytes!;
      final List<String> labelsLocal = List<String>.from(_labels!);

      final Map<String, dynamic>? resultData = await Isolate.run(() {
        try {
          final img.Image? originalImage = img.decodeImage(imageBytes);
          if (originalImage == null) {
            throw Exception("Gagal melakukan decoding citra biner.");
          }

          final img.Image resizedImage = img.copyResize(
            originalImage,
            width: 224,
            height: 224,
          );

          final Float32List inputTensor = Float32List(150528);
          int pixelIndex = 0;
          for (int y = 0; y < 224; y++) {
            for (int x = 0; x < 224; x++) {
              final pixel = resizedImage.getPixel(x, y);
              inputTensor[pixelIndex++] = (pixel.r / 127.5) - 1.0;
              inputTensor[pixelIndex++] = (pixel.g / 127.5) - 1.0;
              inputTensor[pixelIndex++] = (pixel.b / 127.5) - 1.0;
            }
          }

          final Interpreter isolateInterpreter =
              Interpreter.fromBuffer(modelBytesLocal);
          isolateInterpreter.allocateTensors();

          final int labelsCount = labelsLocal.length;
          final List<List<double>> outputTensor = List<List<double>>.generate(
            1,
            (_) => List<double>.filled(labelsCount, 0.0),
          );

          isolateInterpreter.run(inputTensor, outputTensor);
          isolateInterpreter.close();

          final List<double> probabilities = outputTensor[0];
          double maxScore = -1.0;
          int maxIndex = -1;

          for (int i = 0; i < probabilities.length; i++) {
            if (probabilities[i] > maxScore) {
              maxScore = probabilities[i];
              maxIndex = i;
            }
          }

          if (maxIndex != -1 && maxIndex < labelsLocal.length) {
            return {
              'label': labelsLocal[maxIndex],
              'confidence': maxScore,
            };
          }
          return null;
        } catch (e) {
          print("❌ Kesalahan di dalam Isolate: $e");
          return null;
        }
      });

      if (resultData != null) {
        return ClassificationResult(
          label: resultData['label'] as String,
          confidence: resultData['confidence'] as double,
        );
      }
      return null;
    } catch (e) {
      print("❌ Kesalahan selama proses klasifikasi citra: $e");
      return null;
    }
  }

  // ═══════════════════════════════════════════════
  // 3. PERSISTENT ISOLATE — LIVE CAMERA CLASSIFICATION
  //    Interpreter dibuat SEKALI, frame dikirim via SendPort.
  // ═══════════════════════════════════════════════

  /// Memulai Persistent Isolate untuk klasifikasi kamera real-time.
  Future<void> startLiveIsolate() async {
    if (_isLiveRunning || !_isLoaded) return;

    _resultController = StreamController<Map<String, dynamic>>.broadcast();
    _liveReceivePort = ReceivePort();

    final completer = Completer<void>();

    _receiveSubscription = _liveReceivePort!.listen((message) {
      if (message is SendPort) {
        _liveSendPort = message;
        _isLiveRunning = true;
        if (!completer.isCompleted) completer.complete();
      } else if (message is Map<String, dynamic>) {
        _resultController!.add(message);
      }
    });

    _liveIsolate = await Isolate.spawn(
      _liveIsolateEntry,
      [_liveReceivePort!.sendPort, _modelBytes!, _labels!],
    );

    await completer.future.timeout(
      const Duration(seconds: 5),
      onTimeout: () {
        throw TimeoutException('Persistent isolate gagal start');
      },
    );

    print("✅ Persistent Isolate aktif — Interpreter siap menerima frame.");
  }

  /// Mengirim satu frame kamera ke persistent isolate (fire-and-forget).
  void classifyFrame(Map<String, dynamic> imageData) {
    if (!_isLiveRunning || _liveSendPort == null) return;
    _liveSendPort!.send(imageData);
  }

  /// Menghentikan persistent isolate dan melepaskan semua resource.
  void stopLiveIsolate() {
    if (_liveSendPort != null) {
      _liveSendPort!.send({'command': 'dispose'});
    }
    _isLiveRunning = false;
    _receiveSubscription?.cancel();
    _receiveSubscription = null;
    _liveIsolate?.kill(priority: Isolate.immediate);
    _liveIsolate = null;
    _liveSendPort = null;
    _liveReceivePort?.close();
    _liveReceivePort = null;
    _resultController?.close();
    _resultController = null;
    print("✅ Persistent Isolate dihentikan.");
  }

  // ── Isolate Entry Point (berjalan di background thread terpisah) ──

  static void _liveIsolateEntry(List<dynamic> args) {
    final SendPort mainSendPort = args[0] as SendPort;
    final Uint8List modelBytes = args[1] as Uint8List;
    final List<String> labels = args[2] as List<String>;

    // ★ Buat Interpreter SEKALI — ini kunci performa!
    final Interpreter interpreter = Interpreter.fromBuffer(modelBytes);
    interpreter.allocateTensors();

    // Pre-allocate output tensor (dipakai ulang setiap frame)
    final int labelsCount = labels.length;
    final List<List<double>> outputTensor = List<List<double>>.generate(
      1,
      (_) => List<double>.filled(labelsCount, 0.0),
    );

    // Kirim SendPort kita ke main isolate
    final receivePort = ReceivePort();
    mainSendPort.send(receivePort.sendPort);

    // Loop utama: terima frame → proses → kirim hasil
    receivePort.listen((message) {
      if (message is Map<String, dynamic>) {
        if (message['command'] == 'dispose') {
          interpreter.close();
          receivePort.close();
          Isolate.exit();
          return;
        }

        try {
          final result = _processCameraFrame(
            message,
            interpreter,
            labels,
            outputTensor,
          );
          if (result != null) {
            mainSendPort.send(result);
          }
        } catch (e) {
          // Jangan crash isolate karena 1 frame gagal
        }
      }
    });
  }

  /// Memproses 1 frame kamera (YUV420/BGRA → resize → inferensi)
  static Map<String, dynamic>? _processCameraFrame(
    Map<String, dynamic> imageData,
    Interpreter interpreter,
    List<String> labels,
    List<List<double>> outputTensor,
  ) {
    final int width = imageData['width'] as int;
    final int height = imageData['height'] as int;
    final String formatGroup = (imageData['formatGroup'] as String).toLowerCase();
    final List<dynamic> planes = imageData['planes'] as List<dynamic>;

    final img.Image resizedImage = img.Image(width: 224, height: 224);
    final double scaleX = width / 224.0;
    final double scaleY = height / 224.0;

    if (formatGroup == 'yuv420' || planes.length >= 3) {
      final Uint8List yBytes = planes[0]['bytes'] as Uint8List;
      final Uint8List uBytes = planes[1]['bytes'] as Uint8List;
      final Uint8List vBytes = planes[2]['bytes'] as Uint8List;

      final int yRowStride = planes[0]['bytesPerRow'] as int;
      final int uvRowStride = planes[1]['bytesPerRow'] as int;
      final int uvPixelStride = (planes[1]['bytesPerPixel'] as int?) ?? 1;

      for (int outY = 0; outY < 224; outY++) {
        final int srcY = (outY * scaleY).toInt().clamp(0, height - 1);
        final int uvRowStart = (srcY >> 1) * uvRowStride;
        final int yRowStart = srcY * yRowStride;

        for (int outX = 0; outX < 224; outX++) {
          final int srcX = (outX * scaleX).toInt().clamp(0, width - 1);
          final int uvOffset = uvRowStart + (srcX >> 1) * uvPixelStride;

          if (yRowStart + srcX >= yBytes.length ||
              uvOffset >= uBytes.length ||
              uvOffset >= vBytes.length) {
            continue;
          }

          final int yValue = yBytes[yRowStart + srcX] & 0xFF;
          final int uValue = uBytes[uvOffset] & 0xFF;
          final int vValue = vBytes[uvOffset] & 0xFF;

          final int r =
              (yValue + 1.370705 * (vValue - 128)).round().clamp(0, 255);
          final int g = (yValue -
                  0.337633 * (uValue - 128) -
                  0.698001 * (vValue - 128))
              .round()
              .clamp(0, 255);
          final int b =
              (yValue + 1.732446 * (uValue - 128)).round().clamp(0, 255);

          resizedImage.setPixelRgb(outX, outY, r, g, b);
        }
      }
    } else if (formatGroup == 'bgra8888' ||
        formatGroup == 'bgra' ||
        planes.isNotEmpty) {
      final Uint8List bgraBytes = planes[0]['bytes'] as Uint8List;
      final int bytesPerRow = planes[0]['bytesPerRow'] as int;
      final int bytesPerPixel = (planes[0]['bytesPerPixel'] as int?) ?? 4;

      for (int outY = 0; outY < 224; outY++) {
        final int srcY = (outY * scaleY).toInt().clamp(0, height - 1);
        final int rowStart = srcY * bytesPerRow;

        for (int outX = 0; outX < 224; outX++) {
          final int srcX = (outX * scaleX).toInt().clamp(0, width - 1);
          final int srcOffset = rowStart + srcX * bytesPerPixel;

          if (srcOffset + 2 >= bgraBytes.length) continue;

          final int b = bgraBytes[srcOffset] & 0xFF;
          final int g = bgraBytes[srcOffset + 1] & 0xFF;
          final int r = bgraBytes[srcOffset + 2] & 0xFF;

          resizedImage.setPixelRgb(outX, outY, r, g, b);
        }
      }
    } else {
      return null;
    }

    // ── Bangun input tensor ──
    final Float32List inputTensor = Float32List(150528);
    int pixelIndex = 0;
    for (int y = 0; y < 224; y++) {
      for (int x = 0; x < 224; x++) {
        final pixel = resizedImage.getPixel(x, y);
        inputTensor[pixelIndex++] = (pixel.r / 127.5) - 1.0;
        inputTensor[pixelIndex++] = (pixel.g / 127.5) - 1.0;
        inputTensor[pixelIndex++] = (pixel.b / 127.5) - 1.0;
      }
    }

    // ★ Interpreter SUDAH di-allocate — langsung run, tanpa overhead!
    interpreter.run(inputTensor, outputTensor);

    // ── Analisis hasil ──
    final List<double> probabilities = outputTensor[0];
    double maxScore = -1.0;
    int maxIndex = -1;

    for (int i = 0; i < probabilities.length; i++) {
      if (probabilities[i] > maxScore) {
        maxScore = probabilities[i];
        maxIndex = i;
      }
    }

    if (maxIndex != -1 && maxIndex < labels.length) {
      return {
        'label': labels[maxIndex],
        'confidence': maxScore,
      };
    }
    return null;
  }

  // ═══════════════════════════════════════════════
  // 4. CLEANUP
  // ═══════════════════════════════════════════════

  void dispose() {
    stopLiveIsolate();
    _modelBytes = null;
    _labels = null;
    _isLoaded = false;
  }
}

/// Struktur data kelas representasi hasil klasifikasi model
class ClassificationResult {
  final String label;
  final double confidence;

  ClassificationResult({
    required this.label,
    required this.confidence,
  });

  @override
  String toString() =>
      'Result(label: $label, confidence: ${(confidence * 100).toStringAsFixed(2)}%)';
}