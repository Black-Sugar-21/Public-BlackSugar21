#!/usr/bin/env node

/**
 * MCP Server — Nano Banana Image Generation (Gemini Image API)
 * Genera imágenes usando la API de Gemini desde Claude Code.
 */

const http = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyD0ZzWmKrD79Eimc7wQc0MyDHO239pkXtM';
const OUTPUT_DIR = process.env.IMAGE_OUTPUT_DIR || path.join(process.env.HOME, 'Pictures', 'BlackSugar21');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// MCP Protocol helpers
function sendResponse(id, result) {
  const response = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(response)}\r\n\r\n${response}`);
}

function sendError(id, code, message) {
  const response = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(response)}\r\n\r\n${response}`);
}

function sendNotification(method, params) {
  const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`);
}

// Gemini Image Generation
async function generateImage(prompt, aspectRatio = '1:1', imageSize = '1K') {
  const model = 'gemini-2.0-flash-exp';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const body = JSON.stringify({
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    }
  });

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`Gemini API error: ${json.error.message}`));
            return;
          }

          const parts = json.candidates?.[0]?.content?.parts || [];
          let textResponse = '';
          let imageData = null;
          let mimeType = 'image/png';

          for (const part of parts) {
            if (part.text) textResponse += part.text;
            if (part.inlineData) {
              imageData = part.inlineData.data;
              mimeType = part.inlineData.mimeType || 'image/png';
            }
          }

          resolve({ textResponse, imageData, mimeType });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function editImage(prompt, imagePath) {
  const model = 'gemini-2.0-flash-exp';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  // Read the image file
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
  const inputMime = mimeMap[ext] || 'image/png';

  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: inputMime, data: base64Image } }
      ]
    }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    }
  });

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`Gemini API error: ${json.error.message}`));
            return;
          }

          const parts = json.candidates?.[0]?.content?.parts || [];
          let textResponse = '';
          let imageData = null;
          let mimeType = 'image/png';

          for (const part of parts) {
            if (part.text) textResponse += part.text;
            if (part.inlineData) {
              imageData = part.inlineData.data;
              mimeType = part.inlineData.mimeType || 'image/png';
            }
          }

          resolve({ textResponse, imageData, mimeType });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Handle MCP messages
async function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'nano-banana-image-gen', version: '1.0.0' }
      });
      break;

    case 'initialized':
      // No response needed for notification
      break;

    case 'tools/list':
      sendResponse(id, {
        tools: [
          {
            name: 'generate_image',
            description: 'Generate an image from a text prompt using Nano Banana (Gemini). Returns the saved file path.',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: { type: 'string', description: 'Text description of the image to generate' },
                filename: { type: 'string', description: 'Output filename (without extension). Default: auto-generated timestamp' },
                aspect_ratio: { type: 'string', description: 'Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4. Default: 1:1', default: '1:1' }
              },
              required: ['prompt']
            }
          },
          {
            name: 'edit_image',
            description: 'Edit an existing image with a text prompt using Nano Banana (Gemini). Provide the image path and editing instructions.',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: { type: 'string', description: 'Editing instructions (e.g., "remove background", "make it darker", "add text: Hello")' },
                image_path: { type: 'string', description: 'Absolute path to the image file to edit' },
                filename: { type: 'string', description: 'Output filename (without extension). Default: original name + _edited' }
              },
              required: ['prompt', 'image_path']
            }
          },
          {
            name: 'list_generated_images',
            description: 'List all previously generated images in the output directory.',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          }
        ]
      });
      break;

    case 'tools/call': {
      const toolName = params?.name;
      const args = params?.arguments || {};

      try {
        if (toolName === 'generate_image') {
          const { prompt, filename, aspect_ratio } = args;
          const result = await generateImage(prompt, aspect_ratio || '1:1');

          if (!result.imageData) {
            sendResponse(id, {
              content: [{ type: 'text', text: `No image generated. AI response: ${result.textResponse || 'No response'}` }]
            });
            return;
          }

          // Save image
          const ext = result.mimeType.includes('png') ? 'png' : 'jpg';
          const fname = filename || `bs21_${Date.now()}`;
          const filePath = path.join(OUTPUT_DIR, `${fname}.${ext}`);
          fs.writeFileSync(filePath, Buffer.from(result.imageData, 'base64'));

          sendResponse(id, {
            content: [
              { type: 'text', text: `Image generated and saved to: ${filePath}\n\nAI notes: ${result.textResponse || 'None'}` }
            ]
          });

        } else if (toolName === 'edit_image') {
          const { prompt, image_path, filename } = args;

          if (!fs.existsSync(image_path)) {
            sendResponse(id, {
              content: [{ type: 'text', text: `Error: Image not found at ${image_path}` }],
              isError: true
            });
            return;
          }

          const result = await editImage(prompt, image_path);

          if (!result.imageData) {
            sendResponse(id, {
              content: [{ type: 'text', text: `No edited image returned. AI response: ${result.textResponse || 'No response'}` }]
            });
            return;
          }

          const ext = result.mimeType.includes('png') ? 'png' : 'jpg';
          const baseName = path.basename(image_path, path.extname(image_path));
          const fname = filename || `${baseName}_edited`;
          const filePath = path.join(OUTPUT_DIR, `${fname}.${ext}`);
          fs.writeFileSync(filePath, Buffer.from(result.imageData, 'base64'));

          sendResponse(id, {
            content: [
              { type: 'text', text: `Edited image saved to: ${filePath}\n\nAI notes: ${result.textResponse || 'None'}` }
            ]
          });

        } else if (toolName === 'list_generated_images') {
          const files = fs.readdirSync(OUTPUT_DIR)
            .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
            .map(f => {
              const stats = fs.statSync(path.join(OUTPUT_DIR, f));
              return `${f} (${(stats.size / 1024).toFixed(1)}KB, ${stats.mtime.toISOString().slice(0, 16)})`;
            });

          sendResponse(id, {
            content: [{
              type: 'text',
              text: files.length > 0
                ? `Images in ${OUTPUT_DIR}:\n\n${files.join('\n')}`
                : `No images found in ${OUTPUT_DIR}`
            }]
          });

        } else {
          sendError(id, -32601, `Unknown tool: ${toolName}`);
        }
      } catch (err) {
        sendResponse(id, {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        });
      }
      break;
    }

    default:
      if (id) sendError(id, -32601, `Method not found: ${method}`);
      break;
  }
}

// Parse MCP messages from stdin (Content-Length header protocol)
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;

  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;

    if (buffer.length < bodyStart + contentLength) break;

    const body = buffer.slice(bodyStart, bodyStart + contentLength);
    buffer = buffer.slice(bodyStart + contentLength);

    try {
      const msg = JSON.parse(body);
      handleMessage(msg);
    } catch (e) {
      // Ignore parse errors
    }
  }
});

process.stderr.write('Nano Banana Image Gen MCP Server started\n');
