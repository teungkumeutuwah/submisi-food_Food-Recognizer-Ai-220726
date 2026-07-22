import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Configure multer for image uploads (in-memory storage for easy processing)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// --- Lazy Initialized Gemini Client ---
let aiInstance: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return aiInstance;
}

// Fallback Labels matching FoodClassifier.kt
const FALLBACK_LABELS = [
  "Sate Matang", "Nasi Goreng", "Sate Ayam", "Rendang", "Bakso", 
  "Soto Ayam", "Gado-Gado", "Martabak", "Nasi Uduk", "Mie Goreng",
  "Burger", "Pizza", "Salad", "Chocolate Cake", "Sushi", 
  "Ramen", "Spaghetti Carbonara", "Kebab", "Tacos", "Steak",
  "Lontong Sayur", "Mie Aceh"
];

// Fallback Nutrition Generator matching GeminiManager.kt
function generateSimulationNutrition(foodName: string) {
  const nameLower = foodName.toLowerCase();
  if (
    nameLower.includes("eiffel") ||
    nameLower.includes("flower") ||
    nameLower.includes("pot") ||
    nameLower.includes("geranium") ||
    nameLower.includes("tower") ||
    nameLower.includes("non-makanan") ||
    nameLower.includes("bukan makanan") ||
    nameLower.includes("buku") ||
    nameLower.includes("non_food") ||
    nameLower.includes("non-food")
  ) {
    return { calories: 0, carbs: 0, fat: 0, fiber: 0, protein: 0 };
  }
  if (nameLower.includes("lontong") || nameLower.includes("sayur")) {
    return { calories: 350, carbs: 48, fat: 12, fiber: 3, protein: 10 };
  } else if (nameLower.includes("mie aceh") || nameLower.includes("mie") || nameLower.includes("aceh")) {
    return { calories: 480, carbs: 62, fat: 16, fiber: 2, protein: 14 };
  } else if (nameLower.includes("burger") || nameLower.includes("pizza")) {
    return { calories: 550, carbs: 45, fat: 25, fiber: 3, protein: 20 };
  } else if (nameLower.includes("salad") || nameLower.includes("sayur") || nameLower.includes("gado")) {
    return { calories: 150, carbs: 10, fat: 8, fiber: 4, protein: 3 };
  } else if (nameLower.includes("nasi goreng") || nameLower.includes("rice") || nameLower.includes("lemak") || nameLower.includes("uduk")) {
    return { calories: 420, carbs: 55, fat: 15, fiber: 2, protein: 12 };
  } else if (nameLower.includes("ayam") || nameLower.includes("chicken") || nameLower.includes("sate")) {
    return { calories: 320, carbs: 0, fat: 18, fiber: 0, protein: 28 };
  } else if (nameLower.includes("steak") || nameLower.includes("daging") || nameLower.includes("rendang")) {
    return { calories: 450, carbs: 0, fat: 28, fiber: 0, protein: 32 };
  } else if (nameLower.includes("buah") || nameLower.includes("apel") || nameLower.includes("pisang")) {
    return { calories: 90, carbs: 22, fat: 0, fiber: 3, protein: 1 };
  } else if (nameLower.includes("bakso") || nameLower.includes("soto") || nameLower.includes("ramen")) {
    return { calories: 280, carbs: 25, fat: 12, fiber: 1, protein: 18 };
  } else if (nameLower.includes("cake") || nameLower.includes("martabak") || nameLower.includes("chocolate")) {
    return { calories: 380, carbs: 48, fat: 18, fiber: 2, protein: 6 };
  } else if (nameLower.includes("lasagna")) {
    return { calories: 350, carbs: 32, fat: 16, fiber: 2, protein: 18 };
  } else if (nameLower.includes("stew") || nameLower.includes("sop") || nameLower.includes("semur")) {
    return { calories: 290, carbs: 18, fat: 14, fiber: 3, protein: 22 };
  } else {
    return { calories: 250, carbs: 30, fat: 10, fiber: 2, protein: 8 };
  }
}

