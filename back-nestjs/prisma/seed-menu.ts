import { PrismaClient } from '@prisma/client'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// Стартовое меню ресторана: 15 блюд с фото, продукты, рецептуры и одна поставка.
// Повторный запуск ничего не дублирует и не трогает правки менеджера:
// существующие продукты, блюда, состав и фото остаются как есть, поставка заводится один раз.

const IMAGES_SRC = join(__dirname, 'seed-images')
// Тот же путь, что DISH_IMAGES_DIR в src/manager/dishes/dish-image.storage.ts
const IMAGES_DIR = join(process.cwd(), 'uploads', 'dishes')
const IMAGES_URL = '/uploads/dishes'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

type Unit = 'кг' | 'л' | 'шт'
// [ключ, название, единица, партии: [количество, срок годности от момента сида в мс]]
const PRODUCTS: [string, string, Unit, [string, number][]][] = [
	['spaghetti', 'Спагетти', 'кг', [['5', 60 * DAY]]],
	['bacon', 'Бекон', 'кг', [['1.5', 4 * DAY]]],
	['parmesan', 'Пармезан', 'кг', [['1', 20 * DAY]]],
	['beet', 'Свёкла', 'кг', [['4', 14 * DAY]]],
	['cabbage', 'Капуста белокочанная', 'кг', [['4', 10 * DAY]]],
	['potato', 'Картофель', 'кг', [['15', 20 * DAY]]],
	['beef', 'Говядина', 'кг', [['3', 3 * DAY]]],
	['sourcream', 'Сметана', 'кг', [['1.5', 30 * HOUR]]],
	['quark', 'Творог', 'кг', [['3', 20 * HOUR]]],
	['flour', 'Мука', 'кг', [['5', 90 * DAY]]],
	['salmon', 'Лосось', 'кг', [['1.6', 40 * HOUR]]],
	['iceberg', 'Салат айсберг', 'кг', [['1.5', 3 * DAY]]],
	['cucumber', 'Огурцы', 'кг', [['2', 5 * DAY]]],
	['avocado', 'Авокадо', 'шт', [['10', 4 * DAY]]],
	['chicken', 'Куриное филе', 'кг', [['3', 60 * HOUR]]],
	['romaine', 'Салат романо', 'кг', [['1.5', 3 * DAY]]],
	['baguette', 'Багет', 'кг', [['1', 2 * DAY]]],
	['pork', 'Свинина', 'кг', [['2', 4 * DAY]]],
	// Просроченная партия — видна в сигналах склада, кухня её списывает
	['mushrooms', 'Шампиньоны', 'кг', [['0.5', -DAY], ['3', 4 * DAY]]],
	['onion', 'Лук репчатый', 'кг', [['5', 30 * DAY]]],
	['ribeye', 'Говядина рибай', 'кг', [['4.5', 5 * DAY]]],
	['butter', 'Масло сливочное', 'кг', [['2', 20 * DAY]]],
	['mince', 'Говяжий фарш', 'кг', [['3', 2 * DAY]]],
	['cheddar', 'Сыр чеддер', 'кг', [['1', 30 * DAY]]],
	['tomato', 'Помидоры', 'кг', [['2', 5 * DAY]]],
	['arborio', 'Рис арборио', 'кг', [['3', 180 * DAY]]],
	['porcini', 'Белые грибы', 'кг', [['1.2', 3 * DAY]]],
	['caviar', 'Икра красная', 'кг', [['0.5', 10 * DAY]]],
	['shrimp', 'Креветки', 'кг', [['1.5', 36 * HOUR]]],
	['tomyumpaste', 'Паста том ям', 'кг', [['0.5', 60 * DAY]]],
	['jasmine', 'Рис жасмин', 'кг', [['3', 180 * DAY]]],
	['creamcheese', 'Сливочный сыр', 'кг', [['2.4', 7 * DAY]]],
	['shortbread', 'Печенье песочное', 'кг', [['1', 30 * DAY]]],
	['mascarpone', 'Маскарпоне', 'кг', [['2', 6 * DAY]]],
	['savoiardi', 'Печенье савоярди', 'кг', [['1', 60 * DAY]]],
	['cocoa', 'Какао', 'кг', [['0.3', 180 * DAY]]],
	// Две партии: FEFO сначала спишет раннюю
	['cream', 'Сливки 33%', 'л', [['0.8', 18 * HOUR], ['2', 5 * DAY]]],
	['oil', 'Масло растительное', 'л', [['5', 120 * DAY]]],
	['milk', 'Молоко', 'л', [['3', 4 * DAY]]],
	['coconut', 'Кокосовое молоко', 'л', [['3', 90 * DAY]]],
	['espresso', 'Кофе эспрессо', 'л', [['1', 2 * DAY]]],
	['caesar', 'Соус цезарь', 'л', [['1', 10 * DAY]]],
	['eggs', 'Яйца', 'шт', [['60', 14 * DAY]]],
	['bun', 'Булочка для бургера', 'шт', [['20', 2 * DAY]]]
]

