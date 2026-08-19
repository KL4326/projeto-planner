import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, onSnapshot, doc, getDoc, getDocs, deleteDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCvK8uUxUhvmV760B6cul981BD8CADqPpE",
  authDomain: "projeto-planner-966ca.firebaseapp.com",
  projectId: "projeto-planner-966ca",
  storageBucket: "projeto-planner-966ca.firebasestorage.app",
  messagingSenderId: "116304178516",
  appId: "1:116304178516:web:1f3a6fe922f03b98ea2cc1"
};

const fb = initializeApp(firebaseConfig);
const db = getFirestore(fb);
const auth = getAuth(fb);

const app = {
    allTasks: [], 
    userMap: {},
    allLogs: [],
    logFilter: 'Todos',
    globalTasksUnsub: null,

    init() { 
        this.bindEvents(); 
        this.checkAuth(); 
        this.initTheme(); 
    },
    
    initTheme() { 
        if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark'); 
        const savedColor = localStorage.getItem('primaryColor');
        if (savedColor) document.documentElement.style.setProperty('--color-primary', savedColor);
    },

    getTodayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    getUserData(val) {
        if (!val) return { nome: 'Desconhecido', foto: null, uid: '' };
        let u = app.userMap[val];
        if (!u) u = Object.values(app.userMap).find(x => x.nome === val);
        return u || { nome: val, foto: null, uid: val };
    },

   navigate(pageId) {
        // Esconde todas as seções que possuem a classe .page-section
        document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
        
        // Remove a classe 'active' de todas as seções (se ainda estiver usando)
        document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));

        // Mostra apenas a seção solicitada
        const target = document.getElementById(`page-${pageId}`);
        if(target) {
            target.classList.remove('hidden');
            target.classList.add('active');
        }
        
        // Gerencia o estilo visual dos botões do menu lateral
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.className = "nav-btn text-left w-full flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant font-medium hover:bg-surface-container-high hover:text-primary transition-colors";
        });
        const activeBtn = document.getElementById(`nav-btn-${pageId}`);
        if(activeBtn) {
            activeBtn.className = "nav-btn text-left w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-container-high text-primary font-bold scale-95 transition-all";
        }
        
        // Executa funções de renderização específicas se necessário
        if(pageId === 'dashboard') { this.renderDashboard(); }
        
        window.scrollTo(0,0);
    },

    async handleLogin(e) {
        if(e) e.preventDefault();
        try {
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            await signInWithEmailAndPassword(auth, email, pass);
        } catch(err) {
            app.showToast("Email ou senha incorretos", "error");
        }
    },

    bindEvents() {
        const lf = document.getElementById('login-form');
        if(lf) lf.addEventListener('submit', (e) => app.handleLogin(e));
    },

    checkAuth() { 
        onAuthStateChanged(auth, async (u) => { 
            const pLogin = document.getElementById('page-login'); 
            const appL = document.getElementById('app-layout'); 
            if(u){ 
                if(pLogin) pLogin.classList.add('hidden'); 
                if(appL) appL.classList.remove('hidden'); 
                
                try {
                    const ud = await getDoc(doc(db, "usuarios", u.uid));
                    let userName = u.displayName || u.email;
                    let userFoto = u.photoURL;

                    if(ud.exists()) {
                        const data = ud.data();
                        if(data.nome) userName = data.nome;
                        if(data.foto) userFoto = data.foto; 
                    }
                    
                    const sn = document.getElementById('sidebar-name');
                    if(sn) sn.innerText = userName;
                    app.updateAvatar(u, userFoto, userName);
                } catch(e) { console.error(e); }
                
                app.listenToTasks(); 
                app.loadUsers(); 
                app.listenToNotifications();
                
                app.navigate('dashboard'); 
            } else { 
                if(pLogin) pLogin.classList.remove('hidden'); 
                if(appL) appL.classList.add('hidden'); 
            } 
        }); 
    },

    updateAvatar(u, fotoDb, name) { 
        const av = document.getElementById('sidebar-avatar'); 
        if(!av) return;
        const fotoReal = fotoDb || u.photoURL;
        const nomeReal = name || u.displayName || u.email;
        if(fotoReal) { 
            av.innerText = ''; 
            av.style.backgroundImage = `url('${fotoReal}')`; 
        } else { 
            av.innerText = nomeReal.substring(0,2).toUpperCase(); 
            av.style.backgroundImage = 'none';
        } 
    },

    async addLog(msg, manualCategory = null) { 
        try { 
            await addDoc(collection(db, "notificacoes"), { 
                text: msg, 
                author: auth.currentUser.displayName || auth.currentUser.email, 
                ts: Date.now(),
                category: manualCategory 
            }); 
        } catch(e) { console.error(e); } 
    },

    async saveManualLog() {
        const text = document.getElementById('log-text-inp').value;
        const cat = document.getElementById('log-category-inp').value;
        if(!text.trim()) { app.showToast("Escreva algo no registro", "error"); return; }
        
        await app.addLog(text, cat);
        document.getElementById('log-text-inp').value = '';
        document.getElementById('modal-log-form').classList.add('hidden');
        app.showToast("Registro adicionado ao Diário!");
    },
    
    listenToNotifications() {
        if (app.globalNotifsUnsub) return;
        app.globalNotifsUnsub = onSnapshot(collection(db, "notificacoes"), snap => {
            // Guardamos em memória para não precisar carregar o banco ao filtrar
            app.allLogs = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.ts || 0) - (a.ts || 0));
            
            // Renderiza as telas de forma assíncrona/separada (Evita o congelamento)
            app.renderDashboardLogs();
            app.renderLogbook();
        });
    },

    renderDashboardLogs() {
        const dashList = document.getElementById('dashboard-log-list'); 
        if(!dashList) return;
        
        let dashHtml = '';
        app.allLogs.slice(0, 5).forEach(dt => {
            const time = dt.ts ? new Date(dt.ts).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'}) : '--:--';
            dashHtml += `
                <li class="p-4 hover:bg-[#333333] transition-colors flex gap-4">
                    <div class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center shrink-0 border border-outline-variant/50">
                        <span class="font-code-data text-xs text-primary-fixed-dim">${time}</span>
                    </div>
                    <div class="flex-1 pt-1">
                        <div class="flex items-baseline gap-2 mb-1">
                            <span class="font-code-data text-sm font-semibold text-on-surface">${dt.author || 'Sistema'}</span>
                        </div>
                        <p class="font-body-sm text-body-sm text-on-surface-variant">${dt.text || ''}</p>
                    </div>
                </li>
            `;
        });
        dashList.innerHTML = dashHtml || '<p class="p-6 text-center text-xs text-on-surface-variant/50 italic">Nenhum log recente.</p>';
    },

    renderLogbook() {
        const logbookList = document.getElementById('logbook-feed-list');
        const countBadge = document.getElementById('logbook-today-count');
        if(!logbookList) return;

        // Função auxiliar para descobrir se é manual retroativamente
        const isLogManual = (log) => {
            if (log.isManual) return true;
            const isAction = log.text && log.text.match(/^[➕✏️🗑️🔄✅⭕📎]/);
            return !isAction;
        };

        // Lógica do Filtro
        let filteredLogs = app.allLogs;
        if(app.logFilter === 'Manuais') {
            filteredLogs = app.allLogs.filter(l => isLogManual(l));
        } else if (app.logFilter !== 'Todos') {
            filteredLogs = app.allLogs.filter(l => {
                let cat = l.category || 'Logística';
                if (cat === 'Logistics') cat = 'Logística';
                if (cat === 'Maintenance') cat = 'Manutenção';
                if (cat === 'Incident') cat = 'Incidente';
                return cat === app.logFilter;
            });
        }

        let todayCount = 0;
        const todayStr = new Date().toDateString();
        let logbookHtml = '';

        filteredLogs.forEach(dt => {
            const dateObj = new Date(dt.ts);
            if(dateObj.toDateString() === todayStr) todayCount++;

            const time = dt.ts ? dateObj.toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'}) : '--:--';
            
            // Padroniza Nomes
            let category = dt.category || 'Logística';
            if (category === 'Logistics') category = 'Logística';
            if (category === 'Maintenance') category = 'Manutenção';
            if (category === 'Incident') category = 'Incidente';

            let title = 'Registro Manual';
            let colorClass = 'text-primary';
            let bgClass = 'bg-primary';
            let bgLightClass = 'bg-primary-container/10';

            const reallyManual = isLogManual(dt);

            // Verifica Automáticos se não for manual
            if(!reallyManual) {
                const isAction = dt.text.match(/^[➕✏️🗑️🔄✅⭕📎]/);
                if(isAction) {
                    const icon = isAction[0];
                    if(icon === '➕') { title = 'Nova Demanda'; category = 'Logística'; }
                    else if(icon === '✏️' || icon === '🔄') { title = 'Atualização no Sistema'; category = 'Manutenção'; }
                    else if(icon === '🗑️') { title = 'Exclusão Registrada'; category = 'Incidente'; }
                    else if(icon === '✅') { title = 'Tarefa Concluída'; category = 'Logística'; }
                    else { title = 'Ação de Sistema'; }
                }
            }

            // Cores
            if(category === 'Manutenção') { colorClass = 'text-amber-400'; bgClass = 'bg-amber-400'; bgLightClass = 'bg-amber-400/10'; }
            if(category === 'Incidente') { colorClass = 'text-error'; bgClass = 'bg-error'; bgLightClass = 'bg-error-container/20'; }
            if(category === 'Logística') { colorClass = 'text-tertiary'; bgClass = 'bg-tertiary'; bgLightClass = 'bg-tertiary-container/20'; }

            const userL = app.getUserData(dt.author);
            let avatarHtml = `<div class="w-full h-full flex items-center justify-center bg-surface-variant text-on-surface text-[10px] font-bold">${(dt.author || 'S').substring(0,2).toUpperCase()}</div>`;
            if(userL.foto) { avatarHtml = `<img src="${userL.foto}" class="w-full h-full object-cover">`; }

            // Botões de Editar e Excluir APENAS para registros manuais
            let actionBtns = '';
            if (reallyManual) {
                actionBtns = `
                    <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button onclick="app.openEditLog('${dt.id}')" class="p-1.5 bg-surface-container-high rounded-md text-on-surface-variant hover:text-primary transition-colors shadow-sm" title="Editar"><span class="material-symbols-outlined text-[16px]">edit</span></button>
                        <button onclick="app.deleteLog('${dt.id}')" class="p-1.5 bg-surface-container-high rounded-md text-on-surface-variant hover:text-error transition-colors shadow-sm" title="Excluir"><span class="material-symbols-outlined text-[16px]">delete</span></button>
                    </div>
                `;
            }

            logbookHtml += `
                <div class="bg-surface-container-low border border-outline-variant rounded-lg p-md shadow-sm relative overflow-hidden group hover:border-outline transition-colors">
                    <div class="absolute left-0 top-0 bottom-0 w-1 ${bgClass}"></div>
                    ${actionBtns}
                    <div class="flex justify-between items-start mb-sm pl-xs pr-14">
                        <div class="flex items-center gap-sm">
                            <span class="font-code-data text-on-surface-variant bg-surface-container px-2 py-1 rounded text-sm">${time}</span>
                            <div class="flex items-center gap-xs">
                                <div class="w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center border border-outline-variant overflow-hidden">
                                    ${avatarHtml}
                                </div>
                                <span class="font-body-sm text-on-surface font-medium">${dt.author || 'Sistema'}</span>
                            </div>
                        </div>
                        <span class="font-label-caps ${colorClass} ${bgLightClass} px-2 py-1 rounded flex items-center gap-xs">
                            <span class="w-1.5 h-1.5 rounded-full ${bgClass}"></span>
                            ${category}
                        </span>
                    </div>
                    <h3 class="font-title-md text-on-surface mb-xs pl-xs">${title}</h3>
                    <p class="font-body-sm text-on-surface-variant pl-xs whitespace-pre-wrap">${dt.text}</p>
                </div>
            `;
        });

        logbookList.innerHTML = logbookHtml || '<p class="p-6 text-center text-xs text-on-surface-variant/50 italic">Diário vazio.</p>';
        if(countBadge) countBadge.innerText = todayCount;
    },

    setLogFilter(filter) {
        this.logFilter = filter;
        document.querySelectorAll('.log-filter-btn').forEach(b => {
            if(b.id === `filter-${filter}`) {
                b.className = "log-filter-btn px-sm py-1 rounded-full border border-primary text-primary bg-primary-container/10 font-label-caps whitespace-nowrap";
            } else {
                b.className = "log-filter-btn px-sm py-1 rounded-full border border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface font-label-caps whitespace-nowrap transition-colors";
            }
        });
        this.renderLogbook(); 
    },

    openNewLogModal() {
        document.getElementById('edit-log-id').value = '';
        document.getElementById('log-text-inp').value = '';
        document.getElementById('log-category-inp').value = 'Logística';
        document.getElementById('modal-log-form').classList.remove('hidden');
    },

    openEditLog(id) {
        const log = app.allLogs.find(l => l.id === id);
        if(!log) return;
        document.getElementById('edit-log-id').value = id;
        document.getElementById('log-category-inp').value = log.category || 'Logística';
        document.getElementById('log-text-inp').value = log.text;
        document.getElementById('modal-log-form').classList.remove('hidden');
    },

    async saveManualLog() {
        const text = document.getElementById('log-text-inp').value;
        const cat = document.getElementById('log-category-inp').value;
        const editId = document.getElementById('edit-log-id').value;

        if(!text.trim()) { app.showToast("Escreva algo no registro", "error"); return; }
        
        try {
            if (editId) {
                await updateDoc(doc(db, "notificacoes", editId), {
                    text: text,
                    category: cat
                });
                app.showToast("Registro atualizado!");
            } else {
                await addDoc(collection(db, "notificacoes"), { 
                    text: text, 
                    author: auth.currentUser.displayName || auth.currentUser.email, 
                    ts: Date.now(),
                    category: cat,
                    isManual: true 
                }); 
                app.showToast("Registro adicionado ao Diário!");
            }
            document.getElementById('modal-log-form').classList.add('hidden');
        } catch(e) {
            console.error(e); app.showToast("Erro ao salvar", "error");
        }
    },

    async deleteLog(id) {
        if(confirm("Deseja realmente excluir este registro manual?")) {
            try {
                await deleteDoc(doc(db, "notificacoes", id));
                app.showToast("Registro excluído.");
            } catch(e) {
                console.error(e); app.showToast("Erro ao excluir", "error");
            }
        }
    },

    listenToTasks() { 
        if (app.globalTasksUnsub) return;
        app.globalTasksUnsub = onSnapshot(collection(db, "tarefas"), snap => { 
            app.allTasks = snap.docs.map(d => ({id: d.id, ...d.data()})); 
            app.renderDashboard(); 
        }); 
    },

    renderDashboard() {
        try {
            const c = document.getElementById('my-tasks-list'); if(!c) return; c.innerHTML = '';
            
            const hoje = app.getTodayStr();
            const currentUid = auth.currentUser ? auth.currentUser.uid : null;

            let myTasks = app.allTasks.filter(t => { 
                const matchAssignee = t.assignees && t.assignees.some(a => app.getUserData(a).uid === currentUid);
                const notDone = t.status !== 'Concluída' && t.status !== 'Cancelada';
                return matchAssignee && notDone; 
            }).sort((a,b) => (b.ts_manual || 0) - (a.ts_manual || 0));

            if(myTasks.length === 0) {
                c.innerHTML = '<p class="p-4 text-center text-xs text-on-surface-variant/50 font-medium">Nenhuma pendência na sua fila hoje. Ótimo trabalho!</p>';
                return;
            }
            
            let htmlStr = '';
            myTasks.forEach(t => {
                const isAtrasada = t.dueDate && t.dueDate < hoje;
                const pLabel = t.priority || 'Média';
                
                let pTag = '';
                if(pLabel === 'Alta') pTag = `<span class="px-1.5 py-0.5 bg-error-container/20 text-error font-label-caps text-[9px] rounded border border-error/20">URGENTE</span>`;
                if(pLabel === 'Baixa') pTag = `<span class="px-1.5 py-0.5 bg-tertiary-container/20 text-tertiary font-label-caps text-[9px] rounded border border-tertiary/20">BAIXA</span>`;
                
                htmlStr += `
                    <li>
                        <label class="flex items-start gap-3 p-3 rounded-lg bg-surface hover:bg-surface-variant border ${isAtrasada ? 'border-error/50' : 'border-outline-variant/30'} cursor-pointer transition-colors group/task">
                            <div class="flex-1">
                                <div class="flex items-center gap-2">
                                    <span class="font-body-sm text-body-sm text-on-surface group-hover/task:text-primary transition-colors">${t.title}</span>
                                    ${pTag}
                                </div>
                                ${t.dueDate ? `<span class="font-code-data text-[10px] ${isAtrasada ? 'text-error font-bold' : 'text-on-surface-variant'} block mt-1">Prazo: ${t.dueDate.split('-').reverse().join('/')}</span>` : ''}
                            </div>
                        </label>
                    </li>
                `;
            });
            c.innerHTML = htmlStr;
            
        } catch (e) { console.error("Erro na renderização dashboard", e); }
    },

    loadUsers() { 
        if (app.globalUsersUnsub) return;
        app.globalUsersUnsub = onSnapshot(collection(db, "usuarios"), (snap) => { 
            app.userMap = {};
            snap.docs.forEach(d => { app.userMap[d.id] = { uid: d.id, ...d.data() }; });
            app.renderDashboard();
        }); 
    },
    
    signOut() { 
        const em = document.getElementById('login-email'); 
        const ps = document.getElementById('login-password'); 
        if(em) em.value = ''; 
        if(ps) ps.value = ''; 
        if (app.globalTasksUnsub) { app.globalTasksUnsub(); app.globalTasksUnsub = null; }
        if (app.globalNotifsUnsub) { app.globalNotifsUnsub(); app.globalNotifsUnsub = null; }
        if (app.globalUsersUnsub) { app.globalUsersUnsub(); app.globalUsersUnsub = null; }
        signOut(auth); 
    },

    showToast(m, t='success') { 
        const c = document.getElementById('toast-container'); 
        const toast = document.createElement('div'); 
        toast.className = `toast ${t} shadow-xl border dark:border-white/5`; 
        toast.innerHTML = `<span class="material-symbols-outlined">${t==='success'?'check_circle':'error'}</span> <span class="font-bold text-sm">${m}</span>`; 
        c.appendChild(toast); 
        setTimeout(() => { 
            toast.style.animation = 'fadeOut 0.3s forwards'; 
            setTimeout(() => toast.remove(), 300); 
        }, 3000); 
    }
};

window.app = app;
app.init();
