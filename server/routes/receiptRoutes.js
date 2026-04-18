import express from 'express';
import ReceiptController from '../controllers/receiptController.js';
import tenantMiddleware from '../middleware/tenantMiddleware.js';

const router = express.Router();

router.get('/', tenantMiddleware, async (req, res, next) => {
    console.log('[GET /receipts] Tenant:', req.user?.tenant_id);
    try {
        await ReceiptController.getAllReceipts(req, res);
    } catch (err) {
        console.error('[GET /receipts] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/', tenantMiddleware, async (req, res, next) => {
    try {
        await ReceiptController.create(req, res);
    } catch (err) {
        next(err);
    }
});

router.get('/download/:id', tenantMiddleware, async (req, res, next) => {
    try {
        await ReceiptController.downloadPDF(req, res);
    } catch (err) {
        next(err);
    }
});

router.delete('/:id', tenantMiddleware, async (req, res, next) => {
    try {
        await ReceiptController.deleteReceipt(req, res);
    } catch (err) {
        next(err);
    }
});

export default router;