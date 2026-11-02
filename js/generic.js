// Basic foods without a barcode (fruit, veg, staples) with typical values per 100 g.
//
// Values are averages for the raw/fresh food unless the name says otherwise, based on
// USDA FoodData Central (public domain) and typical German label values. Carbs follow
// the EU label convention (fibre NOT included): for USDA-based rows ('u') fibre is
// subtracted from total carbohydrate below.
//
// Row: [id, German name, English name, kcal, protein, carbs, fat, fibre, sugars, serving g, serving label, source, extra search words]

const ROWS = [
  // Fruit
  ['apfel', 'Apfel', 'Apple', 52, 0.3, 13.8, 0.2, 2.4, 10.4, 180, '1 medium', 'u'],
  ['banane', 'Banane', 'Banana', 89, 1.1, 22.8, 0.3, 2.6, 12.2, 120, '1 medium, peeled', 'u'],
  ['orange', 'Orange', 'Orange', 47, 0.9, 11.8, 0.1, 2.4, 9.4, 150, '1 medium, peeled', 'u', 'apfelsine'],
  ['mandarine', 'Mandarine', 'Mandarin', 53, 0.8, 13.3, 0.3, 1.8, 10.6, 75, '1 piece, peeled', 'u', 'clementine'],
  ['birne', 'Birne', 'Pear', 57, 0.4, 15.2, 0.1, 3.1, 9.8, 180, '1 medium', 'u'],
  ['erdbeeren', 'Erdbeeren', 'Strawberries', 32, 0.7, 7.7, 0.3, 2.0, 4.9, 150, '1 bowl', 'u', 'erdbeere strawberry'],
  ['heidelbeeren', 'Heidelbeeren', 'Blueberries', 57, 0.7, 14.5, 0.3, 2.4, 10.0, 125, '1 punnet', 'u', 'blaubeeren blueberry'],
  ['himbeeren', 'Himbeeren', 'Raspberries', 52, 1.2, 11.9, 0.7, 6.5, 4.4, 125, '1 punnet', 'u', 'raspberry'],
  ['trauben', 'Weintrauben', 'Grapes', 69, 0.7, 18.1, 0.2, 0.9, 15.5, 150, '1 bowl', 'u', 'trauben grape'],
  ['kiwi', 'Kiwi', 'Kiwi', 61, 1.1, 14.7, 0.5, 3.0, 9.0, 75, '1 piece, peeled', 'u'],
  ['ananas', 'Ananas', 'Pineapple', 50, 0.5, 13.1, 0.1, 1.4, 9.9, 165, '1 cup chunks', 'u'],
  ['mango', 'Mango', 'Mango', 60, 0.8, 15.0, 0.4, 1.6, 13.7, 200, 'flesh of 1 mango', 'u'],
  ['wassermelone', 'Wassermelone', 'Watermelon', 30, 0.6, 7.6, 0.2, 0.4, 6.2, 300, '1 slice, no rind', 'u', 'melone'],
  ['honigmelone', 'Honigmelone', 'Honeydew melon', 36, 0.5, 9.1, 0.1, 0.8, 8.1, 200, '1 slice, no rind', 'u', 'melone'],
  ['pfirsich', 'Pfirsich', 'Peach', 39, 0.9, 9.5, 0.3, 1.5, 8.4, 150, '1 medium', 'u'],
  ['nektarine', 'Nektarine', 'Nectarine', 44, 1.1, 10.6, 0.3, 1.7, 7.9, 140, '1 medium', 'u'],
  ['pflaume', 'Pflaume', 'Plum', 46, 0.7, 11.4, 0.3, 1.4, 9.9, 65, '1 piece', 'u', 'zwetschge zwetschgen pflaumen'],
  ['kirschen', 'Kirschen', 'Cherries', 63, 1.1, 16.0, 0.2, 2.1, 12.8, 150, '1 bowl', 'u', 'kirsche cherry'],
  ['aprikose', 'Aprikose', 'Apricot', 48, 1.4, 11.1, 0.4, 2.0, 9.2, 35, '1 piece', 'u', 'marille'],
  ['zitrone', 'Zitrone', 'Lemon', 29, 1.1, 9.3, 0.3, 2.8, 2.5, 60, '1 piece, peeled', 'u'],
  ['grapefruit', 'Grapefruit', 'Grapefruit', 42, 0.8, 10.7, 0.1, 1.6, 6.9, 250, '1 piece, peeled', 'u', 'pampelmuse'],
  ['avocado', 'Avocado', 'Avocado', 160, 2.0, 8.5, 14.7, 6.7, 0.7, 70, '½ avocado', 'u'],
  ['granatapfel', 'Granatapfel (Kerne)', 'Pomegranate seeds', 83, 1.7, 18.7, 1.2, 4.0, 13.7, 90, '½ pomegranate', 'u'],
  ['datteln', 'Datteln, getrocknet', 'Dates, dried', 282, 2.5, 75.0, 0.4, 8.0, 63.4, 8, '1 date', 'u', 'dattel'],
  ['rosinen', 'Rosinen', 'Raisins', 299, 3.1, 79.2, 0.5, 3.7, 59.2, 30, '1 handful', 'u'],

  // Vegetables
  ['tomate', 'Tomate', 'Tomato', 18, 0.9, 3.9, 0.2, 1.2, 2.6, 120, '1 medium', 'u', 'tomaten'],
  ['cherrytomaten', 'Cherrytomaten', 'Cherry tomatoes', 18, 0.9, 3.9, 0.2, 1.2, 2.6, 15, '1 piece', 'u', 'tomate'],
  ['gurke', 'Gurke', 'Cucumber', 15, 0.7, 3.6, 0.1, 0.5, 1.7, 150, '½ cucumber', 'u', 'salatgurke'],
  ['paprika-rot', 'Paprika, rot', 'Red bell pepper', 31, 1.0, 6.0, 0.3, 2.1, 4.2, 150, '1 pepper', 'u', 'paprika pepper'],
  ['paprika-gruen', 'Paprika, grün', 'Green bell pepper', 20, 0.9, 4.6, 0.2, 1.7, 2.4, 150, '1 pepper', 'u', 'paprika pepper'],
  ['karotte', 'Karotte', 'Carrot', 41, 0.9, 9.6, 0.2, 2.8, 4.7, 60, '1 medium', 'u', 'möhre möhren karotten'],
  ['brokkoli', 'Brokkoli', 'Broccoli', 34, 2.8, 6.6, 0.4, 2.6, 1.7, 200, '1 portion', 'u', 'broccoli'],
  ['blumenkohl', 'Blumenkohl', 'Cauliflower', 25, 1.9, 5.0, 0.3, 2.0, 1.9, 200, '1 portion', 'u'],
  ['zucchini', 'Zucchini', 'Courgette', 17, 1.2, 3.1, 0.3, 1.0, 2.5, 200, '1 medium', 'u', 'zucchini'],
  ['aubergine', 'Aubergine', 'Aubergine', 25, 1.0, 5.9, 0.2, 3.0, 3.5, 300, '1 medium', 'u', 'eggplant'],
  ['spinat', 'Spinat', 'Spinach', 23, 2.9, 3.6, 0.4, 2.2, 0.4, 100, '1 portion', 'u', 'babyspinat'],
  ['kopfsalat', 'Kopfsalat', 'Lettuce', 15, 1.4, 2.9, 0.2, 1.3, 0.8, 50, '1 side salad', 'u', 'salat blattsalat'],
  ['eisbergsalat', 'Eisbergsalat', 'Iceberg lettuce', 14, 0.9, 3.0, 0.1, 1.2, 2.0, 50, '1 side salad', 'u', 'salat'],
  ['rucola', 'Rucola', 'Rocket', 25, 2.6, 3.7, 0.7, 1.6, 2.0, 30, '1 handful', 'u', 'rauke arugula'],
  ['zwiebel', 'Zwiebel', 'Onion', 40, 1.1, 9.3, 0.1, 1.7, 4.2, 110, '1 medium', 'u', 'zwiebeln'],
  ['knoblauch', 'Knoblauch', 'Garlic', 149, 6.4, 33.1, 0.5, 2.1, 1.0, 3, '1 clove', 'u'],
  ['kartoffel', 'Kartoffeln, roh', 'Potatoes, raw', 77, 2.0, 17.5, 0.1, 2.2, 0.8, 150, '1 medium', 'u', 'kartoffel erdapfel'],
  ['kartoffel-gekocht', 'Kartoffeln, gekocht', 'Potatoes, boiled', 87, 1.9, 20.1, 0.1, 1.8, 0.9, 150, '1 medium', 'u', 'kartoffel salzkartoffeln pellkartoffeln'],
  ['suesskartoffel', 'Süßkartoffel', 'Sweet potato', 86, 1.6, 20.1, 0.1, 3.0, 4.2, 200, '1 medium', 'u', 'suesskartoffel'],
  ['champignons', 'Champignons', 'Mushrooms', 22, 3.1, 3.3, 0.3, 1.0, 2.0, 100, '1 portion', 'u', 'pilze champignon'],
  ['erbsen', 'Erbsen, grün', 'Green peas', 81, 5.4, 14.5, 0.4, 5.7, 5.7, 100, '1 portion', 'u', 'erbse tiefkühl'],
  ['gruene-bohnen', 'Grüne Bohnen', 'Green beans', 31, 1.8, 7.0, 0.2, 2.7, 3.3, 150, '1 portion', 'u', 'bohnen buschbohnen'],
  ['mais', 'Mais (Zuckermais)', 'Sweetcorn', 86, 3.3, 19.0, 1.4, 2.7, 3.2, 100, '1 portion', 'u', 'mais'],
  ['kohlrabi', 'Kohlrabi', 'Kohlrabi', 27, 1.7, 6.2, 0.1, 3.6, 2.6, 250, '1 piece', 'u'],
  ['weisskohl', 'Weißkohl', 'White cabbage', 25, 1.3, 5.8, 0.1, 2.5, 3.2, 150, '1 portion', 'u', 'kohl krautsalat weisskohl'],
  ['rotkohl', 'Rotkohl', 'Red cabbage', 31, 1.4, 7.4, 0.2, 2.1, 3.8, 150, '1 portion', 'u', 'blaukraut kohl'],
  ['spargel', 'Spargel', 'Asparagus', 20, 2.2, 3.9, 0.1, 2.1, 1.9, 250, '1 portion', 'u'],
  ['lauch', 'Lauch', 'Leek', 61, 1.5, 14.2, 0.3, 1.8, 3.9, 100, '1 portion', 'u', 'porree'],
  ['sellerie', 'Staudensellerie', 'Celery', 16, 0.7, 3.0, 0.2, 1.6, 1.3, 40, '1 stalk', 'u', 'sellerie'],
  ['radieschen', 'Radieschen', 'Radishes', 16, 0.7, 3.4, 0.1, 1.6, 1.9, 50, '1 handful', 'u'],
  ['kuerbis', 'Kürbis', 'Pumpkin', 26, 1.0, 6.5, 0.1, 0.5, 2.8, 200, '1 portion', 'u', 'kuerbis hokkaido butternut'],
  ['rosenkohl', 'Rosenkohl', 'Brussels sprouts', 43, 3.4, 9.0, 0.3, 3.8, 2.2, 150, '1 portion', 'u'],
  ['gruenkohl', 'Grünkohl', 'Kale', 49, 4.3, 8.8, 0.9, 3.6, 2.3, 100, '1 portion', 'u', 'kale'],

  // Grains & staples
  ['reis', 'Reis, roh', 'Rice, uncooked', 365, 7.1, 80.0, 0.7, 1.3, 0.1, 75, '1 portion', 'u', 'reis basmati jasmin langkorn'],
  ['reis-gekocht', 'Reis, gekocht', 'Rice, cooked', 130, 2.7, 28.2, 0.3, 0.4, 0.1, 200, '1 portion', 'u', 'reis basmati jasmin'],
  ['vollkornreis', 'Vollkornreis, roh', 'Brown rice, uncooked', 370, 7.9, 77.2, 2.9, 3.5, 0.9, 75, '1 portion', 'u', 'naturreis reis'],
  ['vollkornreis-gekocht', 'Vollkornreis, gekocht', 'Brown rice, cooked', 123, 2.7, 25.6, 1.0, 1.6, 0.2, 200, '1 portion', 'u', 'naturreis reis'],
  ['nudeln', 'Nudeln, roh', 'Pasta, uncooked', 371, 13.0, 74.7, 1.5, 3.2, 2.7, 100, '1 portion', 'u', 'pasta spaghetti penne'],
  ['nudeln-gekocht', 'Nudeln, gekocht', 'Pasta, cooked', 158, 5.8, 30.9, 0.9, 1.8, 0.6, 250, '1 portion', 'u', 'pasta spaghetti penne'],
  ['haferflocken', 'Haferflocken', 'Rolled oats', 379, 13.2, 67.7, 6.5, 10.1, 1.0, 50, '1 portion', 'u', 'hafer oats porridge'],
  ['quinoa', 'Quinoa, roh', 'Quinoa, uncooked', 368, 14.1, 64.2, 6.1, 7.0, 0, 60, '1 portion', 'u'],
  ['quinoa-gekocht', 'Quinoa, gekocht', 'Quinoa, cooked', 120, 4.4, 21.3, 1.9, 2.8, 0.9, 185, '1 portion', 'u'],
  ['couscous', 'Couscous, roh', 'Couscous, uncooked', 376, 12.8, 77.4, 0.6, 5.0, 0, 60, '1 portion', 'u'],
  ['vollkornbrot', 'Vollkornbrot', 'Wholegrain rye bread', 200, 7.0, 38.0, 1.2, 8.0, 3.0, 50, '1 slice', 'd', 'brot roggenbrot'],
  ['mischbrot', 'Mischbrot', 'Mixed rye-wheat bread', 214, 6.5, 41.0, 1.1, 5.0, 2.0, 50, '1 slice', 'd', 'brot'],
  ['broetchen', 'Brötchen', 'Bread roll', 270, 9.0, 54.0, 1.5, 3.0, 3.0, 60, '1 roll', 'd', 'semmel weizenbrötchen broetchen'],
  ['toast', 'Toastbrot', 'White toast bread', 265, 8.0, 49.0, 3.5, 3.0, 5.0, 25, '1 slice', 'd', 'toast'],

  // Dairy & eggs
  ['ei', 'Ei', 'Egg', 143, 12.6, 0.7, 9.5, 0, 0.4, 55, '1 egg (M)', 'u', 'eier hühnerei'],
  ['vollmilch', 'Vollmilch 3,5 %', 'Whole milk 3.5%', 64, 3.3, 4.8, 3.5, 0, 4.8, 200, '1 glass (200 ml)', 'd', 'milch'],
  ['milch-15', 'Fettarme Milch 1,5 %', 'Low-fat milk 1.5%', 47, 3.4, 4.9, 1.5, 0, 4.9, 200, '1 glass (200 ml)', 'd', 'milch'],
  ['magerquark', 'Magerquark', 'Low-fat quark', 67, 12.0, 4.0, 0.2, 0, 4.0, 250, '1 tub', 'd', 'quark'],
  ['naturjoghurt', 'Naturjoghurt 3,5 %', 'Plain yoghurt 3.5%', 64, 3.5, 4.5, 3.5, 0, 4.5, 150, '1 pot', 'd', 'joghurt yogurt'],
  ['butter', 'Butter', 'Butter', 741, 0.7, 0.6, 82.0, 0, 0.6, 10, '1 portion', 'd'],
  ['gouda', 'Gouda', 'Gouda', 356, 24.9, 2.2, 27.4, 0, 2.2, 30, '1 slice', 'u', 'käse kaese'],
  ['mozzarella', 'Mozzarella', 'Mozzarella', 254, 18.5, 1.0, 19.5, 0, 1.0, 125, '1 ball', 'd', 'käse kaese'],

  // Meat, fish, protein
  ['haehnchenbrust', 'Hähnchenbrust, roh', 'Chicken breast, raw', 110, 23.0, 0, 1.5, 0, 0, 150, '1 fillet', 'd', 'huhn hühnchen haehnchen chicken'],
  ['haehnchenbrust-gebraten', 'Hähnchenbrust, gebraten', 'Chicken breast, cooked', 165, 31.0, 0, 3.6, 0, 0, 120, '1 fillet', 'u', 'huhn hühnchen haehnchen chicken'],
  ['putenbrust', 'Putenbrust, roh', 'Turkey breast, raw', 107, 24.0, 0, 1.0, 0, 0, 150, '1 fillet', 'd', 'pute truthahn turkey'],
  ['rinderhack', 'Rinderhackfleisch, roh', 'Ground beef 20% fat, raw', 254, 17.2, 0, 20.0, 0, 0, 125, '1 portion', 'u', 'hack hackfleisch beef mince'],
  ['rinderhack-mager', 'Rinderhack mager 5 %, roh', 'Lean ground beef 5%, raw', 137, 21.4, 0, 5.0, 0, 0, 125, '1 portion', 'u', 'hack hackfleisch beef mince'],
  ['rindfleisch', 'Rindfleisch, mager, roh', 'Lean beef, raw', 121, 22.0, 0, 3.5, 0, 0, 200, '1 steak', 'd', 'steak rind hüfte'],
  ['lachs', 'Lachs, roh', 'Salmon, raw', 208, 20.4, 0, 13.4, 0, 0, 125, '1 fillet', 'u', 'salmon fisch'],
  ['thunfisch', 'Thunfisch im eigenen Saft', 'Tuna in water, drained', 116, 25.5, 0, 0.8, 0, 0, 130, '1 can, drained', 'u', 'tuna fisch'],
  ['tofu', 'Tofu natur', 'Tofu, firm', 144, 17.3, 2.8, 8.7, 2.3, 0.6, 100, '1 portion', 'u'],

  // Legumes, nuts, seeds
  ['linsen', 'Linsen, roh', 'Lentils, dry', 352, 24.6, 63.4, 1.1, 10.7, 2.0, 60, '1 portion', 'u', 'linse'],
  ['linsen-gekocht', 'Linsen, gekocht', 'Lentils, cooked', 116, 9.0, 20.1, 0.4, 7.9, 1.8, 200, '1 portion', 'u', 'linse'],
  ['kichererbsen', 'Kichererbsen, gekocht', 'Chickpeas, cooked', 164, 8.9, 27.4, 2.6, 7.6, 4.8, 150, '1 portion', 'u', 'kichererbse chickpea'],
  ['kidneybohnen', 'Kidneybohnen, gekocht', 'Kidney beans, cooked', 127, 8.7, 22.8, 0.5, 6.4, 0.3, 150, '1 portion', 'u', 'bohnen'],
  ['mandeln', 'Mandeln', 'Almonds', 579, 21.2, 21.6, 49.9, 12.5, 4.4, 30, '1 handful', 'u', 'mandel nüsse nuesse'],
  ['walnuesse', 'Walnüsse', 'Walnuts', 654, 15.2, 13.7, 65.2, 6.7, 2.6, 30, '1 handful', 'u', 'walnuss nüsse nuesse'],
  ['erdnuesse', 'Erdnüsse', 'Peanuts', 567, 25.8, 16.1, 49.2, 8.5, 4.0, 30, '1 handful', 'u', 'erdnuss nüsse nuesse'],
  ['cashews', 'Cashewkerne', 'Cashews', 553, 18.2, 30.2, 43.9, 3.3, 5.9, 30, '1 handful', 'u', 'cashew nüsse nuesse'],
  ['erdnussbutter', 'Erdnussbutter', 'Peanut butter', 588, 25.0, 20.0, 50.0, 6.0, 9.0, 15, '1 Tbsp', 'u', 'erdnussmus peanut'],
  ['chiasamen', 'Chiasamen', 'Chia seeds', 486, 16.5, 42.1, 30.7, 34.4, 0, 15, '1 Tbsp', 'u', 'chia'],
  ['leinsamen', 'Leinsamen', 'Flaxseed', 534, 18.3, 28.9, 42.2, 27.3, 1.6, 10, '1 Tbsp', 'u', 'leinsamen'],

  // Oils, sweet things
  ['olivenoel', 'Olivenöl', 'Olive oil', 884, 0, 0, 100, 0, 0, 13, '1 Tbsp', 'u', 'öl oel oil olivenoel'],
  ['rapsoel', 'Rapsöl', 'Rapeseed oil', 884, 0, 0, 100, 0, 0, 13, '1 Tbsp', 'u', 'öl oel oil rapsoel'],
  ['honig', 'Honig', 'Honey', 304, 0.3, 82.4, 0, 0.2, 82.1, 8, '1 tsp', 'u'],
  ['zucker', 'Zucker', 'Sugar', 400, 0, 100, 0, 0, 100, 4, '1 tsp', 'd'],
  ['zartbitterschokolade', 'Zartbitterschokolade 70 %', 'Dark chocolate 70%', 598, 7.8, 45.9, 42.6, 10.9, 24.0, 20, '2 squares', 'u', 'schokolade chocolate'],
];

