#!/usr/bin/env node

// Test script to verify Cerebras integration
const CerebrasClient = require('./cerebras/cerebras-client.cjs');

async function testCerebrasIntegration() {
  console.log('Testing Cerebras integration...\n');
  
  const client = new CerebrasClient();
  
  // Test 1: Check if CEREBRAS_API_KEY is set
  if (!process.env.CEREBRAS_API_KEY) {
    console.error('❌ CEREBRAS_API_KEY environment variable is not set');
    console.log('Please set your Cerebras API key:');
    console.log('export CEREBRAS_API_KEY="your-api-key-here"');
    process.exit(1);
  }
  console.log('✓ CEREBRAS_API_KEY is set');
  
  try {
    // Test 2: List available models
    console.log('\n🧪 Testing models list...');
    const modelsResponse = await client.listModels();
    
    if (modelsResponse.success) {
      console.log('✓ Models API working');
      if (modelsResponse.data && modelsResponse.data.length > 0) {
        console.log(`  Found ${modelsResponse.data.length} models`);
      }
    } else {
      console.error('❌ Models API failed:', modelsResponse.error);
    }
    
    // Test 3: Simple completion
    console.log('\n🧪 Testing completion API...');
    const completionResponse = await client.completion({
      prompt: 'Hello, world!',
      model: 'llama3.1-8b',
      max_tokens: 20
    });
    
    if (completionResponse.success) {
      console.log('✓ Completion API working');
      console.log('  Response:', completionResponse.data?.text?.substring(0, 100));
    } else {
      console.error('❌ Completion API failed:', completionResponse.error);
    }
    
    // Test 4: Chat completion
    console.log('\n🧪 Testing chat completion API...');
    const chatResponse = await client.chatCompletion({
      messages: [
        { role: 'user', content: 'What is 2+2?' }
      ],
      model: 'llama3.1-8b',
      max_tokens: 50
    });
    
    if (chatResponse.success) {
      console.log('✓ Chat API working');
      console.log('  Response:', chatResponse.data?.message?.substring(0, 100));
    } else {
      console.error('❌ Chat API failed:', chatResponse.error);
    }
    
    console.log('\n🎉 All tests completed!');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  testCerebrasIntegration();
}

module.exports = testCerebrasIntegration;