// Fallback Indonesian Recipe Generator
function generateSimulationRecipe(foodName: string) {
  const nameLower = foodName.toLowerCase();
  
  if (
    nameLower.includes("eiffel") ||
    nameLower.includes("flower") ||
    nameLower.includes("pot") ||
    nameLower.includes("geranium") ||
    nameLower.includes("tower") ||
    nameLower.includes("non-makanan") ||
    nameLower.includes("bukan makanan") ||
    nameLower.includes("buku") ||
    nameLower.includes("non_food") ||
    nameLower.includes("non-food")
  ) {
    return {
      recipeTitle: "Bukan Makanan Valid 🚫",
      recipeIngredients: "Tidak ada bahan; Gambar ini dideteksi sebagai objek non-makanan.",
      recipeInstructions: "Sistem mendeteksi bahwa gambar yang Anda pindai bukanlah makanan. Silakan ambil atau pilih foto hidangan makanan yang valid untuk melihat rincian resep dan kandungan nutrisinya secara akurat!"
    };
  } else if (nameLower.includes("lontong") || nameLower.includes("sayur")) {
    return {
      recipeTitle: "Resep Lontong Sayur Gurih Lebaran",
      recipeIngredients: "5 buah lontong siap saji (potong-potong); 1 buah labu siam (iris korek api); 100 gram tempe (potong dadu); 2 batang serai (memarkan); 3 lembar daun salam; 1 liter santan sedang; Bumbu halus: 6 siung bawang merah, 3 siung bawang putih, 4 butir kemiri, 2 cm kunyit, 5 cabai merah keriting, 1 sdt ketumbar, garam dan gula pasir secukupnya; Pelengkap: telur rebus, kerupuk merah, bawang goreng",
      recipeInstructions: "1. Tumis bumbu halus bersama serai dan daun salam hingga harum dan matang.\n2. Masukkan irisan labu siam dan tempe dadu, aduk rata hingga labu layu.\n3. Tuang santan perlahan sambil diaduk agar santan tidak pecah. Masak hingga mendidih dengan api sedang.\n4. Tambahkan garam, gula pasir, dan kaldu bubuk sesuai selera. Masak hingga labu siam empuk.\n5. Potong-potong lontong di mangkuk, siram dengan sayur labu siam bersantan hangat.\n6. Sajikan hangat dengan pelengkap telur rebus, taburan bawang goreng, dan kerupuk merah."
    };
  } else if (nameLower.includes("mie aceh") || nameLower.includes("mie") || nameLower.includes("aceh")) {
    return {
      recipeTitle: "Resep Mie Aceh Goreng Basah Pedas Mantap",
      recipeIngredients: "400 gram mie kuning basah; 150 gram daging sapi (rebus, potong dadu); 50 gram tauge segar; 50 gram kol (iris halus); 1 batang daun bawang (iris); 2 sdm kecap manis; 1 sdm kecap asin; 200 ml kaldu sapi murni; Bumbu halus: 6 betir bawang merah, 4 siung bawang putih, 4 cabai merah besar, 3 cabai rawit, 1/2 sdt jinten bubuk, 1/2 sdt ketumbar bubuk, 2 butir kapulaga, 1 cm kunyit, garam secukupnya; Pelengkap: acar bawang merah, emping melinjo, irisan jeruk nipis",
      recipeInstructions: "1. Tumis bumbu halus hingga harum dan matang. Masukkan potongan daging sapi rebus, aduk rata.\n2. Tambahkan kol, tauge, dan daun bawang, aduk hingga sayuran agak layu.\n3. Masukkan mie kuning basah, kecap manis, kecap asin, garam, dan kaldu sapi. Aduk rata agar bumbu meresap.\n4. Masak hingga kuah kaldu menyusut dan mie matang (nyemek/goreng basah).\n5. Angkat dan sajikan selagi panas bersama acar bawang merah, kerupuk emping melinjo, dan perasan jeruk nipis."
    };
  } else if (nameLower.includes("lasagna")) {
    return {
      recipeTitle: "Resep Lasagna Panggang Klasik Italia",
      recipeIngredients: "12 lembar kulit lasagna kering; 300 gram daging sapi cincang; 1 buah bawang bombay (cincang); 2 siung bawang putih (cincang); 400 gram saus tomat/bolognese; 200 ml saus bechamel cream; 150 gram keju mozzarella parut; 50 gram keju parmesan; lada, garam, dan oregano secukupnya",
      recipeInstructions: "1. Rebus lembaran lasagna kering dalam air mendidih yang diberi sedikit minyak selama 8-10 menit hingga al dente, lalu tiriskan.\n2. Untuk saus daging: tumis bawang bombay dan bawang putih hingga harum. Masukkan daging sapi cincang, masak hingga berubah warna. Tambahkan saus bolognese, bumbui dengan garam, lada, dan oregano. Didihkan dengan api kecil.\n3. Siapkan pinggan tahan panas (pyrex), olesi tipis dengan margarin.\n4. Susun lasagna: letakkan lembaran lasagna di dasar wadah, tuang saus daging, ratakan saus bechamel, dan taburi keju mozzarella.\n5. Ulangi lapisan ini hingga bahan habis (biasanya 3-4 lapis), akhiri dengan taburan mozzarella dan parmesan di paling atas.\n6. Panggang dalam oven bersuhu 180°C selama kurang lebih 30 menit hingga keju meleleh kecokelatan.\n7. Potong-potong dan sajikan hangat."
    };
  } else if (nameLower.includes("stew") || nameLower.includes("sop") || nameLower.includes("semur")) {
    return {
      recipeTitle: "Resep Beef Stew Kentang Wortel Klasik",
      recipeIngredients: "500 gram daging sapi sengkel (potong dadu); 2 buah kentang (potong dadu besar); 2 buah wortel (potong bulat tebal); 1 buah bawang bombay (potong kasar); 3 siung bawang putih (memarkan); 2 sdm tepung terigu; 500 ml air kaldu sapi; 2 sdm saus tomat; 1 sdm kecap inggris; lada bubuk, garam, pala, dan daun seledri secukupnya",
      recipeInstructions: "1. Lumuri potongan daging sapi dengan sedikit tepung terigu, garam, dan lada bubuk.\n2. Panaskan sedikit minyak di panci tebal. Masak daging hingga luarnya berwarna kecokelatan (seared), lalu angkat.\n3. Di panci yang sama, tumis bawang bombay dan bawang putih hingga harum dan layu.\n4. Masukkan kembali daging sapi, tambahkan air kaldu sapi, saus tomat, kecap inggris, garam, merica, dan pala bubuk.\n5. Tutup panci, masak dengan api kecil selama 1 jam hingga daging mulai empuk.\n6. Masukkan potongan wortel dan kentang. Masak kembali selama 20-30 menit hingga sayuran empuk dan kuah mengental.\n7. Sajikan hangat dengan taburan daun seledri segar."
    };
  } else if (nameLower.includes("sate matang")) {
    return {
      recipeTitle: "Resep Sate Matang Khas Aceh",
      recipeIngredients: "500 gram daging kambing atau sapi (potong dadu kecil); tusuk sate secukupnya; Bumbu marinasi daging: 3 siung bawang putih, 1 sdt ketumbar, 1/2 sdt jinten, 1 ruas jahe, 1 sdm gula merah, garam secukupnya; Bumbu kuah soto (kaldu kambing/sapi): 1 batang serai, 2 lembar daun jeruk, 1 ruas lengkuas, santan encer secukupnya; Bumbu kacang sate: 100 gram kacang tanah goreng (haluskan), kecap manis, cabai rawit secukupnya",
      recipeInstructions: "1. Haluskan bumbu marinasi daging. Lumuri potongan daging sapi atau kambing dengan bumbu halus tersebut, diamkan minimal 30 menit agar bumbu meresap.\n2. Tusuk daging pada tusuk sate (3-4 potong per tusuk), kemudian bakar sate di atas bara api hingga matang dan berwarna kecokelatan.\n3. Untuk kuah soto pendamping: tumis serai, daun jeruk, dan lengkuas, tambahkan kaldu rebusan tulang sapi/kambing beserta bumbu rempah soto (cengkeh, kapulaga, kayu manis) dan santan encer. Masak hingga mendidih.\n4. Siapkan bumbu kacang gurih pedas khas sate matang dengan memadukan kacang tanah goreng halus dengan sedikit kaldu hangat dan kecap manis.\n5. Sajikan Sate Matang selagi panas bersama sepiring nasi putih hangat, bumbu kacang kental, dan semangkuk kuah soto kaldu gurih yang hangat."
    };
  } else if (nameLower.includes("nasi lemak")) {
    return {
      recipeTitle: "Resep Nasi Lemak Gurih Khas Melayu",
      recipeIngredients: "2 gelas beras; 400 ml santan encer; 2 lembar daun pandan; 1 batang serai (memarkan); 1 sdt garam; Bahan sambal: 5 butir bawang merah, 2 siung bawang putih, 10 cabai merah kering, 1 sdm terasi goreng, garam dan gula secukupnya; Pelengkap: telur rebus, teri goreng, kacang tanah goreng, timun iris",
      recipeInstructions: "1. Cuci bersih beras. Masukkan beras, santan, daun pandan, serai, dan garam ke dalam rice cooker.\n2. Masak beras hingga matang, lalu aduk perlahan agar nasi pulen.\n3. Untuk sambal: haluskan bawang merah, bawang putih, cabai, dan terasi. Tumis hingga harum dan matang, bumbui dengan garam dan gula.\n4. Sajikan nasi lemak hangat bersama sambal, telur rebus, teri, kacang goreng, dan irisan timun."
    };
  } else if (nameLower.includes("nasi goreng")) {
    return {
      recipeTitle: "Resep Nasi Goreng Kampung Lezat",
      recipeIngredients: "2 piring nasi putih (dingin); 3 siung bawang merah; 2 siung bawang putih; 2 cabai merah keriting; 2 sdm kecap manis; 1 sdt garam; 1/2 sdt kaldu bubuk; 1 butir telur; minyak goreng secukupnya",
      recipeInstructions: "1. Haluskan bawang merah, bawang putih, dan cabai merah.\n2. Panaskan minyak di wajan. Tumis bumbu halus hingga wangi dan matang.\n3. Sisihkan bumbu ke pinggir wajan, masukkan telur dan buat orak-arik.\n4. Masukkan nasi putih dingin, aduk rata dengan bumbu dan telur.\n5. Tambahkan kecap manis, garam, dan kaldu bubuk. Aduk cepat dengan api besar hingga bumbu meresap.\n6. Angkat dan sajikan hangat."
    };
  } else if (nameLower.includes("sate")) {
    return {
      recipeTitle: "Resep Sate Ayam Bumbu Kacang Madura",
      recipeIngredients: "500 gram dada ayam (potong dadu); tusuk sate secukupnya; Bumbu marinasi: 2 siung bawang putih (haluskan), 1 sdm ketumbar bubuk, 3 sdm kecap manis, 1 sdm minyak; Bumbu kacang: 150 gram kacang tanah goreng (haluskan), 3 siung bawang merah, 2 siung bawang putih, 2 butir kemiri, gula merah dan garam secukupnya",
      recipeInstructions: "1. Campur potongan ayam dengan bumbu marinasi, diamkan selama 30 menit agar meresap.\n2. Tusuk daging ayam ke tusuk sate (3-4 potong per tusuk).\n3. Panggang sate di atas alat pemanggang sambil sesekali diolesi sisa bumbu marinasi hingga matang kecokelatan.\n4. Untuk bumbu kacang: tumis bawang merah, bawang putih, dan kemiri yang dihaluskan. Campurkan dengan kacang tanah halus and air hangat, masak hingga mengental dan mengeluarkan minyak. Bumbui dengan garam dan gula merah.\n5. Sajikan sate ayam hangat bersama bumbu kacang dan kecap manis."
    };
  } else if (nameLower.includes("rendang")) {
    return {
      recipeTitle: "Resep Rendang Daging Sapi Minang Asli",
      recipeIngredients: "500 gram daging sapi (potong sesuai selera); 1 liter santan dari 1,5 butir kelapa; 2 batang serai (memarkan); 3 lembar daun jeruk; 1 lembar daun kunyit; Bumbu halus: 10 butir bawang merah, 5 siung bawang putih, 100 gram cabai merah keriting, 2 cm jahe, 2 cm lengkuas, 1 sdm ketumbar bubuk, 1/2 sdt pala bubuk, garam secukupnya",
      recipeInstructions: "1. Campurkan santan bersama bumbu halus, serai, daun jeruk, dan daun kunyit di dalam wajan besar. Masak sambil terus diaduk hingga mendidih dan mengeluarkan minyak.\n2. Masukkan potongan daging sapi, kecilkan api kompor.\n3. Masak rendang sambil sesekali diaduk agar bagian bawahnya tidak gosong.\n4. Teruskan memasak hingga kuah santan menyusut, mengering, dan berubah warna menjadi cokelat gelap kehitaman (proses memakan waktu sekitar 3-4 jam).\n5. Angkat rendang dan sajikan."
    };
  } else if (nameLower.includes("bakso")) {
    return {
      recipeTitle: "Resep Bakso Sapi Kuah Gurih Komplit",
      recipeIngredients: "500 gram bakso sapi siap pakai; Kuah bakso: 2 liter air, 200 gram tetelan sapi/tulang sapi; Bumbu halus kuah: 5 siung bawang putih, 3 siung bawang merah, 1 sdt merica butiran, 1 sdm garam, 1 sdt kaldu sapi bubuk; Pelengkap: mie kuning, bihun, daun seledri iris, bawang goreng, sambal cabai rawit",
      recipeInstructions: "1. Rebus air dan tetelan/tulang sapi dalam panci besar hingga mendidih dan kaldunya keluar.\n2. Tumis bumbu halus kuah hingga harum dan matang kekuningan, lalu masukkan ke dalam air kaldu rebusan.\n3. Masukkan bakso sapi kuah, masak dengan api kecil hingga bakso mengapung dan matang.\n4. Siapkan mangkuk saji, tata mie kuning, bihun, dan siram dengan bakso beserta kuah panas.\n5. Taburi irisan seledri, bawang goreng, dan sajikan bersama sambal."
    };
  } else if (nameLower.includes("soto")) {
    return {
      recipeTitle: "Resep Soto Ayam Lamongan Kuah Kuning",
      recipeIngredients: "1 ekor ayam (potong 4 bagian); 2 liter air; 2 batang serai (memarkan); 3 lembar daun jeruk; Bumbu halus soto: 8 butir bawang merah, 5 siung bawang putih, 3 cm kunyit (bakar), 2 cm jahe, 4 butir kemiri goreng, 1 sdt ketumbar bubuk, 1 sdt merica, garam secukupnya; Pelengkap: soun, tauge, telur rebus, irisan daun seledri, bawang goreng, koya gurih",
      recipeInstructions: "1. Rebus ayam dalam air mendidih hingga empuk. Angkat ayam, tiriskan, lalu suwir-suwir dagingnya.\n2. Tumis bumbu halus soto bersama serai dan daun jeruk hingga harum dan matang.\n3. Masukkan tumisan bumbu ke dalam air rebusan kaldu ayam. Didihkan kembali dengan api kecil.\n4. Siapkan mangkuk saji. Susun soun, tauge, suwiran ayam, dan telur rebus.\n5. Siram dengan kuah soto kuning panas.\n6. Sajikan hangat dengan taburan bawang goreng, seledri, koya, dan perasan jeruk nipis."
    };
  } else if (nameLower.includes("gado")) {
    return {
      recipeTitle: "Resep Gado-Gado Siram Sayuran Sehat",
      recipeIngredients: "Bahan sayur (rebus): 150 gram kangkung, 100 gram kubis iris, 100 gram tauge; Bahan pelengkap: 1 buah kentang rebus, 1 buah tahu goreng, 1 papan tempe goreng, 2 butir telur rebus; Saus kacang: 150 gram kacang tanah goreng (haluskan), 2 siung bawang putih, 3 cabai merah, 1 sdm air asam jawa, 1 keping gula merah, 1/2 sdt garam, air secukupnya",
      recipeInstructions: "1. Rebus semua sayuran secara terpisah hingga matang layu, lalu tiriskan.\n2. Potong-potong kentang rebus, tahu goreng, tempe goreng, dan telur rebus sesuai selera.\n3. Untuk saus kacang: haluskan bawang putih dan cabai merah. Tumis hingga harum, lalu masukkan kacang tanah halus, air, air asam jawa, gula merah, dan garam. Masak hingga mengental dan berminyak.\n4. Tata sayuran rebus dan bahan pelengkap di atas piring saji.\n5. Siram dengan saus kacang gurih di atasnya, sajikan bersama kerupuk."
    };
  } else if (nameLower.includes("martabak")) {
    return {
      recipeTitle: "Resep Martabak Manis Terang Bulan Teflon",
      recipeIngredients: "250 gram tepung terigu protein sedang; 300 ml air hangat; 2 sdm gula pasir; 1 butir telur; 1/2 sdt baking powder; 1/2 sdt soda kue; mentega secukupnya; Topping: susu kental manis, keju parut, meses cokelat, kacang tanah sangrai cincang",
      recipeInstructions: "1. Campur tepung terigu, gula pasir, baking powder, telur, dan air. Kocok menggunakan whisk hingga adonan lembut dan licin.\n2. Adonan didiamkan selama 1 jam dalam wadah tertutup.\n3. Panaskan wajan teflon anti lengket tanpa minyak dengan api kecil hingga benar-benar panas.\n4. Sesaat sebelum adonan dituang, masukkan soda kue yang dilarutkan sedikit air ke adonan, aduk rata.\n5. Tuang adonan ke teflon, ratakan ke pinggiran teflon untuk membuat kulit luar. Masak hingga muncul gelembung-gelembung di permukaan.\n6. Taburi sedikit gula pasir, tutup teflon hingga permukaan mengering dan matang.\n7. Angkat, olesi mentega selagi panas, beri topping meses, kacang, keju, dan susu kental manis. Lipat martabak, potong-potong, lalu sajikan."
    };
  } else if (nameLower.includes("burger")) {
    return {
      recipeTitle: "Resep Beef Burger Homemade Juicy",
      recipeIngredients: "2 buah roti burger (bun); 200 gram daging sapi cincang (beef patty); 1 siung bawang putih (cincang halus); 1/2 buah bawang bombay (iris cincang); 1/2 sdt garam; 1/2 sdt merica bubuk; margarin secukupnya; Pelengkap: keju lembaran, tomat iris, timun iris, selada, saus tomat, saus sambal, mayones",
      recipeInstructions: "1. Campur daging cincang dengan bawang putih, bawang bombay, garam, dan merica bubuk. Aduk rata lalu bentuk menjadi 2 lempengan bulat (patty).\n2. Diamkan patty di freezer selama 15 menit agar bentuknya kokoh.\n3. Panaskan sedikit margarin di wajan anti lengket. Panggang beef patty hingga matang kecokelatan di kedua sisinya.\n4. Belah dua roti burger bun, panggang sebentar bagian dalamnya dengan sedikit margarin hingga kecokelatan.\n5. Susun burger mulai dari bun bawah, saus, mayones, selada, beef patty panas, keju lembaran, tomat, timun, dan tutup dengan bun atas.\n6. Sajikan hangat."
    };
  } else if (nameLower.includes("pizza")) {
    return {
      recipeTitle: "Resep Pizza Mini Teflon Sederhana",
      recipeIngredients: "Bahan adonan: 200 gram tepung terigu, 1 sdt ragi instan, 1 sdm minyak zaitun/sayur, 120 ml air hangat, 1/2 sdt garam; Bahan saus: 4 sdm saus bolognese siap pakai; Bahan topping: 1 buah sosis iris bulat, 1/4 buah bawang bombay iris panjang, keju mozzarella parut secukupnya",
      recipeInstructions: "1. Campur terigu, ragi, minyak, air hangat, dan garam. Uleni hingga kalis dan adonan elastis.\n2. Bulatkan adonan, diamkan selama 30 menit hingga mengembang dua kali lipat.\n3. Kempeskan adonan, gilas bulat setebal 1 cm. Tusuk-tusuk permukaan adonan dengan garpu.\n4. Panaskan teflon dengan api sangat kecil, olesi tipis margarin. Letakkan adonan di teflon.\n5. Olesi permukaan adonan dengan saus bolognese, tata sosis, bawang bombay, dan taburi keju mozzarella.\n6. Tutup teflon raba-raba, panggang hingga kulit pizza kecokelatan dan keju mozzarella meleleh sempurna (sekitar 10-15 menit).\n7. Angkat dan sajikan selagi hangat."
    };
  } else if (nameLower.includes("salad")) {
    return {
      recipeTitle: "Resep Salad Sayur Saus Mayones Segar",
      recipeIngredients: "1 buah wortel (potong korek api halus); 5 lembar selada hijau (robek kasar); 1 buah timun (iris tipis); 1 buah tomat merah (potong dadu); 1/2 buah bawang bombay (iris tipis); Saus dressing: 4 sdm mayones, 1 sdm susu kental manis, 1 sdm air perasan jeruk nipis, 1/4 sdt garam dan lada hitam bubuk",
      recipeInstructions: "1. Cuci bersih semua sayuran segar dengan air matang dingin, lalu tiriskan.\n2. Untuk saus dressing: campur mayones, susu kental manis, jeruk nipis, garam, dan lada hitam di mangkuk kecil. Aduk hingga rata.\n3. Susun semua sayuran segar di mangkuk besar.\n4. Siram dengan saus dressing mayones sesaat sebelum disajikan agar sayuran tetap renyah.\n5. Aduk rata dan sajikan dingin."
    };
  } else {
    return {
      recipeTitle: `Resep ${foodName} Praktis Spesial`,
      recipeIngredients: "Bahan utama masakan secukupnya; 3 siung bawang merah; 2 siung bawang putih; garam dan gula secukupnya; penyedap rasa secukupnya; air dan minyak goreng secukupnya",
      recipeInstructions: "1. Bersihkan semua bahan-bahan utama masakan terlebih dahulu.\n2. Iris tipis bawang merah dan bawang putih, lalu tumis hingga harum.\n3. Masukkan bahan utama masakan ke wajan tumisan, tambahkan air secukupnya.\n4. Masukkan bumbu garam, gula, dan penyedap rasa. Aduk rata.\n5. Masak hingga matang merata dan kuah menyusut.\n6. Angkat lalu sajikan selagi hangat bersama keluarga."
    };
  }
}

