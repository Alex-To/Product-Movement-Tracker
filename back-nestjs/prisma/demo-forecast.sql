-- Набор для всех разделов статистики. Выполнить целиком в pgAdmin.
-- Требуется существующий сотрудник. Настройки ресторана не изменяются.
-- Повторный запуск в тот же день не дублирует строки.
BEGIN;
SET LOCAL search_path TO public, pg_temp;
DO $forecast_demo$
DECLARE
    prefix TEXT := 'demo_forecast_v1_';
    actor TEXT;
    actor_name TEXT;
    kg TEXT;
    litre TEXT;
    piece TEXT;
    supplier TEXT;
    u TEXT;
    unit_name TEXT;
    product_id TEXT;
    dish_id TEXT;
    batch_id TEXT;
    oil_batch TEXT;
    order_id TEXT;
    day_key TEXT;
    local_day DATE;
    now_utc TIMESTAMP := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    local_now TIMESTAMP := CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Simferopol';
    order_at TIMESTAMP;
    expiry_at TIMESTAMP;
    loss_at TIMESTAMP;
    seconds_in_day DOUBLE PRECISION;
    reserve_minutes INTEGER;
    i INTEGER;
    d INTEGER;
    portions INTEGER;
    norm NUMERIC(12,3);
    loss NUMERIC(12,3);
    reason_value "RejectionReason";
    names TEXT[] := ARRAY[
        'Куриное филе','Говядина','Рис','Макароны','Сливки',
        'Картофель','Морковь','Лук','Помидоры','Молоко',
        'Сыр','Грибы','Капуста','Гречка','Томатный сок',
        'Рыба','Творог','Мука','Яблоки','Кефир',
        'Кабачки','Свинина','Свёкла','Тыква','Бульон'
    ];