// [ключ = имя файла фото, название, состав на порцию: [продукт, количество]]
const DISHES: [string, string, [string, string][]][] = [
	['pasta-carbonara', 'Паста карбонара', [['spaghetti', '0.12'], ['bacon', '0.06'], ['cream', '0.08'], ['eggs', '1'], ['parmesan', '0.03']]],
	['borscht', 'Борщ', [['beet', '0.08'], ['cabbage', '0.07'], ['potato', '0.08'], ['beef', '0.1'], ['sourcream', '0.03']]],
	['syrniki', 'Сырники', [['quark', '0.15'], ['eggs', '1'], ['flour', '0.03'], ['sourcream', '0.04']]],
	['salmon-salad', 'Салат с лососем', [['salmon', '0.08'], ['iceberg', '0.06'], ['cucumber', '0.05'], ['avocado', '0.5']]],
	['french-fries', 'Картофель фри', [['potato', '0.2'], ['oil', '0.05']]],
	['caesar-chicken', 'Цезарь с курицей', [['chicken', '0.12'], ['romaine', '0.08'], ['parmesan', '0.02'], ['baguette', '0.04'], ['caesar', '0.04']]],
	['pelmeni', 'Пельмени', [['flour', '0.1'], ['beef', '0.08'], ['pork', '0.06'], ['sourcream', '0.03']]],
	['mushroom-soup', 'Грибной крем-суп', [['mushrooms', '0.12'], ['cream', '0.1'], ['potato', '0.05'], ['onion', '0.03']]],
	['ribeye-steak', 'Стейк рибай', [['ribeye', '0.3'], ['butter', '0.02']]],
	['classic-burger', 'Бургер классический', [['bun', '1'], ['mince', '0.15'], ['cheddar', '0.03'], ['tomato', '0.04'], ['iceberg', '0.02']]],
	['porcini-risotto', 'Ризотто с белыми грибами', [['arborio', '0.09'], ['porcini', '0.06'], ['cream', '0.05'], ['parmesan', '0.03'], ['butter', '0.02']]],
	['blini-caviar', 'Блины с икрой', [['flour', '0.06'], ['milk', '0.12'], ['eggs', '1'], ['caviar', '0.03'], ['sourcream', '0.03']]],
	['tom-yum', 'Том ям', [['shrimp', '0.1'], ['mushrooms', '0.05'], ['coconut', '0.15'], ['tomyumpaste', '0.02'], ['jasmine', '0.08']]],
	['ny-cheesecake', 'Чизкейк Нью-Йорк', [['creamcheese', '0.12'], ['shortbread', '0.04'], ['cream', '0.04'], ['eggs', '1']]],
	['tiramisu', 'Тирамису', [['mascarpone', '0.1'], ['savoiardi', '0.05'], ['espresso', '0.03'], ['eggs', '1'], ['cocoa', '0.005']]]
]

const productId = (key: string) => `menu_p_${key}`
const dishId = (key: string) => `menu_d_${key}`
const DELIVERY_ID = 'menu_delivery_start'

export async function seedMenu(prisma: PrismaClient) {
	const units = new Map<Unit, string>()
	for (const name of ['кг', 'л', 'шт'] as Unit[]) {
		const unit = await prisma.unit.upsert({ where: { name }, update: {}, create: { name } })
		units.set(name, unit.id)
	}

	for (const [key, name, unit] of PRODUCTS) {
		await prisma.product.upsert({
			where: { id: productId(key) },
			update: {},
			create: { id: productId(key), nameProduct: name, idUnit: units.get(unit)! }
		})
	}

	await mkdir(IMAGES_DIR, { recursive: true })
	for (const [key, name, recipe] of DISHES) {
		const file = `seed-${key}.jpg`
		// Файл копируем всегда: папка uploads не в git и на новом сервере пустая
		await copyFile(join(IMAGES_SRC, `${key}.jpg`), join(IMAGES_DIR, file))

		const dish = await prisma.dish.upsert({
			where: { id: dishId(key) },
			update: {},
			create: {
				id: dishId(key),
				name,
				image: `${IMAGES_URL}/${file}`,
				ingredients: {
					create: recipe.map(([product, count]) => ({ idProduct: productId(product), count }))
				}
			},
			select: { image: true }
		})
		// Фото, которое поставил менеджер, не перезаписываем
		if (!dish.image) {
			await prisma.dish.update({ where: { id: dishId(key) }, data: { image: `${IMAGES_URL}/${file}` } })
		}
	}

	// Стартовую поставку заводим один раз, иначе каждый сид добавлял бы остатки
	if (await prisma.delivery.findUnique({ where: { id: DELIVERY_ID } })) return

	const manager = await prisma.user.findUniqueOrThrow({ where: { login: 'manager' } })
	const supplier = await prisma.supplier.upsert({
		where: { nameKey: 'стартовый склад' },
		update: {},
		create: { name: 'Стартовый склад', nameKey: 'стартовый склад' }
	})
	const now = Date.now()

	await prisma.delivery.create({
		data: {
			id: DELIVERY_ID,
			number: 'СТАРТ-1',
			supplierId: supplier.id,
			createrId: manager.id,
			batches: {
				create: PRODUCTS.flatMap(([key, name, unit, batches]) =>
					batches.map(([count, ttl]) => ({
						idProduct: productId(key),
						count,
						receivedCount: count,
						EXP: new Date(now + ttl),
						productNameAtReceipt: name,
						unitNameAtReceipt: unit
					}))
				)
			}
		}
	})
}