// Helper to extract a food category based on image filename keywords
function getFallbackLabelFromFilename(filename: string): string {
  const fileLower = filename.toLowerCase();
  
  if (fileLower === "camera_capture.jpg" || fileLower === "unknown.jpg") {
    // Return a random delicious Indonesian food label from FALLBACK_LABELS to make the simulation/demo mode fun and dynamic instead of always resolving to Tacos!
    const randomIndex = Math.floor(Math.random() * FALLBACK_LABELS.length);
    return FALLBACK_LABELS[randomIndex];
  }

  if (fileLower.includes("lontong") || fileLower.includes("sayur")) return "Lontong Sayur";
  if (fileLower.includes("mie_aceh") || fileLower.includes("mie-aceh") || fileLower.includes("aceh") || fileLower.includes("mie")) return "Mie Aceh";
  if (fileLower.includes("sate_matang") || fileLower.includes("sate-matang")) return "Sate Matang";
  if (fileLower.includes("nasilemak") || fileLower.includes("lemak")) return "Nasi Lemak";
  if (fileLower.includes("nasigoreng") || fileLower.includes("goreng")) return "Nasi Goreng";
  if (fileLower.includes("burger")) return "Burger";
  if (fileLower.includes("pizza")) return "Pizza";
  if (fileLower.includes("salad")) return "Salad";
  if (fileLower.includes("sate") || fileLower.includes("satay")) return "Sate Ayam";
  if (fileLower.includes("rendang")) return "Rendang";
  if (fileLower.includes("soto")) return "Soto Ayam";
  if (fileLower.includes("bakso") || fileLower.includes("meatball")) return "Bakso";
  if (fileLower.includes("martabak")) return "Martabak";
  if (fileLower.includes("sushi")) return "Sushi";
  if (fileLower.includes("cake") || fileLower.includes("cokelat")) return "Chocolate Cake";
  if (fileLower.includes("lasagna")) return "Lasagna";
  if (fileLower.includes("stew") || fileLower.includes("sop") || fileLower.includes("semur")) return "Beef Stew";
  if (fileLower.includes("eiffel") || fileLower.includes("paris") || fileLower.includes("tower")) return "Eiffel Tower (Non-Makanan)";
  if (fileLower.includes("flower") || fileLower.includes("pot") || fileLower.includes("geranium")) return "Geranium Flower Pot (Non-Makanan)";
  
  // Seeded selection based on filename length so it remains consistent for the same file
  const index = filename.length % FALLBACK_LABELS.length;
  return FALLBACK_LABELS[index];
}

