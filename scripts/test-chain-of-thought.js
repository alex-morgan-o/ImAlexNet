#!/usr/bin/env node

const { ChainOfThoughtProcessor } = require('../dist/chainOfThoughtProcessor');

async function testChainOfThought() {
    console.log('Testing Chain of Thought Processor...\n');

    const testCases = [
        "Hello, how are you?",
        "Show me what's in my downloads folder", 
        "List all files in the current directory",
        "Create a file called test.txt with hello world",
        "What's the weather like today?"
    ];

    for (const testMessage of testCases) {
        console.log(`\n=== Testing: "${testMessage}" ===`);
        
        try {
            const result = await ChainOfThoughtProcessor.processUserMessage(testMessage);
            
            console.log('✅ Success:', result.success);
            console.log('💭 Reasoning:', result.reasoning);
            console.log('💬 Final Response:', result.final_response);
            
            if (result.commands_to_execute && result.commands_to_execute.length > 0) {
                console.log('⚡ Commands to execute:');
                result.commands_to_execute.forEach((cmd, i) => {
                    console.log(`   ${i + 1}. ${cmd.command} ${cmd.args.join(' ')} - ${cmd.explanation}`);
                });
            } else {
                console.log('📝 No commands needed - conversational response only');
            }
            
        } catch (error) {
            console.error('❌ Error:', error.message);
        }
        
        console.log('---');
    }
}

// Only run if this script is called directly
if (require.main === module) {
    testChainOfThought().catch(console.error);
}

module.exports = { testChainOfThought };