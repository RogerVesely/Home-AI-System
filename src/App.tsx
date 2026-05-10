import { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, LogOut, Sparkles, User, Utensils, Droplets, Trash2, Plus, X, Shirt, ShoppingCart, Dog, Bed, Coffee, Car, Leaf, Send, Settings, AlertCircle, Save, Download, ChevronDown, ChevronUp, Minus, Home, MessageSquare, Calendar, Bell, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateChatResponse, type ChatMessage } from './services/gemini';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, doc, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { db, messaging } from './services/firebase';
import { getToken, onMessage } from 'firebase/messaging';

type UserProfile = 'Roger' | 'Juliana' | null;

export interface TaskDef {
  id?: string;
  nome_tarefa: string;
  recorrencia_dias: number;
  pontos: number;
}

export default function App() {
  const [activeUser, setActiveUser] = useState<UserProfile>(null);

  if (!activeUser) {
    return <Gateway onSelectUser={setActiveUser} />;
  }

  return <Dashboard user={activeUser} onLogout={() => setActiveUser(null)} />;
}

function Dashboard({ user, onLogout }: { user: NonNullable<UserProfile>; onLogout: () => void }) {
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'historico' | 'chat' | 'alertas' | 'planejamento'>('dashboard');

  const [isPartnerScoreVisible, setIsPartnerScoreVisible] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [scores, setScores] = useState({ Roger: 0, Juliana: 0 });
  const [tasks, setTasks] = useState<TaskDef[]>([]);
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'initial', role: 'model', text: `Olá, ${user}! Como posso ajudar com a casa hoje?` }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const [toastMessage, setToastMessage] = useState<{title: string, body: string} | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isLoadingSeed, setIsLoadingSeed] = useState(false);

  const popularHistoricoReal = async () => {
    if (!db) return;
    
    const seedData = [
      { user: 'Roger', action: 'Café', points: 1, daysAgo: 1 },
      { user: 'Roger', action: 'Lixo', points: 1, daysAgo: 1 },
      { user: 'Juliana', action: 'Louça', points: 2, daysAgo: 1 },
      { user: 'Juliana', action: 'Pet', points: 1, daysAgo: 1 },
      { user: 'Roger', action: 'Pet', points: 1, daysAgo: 2 },
      { user: 'Juliana', action: 'Jantar', points: 3, daysAgo: 2 },
      { user: 'Juliana', action: 'Louça', points: 2, daysAgo: 2 },
      { user: 'Roger', action: 'Café', points: 1, daysAgo: 2 },
      { user: 'Roger', action: 'Jantar', points: 3, daysAgo: 3 },
      { user: 'Juliana', action: 'Limpeza', points: 3, daysAgo: 3 },
      { user: 'Roger', action: 'Lixo', points: 1, daysAgo: 3 },
      { user: 'Juliana', action: 'Roupa', points: 2, daysAgo: 4 },
      { user: 'Juliana', action: 'Louça', points: 2, daysAgo: 4 },
      { user: 'Roger', action: 'Mercado', points: 3, daysAgo: 4 },
      { user: 'Roger', action: 'Café', points: 1, daysAgo: 5 },
      { user: 'Juliana', action: 'Pet', points: 1, daysAgo: 5 },
      { user: 'Roger', action: 'Carro', points: 2, daysAgo: 5 },
      { user: 'Roger', action: 'Jantar', points: 3, daysAgo: 6 },
      { user: 'Juliana', action: 'Louça', points: 2, daysAgo: 6 },
      { user: 'Juliana', action: 'Outro (desfazer malas)', points: 2, daysAgo: 6 },
      { user: 'Roger', action: 'Lixo', points: 1, daysAgo: 7 },
      { user: 'Roger', action: 'Outro (arrumar transformador)', points: 2, daysAgo: 7 },
      { user: 'Juliana', action: 'Roupa', points: 2, daysAgo: 7 },
      { user: 'Juliana', action: 'Limpeza', points: 3, daysAgo: 8 },
      { user: 'Roger', action: 'Café', points: 1, daysAgo: 8 },
      { user: 'Roger', action: 'Mercado', points: 3, daysAgo: 9 },
      { user: 'Juliana', action: 'Louça', points: 2, daysAgo: 9 },
      { user: 'Juliana', action: 'Jantar', points: 3, daysAgo: 9 },
      { user: 'Roger', action: 'Pet', points: 1, daysAgo: 10 },
      { user: 'Roger', action: 'Lixo', points: 1, daysAgo: 10 },
      { user: 'Juliana', action: 'Roupa', points: 2, daysAgo: 12 },
      { user: 'Roger', action: 'Jantar', points: 3, daysAgo: 12 },
      { user: 'Juliana', action: 'Louça', points: 2, daysAgo: 15 },
      { user: 'Roger', action: 'Carro', points: 2, daysAgo: 15 },
    ];

    try {
      setIsLoadingSeed(true);
      for (const item of seedData) {
        const date = new Date();
        date.setDate(date.getDate() - item.daysAgo);
        
        await addDoc(collection(db, 'logs'), {
          user: item.user,
          action: item.action,
          time: 'inserido via seed',
          points: item.points,
          timestamp: date,
          status: 'ativo'
        });
      }
      alert('Dados iniciais carregados com sucesso!');
    } catch (e) {
      console.error('Erro ao carregar dados:', e);
      alert('Erro ao carregar dados iniciais.');
    } finally {
      setIsLoadingSeed(false);
    }
  };

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, isChatLoading]);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => {
        setDeferredPrompt(null);
      });
    }
  };

  useEffect(() => {
    const setupNotifications = async () => {
      if (!messaging) return;
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
          const token = await getToken(messaging, { vapidKey });
          if (token && db) {
             await setDoc(doc(db, 'users', user), { fcmToken: token }, { merge: true });
          }
        }
      } catch (e) {
        console.error("Erro ao solicitar notificação:", e);
      }
    };
    setupNotifications();

    if (messaging) {
      const unsub = onMessage(messaging, (payload) => {
         if (payload.notification) {
           setToastMessage({
             title: payload.notification.title || 'Nova Notificação',
             body: payload.notification.body || ''
           });
           setTimeout(() => setToastMessage(null), 5000);
         }
      });
      return () => unsub();
    }
  }, [user]);

  useEffect(() => {
    if (!db) return;
    
    // Subscribe to tasks
    const unsubscribeTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
       const newTasks: TaskDef[] = [];
       snapshot.forEach(docSnap => {
          newTasks.push({ id: docSnap.id, ...docSnap.data() } as TaskDef);
       });
       setTasks(newTasks);
    });

    // Subscribe to logs collection
    const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'));
    const unsubscribeLogs = onSnapshot(q, (snapshot) => {
       let rogerPoints = 0;
       let julianaPoints = 0;
       const newHistory: any[] = [];
       
       snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data.status === 'deletado') return; // Ignore soft-deleted items
          
          if (data.user === 'Roger') rogerPoints += (data.points || 1);
          if (data.user === 'Juliana') julianaPoints += (data.points || 1);
          
          newHistory.push({
             id: docSnap.id,
             ...data,
          });
       });
       
       setScores({ Roger: rogerPoints, Juliana: julianaPoints });
       setHistory(newHistory);
    }, (error) => {
       console.error("Erro ao sincronizar logs Firestore:", error);
    });
    
    return () => {
        unsubscribeTasks();
        unsubscribeLogs();
    };
  }, []);

  const overdueTasks = tasks.map(task => {
     if (!task.recorrencia_dias || task.recorrencia_dias <= 0) return null;
     const lastLog = history.find(h => h.action.toLowerCase() === task.nome_tarefa.toLowerCase());
     if (!lastLog || !lastLog.timestamp) return { task, isOverdue: true, nextDue: null };
     
     const lastDate = lastLog.timestamp.toDate();
     const nextDue = new Date(lastDate.getTime() + task.recorrencia_dias * 24 * 60 * 60 * 1000);
     const isOverdue = nextDue <= new Date();
     
     return { task, isOverdue, nextDue, lastDate };
  }).filter(t => t?.isOverdue);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isChatLoading) return;

    const userText = inputValue;
    setInputValue('');
    
    const newUserMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: userText };
    setMessages(prev => [...prev, newUserMsg]);
    setIsChatLoading(true);

    const replyText = await generateChatResponse(user, messages.filter(m => m.id !== 'initial'), userText, 
    async (data) => {
      console.log('Ferramenta registrar_tarefa chamada com dados:', data);
      
      try {
        let matchedPoints = 1;
        const matchedTask = tasks.find(t => t.nome_tarefa.toLowerCase() === (data.nome_tarefa || '').toLowerCase());
        if (matchedTask) matchedPoints = matchedTask.pontos;

        await addDoc(collection(db, 'logs'), {
          user: data.usuario || user,
          action: data.nome_tarefa,
          time: data.data_hora,
          points: matchedPoints,
          status: 'ativo',
          timestamp: serverTimestamp()
        });
      } catch (err) {
        console.error("Erro ao inserir log via IA:", err);
      }
    },
    async (data) => {
       console.log('Ferramenta consultar_status_tarefa chamada:', data);
       const requestedTask = data.nome_tarefa;
       
       const matchedTask = tasks.find(t => t.nome_tarefa.toLowerCase() === (requestedTask || '').toLowerCase());
       const lastLog = history.find(h => h.action.toLowerCase() === (requestedTask || '').toLowerCase());
       
       if (!lastLog) {
          if (matchedTask) return `A tarefa '${requestedTask}' existe, mas não há registro recente de execução.`;
          return `A tarefa '${requestedTask}' não foi encontrada no histórico nem nas configurações.`;
       }
       
       const lastDate = lastLog.timestamp?.toDate() || new Date();
       const msg = `Última vez executada: ${lastDate.toLocaleDateString()} por ${lastLog.user}.`;
       
       if (matchedTask && matchedTask.recorrencia_dias > 0) {
          const nextDue = new Date(lastDate.getTime() + matchedTask.recorrencia_dias * 24 * 60 * 60 * 1000);
          return `${msg} Deve ser feita novamente em ${nextDue.toLocaleDateString()} (Recorrência: ${matchedTask.recorrencia_dias} dias).`;
       }
       
       return msg;
    });
    
    const newModelMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: replyText };
    setMessages(prev => [...prev, newModelMsg]);
    setIsChatLoading(false);
  };
  
  const isRoger = user === 'Roger';
  const partner = isRoger ? 'Juliana' : 'Roger';
  
  const activeColor = isRoger ? 'var(--roger-color)' : 'var(--juliana-color)';
  const activeBgColor = isRoger ? 'rgba(15, 23, 42, 0.3)' : 'rgba(157, 23, 77, 0.3)';
  const partnerColor = isRoger ? 'var(--juliana-color)' : 'var(--roger-color)';

  const activeScore = scores[user as 'Roger' | 'Juliana'];
  const partnerScore = scores[partner as 'Roger' | 'Juliana'];

  const handleQuickAction = async (label: string) => {
     try {
        let matchedPoints = 1;
        const matchedTask = tasks.find(t => t.nome_tarefa.toLowerCase() === label.toLowerCase());
        if (matchedTask) matchedPoints = matchedTask.pontos;

        await addDoc(collection(db, 'logs'), {
           user,
           action: label,
           time: 'agora',
           points: matchedPoints,
           status: 'ativo',
           timestamp: serverTimestamp()
        });
     } catch (err) {
        console.error("Erro ao registrar ação rápida:", err);
     }
  };

  return (
    <>
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-[100dvh] flex flex-col md:max-w-md md:mx-auto md:shadow-2xl relative overflow-hidden transition-colors duration-500" 
      style={{ backgroundColor: activeBgColor }}
    >
      <div className="absolute top-0 inset-x-0 h-48 bg-gradient-to-b from-white/60 to-transparent pointer-events-none" />

      {/* Header */}
      <header className="px-4 pt-4 pb-2 z-10 flex-shrink-0">
        <div className="enamel-panel px-4 py-2 flex items-center justify-between relative overflow-hidden mb-2">
          {/* Subtly link theme to user with a side indicator */}
          <div className="absolute top-0 left-0 bottom-0 w-1.5" style={{ backgroundColor: activeColor }} />
          
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: activeColor }}>
                <User className="w-4 h-4" strokeWidth={2} />
             </div>
             <div>
                <p className="text-[8px] text-gray-400 font-bold tracking-widest uppercase mb-0.5">Sessão Ativa</p>
                <h1 className="text-sm font-medium tracking-tight leading-none text-gray-900">{user}</h1>
             </div>
          </div>
          
          <div className="flex items-center gap-2">
              {deferredPrompt && (
                <button 
                  onClick={handleInstallClick}
                  className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 hover:text-indigo-600 hover:bg-indigo-100 transition-colors border border-indigo-100 shadow-sm"
                  title="Instalar App"
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={2.5} />
                </button>
              )}
              {/* Settings moved to tabs */}
              <button 
                onClick={onLogout}
                className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-800 hover:bg-gray-100 transition-colors border border-gray-100 shadow-sm"
              >
                <LogOut className="w-3.5 h-3.5 mr-0.5" strokeWidth={2.5} />
              </button>
          </div>
        </div>

        {overdueTasks.length > 0 && (
           <div className="flex flex-col gap-1.5">
              {overdueTasks.slice(0, 2).map((t, i) => (
                  <div key={i} className="bg-red-50 text-red-500 rounded-full px-3 py-1.5 flex items-center gap-2 text-xs font-semibold shadow-sm border border-red-100 animate-pulse">
                     <AlertCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                     <span className="truncate">Atenção: {t?.task.nome_tarefa} está atrasado!</span>
                  </div>
              ))}
           </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 pb-4 pt-2 flex flex-col gap-3 z-10 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
        {currentTab === 'dashboard' && (
           <motion.div key="dashboard" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="flex flex-col gap-4">
              {/* Card Superior (Placar + Ações Rápidas) */}
              <section className="enamel-panel relative overflow-hidden shrink-0 flex flex-col pb-3">
                <div className="absolute top-10 -left-12 w-32 h-32 opacity-[0.06] blur-2xl pointer-events-none rounded-full" style={{ backgroundColor: activeColor }} />
                
                <div className="bg-gray-50/80 px-4 py-2 border-b border-gray-100 flex items-center justify-between mb-3">
                   <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Pontos & Ações</h2>
                </div>
                
                <div className="flex gap-3 px-3">
                  {/* Esquerda: Pontos */}
                  <div className="w-[30%] flex-shrink-0 flex flex-col justify-between border-r border-gray-100 pr-2 py-1">
                     <div className="z-10 flex flex-col justify-center h-full">
                       <div className="text-[44px] font-sans font-light leading-none tracking-tighter" style={{ color: activeColor }}>
                         {activeScore}
                       </div>
                     </div>
                     <div className="pt-2 z-10">
                        <div className="flex items-center gap-1 mb-1">
                           <p className="text-[8px] text-gray-400 uppercase tracking-widest font-semibold truncate">{partner}</p>
                           <button
                             onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setIsPartnerScoreVisible(true); }}
                             onPointerUp={(e) => { e.stopPropagation(); e.preventDefault(); setIsPartnerScoreVisible(false); }}
                             onPointerLeave={(e) => { e.stopPropagation(); e.preventDefault(); setIsPartnerScoreVisible(false); }}
                             onContextMenu={(e) => e.preventDefault()}
                             className="w-5 h-5 rounded-full flex items-center justify-center bg-gray-50 border border-gray-200 text-gray-400 active:bg-gray-100 transition-all outline-none cursor-pointer touch-none select-none"
                          >
                            {isPartnerScoreVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </button>
                        </div>
                        <div className="text-xl font-sans font-medium leading-none tracking-tight transition-all duration-150 origin-left"
                             style={{ color: partnerColor, filter: isPartnerScoreVisible ? 'blur(0px)' : 'blur(4px)', opacity: isPartnerScoreVisible ? 1 : 0.4, transform: isPartnerScoreVisible ? 'scale(1.05)' : 'scale(1)' }}>
                           {partnerScore}
                        </div>
                     </div>
                  </div>

                  {/* Direita: Grade de Ações */}
                  <div className="flex-1 grid grid-cols-4 gap-1.5 z-10 relative pb-1">
                    {[
                      { icon: Utensils, label: 'Jantar' }, { icon: Droplets, label: 'Louça' }, { icon: Trash2, label: 'Lixo' },
                      { icon: Shirt, label: 'Roupa' }, { icon: ShoppingCart, label: 'Mercado' }, { icon: Dog, label: 'Pet' },
                      { icon: Sparkles, label: 'Limpeza' }, { icon: Bed, label: 'Cama' }, { icon: Coffee, label: 'Café' },
                      { icon: Car, label: 'Carro' }, { icon: Leaf, label: 'Plantas' }, { icon: Plus, label: 'Outro' }
                    ].map((action, i) => (
                       <motion.button 
                         whileTap={{ scale: 0.92 }} onClick={(e) => { e.stopPropagation(); handleQuickAction(action.label); }}
                         key={i} className={`enamel-btn ${isRoger ? 'enamel-btn-roger' : 'enamel-btn-juliana'} flex flex-col items-center justify-center gap-0.5 rounded-xl outline-none transition-all`}
                         style={{ aspectRatio: '1/1' }}>
                          <action.icon className="w-4 h-4 text-white/90" strokeWidth={1.5} />
                          <span className="text-[7px] font-medium tracking-wide text-white/90 truncate w-full flex-shrink-0 text-center px-0.5">{action.label}</span>
                       </motion.button>
                    ))}
                  </div>
                </div>
              </section>
           </motion.div>
        )}
        
        {currentTab === 'chat' && (
           <motion.div key="chat" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="flex-1 flex flex-col bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden min-h-full">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <Sparkles className="w-4 h-4 text-indigo-400" />
                   <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">IA Concierge</span>
                 </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={chatRef}>
                 {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                       <div 
                          className={`px-3 py-2 text-sm max-w-[85%] ${
                             msg.role === 'user' 
                                ? 'rounded-2xl rounded-tr-sm text-white' 
                                : 'bg-gray-100 rounded-2xl rounded-tl-sm text-gray-700'
                          }`}
                          style={msg.role === 'user' ? { backgroundColor: activeColor } : {}}
                       >
                          {msg.text}
                       </div>
                    </div>
                 ))}
                 {isChatLoading && (
                    <div className="flex justify-start">
                       <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                       </div>
                    </div>
                 )}
              </div>
              
              <div className="p-3 border-t border-gray-100 bg-white">
                 <div className="flex items-center gap-2 bg-gray-50 rounded-full pl-4 pr-1.5 py-1.5 border border-gray-200 focus-within:border-gray-300 focus-within:bg-white transition-colors">
                    <input 
                       type="text" 
                       value={inputValue}
                       onChange={e => setInputValue(e.target.value)}
                       onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                       placeholder="Comando de voz ou texto..." 
                       className="bg-transparent flex-1 outline-none text-sm text-gray-800 placeholder:text-gray-400" 
                    />
                    <button 
                       onClick={(e) => { e.stopPropagation(); handleSendMessage(); }}
                       disabled={!inputValue.trim() || isChatLoading}
                       className="w-8 h-8 rounded-full flex items-center justify-center hover:opacity-80 transition-all text-white shrink-0 disabled:opacity-50"
                       style={{ backgroundColor: activeColor }}
                    >
                       <Send className="w-3.5 h-3.5 ml-[2px]" strokeWidth={2.5}/>
                    </button>
                 </div>
              </div>
           </motion.div>
        )}
        
        {currentTab === 'historico' && (
           <motion.div key="historico" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="flex-1 flex flex-col bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden min-h-full">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                 <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Histórico Completo</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                 {history.map((item) => (
                    <div key={item.id} className="flex items-center justify-between group">
                       <div className="flex items-center gap-3">
                          <div 
                             className="w-8 h-8 rounded-full flex flex-shrink-0 items-center justify-center text-white" 
                             style={{ backgroundColor: item.user === 'Roger' ? 'var(--roger-color)' : 'var(--juliana-color)' }}
                          >
                              <User className="w-4 h-4" strokeWidth={2} />
                          </div>
                          <div>
                             <p className="text-xs font-medium text-gray-900 leading-tight">
                                {item.user === user ? 'Você' : item.user} <span className="font-normal text-gray-600">{item.action}</span>
                             </p>
                             <p className="text-[10px] text-gray-400 mt-0.5">{item.time}</p>
                          </div>
                       </div>
                       
                       <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400">+{item.points}</span>
                          <button 
                             onClick={() => updateDoc(doc(db, 'logs', item.id), { status: 'deletado' })}
                             className="w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                             aria-label="Desfazer"
                          >
                             <X className="w-4 h-4" strokeWidth={2.5} />
                          </button>
                       </div>
                    </div>
                 ))}
                 
                 {history.length === 0 && (
                     <div className="py-10 flex flex-col items-center justify-center text-gray-400">
                         <p className="text-sm">Nenhum registro recente.</p>
                     </div>
                 )}
              </div>
           </motion.div>
        )}
        {currentTab === 'planejamento' && (
           <motion.div key="planejamento" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="flex-1 flex flex-col bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden min-h-full">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                 <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Rotinas & Base</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                  {tasks.length > 0 ? (
                     <div className="space-y-3 mb-6">
                        {tasks.map(task => (
                           <div key={task.id} className="flex items-center justify-between bg-white border border-gray-100 p-3 rounded-2xl shadow-sm">
                              <div>
                                 <p className="font-semibold text-gray-800 text-sm leading-none">{task.nome_tarefa}</p>
                                 <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider font-medium">
                                    Recorrente: {task.recorrencia_dias} {task.recorrencia_dias === 1 ? 'dia' : 'dias'} • {task.pontos} {task.pontos === 1 ? 'pt' : 'pts'}
                                 </p>
                              </div>
                              <button onClick={() => deleteDoc(doc(db, 'tasks', task.id!))} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                                 <Trash2 className="w-4 h-4" strokeWidth={2} />
                              </button>
                           </div>
                        ))}
                     </div>
                  ) : (
                     <p className="text-sm text-gray-500 text-center py-4">Nenhuma rotina base configurada.</p>
                  )}
                  
                  <div className="pt-4 border-t border-gray-100">
                     <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Adicionar Nova Base</h3>
                     <form onSubmit={async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        const nome_tarefa = formData.get('nome') as string;
                        const recorrencia_dias = parseInt(formData.get('recorrencia') as string, 10);
                        const pontos = parseInt(formData.get('pontos') as string, 10);
                        if (!nome_tarefa || isNaN(recorrencia_dias) || isNaN(pontos)) return;
                        try {
                           await addDoc(collection(db, 'tasks'), { nome_tarefa, recorrencia_dias, pontos });
                           e.currentTarget.reset();
                        } catch (err) { console.error("Erro ao adicionar task", err); }
                     }} className="space-y-3">
                        <input name="nome" placeholder="Nome (Ex: Limpar Quintal)" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-indigo-400 transition-all" />
                        <div className="flex gap-2">
                           <input name="recorrencia" type="number" min="1" placeholder="Dias rec." required className="w-1/2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800" />
                           <input name="pontos" type="number" min="1" placeholder="Pontos" required className="w-1/2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800" />
                        </div>
                        <button type="submit" className="w-full bg-gray-900 text-white rounded-xl py-2 flex items-center justify-center gap-2 text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm">
                           <Save className="w-4 h-4" /> Salvar
                        </button>
                     </form>
                  </div>

                  <div className="mt-6 pt-6 border-t border-gray-100">
                      <button onClick={popularHistoricoReal} disabled={isLoadingSeed} className="w-full bg-indigo-50 text-indigo-600 rounded-xl py-2 flex items-center justify-center gap-2 text-xs font-medium hover:bg-indigo-100 transition-colors shadow-sm">
                         {isLoadingSeed ? 'Carregando...' : 'Carregar Dados Iniciais (Simulação)'}
                      </button>
                  </div>
              </div>
           </motion.div>
        )}

        {currentTab === 'alertas' && (
           <motion.div key="alertas" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="flex-1 flex flex-col bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden min-h-full">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                 <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Mural de Alertas</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center">
                 <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center mb-4 text-purple-400 border border-purple-100">
                    <Bell className="w-8 h-8" />
                 </div>
                 <h3 className="text-sm font-semibold text-gray-800 mb-1">Nenhum Alerta Ativo</h3>
                 <p className="text-xs text-gray-500 max-w-[200px]">Os avisos do assistente IA e notificações importantes aparecerão aqui.</p>
              </div>
           </motion.div>
        )}
      </AnimatePresence>
      </main>

      {/* Tabs Bottom Navigation */}
      <nav className="absolute bottom-0 inset-x-0 h-[70px] bg-white border-t border-gray-100 flex items-center justify-between px-6 z-[100] rounded-t-3xl shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)]">
        <button onClick={() => setCurrentTab('dashboard')} className={`flex flex-col items-center gap-1 w-12 ${currentTab === 'dashboard' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
           <Home className="w-5 h-5" strokeWidth={currentTab === 'dashboard' ? 2.5 : 2} />
           <span className="text-[9px] font-medium tracking-wide">Início</span>
        </button>
        <button onClick={() => setCurrentTab('historico')} className={`flex flex-col items-center gap-1 w-12 ${currentTab === 'historico' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
           <Calendar className="w-5 h-5" strokeWidth={currentTab === 'historico' ? 2.5 : 2} />
           <span className="text-[9px] font-medium tracking-wide">Logs</span>
        </button>
        
        {/* Center Floating Action Button for Chat */}
        <div className="relative -top-5">
           <button onClick={() => setCurrentTab('chat')} className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-105 active:scale-95 transition-all outline-none" style={{ backgroundColor: currentTab === 'chat' ? activeColor : 'var(--roger-color)' }}>
              <Bot className="w-6 h-6" strokeWidth={2} />
           </button>
        </div>

        <button onClick={() => setCurrentTab('alertas')} className={`flex flex-col items-center gap-1 w-12 ${currentTab === 'alertas' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
           <Bell className="w-5 h-5" strokeWidth={currentTab === 'alertas' ? 2.5 : 2} />
           <span className="text-[9px] font-medium tracking-wide">Mural</span>
        </button>
        <button onClick={() => setCurrentTab('planejamento')} className={`flex flex-col items-center gap-1 w-12 ${currentTab === 'planejamento' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
           <Settings className="w-5 h-5" strokeWidth={currentTab === 'planejamento' ? 2.5 : 2} />
           <span className="text-[9px] font-medium tracking-wide">Rotina</span>
        </button>
      </nav>
    </motion.div>

    <AnimatePresence>
       {toastMessage && (
          <motion.div 
             initial={{ opacity: 0, y: -20 }}
             animate={{ opacity: 1, y: 0 }}
             exit={{ opacity: 0, y: -20 }}
             className="fixed top-4 left-1/2 -translate-x-1/2 z-[150] bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-start gap-3 min-w-[300px] max-w-[90vw]"
          >
              <AlertCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                 <p className="text-sm font-semibold leading-tight">{toastMessage.title}</p>
                 <p className="text-xs text-gray-300 mt-1">{toastMessage.body}</p>
              </div>
          </motion.div>
       )}
    </AnimatePresence>
    </>
  );
}

function Gateway({ onSelectUser }: { onSelectUser: (user: UserProfile) => void }) {
  const [isHuman, setIsHuman] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleCaptcha = () => {
    if (isHuman || checking) return;
    setChecking(true);
    setTimeout(() => {
        setIsHuman(true);
        setChecking(false);
    }, 1200);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[var(--bg-app)]">
      {/* Subtle atmospheric background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150vw] h-[150vw] max-w-[800px] max-h-[800px] rounded-full bg-gradient-to-tr from-indigo-100/30 w/50 to-pink-100/30 blur-[100px] pointer-events-none -z-10" />

      <motion.div 
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white shadow-sm mb-6 border border-gray-100">
            <Sparkles className="w-7 h-7 text-indigo-500" strokeWidth={1.5} />
          </div>
          <h1 className="text-[32px] font-light tracking-tight text-gray-900 mb-2 leading-none">Home AI</h1>
          <p className="text-gray-400 font-medium text-xs tracking-[0.15em] uppercase">Autenticação Segura</p>
        </div>

        {/* Captcha Box */}
        <div className="mb-8">
           <div 
             onClick={handleCaptcha}
             className={`bg-white border rounded-xl p-4 flex items-center justify-between cursor-pointer transition-all shadow-sm ${isHuman ? 'border-green-200 bg-green-50/30' : 'border-gray-200 hover:border-gray-300'}`}
           >
              <div className="flex items-center gap-3">
                 <div className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-colors ${isHuman ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                    {checking ? (
                       <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, ease: "linear", duration: 1 }} className="w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                    ) : isHuman ? (
                       <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    ) : null}
                 </div>
                 <span className={`text-sm font-medium ${isHuman ? 'text-green-700' : 'text-gray-600'}`}>
                    {isHuman ? 'Verificado com sucesso' : 'Sou humano'}
                 </span>
              </div>
              <div className="flex flex-col items-center">
                 <img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" alt="reCAPTCHA" className="w-6 opacity-30 grayscale" />
                 <span className="text-[8px] text-gray-400 mt-1">reCAPTCHA</span>
              </div>
           </div>
        </div>

        <div className={`flex flex-col gap-4 transition-all duration-500 ${isHuman ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-50 translate-y-4 pointer-events-none'}`}>
          <p className="text-center text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Selecione seu perfil</p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectUser('Roger')}
            className="enamel-btn enamel-btn-roger group flex items-center p-4 rounded-3xl w-full"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mr-4 group-hover:bg-white/20 transition-colors shadow-inner">
              <User className="w-5 h-5 text-white/90" strokeWidth={2} />
            </div>
            <div className="text-left">
              <span className="block text-lg font-medium tracking-tight">Roger</span>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectUser('Juliana')}
            className="enamel-btn enamel-btn-juliana group flex items-center p-4 rounded-3xl w-full"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mr-4 group-hover:bg-white/20 transition-colors shadow-inner">
              <User className="w-5 h-5 text-white/90" strokeWidth={2} />
            </div>
            <div className="text-left">
              <span className="block text-lg font-medium tracking-tight">Juliana</span>
            </div>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
