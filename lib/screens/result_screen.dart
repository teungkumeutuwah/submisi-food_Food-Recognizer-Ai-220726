import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import '../models/scanned_food.dart';
import '../widgets/macro_card.dart';
import '../widgets/restaurant_finder.dart';

/// Halaman detail rincian analisis makanan hasil scan yang kaya fitur,
/// menyajikan info gizi, sertifikasi halal BPJPH, resep kuliner, dan asisten suara (TTS).
class ResultScreen extends StatefulWidget {
  final ScannedFood food;
  final VoidCallback onFavoriteToggle;

  const ResultScreen({
    Key? key,
    required this.food,
    required this.onFavoriteToggle,
  }) : super(key: key);

  @override
  State<ResultScreen> createState() => _ResultScreenState();
}

class _ResultScreenState extends State<ResultScreen> {
  final FlutterTts _flutterTts = FlutterTts();
  bool _isPlayingTts = false;
  Map<String, bool> _ingredientChecklist = {};

  @override
  void initState() {
    super.initState();
    _initTts();
    _initChecklist();
  }

  /// Menginisialisasi Text-to-Speech untuk asisten suara pembaca resep
  Future<void> _initTts() async {
    try {
      await _flutterTts.setLanguage("id-ID"); // Atur ke Bahasa Indonesia murni
      await _flutterTts.setSpeechRate(0.45);  // Kecepatan membaca santai
      await _flutterTts.setPitch(1.0);        // Pitch normal bersahabat

      _flutterTts.setStartHandler(() {
        if (mounted) setState(() => _isPlayingTts = true);
      });

      _flutterTts.setCompletionHandler(() {
        if (mounted) setState(() => _isPlayingTts = false);
      });

      _flutterTts.setErrorHandler((msg) {
        print("⚠️ TTS Error: $msg");
        if (mounted) setState(() => _isPlayingTts = false);
      });
    } catch (e) {
      print("❌ TTS Gagal diinisialisasi: $e");
    }
  }

  /// Membuat daftar ceklis bahan-bahan masakan agar interaktif untuk memasak
  void _initChecklist() {
    final rawIngredients = widget.food.recipeIngredients.split(';');
    for (var ingredient in rawIngredients) {
      final clean = ingredient.trim();
      if (clean.isNotEmpty) {
        _ingredientChecklist[clean] = false;
      }
    }
  }

  /// Menjalankan / Menghentikan narasi asisten suara untuk resep
  Future<void> _toggleTts() async {
    if (_isPlayingTts) {
      await _flutterTts.stop();
      setState(() => _isPlayingTts = false);
    } else {
      final String speechContent = "Berikut adalah resep untuk ${widget.food.recipeTitle}. "
          "Bahan-bahan yang perlu disiapkan adalah: ${widget.food.recipeIngredients.replaceAll(';', ',')}. "
          "Langkah-langkah memasaknya yaitu: ${widget.food.recipeInstructions}. Selamat mencoba!";
      
      await _flutterTts.speak(speechContent);
    }
  }

