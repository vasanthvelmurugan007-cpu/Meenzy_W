import { useState, useEffect } from 'react';

export default function PublicCatalog() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({}); // { productId: quantity }
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const categoriesList = [
    { id: 'all', title: '🏷️ All' },
    { id: 'fishes', title: '🐟 Fishes' },
    { id: 'squid', title: '🦑 Squid' },
    { id: 'instant_buy', title: '🛍️ Instant Buy' },
    { id: 'combos', title: '📦 Combos' },
    { id: 'boneless', title: '🔪 Fillet (Boneless)' },
    { id: 'deep_fry_favorites', title: '🔥 Deep Fry Favorites' },
    { id: 'high_protein', title: '⚡ High Protein' },
    { id: 'lean_low_calorie', title: '🥗 Lean & Low-Calorie' },
    { id: 'shell_foods', title: '🦐 Shell Foods' }
  ];

  // Parse phone number and category from query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search || window.location.hash.split('?')[1]);
    const phoneParam = params.get('phone');
    if (phoneParam) {
      setPhone(phoneParam.replace(/\D/g, ''));
    }
    const catParam = params.get('category');
    if (catParam) {
      setActiveCategory(catParam);
    }
  }, []);

  // Fetch catalog products from the backend
  useEffect(() => {
    fetch('/api/public/catalog')
      .then(res => res.json())
      .then(data => {
        setProducts(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Catalog fetch error:', err);
        setLoading(false);
      });
  }, []);

  const updateQuantity = (productId, delta) => {
    setCart(prev => {
      const current = prev[productId] || 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  const getCartItems = () => {
    return Object.entries(cart).map(([id, qty]) => {
      const prod = products.find(p => p.id === id);
      return prod ? { ...prod, quantity: qty } : null;
    }).filter(Boolean);
  };

  const getCartTotal = () => {
    return getCartItems().reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);
  };

  const totalItemsCount = Object.values(cart).reduce((sum, q) => sum + q, 0);

  const handleCheckout = async () => {
    if (!phone) {
      alert('Please provide your WhatsApp phone number to register the preorder.');
      return;
    }
    setCheckingOut(true);
    try {
      const res = await fetch('/api/public/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone,
          items: getCartItems()
        })
      });
      if (res.ok) {
        setCheckoutSuccess(true);
        setCart({});
        setCartOpen(false);
      } else {
        alert('Checkout failed. Please try again.');
      }
    } catch (err) {
      console.error(err);
      alert('Checkout error.');
    } finally {
      setCheckingOut(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Sourcing today's fresh catches...</p>
      </div>
    );
  }

  if (checkoutSuccess) {
    return (
      <div style={styles.successContainer}>
        <div style={styles.successBadge}>✓</div>
        <h2 style={styles.successTitle}>Preorder Registered!</h2>
        <p style={styles.successMessage}>
          Your delicious catches are locked in. We have sent a detailed confirmation message to your WhatsApp number:
        </p>
        <div style={styles.phoneChip}>+{phone}</div>
        <p style={styles.successActionText}>
          Please check your WhatsApp to review your preorder summary and checkout!
        </p>
        <button style={styles.doneBtn} onClick={() => setCheckoutSuccess(false)}>
          Back to Catalog
        </button>
      </div>
    );
  }

  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter(p => p.categories.includes(activeCategory));

  return (
    <div style={styles.catalogWrapper}>
      {/* Header Banner */}
      <div style={styles.header}>
        <h1 style={styles.title}>🐟 MEENZY FRESH CATCH</h1>
        <p style={styles.subtitle}>Directly from the ocean nets to your kitchen tonight! 🌊</p>
        {!phone && (
          <div style={styles.phonePromptCard}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#f8f9fa' }}>WhatsApp Phone</span>
            <input 
              type="text" 
              placeholder="e.g. 919876543210" 
              value={phone} 
              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
              style={styles.phoneInput}
            />
          </div>
        )}
      </div>

      {/* Category Navigation Tabs */}
      <div style={styles.tabsContainer}>
        {categoriesList.map(cat => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                ...styles.tabBtn,
                background: isActive ? 'linear-gradient(90deg, #10b981, #059669)' : '#1e293b',
                color: isActive ? '#fff' : '#cbd5e0',
                border: isActive ? '1px solid #10b981' : '1px solid #334155',
                boxShadow: isActive ? '0 4px 10px rgba(16, 185, 129, 0.2)' : 'none'
              }}
            >
              {cat.title}
            </button>
          );
        })}
      </div>

      {/* Product List */}
      <div style={styles.productList}>
        {filteredProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
            <span style={{ fontSize: 40 }}>🐟</span>
            <p style={{ marginTop: 12, fontSize: 14 }}>No fresh catches in this category today. Check out other categories!</p>
          </div>
        ) : (
          filteredProducts.map(product => {
            const qty = cart[product.id] || 0;
            return (
              <div key={product.id} style={styles.productCard}>
                <div style={styles.productInfo}>
                  <h3 style={styles.productTitle}>{product.title}</h3>
                  <p style={styles.productDesc}>{product.description}</p>
                  <div style={styles.productFooter}>
                    <span style={styles.productPrice}>₹{product.price} <span style={{ fontSize: 11, color: '#a0aec0', fontWeight: 400 }}>/ Kg</span></span>
                    
                    {qty === 0 ? (
                      <button style={styles.addBtn} onClick={() => updateQuantity(product.id, 1)}>
                        Add +
                      </button>
                    ) : (
                      <div style={styles.qtyControl}>
                        <button style={styles.qtyBtn} onClick={() => updateQuantity(product.id, -1)}>-</button>
                        <span style={styles.qtyVal}>{qty}</span>
                        <button style={styles.qtyBtn} onClick={() => updateQuantity(product.id, 1)}>+</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Bottom Sticky Footer */}
      {totalItemsCount > 0 && (
        <div style={styles.stickyFooter} onClick={() => setCartOpen(true)}>
          <div style={styles.footerCartInfo}>
            <span style={styles.cartBadge}>{totalItemsCount}</span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>View your cart</span>
          </div>
          <span style={styles.footerTotal}>₹{getCartTotal().toFixed(2)} →</span>
        </div>
      )}

      {/* Cart Summary Side/Bottom Drawer Overlay */}
      {cartOpen && (
        <div style={styles.overlay} onClick={() => setCartOpen(false)}>
          <div style={styles.drawer} onClick={e => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <h3 style={{ margin: 0, fontSize: 18, color: '#f8f9fa' }}>🛒 Your Seafood Cart</h3>
              <button style={styles.closeBtn} onClick={() => setCartOpen(false)}>✕</button>
            </div>

            <div style={styles.drawerItems}>
              {getCartItems().map(item => (
                <div key={item.id} style={styles.drawerItem}>
                  <div style={styles.drawerItemLeft}>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: 14, color: '#f8f9fa' }}>{item.title}</h4>
                      <span style={{ fontSize: 12, color: '#cbd5e0' }}>₹{item.price} / Kg</span>
                    </div>
                  </div>

                  <div style={styles.drawerItemRight}>
                    <div style={styles.qtyControlMini}>
                      <button style={styles.qtyBtnMini} onClick={() => updateQuantity(item.id, -1)}>-</button>
                      <span style={styles.qtyValMini}>{item.quantity}</span>
                      <button style={styles.qtyBtnMini} onClick={() => updateQuantity(item.id, 1)}>+</button>
                    </div>
                    <span style={{ fontWeight: 600, minWidth: 60, textAlign: 'right', color: '#10b981' }}>
                      ₹{(parseFloat(item.price) * item.quantity).toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.drawerFooter}>
              <div style={styles.totalRow}>
                <span style={{ color: '#cbd5e0' }}>Grand Total:</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>₹{getCartTotal().toFixed(2)}</span>
              </div>
              
              {!phone && (
                <div style={{ marginBottom: 15 }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: '#cbd5e0', fontWeight: 600 }}>
                    Enter WhatsApp Phone to complete preorder:
                  </label>
                  <input 
                    type="text" 
                    placeholder="e.g. 919876543210" 
                    value={phone} 
                    onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                    style={styles.phoneInputDrawer}
                  />
                </div>
              )}

              <button 
                style={styles.checkoutBtn} 
                onClick={handleCheckout}
                disabled={checkingOut || !phone}
              >
                {checkingOut ? 'Registering...' : 'Confirm & Place Preorder 🚀'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  catalogWrapper: {
    maxWidth: 480,
    margin: '0 auto',
    background: '#0f172a',
    minHeight: '100vh',
    color: '#f1f5f9',
    position: 'relative',
    paddingBottom: 80,
    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
  },
  header: {
    background: 'linear-gradient(135deg, #1e293b, #0f172a)',
    padding: '24px 16px',
    textAlign: 'center',
    borderBottom: '1px solid #334155',
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    background: 'linear-gradient(90deg, #38bdf8, #10b981)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    margin: '8px 0 0 0',
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: '1.4',
  },
  tabsContainer: {
    display: 'flex',
    flexDirection: 'row',
    gap: 8,
    overflowX: 'auto',
    padding: '12px 16px',
    background: '#0f172a',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  tabBtn: {
    padding: '8px 16px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    outline: 'none',
    transition: 'all 0.2s ease',
  },
  phonePromptCard: {
    marginTop: 16,
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'flex-start',
  },
  phoneInput: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #475569',
    background: '#1e293b',
    color: '#fff',
    fontSize: 14,
    boxSizing: 'border-box',
    outline: 'none',
  },
  productList: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  productCard: {
    background: '#1e293b',
    borderRadius: 12,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'row',
    boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
    border: '1px solid #334155',
  },
  productImg: {
    width: 100,
    height: 100,
    objectFit: 'cover',
    borderRight: '1px solid #334155',
  },
  productInfo: {
    flex: 1,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  productTitle: {
    margin: '0 0 4px 0',
    fontSize: 15,
    fontWeight: 700,
    color: '#f8f9fa',
  },
  productDesc: {
    margin: '0 0 10px 0',
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: '1.3',
  },
  productFooter: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 700,
    color: '#10b981',
  },
  addBtn: {
    background: '#0284c7',
    color: '#fff',
    border: 'none',
    padding: '6px 16px',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  qtyControl: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    background: '#334155',
    borderRadius: 8,
    overflow: 'hidden',
  },
  qtyBtn: {
    background: '#475569',
    color: '#fff',
    border: 'none',
    width: 32,
    height: 32,
    fontSize: 16,
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  qtyVal: {
    padding: '0 12px',
    fontWeight: 700,
    fontSize: 14,
    color: '#f8f9fa',
  },
  stickyFooter: {
    position: 'fixed',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'calc(100% - 32px)',
    maxWidth: 448,
    background: 'linear-gradient(90deg, #10b981, #059669)',
    borderRadius: 14,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)',
    cursor: 'pointer',
    zIndex: 999,
    boxSizing: 'border-box',
    animation: 'slideUp 0.3s ease-out',
  },
  footerCartInfo: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cartBadge: {
    background: '#fff',
    color: '#10b981',
    fontWeight: 800,
    fontSize: 13,
    width: 24,
    height: 24,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerTotal: {
    fontSize: 16,
    fontWeight: 700,
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'rgba(0,0,0,0.6)',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
  },
  drawer: {
    width: '100%',
    maxWidth: 480,
    margin: '0 auto',
    background: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: '20px 16px',
    boxSizing: 'border-box',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 -10px 25px rgba(0,0,0,0.3)',
    borderTop: '1px solid #334155',
  },
  drawerHeader: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: 20,
    cursor: 'pointer',
  },
  drawerItems: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginBottom: 20,
  },
  drawerItem: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#0f172a',
    padding: 10,
    borderRadius: 8,
    border: '1px solid #334155',
  },
  drawerItemLeft: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  drawerImg: {
    width: 44,
    height: 44,
    objectFit: 'cover',
    borderRadius: 6,
  },
  drawerItemRight: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qtyControlMini: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    background: '#334155',
    borderRadius: 6,
    overflow: 'hidden',
  },
  qtyBtnMini: {
    background: '#475569',
    color: '#fff',
    border: 'none',
    width: 24,
    height: 24,
    fontSize: 12,
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  qtyValMini: {
    padding: '0 8px',
    fontWeight: 700,
    fontSize: 12,
    color: '#f8f9fa',
  },
  drawerFooter: {
    borderTop: '1px solid #334155',
    paddingTop: 16,
  },
  totalRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  phoneInputDrawer: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #475569',
    background: '#0f172a',
    color: '#fff',
    fontSize: 14,
    boxSizing: 'border-box',
    outline: 'none',
    marginBottom: 12,
  },
  checkoutBtn: {
    width: '100%',
    padding: '14px 0',
    background: 'linear-gradient(90deg, #10b981, #059669)',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
  },
  centerContainer: {
    minHeight: '100vh',
    background: '#0f172a',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#cbd5e0',
  },
  spinner: {
    border: '3px solid rgba(255, 255, 255, 0.1)',
    width: 36,
    height: 36,
    borderRadius: '50%',
    borderLeftColor: '#38bdf8',
    animation: 'spin 1s linear infinite',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: 500,
  },
  successContainer: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  successBadge: {
    background: 'rgba(16, 185, 129, 0.1)',
    color: '#10b981',
    border: '2px solid #10b981',
    width: 64,
    height: 64,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  successTitle: {
    margin: '0 0 12px 0',
    fontSize: 22,
    fontWeight: 800,
  },
  successMessage: {
    margin: '0 0 20px 0',
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: '1.5',
    maxWidth: 320,
  },
  phoneChip: {
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#38bdf8',
    padding: '8px 16px',
    borderRadius: 20,
    fontWeight: 700,
    fontSize: 15,
    marginBottom: 24,
  },
  successActionText: {
    fontSize: 12,
    color: '#a0aec0',
    marginBottom: 24,
    maxWidth: 300,
  },
  doneBtn: {
    padding: '12px 32px',
    background: '#334155',
    border: 'none',
    color: '#fff',
    borderRadius: 8,
    fontWeight: 600,
    cursor: 'pointer',
  }
};
