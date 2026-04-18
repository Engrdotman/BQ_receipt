import express from 'express';
import { login, forgotPassword, resetPassword, masterLogin } from '../controllers/authController.js';

const router = express.Router();

router.post('/login', async (req, res, next) => {
    try {
        await login(req, res);
    } catch (error) {
        next(error);
    }
});

router.post('/master-login', async (req, res, next) => {
    try {
        await masterLogin(req, res);
    } catch (error) {
        next(error);
    }
});

router.post('/forgot-password', async (req, res, next) => {
    try {
        await forgotPassword(req, res);
    } catch (error) {
        next(error);
    }
});

router.post('/reset-password', async (req, res, next) => {
    try {
        await resetPassword(req, res);
    } catch (error) {
        next(error);
    }
});

export default router;