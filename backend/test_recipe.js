require('dotenv').config();
const { generateRecipeLLM } = require('./src/engine/aiRecipeAssistant');

async function test() {
  const result = await generateRecipeLLM('1234567890', 'how to cook my order');
  console.log('Recipe result:', result);
  process.exit(0);
}

test();
