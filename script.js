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
    currentTaskId: null, activeSid: null, editSubId: null, editReminderId: null, allTasks: [], unsubs: [], tempPhotoBase64: null,
    lastLogCount: parseInt(localStorage.getItem('lastLogCount')) || 0,
    filters: { status: "Todas", search: "", assignees: [], priorities: [], dueDate: "" },
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(),
    userMap: {},
    allReminders: [],
    currentReminderDate: '',
    
    globalTasksUnsub: null,
    globalNotifsUnsub: null,
    globalUsersUnsub: null,
    globalRemindersUnsub: null,
    
    subtaskUnsub: null,
    chatUnsub: null,
    taskUnsub: null,

    init() { 
        this.currentReminderDate = this.getTodayStr();
        this.bindEvents(); 
        this.checkAuth(); 
        this.initTheme(); 
    },
    
    initTheme() { 
        if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark'); 
        const savedColor = localStorage.getItem('primaryColor');
        if (savedColor) document.documentElement.style.setProperty('--color-primary', savedColor);
        
        if(!document.getElementById('dark-select-fix')) {
            const style = document.createElement('style');
            style.id = 'dark-select-fix';
            style.innerHTML = `.dark option { background-color: #151c2c; color: #ffffff; }`;
            document.head.appendChild(style);
        }
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

    navigate(pageId, params = null) {
        this.cleanup();
        document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(`page-${pageId}`);
        if(target) target.classList.add('active');
        
        // Reset nav styles if needed later for new items
        
        if(pageId === 'dashboard') { this.renderDashboard(); }
        this.closeModal(); 
        window.scrollTo(0,0);
    },

    async handleLogin(e) {
        if(e) e.preventDefault();
        try {
            await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value);
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
                if(pLogin) pLogin.classList.remove('active'); 
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
                if(pLogin) pLogin.classList.add('active'); 
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

    async addLog(msg) { 
        try { 
            await addDoc(collection(db, "notificacoes"), { text: msg, author: auth.currentUser.displayName || auth.currentUser.email, ts: Date.now() }); 
        } catch(e) { console.error(e); } 
    },
    
    listenToNotifications() {
        if (app.globalNotifsUnsub) return;
        app.globalNotifsUnsub = onSnapshot(collection(db, "notificacoes"), snap => {
            const list = document.getElementById('dashboard-log-list'); if(!list) return;
            const logs = snap.docs.map(d => d.data()).sort((a,b) => (b.ts || 0) - (a.ts || 0));
            
            list.innerHTML = logs.length ? '' : '<p class="p-6 text-center text-xs text-on-surface-variant/50 italic">Sem registros.</p>';
            logs.slice(0, 5).forEach(dt => {
                const time = dt.ts ? new Date(dt.ts).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'}) : '--:--';
                list.innerHTML += `
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
        });
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

            // Filtra tarefas designadas para o UID do usuário e que não estão concluídas
            let myTasks = app.allTasks.filter(t => { 
                const matchAssignee = t.assignees && t.assignees.some(a => app.getUserData(a).uid === currentUid);
                const notDone = t.status !== 'Concluída' && t.status !== 'Cancelada';
                return matchAssignee && notDone; 
            }).sort((a,b) => (b.ts_manual || 0) - (a.ts_manual || 0));

            if(myTasks.length === 0) {
                c.innerHTML = '<p class="p-4 text-center text-xs text-on-surface-variant/50">Nenhuma tarefa pendente para você hoje.</p>';
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
                            <input type="checkbox" onclick="event.preventDefault();" class="mt-0.5 w-4 h-4 rounded bg-surface border-outline-variant text-primary focus:ring-primary focus:ring-offset-surface-dim pointer-events-none">
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
            
        } catch (e) { console.error("Erro na renderização", e); }
    },

    loadUsers() { 
        if (app.globalUsersUnsub) return;
        app.globalUsersUnsub = onSnapshot(collection(db, "usuarios"), (snap) => { 
            app.userMap = {};
            snap.docs.forEach(d => { app.userMap[d.id] = { uid: d.id, ...d.data() }; });
            app.renderDashboard();
        }); 
    },
    
    cleanup() { 
        app.unsubs.forEach(f => { if(typeof f === 'function') f(); }); 
        app.unsubs = []; 
        if (app.chatUnsub) { app.chatUnsub(); app.chatUnsub = null; }
        if (app.subtaskUnsub) { app.subtaskUnsub(); app.subtaskUnsub = null; }
        if (app.taskUnsub) { app.taskUnsub(); app.taskUnsub = null; }
    },
    
    closeModal() { 
        // document.getElementById('modal-backdrop').classList.add('hidden'); 
        // document.getElementById('modal-backdrop').classList.remove('flex'); 
        // document.querySelectorAll('.modal-box').forEach(m => m.classList.add('hidden')); 
    },
    
    signOut() { 
        const em = document.getElementById('login-email'); 
        const ps = document.getElementById('login-password'); 
        if(em) em.value = ''; 
        if(ps) ps.value = ''; 
        app.cleanup();
        if (app.globalTasksUnsub) { app.globalTasksUnsub(); app.globalTasksUnsub = null; }
        if (app.globalRemindersUnsub) { app.globalRemindersUnsub(); app.globalRemindersUnsub = null; }
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
