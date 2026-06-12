-- Insert dummy orders into the database for testing the routing map

INSERT INTO coexistence.ecosystem_orders (id, wix_order_id, user_phone, total_price, status, address_line, payment_status)
VALUES 
  ('a1111111-1111-1111-1111-111111111111', 'TEST-001', '+919999999901', 599.00, 'VERIFIED_READY', 'Koramangala BDA Complex, Bengaluru, Karnataka 560034', 'PAID'),
  ('b2222222-2222-2222-2222-222222222222', 'TEST-002', '+919999999902', 299.00, 'VERIFIED_READY', 'Indiranagar 100 Ft Road, Bengaluru, Karnataka 560038', 'PAID'),
  ('c3333333-3333-3333-3333-333333333333', 'TEST-003', '+919999999903', 1099.00, 'VERIFIED_READY', 'Cubbon Park, Bengaluru, Karnataka 560001', 'PAID'),
  ('d4444444-4444-4444-4444-444444444444', 'TEST-004', '+919999999904', 199.00, 'VERIFIED_READY', 'MG Road Metro Station, Bengaluru, Karnataka 560001', 'PAID')
ON CONFLICT (wix_order_id) DO NOTHING;

INSERT INTO coexistence.ecosystem_order_items (order_id, product_name, quantity, price)
VALUES 
  ('a1111111-1111-1111-1111-111111111111', 'T-Shirt Black', 1, 599.00),
  ('b2222222-2222-2222-2222-222222222222', 'Mug', 1, 299.00),
  ('c3333333-3333-3333-3333-333333333333', 'Hoodie', 1, 1099.00),
  ('d4444444-4444-4444-4444-444444444444', 'Sticker Pack', 1, 199.00)
ON CONFLICT DO NOTHING;