BEGIN
    SELECT id, name INTO actor, actor_name FROM users
    ORDER BY CASE role WHEN 'WAITER' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END, id
    LIMIT 1;
    IF actor IS NULL THEN
        RAISE EXCEPTION 'Сначала создайте хотя бы одного сотрудника.';
    END IF;
    SELECT coalesce((SELECT cook_reserve_minutes FROM settings WHERE id = 1), 30)
    INTO reserve_minutes;

    INSERT INTO units (id_unit, name) VALUES
        (prefix || 'kg', 'кг'), (prefix || 'litre', 'л'), (prefix || 'piece', 'шт')
    ON CONFLICT (name) DO NOTHING;
    SELECT id_unit INTO kg FROM units WHERE name = 'кг';
    SELECT id_unit INTO litre FROM units WHERE name = 'л';
    SELECT id_unit INTO piece FROM units WHERE name = 'шт';

    INSERT INTO suppliers (id_supplier, name, name_key)
    VALUES (prefix || 'supplier', '[ПРОГНОЗ] Тестовый поставщик', '[прогноз] тестовый поставщик')
    ON CONFLICT (name_key) DO NOTHING;
    SELECT id_supplier INTO supplier FROM suppliers
    WHERE name_key = '[прогноз] тестовый поставщик';

    INSERT INTO delivery (id_delivery, number, create_date, supplier_id, creater_id)
    VALUES (prefix || 'delivery', 'ПРОГНОЗ-001', now_utc - interval '100 days', supplier, actor)
    ON CONFLICT (id_delivery) DO NOTHING;

    -- Общий ингредиент всех рецептов и продукт без истории спроса.
    INSERT INTO products (id_product, name_product, id_unit) VALUES
        (prefix || 'oil', '[ПРОГНОЗ] Масло — общий ингредиент', litre),
        (prefix || 'new', '[ПРОГНОЗ] Новый продукт без истории', piece)
    ON CONFLICT (id_product) DO NOTHING;
    INSERT INTO batch (id_batch, count, exp, id_product, id_delivery, received_count)
    VALUES
        (prefix || 'oil_current', 100, now_utc + interval '60 days', prefix || 'oil', prefix || 'delivery', 100),
        (prefix || 'new_current', 50, now_utc + make_interval(mins => reserve_minutes) + interval '2 hours', prefix || 'new', prefix || 'delivery', 50)
    ON CONFLICT (id_batch) DO NOTHING;

    -- 25 действующих рецептов. У каждого собственный продукт и общее масло.
    FOR i IN 1..25 LOOP
        product_id := prefix || 'product_' || i;
        dish_id := prefix || 'dish_' || i;
        u := CASE WHEN i % 5 = 0 THEN litre ELSE kg END;
        unit_name := CASE WHEN i % 5 = 0 THEN 'л' ELSE 'кг' END;
        norm := CASE WHEN i % 5 = 0 THEN 0.250 ELSE 0.200 END;

        INSERT INTO products (id_product, name_product, id_unit)
        VALUES (product_id, '[ПРОГНОЗ] ' || names[i], u)
        ON CONFLICT (id_product) DO NOTHING;
        INSERT INTO dishes (id_dish, name, version, deleted_at)
        VALUES (dish_id, '[ПРОГНОЗ] Блюдо ' || i || ' — ' || names[i], 1, NULL)
        ON CONFLICT (id_dish) DO NOTHING;
        INSERT INTO dish_ingredients (id_dish_ingredient, count, id_dish, id_product)
        VALUES
            (prefix || 'recipe_' || i, norm, dish_id, product_id),
            (prefix || 'recipe_oil_' || i, 0.010, dish_id, prefix || 'oil')
        ON CONFLICT (id_dish, id_product) DO NOTHING;

        -- Большая срочная партия: ожидаемая просрочка.
        -- У половины продуктов небольшой долгосрочный остаток: потребуется закупка.
        INSERT INTO batch (id_batch, count, exp, id_product, id_delivery, received_count,
                           product_name_at_receipt, unit_name_at_receipt)
        VALUES
            (prefix || 'soon_' || i, norm * 50,
             now_utc + make_interval(mins => reserve_minutes) + interval '30 minutes',
             product_id, prefix || 'delivery', norm * 50, '[ПРОГНОЗ] ' || names[i], unit_name),
            (prefix || 'fresh_' || i, norm * CASE WHEN i % 2 = 1 THEN 2 ELSE 500 END,
             now_utc + interval '30 days', product_id, prefix || 'delivery',
             norm * CASE WHEN i % 2 = 1 THEN 2 ELSE 500 END, '[ПРОГНОЗ] ' || names[i], unit_name)
        ON CONFLICT (id_batch) DO NOTHING;
    END LOOP;

    -- 30 дней истории, включая уже прошедшую часть сегодняшнего дня.
    FOR d IN 0..29 LOOP
        local_day := local_now::DATE - d;
        day_key := to_char(local_day, 'YYYYMMDD');
        seconds_in_day := CASE WHEN d = 0
            THEN extract(epoch FROM local_now - local_day::TIMESTAMP)
            ELSE 86400 END;
        order_at := ((local_day::TIMESTAMP + interval '1 second' * (seconds_in_day * 0.30))
                     AT TIME ZONE 'Europe/Simferopol') AT TIME ZONE 'UTC';
        expiry_at := ((local_day::TIMESTAMP + interval '1 second' * (seconds_in_day * 0.70))
                      AT TIME ZONE 'Europe/Simferopol') AT TIME ZONE 'UTC';
        loss_at := ((local_day::TIMESTAMP + interval '1 second' * (seconds_in_day * 0.90))
                    AT TIME ZONE 'Europe/Simferopol') AT TIME ZONE 'UTC';
        oil_batch := prefix || 'oil_history_' || day_key;
        INSERT INTO batch (id_batch, count, exp, id_product, id_delivery)
        VALUES (oil_batch, 0, now_utc + interval '60 days', prefix || 'oil', prefix || 'delivery')
        ON CONFLICT (id_batch) DO NOTHING;

        FOR i IN 1..25 LOOP
            product_id := prefix || 'product_' || i;
            dish_id := prefix || 'dish_' || i;
            batch_id := prefix || 'history_' || day_key || '_' || i;
            order_id := prefix || 'order_' || day_key || '_' || i;
            norm := CASE WHEN i % 5 = 0 THEN 0.250 ELSE 0.200 END;
            portions := 1 + ((i + d) % 5);
            loss := norm * (1 + ((i * 2 + d) % 4));

            INSERT INTO batch (id_batch, count, exp, id_product, id_delivery)
            VALUES (batch_id, 0, expiry_at, product_id, prefix || 'delivery')
            ON CONFLICT (id_batch) DO NOTHING;
            INSERT INTO orders (id_order, create_date, number, ready_at, creater_id)
            VALUES (order_id, order_at, 1 + ((d * 25 + i - 1) % 99),
                    least(order_at + interval '20 minutes', now_utc), actor)
            ON CONFLICT (id_order) DO NOTHING;
            INSERT INTO order_item (id_order_item, count, id_order, id_dish)
            VALUES (order_id || '_line', portions, order_id, dish_id)
            ON CONFLICT (id_order_item) DO NOTHING;

            INSERT INTO stock_movement (id_stock_movement, count, create_date, id_batch, id_order, creater_id)
            VALUES
                (order_id || '_main', norm * portions, order_at, batch_id, order_id, actor),
                (order_id || '_oil', 0.010 * portions, order_at, oil_batch, order_id, actor),
                (batch_id || '_expired', loss, loss_at, batch_id, NULL, NULL)
            ON CONFLICT (id_stock_movement) DO NOTHING;

            IF i % 5 = 0 THEN
                INSERT INTO stock_movement (id_stock_movement, count, create_date, id_batch, id_order, creater_id)
                VALUES (batch_id || '_manual', norm, loss_at, batch_id, NULL, actor)
                ON CONFLICT (id_stock_movement) DO NOTHING;

                reason_value := CASE WHEN i = 25 THEN 'BUSY'::"RejectionReason"
                    WHEN i % 10 = 0 THEN 'SHORTAGE'::"RejectionReason"
                    ELSE 'STOP_LIST'::"RejectionReason" END;
                INSERT INTO order_rejections (id_order_rejection, create_date, reason, lines, details, waiter_name, waiter_id)
                VALUES (order_id || '_rejection', loss_at, reason_value,
                    jsonb_build_array(jsonb_build_object(
                        'dishId', dish_id, 'dishName', '[ПРОГНОЗ] Блюдо ' || i || ' — ' || names[i],
                        'count', portions, 'blocked', reason_value <> 'BUSY', 'excluded', jsonb_build_array())),
                    jsonb_build_object(
                        'stopped', CASE WHEN reason_value = 'STOP_LIST' THEN jsonb_build_array(names[i]) ELSE jsonb_build_array() END,
                        'shortages', CASE WHEN reason_value = 'SHORTAGE' THEN jsonb_build_array(jsonb_build_object(
                            'productName', '[ПРОГНОЗ] ' || names[i], 'unit', 'л',
                            'need', (norm * portions)::TEXT, 'available', '0.100')) ELSE jsonb_build_array() END),
                    actor_name, actor)
                ON CONFLICT (id_order_rejection) DO NOTHING;
            END IF;
        END LOOP;

        -- Отдельное ручное списание ещё годного масла.
        INSERT INTO stock_movement (id_stock_movement, count, create_date, id_batch, id_order, creater_id)
        VALUES (oil_batch || '_manual', 0.150, loss_at, oil_batch, NULL, actor)
        ON CONFLICT (id_stock_movement) DO NOTHING;
    END LOOP;

    -- Восстанавливаем исходное количество только у новых исторических тестовых партий.
    UPDATE batch b SET received_count = b.count + (
        SELECT coalesce(sum(m.count), 0) FROM stock_movement m WHERE m.id_batch = b.id_batch
    ) WHERE (starts_with(b.id_batch, prefix || 'history_')
          OR starts_with(b.id_batch, prefix || 'oil_history_')) AND b.received_count IS NULL;

    RAISE NOTICE 'Готово. Откройте статистику: Просрочка, Что заказать, Горячие предложения.';
END
$forecast_demo$;
COMMIT;