const fold = (s) => String(s).toLowerCase()
  .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
  .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

// Picture for each food: the phone's own emoji (no download, no licence needed).
const EMOJI = {"apfel": "🍎", "banane": "🍌", "orange": "🍊", "mandarine": "🍊", "birne": "🍐", "erdbeeren": "🍓", "heidelbeeren": "🫐", "himbeeren": "🍓", "trauben": "🍇", "kiwi": "🥝", "ananas": "🍍", "mango": "🥭", "wassermelone": "🍉", "honigmelone": "🍈", "pfirsich": "🍑", "nektarine": "🍑", "pflaume": "🍑", "kirschen": "🍒", "aprikose": "🍑", "zitrone": "🍋", "grapefruit": "🍊", "avocado": "🥑", "granatapfel": "🍎", "datteln": "🌴", "rosinen": "🍇", "tomate": "🍅", "cherrytomaten": "🍅", "gurke": "🥒", "paprika-rot": "🫑", "paprika-gruen": "🫑", "karotte": "🥕", "brokkoli": "🥦", "blumenkohl": "🥦", "zucchini": "🥒", "aubergine": "🍆", "spinat": "🥬", "kopfsalat": "🥬", "eisbergsalat": "🥬", "rucola": "🥬", "zwiebel": "🧅", "knoblauch": "🧄", "kartoffel": "🥔", "kartoffel-gekocht": "🥔", "suesskartoffel": "🍠", "champignons": "🍄", "erbsen": "🫛", "gruene-bohnen": "🫛", "mais": "🌽", "kohlrabi": "🥬", "weisskohl": "🥬", "rotkohl": "🥬", "spargel": "🥬", "lauch": "🧅", "sellerie": "🥬", "radieschen": "🌱", "kuerbis": "🎃", "rosenkohl": "🥬", "gruenkohl": "🥬", "reis": "🍚", "reis-gekocht": "🍚", "vollkornreis": "🍚", "vollkornreis-gekocht": "🍚", "nudeln": "🍝", "nudeln-gekocht": "🍝", "haferflocken": "🥣", "quinoa": "🌾", "quinoa-gekocht": "🌾", "couscous": "🌾", "vollkornbrot": "🍞", "mischbrot": "🍞", "broetchen": "🥖", "toast": "🍞", "ei": "🥚", "vollmilch": "🥛", "milch-15": "🥛", "magerquark": "🥣", "naturjoghurt": "🥣", "butter": "🧈", "gouda": "🧀", "mozzarella": "🧀", "haehnchenbrust": "🍗", "haehnchenbrust-gebraten": "🍗", "putenbrust": "🍗", "rinderhack": "🥩", "rinderhack-mager": "🥩", "rindfleisch": "🥩", "lachs": "🐟", "thunfisch": "🐟", "tofu": "🧊", "linsen": "🫘", "linsen-gekocht": "🫘", "kichererbsen": "🫘", "kidneybohnen": "🫘", "mandeln": "🌰", "walnuesse": "🌰", "erdnuesse": "🥜", "cashews": "🥜", "erdnussbutter": "🥜", "chiasamen": "🌱", "leinsamen": "🌱", "olivenoel": "🫒", "rapsoel": "🌻", "honig": "🍯", "zucker": "🍬", "zartbitterschokolade": "🍫"};

