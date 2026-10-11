-- pgAdmin → база проекта (обычно pmt) → Query Tool → выполнить файл целиком (F5).
-- Нужна актуальная схема с suppliers, dishes.version и dishes.deleted_at.
-- 25 продуктов, 25 поставщиков, 25 поставок, 25 активных блюд + 5 в корзине.
-- 25 названий единиц (существующие переиспользуются), 75 партий, 90 ингредиентов.
-- Заказы, пользователи и списания не создаются: это набор для тестирования менеджера.
-- Метка [ТЕСТ25], идентификаторы demo25_*. Повторный запуск не дублирует данные
-- и не сбрасывает ваши изменения рецептов, корзины или количеств.
-- Даты и сроки рассчитываются относительно момента первого добавления записи.

BEGIN;

DO $demo25$
DECLARE
    manager_id TEXT;
    kitchen_id TEXT;
    i INTEGER;
    j INTEGER;
    p INTEGER;
    unit_id TEXT;
    unit_name TEXT;
    product_name TEXT;
    dish_id TEXT;
    inserted_id TEXT;
    receipt_count NUMERIC(12,3);
    current_count NUMERIC(12,3);
    expiry TIMESTAMP;
    demo_now TIMESTAMP := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    good_products INTEGER[] := ARRAY[1,2,4,8,11,13,16,17,19,22,23];
    product_names TEXT[] := ARRAY[
        'Помидоры','Огурцы','Картофель','Морковь','Лук репчатый',
        'Молоко','Сливки 33%','Масло растительное','Вода питьевая','Сок томатный',
        'Яйца','Булочка','Лимон','Лайм','Авокадо',
        'Куриное филе','Говядина','Рис','Макароны','Мука',
        'Сахар','Соль','Сыр','Помидоры','Сметана'
    ];
    dish_names TEXT[] := ARRAY[
        'Салат овощной','Салат огуречный','Картофель запечённый','Овощной суп','Омлет',
        'Каша молочная','Сливочный суп','Овощное рагу','Рис отварной','Томатный суп',
        'Завтрак с яйцом','Сэндвич','Лимонный напиток','Лаймовый напиток','Салат с авокадо',
        'Курица с гарниром','Говядина с овощами','Рис с овощами','Паста','Сырники',
        'Блины','Суп дня','Сырная закуска','Салат овощной','Овощи со сметаной'
    ];
    unit_names TEXT[] := ARRAY[
        'кг','л','шт','г','мл','порция','упаковка','коробка','мешок','бутылка',
        'банка','пачка','ведро','ящик','контейнер','палета','лоток','рулон','блок',
        'пакет','набор','связка','буханка','стакан','капсула'
    ];
    supplier_names TEXT[] := ARRAY[
        'Ферма Юг','Овощная база','Молочная долина','Мясной двор','Свежий урожай',
        'Пекарня Утро','Продуктовый союз','Зелёная грядка','Фермерский рынок','Молочный берег',
        'Дом специй','Зерновой склад','Сырная лавка','Птицеферма','Сад и огород',
        'Мясная компания','Бакалея плюс','Напитки оптом','Пекарский дом','Крымские продукты',
        'Городской поставщик','Ферма Восток','Ресторанный склад','Свежие продукты','Ферма Запад'
    ];
