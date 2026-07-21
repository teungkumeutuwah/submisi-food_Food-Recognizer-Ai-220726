import 'dart:convert';
import 'package:http/http.dart' as http;

/// Service to fetch traditional and international recipes using TheMealDB API
/// with a robust offline fallback system for traditional Indonesian dishes.
class MealDBService {
  static const String _baseUrl = 'https://www.themealdb.com/api/json/v1/1/search.php?s=';

  /// Searches for a recipe by dish name. If no recipe is found online, 
  /// it dynamically returns a detailed fallback recipe based on popular traditional foods.
  Future<Map<String, dynamic>> fetchRecipe(String query) async {
    final sanitizedQuery = query.trim();
    if (sanitizedQuery.isEmpty) return _getFallbackRecipe("Makanan Umum");

    try {
      final response = await http.get(Uri.parse('$_baseUrl${Uri.encodeComponent(sanitizedQuery)}'));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final meals = data['meals'];
        if (meals != null && meals is List && meals.isNotEmpty) {
          final meal = meals[0];
          return {
            'hasRecipe': true,
            'title': meal['strMeal'] ?? sanitizedQuery,
            'thumb': meal['strMealThumb'] ?? 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80',
            'ingredients': _extractIngredients(meal),
            'instructions': meal['strInstructions'] ?? 'Ikuti langkah-langkah standar untuk menyajikan hidangan ini.',
          };
        }
      }
    } catch (e) {
      print("⚠️ Gagal menghubungi TheMealDB API (offline/kendala jaringan): $e");
    }

