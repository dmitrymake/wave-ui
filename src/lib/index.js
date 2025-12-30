// 1. Экспортируем всё для MPD (управление)
// Убедитесь, что в lib/mpd/index.js больше НЕТ syncLibrary
export * from "./mpd";

// 2. Экспортируем всё для API (синхронизация)
export { ApiActions } from "./api";

// Helper для удобного импорта одиночной функции
import { ApiActions } from "./api";
export const syncLibrary = ApiActions.syncLibrary;