BEGIN
    -- Только существующие сотрудники: пароли и роли не меняются.
    SELECT id INTO manager_id FROM users WHERE role = 'MANAGER'
    ORDER BY (login = 'manager') DESC, id LIMIT 1;
    SELECT id INTO kitchen_id FROM users WHERE role = 'KITCHEN'
    ORDER BY (login = 'kitchen') DESC, id LIMIT 1;
    IF manager_id IS NULL THEN
        RAISE EXCEPTION 'Нет пользователя MANAGER. Сначала выполните npm run db:seed в back-nestjs.';
    END IF;
    kitchen_id := COALESCE(kitchen_id, manager_id);

    FOR i IN 1..25 LOOP
        INSERT INTO units (id_unit, name)
        VALUES ('demo25_unit_' || lpad(i::TEXT, 2, '0'), unit_names[i])
        ON CONFLICT (name) DO NOTHING;

        -- Первые 5 и последние 10 продуктов — кг, жидкие продукты — л,
        -- яйца/булочки/лимон/лайм/авокадо — шт. Остальные единицы свободны
        -- для проверки удаления неиспользуемых единиц.
        unit_name := CASE WHEN i BETWEEN 6 AND 10 THEN 'л'
                          WHEN i BETWEEN 11 AND 15 THEN 'шт' ELSE 'кг' END;
        SELECT id_unit INTO unit_id FROM units WHERE name = unit_name;
        -- При первом проходе л/шт могут ещё не быть добавлены циклом.
        IF unit_id IS NULL THEN
            INSERT INTO units (id_unit, name)
            VALUES ('demo25_unit_' || CASE WHEN unit_name = 'л' THEN '02' ELSE '03' END, unit_name)
            ON CONFLICT (name) DO NOTHING;
            SELECT id_unit INTO unit_id FROM units WHERE name = unit_name;
        END IF;

        INSERT INTO products (id_product, name_product, id_unit)
        VALUES ('demo25_product_' || lpad(i::TEXT, 2, '0'), '[ТЕСТ25] ' || product_names[i], unit_id)
        ON CONFLICT (id_product) DO NOTHING;

        INSERT INTO suppliers (id_supplier, name, name_key)
        VALUES ('demo25_supplier_' || lpad(i::TEXT, 2, '0'), '[ТЕСТ25] ' || supplier_names[i], lower('[ТЕСТ25] ' || supplier_names[i]))
        ON CONFLICT (id_supplier) DO NOTHING;

        INSERT INTO delivery (id_delivery, number, create_date, creater_id, supplier_id)
        VALUES ('demo25_delivery_' || lpad(i::TEXT, 2, '0'), 'ТЕСТ25-Н-' || lpad(i::TEXT, 3, '0'),
                demo_now - (40 - i) * INTERVAL '1 day', manager_id,
                'demo25_supplier_' || lpad(i::TEXT, 2, '0'))
        ON CONFLICT (id_delivery) DO NOTHING;
    END LOOP;

    -- В каждой поставке три партии, продукты повторяются между поставками.
    FOR i IN 1..25 LOOP
        FOR j IN 1..3 LOOP
            p := ((i + j - 2) % 25) + 1;
            SELECT pr.name_product, u.name INTO product_name, unit_name
            FROM products pr JOIN units u ON u.id_unit = pr.id_unit
            WHERE pr.id_product = 'demo25_product_' || lpad(p::TEXT, 2, '0');
            receipt_count := CASE WHEN unit_name = 'шт' THEN 12.000 ELSE 5.000 + i / 10.0 END;
            current_count := CASE WHEN p % 5 = 0 THEN 0.000
                                  WHEN p % 3 = 0 THEN 0.050 ELSE receipt_count END;
            expiry := CASE WHEN p % 7 = 0 THEN demo_now - INTERVAL '2 days'
                           WHEN j = 1 THEN demo_now + INTERVAL '2 days'
                           WHEN j = 2 THEN demo_now + INTERVAL '14 days'
                           ELSE demo_now + INTERVAL '45 days' END;
            INSERT INTO batch (id_batch, count, exp, id_product, id_delivery,
                               received_count, product_name_at_receipt, unit_name_at_receipt)
            VALUES ('demo25_batch_' || lpad(i::TEXT, 2, '0') || '_' || j,
                    current_count, expiry, 'demo25_product_' || lpad(p::TEXT, 2, '0'),
                    'demo25_delivery_' || lpad(i::TEXT, 2, '0'), receipt_count, product_name, unit_name)
            ON CONFLICT (id_batch) DO NOTHING;
        END LOOP;
    END LOOP;

    -- 25 активных рецептов и дополнительно 5 в корзине для теста восстановления.
    FOR i IN 1..30 LOOP
        dish_id := 'demo25_dish_' || lpad(i::TEXT, 2, '0');
        inserted_id := NULL;
        INSERT INTO dishes (id_dish, name, version, deleted_at)
        VALUES (dish_id, '[ТЕСТ25] ' || CASE WHEN i <= 25 THEN dish_names[i]
                    ELSE 'Из корзины ' || (i - 25) END,
                CASE WHEN i <= 25 THEN 1 ELSE 2 END,
                CASE WHEN i <= 25 THEN NULL ELSE demo_now - (i - 25) * INTERVAL '1 day' END)
        ON CONFLICT (id_dish) DO NOTHING
        RETURNING id_dish INTO inserted_id;

        -- Не возвращаем старые ингредиенты, если вы уже изменили этот рецепт.
        IF inserted_id IS NOT NULL THEN
            FOR j IN 1..3 LOOP
                -- Первые 10 рецептов обеспечены продуктами; остальные
                -- проверяют недостаток, нулевой остаток и просрочку.
                p := CASE WHEN i <= 10 THEN good_products[((i + j - 2) % array_length(good_products, 1)) + 1]
                          ELSE ((i + j - 2) % 25) + 1 END;
                SELECT u.name INTO unit_name FROM products pr JOIN units u ON u.id_unit = pr.id_unit
                WHERE pr.id_product = 'demo25_product_' || lpad(p::TEXT, 2, '0');
                INSERT INTO dish_ingredients (id_dish_ingredient, count, id_dish, id_product)
                VALUES ('demo25_ingredient_' || lpad(i::TEXT, 2, '0') || '_' || j,
                        CASE WHEN unit_name = 'шт' THEN 1.000 ELSE 0.200 END,
                        dish_id, 'demo25_product_' || lpad(p::TEXT, 2, '0'));
            END LOOP;

            -- Ручной стоп для части блюд: останется после изменения рецепта.
            IF i IN (2, 4, 8, 12, 16, 20, 24, 27, 29) THEN
                INSERT INTO stop_list (id_stop_list, type, id_dish, creater_id)
                VALUES ('demo25_manual_' || lpad(i::TEXT, 2, '0'), 'MANUAL', dish_id, kitchen_id);
            END IF;
        END IF;
    END LOOP;

    -- AUTO вычисляется из текущего состава и годных остатков, а не произвольно.
    -- Корзина исключается, ручные стопы не меняются.
    INSERT INTO stop_list (id_stop_list, type, id_dish)
    SELECT 'demo25_auto_' || d.id_dish, 'AUTO', d.id_dish
    FROM dishes d
    WHERE d.id_dish ~ '^demo25_dish_[0-9]{2}$' AND d.deleted_at IS NULL
      AND (NOT EXISTS (SELECT 1 FROM dish_ingredients di WHERE di.id_dish = d.id_dish) OR EXISTS (
        SELECT 1 FROM dish_ingredients di
        WHERE di.id_dish = d.id_dish
          AND COALESCE((SELECT SUM(b.count) FROM batch b
                        WHERE b.id_product = di.id_product AND b.count > 0 AND b.exp > demo_now), 0) < di.count
      ))
    ON CONFLICT (id_dish, type) DO NOTHING;

    DELETE FROM stop_list sl USING dishes d
    WHERE sl.id_dish = d.id_dish AND sl.type = 'AUTO' AND d.id_dish ~ '^demo25_dish_[0-9]{2}$'
      AND (d.deleted_at IS NOT NULL OR (EXISTS (SELECT 1 FROM dish_ingredients di WHERE di.id_dish = d.id_dish) AND NOT EXISTS (
        SELECT 1 FROM dish_ingredients di WHERE di.id_dish = d.id_dish
          AND COALESCE((SELECT SUM(b.count) FROM batch b
                        WHERE b.id_product = di.id_product AND b.count > 0 AND b.exp > demo_now), 0) < di.count
      )));
