
import { toast } from "sonner";

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function generateChatResponse(messages: ChatMessage[], apiKey: string): Promise<string> {
  try {
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
        max_tokens: 300,  // Reduced for faster responses
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
          }
        } catch (error) {
          // Continue even if one chunk fails to parse
          console.error("Error processing stream chunk:", error);
        }
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
