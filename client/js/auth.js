import { auth, logout } from './api.js';

export const checkAuth = (redirect = true) => {
    if (!auth.isAuthenticated()) {
        if (redirect) {
            window.location.href = 'login.html';
        }
        return false;
    }
    return true;
};

export const getUser = () => auth.getCurrentUser();

export const login = async (username, password) => {
    return await auth.login({ username, password });
};

export const handleLogout = () => {
    logout();
};

export const initAuthUI = () => {
    const user = getUser();
    if (user) {
        const userEl = document.getElementById('userName');
        if (userEl) userEl.textContent = user.username;
    }
};

export default { checkAuth, getUser, login, handleLogout, initAuthUI };