
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
  onPartialResponse?: (text: string) => void,
  retryCount: number = 0
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
      
      // Retry logic for temporary failures - FIX #3
      if (retryCount < 2) {
        console.log(`Retrying OpenAI call, attempt ${retryCount + 1}...`);
        // Add exponential backoff delay based on retry count
        await new Promise(resolve => setTimeout(resolve, retryCount * 500));
        return generateChatResponse(messages, apiKey, onPartialResponse, retryCount + 1);
      }
      
      throw new Error(errorData.error?.message || 'Error generating response');
    }

    // Stream processing with improved error handling
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let resultText = '';
    let streamStarted = false;
    let lastResponseChunk = ""; // Track last chunk to prevent duplication - FIX #1

    // Set a timeout for slow responses - reduced from 1.5s to 1s - FIX #2
    const responseTimeout = setTimeout(() => {
      if (!streamStarted) {
        // If no response after 1 second, provide feedback and trigger callback
        const feedbackText = "Un momento... estoy pensando.";
        if (onPartialResponse) onPartialResponse(feedbackText);
        streamStarted = true;
        console.log("Response timeout triggered");
      }
    }, 1000);

    try {
      let consecutiveEmptyChunks = 0; // Track empty responses for improved stability
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          // If we're done but got no text, provide a fallback response - FIX #3
          if (resultText.length === 0) {
            console.log("Stream ended with no content, providing fallback response");
            resultText = "Parece que tuve problemas para responder. ¿Podrías reformular tu pregunta?";
          }
          break;
        }

        const decodedValue = decoder.decode(value, { stream: true });
        const jsonChunks = decodedValue.split("\n").filter(line => 
          line.startsWith("data: ") && line !== "data: [DONE]"
        );
        
        if (jsonChunks.length === 0) {
          consecutiveEmptyChunks++;
          // If we get too many empty chunks, break the loop to avoid hanging - FIX #3
          if (consecutiveEmptyChunks > 5) {
            console.log("Too many empty chunks, ending stream processing");
            break;
          }
          continue;
        } else {
          consecutiveEmptyChunks = 0; // Reset counter when we get valid chunks
        }
        
        for (const chunk of jsonChunks) {
          try {
            const jsonData = JSON.parse(chunk.replace("data: ", "").trim());
            if (jsonData.choices && jsonData.choices[0].delta.content) {
              const newContent = jsonData.choices[0].delta.content;
              
              // Only process if this is new content to prevent duplication - FIX #1
              if (newContent !== lastResponseChunk) {
                resultText += newContent;
                lastResponseChunk = newContent;
                
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
              } else {
                console.log("Duplicate content detected, skipping:", newContent);
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
      
      // Retry on stream errors - FIX #3
      if (retryCount < 2) {
        console.log(`Stream error, retrying attempt ${retryCount + 1}...`);
        return generateChatResponse(messages, apiKey, onPartialResponse, retryCount + 1);
      }
      
      // Fallback message for stream failures
      return "Lo siento, tuve problemas para procesar tu solicitud. ¿Podemos intentarlo de nuevo?";
    } finally {
      // Ensure timeout is cleared
      if (responseTimeout) {
        clearTimeout(responseTimeout);
      }
    }

    console.log("Complete OpenAI response:", resultText);
    return resultText.length > 0 
      ? resultText 
      : "Lo siento, no pude generar una respuesta. ¿Podrías intentar de nuevo?";
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    
    // Retry on general errors - FIX #3
    if (retryCount < 2) {
      console.log(`Error encountered, retrying attempt ${retryCount + 1}...`);
      // Add exponential backoff delay based on retry count
      await new Promise(resolve => setTimeout(resolve, retryCount * 500));
      return generateChatResponse(messages, apiKey, onPartialResponse, retryCount + 1);
    }
    
    toast.error('Error generating AI response');
    return "Lo siento, ha ocurrido un error. Por favor, inténtalo de nuevo.";
  }
}
