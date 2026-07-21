import 'dart:io';
import 'dart:isolate';
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

          // Buat struktur data 4D List [1, 224, 224, 3]
          final List<List<List<List<double>>>> inputTensor = List.generate(
            1,
            (_) => List.generate(
              224,
              (y) => List.generate(
                224,
                (x) {
                  final pixel = resizedImage.getPixel(x, y);
                  
                  // Konversi nilai RGB 0-255 ke skala float [-1.0, 1.0]
                  final double rNormalized = (pixel.r / 127.5) - 1.0;
                  final double gNormalized = (pixel.g / 127.5) - 1.0;
                  final double bNormalized = (pixel.b / 127.5) - 1.0;

                  return [rNormalized, gNormalized, bNormalized];
                },
              ),
            ),
          );

          // Buat interpreter dari buffer byte model di background thread (Isolate)
          final Interpreter isolateInterpreter = Interpreter.fromBuffer(modelBytesLocal);
          isolateInterpreter.allocateTensors();

          final int labelsCount = labelsLocal.length;
          final List<List<double>> outputTensor = List<List<double>>.generate(
            1,
            (_) => List<double>.filled(labelsCount, 0.0),
          );

          // Jalankan inferensi di background thread
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
