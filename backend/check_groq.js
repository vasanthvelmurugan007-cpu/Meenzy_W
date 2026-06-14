require('dotenv').config();

async function run() {
  if (process.env.GROQ_API_KEY) {
    const prompt = `You are an AI assistant for Meenzy Fresh Seafood. Classify the user's intent into EXACTLY ONE of these categories:
- PLACING_ORDER (User wants to buy something)
- ORDER_COMPLAINT (User is unhappy, missing items, bad quality)
- DELIVERY_QUERY (User is asking when it arrives)
- RECIPE_QUERY (User is asking how to cook, recipes, marinades for seafood)
- HUMAN_HANDOFF (User explicitly asks to speak to a human, agent, or person)
- GENERAL_FAQ (Business hours, location, cleaning process)
Message: "how to cook my order"
Output ONLY the exact category name.`;
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 100,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const d = await r.json();
    console.log('Groq classification:', d?.choices?.[0]?.message?.content?.trim());
  } else {
    console.log('No GROQ_API_KEY found locally.');
  }
}
run().catch(console.error);