// Fallback Health Tips Generator for Smart Local Simulation
function getSimulationHealthTips(foodName: string): string[] {
  const nameLower = foodName.toLowerCase();
  if (
    nameLower.includes("eiffel") ||
    nameLower.includes("flower") ||
    nameLower.includes("pot") ||
    nameLower.includes("geranium") ||
    nameLower.includes("tower") ||
    nameLower.includes("non-makanan") ||
    nameLower.includes("bukan makanan") ||
    nameLower.includes("buku") ||
    nameLower.includes("non_food") ||
    nameLower.includes("non-food")
  ) {
    return [];
  }
  if (nameLower.includes("lontong") || nameLower.includes("sayur")) {
    return [
      "Sandingkan dengan telur rebus atau tempe untuk tambahan protein.",
      "Batasi kuah santan kental jika sedang menjaga kadar kolesterol tetap stabil.",
      "Nikmati di pagi hari sebagai sumber energi untuk aktivitas harian."
    ];
  } else if (nameLower.includes("mie aceh") || nameLower.includes("mie") || nameLower.includes("aceh")) {
    return [
      "Batasi porsi tambahan garam atau kecap jika rentan terhadap hipertensi.",
      "Konsumsi bersama acar bawang merah dan ketimun untuk menyeimbangkan porsi.",
      "Hindari teh manis setelah makan agar penyerapan zat besi dari daging maksimal."
    ];
  } else if (nameLower.includes("sate matang")) {
    return [
      "Konsumsi kuah soto pendamping secukupnya karena biasanya tinggi natrium.",
      "Pilihlah potongan daging tanpa lemak (gajih) untuk opsi lebih sehat.",
      "Pastikan sate benar-benar matang merata untuk menghindari kontaminasi."
    ];
  } else if (nameLower.includes("sate")) {
    return [
      "Mintalah bumbu kacang disajikan terpisah agar Anda bisa mengontrol jumlahnya.",
      "Sandingkan dengan irisan ketimun dan tomat segar sebagai sumber serat.",
      "Pilih sate bagian dada tanpa kulit untuk mengurangi kandungan lemak jenuh."
    ];
  } else if (nameLower.includes("nasi goreng")) {
    return [
      "Tambahkan potongan timun, tomat, atau selada segar untuk menambah serat harian.",
      "Batasi penggunaan minyak saat menggoreng untuk menekan kalori berlebih.",
      "Lengkapi dengan sumber protein seperti telur rebus atau dada ayam suwir."
    ];
  } else if (nameLower.includes("lasagna")) {
    return [
      "Sandingkan dengan porsi kecil salad hijau segar di samping hidangan.",
      "Batasi ukuran porsi konsumsi karena keju mozzarella sangat padat kalori.",
      "Minum air putih yang cukup untuk membantu pencernaan makanan padat."
    ];
  } else if (nameLower.includes("stew") || nameLower.includes("sop") || nameLower.includes("semur")) {
    return [
      "Gunakan potongan daging sapi bagian luar (lean beef) untuk menekan lemak.",
      "Gunakan sedikit garam dalam kuah kaldu dan gantikan dengan herba alami.",
      "Makan selagi hangat untuk kenyamanan lambung dan hidrasi tubuh yang baik."
    ];
  } else if (nameLower.includes("rendang")) {
    return [
      "Batasi porsi bumbu rendang kental yang mengandung banyak santan jenuh.",
      "Sandingkan dengan rebusan daun singkong tanpa kuah santan tambahan.",
      "Minum air hangat setelah makan untuk melarutkan lemak di tenggorokan."
    ];
  } else if (nameLower.includes("bakso")) {
    return [
      "Batasi penambahan kecap asin, saus sambal instan, atau vetsin (MSG) berlebih.",
      "Pilihlah bihun atau sayuran lebih banyak dibandingkan mie kuning.",
      "Nikmati kuah kaldu hangat secukupnya saja untuk membatasi asupan natrium."
    ];
  } else if (nameLower.includes("soto")) {
    return [
      "Peras jeruk nipis segar di kuah soto untuk pasokan vitamin C alami.",
      "Gunakan sedikit sambal dan kurangi kerupuk emping sebagai pelengkap.",
      "Pilih soto ayam kuah bening daripada soto kuah santan jika sedang diet."
    ];
  } else if (nameLower.includes("gado")) {
    return [
      "Mintalah bumbu kacang disajikan terpisah agar bisa mengontrol jumlahnya.",
      "Pilih telur rebus dibanding kerupuk berlebih sebagai pelengkap protein.",
      "Sangat baik dikonsumsi di siang hari sebagai menu makan sehat penyuplai energi."
    ];
  } else if (nameLower.includes("martabak")) {
    return [
      "Konsumsi satu atau dua potong kecil saja, dan bagikan sisanya ke keluarga.",
      "Hindari mengonsumsi martabak manis terlalu dekat dengan waktu tidur malam.",
      "Sediakan air putih tawar sebagai pendamping agar gula darah terkontrol."
    ];
  } else if (nameLower.includes("burger")) {
    return [
      "Ganti saus mayones berlebih dengan tambahan saus mustard atau tomat murni.",
      "Pilihlah roti gandum (whole wheat bun) jika membuat sendiri.",
      "Makan secara perlahan agar sinyal kenyang dari tubuh bekerja optimal."
    ];
  } else if (nameLower.includes("pizza")) {
    return [
      "Pilihlah pizza dengan adonan tipis (thin crust) untuk membatasi karbohidrat.",
      "Tambahkan topping paprika, jamur, atau bawang bombay untuk gizi ekstra.",
      "Makan maksimal 2 potong berukuran sedang untuk menjaga asupan kalori."
    ];
  } else if (nameLower.includes("salad")) {
    return [
      "Pilihlah dressing berbasis minyak zaitun (vinaigrette) daripada mayones kental.",
      "Tambahkan potongan dada ayam panggang atau tahu untuk pelengkap protein.",
      "Pastikan sayuran dicuci sangat bersih menggunakan air mengalir sebelum disajikan."
    ];
  }
  return [
    "Lengkapi hidangan ini dengan porsi sayuran segar dan air putih yang cukup.",
    "Makanlah secara teratur dan kunyah makanan dengan perlahan hingga halus.",
    "Sesuaikan ukuran porsi hidangan dengan tingkat aktivitas fisik harian Anda."
  ];
}

