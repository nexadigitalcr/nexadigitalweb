
import { toast } from "sonner";

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Cache for recent user messages to detect repetition
const recentUserMessages: {message: string, timestamp: number}[] = [];
const similarityThreshold = 0.8; // Threshold for considering messages similar

// Check if a message is similar to recent messages - improved to be less strict
function isSimilarToRecentMessages(message: string): boolean {
  const normalizedMessage = message.toLowerCase().trim();
  if (normalizedMessage.length < 5) return false; // Skip very short messages
  
  // Count similar messages in the last 2 minutes - reduced from 3 to 2 occurrences
  const twoMinutesAgo = Date.now() - 120000;
  const similarMessages = recentUserMessages
    .filter(item => item.timestamp > twoMinutesAgo)
    .filter(item => {
      const itemNormalized = item.message.toLowerCase().trim();
      // Increased threshold to avoid false positives
      return itemNormalized === normalizedMessage || 
             (normalizedMessage.includes(itemNormalized) && itemNormalized.length > 15) ||
             (itemNormalized.includes(normalizedMessage) && normalizedMessage.length > 15);
    });
  
  return similarMessages.length >= 3; // Increased threshold from 2 to 3
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

export async function generateChatResponse(
  messages: ChatMessage[], 
  apiKey: string, 
  onPartialResponse?: (text: string) => void
): Promise<string> {
  try {
    // Get the last user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
    
    // Check for repetitive messages - with improved detection
    if (isSimilarToRecentMessages(lastUserMessage)) {
      console.log("Repetitive message detected, sending special response");
      addToRecentMessages(lastUserMessage);
      return "Creo que ya respondí a eso. ¿Te gustaría que lo aclare o explique de otra manera?";
    }
    
    // Add message to recent messages
    addToRecentMessages(lastUserMessage);
    
    console.log("Calling OpenAI API with messages:", messages);
    
    // Use streaming API for real-time responses
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        max_tokens: 150,
        stream: true,
        temperature: 0.3,
        presence_penalty: 0.2,
        frequency_penalty: 0.3
      })
    });

    if (!response.ok || !response.body) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      throw new Error(errorData.error?.message || 'Error generating response');
    }

    // Stream processing with improved error handling
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let resultText = '';
    let streamStarted = false;

    // Set a timeout for slow responses - reduced from 3s to 1.5s
    const responseTimeout = setTimeout(() => {
      if (!streamStarted) {
        // If no response after 1.5 seconds, provide feedback and trigger callback
        const feedbackText = "Un momento... estoy pensando.";
        if (onPartialResponse) onPartialResponse(feedbackText);
        streamStarted = true;
        console.log("Response timeout triggered");
      }
    }, 1500);

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
              const newContent = jsonData.choices[0].delta.content;
              resultText += newContent;
              
              // Trigger callback with intermediate results for real-time UI updates
              if (onPartialResponse) {
                onPartialResponse(resultText);
              }
              
              // Mark stream as started once we get content
              if (!streamStarted) {
                streamStarted = true;
              }
              
              // Cancel timeout once we start getting content
              if (responseTimeout) {
                clearTimeout(responseTimeout);
              }
            }
          } catch (error) {
            console.error("Error processing stream chunk:", error);
          }
        }
      }
    } catch (error) {
      console.error("Stream reading error:", error);
      // If we have partial results but hit an error, return what we have
      if (resultText.length > 0) {
        return resultText;
      }
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