    // Jika tidak ditemukan di MealDB atau offline, berikan resep lokal berkualitas tinggi
    return _getFallbackRecipe(sanitizedQuery);
  }

  /// Extracts ingredients from MealDB JSON format where keys are strIngredient1, strMeasure1, etc.
  String _extractIngredients(Map<String, dynamic> meal) {
    final List<String> ingredients = [];
    for (int i = 1; i <= 20; i++) {
      final ingredient = meal['strIngredient$i'];
      final measure = meal['strMeasure$i'];
      if (ingredient != null && (ingredient as String).trim().isNotEmpty) {
        final measureStr = (measure != null && (measure as String).trim().isNotEmpty) 
            ? ' (${measure.trim()})' 
            : '';
        ingredients.add('${ingredient.trim()}$measureStr');
      }
    }
    return ingredients.join('; ');
  }

  /// Offline backup database of traditional Indonesian/common dishes with complete ingredients and instructions
  Map<String, dynamic> _getFallbackRecipe(String foodName) {
    final normalized = foodName.toLowerCase();

    if (normalized.contains('sate') || normalized.contains('satay')) {
      return {
        'hasRecipe': true,
        'title': 'Sate Ayam Tradisional',
        'thumb': 'https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=400&q=80',
        'ingredients': '500g Daging Dada Ayam (potong dadu); 20 buah Tusuk Sate; 150g Kacang Tanah Tanah (goreng & haluskan); 3 siung Bawang Putih; 5 siung Bawang Merah; 3 butir Kemiri; 2 sdm Kecap Manis; 1 sdm Gula Merah; 1 sdt Garam; 2 sdm Minyak Goreng; 200ml Air hangat',
        'instructions': '1. Tusuk potongan daging ayam ke tusuk sate (4 tusuk per gagang). Sisihkan.\n'
            '2. Haluskan bawang merah, bawang putih, kemiri, dan garam. Campur dengan kacang tanah halus, kecap manis, gula merah, minyak goreng, dan air hangat. Aduk rata hingga mengental menjadi bumbu kacang bumbu marinasi.\n'
            '3. Lumuri sate ayam dengan sebagian bumbu kacang tersebut, diamkan selama 15 menit agar bumbu meresap.\n'
            '4. Bakar sate di atas bara api atau wajan panggangan sambil diolesi sisa kecap manis dan bumbu kacang, bolak-balik hingga matang kecokelatan.\n'
            '5. Sajikan sate ayam hangat bersama siraman bumbu kacang sisa, perasan jeruk limau, dan irisan bawang merah segar.',
      };
    } else if (normalized.contains('nasi goreng')) {
      return {
        'hasRecipe': true,
        'title': 'Nasi Goreng Kampung Spesial',
        'thumb': 'https://images.unsplash.com/photo-1603133872878-685f208b843d?auto=format&fit=crop&w=400&q=80',
        'ingredients': '2 piring Nasi Putih dingin; 2 butir Telur ayam (kocok lepas); 100g Suwiran Daging Ayam; 2 buah Sosis/Bakso (iris tipis); 3 siung Bawang Merah; 2 siung Bawang Putih; 2 buah Cabai Merah Keriting; 2 sdm Kecap Manis; 1 sdm Saus Tiram; 1 sdt Garam; 1/2 sdt Kaldu Bubuk; 2 sdm Minyak Sayur; Daun bawang iris secukupnya',
        'instructions': '1. Haluskan bawang merah, bawang putih, dan cabai merah keriting.\n'
            '2. Panaskan minyak di wajan. Masukkan telur kocok, buat orak-arik hingga matang. Angkat dan sisihkan.\n'
            '3. Tumis bumbu halus di wajan yang sama hingga harum dan matang. Masukkan suwiran ayam, sosis, dan bakso. Aduk rata.\n'
            '4. Masukkan nasi putih dingin, telur orak-arik, kecap manis, saus tiram, garam, dan kaldu bubuk.\n'
            '5. Besarkan api, aduk nasi dengan cepat hingga bumbu tercampur rata dan meresap sempurna.\n'
            '6. Taburi daun bawang, aduk sebentar, angkat. Sajikan hangat dengan kerupuk dan irisan timun.',
      };
    } else if (normalized.contains('gado')) {
      return {
        'hasRecipe': true,
        'title': 'Gado-Gado Jakarta',
        'thumb': 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=400&q=80',
        'ingredients': '150g Kacang Tanah (goreng & haluskan); 1 blok Tempe & Tahu (goreng, iris dadu); 100g Tauge (rebus sebentar); 100g Kacang Panjang (potong & rebus); 1/2 buah Kol (iris & rebus); 1 buah Kentang (rebus, potong dadu); 1 buah Mentimun (iris tipis); 2 butir Telur Rebus (belah dua); 3 siung Bawang Putih; 2 sdm Air Asam Jawa; 2 sdm Gula Merah iris; 1 sdt Garam; Air hangat secukupnya',
        'instructions': '1. Haluskan bawang putih, cabai (opsional), gula merah, dan garam. Tambahkan kacang tanah goreng yang sudah halus, air asam jawa, dan air hangat secukupnya. Ulek atau blender hingga bumbu kacang kental dan halus.\n'
            '2. Tata sayuran yang telah direbus (tauge, kacang panjang, kol), kentang, tahu, tempe, telur rebus, dan mentimun di atas piring saji.\n'
            '3. Siram sayuran dengan bumbu gado-gado yang gurih manis.\n'
            '4. Sajikan segera bersama taburan bawang goreng dan kerupuk udang/emping melinjo.',
      };
    } else if (normalized.contains('bakso') || normalized.contains('meatball')) {
      return {
        'hasRecipe': true,
        'title': 'Bakso Sapi Kuah Hangat',
        'thumb': 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=400&q=80',
        'ingredients': '20 butir Bakso Sapi siap pakai; 150g Mie Kuning & Bihun (seduh); 1 liter Air Kaldu Sapi; 4 siung Bawang Putih (memarkan & goreng); 2 batang Seledri (iris halus); 1 sdm Bawang Merah Goreng; 1 sdt Merica Bubuk; 2 sdt Garam; 1 sdt Gula Pasir; Daun sawi hijau secukupnya',
        'instructions': '1. Didihkan air kaldu sapi dalam panci besar.\n'
            '2. Masukkan bawang putih goreng yang sudah dimemarkan, merica bubuk, garam, dan gula pasir ke dalam kuah. Aduk rata dan koreksi rasa.\n'
            '3. Masukkan bakso sapi ke dalam kuah mendidih, masak hingga bakso mengapung dan matang merata.\n'
            '4. Tata mie kuning, bihun, dan sawi hijau di dalam mangkuk saji.\n'
            '5. Tuangkan bakso beserta kuah panas secukupnya.\n'
            '6. Sajikan dengan taburan daun seledri, bawang merah goreng, sambal cabai rawit, dan kecap manis.',
      };
    } else if (normalized.contains('rendang')) {
      return {
        'hasRecipe': true,
        'title': 'Rendang Daging Sapi Minang asli',
        'thumb': 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=400&q=80',
        'ingredients': '1kg Daging Sapi (potong sesuai selera); 1 liter Santan Kental (dari 3 butir kelapa); 2 batang Serai (memarkan); 5 lembar Daun Jeruk Purut; 2 lembar Daun Kunyit (ikat simpul); 1 buah Asam Kandis; 12 siung Bawang Merah; 8 siung Bawang Putih; 150g Cabai Merah Keriting; 3cm Jahe; 3cm Lengkuas; 3cm Kunyit; 1 sdm Ketumbar Bubuk; 1/2 sdt Pala Bubuk; 2 sdt Garam',
        'instructions': '1. Haluskan bawang merah, bawang putih, cabai merah, jahe, lengkuas, kunyit, ketumbar, pala, dan garam.\n'
            '2. Campur bumbu halus dengan santan di wajan besar. Masukkan serai, daun jeruk, daun kunyit, dan asam kandis. Masak sambil diaduk perlahan hingga santan mengeluarkan minyak dan berwarna kemerahan.\n'
            '3. Masukkan potongan daging sapi, kecilkan api kompor.\n'
            '4. Masak terus selama 3 hingga 5 jam, aduk sesekali agar bagian bawah tidak gosong, hingga kuah mengering, berminyak, dan berubah warna menjadi cokelat gelap kehitaman yang gurih kaya rempah.\n'
            '5. Angkat dan sajikan rendang bersama nasi putih hangat.',
      };
    } else {
      // General Healthy Meal Option
      return {
        'hasRecipe': true,
        'title': 'Hidangan Rumahan Sehat',
        'thumb': 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80',
        'ingredients': '300g Bahan Utama Pilihan (Protein/Sayuran); 3 siung Bawang Merah; 2 siung Bawang Putih; 1/2 buah Bawang Bombay (iris); 1 buah Cabai Merah; 1 sdm Minyak Zaitun; 1 sdt Garam; 1/2 sdt Merica; 1 sdm Kecap Asin Rendah Natrium; Air secukupnya',
        'instructions': '1. Bersihkan semua bahan utama dan potong dengan ukuran yang seragam.\n'
            '2. Panaskan minyak zaitun di atas wajan anti lengket dengan api sedang.\n'
            '3. Tumis bawang putih, bawang merah, bawang bombay, dan cabai hingga matang kecokelatan dan aromanya harum.\n'
            '4. Masukkan bahan utama (daging, tahu, tempe, atau sayuran), tumis hingga setengah matang.\n'
            '5. Tambahkan kecap asin, garam, merica bubuk, serta sedikit air hangat.\n'
            '6. Tutup wajan, masak selama 5-10 menit hingga bumbu meresap sempurna dan bahan utama matang empuk. Sajikan hangat.',
      };
    }
  }
}
