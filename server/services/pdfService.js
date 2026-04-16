import puppeteer from 'puppeteer';
import hbs from 'handlebars';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PDFService {
    /**
     * Get logo as base64 string
     * @returns {Promise<string>} - Base64 data URI of the logo
     */
    async getLogoBase64() {
        try {
            const logoPath = path.join(__dirname, '../templates/logo.jpg');
            const logoBuffer = await fs.readFile(logoPath);
            return `data:image/jpeg;base64,${logoBuffer.toString('base64')}`;
        } catch (error) {
            console.error('Failed to read logo.jpg:', error);
            return '';
        }
    }

    /**
     * Generate a PDF from a template and data
     * @param {string} templateName - Name of the template in templates folder
     * @param {object} data - Data to inject into template
     * @returns {Promise<Buffer>} - PDF buffer
     */
    async generateReceiptPDF(data) {
        let browser;
        try {
            const templatePath = path.join(__dirname, '../templates/receipt.html');
            const templateHtml = await fs.readFile(templatePath, 'utf8');
            
            // Compile template
            const template = hbs.compile(templateHtml);
            const html = template(data);

            browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();
            
            // Set content and wait for images/fonts
            await page.setContent(html, { waitUntil: 'networkidle0' });

            // Generate PDF
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    right: '20mm',
                    bottom: '20mm',
                    left: '20mm'
                }
            });

            return pdfBuffer;
        } catch (error) {
            console.error('PDF Generation Error:', error);
            throw new Error('Failed to generate PDF');
        } finally {
            if (browser) await browser.close();
        }
    }
}

export default new PDFService();
