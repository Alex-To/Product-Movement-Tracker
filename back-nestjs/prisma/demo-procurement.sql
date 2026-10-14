-- Выполните весь файл в Query Tool pgAdmin в базе приложения.
-- 25 сценариев; реальные данные и настройки не изменяются.
-- Повторный запуск не дублирует и не обновляет этот набор.
-- Все ожидаемые значения ниже: горизонт 14 дней, отказы выключены.
-- Временные прогнозы немного меняются с течением времени после запуска.
BEGIN;
SET LOCAL search_path TO public, pg_temp;
DO $demo$
DECLARE
    p TEXT := 'demo_procurement_v2_';
    actor TEXT;
    actor_name TEXT;
    supplier TEXT;
    unit_id TEXT;
    unit_name TEXT;
    product_id TEXT;
    dish_id TEXT;
    order_id TEXT;
    delivery_id TEXT;
    at_time TIMESTAMP;
    t TIMESTAMP := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Simferopol')::DATE;
    boundary TIMESTAMP;
    history_start TIMESTAMP;
    n INTEGER;
    reserve INTEGER;
    i INTEGER;
    d INTEGER;
    j INTEGER;
    portions INTEGER;
    norm NUMERIC;
    quantity NUMERIC;
    cutoff_hours NUMERIC;
    reason_value "RejectionReason";
    labels TEXT[] := ARRAY[
        '01 Яйца — избыток: заказ 0',
        '02 Яйца — пустой склад: заказ 280',
        '03 Рис — мало остатка: заказ 90',
        '04 Яйца — 400 есть, но половина недели: заказ около 140',
        '05 Рис — срочная и свежая партии: заказ 0',
        '06 Яйца — ровно 280 на 14 дней: заказ 0',
        '07 Яйца — округление 4.662 до 5',
        '08 Мука — дробная норма: заказ 5.250',
        '09 Масло — два блюда: расход 10 в день, заказ 120',
        '10 Рис — продажи только в один день: расход 1 в день',
        '11 Новинка — рецепт есть, продаж нет',
        '12 Продукт без рецепта — спрос неизвестен',
        '13 Только сегодняшние заказы — спрос неизвестен',
        '14 Заказы до периода — спрос неизвестен',
        '15 Молоко — весь остаток просрочен: заказ 140',
        '16 Молоко — не успеть приготовить: заказ 140',
        '17 Ручной стоп — спрос всё равно учитывается',
        '18 Только архивное блюдо — спрос неизвестен',
        '19 Отказы — заказ 28 без отказов, 126 с отказами',
        '20 Сливки — срочная партия и горячее предложение',
        '21 Только отказы — без истории либо заказ 98',
        '22 Заказ ровно на начале периода: расход 1 в день',
        '23 FEFO — три партии: заказ около 70',
        '24 Просроченный продукт без истории',
        '25 Соус — дробные литры: заказ 1.554'
    ];
