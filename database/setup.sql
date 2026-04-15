//create database BQ_receiptdb
CREATE DATABASE BQ_receiptdb;
\c BQ_receiptdb;
CREATE TABLE IF NOT EXISTS receipts (
  id SERIAL PRIMARY KEY,
  receipt_id VARCHAR(50) UNIQUE,
  customer_name TEXT,
  customer_email TEXT,
  items JSONB,
  total_amount DECIMAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);