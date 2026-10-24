// js/game/boot.js — Запуск после загрузки страницы: сначала вход (js/auth.js), потом игра.

document.addEventListener("DOMContentLoaded", () => {
  Auth.start();   // вызывает Game.init() после успешного входа
});
