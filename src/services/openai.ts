
import { toast } from "sonner";

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Cache for recent user messages to detect repetition
const recentUserMessages: {message: string, timestamp: number}[] = [];
const similarityThreshold = 0.8; // Threshold for considering messages similar

// Check if a message is similar to recent messages
function isSimilarToRecentMessages(message: string): boolean {
  const normalizedMessage = message.toLowerCase().trim();
  if (normalizedMessage.length < 5) return false; // Skip very short messages
  
  // Count similar messages in the last 2 minutes
  const twoMinutesAgo = Date.now() - 120000;
  const similarMessages = recentUserMessages
    .filter(item => item.timestamp > twoMinutesAgo)
    .filter(item => {
      const itemNormalized = item.message.toLowerCase().trim();
      return itemNormalized === normalizedMessage || 
             (normalizedMessage.includes(itemNormalized) && itemNormalized.length > 10) ||
             (itemNormalized.includes(normalizedMessage) && normalizedMessage.length > 10);
    });
  
  return similarMessages.length >= 2; // Return true if similar message found 3+ times
}

// Add a user message to recent messages cache
function addToRecentMessages(message: string): void {
  recentUserMessages.push({
    message,
    timestamp: Date.now()
  });
  
  // Limit cache size to 20 messages
  if (recentUserMessages.length > 20) {
    recentUserMessages.shift();
  }
}

export async function generateChatResponse(messages: ChatMessage[], apiKey: string): Promise<string> {
  try {
    // Get the last user message - replacing findLast with a compatible alternative
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
    
    // Check for repetitive messages
    if (isSimilarToRecentMessages(lastUserMessage)) {
      console.log("Repetitive message detected, sending special response");
      addToRecentMessages(lastUserMessage);
      return "Creo que ya respondí a eso. ¿Te gustaría que lo aclare o explique de otra manera?";
    }
    
    // Add message to recent messages
    addToRecentMessages(lastUserMessage);
    
    console.log("Calling OpenAI API with messages:", messages);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        max_tokens: 150,  // Reduced for faster responses
        stream: true,
        temperature: 0.3,  // Lower temperature for more consistent, natural responses
        presence_penalty: 0.2,  // Lowered for more concise replies
        frequency_penalty: 0.3   // Keeping variety in responses
      })
    });

    if (!response.ok || !response.body) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      throw new Error(errorData.error?.message || 'Error generating response');
    }

    // Stream processing
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let resultText = '';

    // Set a timeout for slow responses
    const responseTimeout = setTimeout(() => {
      if (resultText.length === 0) {
        // If no response after 3 seconds, provide feedback
        resultText = "Un momento... estoy pensando.";
        console.log("Response timeout triggered");
      }
    }, 3000);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const decodedValue = decoder.decode(value, { stream: true });
        const jsonChunks = decodedValue.split("\n").filter(line => line.startsWith("data: ") && line !== "data: [DONE]");
        
        for (const chunk of jsonChunks) {
          try {
            const jsonData = JSON.parse(chunk.replace("data: ", "").trim());
            if (jsonData.choices && jsonData.choices[0].delta.content) {
              resultText += jsonData.choices[0].delta.content;
              
              // Cancel timeout once we start getting content
              if (responseTimeout) {
                clearTimeout(responseTimeout);
              }
            }
          } catch (error) {
            // Continue even if one chunk fails to parse
            console.error("Error processing stream chunk:", error);
          }
        }
      }
    } catch (error) {
      console.error("Stream reading error:", error);
    } finally {
      // Ensure timeout is cleared
      if (responseTimeout) {
        clearTimeout(responseTimeout);
      }
    }

    console.log("Complete OpenAI response:", resultText);
    return resultText;
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    toast.error('Error generating AI response');
    return "Lo siento, ha ocurrido un error. Por favor, inténtalo de nuevo.";
  }
}
