import React, { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, LogOut, Sparkles, User, Utensils, Droplets, Trash2, Plus, X, Shirt, ShoppingCart, Dog, Bed, Coffee, Car, Leaf, Settings, AlertCircle, Save, Download, Home, Calendar, Bell, Target, ChevronDown, ChevronUp, Bot } from 'lucide-react';
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
  icone?: string;
}

const AVAILABLE_ICONS = [
  { name: 'Utensils', icon: Utensils },
  { name: 'Droplets', icon: Droplets },
  { name: 'Trash2', icon: Trash2 },
  { name: 'Shirt', icon: Shirt },
  { name: 'ShoppingCart', icon: ShoppingCart },
  { name: 'Dog', icon: Dog },
  { name: 'Sparkles', icon: Sparkles },
  { name: 'Bed', icon: Bed },
  { name: 'Coffee', icon: Coffee },
  { name: 'Car', icon: Car },
  { name: 'Leaf', icon: Leaf },
];

const ICON_MAP: Record<string, any> = {
  jantar: Utensils,
  louça: Droplets,
  louca: Droplets,
  lixo: Trash2,
  roupa: Shirt,
  mercado: ShoppingCart,
  compras: ShoppingCart,
  pet: Dog,
  cachorro: Dog,
  limp: Sparkles,
  faxin: Sparkles,
  casa: Sparkles,
  cama: Bed,
  café: Coffee,
  cafe: Coffee,
  carro: Car,
  planta: Leaf,
  jardim: Leaf,
};

const getIconForTask = (name: string, iconName?: string) => {
   if (iconName) {
      const match = AVAILABLE_ICONS.find(i => i.name === iconName);
      if (match) return match.icon;
   }
   const key = name.toLowerCase();
   for (const [k, v] of Object.entries(ICON_MAP)) {
      if (key.includes(k)) return v;
   }
   return Plus;
};

export default function App() {
  const [activeUser, setActiveUser] = useState<UserProfile>(null);

  if (!activeUser) {
    return <Gateway onSelectUser={setActiveUser} />;
  }

  return <Dashboard user={activeUser} onLogout={() => setActiveUser(null)} />;
}

