// js/game/profile.js — Профиль: ник, аватар, трейд-ссылка, пополнение баланса.

Object.assign(Game, {
  saveSettings(name, avatar) {
    const prevName = this.profileName, prevAvatar = this.avatar;
    this.profileName = (name || "").trim().slice(0, 20) || "Игрок";
    if (avatar !== undefined) this.avatar = avatar;
    if (this.profileName !== prevName) this.stats.nameChanged = true;
    if (avatar !== undefined && this.avatar !== prevAvatar) this.stats.avatarChanged = true;
    this.save();
    UI.updateProfileChip(this.profileName, this.avatar);
    UI.closeModal();
    this.refreshCurrentView();
  },

  setProfileName(name) {
    const prevName = this.profileName;
    this.profileName = (name || "").trim() || "Игрок";
    if (this.profileName !== prevName) this.stats.nameChanged = true;
    this.save();
    UI.updateProfileChip(this.profileName);
    UI.renderProfile(this);
  },

  deposit(amount) {
    this.balance += amount;
    const st = this.stats;
    st.depCount++;
    st.depTotal += amount;
    st.depMax = Math.max(st.depMax, amount);
    st.deposits = [{ amount, at: Date.now() }, ...st.deposits].slice(0, 10);
    this.save();
    UI.updateBalance(this.balance);
    UI.closeModal();
    UI.toast(`Баланс пополнен на ${UI.fmt(amount)} ₽`, "success");
    this.refreshCurrentView();
  },
});
