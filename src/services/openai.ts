
import { toast } from "sonner";

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function generateChatResponse(messages: ChatMessage[], apiKey: string): Promise<string> {
  try {
    console.log("Llamando a OpenAI API con mensajes:", messages);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      throw new Error(errorData.error?.message || 'Error generating response');
    }

    const data = await response.json();
    console.log("Respuesta exitosa de OpenAI:", data.choices[0].message.content);
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error llamando a OpenAI:', error);
    toast.error('Error al generar respuesta de IA');
    return "Lo siento, ha ocurrido un error al procesar tu solicitud. Por favor, inténtalo de nuevo.";
  }
}