  @override
  Widget build(BuildContext context) {
    final food = widget.food;
    final File imgFile = File(food.imagePath);

    return Scaffold(
      backgroundColor: Colors.white,
      body: CustomScrollView(
        slivers: [
          // 1. Sleek Photo Appbar Header
          SliverAppBar(
            expandedHeight: 280,
            pinned: true,
            backgroundColor: const Color(0xFF0F172A),
            elevation: 0,
            leading: CircleAvatar(
              backgroundColor: Colors.black.withValues(alpha: 0.4),
              child: IconButton(
                icon: const Icon(Icons.arrow_back, color: Colors.white),
                onPressed: () => Navigator.pop(context),
              ),
            ),
            actions: [
              // Favorite Button
              CircleAvatar(
                backgroundColor: Colors.black.withValues(alpha: 0.4),
                child: IconButton(
                  icon: Icon(
                    food.isFavorite ? Icons.favorite : Icons.favorite_border,
                    color: food.isFavorite ? Colors.red : Colors.white,
                  ),
                  onPressed: () {
                    widget.onFavoriteToggle();
                    setState(() {});
                  },
                ),
              ),
              const SizedBox(width: 14),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: Hero(
                tag: food.id,
                child: imgFile.existsSync()
                    ? Image.file(imgFile, fit: BoxFit.cover)
                    : Image.network(
                        food.recipeThumb.isNotEmpty 
                            ? food.recipeThumb 
                            : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
                        fit: BoxFit.cover,
                      ),
              ),
            ),
          ),

          // 2. Main Content
          SliverList(
            delegate: SliverChildListDelegate([
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Title and Confidence Score %
                    _buildTitleSection(food),
                    const SizedBox(height: 16),
                    const Divider(color: Color(0xFFE2E8F0)),
                    const SizedBox(height: 16),

                    // Nutrient Dashboard Section (Kalori, Karbohidrat, Lemak, Serat, Protein)
                    _buildNutritionSection(food),
                    const SizedBox(height: 24),
                    const Divider(color: Color(0xFFE2E8F0)),
                    const SizedBox(height: 16),

                    // Interactive Recipe Cooking Guide Panel (MealDB API)
                    _buildRecipeSection(food),
                    const SizedBox(height: 40),
                  ],
                ),
              ),
            ]),
          ),
        ],
      ),
    );
  }

  /// Displays food name and confidence level from LiteRT model
  Widget _buildTitleSection(ScannedFood food) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(
                food.name,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                  color: Color(0xFF0F172A),
                  letterSpacing: -0.5,
                ),
              ),
            ),
            // Simulation badge if simulated
            if (food.isSimulated)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.blue.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  "Mode Simulasi",
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: Colors.blue,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        // Confidence bar indicator
        Row(
          children: [
            const Icon(Icons.verified, color: Color(0xFF10B981), size: 16),
            const SizedBox(width: 6),
            Text(
              "Tingkat Kepercayaan AI (LiteRT): ${(food.confidence * 100).toStringAsFixed(1)}%",
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: Color(0xFF10B981),
              ),
            ),
          ],
        ),
      ],
    );
  }

  /// Displays calories and full macronutrient indicators (Kalori, Karbohidrat, Lemak, Serat, Protein)
  Widget _buildNutritionSection(ScannedFood food) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          "Kandungan Nutrisi Per Porsi (Gemini AI)",
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: Color(0xFF1E293B),
          ),
        ),
        const SizedBox(height: 16),
        Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: MacroCard(
                    label: "Kalori",
                    amount: food.calories.toStringAsFixed(0),
                    unit: "kkal",
                    progress: food.calories / 1000.0,
                    color: Colors.red,
                    icon: Icons.local_fire_department,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: MacroCard(
                    label: "Karbohidrat",
                    amount: food.carbs.toStringAsFixed(0),
                    unit: "g",
                    progress: food.carbs / 150.0,
                    color: const Color(0xFF3B82F6),
                    icon: Icons.grain,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: MacroCard(
                    label: "Protein",
                    amount: food.protein.toStringAsFixed(0),
                    unit: "g",
                    progress: food.protein / 50.0,
                    color: const Color(0xFFF97316),
                    icon: Icons.fitness_center,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: MacroCard(
                    label: "Lemak",
                    amount: food.fat.toStringAsFixed(0),
                    unit: "g",
                    progress: food.fat / 40.0,
                    color: const Color(0xFFEAB308),
                    icon: Icons.opacity,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: MacroCard(
                    label: "Serat",
                    amount: food.fiber.toStringAsFixed(1),
                    unit: "g",
                    progress: food.fiber / 15.0,
                    color: Colors.green,
                    icon: Icons.spa,
                  ),
                ),
              ],
            ),
          ],
        )
      ],
    );
  }

  /// Modern Interactive Cooking Recipe panel with TTS voice guide and recipe image (strMealThumb)
  Widget _buildRecipeSection(ScannedFood food) {
    if (!food.hasRecipe) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.menu_book, color: Color(0xFF3B82F6), size: 22),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  food.recipeTitle,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF1E293B),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Recipe Image (strMealThumb)
          if (food.recipeThumb.isNotEmpty) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Image.network(
                food.recipeThumb,
                width: double.infinity,
                height: 180,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => const SizedBox.shrink(),
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Voice Guide Trigger Button
          InkWell(
            onTap: _toggleTts,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: _isPlayingTts 
                    ? const Color(0xFFEF4444).withValues(alpha: 0.08) 
                    : const Color(0xFF3B82F6).withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _isPlayingTts ? const Color(0xFFEF4444) : const Color(0xFF3B82F6),
                  width: 1.2,
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    _isPlayingTts ? Icons.volume_off : Icons.volume_up,
                    color: _isPlayingTts ? const Color(0xFFEF4444) : const Color(0xFF3B82F6),
                    size: 20,
                  ),
                  const SizedBox(width: 10),
                  Text(
                    _isPlayingTts ? "Hentikan Asisten Suara" : "Dengarkan Resep (Suara)",
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: _isPlayingTts ? const Color(0xFFEF4444) : const Color(0xFF3B82F6),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Subtitle
          const Text(
            "Bahan-Bahan Masakan (Ceklis):",
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 8),

          // Checklist of ingredients
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _ingredientChecklist.length,
            itemBuilder: (context, index) {
              final key = _ingredientChecklist.keys.elementAt(index);
              final isChecked = _ingredientChecklist[key] ?? false;

              return CheckboxListTile(
                title: Text(
                  key,
                  style: TextStyle(
                    fontSize: 12.5,
                    color: isChecked ? Colors.grey[400] : const Color(0xFF334155),
                    decoration: isChecked ? TextDecoration.lineThrough : null,
                  ),
                ),
                value: isChecked,
                activeColor: const Color(0xFF3B82F6),
                checkColor: Colors.white,
                dense: true,
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                onChanged: (val) {
                  setState(() {
                    _ingredientChecklist[key] = val ?? false;
                  });
                },
              );
            },
          ),
          const SizedBox(height: 18),

          // Instructions
          const Text(
            "Instruksi Langkah Memasak:",
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            food.recipeInstructions.replaceAll('\\n', '\n'),
            style: const TextStyle(
              fontSize: 12.5,
              color: Color(0xFF475569),
              height: 1.6,
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _flutterTts.stop();
    super.dispose();
  }
}
