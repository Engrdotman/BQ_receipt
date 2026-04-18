import ReceiptService from '../services/receiptService.js';
import pdfService from '../services/pdfService.js';

class ReceiptController {
    static async getAllReceipts(req, res) {
        try {
            const tenantDb = req.tenantDb;
            const receipts = await ReceiptService.findAll(tenantDb);
            console.log('[getAllReceipts] Found:', receipts.length);
            res.json(receipts);
        } catch (error) {
            console.error('[getAllReceipts] Error:', error.message);
            res.status(500).json({ error: 'Failed to fetch receipts: ' + error.message });
        }
    }

    static async create(req, res) {
        try {
            const { customer_name, customer_email, customer_phone, customer_address, payment_method, items, total_amount } = req.body;
            
            if (!customer_name || !customer_email || !items || !total_amount || !customer_phone || !customer_address || !payment_method) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const tenantDb = req.tenantDb;
            const receipt_id = `BQ-${Date.now()}`;
            const newReceipt = await ReceiptService.create(tenantDb, {
                receipt_id,
                customer_name,
                customer_email,
                customer_phone,
                customer_address,
                payment_method,
                items,
                total_amount
            });
            console.log('[create] Receipt:', receipt_id);

            res.status(201).json(newReceipt);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to create receipt' });
        }
    }

    static async downloadPDF(req, res) {
        try {
            const { id } = req.params;
            const tenantDb = req.tenantDb;
            const receipt = await ReceiptService.findById(tenantDb, id);

            if (!receipt) {
                return res.status(404).json({ error: 'Receipt not found' });
            }

            const items = Array.isArray(receipt.items) 
                ? receipt.items.map(item => ({
                    description: item.name || item.description || 'Item',
                    quantity: item.qty || item.quantity || 1,
                    price: parseFloat(item.price || 0),
                    total: (item.qty || 1) * parseFloat(item.price || 0),
                    imei: item.imei || null
                }))
                : [];

            const formatCurrency = (amount) => {
                const num = parseFloat(amount);
                return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            };

            const templateData = {
                receipt_id: receipt.receipt_id,
                date: new Date(receipt.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                customer_name: receipt.customer_name,
                customer_email: receipt.customer_email,
                customer_phone: receipt.customer_phone,
                customer_address: receipt.customer_address,
                payment_method: receipt.payment_method,
                imei_number: receipt.imei_number || 'N/A',
                items: items,
                subtotal: formatCurrency(receipt.total_amount),
                total_amount: formatCurrency(receipt.total_amount),
                logo_base64: await pdfService.getLogoBase64(),
                bq_sign_base64: await pdfService.getSign2Base64()
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
            const tenantDb = req.tenantDb;
            const deleted = await ReceiptService.delete(tenantDb, id);
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