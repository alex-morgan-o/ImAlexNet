#!/usr/bin/env node

const path = require("path");
const dotenv = require("dotenv");
const { Cerebras } = require("@cerebras/cerebras_cloud_sdk");

// Load .env file from project root
const envPath = path.resolve(__dirname, "..", "..", ".env");
dotenv.config({ path: envPath });

class CerebrasClient {
  constructor() {
    this.client = new Cerebras({
      apiKey: process.env.CEREBRAS_API_KEY,
    });
  }

  async completion(options = {}) {
    try {
      const {
        prompt,
        model = "llama3.1-8b",
        temperature = 0.3,
        top_p = 1,
        stop = null,
        seed = null,
        stream = false,
      } = options;

      if (!prompt) {
        throw new Error("Prompt is required");
      }

      const completionRequest = {
        prompt,
        model,
        max_tokens,
        temperature,
        top_p,
        stream,
      };

      if (stop) completionRequest.stop = stop;
      if (seed !== null) completionRequest.seed = seed;

      if (stream) {
        return await this.streamCompletion(completionRequest);
      } else {
        const completion =
          await this.client.completions.create(completionRequest);
        return {
          success: true,
          data: {
            text: completion.choices[0]?.text || "",
            model: completion.model,
            usage: completion.usage,
            created: completion.created,
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data || error,
      };
    }
  }

  async streamCompletion(completionRequest) {
    try {
      const stream = await this.client.completions.create(completionRequest);
      const chunks = [];
      let fullText = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.text || "";
        fullText += content;
        chunks.push({
          text: content,
          created: chunk.created,
        });
      }

      return {
        success: true,
        data: {
          text: fullText,
          chunks: chunks,
          model: completionRequest.model,
          stream: true,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data || error,
      };
    }
  }

  async chatCompletion(options = {}) {
    try {
      const {
        messages,
        model = "llama3.1-8b",
        max_tokens = 100,
        temperature = 0.7,
        top_p = 1,
        stop = null,
        seed = null,
        stream = false,
      } = options;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        throw new Error("Messages array is required");
      }

      const chatRequest = {
        messages,
        model,
        max_tokens,
        temperature,
        top_p,
        stream,
      };

      if (stop) chatRequest.stop = stop;
      if (seed !== null) chatRequest.seed = seed;

      if (stream) {
        return await this.streamChatCompletion(chatRequest);
      } else {
        const completion =
          await this.client.chat.completions.create(chatRequest);
        return {
          success: true,
          data: {
            message: completion.choices[0]?.message?.content || "",
            role: completion.choices[0]?.message?.role || "assistant",
            model: completion.model,
            usage: completion.usage,
            created: completion.created,
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data || error,
      };
    }
  }

  async streamChatCompletion(chatRequest) {
    try {
      const stream = await this.client.chat.completions.create(chatRequest);
      const chunks = [];
      let fullMessage = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullMessage += content;
        chunks.push({
          content: content,
          created: chunk.created,
        });
      }

      return {
        success: true,
        data: {
          message: fullMessage,
          role: "assistant",
          chunks: chunks,
          model: chatRequest.model,
          stream: true,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data || error,
      };
    }
  }

  async listModels() {
    try {
      const models = await this.client.models.list();
      return {
        success: true,
        data: models.data || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data || error,
      };
    }
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: node cerebras-client.js <command> [options]");
    console.log("Commands:");
    console.log("  completion <prompt> [options]  - Generate text completion");
    console.log("  chat <messages_json> [options] - Generate chat completion");
    console.log("  models                         - List available models");
    process.exit(1);
  }

  const command = args[0];
  const client = new CerebrasClient();

  (async () => {
    try {
      let result;

      switch (command) {
        case "completion":
          if (args.length < 2) {
            throw new Error("Prompt is required for completion command");
          }
          const prompt = args[1];
          const options = args[2] ? JSON.parse(args[2]) : {};
          result = await client.completion({ prompt, ...options });
          break;

        case "chat":
          if (args.length < 2) {
            throw new Error("Messages JSON is required for chat command");
          }
          const messages = JSON.parse(args[1]);
          const chatOptions = args[2] ? JSON.parse(args[2]) : {};
          result = await client.chatCompletion({ messages, ...chatOptions });
          break;

        case "models":
          result = await client.listModels();
          break;

        default:
          throw new Error(`Unknown command: ${command}`);
      }

      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(
        JSON.stringify(
          {
            success: false,
            error: error.message,
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }
  })();
}

module.exports = CerebrasClient;
