require('dotenv').config({ path: __dirname + '/.env' });

async function testLLM() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("No API key found!");
    return;
  }
  
  const messageText = "Hey, I'd like 2kg of Sankara and 1kg of Mathi for tomorrow please.";
  
  const prompt = `You are an AI assistant for Meenzy Fresh Seafood. Classify the user's intent into EXACTLY ONE of these categories:
- PLACING_ORDER (User wants to buy something)
- ORDER_COMPLAINT (User is unhappy, missing items, bad quality)
- DELIVERY_QUERY (User is asking when it arrives)
- GENERAL_FAQ (Business hours, location, cleaning process)
Message: "${messageText}"
Output ONLY the exact category name.`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "google/gemini-2.5-flash",
        "messages": [{ "role": "user", "content": prompt }]
      })
    });
    const data = await response.json();
    console.log("Full OpenRouter response:", JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Triage Error:", e);
  }
}

testLLM();
