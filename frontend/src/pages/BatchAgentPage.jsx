import React, { useState } from 'react';
import { api } from '../api';
import { CheckCircle, AlertTriangle, RefreshCw, Send, Plus, Trash, PlusCircle } from 'lucide-react';
import { C, FONT } from '../constants';

export default function BatchAgentPage() {
  const [availableList, setAvailableList] = useState([
    { item: 'Seer Fish', quantity: 5.5 },
    { item: 'Pomfret', quantity: 10.0 },
    { item: 'Sardine', quantity: 12.0 }
  ]);

  const [unavailableList, setUnavailableList] = useState([
    {
      item: 'White Prawns',
      replacements: [
        { item_name: 'Seer Fish', price_in_inr: 950 },
        { item_name: 'Pomfret', price_in_inr: 850 }
      ]
    }
  ]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleProcess = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const availableInventory = {};
      availableList.forEach(a => {
        if (a.item.trim() !== '') {
          availableInventory[a.item.trim()] = parseFloat(a.quantity) || 0;
        }
      });
      
      const unavailableItemsWithReplacements = unavailableList.filter(u => u.item.trim() !== '').map(u => ({
        item: u.item.trim(),
        replacements: u.replacements.filter(r => r.item_name.trim() !== '').map(r => ({
          item_name: r.item_name.trim(),
          price_in_inr: parseFloat(r.price_in_inr) || 0
        }))
      }));

      const data = await api.meenzy.batchAgentProcess(availableInventory, unavailableItemsWithReplacements);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addAvailable = () => {
    setAvailableList([...availableList, { item: '', quantity: 0 }]);
  };

  const updateAvailable = (index, field, value) => {
    const newList = [...availableList];
    newList[index][field] = value;
    setAvailableList(newList);
  };

  const removeAvailable = (index) => {
    const newList = [...availableList];
    newList.splice(index, 1);
    setAvailableList(newList);
  };

  const addUnavailable = () => {
    setUnavailableList([...unavailableList, { item: '', replacements: [{ item_name: '', price_in_inr: 0 }] }]);
  };

  const updateUnavailableItem = (index, value) => {
    const newList = [...unavailableList];
    newList[index].item = value;
    setUnavailableList(newList);
  };

  const removeUnavailable = (index) => {
    const newList = [...unavailableList];
    newList.splice(index, 1);
    setUnavailableList(newList);
  };

  const addReplacement = (uIndex) => {
    const newList = [...unavailableList];
    newList[uIndex].replacements.push({ item_name: '', price_in_inr: 0 });
    setUnavailableList(newList);
  };

  const updateReplacement = (uIndex, rIndex, field, value) => {
    const newList = [...unavailableList];
    newList[uIndex].replacements[rIndex][field] = value;
    setUnavailableList(newList);
  };

  const removeReplacement = (uIndex, rIndex) => {
    const newList = [...unavailableList];
    newList[uIndex].replacements.splice(rIndex, 1);
    setUnavailableList(newList);
  };

  const inputStyle = {
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    fontSize: 14,
    fontFamily: FONT,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  };

  return (
    <div style={{ padding: 30, maxWidth: 800, margin: '0 auto', fontFamily: FONT }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, marginBottom: 8 }}>Morning Batch Agent</h1>
      <p style={{ color: C.textSecondary, marginBottom: 24 }}>
        Submit the physical catch data to automatically resolve all PENDING_CONFIRMATION preorders.
        Available items will be confirmed. Unavailable items will be swapped or cancelled.
      </p>

      {error && (
        <div style={{ padding: 16, background: '#fef2f2', color: '#991b1b', border: '1px solid #f87171', borderRadius: 8, marginBottom: 20 }}>
          <AlertTriangle size={16} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} />
          {error}
        </div>
      )}

      {result && (
        <div style={{ padding: 16, background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: 8, marginBottom: 20 }}>
          <CheckCircle size={16} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} />
          Batch process complete! <b>{result.confirmedCount}</b> orders confirmed and <b>{result.swappedCount}</b> orders pushed to swap menus.
        </div>
      )}

      <div style={{ background: C.cardBg, padding: 20, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: C.shadowSm, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 16 }}>1. Available Inventory</h2>
        <p style={{ fontSize: 13, color: C.textSecondary, marginBottom: 16 }}>Enter the items present in today's catch and their quantities in Kg.</p>
        
        {availableList.map((item, index) => (
          <div key={index} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
            <div style={{ flex: 2 }}>
              <input 
                placeholder="Fish Name (e.g. Sardine)" 
                value={item.item}
                onChange={e => updateAvailable(index, 'item', e.target.value)}
                style={inputStyle} 
              />
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <input 
                type="number"
                placeholder="0.0" 
                value={item.quantity === 0 ? '' : item.quantity}
                onChange={e => updateAvailable(index, 'quantity', e.target.value)}
                style={{...inputStyle, paddingRight: 36}} 
                step="0.1"
              />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: C.textSecondary }}>Kg</span>
            </div>
            <button 
              onClick={() => removeAvailable(index)}
              style={{ background: '#fee2e2', color: '#b91c1c', border: 'none', width: 36, height: 36, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Trash size={16} />
            </button>
          </div>
        ))}
        <button 
          onClick={addAvailable}
          style={{ background: 'transparent', color: C.primary, border: `1px dashed ${C.primary}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}
        >
          <Plus size={16} /> Add Inventory Item
        </button>
      </div>

      <div style={{ background: C.cardBg, padding: 20, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: C.shadowSm, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 16 }}>2. Unavailable Items & Replacements</h2>
        <p style={{ fontSize: 13, color: C.textSecondary, marginBottom: 16 }}>Define missing items and their dynamic replacement options.</p>
        
        {unavailableList.map((uItem, uIndex) => (
          <div key={uIndex} style={{ background: C.bg, padding: 16, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, marginBottom: 4, textTransform: 'uppercase' }}>Missing Fish Name</div>
                <input 
                  placeholder="e.g. White Prawns" 
                  value={uItem.item}
                  onChange={e => updateUnavailableItem(uIndex, e.target.value)}
                  style={inputStyle} 
                />
              </div>
              <button 
                onClick={() => removeUnavailable(uIndex)}
                style={{ background: '#fee2e2', color: '#b91c1c', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginTop: 18 }}
              >
                <Trash size={16} /> Remove Group
              </button>
            </div>
            
            <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, marginBottom: 8, textTransform: 'uppercase' }}>Replacement Options</div>
              {uItem.replacements.map((rItem, rIndex) => (
                <div key={rIndex} style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center' }}>
                  <div style={{ flex: 2 }}>
                    <input 
                      placeholder="Replacement Fish Name" 
                      value={rItem.item_name}
                      onChange={e => updateReplacement(uIndex, rIndex, 'item_name', e.target.value)}
                      style={inputStyle} 
                    />
                  </div>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: C.textSecondary }}>₹</span>
                    <input 
                      type="number"
                      placeholder="0" 
                      value={rItem.price_in_inr === 0 ? '' : rItem.price_in_inr}
                      onChange={e => updateReplacement(uIndex, rIndex, 'price_in_inr', e.target.value)}
                      style={{...inputStyle, paddingLeft: 24, paddingRight: 36}} 
                    />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: C.textSecondary }}>/Kg</span>
                  </div>
                  <button 
                    onClick={() => removeReplacement(uIndex, rIndex)}
                    style={{ background: 'transparent', color: '#6b7280', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Trash size={16} />
                  </button>
                </div>
              ))}
              <button 
                onClick={() => addReplacement(uIndex)}
                style={{ background: 'transparent', color: '#4f46e5', border: 'none', padding: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}
              >
                <PlusCircle size={14} /> Add Replacement
              </button>
            </div>
          </div>
        ))}

        <button 
          onClick={addUnavailable}
          style={{ background: 'transparent', color: C.primary, border: `1px dashed ${C.primary}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={16} /> Add Missing Fish Group
        </button>
      </div>

      <button 
        onClick={handleProcess}
        disabled={loading}
        style={{
          width: '100%', padding: '14px', background: '#2563eb', color: '#fff', borderRadius: 8,
          border: 'none', fontSize: 16, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, opacity: loading ? 0.7 : 1
        }}
      >
        {loading ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
        {loading ? 'Processing Batch...' : 'Run Morning Batch Process'}
      </button>

    </div>
  );
}
