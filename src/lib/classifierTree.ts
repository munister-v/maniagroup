/**
 * Real Intertop classifier reference for the "Одяг" vertical — extracted
 * verbatim from a genuine odezda.xlsx partner export (2026-07-10, ~4100
 * offer rows / ~1600 products) by counting actual (Вид товара, Підвид) pairs.
 * "Вид товара" plays the role of our own `products.category`; "Підвид" is
 * the new, more specific `products.subtype` level (see pg.ts/products.ts).
 *
 * This is Intertop's own reference vocabulary, not fabricated — every
 * category/subtype pair below is backed by at least one real row in that
 * file. A single stray "Сандалії" row with no subtype was dropped as a
 * one-off data anomaly (footwear showing up in a clothing export), not a
 * genuine category. Subtypes are ordered by real frequency (most common
 * first) so the admin sees the likely choice at the top of each list.
 */
export const CLASSIFIER_TREE: { category: string; subtypes: string[] }[] = [
  { category: "Футболки і поло", subtypes: ["Футболка", "Поло", "Майка", "Топ"] },
  { category: "Штани", subtypes: ["Повсякденні штани", "Спортивні штани", "Класичні штани", "Палаццо", "Чіноси", "Карго", "Джогери", "Кюлоти"] },
  { category: "Светри та кардигани", subtypes: ["Джемпер", "Гольф", "Светр", "Кардиган", "Жилет"] },
  { category: "Джинси", subtypes: ["Прямі джинси", "Джинси кльош", "Завужені джинси", "Широкі джинси", "Скіні джинси", "Джинси мом", "Бойфренди"] },
  { category: "Куртки та дублянки", subtypes: ["Зимова куртка", "Пуховик", "Демісезонна куртка", "Утеплений жилет", "Парка", "Куртка-сорочка", "Шкіряна куртка", "Вітровка", "Джинсова куртка", "Бомбер", "Штучне хутро", "Дублянка"] },
  { category: "Худі та світшоти", subtypes: ["Спортивна кофта", "Світшот", "Худі", "Кофта", "Лонгслів"] },
  { category: "Шорти", subtypes: ["Повсякденні шорти", "Джинсові шорти", "Спортивні шорти"] },
  { category: "Сорочки", subtypes: ["Сорочка повсякденна", "Блуза"] },
  { category: "Костюми", subtypes: ["Спортивний костюм", "Повсякденний костюм", "Діловий костюм"] },
  { category: "Сукні", subtypes: ["Сукня міні", "Сукня міді", "Сукня максі", "Сарафан"] },
  { category: "Піджаки", subtypes: ["Піджак", "Жакет", "Блейзер"] },
  { category: "Спідниці", subtypes: ["Спідниця міді", "Спідниця міні", "Джинсова спідниця", "Спідниця максі"] },
  { category: "Одяг для пляжу", subtypes: ["Шорти для плавання", "Купальник"] },
  { category: "Пальта та плащі", subtypes: ["Пальто", "Тренч", "Плащ"] },
  { category: "Комбінезони", subtypes: ["Комбінезон", "Джинсовий комбінезон"] },
  { category: "Нижня білизна", subtypes: ["Труси"] },
  { category: "Боді та корсети", subtypes: ["Боді"] },
];
