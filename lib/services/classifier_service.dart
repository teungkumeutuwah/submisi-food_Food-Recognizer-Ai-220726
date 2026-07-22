import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:image/image.dart' as img;
import 'package:flutter_litert/flutter_litert.dart';

/// Service kelas kustom untuk menangani klasifikasi citra makanan on-device
/// menggunakan model LiteRT (TFLite) dan paket modern `flutter_litert`.
///
/// Service ini sepenuhnya berjalan secara asinkron di dalam background Isolate
/// guna menjaga agar frame rate antarmuka pengguna (UI) tetap berada di 60 FPS.
class ClassifierService {
  Uint8List? _modelBytes;
  List<String>? _labels;
  bool _isLoaded = false;

  bool get isLoaded => _isLoaded;

  /// Memuat model LiteRT (.tflite) dan berkas label secara dinamis dari assets
  Future<void> loadModel() async {
    try {
      // 1. Muat byte model ke memori
      final ByteData modelData = await rootBundle.load('assets/model.tflite');
      _modelBytes = modelData.buffer.asUint8List();

      // 2. Memuat daftar label dari berkas assets/labels.txt
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

  /// Menjalankan inferensi klasifikasi citra pada berkas gambar yang diberikan.
  ///
  /// Menggunakan [Isolate.run] untuk melakukan pemrosesan biner piksel dan
  /// inferensi model di latar belakang agar tidak mengganggu utas UI utama.
  Future<ClassificationResult?> classifyImage(String imagePath) async {
    if (!_isLoaded || _modelBytes == null || _labels == null) {
      print("⚠️ Model belum dimuat secara sempurna.");
      return null;
    }

    try {
      // Baca byte gambar secara asinkron
      final File imageFile = File(imagePath);
      if (!await imageFile.exists()) {
        throw Exception("File gambar tidak ditemukan di path: $imagePath");
      }
      final Uint8List imageBytes = await imageFile.readAsBytes();
      final Uint8List modelBytesLocal = _modelBytes!;
      final List<String> labelsLocal = List<String>.from(_labels!);

      // 1. Jalankan preprocessing dan inferensi di dalam Isolate di latar belakang
      final Map<String, dynamic>? resultData = await Isolate.run(() {
        try {
          // Decode citra menggunakan paket 'image'
          final img.Image? originalImage = img.decodeImage(imageBytes);
          if (originalImage == null) {
            throw Exception("Gagal melakukan decoding citra biner.");
          }

          // Resize citra ke ukuran 224x224 (dimensi standar MobileNetV2 / model AIY)
          final img.Image resizedImage = img.copyResize(
            originalImage,
            width: 224,
            height: 224,
          );

          // Buat flat Float32List Tensor berukuran 1 * 224 * 224 * 3 = 150528
          final Float32List inputTensor = Float32List(150528);
          int pixelIndex = 0;
          for (int y = 0; y < 224; y++) {
            for (int x = 0; x < 224; x++) {
              final pixel = resizedImage.getPixel(x, y);
              
              // Konversi nilai RGB 0-255 ke skala float [-1.0, 1.0]
              inputTensor[pixelIndex++] = (pixel.r / 127.5) - 1.0;
              inputTensor[pixelIndex++] = (pixel.g / 127.5) - 1.0;
              inputTensor[pixelIndex++] = (pixel.b / 127.5) - 1.0;
            }
          }

          // Buat interpreter dari buffer byte model di background thread (Isolate)
          final Interpreter isolateInterpreter = Interpreter.fromBuffer(modelBytesLocal);
          isolateInterpreter.allocateTensors();

          final int labelsCount = labelsLocal.length;
          final List<List<double>> outputTensor = List<List<double>>.generate(
            1,
            (_) => List<double>.filled(labelsCount, 0.0),
          );

          // Jalankan inferensi di background thread menggunakan input flat Float32List
          isolateInterpreter.run(inputTensor, outputTensor);
          isolateInterpreter.close(); // Selalu bersihkan resource

          // Cari nilai probabilitas tertinggi dari hasil keluaran model
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

  /// Menjalankan inferensi klasifikasi citra real-time langsung dari aliran kamera (CameraImage).
  ///
  /// Menerima payload data citra kamera berupa Map sederhana untuk menghindari
  /// dependensi langsung terhadap paket UI `camera`. Seluruh konversi format warna
  /// (YUV420 atau BGRA ke RGB) dan inferensi dijalankan di dalam background Isolate.
  Future<ClassificationResult?> classifyCameraImage(Map<String, dynamic> imageData) async {
    if (!_isLoaded || _modelBytes == null || _labels == null) {
      return null;
    }

    try {
      final Uint8List modelBytesLocal = _modelBytes!;
      final List<String> labelsLocal = List<String>.from(_labels!);

      final Map<String, dynamic>? resultData = await Isolate.run(() {
        try {
          final int width = imageData['width'] as int;
          final int height = imageData['height'] as int;
          final String formatGroup = (imageData['formatGroup'] as String).toLowerCase();
          final List<dynamic> planes = imageData['planes'] as List<dynamic>;

          final img.Image resizedImage = img.Image(width: 224, height: 224);
          final double scaleX = width / 224.0;
          final double scaleY = height / 224.0;

          if (formatGroup == 'yuv420' || planes.length >= 3) {
            // Pemrosesan format YUV420 (Android / iOS)
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

                if (yRowStart + srcX >= yBytes.length || uvOffset >= uBytes.length || uvOffset >= vBytes.length) {
                  continue;
                }

                final int yValue = yBytes[yRowStart + srcX] & 0xFF;
                final int uValue = uBytes[uvOffset] & 0xFF;
                final int vValue = vBytes[uvOffset] & 0xFF;

                // Rumus konversi warna standar YUV ke RGB
                final int r = (yValue + 1.370705 * (vValue - 128)).round().clamp(0, 255);
                final int g = (yValue - 0.337633 * (uValue - 128) - 0.698001 * (vValue - 128)).round().clamp(0, 255);
                final int b = (yValue + 1.732446 * (uValue - 128)).round().clamp(0, 255);

                resizedImage.setPixelRgb(outX, outY, r, g, b);
              }
            }
          } else if (formatGroup == 'bgra8888' || formatGroup == 'bgra' || planes.isNotEmpty) {
            // Pemrosesan format BGRA / RGBA (iOS / Simulator)
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

                // Tentukan letak komponen warna (biasanya BGRA)
                final int b = bgraBytes[srcOffset] & 0xFF;
                final int g = bgraBytes[srcOffset + 1] & 0xFF;
                final int r = bgraBytes[srcOffset + 2] & 0xFF;

                resizedImage.setPixelRgb(outX, outY, r, g, b);
              }
            }
          } else {
            throw Exception("Format warna kamera tidak didukung: $formatGroup");
          }

          // Buat flat Float32List Tensor berukuran 1 * 224 * 224 * 3 = 150528
          final Float32List inputTensor = Float32List(150528);
          int pixelIndex = 0;
          for (int y = 0; y < 224; y++) {
            for (int x = 0; x < 224; x++) {
              final pixel = resizedImage.getPixel(x, y);
              
              // Normalisasi warna RGB ke rentang [-1.0, 1.0]
              inputTensor[pixelIndex++] = (pixel.r / 127.5) - 1.0;
              inputTensor[pixelIndex++] = (pixel.g / 127.5) - 1.0;
              inputTensor[pixelIndex++] = (pixel.b / 127.5) - 1.0;
            }
          }

          // Inisialisasi Interpreter dari byte model
          final Interpreter isolateInterpreter = Interpreter.fromBuffer(modelBytesLocal);
          isolateInterpreter.allocateTensors();

          final int labelsCount = labelsLocal.length;
          final List<List<double>> outputTensor = List<List<double>>.generate(
            1,
            (_) => List<double>.filled(labelsCount, 0.0),
          );

          // Jalankan inferensi dengan flat Float32List
          isolateInterpreter.run(inputTensor, outputTensor);
          isolateInterpreter.close();

          // Analisis hasil dengan probabilitas tertinggi
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
          print("❌ Kesalahan di dalam Isolate pemrosesan kamera live: $e");
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
      print("❌ Gagal mengklasifikasi citra kamera real-time: $e");
      return null;
    }
  }

  /// Membersihkan sumber daya saat service tidak lagi digunakan
  void dispose() {
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
  String toString() => 'Result(label: $label, confidence: ${(confidence * 100).toStringAsFixed(2)}%)';
}
