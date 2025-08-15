#!/usr/bin/env node

const path = require("path");
const CerebrasClient = require("./cerebras/cerebras-client.cjs");

async function testCerebrasDirectly() {
    console.log('Testing Cerebras client directly...\n');
    
    const client = new CerebrasClient();
    
    const messages = [
        {
            role: 'system',
            content: 'You are a helpful assistant. Respond with a simple JSON object containing just {"response": "your message here"}'
        },
        {
            role: 'user',
            content: 'Hello, can you list files in a directory?'
        }
    ];
    
    try {
        const result = await client.chatCompletion({
            messages,
            model: 'llama3.1-8b',
            max_tokens: 100,
            temperature: 0.3
        });
        
        console.log('✅ Cerebras Response:', JSON.stringify(result, null, 2));
        
        if (result.success) {
            console.log('✅ Message content:', result.data.message);
        }
        
    } catch (error) {
        console.error('❌ Direct test failed:', error);
    }
}

if (require.main === module) {
    testCerebrasDirectly().catch(console.error);
}