// ======================
// СОХРАНЕНИЯ
// ======================

const STORAGE_KEY = "case_naebattle_save";

function saveGame(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Не удалось сохранить игру:", e);
  }
  if (typeof Auth !== "undefined") Auth.queueSave(state);   // копия на сервер (js/auth.js)
}

function loadGame() {
  // после входа сохранение приходит с сервера (js/auth.js); localStorage — запасной путь
  if (typeof Auth !== "undefined" && Auth.initialSave !== undefined) return Auth.initialSave;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn("Не удалось загрузить игру:", e);
  }
  return null;
}

// Полный сброс прогресса. Не вызывается из интерфейса: из консоли браузера — clearSave(); location.reload();
function clearSave() {
  localStorage.removeItem(STORAGE_KEY);
}