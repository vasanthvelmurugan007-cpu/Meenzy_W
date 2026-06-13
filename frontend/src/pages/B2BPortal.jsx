import React, { useState, useEffect } from 'react';
import { api } from '../api';
import './B2BPortal.css'; // Let's use some inline or shared styles

function B2BPortal() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [orderSuccess, setOrderSuccess] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await api.b2b.products();
      setProducts(res);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleQtyChange = (name, qty) => {
    setCart({
      ...cart,
      [name]: Math.max(0, parseInt(qty) || 0)
    });
  };

  const submitOrder = async (e) => {
    e.preventDefault();
    const items = Object.keys(cart)
      .filter(k => cart[k] > 0)
      .map(k => ({ name: k, qty: cart[k] }));

    if (items.length === 0) {
      alert("Please add items to your wholesale order");
      return;
    }

    try {
      await api.b2b.order({
        businessName,
        phone,
        gstNumber,
        items
      });
      setOrderSuccess(true);
    } catch (err) {
      alert('Failed to place B2B order');
    }
  };

  if (loading) return <div className="b2b-loading">Loading B2B Portal...</div>;

  if (orderSuccess) {
    return (
      <div className="b2b-container">
        <div className="b2b-card text-center p-8">
          <h1 className="text-3xl text-green-600 font-bold mb-4">Order Received!</h1>
          <p className="text-gray-700">Thank you, {businessName}. Our wholesale manager will contact you at {phone} shortly to arrange delivery and invoicing.</p>
          <button onClick={() => window.location.reload()} className="mt-6 bg-blue-600 text-white px-4 py-2 rounded">Place Another Order</button>
        </div>
      </div>
    );
  }

  return (
    <div className="b2b-container">
      <div className="b2b-header">
        <h1>Meenzy B2B Wholesale Portal</h1>
        <p>Premium seafood for restaurants and hotels. Bulk pricing applied.</p>
      </div>

      <div className="b2b-content flex gap-8">
        <div className="b2b-products flex-1">
          <h2 className="text-xl font-bold mb-4">Today's Wholesale Catch</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {products.map(p => (
              <div key={p.name} className="b2b-product-card p-4 border rounded shadow-sm bg-white">
                <h3 className="font-bold text-lg">{p.name}</h3>
                <div className="text-sm text-gray-500 line-through">Retail: ₹{p.retail_price}/Kg</div>
                <div className="text-xl text-blue-600 font-bold">B2B Price: ₹{p.b2b_price}/Kg</div>
                <div className="text-xs text-gray-400 mb-4">Minimum order: {p.min_qty} Kg</div>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    min="0" 
                    step="5"
                    placeholder={`Qty (min ${p.min_qty})`}
                    className="border p-2 rounded w-full"
                    value={cart[p.name] || ''}
                    onChange={e => handleQtyChange(p.name, e.target.value)}
                  />
                  <span className="text-gray-600">Kg</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="b2b-checkout w-80 bg-white p-6 rounded shadow-sm border h-fit">
          <h2 className="text-xl font-bold mb-4">Business Details</h2>
          <form onSubmit={submitOrder} className="flex flex-col gap-4">
            <input 
              type="text" 
              placeholder="Business/Restaurant Name" 
              required
              className="border p-2 rounded"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
            />
            <input 
              type="text" 
              placeholder="Contact Phone Number" 
              required
              className="border p-2 rounded"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
            <input 
              type="text" 
              placeholder="GST Number (Optional)" 
              className="border p-2 rounded"
              value={gstNumber}
              onChange={e => setGstNumber(e.target.value)}
            />
            <button type="submit" className="bg-blue-600 text-white font-bold py-3 rounded mt-4 hover:bg-blue-700 transition">
              Submit Wholesale Order
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default B2BPortal;
