/**
 * BQ Receipt System - Create Receipt Logic
 */

import api from './api.js';

document.addEventListener('DOMContentLoaded', () => {
    const receiptForm = document.getElementById('receiptForm');
    const addItemBtn = document.getElementById('addItemBtn');
    const itemsContainer = document.getElementById('itemsContainer');
    
    if (addItemBtn) {
        addItemBtn.addEventListener('click', () => {
            const itemRow = document.createElement('div');
            itemRow.className = 'item-row animate-fade';
            itemRow.innerHTML = `
                <div class="form-group flex-1">
                    <input type="text" placeholder="Item Name" class="item-name" required>
                </div>
                <div class="form-group w-32">
                    <input type="number" placeholder="Qty" class="item-qty" min="1" required>
                </div>
                <div class="form-group w-32">
                    <input type="number" placeholder="Price" class="item-price" step="0.01" required>
                </div>
                <button type="button" class="btn-remove">&times;</button>
            `;
            itemsContainer.appendChild(itemRow);
        });
    }

    // Handle removal of items
    itemsContainer?.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove')) {
            e.target.parentElement.remove();
        }
    });

    // Handle form submission
    receiptForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const customerName = document.getElementById('customerName').value;
        const customerEmail = document.getElementById('customerEmail').value;
        const date = document.getElementById('receiptDate').value;
        
        const itemElements = document.querySelectorAll('.item-row');
        const items = Array.from(itemElements).map(row => ({
            name: row.querySelector('.item-name').value,
            quantity: parseInt(row.querySelector('.item-qty').value),
            price: parseFloat(row.querySelector('.item-price').value)
        }));

        const receiptData = {
            customer_name: customerName,
            customer_email: customerEmail,
            date: date,
            items: items.map(item => ({
                description: item.name,
                quantity: item.quantity,
                price: item.price,
                total: (item.quantity * item.price).toFixed(2)
            })),
            total_amount: items.reduce((sum, item) => sum + (item.quantity * item.price), 0).toFixed(2)
        };

        try {
            await api.receipts.create(receiptData);
            alert('Receipt generated successfully!');
            receiptForm.reset();
            // Clear items except first one if needed
        } catch (error) {
            alert('Failed to create receipt: ' + error.message);
        }
    });
});