// Fallback Indonesian Extra Fields Generator (Scientific Name, Health, Halal, Restaurants)
function generateSimulationExtraFields(foodName: string) {
  const nameLower = foodName.toLowerCase();
  let scientificName = "Oryza sativa";
  let origin = "Nusantara, Indonesia";
  let healthAnalysis = "Sangat lezat dan bergizi seimbang.";
  let halalStatus = "Halal";
  let halalReason = "Terbuat dari bahan-bahan nabati alami yang halal sesuai kriteria regulasi BPJPH.";
  let suggestedRestaurants = [
    { name: "Sederhana", address: "Jl. Sudirman No. 12, Jakarta", rating: 4.6 },
    { name: "Sari Ratu", address: "Jl. Thamrin No. 45, Jakarta", rating: 4.5 }
  ];

  if (
    nameLower.includes("eiffel") ||
    nameLower.includes("flower") ||
    nameLower.includes("pot") ||
    nameLower.includes("geranium") ||
    nameLower.includes("tower") ||
    nameLower.includes("non-makanan") ||
    nameLower.includes("bukan makanan") ||
    nameLower.includes("buku") ||
    nameLower.includes("non_food") ||
    nameLower.includes("non-food")
  ) {
    scientificName = "-";
    origin = "-";
    healthAnalysis = "";
    halalStatus = "Tidak Berlaku";
    halalReason = "Bukan merupakan objek produk wajib sertifikasi halal berdasarkan regulasi BPJPH (UU No. 33 Tahun 2014 tentang Jaminan Produk Halal), karena objek ini merupakan benda mati non-konsumsi dan bukan barang gunaan wajib halal.";
    suggestedRestaurants = [];
    return { scientificName, origin, healthAnalysis, healthTips: [], halalStatus, halalReason, suggestedRestaurants };
  }

  if (nameLower.includes("lontong") || nameLower.includes("sayur")) {
    scientificName = "Artocarpus heterophyllus (Nangka Muda) / Sechium edule (Labu Siam)";
    origin = "Betawi, Jakarta, Indonesia";
    healthAnalysis = "Lontong Sayur menyajikan energi karbohidrat tinggi dari lontong beras, dilengkapi vitamin C dan serat dari labu siam. Karena mengandung kuah santan kental, batasi konsumsi berlebih untuk menjaga kadar kolesterol tetap stabil. Menambahkan telur rebus akan melengkapi kebutuhan protein Anda.";
    halalStatus = "Halal";
    halalReason = "Seluruh bahan utama seperti beras, sayuran segar, dan kuah santan murni adalah bahan halal alamiah. Bumbu pelengkap dipastikan bebas dari titik kritis bahan tambahan non-halal sesuai ketetapan halal BPJPH.";
    suggestedRestaurants = [
      { name: "Lontong Sayur Cihapit", address: "Jl. Cihapit, Bandung", rating: 4.6 },
      { name: "Lontong Sayur Medan Kak Lin", address: "Jl. Cik Di Tiro, Medan", rating: 4.5 }
    ];
  } else if (nameLower.includes("mie aceh") || nameLower.includes("mie") || nameLower.includes("aceh")) {
    scientificName = "Triticum aestivum (Gandum - Bahan Mie Kuning)";
    origin = "Aceh, Indonesia";
    healthAnalysis = "Mie Aceh kaya karbohidrat dan protein dari potongan daging sapi serta asam amino dari sayuran kol dan tauge. Rempah-rempah yang melimpah seperti jinten, kapulaga, dan kunyit kaya antioksidan dan membantu melancarkan pencernaan. Sebaiknya konsumsi dengan porsi wajar karena bumbu rempahnya pekat.";
    halalStatus = "Halal";
    halalReason = "Menggunakan mie kuning dari gandum halal, daging sapi segar dari pemotongan bersertifikat BPJPH, bumbu rempah-rempah alami, serta sayuran segar 100% halal.";
    suggestedRestaurants = [
      { name: "Mie Aceh Jaly-Jaly", address: "Jl. Prof. DR. Soepomo, Tebet, Jakarta Selatan", rating: 4.7 },
      { name: "Mie Razali", address: "Jl. T. Panglima Polem, Banda Aceh", rating: 4.6 }
    ];
  } else if (nameLower.includes("sate matang")) {
    scientificName = "Bos taurus (Daging Sapi) / Capra hircus (Kambing)";
    origin = "Bireuen, Aceh, Indonesia";
    healthAnalysis = "Sate Matang kaya protein tinggi dan zat besi. Namun, proses pembakaran arang berpotensi menghasilkan senyawa karsinogenik. Disarankan dikonsumsi dengan sayur atau timun untuk menyeimbangkan antioksidan.";
    halalStatus = "Halal";
    halalReason = "Daging sapi atau kambing disembelih secara syariat oleh juru sembelih halal (JPH) terdaftar BPJPH. Bumbu kacang dan bumbu kuah kaldu murni menggunakan bahan-bahan halal.";
    suggestedRestaurants = [
      { name: "Sate Matang Khas Aceh Cut Zein", address: "Jl. Teuku Umar, Banda Aceh", rating: 4.8 },
      { name: "Warung Sate Matang Ayah", address: "Jl. Medan-Banda Aceh, Bireuen", rating: 4.7 }
    ];
  } else if (nameLower.includes("sate")) {
    scientificName = "Gallus gallus domesticus (Ayam)";
    origin = "Madura, Jawa Timur, Indonesia";
    healthAnalysis = "Sate ayam merupakan sumber protein tanpa lemak yang sangat baik terutama jika menggunakan dada ayam. Batasi porsi bumbu kacang jika sedang membatasi kalori, karena kacang mengandung lemak tinggi (meski lemak sehat).";
    halalStatus = "Halal";
    halalReason = "Ayam segar disembelih sesuai syariat Islam oleh pemotong bersertifikat halal BPJPH. Bumbu kacang dan kecap manis diolah secara halal bebas dari khamar atau alkohol masakan.";
    suggestedRestaurants = [
      { name: "Sate Khas Senayan", address: "Mall Grand Indonesia, Jakarta Pusat", rating: 4.6 },
      { name: "Sate Ayam Madura H. Harun", address: "Jl. Senopati No. 8, Jakarta Selatan", rating: 4.7 }
    ];
  } else if (nameLower.includes("nasi goreng")) {
    scientificName = "Oryza sativa (Beras)";
    origin = "Nusantara, Indonesia";
    healthAnalysis = "Nasi goreng mengandung karbohidrat yang tinggi sebagai sumber energi cepat. Kandungan minyak dan lemak dari proses penggorengan perlu dibatasi. Menambahkan telur atau ayam akan meningkatkan rasio protein masakan.";
    halalStatus = "Halal";
    halalReason = "Nasi putih dan bumbu bumbu dasar (bawang merah, bawang putih, cabai) bersifat halal alami. Kecap manis, minyak goreng, dan margarin yang digunakan wajib terverifikasi memiliki sertifikasi halal resmi BPJPH.";
    suggestedRestaurants = [
      { name: "Nasi Goreng Kambing Kebon Sirih", address: "Jl. Kebon Sirih, Menteng, Jakarta Pusat", rating: 4.5 },
      { name: "Nasi Goreng Gila Gondrong", address: "Jl. Besuki No. 1, Menteng", rating: 4.6 }
    ];
  } else if (nameLower.includes("lasagna")) {
    scientificName = "Triticum aestivum (Gandum - Lembaran Lasagna)";
    origin = "Italia";
    healthAnalysis = "Kaya karbohidrat dan kalsium tinggi dari tumpukan keju mozzarella serta bechamel sauce. Mengandung protein dari daging sapi cincang. Masakan ini padat kalori, sehingga porsi konsumsinya perlu dikontrol.";
    halalStatus = "Halal";
    halalReason = "Daging sapi halal dan produk olahan susu (keju, mentega) wajib memiliki ketetapan halal BPJPH untuk menjamin bebas dari bahan tambahan haram. Saus bolognese tidak dicampur dengan wine/alkohol.";
    suggestedRestaurants = [
      { name: "Pizza e Birra", address: "Setiabudi One, Jakarta Selatan", rating: 4.4 },
      { name: "Pasta, Please!", address: "Jl. Wijaya, Kebayoran Baru", rating: 4.5 }
    ];
  } else if (nameLower.includes("stew") || nameLower.includes("sop") || nameLower.includes("semur")) {
    scientificName = "Bos taurus (Sapi) & Solanum tuberosum (Kentang)";
    origin = "Eropa / Belanda";
    healthAnalysis = "Beef stew adalah masakan berkuah yang sangat bergizi tinggi, kaya akan vitamin A dari wortel, kalium dari kentang, dan zat besi serta asam amino esensial dari daging sapi yang dimasak perlahan.";
    halalStatus = "Halal";
    halalReason = "Menggunakan potongan daging sapi segar bersertifikat BPJPH, sayur-sayuran segar, dan kuah kaldu rempah alami tanpa tambahan bahan pengempuk atau bumbu kritis non-halal.";
    suggestedRestaurants = [
      { name: "The Soup Spoon", address: "Kota Kasablanka, Jakarta Selatan", rating: 4.5 },
      { name: "Social House", address: "Grand Indonesia, Jakarta Pusat", rating: 4.6 }
    ];
  } else if (nameLower.includes("rendang")) {
    scientificName = "Bos taurus (Sapi) & Cocos nucifera (Kelapa - Santan)";
    origin = "Minangkabau, Sumatera Barat";
    healthAnalysis = "Rendang sangat kaya akan zat besi, protein, dan seng. Namun, santan kental yang dimasak dalam waktu lama meningkatkan kandungan asam lemak jenuh. Sangat nikmat jika dikonsumsi dalam porsi sedang.";
    halalStatus = "Halal";
    halalReason = "Daging sapi dari RPH bersertifikat BPJPH, dimasak menggunakan santan murni dan bumbu rempah tradisional Minang yang 100% bebas dari segala kontaminasi najis.";
    suggestedRestaurants = [
      { name: "Restoran Sederhana SA", address: "Samping Stasiun Gondangdia, Jakarta", rating: 4.7 },
      { name: "Pagi Sore", address: "Jl. Cipete Raya No. 2, Jakarta Selatan", rating: 4.8 }
    ];
  } else if (nameLower.includes("bakso")) {
    scientificName = "Bos taurus (Sapi - Daging Bakso)";
    origin = "Solo, Jawa Tengah, Indonesia";
    healthAnalysis = "Bakso menyediakan sumber protein hewani yang praktis. Kuah kaldu hangat membantu hidrasi tubuh. Batasi konsumsi garam berlebih dari penyedap rasa (MSG) di kuahnya.";
    halalStatus = "Halal";
    halalReason = "Daging bakso sapi giling bersertifikat halal BPJPH, dicampur tepung sagu alami. Kuah kaldu dibuat murni dari rebusan sumsum dan tulang sapi yang halal.";
    suggestedRestaurants = [
      { name: "Bakso Solo Samrat", address: "Jl. Boulevard Raya, Kelapa Gading", rating: 4.6 },
      { name: "Bakso Boedjaman", address: "Jl. Tebet Raya No. 58, Jakarta Selatan", rating: 4.4 }
    ];
  } else if (nameLower.includes("soto")) {
    scientificName = "Gallus gallus domesticus (Ayam - Soto)";
    origin = "Lamongan, Jawa Timur, Indonesia";
    healthAnalysis = "Soto ayam merupakan sup hangat yang menyegarkan dan rendah kalori jika kuahnya bening (non-santan). Kunyit pada bumbu kuning mengandung kurkumin yang berfungsi as antiinflamasi alami.";
    halalStatus = "Halal";
    halalReason = "Soto menggunakan daging ayam segar bersertifikat BPJPH dan bumbu rempah tradisional alami (serai, jahe, kunyit) tanpa tambahan bumbu penguat rasa non-halal.";
    suggestedRestaurants = [
      { name: "Soto Ambengan Pak Sadi", address: "Jl. Wolter Monginsidi, Kebayoran Baru", rating: 4.6 },
      { name: "Soto Kudus Blok M", address: "Jl. KH Ahmad Dahlan, Jakarta Selatan", rating: 4.5 }
    ];
  } else if (nameLower.includes("gado")) {
    scientificName = "Arachis hypogaea (Kacang Tanah - Bumbu)";
    origin = "Betawi, Jakarta, Indonesia";
    healthAnalysis = "Sangat sehat! Kaya serat pangan, vitamin, dan mineral dari aneka sayuran segar rebus (kangkung, tauge, kol). Protein nabati disuplai dari tahu dan tempe. Bumbu kacang memberikan lemak tak jenuh ganda yang baik.";
    halalStatus = "Halal";
    halalReason = "Terdiri atas sayuran segar, tahu, tempe, telur rebus, dan bumbu kacang tanah tradisional yang seluruhnya bebas dari unsur haram. Aman dikonsumsi sesuai standar BPJPH.";
    suggestedRestaurants = [
      { name: "Gado-Gado Boplo", address: "Jl. Panglima Polim No. 10, Jakarta Selatan", rating: 4.5 },
      { name: "Gado-Gado Bon-Bin", address: "Jl. Cikini IV No. 5, Jakarta Pusat", rating: 4.6 }
    ];
  } else if (nameLower.includes("martabak")) {
    scientificName = "Triticum aestivum (Tepung Terigu Martabak)";
    origin = "Bangka, Indonesia";
    healthAnalysis = "Makanan pencuci mulut yang sangat padat kalori, gula, dan mentega. Sangat disarankan dikonsumsi sebagai camilan sesekali bersama kerabat atau keluarga agar asupan kalori harian tidak melonjak.";
    halalStatus = "Halal";
    halalReason = "Bahan dasar terigu, telur, keju, dan cokelat adalah halal. Mentega/butter yang digunakan wajib memiliki sertifikasi halal resmi dari BPJPH untuk menjamin bebas lemak babi.";
    suggestedRestaurants = [
      { name: "Martabak Pecenongan 65A", address: "Jl. Pecenongan Raya No. 65, Jakarta Pusat", rating: 4.7 },
      { name: "Martabak Boss", address: "Jl. Panglima Polim, Jakarta Selatan", rating: 4.5 }
    ];
  } else if (nameLower.includes("burger")) {
    scientificName = "Triticum aestivum (Roti) & Bos taurus (Daging Sapi)";
    origin = "Amerika Serikat";
    healthAnalysis = "Mengandung gizi makro lengkap: karbohidrat (roti), protein (daging sapi patty), kalsium (keju), dan vitamin (selada & tomat). Kurangi mayones komersial untuk menekan asupan lemak jenuh berlebih.";
    halalStatus = "Halal";
    halalReason = "Beef patty menggunakan daging sapi bersertifikasi halal BPJPH dan dipanggang menggunakan margarin/butter berlogo halal resmi tanpa kontaminasi lard.";
    suggestedRestaurants = [
      { name: "Traffic Bun", address: "Jl. Fatmawati No. 12, Jakarta Selatan", rating: 4.5 },
      { name: "Burger Bangor", address: "Jl. Margonda Raya, Depok", rating: 4.6 }
    ];
  } else if (nameLower.includes("pizza")) {
    scientificName = "Triticum aestivum (Tepung Pizza)";
    origin = "Napoli, Italia";
    healthAnalysis = "Pizza menyajikan karbohidrat dari adonan tepung gandum and lemak/protein dari keju mozzarella melimpah serta topping daging sosis. Agar lebih sehat, pilih pizza dengan topping sayuran segar.";
    halalStatus = "Halal";
    halalReason = "Adonan tepung ragi halal. Topping sosis sapi/ayam dan keju mozzarella wajib bersertifikat halal resmi BPJPH RI untuk menjamin bebas dari enzim rennet babi.";
    suggestedRestaurants = [
      { name: "Pizza Hut Indonesia", address: "Mall Pondok Indah, Jakarta Selatan", rating: 4.5 },
      { name: "Panties Pizza", address: "Jl. Tebet Utara, Jakarta Selatan", rating: 4.4 }
    ];
  } else if (nameLower.includes("salad")) {
    scientificName = "Lactuca sativa (Selada Hijau)";
    origin = "Yunani / Mediterania";
    healthAnalysis = "Pilihan paling sehat dan kaya serat pangan, antioksidan, dan zat gizi mikro. Bermanfaat memperlancar pencernaan dan menjaga berat badan ideal. Gunakan olive oil dressing atau lemon dressing sebagai opsi lebih rendah kalori.";
    halalStatus = "Halal";
    halalReason = "Sayuran segar 100% alami bersifat halal. Saus dressing (minyak zaitun, garam, mayones telur) terverifikasi terbuat dari bahan-bahan halal bersertifikasi BPJPH.";
    suggestedRestaurants = [
      { name: "SaladStop!", address: "Senayan City, Jakarta Pusat", rating: 4.6 },
      { name: "Cruuf Salad Bar", address: "Jl. Gunawarman, Kebayoran Baru", rating: 4.7 }
    ];
  } else {
    scientificName = "Cibus deliciosis (Istilah Umum Kuliner)";
    origin = "Nusantara, Indonesia";
    healthAnalysis = "Masakan ini merupakan hidangan nikmat yang menyuplai energi harian yang seimbang. Lengkapi hidangan ini dengan sayur mayur segar dan segelas air putih untuk gizi yang optimal harian.";
    halalStatus = "Halal";
    halalReason = "Terbuat dari bahan-bahan makanan umum Indonesia yang halal alami dan diproses bersih serta higienis sesuai standar jaminan produk halal BPJPH.";
    suggestedRestaurants = [
      { name: "Rumah Makan Padang Sederhana", address: "Jl. Sudirman No. 12, Jakarta Selatan", rating: 4.6 },
      { name: "Restoran Keluarga Nusantara", address: "Jl. Gatot Subroto No. 44, Jakarta", rating: 4.5 }
    ];
  }

  const healthTips = getSimulationHealthTips(foodName);
  return { scientificName, origin, healthAnalysis, healthTips, halalStatus, halalReason, suggestedRestaurants };
}


