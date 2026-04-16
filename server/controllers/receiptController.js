import Receipt from '../models/Receipt.js';
import pdfService from '../services/pdfService.js';

class ReceiptController {
    static async getAllReceipts(req, res) {
        try {
            const receipts = await Receipt.findAll();
            res.json(receipts);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to fetch receipts' });
        }
    }

    static async create(req, res) {
        try {
            const { customer_name, customer_email, customer_phone, customer_address, payment_method, imei_number, items, total_amount } = req.body;
            
            // Basic validation for security/integrity
            if (!customer_name || !customer_email || !items || !total_amount || !customer_phone || !customer_address || !payment_method || !imei_number) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const receipt_id = `BQ-${Date.now()}`;
            const newReceipt = await Receipt.create({
                receipt_id,
                customer_name,
                customer_email,
                customer_phone,
                customer_address,
                payment_method,
                imei_number,
                items,
                total_amount
            });

            res.status(201).json(newReceipt);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to create receipt' });
        }
    }

    static async downloadPDF(req, res) {
        try {
            const { id } = req.params;
            const receipt = await Receipt.findById(id);

            if (!receipt) {
                return res.status(404).json({ error: 'Receipt not found' });
            }

            // Prepare data for template
            const templateData = {
                receipt_id: receipt.receipt_id,
                date: new Date(receipt.created_at).toLocaleDateString(),
                customer_name: receipt.customer_name,
                customer_email: receipt.customer_email,
                customer_phone: receipt.customer_phone,
                customer_address: receipt.customer_address,
                payment_method: receipt.payment_method,
                imei_number: receipt.imei_number,
                items: receipt.items,
                subtotal: receipt.total_amount,
                total_amount: receipt.total_amount,
                logo_base64: await pdfService.getLogoBase64()
            };

            const pdfBuffer = await pdfService.generateReceiptPDF(templateData);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=receipt-${receipt.receipt_id}.pdf`);
            res.send(pdfBuffer);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to generate PDF' });
        }
    }

    static async deleteReceipt(req, res) {
        try {
            const { id } = req.params;
            const deleted = await Receipt.delete(id);
            if (!deleted) {
                return res.status(404).json({ error: 'Receipt not found' });
            }
            res.json({ message: 'Receipt deleted successfully' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to delete receipt' });
        }
    }
}

export default ReceiptController;
