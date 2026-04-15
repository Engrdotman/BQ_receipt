import express from 'express';
import ReceiptController from '../controllers/receiptController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', ReceiptController.getAllReceipts);
router.post('/', authMiddleware, ReceiptController.create);
router.get('/:id/download', authMiddleware, ReceiptController.downloadPDF);
router.delete('/:id', authMiddleware, ReceiptController.deleteReceipt);

export default router;