export const PREFIX = 'gen-';

export const GENERIC = ROWS.map(([id, de, en, kcal, protein, carbs, fat, fiber, sugars, servingGrams, servingLabel, src, words = '']) => ({
  code: PREFIX + id,
  name: de,
  brand: en,
  imageUrl: null,
  quantity: null,
  per100: {
    kcal, protein, fat, sugars, fiber,
    carbs: +Math.max(0, src === 'u' ? carbs - fiber : carbs).toFixed(1),
    saturatedFat: null, salt: null,
  },
  unit: 'g',
  servingGrams,
  servingLabel,
  source: 'generic',
  emoji: EMOJI[id] || '🍽️',
  search: fold(`${de} ${en} ${words}`),
}));

const byCode = new Map(GENERIC.map((g) => [g.code, g]));

/** The emoji for a food code, or null when it isn't a basic food. */
export const emojiFor = (code) => byCode.get(code)?.emoji || null;

export const isGeneric = (code) => typeof code === 'string' && code.startsWith(PREFIX);

/** A fresh copy of a basic food, as a product the rest of the app understands. */
export function genericProduct(code) {
  const g = byCode.get(code);
  if (!g) return null;
  const { search, ...p } = g;
  return { ...p, per100: { ...p.per100 }, fetchedAt: new Date().toISOString() };
}

/** Basic foods matching a search, best matches first. */
export function searchGeneric(query, limit = 20) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits = [];
  for (const g of GENERIC) {
    if (!words.every((w) => g.search.includes(w))) continue;
    const name = fold(g.name);
    const score = name.startsWith(words[0]) ? 0 : g.search.split(' ').some((t) => t.startsWith(words[0])) ? 1 : 2;
    hits.push([score, g]);
  }
  return hits.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length).slice(0, limit).map(([, g]) => g);
}