END
$demo25$;

COMMIT;

-- Результат: количество объектов именно этого набора, не всей базы.
SELECT 'Продукты' AS entity, count(*) AS quantity FROM products WHERE id_product LIKE 'demo25_product_%'
UNION ALL SELECT 'Поставщики', count(*) FROM suppliers WHERE id_supplier LIKE 'demo25_supplier_%'
UNION ALL SELECT 'Поставки', count(*) FROM delivery WHERE id_delivery LIKE 'demo25_delivery_%'
UNION ALL SELECT 'Партии', count(*) FROM batch WHERE id_batch LIKE 'demo25_batch_%'
UNION ALL SELECT 'Активные блюда', count(*) FROM dishes WHERE id_dish LIKE 'demo25_dish_%' AND deleted_at IS NULL
UNION ALL SELECT 'Блюда в корзине', count(*) FROM dishes WHERE id_dish LIKE 'demo25_dish_%' AND deleted_at IS NOT NULL
UNION ALL SELECT 'Ингредиенты', count(*) FROM dish_ingredients WHERE id_dish_ingredient LIKE 'demo25_ingredient_%'
UNION ALL SELECT 'AUTO-стопы', count(*) FROM stop_list WHERE id_dish LIKE 'demo25_dish_%' AND type = 'AUTO'
UNION ALL SELECT 'MANUAL-стопы', count(*) FROM stop_list WHERE id_dish LIKE 'demo25_dish_%' AND type = 'MANUAL';