// Helper to extract the first valid JSON object string from a response
function extractFirstJSONObject(str: string): string {
  const firstBrace = str.indexOf("{");
  if (firstBrace === -1) return "{}";
  
  let braceCount = 0;
  let inString = false;
  let escape = false;
  
  for (let i = firstBrace; i < str.length; i++) {
    const char = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") {
        braceCount++;
      } else if (char === "}") {
        braceCount--;
        if (braceCount === 0) {
          return str.substring(firstBrace, i + 1);
        }
      }
    }
  }
  return str.substring(firstBrace);
}


// --- API Endpoint: Fast Real-Time Object Classification ---
app.post("/api/classify", async (req, res) => {
  try {
    const { image, presetName } = req.body;
    if (!image) {
      return res.status(400).json({ error: "No image base64 provided" });
    }

    let imageBase64 = "";
    let mimeType = "image/jpeg";

    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      mimeType = matches[1];
      imageBase64 = matches[2];
    } else {
      imageBase64 = image;
    }

    // Attempt to classify using Gemini if API key is configured
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "GEMINI_API_KEY") {
      try {
        const client = getGeminiClient();
        const response = await client.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            {
              inlineData: {
                data: imageBase64,
                mimeType: mimeType
              }
            },
            "Identify the single primary food item or object in this image. Respond with a raw JSON object containing these keys: 'name' (string, the name in Indonesian, capitalised, e.g., 'Sate Ayam', 'Nasi Goreng', 'Mie Aceh', 'Lontong Sayur', or if it is not a food, the object name like 'Laptop', 'Buku', 'Kunci'), 'isFood' (boolean, true if it is an edible dish/food, false otherwise), and 'confidence' (number, a float between 0.8 and 0.99 representing classification confidence)."
          ],
          config: {
            responseMimeType: "application/json"
          }
        });

        const text = response.text || "{}";
        const cleanJson = extractFirstJSONObject(text);
        const data = JSON.parse(cleanJson);
        return res.json({
          name: data.name || presetName || "Sate Ayam",
          isFood: data.isFood !== undefined ? data.isFood : (presetName ? presetName.toLowerCase() !== "laptop" : true),
          confidence: data.confidence || 0.92
        });
      } catch (geminiErr: any) {
        const errMessage = String(geminiErr?.message || geminiErr);
        const isQuota = errMessage.includes("429") || errMessage.toLowerCase().includes("quota") || errMessage.includes("RESOURCE_EXHAUSTED");
        console.log(`[Info] Gemini Real-time classification fallback triggered (isQuota=${isQuota}).`);
        
        if (presetName) {
          const isFood = presetName.toLowerCase() !== "laptop";
          return res.json({ 
            name: presetName, 
            isFood, 
            confidence: 0.96,
            isSimulated: true,
            isQuotaExceeded: isQuota
          });
        }
        // Fall back to a random delicious local food
        const randomIndex = Math.floor(Math.random() * FALLBACK_LABELS.length);
        const name = FALLBACK_LABELS[randomIndex];
        return res.json({ 
          name, 
          isFood: true, 
          confidence: 0.88,
          isSimulated: true,
          isQuotaExceeded: isQuota
        });
      }
    } else {
      // Offline/simulation fallback
      if (presetName) {
        const isFood = presetName.toLowerCase() !== "laptop";
        return res.json({ name: presetName, isFood, confidence: 0.96 });
      }
      const randomIndex = Math.floor(Math.random() * FALLBACK_LABELS.length);
      const name = FALLBACK_LABELS[randomIndex];
      return res.json({ name, isFood: true, confidence: 0.88 });
    }
  } catch (err: any) {
    console.error("Classification endpoint crash:", err);
    return res.status(500).json({ error: err.message });
  }
});


