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
        max_tokens: 1000,  // Increased to 1000 for more complete responses
        stream: true,
        temperature: 0.3,
        presence_penalty: 0.6,
        frequency_penalty: 0.5
      })
    });

    if (!response.ok || !response.body) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      throw new Error(errorData.error?.message || 'Error generating response');
    }

    // ✅ REAL-TIME STREAM PROCESSING
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let resultText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const decodedValue = decoder.decode(value, { stream: true });
      resultText += decodedValue;
      console.log("Receiving real-time response:", decodedValue);
    }

    console.log("Complete OpenAI response:", resultText);
    return resultText;
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    toast.error('Error generating AI response');
    return "Sorry, an error occurred while processing your request. Please try again.";
  }
}

