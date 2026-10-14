-- pgAdmin: выбрать базу проекта, открыть Query Tool, выполнить скрипт целиком.
-- 25 тестовых блюд, 750 заказов и 360 отказов за последние 30 дней.
-- Блюда находятся в корзине: они видны в статистике, но не в меню официанта.
-- Складские движения не создаются. Все заказы уже готовы.
-- Повторный запуск не дублирует записи за те же даты.

BEGIN;
SET LOCAL search_path TO public, pg_temp;

DO $demo_stats$
DECLARE
    actor_id TEXT;
    actor_name TEXT;
    utc_now TIMESTAMP := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    local_now TIMESTAMP := CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Simferopol';
    local_day DATE;
    day_key TEXT;
    day_seconds DOUBLE PRECISION;
    event_at TIMESTAMP;
    dish_id TEXT;
    order_id TEXT;
    reason_value "RejectionReason";
    dish_names TEXT[] := ARRAY[
        'Маргарита', 'Пепперони', 'Четыре сыра', 'Гавайская', 'Мясная',
        'Грибная', 'Цезарь с курицей', 'Греческий салат', 'Овощной салат',
        'Томатный суп', 'Грибной крем-суп', 'Куриный суп', 'Карбонара',
        'Болоньезе', 'Паста с грибами', 'Ризотто', 'Курица с рисом',
        'Котлеты с пюре', 'Картофель по-деревенски', 'Овощи гриль',
        'Сырники', 'Блины', 'Чизкейк', 'Тирамису', 'Яблочный пирог'
    ];
    d INTEGER;
    i INTEGER;
    j INTEGER;
    n INTEGER;
    other_n INTEGER;
    quantity INTEGER;
BEGIN
    -- Переиспользуем сотрудника, не создавая учётных записей и паролей.
    SELECT id, name INTO actor_id, actor_name
    FROM users
    ORDER BY CASE role WHEN 'WAITER' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END, id
    LIMIT 1;

    IF actor_id IS NULL THEN
        RAISE EXCEPTION 'В базе нет пользователей. Сначала создайте сотрудника в приложении.';
    END IF;

    FOR i IN 1..25 LOOP
        INSERT INTO dishes (id_dish, name, version, deleted_at)
        VALUES (
            'demo_stats_v1_dish_' || lpad(i::TEXT, 2, '0'),
            '[СТАТ-ТЕСТ] ' || dish_names[i], 1, utc_now
        )
        ON CONFLICT (id_dish) DO NOTHING;
    END LOOP;

    FOR d IN 0..29 LOOP
        local_day := local_now::DATE - d;
        day_key := to_char(local_day, 'YYYYMMDD');
        day_seconds := CASE WHEN d = 0
            THEN extract(epoch FROM (local_now - local_day::TIMESTAMP))
            ELSE 86400 END;

        -- По 25 заказов в день, по 1–3 позиции в каждом.
        FOR i IN 1..25 LOOP
            order_id := 'demo_stats_v1_order_' || day_key || '_' || i;
            event_at := (
                (local_day::TIMESTAMP + interval '1 second' * (day_seconds * i / 26.0))
                AT TIME ZONE 'Europe/Simferopol'
            ) AT TIME ZONE 'UTC';

            INSERT INTO orders (id_order, create_date, number, ready_at, creater_id)
            VALUES (
                order_id, event_at, 1 + ((d * 25 + i - 1) % 99),
                least(event_at + interval '20 minutes', utc_now), actor_id
            )
            ON CONFLICT (id_order) DO NOTHING;

            FOR j IN 1..(1 + ((i + d) % 3)) LOOP
                n := 1 + ((i - 1 + (j - 1) * 7 + d * 3) % 25);
                dish_id := 'demo_stats_v1_dish_' || lpad(n::TEXT, 2, '0');
                quantity := 1 + ((i * 3 + j + d * 2) % 5);

                INSERT INTO order_item (id_order_item, count, id_order, id_dish)
                VALUES (order_id || '_line_' || j, quantity, order_id, dish_id)
                ON CONFLICT (id_order_item) DO NOTHING;
            END LOOP;
        END LOOP;

        -- По 12 отказов в день: 6 STOP_LIST, 5 SHORTAGE и 1 BUSY.
        FOR i IN 1..12 LOOP
            n := 1 + ((i * 2 + d * 3) % 25);
            other_n := 1 + (n % 25);
            dish_id := 'demo_stats_v1_dish_' || lpad(n::TEXT, 2, '0');
            quantity := 1 + ((i + d * 2) % 6);
            reason_value := CASE
                WHEN i = 12 THEN 'BUSY'::"RejectionReason"
                WHEN i % 2 = 0 THEN 'SHORTAGE'::"RejectionReason"
                ELSE 'STOP_LIST'::"RejectionReason"
            END;
            event_at := (
                (local_day::TIMESTAMP + interval '1 second' * (day_seconds * i / 13.0))
                AT TIME ZONE 'Europe/Simferopol'
            ) AT TIME ZONE 'UTC';

            INSERT INTO order_rejections (
                id_order_rejection, create_date, reason, lines, details,
                waiter_name, waiter_id
            )
            VALUES (
                'demo_stats_v1_rejection_' || day_key || '_' || i,
                event_at, reason_value,
                jsonb_build_array(
                    jsonb_build_object(
                        'dishId', dish_id,
                        'dishName', '[СТАТ-ТЕСТ] ' || dish_names[n],
                        'count', quantity,
                        'blocked', reason_value <> 'BUSY'::"RejectionReason",
                        'excluded', jsonb_build_array()
                    ),
                    jsonb_build_object(
                        'dishId', 'demo_stats_v1_dish_' || lpad(other_n::TEXT, 2, '0'),
                        'dishName', '[СТАТ-ТЕСТ] ' || dish_names[other_n],
                        'count', 2,
                        'blocked', false,
                        'excluded', jsonb_build_array()
                    )
                ),
                jsonb_build_object(
                    'stopped', CASE WHEN reason_value = 'STOP_LIST'
                        THEN jsonb_build_array('[СТАТ-ТЕСТ] ' || dish_names[n])
                        ELSE jsonb_build_array() END,
                    'shortages', CASE WHEN reason_value = 'SHORTAGE'
                        THEN jsonb_build_array(jsonb_build_object(
                            'productName', '[СТАТ-ТЕСТ] Ингредиент',
                            'unit', 'кг', 'need', (quantity * 0.200)::TEXT,
                            'available', '0.100'
                        ))
                        ELSE jsonb_build_array() END
                ),
                actor_name, actor_id
            )
            ON CONFLICT (id_order_rejection) DO NOTHING;
        END LOOP;
    END LOOP;
END
$demo_stats$;

COMMIT;

-- Контроль результата: количество всех записей этого тестового набора.
SELECT 'Блюда' AS entity, count(*) AS total
FROM dishes WHERE starts_with(id_dish, 'demo_stats_v1_')
UNION ALL
SELECT 'Заказы', count(*) FROM orders WHERE starts_with(id_order, 'demo_stats_v1_')
UNION ALL
SELECT 'Позиции заказов', count(*) FROM order_item WHERE starts_with(id_order_item, 'demo_stats_v1_')
UNION ALL
SELECT 'Отказы', count(*) FROM order_rejections WHERE starts_with(id_order_rejection, 'demo_stats_v1_');