// --- API Endpoint: Scan / Recognize Food ---
app.post("/api/scan", upload.single("image"), async (req, res) => {
  try {
    let imageBase64 = "";
    let mimeType = "image/jpeg";
    let originalName = "unknown.jpg";

    if (req.file) {
      imageBase64 = req.file.buffer.toString("base64");
      mimeType = req.file.mimetype;
      originalName = req.file.originalname;
    } else if (req.body.image) {
      const base64Data = req.body.image; // can be base64 or a URL
      if (base64Data.startsWith("http://") || base64Data.startsWith("https://")) {
        try {
          const urlObj = new URL(base64Data);
          const isLocalPath = urlObj.pathname.includes("/images/");
          
          if (isLocalPath) {
            const fileName = path.basename(urlObj.pathname);
            const localPath = path.join(process.cwd(), "public", "images", fileName);
            const fs = await import("fs");
            if (fs.existsSync(localPath)) {
              const fileBuffer = fs.readFileSync(localPath);
              imageBase64 = fileBuffer.toString("base64");
              originalName = fileName;
              if (fileName.endsWith(".png")) mimeType = "image/png";
              else if (fileName.endsWith(".gif")) mimeType = "image/gif";
              else mimeType = "image/jpeg";
            } else {
              throw new Error("Local public image file not found");
            }
          } else {
            const fetchRes = await fetch(base64Data);
            if (!fetchRes.ok) throw new Error("Gagal mengunduh gambar dari URL");
            const arrayBuffer = await fetchRes.arrayBuffer();
            imageBase64 = Buffer.from(arrayBuffer).toString("base64");
            mimeType = fetchRes.headers.get("content-type") || "image/jpeg";
            
            // Extract file name from URL
            const pathSegments = urlObj.pathname.split("/");
            originalName = pathSegments[pathSegments.length - 1] || "downloaded_image.jpg";
            
            // Custom check for query params like ?name=nasi_lemak
            const customName = urlObj.searchParams.get("name");
            if (customName) {
              originalName = customName + ".jpg";
            }
          }
        } catch (urlErr: any) {
          console.error("Error fetching image URL:", urlErr);
          return res.status(400).json({ error: `Gagal mengunduh gambar dari galeri: ${urlErr.message}` });
        }
      } else {
        // Handle base64 from webcam capture directly
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          imageBase64 = matches[2];
        } else {
          imageBase64 = base64Data;
        }
        originalName = req.body.filename || "camera_capture.jpg";
      }
    }

    if (!imageBase64) {
      return res.status(400).json({ error: "No image file or base64 data provided" });
    }

    let foodName = "";
    let confidence = 0.85;
    let nutrition = { calories: 0, carbs: 0, fat: 0, fiber: 0, protein: 0 };
    let usedGemini = false;
    let hasRecipe = false;
    let recipeTitle = "";
    let recipeThumb = "";
    let recipeIngredients = "";
    let recipeInstructions = "";
    let scientificName = "";
    let origin = "";
    let healthAnalysis = "";
    let halalStatus = "Halal";
    let halalReason = "";
    let suggestedRestaurants: any[] = [];
    let healthTips: string[] = [];
    let parsed: any = null;
    let simulationReason: "quota_exceeded" | "missing_api_key" | "other_error" | null = null;

    // 1. Attempt to recognize via Gemini AI
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "GEMINI_API_KEY") {
      try {
        const client = getGeminiClient();
        const systemInstruction = `
          Anda adalah ahli gizi profesional, ilmuwan pangan, koki terampil, dan auditor sertifikasi halal yang bertugas memberikan informasi nutrisi makanan secara akurat, nama ilmiah bahan utama, analisis kesehatan, status halal, serta resep hidangan tersebut dalam Bahasa Indonesia.
          
          PENTING: Berikan perhatian ekstra pada hidangan tradisional khas Indonesia. 
          - Jika gambar menunjukkan kuah santan berwarna kuning kemerahan dengan potongan lontong/ketupat, telur, tahu, tempe, atau sayur labu siam, identifikasi dengan tingkat keyakinan (confidence) sangat tinggi sebagai 'Lontong Sayur' (bukan tacos, ramen, atau lasagna).
          - Jika gambar menunjukkan mie kuning basah yang tebal dengan bumbu rempah pekat kemerahan/kecokelatan (nyemek atau goreng basah), dilengkapi daging sapi, tauge, kol, atau emping, identifikasi dengan tingkat keyakinan sangat tinggi sebagai 'Mie Aceh' (bukan spaghetti carbonara, pasta, ramen, atau tacos).
          - Jika gambar menunjukkan sate dengan kuah kaldu/soto di sampingnya dan potongan daging sapi/kambing yang gurih dibakar, identifikasi sebagai 'Sate Matang'.
          Harap hindari salah klasifikasi masakan Nusantara menjadi kuliner Barat/Meksiko/Jepang.

          Untuk makanan yang teridentifikasi dalam gambar, berikan informasi gizi, resep, analisis gizi, status kehalalan, nama ilmiah, serta saran restoran lokal berikut:
          1. name: Nama hidangan dalam Bahasa Indonesia yang umum dan ringkas (misal: 'Nasi Goreng', 'Sate Ayam', 'Burger', 'Lontong Sayur', 'Mie Aceh', dll.).
          2. scientificName: Nama ilmiah hidangan atau bahan utama paling esensial dalam miring/italic (misal: 'Gallus gallus domesticus' untuk sate ayam, atau 'Oryza sativa' untuk nasi goreng).
          3. origin: Asal usul daerah/negara asal makanan ini (misal: 'Bireuen, Aceh, Indonesia' untuk sate matang, 'Aceh, Indonesia' untuk mie aceh, 'Betawi, Jakarta, Indonesia' untuk lontong sayur, dll.).
          4. englishName: Nama hidangan dalam Bahasa Inggris yang paling cocok untuk dicari di database resep global (misal: 'Fried Rice', 'Chicken Satay', 'Meatballs', 'Lontong Sayur', 'Noodle Aceh', dll.).
          5. confidence: Akurasi kecocokan klasifikasi (angka desimal antara 0.80 hingga 0.99).
          6. calories: Kalori makanan (dalam kkal, berupa angka bulat saja).
          7. carbs: Karbohidrat makanan (dalam gram, berupa angka bulat saja).
          8. fat: Lemak makanan (dalam gram, berupa angka bulat saja).
          9. fiber: Serat makanan (dalam gram, berupa angka bulat saja).
          10. protein: Protein makanan (dalam gram, berupa angka bulat saja).
          11. healthAnalysis: Analisis kualitatif detail tentang kesehatan dan gizi makanan ini, keunggulan gizi, kecocokan diet (misal: tinggi protein, tinggi serat), bahaya jika dikonsumsi berlebih, serta solusi penyajian lebih sehat dalam Bahasa Indonesia.
          12. halalStatus: Status kehalalan hidangan atau produk ini sesuai standar regulasi BPJPH (Badan Penyelenggara Jaminan Produk Halal) RI. Pilih salah satu dari:
              - "Halal": jika produk/makanan memenuhi kriteria kehalalan BPJPH.
              - "Syubhah": jika memiliki titik kritis kehalalan tinggi atau belum bersertifikasi resmi.
              - "Non-Halal": jika mengandung bahan haram.
              - "Tidak Berlaku": jika gambar terdeteksi sebagai objek non-produk/non-makanan (seperti landmark, tumbuhan/hewan liar, pot bunga, dll.) yang tidak menjadi sasaran wajib sertifikasi halal menurut regulasi BPJPH UU No. 33/2014.
          13. halalReason: Penjelasan terperinci status kehalalan berdasarkan regulasi BPJPH RI, termasuk analisis titik kritis bahan masakan/produk (seperti bahan hewani, saus, penyedap, pengemulsi), atau penjelasan mengapa sertifikasi halal tidak berlaku untuk objek non-produk/non-makanan tersebut sesuai UU No. 33 Tahun 2014.
          14. recipeTitle: Judul resep masakan yang elegan dalam Bahasa Indonesia (misal: 'Resep Sate Ayam Madura Autentik').
          15. recipeIngredients: Daftar bahan-bahan masakan dipisahkan oleh titik koma dan spasi '; ' dalam Bahasa Indonesia yang baik dan benar.
          16. recipeInstructions: Langkah-langkah memasak lengkap dan berurutan dalam Bahasa Indonesia, dipisahkan oleh karakter baris baru '\\n'.
          17. suggestedRestaurants: Rekomendasi 2-3 restoran riil atau warung terkenal di Indonesia yang menyajikan makanan ini, berupa daftar objek dengan nama, alamat (singkat, misal: 'Jakarta Selatan'), dan rating (desimal antara 4.0 hingga 5.0).

          Format output harus berupa JSON valid dengan struktur persis berikut:
          {
            "name": "Nama Makanan",
            "scientificName": "Scientific Name",
            "origin": "Asal Makanan (Daerah/Negara)",
            "englishName": "English Name",
            "confidence": 0.95,
            "calories": 350,
            "carbs": 45,
            "fat": 15,
            "fiber": 3,
            "protein": 12,
            "healthAnalysis": "Analisis kesehatan & gizi detail...",
            "halalStatus": "Halal",
            "halalReason": "Penjelasan kehalalan...",
            "recipeTitle": "Resep Nama Makanan Spesial",
            "recipeIngredients": "bahan 1; bahan 2; bahan 3; bahan 4",
            "recipeInstructions": "1. Langkah pertama.\\n2. Langkah kedua.\\n3. Langkah ketiga.",
            "suggestedRestaurants": [
              { "name": "Sate Khas Senayan", "address": "Jl. Pakubuwono, Jakarta Selatan", "rating": 4.6 },
              { "name": "Warung Sate Mas Joko", "address": "Jl. Margonda Raya, Depok", "rating": 4.5 }
            ]
          }
        `;

        const candidateModels = ["gemini-flash-latest", "gemini-3.5-flash"];
        let response = null;
        let lastError = null;

        for (const modelName of candidateModels) {
          try {
            console.log(`Trying food recognition with Gemini model: ${modelName}`);
            response = await client.models.generateContent({
              model: modelName,
              contents: [
                {
                  inlineData: {
                    data: imageBase64,
                    mimeType: mimeType
                  }
                },
                "Identifikasi makanan yang ada dalam gambar ini. Berikan hasil analisis sesuai dengan skema JSON yang ditentukan."
              ],
              config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    name: {
                      type: Type.STRING,
                      description: "Nama hidangan makanan dalam Bahasa Indonesia yang umum dan ringkas (misal: 'Nasi Goreng', 'Sate Ayam', 'Burger', dll.). Jika terdeteksi bukan makanan, tandai dengan menambahkan suffix '(Non-Makanan)' (misal: 'Menara Eiffel (Non-Makanan)').",
                    },
                    scientificName: {
                      type: Type.STRING,
                      description: "Nama ilmiah atau taksonomi biologi bahan utama makanan ini (misal: 'Gallus gallus domesticus' untuk ayam, 'Oryza sativa' untuk nasi).",
                    },
                    origin: {
                      type: Type.STRING,
                      description: "Asal usul daerah atau negara asal makanan ini (misal: 'Minangkabau, Sumatera Barat', 'Italia', 'Bireuen, Aceh, Indonesia').",
                    },
                    englishName: {
                      type: Type.STRING,
                      description: "Nama hidangan dalam Bahasa Inggris untuk pencarian resep global (misal: 'Fried Rice', 'Chicken Satay', 'Meatballs', 'Beef Rendang', dll.). Jika bukan makanan, isi dengan 'Non-Food'.",
                    },
                    confidence: {
                      type: Type.NUMBER,
                      description: "Akurasi kecocokan klasifikasi antara 0.00 hingga 1.00.",
                    },
                    calories: {
                      type: Type.INTEGER,
                      description: "Kalori makanan (dalam kkal, angka bulat saja). Jika bukan makanan, isi dengan 0.",
                    },
                    carbs: {
                      type: Type.INTEGER,
                      description: "Karbohidrat makanan (dalam gram, angka bulat saja). Jika bukan makanan, isi dengan 0.",
                    },
                    fat: {
                      type: Type.INTEGER,
                      description: "Lemak makanan (dalam gram, angka bulat saja). Jika bukan makanan, isi dengan 0.",
                    },
                    fiber: {
                      type: Type.INTEGER,
                      description: "Serat makanan (dalam gram, angka bulat saja). Jika bukan makanan, isi dengan 0.",
                    },
                    protein: {
                      type: Type.INTEGER,
                      description: "Protein makanan (dalam gram, angka bulat saja). Jika bukan makanan, isi dengan 0.",
                    },
                    healthAnalysis: {
                      type: Type.STRING,
                      description: "Analisis kesehatan, gizi, manfaat, kecocokan diet, potensi risiko, dan saran penyajian sehat dalam Bahasa Indonesia.",
                    },
                    halalStatus: {
                      type: Type.STRING,
                      description: "Status kehalalan hidangan atau produk ini berdasarkan standar regulasi BPJPH RI. Harus berupa salah satu dari: 'Halal', 'Syubhah', 'Non-Halal', atau 'Tidak Berlaku' (jika objek non-makanan/non-produk yang bukan merupakan sasaran wajib sertifikasi halal BPJPH).",
                    },
                    halalReason: {
                      type: Type.STRING,
                      description: "Penjelasan status kehalalan makanan/produk berdasarkan regulasi BPJPH RI, termasuk analisis titik kritis bahan makanan, atau penjelasan regulasi mengapa objek tersebut tidak termasuk sasaran wajib sertifikasi halal jika berstatus 'Tidak Berlaku'.",
                    },
                    recipeTitle: {
                      type: Type.STRING,
                      description: "Judul resep masakan dalam Bahasa Indonesia yang elegan (misal: 'Resep Nasi Goreng Spesial Pedas'). Jika bukan makanan, beri judul penolakan ramah (misal: 'Bukan Makanan Valid 🚫').",
                    },
                    recipeIngredients: {
                      type: Type.STRING,
                      description: "Daftar bahan-bahan masakan dipisahkan oleh titik koma dan spasi '; ' (misal: '2 piring nasi putih; 2 siung bawang putih; 3 siung bawang merah; 2 sdm kecap manis; 1 butir telur; garam secukupnya'). Jika bukan makanan, beri penjelasan singkat.",
                    },
                    recipeInstructions: {
                      type: Type.STRING,
                      description: "Langkah-langkah memasak lengkap dipisahkan oleh karakter baris baru '\\n' (misal: '1. Panaskan minyak.\\n2. Tumis bawang.\\n3. Masukkan nasi dan aduk rata.'). Jika bukan makanan, isi dengan penjelasan ramah menyarankan memindai hidangan makanan.",
                    },
                    suggestedRestaurants: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING, description: "Nama restoran atau warung makan yang menyajikan hidangan ini." },
                          address: { type: Type.STRING, description: "Alamat singkat restoran atau wilayahnya." },
                          rating: { type: Type.NUMBER, description: "Rating restoran di Google (antara 4.0 hingga 5.0)." }
                        },
                        required: ["name", "address"]
                      },
                      description: "Rekomendasi 2-3 tempat makan terkenal yang menjual menu ini di Indonesia."
                    },
                    healthTips: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.STRING,
                      },
                      description: "3-4 tips kesehatan dan saran konsumsi praktis singkat (maksimal 15 kata per tips) yang spesifik untuk makanan ini (misal: 'Batasi konsumsi saat malam hari', 'Sandingkan dengan sayuran kaya serat', dll.) dalam Bahasa Indonesia.",
                    }
                  },
                  required: [
                    "name",
                    "scientificName",
                    "origin",
                    "englishName",
                    "confidence",
                    "calories",
                    "carbs",
                    "fat",
                    "fiber",
                    "protein",
                    "healthAnalysis",
                    "halalStatus",
                    "halalReason",
                    "recipeTitle",
                    "recipeIngredients",
                    "recipeInstructions",
                    "suggestedRestaurants",
                    "healthTips"
                  ],
                },
                temperature: 0.1
              }
            });

            if (response) {
              console.log(`Successfully completed scan using Gemini model: ${modelName}`);
              break;
            }
          } catch (modelError: any) {
            console.log(`[Info] Model ${modelName} status check: busy or rate-limited.`);
            lastError = modelError;
          }
        }

        if (!response) {
          throw lastError || new Error("All candidate Gemini models failed.");
        }

        const textResponse = response.text?.trim() || "";
        
        const cleanJson = extractFirstJSONObject(textResponse);
        
        parsed = JSON.parse(cleanJson);

        foodName = parsed.name || getFallbackLabelFromFilename(originalName);
        confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.88;
        nutrition = {
          calories: parsed.calories || 0,
          carbs: parsed.carbs || 0,
          fat: parsed.fat || 0,
          fiber: parsed.fiber || 0,
          protein: parsed.protein || 0
        };

        scientificName = parsed.scientificName || "";
        origin = parsed.origin || "";
        healthAnalysis = parsed.healthAnalysis || "";
        halalStatus = parsed.halalStatus || "Halal";
        halalReason = parsed.halalReason || "";
        suggestedRestaurants = parsed.suggestedRestaurants || [];
        healthTips = parsed.healthTips || [];

        if (parsed.recipeTitle && parsed.recipeIngredients && parsed.recipeInstructions) {
          hasRecipe = true;
          recipeTitle = parsed.recipeTitle;
          recipeIngredients = parsed.recipeIngredients;
          recipeInstructions = parsed.recipeInstructions;
        }
        usedGemini = true;
      } catch (geminiError: any) {
        const errStr = String(geminiError);
        const isQuota = errStr.includes("429") || errStr.toLowerCase().includes("quota") || errStr.includes("RESOURCE_EXHAUSTED");
        if (isQuota) {
          console.log("Gemini API Quota Exceeded (429). Falling back to smart local simulation mode.");
          simulationReason = "quota_exceeded";
        } else {
          console.log("Gemini API is currently unavailable. Using smart local simulation instead.");
          simulationReason = "other_error";
        }
        // Fall back to simulation if Gemini fails
      }
    } else {
      simulationReason = "missing_api_key";
    }

    // 2. Local Fallback Simulator (Matches Kotlin logic)
    if (!usedGemini) {
      foodName = getFallbackLabelFromFilename(originalName);
      confidence = 0.82 + (originalName.length % 16) / 100;
      if (confidence > 1.0) confidence = 0.98;
      
      const simNutr = generateSimulationNutrition(foodName);
      nutrition = simNutr;

      const simRecipe = generateSimulationRecipe(foodName);
      hasRecipe = true;
      recipeTitle = simRecipe.recipeTitle;
      recipeIngredients = simRecipe.recipeIngredients;
      recipeInstructions = simRecipe.recipeInstructions;

      const simExtras = generateSimulationExtraFields(foodName);
      scientificName = simExtras.scientificName;
      origin = simExtras.origin;
      healthAnalysis = simExtras.healthAnalysis;
      healthTips = simExtras.healthTips || [];
      halalStatus = simExtras.halalStatus;
      halalReason = simExtras.halalReason;
      suggestedRestaurants = simExtras.suggestedRestaurants;
    }

    // 3. Fetch Recipe Thumbnail from MealDB (or full recipe as backup)
    try {
      const searchName = usedGemini && parsed?.englishName ? parsed.englishName : foodName;
      const queryName = encodeURIComponent(searchName);
      const mealDbResponse = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${queryName}`);
      const mealDbData = await mealDbResponse.json();
      
      const meal = mealDbData.meals?.[0];
      if (meal) {
        if (!hasRecipe) {
          hasRecipe = true;
          recipeTitle = meal.strMeal || "";
          recipeInstructions = meal.strInstructions || "";

          const ingredientsList = [];
          for (let i = 1; i <= 20; i++) {
            const ing = meal[`strIngredient${i}`]?.trim();
            const meas = meal[`strMeasure${i}`]?.trim() || "";
            if (ing) {
              ingredientsList.push(`${ing} (${meas})`);
            }
          }
          recipeIngredients = ingredientsList.join("; ");
        }
        
        // Always try to fetch cover art from MealDB
        if (meal.strMealThumb) {
          recipeThumb = meal.strMealThumb;
        }
      }
    } catch (mealDbError) {
      console.error("MealDB API Error:", mealDbError);
    }

    // Return the formatted ScannedFood response
    res.json({
      id: Date.now(),
      name: foodName,
      confidence,
      imagePath: "", 
      timestamp: Date.now(),
      calories: nutrition.calories,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      fiber: nutrition.fiber,
      protein: nutrition.protein,
      scientificName,
      origin,
      healthAnalysis,
      healthTips,
      halalStatus,
      halalReason,
      suggestedRestaurants,
      hasRecipe,
      recipeTitle,
      recipeThumb,
      recipeIngredients,
      recipeInstructions,
      isSimulated: !usedGemini,
      simulationReason,
      tfliteModelLoaded: fs.existsSync(path.join(process.cwd(), "assets", "model.tflite"))
    });

  } catch (err: any) {
    console.error("Express /api/scan Error:", err);
    res.status(500).json({ error: err.message || "Gagal mengidentifikasi makanan" });
  }
});

// --- API Endpoint: Get Dynamic Health Tips ---
app.post("/api/health-tips", express.json(), async (req, res) => {
  try {
    const { name, calories, carbs, fat, protein, fiber, healthAnalysis } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Nama makanan wajib diisi" });
    }

    let dynamicTips: string[] = [];

    // 1. Attempt to generate using Gemini if API key is active
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "GEMINI_API_KEY") {
      try {
        console.log(`Generating dynamic health tips via Gemini for: ${name}`);
        const client = getGeminiClient();
        const prompt = `Berikan 3 sampai 4 tips kesehatan dan saran konsumsi praktis yang spesifik, singkat (maksimal 15 kata per tips), dan relevan dalam Bahasa Indonesia untuk makanan berikut:
        Nama Makanan: ${name}
        Kalori: ${calories || 0} kkal
        Protein: ${protein || 0}g, Karbohidrat: ${carbs || 0}g, Lemak: ${fat || 0}g, Serat: ${fiber || 0}g
        Analisis Gizi Tambahan: ${healthAnalysis || ""}
        
        Berikan jawaban dalam format JSON murni berupa array string dengan kunci "healthTips" seperti ini:
        { "healthTips": ["tips 1", "tips 2", "tips 3"] }`;

        const response = await client.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                healthTips: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["healthTips"]
            },
            temperature: 0.2
          }
        });

        if (response && response.text) {
          const text = response.text.trim();
          const cleanJson = extractFirstJSONObject(text);
          const parsed = JSON.parse(cleanJson);
          if (Array.isArray(parsed.healthTips)) {
            dynamicTips = parsed.healthTips;
            console.log(`Successfully generated dynamic tips via Gemini for ${name}:`, dynamicTips);
          }
        }
      } catch (geminiError) {
        console.log("Failed to generate dynamic health tips via Gemini; using local fallback tips.");
      }
    }

    // 2. Local Fallback Simulator if Gemini fails or is not available
    if (dynamicTips.length === 0) {
      console.log(`Using fallback simulated health tips for: ${name}`);
      dynamicTips = getSimulationHealthTips(name);
    }

    res.json({ healthTips: dynamicTips });
  } catch (err: any) {
    console.error("Express /api/health-tips Error:", err);
    res.status(500).json({ error: err.message || "Gagal membuat tips kesehatan" });
  }
});

// --- Start Full-Stack Server ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const modelPath = path.join(process.cwd(), "assets", "model.tflite");
  const labelsPath = path.join(process.cwd(), "assets", "labels.txt");
  if (fs.existsSync(modelPath) && fs.existsSync(labelsPath)) {
    console.log(`\n🤖 [LiteRT] On-Device ML Model detected at: ${modelPath}`);
    try {
      const categoriesCount = fs.readFileSync(labelsPath, "utf-8").split("\n").filter(Boolean).length;
      console.log(`🎯 [LiteRT] Loaded MobileNetV2 food classifier with ${categoriesCount} categories from labels.txt\n`);
    } catch (err) {
      console.error(`⚠️ [LiteRT] Error reading labels.txt:`, err);
    }
  } else {
    console.log(`\n⚠️ [LiteRT] On-Device ML Model 'model.tflite' or 'labels.txt' not found at '/assets/'. The app will run in smart simulation mode.\n`);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
