import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/home_screen.dart';

void main() {
  // Pastikan binding Flutter terinisialisasi sebelum melakukan setelan sistem
  WidgetsFlutterBinding.ensureInitialized();
  
  // Setel orientasi perangkat ke potret murni untuk pengalaman pemindaian yang konsisten
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
  ]);

  // Setel bar navigasi & status bar yang modern & transparan
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
    systemNavigationBarColor: Colors.white,
    systemNavigationBarIconBrightness: Brightness.dark,
  ));

  runApp(const FoodRecognizerApp());
}

/// Root widget dari aplikasi NutriHalal AI yang menetapkan visual
/// identitas, palet warna, tipografi, dan navigasi utama.
class FoodRecognizerApp extends StatelessWidget {
  const FoodRecognizerApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NutriHalal AI',
      debugShowCheckedModeBanner: false,
      
      // Desain Tema Material 3 dengan warna-warna netral yang sophisticated
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
        
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF3B82F6), // Blue Accent
          primary: const Color(0xFF3B82F6),
          secondary: const Color(0xFF10B981), // Emerald Halal Green
          surface: Colors.white,
          onPrimary: Colors.white,
          onSurface: const Color(0xFF0F172A), // Dark Slate
        ),

        // Pengaturan font & tipografi premium yang ramah mata
        fontFamily: 'Roboto', // Default fallback font berstabilitas tinggi
        textTheme: const TextTheme(
          displayLarge: TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
          titleLarge: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
          bodyLarge: TextStyle(fontSize: 16, color: Color(0xFF334155), height: 1.5),
          bodyMedium: TextStyle(fontSize: 14, color: Color(0xFF475569), height: 1.4),
        ),

        // Kostumisasi style global untuk card & button
        cardTheme: CardTheme(
          color: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: Colors.grey.withOpacity(0.12), width: 1),
          ),
        ),

        appBarTheme: const AppBarTheme(
          elevation: 0,
          backgroundColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          iconTheme: IconThemeData(color: Color(0xFF0F172A)),
          titleTextStyle: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Color(0xFF0F172A),
          ),
        ),
      ),
      
      home: const HomeScreen(),
    );
  }
}