function Dashboard({ user, onLogout }: { user: NonNullable<UserProfile>; onLogout: () => void }) {
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'historico' | 'planejamento' | 'alertas' | 'configuracoes'>('dashboard');

  const [isPartnerScoreVisible, setIsPartnerScoreVisible] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'Tudo' | 'Roger' | 'Juliana'>('Tudo');
  const [tasks, setTasks] = useState<TaskDef[]>([]);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Dashboard State
  const [dashboardTimeFilter, setDashboardTimeFilter] = useState<'Dia' | 'Semana' | 'Mês'>('Dia');
  const [expandedDashboardSection, setExpandedDashboardSection] = useState<'placar' | 'atividades' | null>('placar');

  // Config Form State
  const [newTaskName, setNewTaskName] = useState('');
  const [newSelectedIcon, setNewSelectedIcon] = useState('Utensils');
  const [newTaskDifficulty, setNewTaskDifficulty] = useState(1);
  const [expandedConfigSection, setExpandedConfigSection] = useState<'gerenciar' | 'recorrentes' | null>('gerenciar');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ type: 'log' | 'task', id: string, label: string } | null>(null);

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation) return;
    const { type, id } = deleteConfirmation;
    try {
      if (type === 'task') {
        await deleteDoc(doc(db, 'tasks', id));
      } else if (type === 'log') {
        await updateDoc(doc(db, 'logs', id), { status: 'deletado' });
      }
    } catch(err) {
      console.error("Erro ao deletar", err);
    }
    setDeleteConfirmation(null);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput('');
    setIsChatting(true);
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: msg }]);

    try {
        const responseText = await generateChatResponse(
            user,
            messages,
            msg,
            async (dados) => {
                if (dados.confirmacao_necessaria) {
                    return `Não encontrei a categoria "${dados.nome_tarefa}". Deseja que eu a cadastre com qual dificuldade (1 a 5)?`;
                }
                
                // If it's a new task creation request within registrar_tarefa!
                if (dados.dificuldade) {
                    // Try to guess a good icon since it's missing (or default)
                    await addDoc(collection(db, 'tasks'), {
                        nome_tarefa: dados.nome_tarefa,
                        icone: 'Sparkles', // default
                        pontos: dados.dificuldade,
                        recorrencia_dias: 0
                    });
                    
                    await addDoc(collection(db, "logs"), {
                        user: dados.usuario || user,
                        action: dados.nome_tarefa,
                        points: dados.dificuldade,
                        timestamp: serverTimestamp(),
                        status: 'ativo'
                    });
                    return `Criei a categoria "${dados.nome_tarefa}" com dificuldade ${dados.dificuldade} e já registrei no placar!`;
                }

                // Normal registration
                const foundTask = tasks.find(t => t.nome_tarefa.toLowerCase() === dados.nome_tarefa?.toLowerCase());
                if (!foundTask) {
                    return `Não encontrei a tarefa "${dados.nome_tarefa}" na sua lista atual. Deseja que eu a cadastre com qual dificuldade (1 a 5)?`;
                }
                
                await addDoc(collection(db, "logs"), {
                    user: dados.usuario || user,
                    action: foundTask.nome_tarefa,
                    points: foundTask.pontos,
                    timestamp: serverTimestamp(),
                    status: 'ativo'
                });
                return `Pronto, registrei a tarefa e adicionei os ${foundTask.pontos} pontos!`;
            },
            async (dados) => {
                await addDoc(collection(db, "alerts"), {
                    message: dados.mensagem,
                    from_user: dados.de_usuario || user,
                    timestamp: serverTimestamp()
                });
            }
        );
        
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: responseText }]);
    } catch (e) {
        console.error("Erro no chat", e);
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: 'Desculpe, tive um problema de comunicação. Tente novamente.' }]);
    } finally {
        setIsChatting(false);
    }
  };

  useEffect(() => {
     if (isChatOpen && messagesEndRef.current) {
         messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
     }
  }, [messages, isChatOpen]);

  const [toastMessage, setToastMessage] = useState<{title: string, body: string} | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

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
       const newHistory: any[] = [];
       
       snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data.status === 'deletado') return; // Ignore soft-deleted items
          
          newHistory.push({
             id: docSnap.id,
             ...data,
          });
       });
       
       setHistory(newHistory);
    }, (error) => {
       console.error("Erro ao sincronizar logs Firestore:", error);
    });
    
    // Subscribe to alerts collection
    const qAlerts = query(collection(db, 'alerts'), orderBy('timestamp', 'desc'));
    const unsubscribeAlerts = onSnapshot(qAlerts, (snapshot) => {
       const newAlerts: any[] = [];
       snapshot.forEach(docSnap => {
          newAlerts.push({
             id: docSnap.id,
             ...docSnap.data(),
          });
       });
       setAlerts(newAlerts);
    }, (error) => {
       console.error("Erro ao sincronizar alerts Firestore:", error);
    });
    
    return () => {
        unsubscribeTasks();
        unsubscribeLogs();
        unsubscribeAlerts();
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

  const isRoger = user === 'Roger';
  const partner = isRoger ? 'Juliana' : 'Roger';
  
  const activeColor = isRoger ? 'var(--roger-color)' : 'var(--juliana-color)';
  const activeBgColor = isRoger ? 'rgba(15, 23, 42, 0.3)' : 'rgba(157, 23, 77, 0.3)';
  const partnerColor = isRoger ? 'var(--juliana-color)' : 'var(--roger-color)';

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const filterDate = dashboardTimeFilter === 'Dia' ? startOfDay : dashboardTimeFilter === 'Semana' ? startOfWeek : startOfMonth;

  let activeScore = 0;
  let partnerScore = 0;

  history.forEach(item => {
     if (!item.timestamp || !item.timestamp.toDate) return;
     const itemDate = item.timestamp.toDate();
     if (itemDate >= filterDate) {
        if (item.user === user) activeScore += (item.points || 1);
        if (item.user === partner) partnerScore += (item.points || 1);
     }
  });

  const todaysHistory = history.filter(item => {
     if (!item.timestamp || !item.timestamp.toDate) return false;
     return item.timestamp.toDate() >= startOfDay;
  }).slice(0, 5);

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

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    try {
      await addDoc(collection(db, 'tasks'), {
        nome_tarefa: newTaskName.trim(),
        pontos: newTaskDifficulty,
        icone: newSelectedIcon,
        recorrencia_dias: 0
      });
      setNewTaskName('');
      setNewSelectedIcon('Utensils');
      setNewTaskDifficulty(1);
    } catch (err) {
      console.error("Erro ao adicionar task", err);
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
           <motion.div key="dashboard" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="flex flex-col gap-4 flex-1 overflow-y-auto hide-scrollbar pb-24">
              {/* Card Superior (Placar + Ações Rápidas) */}
              <section className={`enamel-panel relative overflow-hidden shrink-0 flex flex-col transition-all duration-300 ${expandedDashboardSection === 'placar' ? 'pb-3' : 'cursor-pointer hover:border-gray-300'}`}>
                <div className="absolute top-10 -left-12 w-32 h-32 opacity-[0.06] blur-2xl pointer-events-none rounded-full" style={{ backgroundColor: activeColor }} />
                
                <div 
                   className={`bg-gray-50/80 px-4 flex items-center justify-between border-b border-gray-100 transition-all cursor-pointer ${expandedDashboardSection === 'placar' ? 'mb-3 py-2' : 'py-3'}`}
                   onClick={() => setExpandedDashboardSection(prev => prev === 'placar' ? null : 'placar')}
                >
                   <div className="flex items-center gap-2">
                       <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Pontos & Ações</h2>
                   </div>
                   {expandedDashboardSection === 'placar' ? (
                       <div className="flex bg-gray-200/50 p-0.5 rounded-lg">
                          {['Dia', 'Semana', 'Mês'].map(f => (
                             <button 
                               key={f}
                               onClick={(e) => { e.stopPropagation(); setDashboardTimeFilter(f as any); }}
                               className={`text-[8px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md transition-all ${dashboardTimeFilter === f ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
                             >
                                {f}
                             </button>
                          ))}
                       </div>
                   ) : (
                       <button className="text-gray-400">
                          <ChevronDown className="w-5 h-5" />
                       </button>
                   )}
                </div>
                
                <AnimatePresence>
                {expandedDashboardSection === 'placar' && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                
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
                      ...tasks.map(t => ({ icon: getIconForTask(t.nome_tarefa, t.icone), label: t.nome_tarefa, isOther: false })),
                      ...(tasks.some(t => t.nome_tarefa.toLowerCase() === 'outro') ? [] : [{ icon: Plus, label: 'Outro', isOther: true }])
                    ].map((action, i) => (
                       <motion.button 
                         whileTap={{ scale: 0.92 }} onClick={(e) => { e.stopPropagation(); handleQuickAction(action.label); }}
                         key={i} className={`enamel-btn ${isRoger ? 'enamel-btn-roger' : 'enamel-btn-juliana'} flex flex-col items-center justify-center gap-0.5 rounded-xl outline-none transition-all ${action.isOther ? 'opacity-80' : ''}`}
                         style={{ aspectRatio: '1/1' }}>
                          <action.icon className="w-4 h-4 text-white/90" strokeWidth={1.5} />
                          <span className="text-[7px] font-medium tracking-wide text-white/90 truncate w-full flex-shrink-0 text-center px-0.5">{action.label}</span>
                       </motion.button>
                    ))}
                  </div>
                </div>
                </motion.div>
                )}
                </AnimatePresence>
              </section>

              {/* Accordion: Atividade de Hoje */}
              <section className={`enamel-panel flex flex-col shrink-0 transition-all duration-300 rounded-3xl overflow-hidden ${expandedDashboardSection === 'atividades' ? 'py-3' : 'cursor-pointer hover:border-gray-300'}`}>
                 <div 
                    className={`px-4 flex items-center justify-between transition-all cursor-pointer ${expandedDashboardSection === 'atividades' ? 'mb-3' : 'py-3'}`}
                    onClick={() => setExpandedDashboardSection(prev => prev === 'atividades' ? null : 'atividades')}
                 >
                    <div className="flex items-center gap-2">
                       <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Atividade de Hoje</h2>
                    </div>
                    <button className="text-gray-400">
                       {expandedDashboardSection === 'atividades' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                 </div>

                 <AnimatePresence>
                 {expandedDashboardSection === 'atividades' && (
                 <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 overflow-hidden flex flex-col gap-2">
                    {todaysHistory.length > 0 ? todaysHistory.map((item) => {
                       const TaskIcon = getIconForTask(item.action);
                       return (
                          <div key={item.id} className="flex items-center bg-gray-50/50 border border-gray-100 p-2.5 rounded-2xl gap-3">
                             <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-gray-100/50 shadow-sm text-white" style={{ backgroundColor: item.user === 'Roger' ? 'var(--roger-color)' : 'var(--juliana-color)' }}>
                                <TaskIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                             </div>
                             <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-800 text-xs leading-none truncate">{item.action}</p>
                                <p className="text-[9px] text-gray-400 mt-0.5">{item.user} • {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleString('pt-BR', { timeStyle: 'short' }) : 'agora'}</p>
                             </div>
                             <span className="text-[10px] font-bold text-gray-400">+{item.points}</span>
                          </div>
                       )
                    }) : (
                       <p className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-2xl">Nenhuma atividade registrada hoje.</p>
                    )}
                    
                    <button 
                       onClick={() => setCurrentTab('historico')}
                       className="mt-1 w-full text-[10px] font-semibold text-indigo-500 uppercase tracking-wider py-2 hover:bg-indigo-50 rounded-xl transition-colors"
                    >
                       Ver histórico completo &rarr;
                    </button>
                 </motion.div>
                 )}
                 </AnimatePresence>
              </section>
           </motion.div>
        )}
        
        {currentTab === 'historico' && (
           <motion.div key="historico" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="flex-1 flex flex-col bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden min-h-full">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                 <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Histórico Completo</h2>
                 <div className="flex bg-gray-200/50 p-0.5 rounded-lg">
                    {['Tudo', 'Roger', 'Juliana'].map(f => (
                       <button 
                         key={f}
                         onClick={() => setHistoryFilter(f as any)}
                         className={`text-[9px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md transition-all ${historyFilter === f ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
                       >
                          {f}
                       </button>
                    ))}
                 </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                 {history.filter(h => historyFilter === 'Tudo' || h.user === historyFilter).map((item) => (
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
                             <p className="text-[10px] text-gray-400 mt-0.5">
                                {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : item.time}
                             </p>
                          </div>
                       </div>
                       
                       <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400">+{item.points}</span>
                          <button 
                             onClick={() => setDeleteConfirmation({ type: 'log', id: item.id, label: `${item.action} (${item.user})` })}
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
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80 sticky top-0 z-20 flex items-center gap-2">
                 <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-500">
                    <Bot className="w-3.5 h-3.5" />
                 </div>
                 <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Home AI</h2>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/30 hide-scrollbar pb-24 flex flex-col">
                 <div className="flex-1 flex flex-col justify-end min-h-full">
                     {messages.length === 0 ? (
                        <div className="text-center py-6 my-auto">
                           <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 border border-gray-100 mx-auto shadow-sm">
                              <Bot className="w-8 h-8 text-indigo-500" strokeWidth={1.5} />
                           </div>
                           <h2 className="text-lg font-medium text-gray-800 mb-1">Como posso ajudar?</h2>
                           <p className="text-xs text-gray-500 max-w-[200px] mx-auto">Ex: "lavei a louça", "avise o Roger que o lixo encheu"</p>
                        </div>
                     ) : (
                        <div className="space-y-3">
                           {messages.map(m => (
                              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm font-medium leading-relaxed ${m.role === 'user' ? 'bg-indigo-500 text-white rounded-br-sm' : 'bg-white border border-gray-100 text-gray-700 shadow-sm rounded-bl-sm'}`}>
                                     {m.text}
                                  </div>
                              </div>
                           ))}
                           {isChatting && (
                              <div className="flex justify-start">
                                 <div className="bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm flex items-center gap-1.5 text-gray-400">
                                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                                 </div>
                              </div>
                           )}
                        </div>
                     )}
                     <div ref={messagesEndRef} className="h-4" />
                 </div>
              </div>
              
              <div className="p-3 border-t border-gray-100 bg-white sticky bottom-0 z-20">
                  <div className="flex items-center gap-2 bg-gray-50 rounded-2xl p-1.5 border border-gray-100 focus-within:border-indigo-200 focus-within:ring-2 focus-within:ring-indigo-100/50 transition-all shadow-sm">
                     <input 
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Escreva sua mensagem..."
                        className="flex-1 bg-transparent border-none text-sm text-gray-800 px-3 py-2 flex-shrink min-w-0 focus:outline-none placeholder:text-gray-400 font-medium"
                     />
                     <button 
                        disabled={!chatInput.trim() || isChatting}
                        onClick={handleSendMessage}
                        className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center shrink-0 disabled:opacity-50 shadow-md transition-all active:scale-95"
                     >
                        <Bot className="w-5 h-5" />
                     </button>
                  </div>
              </div>
           </motion.div>
        )}

        {currentTab === 'alertas' && (
           <motion.div key="alertas" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="flex-1 flex flex-col bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden min-h-full">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80 sticky top-0 z-20">
                 <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Mural de Alertas</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24 hide-scrollbar">
                 {alerts.length > 0 ? alerts.map((alerta) => (
                    <div key={alerta.id} className="bg-yellow-50/50 border border-yellow-100/60 p-4 rounded-2xl relative shadow-sm">
                        <div className="flex items-start gap-3">
                           <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center shrink-0 text-yellow-600">
                               <Bell className="w-4 h-4" />
                           </div>
                           <div className="flex-1 pt-0.5 min-w-0">
                               <p className="text-sm text-gray-800 font-medium leading-relaxed">{alerta.message}</p>
                               <p className="text-[10px] font-semibold tracking-wider uppercase text-gray-400 mt-2">
                                   DE: {alerta.from_user} • {alerta.timestamp?.toDate ? alerta.timestamp.toDate().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'agora'}
                               </p>
                           </div>
                        </div>
                    </div>
                 )) : (
                    <div className="flex flex-col items-center justify-center text-center py-10">
                        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                           <Bell className="w-5 h-5 text-gray-400" />
                        </div>
                        <p className="text-sm text-gray-500 font-medium">Nenhum alerta no momento.</p>
                    </div>
                 )}
              </div>
           </motion.div>
        )}

        {currentTab === 'configuracoes' && (
           <motion.div key="configuracoes" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="flex flex-col gap-4 flex-1 overflow-y-auto hide-scrollbar pb-24">
                 
                 {/* Accordion: Gerenciar Tarefas */}
                 <section className={`enamel-panel flex flex-col shrink-0 transition-all duration-300 rounded-3xl overflow-hidden ${expandedConfigSection === 'gerenciar' ? 'py-3' : 'cursor-pointer hover:border-gray-300'}`}>
                    <div 
                       className={`bg-gray-50/80 px-4 flex items-center justify-between border-b border-gray-100 transition-all cursor-pointer ${expandedConfigSection === 'gerenciar' ? 'mb-3 py-2' : 'py-3'}`}
                       onClick={() => setExpandedConfigSection(prev => prev === 'gerenciar' ? null : 'gerenciar')}
                    >
                       <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-gray-400 border border-gray-100 shadow-sm">
                              <Target className="w-3.5 h-3.5" />
                           </div>
                           <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Gerenciar Tarefas</h2>
                       </div>
                       <button className="text-gray-400">
                          {expandedConfigSection === 'gerenciar' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                       </button>
                    </div>

                    <AnimatePresence>
                    {expandedConfigSection === 'gerenciar' && (
                       <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 space-y-6 overflow-hidden">
                          {/* Form de Cadastro */}
                          <form onSubmit={handleCreateTask} className="bg-gray-50/50 border border-gray-100 rounded-3xl p-4 shadow-inner space-y-5">
                             <div>
                                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Nome</label>
                                <input 
                                   value={newTaskName}
                                   onChange={e => setNewTaskName(e.target.value)}
                                   placeholder="Ex: Arrumar Cama" 
                                   required 
                                   className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-medium placeholder:font-normal shadow-sm" 
                                />
                             </div>

                             <div>
                                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Ícone</label>
                                <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 px-1 -mx-1 snap-x">
                                   {AVAILABLE_ICONS.map(({ name, icon: Icon }) => (
                                      <button
                                         key={name}
                                         type="button"
                                         onClick={() => setNewSelectedIcon(name)}
                                         className={`snap-start shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${newSelectedIcon === name ? 'text-white shadow-md scale-105' : 'bg-white text-gray-400 hover:bg-gray-50 border border-gray-100 shadow-sm'}`}
                                         style={newSelectedIcon === name ? { backgroundColor: activeColor } : {}}
                                      >
                                         <Icon className="w-5 h-5" strokeWidth={newSelectedIcon === name ? 2.5 : 2} />
                                      </button>
                                   ))}
                                </div>
                             </div>

                             <div>
                                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Dificuldade (Pontos)</label>
                                <div className="flex gap-2">
                                   {[1, 2, 3, 4, 5].map(pt => (
                                      <button
                                         key={pt}
                                         type="button"
                                         onClick={() => setNewTaskDifficulty(pt)}
                                         className={`flex-1 h-12 rounded-2xl flex items-center justify-center font-bold transition-all duration-300 ${newTaskDifficulty === pt ? 'text-white shadow-md scale-105' : 'bg-white text-gray-400 hover:bg-gray-50 border border-gray-100 shadow-sm'}`}
                                         style={newTaskDifficulty === pt ? { backgroundColor: activeColor } : {}}
                                      >
                                         {pt}
                                      </button>
                                   ))}
                                </div>
                             </div>

                             <button 
                               type="submit" 
                               disabled={!newTaskName.trim()}
                               className={`enamel-btn ${isRoger ? 'enamel-btn-roger' : 'enamel-btn-juliana'} w-full rounded-2xl py-3.5 flex items-center justify-center gap-2 text-sm font-semibold transition-all disabled:opacity-50`}
                             >
                                <Plus className="w-4 h-4" strokeWidth={2.5} /> Adicionar
                             </button>
                          </form>

                          {/* Lista Atual */}
                          <div className="space-y-3">
                             <div className="flex items-center justify-between mb-2">
                                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ações Mapeadas</h3>
                                <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">{tasks.length} {tasks.length === 1 ? 'item' : 'itens'}</span>
                             </div>
                             {tasks.length > 0 ? (
                                <div className="grid gap-2">
                                   {tasks.map(task => {
                                      const TaskIcon = getIconForTask(task.nome_tarefa, task.icone);
                                      return (
                                         <div key={task.id} className="flex items-center bg-gray-50/50 border border-gray-100 p-3 rounded-2xl gap-3 transition-all hover:bg-gray-50">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white text-gray-500 shrink-0 border border-gray-100 shadow-sm">
                                               <TaskIcon className="w-4 h-4" strokeWidth={2} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                               <p className="font-semibold text-gray-800 text-sm leading-tight truncate">{task.nome_tarefa}</p>
                                               <div className="flex items-center gap-1.5 mt-1 min-w-0">
                                                  <div className="flex items-center gap-0.5">
                                                     {[...Array(5)].map((_, i) => (
                                                        <div key={i} className={`w-1 h-1 rounded-full ${i < task.pontos ? 'bg-indigo-400' : 'bg-gray-300'}`} />
                                                     ))}
                                                  </div>
                                                  <span className="text-[9px] text-gray-400 font-medium whitespace-nowrap uppercase">
                                                     {task.pontos} {task.pontos === 1 ? 'pt' : 'pts'}
                                                  </span>
                                               </div>
                                            </div>
                                            <button 
                                              onClick={() => setDeleteConfirmation({ type: 'task', id: task.id!, label: task.nome_tarefa })} 
                                              className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                                            >
                                               <Trash2 className="w-4 h-4" strokeWidth={2} />
                                            </button>
                                         </div>
                                      )
                                   })}
                                </div>
                             ) : (
                                <div className="border border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                                   <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mb-2">
                                      <Target className="w-4 h-4 text-gray-400" />
                                   </div>
                                   <p className="text-[11px] text-gray-500 font-medium">Nenhuma tarefa criada</p>
                                </div>
                             )}
                          </div>
                          <div className="h-2"></div>
                       </motion.div>
                    )}
                    </AnimatePresence>
                 </section>

                 {/* Accordion: Recorrentes */}
                 <section className={`enamel-panel flex flex-col shrink-0 transition-all duration-300 rounded-3xl overflow-hidden ${expandedConfigSection === 'recorrentes' ? 'py-3' : 'cursor-pointer hover:border-gray-300'}`}>
                    <div 
                       className={`bg-gray-50/80 px-4 flex items-center justify-between border-b border-gray-100 transition-all cursor-pointer ${expandedConfigSection === 'recorrentes' ? 'mb-3 py-2' : 'py-3'}`}
                       onClick={() => setExpandedConfigSection(prev => prev === 'recorrentes' ? null : 'recorrentes')}
                    >
                       <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-gray-400 border border-gray-100 shadow-sm">
                              <Calendar className="w-3.5 h-3.5" />
                           </div>
                           <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Tarefas Recorrentes</h2>
                       </div>
                       <button className="text-gray-400">
                          {expandedConfigSection === 'recorrentes' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                       </button>
                    </div>

                    <AnimatePresence>
                    {expandedConfigSection === 'recorrentes' && (
                       <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 overflow-hidden">
                           <div className="bg-gradient-to-br from-indigo-50/50 to-purple-50/50 border border-indigo-100/50 rounded-2xl p-6 text-center shadow-inner relative overflow-hidden">
                              <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-100 rounded-full blur-3xl opacity-50 pointer-events-none" />
                              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mb-3 mx-auto shadow-sm border border-indigo-50 relative z-10 text-indigo-400">
                                  <Calendar className="w-6 h-6" strokeWidth={1.5} />
                              </div>
                              <h4 className="text-sm font-semibold text-gray-800 mb-2 relative z-10">🚧 Em Construção</h4>
                              <p className="text-xs text-gray-500 relative z-10 leading-relaxed max-w-[240px] mx-auto">
                                 Em breve você poderá agendar tarefas de Limpeza Pesada, fechar a semana e programar lembretes.
                              </p>
                           </div>
                           <div className="h-2"></div>
                       </motion.div>
                    )}
                    </AnimatePresence>
                 </section>

           </motion.div>
        )}
      </AnimatePresence>
      </main>



      {/* Tabs Bottom Navigation */}
      <nav className="absolute bottom-0 inset-x-0 h-[70px] bg-white border-t border-gray-100 flex items-center justify-around px-2 z-[100] rounded-t-3xl shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)]">
        <button onClick={() => setCurrentTab('dashboard')} className={`flex flex-col items-center justify-center gap-1 w-14 h-full ${currentTab === 'dashboard' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
           <Home className="w-5 h-5" strokeWidth={currentTab === 'dashboard' ? 2.5 : 2} />
           <span className="text-[9px] font-medium tracking-wide">Início</span>
        </button>
        <button onClick={() => setCurrentTab('historico')} className={`flex flex-col items-center justify-center gap-1 w-14 h-full ${currentTab === 'historico' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
           <Calendar className="w-5 h-5" strokeWidth={currentTab === 'historico' ? 2.5 : 2} />
           <span className="text-[9px] font-medium tracking-wide">Histórico</span>
        </button>
        <button onClick={() => setCurrentTab('planejamento')} className={`flex flex-col items-center justify-center gap-1 w-14 h-full ${currentTab === 'planejamento' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
           <Bot className="w-5 h-5" strokeWidth={currentTab === 'planejamento' ? 2.5 : 2} />
           <span className="text-[9px] font-medium tracking-wide">Assistente</span>
        </button>
        <button onClick={() => setCurrentTab('alertas')} className={`flex flex-col items-center justify-center gap-1 w-14 h-full ${currentTab === 'alertas' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
           <Bell className="w-5 h-5" strokeWidth={currentTab === 'alertas' ? 2.5 : 2} />
           <span className="text-[9px] font-medium tracking-wide">Alertas</span>
        </button>
        <button onClick={() => setCurrentTab('configuracoes')} className={`flex flex-col items-center justify-center gap-1 w-14 h-full ${currentTab === 'configuracoes' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
           <Settings className="w-5 h-5" strokeWidth={currentTab === 'configuracoes' ? 2.5 : 2} />
           <span className="text-[9px] font-medium tracking-wide">Config</span>
        </button>
      </nav>
    </motion.div>

    <AnimatePresence>
       {deleteConfirmation && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
             <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-3xl w-full max-w-[320px] shadow-2xl p-6 flex flex-col items-center text-center border border-gray-100"
             >
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4 border border-red-100">
                    <Trash2 className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                   {deleteConfirmation.type === 'task' ? 'Excluir Tarefa?' : 'Remover Registro?'}
                </h3>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                   {deleteConfirmation.type === 'task' 
                     ? `Deseja excluir permanentemente a tarefa "${deleteConfirmation.label}"?` 
                     : `Deseja remover este registro do histórico permanentemente?`}
                </p>
                <div className="flex gap-3 w-full">
                   <button 
                      onClick={() => setDeleteConfirmation(null)}
                      className="flex-1 py-3.5 rounded-2xl font-medium text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
                   >
                      Cancelar
                   </button>
                   <button 
                      onClick={handleDeleteConfirm}
                      className="flex-1 py-3.5 rounded-2xl font-medium text-sm text-white bg-red-500 hover:bg-red-600 shadow-[0_4px_14px_0_rgba(239,68,68,0.39)] transition-all"
                   >
                      Confirmar
                   </button>
                </div>
             </motion.div>
          </div>
       )}
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleCaptcha = () => {
    if (isHuman || checking) return;
    setChecking(true);
    setTimeout(() => {
        setIsHuman(true);
        setChecking(false);
    }, 1200);
  };

  const isFormValid = email.length > 0 && password.length > 0 && isHuman;

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
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white shadow-sm mb-6 border border-gray-100">
            <Bot className="w-7 h-7 text-indigo-500" strokeWidth={1.5} />
          </div>
          <h1 className="text-[32px] font-light tracking-tight text-gray-900 mb-2 leading-none">Home AI</h1>
          <p className="text-gray-400 font-medium text-xs tracking-[0.15em] uppercase">Autenticação Segura</p>
        </div>

        {/* Mock Login Fields */}
        <div className="flex flex-col gap-3 mb-6">
           <input 
             type="text" 
             value={email}
             onChange={e => setEmail(e.target.value)}
             placeholder="E-mail da Família" 
             className="w-full bg-white/60 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm"
           />
           <input 
             type="password" 
             value={password}
             onChange={e => setPassword(e.target.value)}
             placeholder="Senha de Acesso" 
             className="w-full bg-white/60 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm"
           />
        </div>

        {/* Captcha Box */}
        <div className="mb-6">
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

        <div className={`flex flex-col gap-3 transition-all duration-500 ${isFormValid ? 'opacity-100 translate-y-0 pointer-events-auto filter-none' : 'opacity-40 translate-y-4 pointer-events-none grayscale blur-[1px]'}`}>
          <p className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Entrar como</p>
          <div className="grid grid-cols-2 gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectUser('Roger')}
             className="enamel-btn enamel-btn-roger group flex flex-col items-center justify-center py-4 rounded-2xl w-full"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-2 group-hover:bg-white/20 transition-colors shadow-inner">
              <User className="w-5 h-5 text-white/90" strokeWidth={2} />
            </div>
            <span className="block text-sm font-medium tracking-tight">Roger</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectUser('Juliana')}
            className="enamel-btn enamel-btn-juliana group flex flex-col items-center justify-center py-4 rounded-2xl w-full"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-2 group-hover:bg-white/20 transition-colors shadow-inner">
              <User className="w-5 h-5 text-white/90" strokeWidth={2} />
            </div>
            <span className="block text-sm font-medium tracking-tight">Juliana</span>
          </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
