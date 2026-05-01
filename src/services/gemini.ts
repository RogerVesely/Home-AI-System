import { GoogleGenAI, Type } from '@google/genai';

// O AI Studio injeta automaticamente a GEMINI_API_KEY no process.env na hora do build/execução.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export async function generateChatResponse(
  userProfile: 'Roger' | 'Juliana',
  messages: ChatMessage[],
  newMessageText: string,
  onRegistrarTarefa?: (dados: any) => void,
  onConsultarTarefa?: (dados: any) => string | Promise<string>
): Promise<string> {
  const rogerPrompt = "Você é o Home AI, o assistente inteligente da casa. O usuário atual é o Roger. Suas respostas devem ser: extremamente curtas, diretas, objetivas, organizadas em tópicos e estritamente lógicas. Sem enrolação e sem cumprimentos adicionais. O momento atual é " + new Date().toLocaleString() + ". Ao realizar ações ou consultar status, mantenha a objetividade.";
  
  const julianaPrompt = "Você é o Home AI, o assistente inteligente da casa. A usuária atual é a Juliana. Suas respostas devem ser: amigáveis, prestativas, conversacionais e com um tom acolhedor e atencioso. O momento atual é " + new Date().toLocaleString() + ". Ao realizar ações ou consultar status, explique o contexto de forma carinhosa.";

  const systemInstruction = userProfile === 'Roger' ? rogerPrompt : julianaPrompt;

  const contents: any[] = messages.map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  }));

  contents.push({ role: 'user', parts: [{ text: newMessageText }] });

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
            systemInstruction,
            tools: [{
                functionDeclarations: [
                    {
                        name: 'registrar_tarefa',
                        description: 'Registra uma tarefa realizada pelo usuário na casa.',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                nome_tarefa: { type: Type.STRING, description: "O que foi feito (ex: 'lavou a Louça', 'Lixo', 'Jantar')" },
                                usuario: { type: Type.STRING, description: "Quem executou a ação ('Roger' ou 'Juliana')" },
                                data_hora: { type: Type.STRING, description: "Quando foi feito (ex: 'agora', 'há 5 min', 'ontem às 20h')" }
                            },
                            required: ["nome_tarefa", "usuario", "data_hora"]
                        }
                    },
                    {
                        name: 'consultar_status_tarefa',
                        description: 'Consulta o banco de dados para saber quando uma tarefa precisa ser feita, ou sua data de vencimento.',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                nome_tarefa: { type: Type.STRING, description: "O nome da tarefa que o usuário está perguntando. (ex: 'Rancho', 'Lixo', 'Limpeza')" }
                            },
                            required: ["nome_tarefa"]
                        }
                    }
                ]
            }]
        }
    });

    if (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        
        if (call.name === 'registrar_tarefa') {
            const args = call.args;
            if (onRegistrarTarefa) {
                onRegistrarTarefa(args);
            }
            
            // Retorna o resultado da função para o modelo gerar a resposta final
            contents.push({
                role: 'model',
                parts: [{ functionCall: call }]
            });
            contents.push({
                role: 'user',
                parts: [{
                    functionResponse: {
                        name: "registrar_tarefa",
                        response: { success: true }
                    }
                }]
            });
            
            const finalResponse = await ai.models.generateContent({
                 model: 'gemini-2.5-flash',
                 contents,
                 config: { systemInstruction } 
            });
            return finalResponse.text || "Feito. A tarefa foi registrada.";
        } else if (call.name === 'consultar_status_tarefa') {
            const args = call.args;
            let queryResult = "A tarefa não foi encontrada no banco de dados, ou não há informações no momento.";
            if (onConsultarTarefa) {
                queryResult = await Promise.resolve(onConsultarTarefa(args));
            }
            
            contents.push({
                role: 'model',
                parts: [{ functionCall: call }]
            });
            contents.push({
                role: 'user',
                parts: [{
                    functionResponse: {
                        name: "consultar_status_tarefa",
                        response: { status_texto: queryResult }
                    }
                }]
            });
            
            const finalResponse = await ai.models.generateContent({
                 model: 'gemini-2.5-flash',
                 contents,
                 config: { systemInstruction } 
            });
            return finalResponse.text || "Consultei os status solicitados.";
        }
    }

    return response.text || "Não consegui processar a resposta.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Ocorreu um erro de conexão com a API.";
  }
}
