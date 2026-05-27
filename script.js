import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, onSnapshot, doc, getDoc, deleteDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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

const CONFIG = {
    prioridades: { 'Alta': { label: 'Alta', bg: 'bg-rose-600' }, 'Média': { label: 'Média', bg: 'bg-orange-500' }, 'Baixa': { label: 'Baixa', bg: 'bg-emerald-500' } }
};

const app = {
    currentTaskId: null, activeSid: null, editSubId: null, allTasks: [], unsubs: [], tempPhotoBase64: null,
    lastLogCount: parseInt(localStorage.getItem('lastLogCount')) || 0,
    filters: { status: "Todas", search: "", assignees: [], priorities: [], dueDate: "" },
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(),
    userMap: {},

    init() { this.bindEvents(); this.checkAuth(); this.initTheme(); this.listenToNotifications(); },
    initTheme() { if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark'); },
    toggleTheme() { 
        document.documentElement.classList.toggle('dark'); 
        localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); 
    },

    navigate(pageId, params = null) {
        this.cleanup();
        document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(`page-${pageId}`);
        if(target) target.classList.add('active');
        
        // Tratar estilo das abas ativas
        document.querySelectorAll('#bottom-nav button').forEach(b => {
            b.className = "flex items-center gap-2 text-on-surface-variant font-display font-semibold rounded-full px-5 py-2.5 transition-all text-sm hover:bg-surface-container dark:hover:bg-slate-800 hover:text-primary";
        });
        const activeNavBtn = document.getElementById(`nav-btn-${pageId === 'dashboard' ? 'dashboard' : pageId}`);
        if(activeNavBtn) activeNavBtn.className = "flex items-center gap-2 bg-primary text-white font-display font-semibold rounded-full px-5 py-2.5 transition-all text-sm shadow-md";

        // Reset de Form Nova Tarefa
        if(pageId === 'nova-tarefa') {
            const tInp = document.getElementById('nova-titulo'); if(tInp) tInp.value = '';
            const dInp = document.getElementById('nova-desc'); if(dInp) dInp.value = '';
            const fInp = document.getElementById('nova-fim'); if(fInp) fInp.value = '';
            const pInp = document.getElementById('nova-prio'); if(pInp) pInp.value = 'Média';
            document.querySelectorAll('.task-assignees-checkboxes-item').forEach(cb => cb.checked = false);
        }

        if(pageId === 'dashboard') { this.renderDashboard(); this.renderRanking(); }
        if(pageId === 'calendario') this.renderCalendar();
        if(pageId === 'configuracoes') this.showConfigTab('profile');
        if(pageId === 'detalhes' && params) this.renderDetails(params);
        
        this.closeModal(); window.scrollTo(0,0);
    },

    bindEvents() {
        document.getElementById('login-form')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } catch(err) { this.showToast("Erro no login.", "error"); } });
        document.getElementById('search-input').oninput = (e) => { this.filters.search = e.target.value; this.renderDashboard(); };
        document.getElementById('notif-btn').onclick = (e) => { e.stopPropagation(); document.getElementById('notif-menu').classList.toggle('hidden'); this.markNotifsRead(); };
        document.getElementById('profile-trigger').onclick = (e) => { e.stopPropagation(); document.getElementById('profile-menu').classList.toggle('hidden'); };
        
        document.addEventListener('click', () => { 
            document.getElementById('notif-menu')?.classList.add('hidden'); 
            document.getElementById('profile-menu')?.classList.add('hidden'); 
            document.getElementById('assignee-filter-menu')?.classList.add('hidden');
            document.getElementById('priority-filter-menu')?.classList.add('hidden');
            document.getElementById('date-filter-menu')?.classList.add('hidden');
        });
        
        document.getElementById('submit-edit-task').onclick = () => this.handleUpdateTask();
        document.getElementById('submit-subtask-form').onclick = () => this.handleSaveSubtask();
        document.getElementById('profile-upload')?.addEventListener('change', (e) => { const f = e.target.files[0]; if(f) this.compressImage(f, (b64) => { this.tempPhotoBase64 = b64; document.getElementById('profile-page-avatar').style.backgroundImage = `url('${b64}')`; document.getElementById('profile-page-avatar').innerText = ''; }); });
    },

    checkAuth() { 
        onAuthStateChanged(auth, async (u) => { 
            const h = document.getElementById('main-header'); 
            const b = document.getElementById('bottom-nav'); 
            if(u){ 
                if(h) h.classList.replace('hidden', 'flex'); 
                if(b) b.classList.replace('hidden', 'flex'); 
                this.updateAvatar(u); 
                
                try {
                    const ud = await getDoc(doc(db, "usuarios", u.uid));
                    const nameEl = document.getElementById('user-display-name');
                    const roleEl = document.getElementById('user-display-role');
                    if(ud.exists()) {
                        if(nameEl) nameEl.innerText = ud.data().nome || u.displayName || u.email;
                        if(roleEl) roleEl.innerText = ud.data().cargo || "Colaborador";
                    } else {
                        if(nameEl) nameEl.innerText = u.displayName || u.email;
                    }
                } catch(e) { console.error(e); }
                
                this.listenToTasks(); 
                this.listenToReminders(); 
                this.loadUsers(); 
                this.navigate('dashboard'); 
            } else { 
                if(h) h.classList.add('hidden'); 
                if(b) b.classList.add('hidden'); 
                this.navigate('login'); 
            } 
        }); 
    },

    async addLog(msg) { try { await addDoc(collection(db, "notificacoes"), { text: msg, author: auth.currentUser.displayName || auth.currentUser.email, ts: Date.now() }); } catch(e) {} },
    
    listenToNotifications() {
        onSnapshot(collection(db, "notificacoes"), snap => {
            const list = document.getElementById('notif-list'); const badge = document.getElementById('notif-badge'); if(!list) return;
            const logs = snap.docs.map(d => d.data()).sort((a,b) => (b.ts || 0) - (a.ts || 0));
            if (snap.size > this.lastLogCount) { badge.innerText = snap.size - this.lastLogCount; badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); }
            list.innerHTML = logs.length ? '' : '<p class="p-4 text-center text-xs text-gray-400 italic">Sem registros.</p>';
            logs.slice(0, 15).forEach(dt => {
                const time = dt.ts ? new Date(dt.ts).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'}) : '--:--';
                list.innerHTML += `<div class="p-4 border-b dark:border-slate-700 text-left"><p class="text-xs font-bold text-gray-700 dark:text-gray-200">${dt.text || ''}</p><div class="flex justify-between mt-1 text-[8px] font-black uppercase text-gray-400"><span>${dt.author || 'Sistema'}</span><span>${time}</span></div></div>`;
            });
        });
    },
    markNotifsRead() { 
        const badge = document.getElementById('notif-badge');
        if(badge && !badge.classList.contains('hidden')) {
            this.lastLogCount += (parseInt(badge.innerText) || 0);
            localStorage.setItem('lastLogCount', this.lastLogCount);
            badge.classList.add('hidden');
        }
    },

    listenToTasks() { 
        onSnapshot(collection(db, "tarefas"), snap => { 
            this.allTasks = snap.docs.map(d => ({id: d.id, ...d.data()})); 
            this.renderDashboard(); 
            this.renderRanking(); 
        }); 
    },

    toggleAssigneeFilter(name, isChecked) {
        if(isChecked) { if(!this.filters.assignees.includes(name)) this.filters.assignees.push(name); } 
        else { this.filters.assignees = this.filters.assignees.filter(n => n !== name); }
        document.getElementById('assignee-filter-count').innerText = this.filters.assignees.length > 0 ? `Equipe (${this.filters.assignees.length})` : 'Equipe';
        this.renderDashboard();
    },

    togglePriorityFilter(val, isChecked) {
        if(isChecked) { if(!this.filters.priorities.includes(val)) this.filters.priorities.push(val); } 
        else { this.filters.priorities = this.filters.priorities.filter(p => p !== val); }
        document.getElementById('priority-filter-count').innerText = this.filters.priorities.length > 0 ? `Prioridade (${this.filters.priorities.length})` : 'Prioridade';
        this.renderDashboard();
    },

    handleDateFilter(val) {
        this.filters.dueDate = val;
        document.getElementById('date-filter-label').innerText = val ? val.split('-').reverse().join('/') : 'Prazo';
        this.renderDashboard();
    },

    clearFilters() {
        this.filters.assignees = []; this.filters.priorities = []; this.filters.dueDate = "";
        document.querySelectorAll('#assignee-filter-list input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('#priority-filter-menu input[type="checkbox"]').forEach(cb => cb.checked = false);
        if(document.getElementById('dashboard-date-filter')) document.getElementById('dashboard-date-filter').value = '';
        document.getElementById('assignee-filter-count').innerText = 'Equipe';
        document.getElementById('priority-filter-count').innerText = 'Prioridade';
        document.getElementById('date-filter-label').innerText = 'Prazo';
        this.renderDashboard();
    },

    renderDashboard() {
        try {
            const c = document.getElementById('taskTableBody'); if(!c) return; c.innerHTML = '';
            const clearBtn = document.getElementById('clear-filters-btn');
            if (clearBtn) {
                if (this.filters.assignees.length > 0 || this.filters.priorities.length > 0 || this.filters.dueDate !== "") {
                    clearBtn.classList.remove('hidden'); clearBtn.classList.add('flex');
                } else {
                    clearBtn.classList.add('hidden'); clearBtn.classList.remove('flex');
                }
            }

            const sorted = [...this.allTasks].sort((a,b) => (b.ts_manual || 0) - (a.ts_manual || 0));
            const d = new Date();
            const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            
            let baseFiltered = sorted.filter(t => { 
                const matchSearch = (t.title || '').toLowerCase().includes(this.filters.search.toLowerCase());
                const matchAssignee = this.filters.assignees.length === 0 || (t.assignees && t.assignees.some(a => this.filters.assignees.includes(a)));
                const matchPriority = this.filters.priorities.length === 0 || this.filters.priorities.includes(t.priority || 'Média');
                const matchDate = !this.filters.dueDate || t.dueDate === this.filters.dueDate;
                return matchSearch && matchAssignee && matchPriority && matchDate; 
            });

            const stats = { 'Em aberto': 0, 'Em andamento': 0, 'Atrasadas': 0, 'Concluídas': 0, 'Canceladas': 0 };
            baseFiltered.forEach(t => { 
                const sReal = t.status || 'Em aberto';
                const isOverdue = sReal !== 'Concluída' && sReal !== 'Cancelada' && t.dueDate && t.dueDate < hoje;
                if (isOverdue) stats['Atrasadas']++;
                else {
                    if (sReal === 'Concluída') stats['Concluídas']++;
                    else if (sReal === 'Cancelada') stats['Canceladas']++;
                    else if (stats[sReal] !== undefined) stats[sReal]++;
                }
            });
            this.renderStats(stats, baseFiltered.length);

            let finalFiltered = baseFiltered.filter(t => {
                const statusStr = t.status || 'Em aberto';
                const isOverdue = statusStr !== 'Concluída' && statusStr !== 'Cancelada' && t.dueDate && t.dueDate < hoje;
                let computedCategory = statusStr;
                if (isOverdue) computedCategory = 'Atrasadas';
                else if (statusStr === 'Concluída') computedCategory = 'Concluídas';
                else if (statusStr === 'Cancelada') computedCategory = 'Canceladas';
                return this.filters.status === "Todas" || computedCategory === this.filters.status;
            });
            
            document.getElementById('taskCount').innerText = `(${finalFiltered.length})`;
            
            finalFiltered.forEach(t => {
                const prazo = t.dueDate ? t.dueDate.split('-').reverse().join('/') : '---';
                const p = CONFIG.prioridades[t.priority || 'Média'] || CONFIG.prioridades['Média'];
                const title = t.title || 'Sem título';
                const isAtrasada = t.status !== 'Concluída' && t.status !== 'Cancelada' && t.dueDate && t.dueDate < hoje;
                const borderClass = isAtrasada ? 'border-error' : 'border-transparent';
                const s_slug = (t.status || 'Em aberto').replace(/\s+/g, '-');
                
                const rowId = `task-row-${t.id}`;
                
                c.innerHTML += `
                    <div id="${rowId}" class="glass-panel rounded-xl p-5 border-l-4 ${borderClass} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-all cursor-pointer bento-highlight" onclick="app.navigate('detalhes', '${t.id}')">
                        <div class="flex-grow min-w-0">
                            <div class="flex flex-wrap items-center gap-2 mb-1">
                                <h4 class="font-display font-semibold text-primary dark:text-white truncate text-base">${title}</h4>
                                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-surface-container dark:bg-slate-700 text-on-surface-variant">${t.status || 'Em aberto'}</span>
                            </div>
                            <div class="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant/80 dark:text-slate-400">
                                <span class="flex items-center gap-1"><span class="material-symbols-outlined text-sm">flag</span> ${p.label}</span>
                                <span class="w-1 h-1 rounded-full bg-outline-variant"></span>
                                <span class="flex items-center gap-1 ${isAtrasada ? 'text-error font-bold' : ''}"><span class="material-symbols-outlined text-sm">event</span> Prazo: ${prazo} ${isAtrasada ? ' - ATRASADA' : ''}</span>
                                <span class="w-1 h-1 rounded-full bg-outline-variant"></span>
                                <span class="font-medium truncate max-w-[150px]">Equipe: ${t.assignees?.join(', ') || '---'}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end mt-2 sm:mt-0 border-t dark:border-slate-800 sm:border-none pt-2 sm:pt-0">
                            <div class="flex items-center gap-2 w-32">
                                <div class="flex-1 h-2 bg-surface-container dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div id="progress-bar-${t.id}" class="h-full bg-primary dark:bg-slate-500 rounded-full transition-all duration-500" style="width: 0%"></div>
                                </div>
                                <span id="progress-text-${t.id}" class="text-xs font-bold text-on-surface-variant min-w-[28px] text-right">0%</span>
                            </div>
                        </div>
                    </div>
                `;
                this.calculateTaskProgress(t.id);
            });
        } catch (e) {}
    },

    calculateTaskProgress(tid) {
        onSnapshot(collection(db, "tarefas", tid, "subtarefas"), s => {
            const total = s.size;
            const completed = s.docs.filter(d => d.data().completed === true).length;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            const bar = document.getElementById(`progress-bar-${tid}`);
            const txt = document.getElementById(`progress-text-${tid}`);
            if(bar) bar.style.width = `${pct}%`;
            if(txt) txt.innerText = `${pct}%`;
        });
    },

    renderStats(s, total) {
        const container = document.getElementById('statsContainer');
        const cards = [ 
            {label: 'Todas', val: total, color: 'text-gray-500', icon: 'list'}, 
            {label: 'Em aberto', val: s['Em aberto'], color: 'text-primary dark:text-blue-400', icon: 'pending_actions'}, 
            {label: 'Em andamento', val: s['Em andamento'], color: 'text-orange-500', icon: 'bolt'}, 
            {label: 'Atrasadas', val: s['Atrasadas'], color: 'text-error', icon: 'alarm'}, 
            {label: 'Concluídas', val: s['Concluídas'], color: 'text-emerald-600', icon: 'verified'}, 
            {label: 'Canceladas', val: s['Canceladas'], color: 'text-slate-400', icon: 'cancel'} 
        ];
        container.innerHTML = cards.map(c => `
            <div onclick="app.applyStatFilter('${c.label}')" class="glass-panel rounded-xl p-4 flex flex-col justify-between h-28 hover:-translate-y-1 transition-all cursor-pointer border ${this.filters.status===c.label?'ring-2 ring-primary border-primary':'dark:border-slate-800'} shadow-sm relative overflow-hidden bento-highlight">
                <span class="material-symbols-outlined ${c.color} text-lg">${c.icon}</span>
                <div>
                    <h3 class="text-2xl font-display font-bold leading-none dark:text-white">${c.val}</h3>
                    <p class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/70 mt-1 truncate">${c.label}</p>
                </div>
            </div>
        `).join('');
    },
    applyStatFilter(label) { this.filters.status = label; this.renderDashboard(); },

    async criarTarefa() {
        const title = document.getElementById('nova-titulo').value; if(!title) return;
        const resps = Array.from(document.querySelectorAll('.task-assignees-checkboxes-item:checked')).map(cb => cb.value);
        await addDoc(collection(db,"tarefas"), { title, description: document.getElementById('nova-desc').value, priority: document.getElementById('nova-prio').value, assignees: resps, status: "Em aberto", ts_manual: Date.now(), createdAt: serverTimestamp(), createdBy: auth.currentUser.uid, dueDate: document.getElementById('nova-fim').value });
        await this.addLog(`➕ Adicionou a tarefa: "${title}"`); this.navigate('dashboard');
    },

    renderDetails(id) {
        this.currentTaskId = id; const container = document.getElementById('details-view-content');
        this.unsubs.push(onSnapshot(doc(db, "tarefas", id), (d) => {
            if(!d.exists()) return;
            const t = d.data(); this.activeTaskData = t;
            const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades['Média'];
            const statusSafe = t.status || 'Em aberto';
            const prazoSafe = t.dueDate ? t.dueDate.split('-').reverse().join('/') : '---';
            
            let btns = t.status === 'Concluída' || t.status === 'Cancelada' || t.status === 'Concluídas' || t.status === 'Canceladas'
                ? `<button onclick="app.updateTaskStatus('${id}', 'Em aberto')" class="bg-primary text-white px-6 py-2.5 rounded-xl text-xs font-bold uppercase shadow flex items-center gap-1 hover:opacity-90"><span class="material-symbols-outlined text-sm">refresh</span> Reabrir</button>`
                : `<button onclick="app.updateTaskStatus('${id}', 'Em andamento')" class="bg-primary text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase shadow hover:opacity-90">Iniciar</button><button onclick="app.updateTaskStatus('${id}', 'Concluída')" class="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase shadow hover:opacity-90">Concluir</button><button onclick="app.updateTaskStatus('${id}', 'Cancelada')" class="bg-red-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase shadow hover:opacity-90">Cancelar</button>`;

            let avatarsHtml = '';
            (t.assignees || []).forEach(name => {
                const uData = Object.values(this.userMap).find(u => u.nome === name);
                if(uData && uData.foto) {
                    avatarsHtml += `<div class="w-9 h-9 rounded-full border-2 border-white dark:border-slate-800 bg-cover bg-center shadow-sm" style="background-image:url('${uData.foto}')" title="${name}"></div>`;
                } else {
                    avatarsHtml += `<div class="w-9 h-9 rounded-full border-2 border-white dark:border-slate-800 bg-primary text-white flex items-center justify-center font-bold text-xs shadow-sm" title="${name}">${name.substring(0,2).toUpperCase()}</div>`;
                }
            });

            container.innerHTML = `
                <div class="flex items-center justify-between"><button onclick="app.navigate('dashboard')" class="bg-white dark:bg-slate-800 p-2 rounded-xl shadow border dark:border-slate-700 hover:text-primary transition-all"><span class="material-symbols-outlined">arrow_back</span></button><div class="flex items-center gap-2">${btns}</div></div>
                <div class="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-xl flex flex-col md:flex-row justify-between gap-6">
                    <div class="flex-1 text-left">
                        <div class="flex items-center gap-3 mb-2"><h1 class="text-3xl font-display font-bold text-primary dark:text-white">${t.title || 'Sem título'}</h1><span class="${p.bg} text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">${p.label}</span></div>
                        <p class="text-on-surface-variant/90 dark:text-slate-300 whitespace-pre-line text-sm leading-relaxed mb-6">${t.description || 'Sem descrição.'}</p>
                        <div class="grid grid-cols-2 gap-4 border-t dark:border-slate-800 pt-4 text-xs">
                            <div><span class="text-[9px] uppercase font-bold text-on-surface-variant/60">Fim do Prazo</span><p class="font-bold dark:text-white mt-0.5">${prazoSafe}</p></div>
                            <div><span class="text-[9px] uppercase font-bold text-on-surface-variant/60">Anexos de Suporte</span><div id="task-att-list" class="flex flex-wrap gap-1.5 mt-1"></div><button onclick="app.handleFileUpload('task', '${id}')" class="mt-2 text-[10px] font-bold text-primary dark:text-blue-400 flex items-center gap-0.5 hover:opacity-80"><span class="material-symbols-outlined text-xs">attach_file</span> ANEXAR</button></div>
                        </div>
                    </div>
                    <div class="md:w-48 border-t md:border-t-0 md:border-l dark:border-slate-800 pt-4 md:pt-0 md:pl-6 text-left flex flex-col">
                        <span class="text-[9px] uppercase font-bold text-on-surface-variant/60 mb-2">Equipe Executora</span>
                        <div class="flex flex-wrap gap-1.5">${avatarsHtml || '<span class="text-xs text-slate-400">Não definido</span>'}</div>
                    </div>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="flex flex-col gap-4 text-left"><div class="flex items-center justify-between p-1 font-bold text-xs uppercase text-on-surface-variant/70">Subtarefas Conectadas<button onclick="app.openSubtaskForm()" class="bg-primary text-white px-4 py-2 rounded-xl text-[10px] font-bold shadow hover:opacity-90 transition-all">Adicionar</button></div><div id="subtasks-list" class="bg-white dark:bg-slate-900 rounded-2xl border dark:border-slate-800 divide-y dark:divide-slate-800 shadow-sm"></div></div>
                    <div class="flex flex-col gap-4 text-left"><h2 class="font-bold text-xs uppercase text-on-surface-variant/70 p-1">Painel de Discussão</h2><div class="bg-white dark:bg-slate-900 rounded-2xl border dark:border-slate-800 flex flex-col h-[350px] shadow-sm overflow-hidden"><div id="chat-messages" class="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar"></div><div class="p-4 border-t dark:border-slate-800 flex gap-2 bg-surface-container-low dark:bg-slate-900"><input id="chat-input" onkeydown="if(event.key==='Enter')app.sendChatMessage()" type="text" class="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none shadow-inner dark:text-white focus:ring-2 focus:ring-primary/30" placeholder="Mensagem corporativa..."><button onclick="app.sendChatMessage()" class="bg-primary text-white w-11 h-11 rounded-xl flex items-center justify-center shadow hover:opacity-90"><span class="material-symbols-outlined text-sm">send</span></button></div></div></div>
                </div>
                <div class="flex gap-4 mt-4"><button onclick="app.openEditModal()" class="flex-1 bg-amber-600 text-white py-3.5 rounded-xl font-bold uppercase text-xs shadow transition-all hover:opacity-90">Editar Escopo</button><button onclick="app.handleDeleteTask('${id}')" class="bg-red-600 text-white px-6 py-3.5 rounded-xl font-bold uppercase text-xs shadow transition-all hover:opacity-90">Excluir Demanda</button></div>
            `;
            const al = document.getElementById('task-att-list'); (t.anexos || []).forEach(a => { al.innerHTML += `<a href="${a.data}" download="${a.nome}" class="p-2 bg-surface-container dark:bg-slate-800 text-[10px] font-semibold rounded-lg truncate max-w-[130px] hover:text-primary dark:text-white">${a.name}</a>`; });
            this.listenToSubtasks(id); this.listenToChat(id);
        }));
    },

    listenToSubtasks(tid) {
        this.unsubs.push(onSnapshot(collection(db,"tarefas",tid,"subtarefas"), s => {
            const l = document.getElementById('subtasks-list'); if(!l) return;
            const sts = s.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=> (a.ts_manual||0) - (b.ts_manual||0));
            l.innerHTML = sts.length ? sts.map(st => {
                const p = CONFIG.prioridades[st.priority || 'Média'] || CONFIG.prioridades['Média'];
                return `<div class="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-container dark:hover:bg-slate-800/50 cursor-pointer text-left transition-colors" onclick="if(event.target.type !== 'checkbox') app.openSubtaskView('${st.id}')"><input type="checkbox" ${st.completed?'checked':''} onchange="app.toggleSub('${st.id}', this.checked)" class="rounded text-primary focus:ring-0 w-4 h-4"><div class="flex-1 flex items-center justify-between gap-2"><span class="text-sm font-semibold ${st.completed?'subtask-done text-on-surface-variant/50':''} dark:text-white">${st.title}</span><span class="${p.bg} text-white px-2 py-0.5 rounded text-[8px] font-bold uppercase opacity-90">${p.label}</span></div><span class="material-symbols-outlined text-gray-300 dark:text-slate-600 text-sm">chevron_right</span></div>`;
            }).join('') : '<p class="p-6 text-center text-xs text-gray-400 italic">Nenhuma etapa cadastrada.</p>';
        }));
    },

    // --- CALENDÁRIO CORPORATIVO ---
    renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const monthYearLabel = document.getElementById('calendar-month-year');
        if(!grid || !monthYearLabel) return;
        grid.innerHTML = '';

        const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        monthYearLabel.innerText = `${meses[this.currentMonth]} de ${this.currentYear}`;

        const primeiroDiaSemana = new Date(this.currentYear, this.currentMonth, 1).getDay();
        const totalDiasMes = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();

        for(let i = 0; i < primeiroDiaSemana; i++) {
            grid.innerHTML += `<div class="p-2 bg-surface-container-low/30 dark:bg-slate-800/10 rounded-xl min-h-[80px]"></div>`;
        }

        for(let dia = 1; dia <= totalDiasMes; dia++) {
            const mFormat = String(this.currentMonth + 1).padStart(2, '0');
            const dFormat = String(dia).padStart(2, '0');
            const dateStr = `${this.currentYear}-${mFormat}-${dFormat}`;

            const tarefasDoDia = this.allTasks.filter(t => t.dueDate === dateStr);
            let indicatorsHtml = '';
            tarefasDoDia.forEach(t => {
                indicatorsHtml += `<div onclick="app.navigate('detalhes', '${t.id}')" class="text-[9px] font-bold truncate px-1.5 py-1 bg-primary/10 text-primary dark:bg-slate-700 dark:text-white rounded mt-0.5 shadow-sm cursor-pointer hover:opacity-80" title="${t.title}">${t.title}</div>`;
            });

            grid.innerHTML += `
                <div class="p-2 bg-white dark:bg-slate-800 rounded-xl min-h-[80px] border dark:border-slate-700 flex flex-col justify-between hover:shadow-sm transition-shadow">
                    <span class="text-xs font-bold text-on-surface-variant/80 text-left dark:text-slate-300">${dia}</span>
                    <div class="flex-grow overflow-y-auto custom-scrollbar flex flex-col gap-0.5 max-h-16 mt-1">${indicatorsHtml}</div>
                </div>
            `;
        }
    },
    changeMonth(dir) {
        this.currentMonth += dir;
        if(this.currentMonth < 0) { this.currentMonth = 11; this.currentYear--; }
        if(this.currentMonth > 11) { this.currentMonth = 0; this.currentYear++; }
        this.renderCalendar();
    },

    // --- CONFIGURAÇÕES & USUÁRIOS ---
    showConfigTab(tabId) {
        document.querySelectorAll('.config-subtab').forEach(el => el.classList.add('hidden'));
        document.getElementById(`config-tab-${tabId}`).classList.remove('hidden');
        if(tabId === 'users') this.renderUsersDirectory();
    },
    renderUsersDirectory() {
        const container = document.getElementById('config-users-list'); if(!container) return;
        container.innerHTML = Object.values(this.userMap).map(u => `
            <div onclick="app.showUserModal('${u.uid}')" class="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl cursor-pointer hover:shadow-md transition-all">
                <div class="w-10 h-10 rounded-full bg-cover bg-center shadow bg-primary text-white flex items-center justify-center font-bold" style="${u.foto?`background-image:url('${u.foto}')`:''}">
                    ${u.foto ? '' : u.nome.substring(0,2).toUpperCase()}
                </div>
                <div class="min-w-0">
                    <p class="text-sm font-bold truncate dark:text-white">${u.nome}</p>
                    <p class="text-[11px] text-on-surface-variant/70 dark:text-slate-400 truncate">${u.cargo || 'Membro'}</p>
                </div>
            </div>
        `).join('');
    },
    showUserModal(uid) {
        const u = this.userMap[uid]; if(!u) return;
        const av = document.getElementById('modal-user-avatar');
        if(u.foto) { av.innerText = ''; av.style.backgroundImage = `url('${u.foto}')`; }
        else { av.innerText = u.nome.substring(0,2).toUpperCase(); av.style.backgroundImage = 'none'; }
        
        document.getElementById('modal-user-name').innerText = u.nome;
        document.getElementById('modal-user-role').innerText = u.cargo || 'Membro da Equipe';
        document.getElementById('modal-user-bio').innerText = u.bio || 'Nenhuma biografia cadastrada.';
        
        document.getElementById('modal-backdrop').classList.replace('hidden', 'flex');
        document.getElementById('modal-user-detail').classList.remove('hidden');
    },

    // --- LEMBRETES DIÁRIOS ---
    listenToReminders() {
        this.unsubs.push(onSnapshot(collection(db, "lembretes"), s => {
            const rc = document.getElementById('remindersContainer'); if(!rc) return;
            const d = new Date();
            const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            
            const lembretesHoje = s.docs
                .map(d => ({id: d.id, ...d.data()}))
                .filter(l => l.dueDate === hoje)
                .sort((a, b) => (b.ts || 0) - (a.ts || 0));

            if (lembretesHoje.length === 0) {
                rc.innerHTML = '<p class="text-on-surface-variant/40 text-xs text-center py-4 italic">Nenhum lembrete para hoje.</p>';
                return;
            }

            rc.innerHTML = lembretesHoje.map(l => `
                <div class="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-surface-container dark:hover:bg-slate-800 transition-all group">
                    <input type="checkbox" ${l.completed ? 'checked' : ''} onchange="app.toggleReminder('${l.id}', this.checked)" class="mt-0.5 rounded text-primary focus:ring-0 w-3.5 h-3.5 cursor-pointer">
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-bold ${l.completed ? 'line-through text-on-surface-variant/50' : 'dark:text-white'} truncate">${l.title}</p>
                        ${l.description ? `<p class="text-[10px] text-on-surface-variant/60 dark:text-slate-400 mt-0.5 truncate ${l.completed ? 'opacity-40' : ''}">${l.description}</p>` : ''}
                    </div>
                    <button onclick="app.deleteReminder('${l.id}')" class="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-opacity"><span class="material-symbols-outlined text-[15px]">delete</span></button>
                </div>
            `).join('');
        }));
    },
    async saveReminder() {
        const title = document.getElementById('lembrete-title-inp').value; if(!title) return;
        const desc = document.getElementById('lembrete-desc-inp').value;
        const d = new Date();
        const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        await addDoc(collection(db, "lembretes"), { title, description: desc, dueDate: hoje, completed: false, ts: Date.now(), createdBy: auth.currentUser.uid });
        document.getElementById('lembrete-title-inp').value = ''; document.getElementById('lembrete-desc-inp').value = '';
        this.closeModal();
    },
    toggleReminder(id, val) { updateDoc(doc(db, "lembretes", id), { completed: val }); },
    deleteReminder(id) { if(confirm('Apagar lembrete?')) deleteDoc(doc(db, "lembretes", id)); },

    // --- REUTILIZÁVEIS E GLOBAIS ---
    async updateTaskStatus(id, newStatus) { 
        let realStatus = newStatus;
        if(newStatus === 'Concluídas') realStatus = 'Concluída';
        if(newStatus === 'Canceladas') realStatus = 'Cancelada';
        await updateDoc(doc(db, "tarefas", id), { status: realStatus }); 
        const d = await getDoc(doc(db,"tarefas",id));
        await this.addLog(`🔄 "${d.data().title || 'Tarefa'}" -> ${realStatus}`); 
    },
    async openSubtaskView(sid) {
        this.activeSid = sid; const d = (await getDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", sid))).data();
        const p = CONFIG.prioridades[d.priority || 'Média'] || CONFIG.prioridades['Média'];
        const prazoSafe = d.dueDate ? d.dueDate.split('-').reverse().join('/') : '---';
        const cont = document.getElementById('subtask-view-content');
        cont.innerHTML = `
            <div class="w-full md:w-1/2 p-8 border-r dark:border-slate-800 overflow-y-auto flex flex-col gap-6 bg-white dark:bg-slate-900 text-left">
                <div class="flex items-center justify-between font-bold text-[10px] uppercase text-on-surface-variant/60 tracking-wider">Detalhes da Subtarefa<button onclick="app.closeModal()"><span class="material-symbols-outlined text-sm dark:text-white">close</span></button></div>
                <div><div class="flex items-center gap-3 mb-2"><h3 class="text-2xl font-display font-bold text-primary dark:text-white">${d.title}</h3><span class="${p.bg} text-white px-2 py-0.5 rounded text-[8px] font-bold uppercase">${p.label}</span></div><div class="p-4 bg-surface-container dark:bg-slate-800 rounded-xl text-sm leading-relaxed">${d.description || 'Sem instruções específicas.'}</div></div>
                <div class="grid grid-cols-2 gap-4 border-t dark:border-slate-800 pt-4 text-xs"><div><span class="text-[9px] uppercase font-bold text-on-surface-variant/60">Responsáveis</span><p class="font-bold dark:text-white mt-0.5">${d.assignees?.join(', ') || 'Não definido'}</p></div><div><span class="text-[9px] uppercase font-bold text-on-surface-variant/60">Prazo</span><p class="font-bold dark:text-white mt-0.5">${prazoSafe}</p></div></div>
                <div class="flex flex-col border-t dark:border-slate-800 pt-4 text-left"><span class="text-[9px] uppercase font-bold text-on-surface-variant/60 mb-2">Anexos</span><div id="sub-att-list" class="flex flex-wrap gap-2"></div><button onclick="app.handleFileUpload('sub', '${sid}')" class="mt-2 text-[10px] font-bold text-primary dark:text-blue-400 flex items-center gap-0.5"><span class="material-symbols-outlined text-xs">attach_file</span> ANEXAR</button></div>
                <div class="flex gap-2 mt-auto pt-6"><button onclick="app.openSubtaskForm('${sid}')" class="flex-1 bg-amber-600 text-white py-2.5 rounded-xl font-bold text-[10px] uppercase shadow">Editar</button><button onclick="app.deleteSub('${sid}')" class="bg-red-500/10 text-red-500 px-4 rounded-xl hover:bg-red-500 hover:text-white transition-all"><span class="material-symbols-outlined text-sm">delete</span></button></div>
            </div>
            <div class="flex-1 flex flex-col bg-surface-container-low dark:bg-slate-900/40 text-left">
                <div class="p-4 border-b dark:border-slate-800 font-bold text-[10px] uppercase text-on-surface-variant/70">Chat da Subtarefa</div>
                <div id="sub-chat-messages" class="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar"></div>
                <div class="p-4 border-t dark:border-slate-800 flex gap-2"><input id="sub-chat-input" onkeydown="if(event.key === 'Enter') app.sendSubComment()" type="text" class="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none shadow-inner dark:text-white focus:ring-2 focus:ring-primary/30" placeholder="Mensagem..."><button onclick="app.sendSubComment()" class="bg-primary text-white w-10 h-10 rounded-xl flex items-center justify-center shadow"><span class="material-symbols-outlined text-sm">send</span></button></div>
            </div>
        `;
        const sl = document.getElementById('sub-att-list'); (d.anexos || []).forEach(a => { sl.innerHTML += `<a href="${a.data}" download="${a.nome}" class="p-2 bg-white dark:bg-slate-800 border dark:border-slate-700 text-[10px] font-semibold rounded shadow-sm hover:text-primary dark:text-white">${a.name}</a>`; });
        document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); document.getElementById('modal-subtask-view').classList.remove('hidden');
        this.listenToSubChat(sid);
    },
    loadUsers() { 
        onSnapshot(collection(db, "usuarios"), (snap) => { 
            this.userMap = {};
            snap.docs.forEach(d => { this.userMap[d.id] = { uid: d.id, ...d.data() }; });
            const opts = snap.docs.map(d => d.data().nome); 
            ['task-assignees-checkboxes', 'edit-assignees-checkboxes', 'sub-assignees-checkboxes'].forEach(cid => { 
                const el = document.getElementById(cid); 
                if (el) el.innerHTML = opts.map(n => `<label class="flex items-center gap-2 p-2 hover:bg-surface-container dark:hover:bg-slate-800 rounded cursor-pointer transition-all"><input type="checkbox" value="${n}" class="${cid}-item rounded text-primary focus:ring-0 w-4 h-4"><span class="text-xs font-bold dark:text-white">${n}</span></label>`).join(''); 
            }); 
            const filterEl = document.getElementById('assignee-filter-list');
            if(filterEl) {
                filterEl.innerHTML = opts.map(n => `<label class="flex items-center gap-2 p-1.5 hover:bg-surface-container dark:hover:bg-slate-800 rounded cursor-pointer transition-all"><input type="checkbox" value="${n}" onchange="app.toggleAssigneeFilter(this.value, this.checked)" class="rounded text-primary focus:ring-0 w-4 h-4" ${this.filters.assignees.includes(n) ? 'checked' : ''}><span class="text-xs font-medium dark:text-white">${n}</span></label>`).join('');
            }
        }); 
    },
    renderRanking() { 
        const rc = document.getElementById('rankingContainer'); if(!rc) return; const pts = {}; 
        this.allTasks.forEach(t => { if(t.status === "Concluída" || t.status === "Concluídas") (t.assignees || ["Equipe"]).forEach(p => pts[p] = (pts[p] || 0) + 1); }); 
        const sorted = Object.entries(pts).sort((a,b)=>b[1]-a[1]); 
        rc.innerHTML = sorted.length ? sorted.map((r, i) => {
            let crown = ''; const svg = `<svg class="w-4 h-4 fill-current drop-shadow-sm" viewBox="0 0 24 24"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>`;
            if (i === 0) crown = `<span class="text-amber-400" title="1º Lugar">${svg}</span>`; else if (i === 1) crown = `<span class="text-slate-400" title="2º Lugar">${svg}</span>`; else if (i === 2) crown = `<span class="text-amber-700" title="3º Lugar">${svg}</span>`;
            return `<div class="flex items-center gap-3 text-xs"><div class="h-8 w-8 rounded-lg bg-surface-container dark:bg-slate-800 flex items-center justify-center font-bold text-primary dark:text-white">${i+1}</div><div class="flex-1"><div class="flex items-center gap-1.5 font-bold truncate dark:text-white"><span>${r[0]}</span>${crown}</div><div class="mt-1.5 w-full bg-surface-container dark:bg-slate-700 h-1 rounded-full overflow-hidden"><div class="bg-primary h-full" style="width: ${(r[1]/sorted[0][1])*100}%"></div></div></div><div class="font-bold text-right dark:text-white">${r[1]}</div></div>`;
        }).join('') : '<p class="text-gray-400 text-xs text-center py-4 italic">Sem métricas calculadas.</p>'; 
    },
    cleanup() { this.unsubs.forEach(f => f()); this.unsubs = []; },
    updateAvatar(u) { const av = document.getElementById('header-avatar'); if(u.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${u.photoURL}')`; } else av.innerText = (u.displayName || u.email).substring(0,2).toUpperCase(); },
    closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); document.getElementById('modal-backdrop').classList.remove('flex'); document.querySelectorAll('.modal-box').forEach(m => m.classList.add('hidden')); },
    toggleSub(sid, val) { updateDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid), {completed: val}); this.addLog(val ? "✅ Etapa concluída" : "⭕ Etapa pendente"); },
    deleteSub(sid) { if(confirm("Remover?")) { deleteDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid)); this.closeModal(); } },
    signOut() { const em = document.getElementById('login-email'); const ps = document.getElementById('login-password'); if(em) em.value = ''; if(ps) ps.value = ''; signOut(auth); },
    async handleFileUpload(type, id) { const inp = document.createElement('input'); inp.type = 'file'; inp.onchange = (e) => { const f = e.target.files[0]; if(!f || f.size > 800000) return alert("< 800KB"); const r = new FileReader(); r.onload = async (ev) => { const path = type === 'task' ? doc(db,"tarefas",id) : doc(db,"tarefas",this.currentTaskId,"subtarefas",id); const d = await getDoc(path); const anexos = d.data().anexos || []; anexos.push({ name: f.name, data: ev.target.result }); await updateDoc(path, { anexos }); this.addLog(`📎 Anexou arquivo em "${d.data().title || 'Tarefa'}"`); this.showToast("Anexo salvo!"); }; r.readAsDataURL(f); }; inp.click(); },
    async handleDeleteTask(id) { if(confirm("Excluir tarefa?")) { await deleteDoc(doc(db,"tarefas",id)); this.navigate('dashboard'); } },
    async loadProfileData() { const u = auth.currentUser; if(!u) return; const d = await getDoc(doc(db, "usuarios", u.uid)); const dt = d.data() || {}; document.getElementById('profile-name-input').value = u.displayName || ""; document.getElementById('profile-role-input').value = dt.cargo || ""; document.getElementById('profile-bio-input').value = dt.bio || ""; },
    async handleSaveProfile() { try { await updateProfile(auth.currentUser, { displayName: document.getElementById('profile-name-input').value, photoURL: this.tempPhotoBase64 || auth.currentUser.photoURL }); await setDoc(doc(db,"usuarios",auth.currentUser.uid), { nome: document.getElementById('profile-name-input').value, cargo: document.getElementById('profile-role-input').value, bio: document.getElementById('profile-bio-input').value, foto: this.tempPhotoBase64 || auth.currentUser.photoURL }, {merge:true}); document.getElementById('user-display-name').innerText = document.getElementById('profile-name-input').value; document.getElementById('user-display-role').innerText = document.getElementById('profile-role-input').value; this.showToast("Perfil salvo!"); this.navigate('dashboard'); } catch(e) { this.showToast("Erro ao salvar", "error"); } },
    async removeProfilePhoto() { if(confirm("Remover foto?")) { const av = document.getElementById('profile-page-avatar'); av.style.backgroundImage = 'none'; av.innerText = (auth.currentUser.displayName || auth.currentUser.email).substring(0,2).toUpperCase(); document.getElementById('photo-options').classList.add('hidden'); this.tempPhotoBase64 = ""; } },
    async handlePasswordUpdate() { const u = auth.currentUser; const cur = document.getElementById('current-password-input').value; const n1 = document.getElementById('new-password-input').value; const n2 = document.getElementById('confirm-password-input').value; if(n1 !== n2) return this.showToast("Senhas não coincidem.", "error"); try { await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, cur)); await updatePassword(u, n1); this.showToast("Senha alterada!"); this.navigate('dashboard'); } catch(e) { this.showToast("Senha atual incorreta.", "error"); } },
    compressImage(f, cb) { const r = new FileReader(); r.readAsDataURL(f); r.onload = (e) => { const img = new Image(); img.src = e.target.result; img.onload = () => { const canvas = document.createElement('canvas'); const MAX = 300; canvas.width = MAX; canvas.height = img.height * (MAX/img.width); canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); cb(canvas.toDataURL('image/jpeg', 0.7)); }; }; },
    listenToChat(tid) { this.unsubs.push(onSnapshot(collection(db,"tarefas",tid,"comentarios"), s => { const c = document.getElementById('chat-messages'); if(c) { const msgs = s.docs.map(d=>d.data()).sort((a,b)=> (a.ts||0) - (b.ts||0)); c.innerHTML = msgs.map(d => `<div class="flex flex-col ${d.createdBy===auth.currentUser.uid?'items-end':'items-start'}"><span class="text-[8px] font-black text-gray-400 mb-1 uppercase">${d.authorName}</span><div class="${d.createdBy===auth.currentUser.uid?'bg-primary text-white rounded-br-none':'bg-surface-container dark:bg-slate-800 dark:text-white rounded-bl-none'} p-3 rounded-2xl text-xs shadow-sm max-w-[85%] font-medium">${d.text || ''}</div></div>`).join(''); c.scrollTop = c.scrollHeight; } })); },
    async sendChatMessage() { const i = document.getElementById('chat-input'); if(!i.value.trim()) return; await addDoc(collection(db,"tarefas",this.currentTaskId,"comentarios"), { text: i.value, authorName: auth.currentUser.displayName, createdBy: auth.currentUser.uid, ts: Date.now() }); i.value = ''; },
    async openEditModal() { const d = await getDoc(doc(db,"tarefas",this.currentTaskId)); const t = d.data(); document.getElementById('edit-task-title').value = t.title || ""; document.getElementById('edit-task-desc').value = t.description || ""; document.getElementById('edit-task-priority').value = t.priority || "Média"; document.getElementById('edit-task-date').value = t.dueDate || ""; document.querySelectorAll('.edit-assignees-checkboxes-item').forEach(cb => cb.checked = t.assignees?.includes(cb.value)); document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); document.getElementById('modal-edit-task').classList.remove('hidden'); },
    async handleUpdateTask() { const title = document.getElementById('edit-task-title').value; const resps = Array.from(document.querySelectorAll('.edit-assignees-checkboxes-item:checked')).map(cb => cb.value); await updateDoc(doc(db, "tarefas", this.currentTaskId), { title, description: document.getElementById('edit-task-desc').value, priority: document.getElementById('edit-task-priority').value, dueDate: document.getElementById('edit-task-date').value, assignees: resps }); await this.addLog(`✏️ Editou a tarefa: "${title}"`); this.closeModal(); },
    openSubtaskForm(sid = null) { this.editSubId = sid; this.closeModal(); document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); document.getElementById('modal-subtask-form').classList.remove('hidden'); if(sid) { getDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid)).then(d => { const s = d.data(); document.getElementById('sub-title-inp').value = s.title || ""; document.getElementById('sub-desc-inp').value = s.description || ""; document.getElementById('sub-priority-inp').value = s.priority || "Média"; document.getElementById('sub-date-inp').value = s.dueDate || ""; document.querySelectorAll('.sub-assignees-checkboxes-item').forEach(cb => cb.checked = s.assignees?.includes(cb.value)); }); } else { document.getElementById('sub-title-inp').value = ""; document.getElementById('sub-desc-inp').value = ""; document.querySelectorAll('.sub-assignees-checkboxes-item').forEach(cb => cb.checked = false); } },
    async handleSaveSubtask() { const t = document.getElementById('sub-title-inp').value; if(!t) return; const resps = Array.from(document.querySelectorAll('.sub-assignees-checkboxes-item:checked')).map(cb => cb.value); const data = { title: t, description: document.getElementById('sub-desc-inp').value, priority: document.getElementById('sub-priority-inp').value, dueDate: document.getElementById('sub-date-inp').value, assignees: resps, ts_manual: Date.now() }; if (this.editSubId) { await updateDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", this.editSubId), data); } else { await addDoc(collection(db, "tarefas", this.currentTaskId, "subtarefas"), { ...data, completed: false, createdAt: serverTimestamp() }); } this.closeModal(); },
    showToast(m, t='success') { const c = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast ${t} shadow-xl border dark:border-slate-800`; toast.innerHTML = `<span class="material-symbols-outlined">${t==='success'?'check_circle':'error'}</span> ${m}`; c.appendChild(toast); setTimeout(() => { toast.style.animation = 'fadeOut 0.3s forwards'; setTimeout(() => toast.remove(), 300); }, 3000); }
};

window.app = app;
app.init();
