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
  onRegistrarTarefa?: (dados: any) => string | Promise<string>,
  onEnviarAlerta?: (dados: any) => void | Promise<void>
): Promise<string> {
  const rogerPrompt = "Você é o Home AI, o assistente inteligente da casa de Roger e Juliana. Sua função principal é gerenciar as tarefas da casa. O usuário atual é o Roger. Suas respostas devem ser: extremamente curtas, diretas, objetivas, organizadas em tópicos e estritamente lógicas. Sem enrolação e sem cumprimentos adicionais. O momento atual é " + new Date().toLocaleString() + ". Entenda referências de tempo como 'ontem', 'hoje de manhã', 'agora'. Deduz a que tarefa o usuário se refere com inteligência (ex: se ele disser 'lavei a louça', refira-se à tarefa 'Louça' ou 'Limpeza').";
  
  const julianaPrompt = "Você é o Home AI, o assistente inteligente da casa de Roger e Juliana. Sua função principal é gerenciar as tarefas da casa. A usuária atual é a Juliana. Suas respostas devem ser: amigáveis, prestativas, conversacionais e com um tom acolhedor e atencioso. O momento atual é " + new Date().toLocaleString() + ". Entenda referências de tempo como 'ontem', 'hoje de manhã', 'agora'. Deduz a que tarefa o usuário se refere com inteligência (ex: se ela disser 'lavei a louça', refira-se à tarefa 'Louça' ou 'Limpeza').";

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
                        description: 'Registra uma tarefa realizada pelo usuário na casa. Pode também cadastrar a tarefa se ela for nova.',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                nome_tarefa: { type: Type.STRING, description: "O que foi feito (tente adivinhar a categoria exata no banco, ex: 'Limpeza', 'Louça', 'Lixo')" },
                                usuario: { type: Type.STRING, description: "Quem executou a ação ('Roger' ou 'Juliana')" },
                                data_hora: { type: Type.STRING, description: "Quando foi feito (ex: 'agora', 'há 5 min', 'ontem às 20h')" },
                                confirmacao_necessaria: { type: Type.BOOLEAN, description: "Se a tarefa exata falada NÃO puder ser deduzida com certeza dentre as clássicas, defina como true." },
                                dificuldade: { type: Type.INTEGER, description: "A dificuldade da tarefa (1 a 5), se o usuário tiver informado. Se não informou, deixe ausente." }
                            },
                            required: ["nome_tarefa", "usuario", "data_hora", "confirmacao_necessaria"]
                        }
                    },
                    {
                        name: 'enviar_alerta',
                        description: 'Envia uma mensagem para o mural de alertas para avisar o parceiro sobre algo.',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                mensagem: { type: Type.STRING, description: "A mensagem a ser exibida no mural." },
                                de_usuario: { type: Type.STRING, description: "Quem enviou o alerta ('Roger' ou 'Juliana')." }
                            },
                            required: ["mensagem", "de_usuario"]
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
                const handledResult = await Promise.resolve(onRegistrarTarefa(args));
                
                contents.push({
                    role: 'model',
                    parts: [{ functionCall: call }]
                });
                contents.push({
                    role: 'user',
                    parts: [{
                        functionResponse: {
                            name: "registrar_tarefa",
                            response: { result: handledResult || "Status unknown" }
                        }
                    }]
                });
                
                const finalResponse = await ai.models.generateContent({
                     model: 'gemini-2.5-flash',
                     contents,
                     config: { systemInstruction } 
                });
                return finalResponse.text || "Tarefa processada.";
            }
            return "Ok, a tarefa seria registrada.";
        } else if (call.name === 'enviar_alerta') {
            const args = call.args;
            if (onEnviarAlerta) {
                onEnviarAlerta(args);
            }
            
            contents.push({
                role: 'model',
                parts: [{ functionCall: call }]
            });
            contents.push({
                role: 'user',
                parts: [{
                    functionResponse: {
                        name: "enviar_alerta",
                        response: { success: true }
                    }
                }]
            });
            
            const finalResponse = await ai.models.generateContent({
                 model: 'gemini-2.5-flash',
                 contents,
                 config: { systemInstruction } 
            });
            return finalResponse.text || "Alerta enviado com sucesso.";
        }
    }

    return response.text || "Não consegui processar a resposta.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Ocorreu um erro de conexão com a API.";
  }
}
