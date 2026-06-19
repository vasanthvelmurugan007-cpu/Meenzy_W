require('dotenv').config();

async function testGroq() {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.warn('No Groq key');
    return;
  }

  const validOrders = [
    { id: 'uuid-1', address_line: 'MG Road, Bangalore', lat: 12.971598, lng: 77.594562 },
    { id: 'uuid-2', address_line: 'Banashankari, Bangalore', lat: 12.925453, lng: 77.546757 },
    { id: 'uuid-3', address_line: 'Malleswaram, Bangalore', lat: 13.006822, lng: 77.581335 }
  ];

  const startText = "Agent is starting at coordinates Lat: 12.971598, Lng: 77.594562 (MG Road)";
  const orderListText = validOrders.map(o => `- ID: "${o.id}", Address: "${o.address_line}", Lat: ${o.lat}, Lng: ${o.lng}`).join('\n');

  const prompt = `You are a hyperlocal delivery logistics AI.
Your task is to find the mathematically shortest and most logical delivery sequence for the following orders. Group them logically by neighborhood and minimize driving distance.
${startText}

Orders:
${orderListText}

Output ONLY a JSON array of strings containing the exact order IDs in the optimal delivery sequence. Do not include any other text, explanation, or markdown formatting (e.g., no \`\`\`json). Just the array.
Example: ["id1", "id2", "id3"]`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      })
    });

    const data = await response.json();
    console.log("Full Groq Response Data:", JSON.stringify(data, null, 2));
    let aiResponse = data.choices?.[0]?.message?.content || '[]';
    console.log('Raw AI Response:', aiResponse);
    
    // Clean up markdown if the AI mistakenly included it
    aiResponse = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();

    let optimizedSequence = [];
    try {
      optimizedSequence = JSON.parse(aiResponse);
      console.log('Parsed Sequence:', optimizedSequence);
    } catch (parseErr) {
      console.error('[Groq JSON Parse Error]', aiResponse);
    }
  } catch (err) {
    console.error(err);
  }
}

testGroq();
