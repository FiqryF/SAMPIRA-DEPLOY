-- Non-destructive migration. Existing category IDs and tariffs are preserved.
-- Run against the application's configured database, not db_init.go.
START TRANSACTION;
INSERT INTO waste_categories (category_name, description, reward_per_kg, processing_fee_per_kg)
SELECT 'Organik', 'Sisa makanan, kulit buah, sayur, dan daun terpilah; setoran tanpa reward', 0, 0
WHERE NOT EXISTS (SELECT 1 FROM waste_categories WHERE category_name = 'Organik');
INSERT INTO waste_categories (category_name, description, reward_per_kg, processing_fee_per_kg)
SELECT 'Plastik PET', 'Anorganik: botol PET bening bersih dan terpilah', 3000, 0
WHERE NOT EXISTS (SELECT 1 FROM waste_categories WHERE category_name = 'Plastik PET');
INSERT INTO waste_categories (category_name, description, reward_per_kg, processing_fee_per_kg)
SELECT 'Kertas dan Kardus', 'Anorganik: kertas dan kardus bersih serta kering', 1000, 0
WHERE NOT EXISTS (SELECT 1 FROM waste_categories WHERE category_name = 'Kertas dan Kardus');
INSERT INTO waste_categories (category_name, description, reward_per_kg, processing_fee_per_kg)
SELECT 'Besi', 'Anorganik: besi bekas terpilah, bukan seluruh jenis logam', 2500, 0
WHERE NOT EXISTS (SELECT 1 FROM waste_categories WHERE category_name = 'Besi');
INSERT INTO waste_categories (category_name, description, reward_per_kg, processing_fee_per_kg)
SELECT 'Kaca', 'Anorganik: botol kaca dan beling terpilah, bukan lampu atau kemasan B3', 150, 0
WHERE NOT EXISTS (SELECT 1 FROM waste_categories WHERE category_name = 'Kaca');
INSERT INTO waste_categories (category_name, description, reward_per_kg, processing_fee_per_kg)
SELECT 'B3 Rumah Tangga', 'Lampu dan kemasan bekas B3 rumah tangga; bukan limbah medis atau industri; tanpa reward awal', 0, 0
WHERE NOT EXISTS (SELECT 1 FROM waste_categories WHERE category_name = 'B3 Rumah Tangga');
COMMIT;
