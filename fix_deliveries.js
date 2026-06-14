const fs = require('fs');

let content = fs.readFileSync('frontend/src/pages/DeliveriesPage.jsx', 'utf-8');

// Replace sort and grouping logic
const sortOld = `  // Sort orders by Pincode first, then by Agent Name
  const sortedOrders = [...orders].sort((a, b) => {
    const pinA = getPincode(a.address_line);
    const pinB = getPincode(b.address_line);
    if (pinA !== pinB) return pinA.localeCompare(pinB);
    
    const agentA = getAgentName(a.assigned_agent_id);
    const agentB = getAgentName(b.assigned_agent_id);
    return agentA.localeCompare(agentB);
  });

  const ordersByPincode = {};
  sortedOrders.forEach(o => {
    const pin = getPincode(o.address_line);
    if (!ordersByPincode[pin]) ordersByPincode[pin] = [];
    ordersByPincode[pin].push(o);
  });
  const pincodes = Object.keys(ordersByPincode).sort();`;

const sortNew = `  const getDateString = (dateStr) => {
    if (!dateStr) return 'Unknown Date';
    return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Sort orders by Date first, then Pincode, then Agent
  const sortedOrders = [...orders].sort((a, b) => {
    const dateA = new Date(a.created_at).setHours(0,0,0,0);
    const dateB = new Date(b.created_at).setHours(0,0,0,0);
    if (dateA !== dateB) return dateB - dateA;

    const pinA = getPincode(a.address_line);
    const pinB = getPincode(b.address_line);
    if (pinA !== pinB) return pinA.localeCompare(pinB);
    
    const agentA = getAgentName(a.assigned_agent_id);
    const agentB = getAgentName(b.assigned_agent_id);
    return agentA.localeCompare(agentB);
  });

  const datesList = Array.from(new Set(sortedOrders.map(o => getDateString(o.created_at))));
  const ordersByDate = {};
  
  sortedOrders.forEach(o => {
    const dStr = getDateString(o.created_at);
    if (!ordersByDate[dStr]) ordersByDate[dStr] = {};
    
    const pin = getPincode(o.address_line);
    if (!ordersByDate[dStr][pin]) ordersByDate[dStr][pin] = [];
    ordersByDate[dStr][pin].push(o);
  });`;

content = content.replace(sortOld, sortNew);

// Replace mapping logic
const tableOld = `      {/* All Orders Table grouped by Pincode */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {pincodes.length === 0 ? (
          <div style={{ background: C.cardBg, padding: 30, textAlign: 'center', borderRadius: 12, border: \`1px solid \${C.border}\`, color: C.textMuted }}>
            {loading ? 'Loading deliveries...' : 'No orders found.'}
          </div>
        ) : (
          pincodes.map(pin => {
            const pinOrders = ordersByPincode[pin];
            const unassignedOrders = pinOrders.filter(o => !o.assigned_agent_id && ['CREATED','CONFIRMED','VERIFIED_READY','PACKED'].includes(o.status));
            const unassignedIds = unassignedOrders.map(o => o.id);
            
            return (
              <div key={pin} style={{ background: C.cardBg, boxShadow: C.shadowSm, borderRadius: 12, border: \`1px solid \${C.border}\`, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: \`1px solid \${C.border}\`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MapPin size={18} /> Zone Pincode: {pin} <span style={{ fontSize: 12, color: C.textSecondary, fontWeight: 500 }}>({pinOrders.length} Orders, {unassignedOrders.length} Unassigned)</span>
                  </h2>`;

const tableNew = `      {/* All Orders Table grouped by Date then Pincode */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {datesList.length === 0 ? (
          <div style={{ background: C.cardBg, padding: 30, textAlign: 'center', borderRadius: 12, border: \`1px solid \${C.border}\`, color: C.textMuted }}>
            {loading ? 'Loading deliveries...' : 'No orders found.'}
          </div>
        ) : (
          datesList.map(dStr => (
            <div key={dStr} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: '10px 0 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                 📅 Delivery Date: {dStr}
              </h2>
              {Object.keys(ordersByDate[dStr]).sort().map(pin => {
                const pinOrders = ordersByDate[dStr][pin];
                const unassignedOrders = pinOrders.filter(o => !o.assigned_agent_id && ['CREATED','CONFIRMED','VERIFIED_READY','PACKED'].includes(o.status));
                const unassignedIds = unassignedOrders.map(o => o.id);
                
                return (
                  <div key={\`\${dStr}-\${pin}\`} style={{ background: C.cardBg, boxShadow: C.shadowSm, borderRadius: 12, border: \`1px solid \${C.border}\`, overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: \`1px solid \${C.border}\`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MapPin size={18} /> Zone Pincode: {pin} <span style={{ fontSize: 12, color: C.textSecondary, fontWeight: 500 }}>({pinOrders.length} Orders, {unassignedOrders.length} Unassigned)</span>
                      </h3>`;

content = content.replace(tableOld, tableNew);

// Replace the closing tags
const tailOld = `                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
        )}
      </div>
    </div>
  );
}

export default DeliveriesPage;`;

const tailNew = `                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default DeliveriesPage;`;

content = content.replace(tailOld, tailNew);

// Also need to fix the select/button id's to include the date string
content = content.replace(/id={\`select-\${pin}\`}/g, "id={`select-${dStr}-${pin}`}");

fs.writeFileSync('frontend/src/pages/DeliveriesPage.jsx', content);
console.log('Fixed DeliveriesPage.jsx');