BEGIN
    -- Сериализует повторные запуски этого набора.
    PERFORM pg_advisory_xact_lock(hashtext(p));
    IF EXISTS (SELECT 1 FROM products WHERE id_product = p || 'product_1') THEN
        RAISE NOTICE 'Этот набор уже загружен. Повторных записей и изменения дат нет.';
        RETURN;
    END IF;
    SELECT id, name INTO actor, actor_name FROM users
    ORDER BY CASE role WHEN 'WAITER' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END, id LIMIT 1;
    IF actor IS NULL THEN
        RAISE EXCEPTION 'Сначала создайте хотя бы одного сотрудника через приложение.';
    END IF;
    SELECT coalesce((SELECT demand_days FROM settings WHERE id = 1), 7),
           coalesce((SELECT cook_reserve_minutes FROM settings WHERE id = 1), 30)
    INTO n, reserve;
    IF n < 1 THEN RAISE EXCEPTION 'Период спроса должен быть положительным.'; END IF;
    boundary := (today::TIMESTAMP AT TIME ZONE 'Europe/Simferopol') AT TIME ZONE 'UTC';
    history_start := boundary - make_interval(days => n);

    INSERT INTO units (id_unit, name) VALUES
        (p || 'kg', 'кг'), (p || 'piece', 'шт'), (p || 'litre', 'л')
    ON CONFLICT (name) DO NOTHING;
    INSERT INTO suppliers (id_supplier, name, name_key)
    VALUES (p || 'supplier', '[ТЕСТ ЗАКУПОК] Поставщик', '[тест закупок] поставщик')
    ON CONFLICT (name_key) DO NOTHING;
    SELECT id_supplier INTO supplier FROM suppliers WHERE name_key = '[тест закупок] поставщик';

    FOR i IN 1..25 LOOP
        product_id := p || 'product_' || i;
        dish_id := p || 'dish_' || i;
        delivery_id := p || 'delivery_' || i;
        unit_name := CASE WHEN i IN (1,2,4,6,7) THEN 'шт'
                          WHEN i IN (9,15,16,20,25) THEN 'л' ELSE 'кг' END;
        SELECT id_unit INTO unit_id FROM units WHERE name = unit_name;
        norm := CASE i WHEN 7 THEN 0.333 WHEN 8 THEN 0.125
                       WHEN 9 THEN 2 WHEN 25 THEN 0.111 ELSE 1 END;
        INSERT INTO products (id_product, name_product, id_unit)
        VALUES (product_id, '[ТЕСТ ЗАКУПОК] ' || labels[i], unit_id);
        INSERT INTO delivery (id_delivery, number, create_date, supplier_id, creater_id)
        VALUES (delivery_id, 'TEST-PROC-V2-' || i,
                t - make_interval(days => greatest(n + 10, 100)), supplier, actor);
        IF i NOT IN (12,24) THEN
            INSERT INTO dishes (id_dish, name, version, deleted_at)
            VALUES (dish_id, '[ТЕСТ ЗАКУПОК] Блюдо ' || i, 1,
                    CASE WHEN i = 18 THEN t ELSE NULL END);
            INSERT INTO dish_ingredients (id_dish_ingredient, count, id_dish, id_product)
            VALUES (p || 'recipe_' || i, norm, dish_id, product_id);
        END IF;
        IF i = 9 THEN
            INSERT INTO dishes (id_dish, name, version)
            VALUES (p || 'shared_dish', '[ТЕСТ ЗАКУПОК] Второе блюдо с общим маслом', 1);
            INSERT INTO dish_ingredients (id_dish_ingredient, count, id_dish, id_product)
            VALUES (p || 'shared_recipe', 1, p || 'shared_dish', product_id);
        END IF;

        -- Текущие остатки; cutoff = граница пригодности для приготовления.
        FOR j IN 1..3 LOOP
            quantity := CASE
                WHEN i = 1 AND j = 1 THEN 400
                WHEN i = 3 AND j = 1 THEN 50
                WHEN i = 4 AND j = 1 THEN 400
                WHEN i = 5 AND j = 1 THEN 100
                WHEN i = 5 AND j = 2 THEN 300
                WHEN i = 6 AND j = 1 THEN 280
                WHEN i IN (9,17) AND j = 1 THEN 20
                WHEN i IN (11,12) AND j = 1 THEN 10
                WHEN i IN (15,16,18,20,24) AND j = 1 THEN 100
                WHEN i = 23 THEN CASE j WHEN 1 THEN 10 WHEN 2 THEN 30 ELSE 50 END
                ELSE 0 END;
            IF quantity = 0 THEN CONTINUE; END IF;
            cutoff_hours := CASE
                WHEN i = 4 THEN 168
                WHEN i = 5 AND j = 1 THEN 48
                WHEN i IN (11,20) THEN 2
                WHEN i = 23 AND j < 3 THEN j * 24
                ELSE 960 END;
            INSERT INTO batch (id_batch, count, exp, received_count, id_product,
                               id_delivery, product_name_at_receipt, unit_name_at_receipt)
            VALUES (p || 'stock_' || i || '_' || j, quantity,
                CASE WHEN i IN (15,24) THEN t - interval '1 hour'
                     WHEN i = 16 THEN t + make_interval(secs => reserve * 30)
                     ELSE t + make_interval(mins => reserve) + cutoff_hours * interval '1 hour' END,
                quantity, product_id, delivery_id, '[ТЕСТ ЗАКУПОК] ' || labels[i], unit_name);
        END LOOP;

        -- Закрытые заказы за каждый завершённый день текущего периода.
        -- Дополнительные дни 0 и n+1 нужны для проверки исключённых границ.
        FOR d IN 0..n+1 LOOP
            portions := CASE
                WHEN i IN (1,2,4,5,6) THEN 20
                WHEN i IN (3,15,16,17,18,20,23) THEN 10
                WHEN i IN (7,25) THEN 1 WHEN i IN (8,9) THEN 3
                WHEN i = 19 THEN 2
                WHEN i = 10 AND d = 1 THEN n
                WHEN i = 13 AND d = 0 THEN 9999
                WHEN i = 14 AND d = n+1 THEN 9999
                WHEN i = 22 AND d = n THEN n
                ELSE 0 END;
            IF d IN (0,n+1) AND i NOT IN (13,14) THEN CONTINUE; END IF;
            IF portions = 0 THEN CONTINUE; END IF;
            at_time := CASE
                WHEN i = 13 THEN boundary
                WHEN i = 14 THEN history_start - interval '1 millisecond'
                WHEN i = 22 THEN history_start
                ELSE boundary - make_interval(days => d) + interval '12 hours' END;
            order_id := p || 'order_' || i || '_' || d;
            INSERT INTO orders (id_order, create_date, number, ready_at, creater_id)
            VALUES (order_id, at_time, 1 + ((i + d) % 99), least(at_time + interval '10 minutes', t), actor);
            INSERT INTO order_item (id_order_item, count, id_order, id_dish)
            VALUES (order_id || '_line', portions, order_id, dish_id);
            -- Общий продукт расходуется в двух рецептах: 3*2 + 4*1 = 10/день.
            IF i = 9 THEN
                INSERT INTO order_item (id_order_item, count, id_order, id_dish)
                VALUES (order_id || '_shared', 4, order_id, p || 'shared_dish');
            END IF;
            -- Фактического расхода здесь нет, но прогноз берёт полный рецепт.
            IF i = 7 THEN
                INSERT INTO order_item_exclusions (id_order_item, id_product)
                VALUES (order_id || '_line', product_id);
            ELSE
                quantity := norm * portions + CASE WHEN i = 9 THEN 4 ELSE 0 END;
                INSERT INTO batch (id_batch, count, exp, received_count, id_product, id_delivery)
                VALUES (order_id || '_batch', 0, at_time + interval '1 day', quantity, product_id, delivery_id);
                INSERT INTO stock_movement (id_stock_movement, count, create_date, id_batch, id_order, creater_id)
                VALUES (order_id || '_movement', quantity, at_time, order_id || '_batch', order_id, actor);
            END IF;
        END LOOP;

        -- История трёх видов списаний, отдельно от текущего остатка.
        FOR j IN 1..3 LOOP
            at_time := boundary - interval '6 hours';
            INSERT INTO batch (id_batch, count, exp, received_count, id_product, id_delivery)
            VALUES (p || 'loss_batch_' || i || '_' || j, 0,
                at_time + CASE WHEN j = 3 THEN interval '1 day' ELSE interval '-1 hour' END,
                j, product_id, delivery_id);
            INSERT INTO stock_movement (id_stock_movement, count, create_date, id_batch, creater_id)
            VALUES (p || 'loss_' || i || '_' || j, j, at_time,
                p || 'loss_batch_' || i || '_' || j, CASE WHEN j = 1 THEN NULL ELSE actor END);
        END LOOP;
    END LOOP;

    INSERT INTO stop_list (id_stop_list, type, created_at, id_dish, creater_id)
    VALUES (p || 'manual_stop', 'MANUAL', t, p || 'dish_17', actor);

    -- При включении отказов добавляется 3+4 порции в день.
    -- BUSY и строки blocked=false не должны влиять на прогноз.
    FOREACH i IN ARRAY ARRAY[19,21] LOOP
        FOR d IN 1..n LOOP
            FOR j IN 1..4 LOOP
                reason_value := CASE j WHEN 1 THEN 'STOP_LIST'::"RejectionReason"
                    WHEN 3 THEN 'BUSY'::"RejectionReason" ELSE 'SHORTAGE'::"RejectionReason" END;
                INSERT INTO order_rejections (id_order_rejection, create_date, reason, lines,
                                               details, waiter_name, waiter_id)
                VALUES (p || 'refusal_' || i || '_' || d || '_' || j,
                    boundary - make_interval(days => d) + interval '15 hours', reason_value,
                    jsonb_build_array(jsonb_build_object(
                        'dishId', p || 'dish_' || i, 'dishName', '[ТЕСТ ЗАКУПОК] Блюдо ' || i,
                        'count', CASE j WHEN 1 THEN 3 WHEN 2 THEN 4 ELSE 100 END,
                        'blocked', j < 3, 'excluded', jsonb_build_array())),
                    jsonb_build_object(
                        'stopped', CASE WHEN j = 1 THEN jsonb_build_array('[ТЕСТ ЗАКУПОК] Блюдо ' || i) ELSE '[]'::jsonb END,
                        'shortages', CASE WHEN j = 2 THEN jsonb_build_array(jsonb_build_object(
                            'productName', '[ТЕСТ ЗАКУПОК] ' || labels[i], 'unit', 'кг',
                            'need', '4.000', 'available', '0.000')) ELSE '[]'::jsonb END),
                    actor_name, actor);
            END LOOP;
        END LOOP;
    END LOOP;
    RAISE NOTICE 'Загружено: 25 продуктов, 24 блюда, 25 поставок; история за % завершённых дней.', n;
    RAISE NOTICE 'Ищите [ТЕСТ ЗАКУПОК]. Начало истории: %, конец: % UTC.', history_start, boundary;
    IF reserve = 0 THEN
        RAISE NOTICE 'Запас приготовления равен нулю: сценарий 16 будет просрочен, состояние «не успеть приготовить» невозможно.';
    END IF;
END
$demo$;
COMMIT;

-- Контроль загрузки. Значения count — текущие остатки, не объёмы поставок.
SELECT p.name_product AS "Сценарий", u.name AS "Единица",
       coalesce(sum(b.count),0) AS "Остаток всего, включая негодный"
FROM products p JOIN units u ON u.id_unit = p.id_unit
LEFT JOIN batch b ON b.id_product = p.id_product
WHERE starts_with(p.id_product, 'demo_procurement_v2_')
GROUP BY p.id_product, p.name_product, u.name ORDER BY p.name_product;
