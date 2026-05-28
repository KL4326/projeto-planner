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

    init() { 
        this.currentReminderDate = this.getTodayStr();
        this.bindEvents(); 
        this.checkAuth(); 
        this.initTheme(); 
    },
    
    initTheme() { 
        if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark'); 
    },
    
    toggleTheme() { 
        document.documentElement.classList.toggle('dark'); 
        localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); 
    },

    getTodayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    navigate(pageId, params = null) {
        this.cleanup();
        document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(`page-${pageId}`);
        if(target) target.classList.add('active');
        
        document.querySelectorAll('#bottom-nav button').forEach(b => {
            b.className = "flex flex-col items-center justify-center text-on-surface-variant hover:text-primary dark:text-gray-400 dark:hover:text-white transition-all font-display text-[11px] font-semibold w-24 h-14 rounded-full";
        });
        const activeNavBtn = document.getElementById(`nav-btn-${pageId === 'dashboard' ? 'dashboard' : pageId}`);
        if(activeNavBtn) activeNavBtn.className = "flex flex-col items-center justify-center bg-primary text-white shadow-md transition-all font-display text-[11px] font-bold w-24 h-14 rounded-full scale-110 -translate-y-2";

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
        if(pageId === 'detalhes' && params) { this.renderDetails(params); }
        
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

        const si = document.getElementById('search-input');
        if(si) si.addEventListener('input', (e) => { app.filters.search = e.target.value; app.renderDashboard(); });
        
        const nb = document.getElementById('notif-btn');
        if(nb) nb.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('notif-menu').classList.toggle('hidden'); app.markNotifsRead(); });
        
        const pt = document.getElementById('profile-trigger');
        if(pt) pt.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('profile-menu').classList.toggle('hidden'); });
        
        document.addEventListener('click', () => { 
            const nm = document.getElementById('notif-menu'); if(nm) nm.classList.add('hidden'); 
            const pm = document.getElementById('profile-menu'); if(pm) pm.classList.add('hidden'); 
            const af = document.getElementById('assignee-filter-menu'); if(af) af.classList.add('hidden');
        });
        
        const st = document.getElementById('submit-edit-task');
        if(st) st.onclick = () => app.handleUpdateTask();
        
        const ss = document.getElementById('submit-subtask-form');
        if(ss) ss.onclick = () => app.handleSaveSubtask();
        
        const pu = document.getElementById('profile-upload');
        if(pu) pu.addEventListener('change', (e) => { const f = e.target.files[0]; if(f) app.compressImage(f, (b64) => { app.tempPhotoBase64 = b64; document.getElementById('profile-page-avatar').style.backgroundImage = `url('${b64}')`; document.getElementById('profile-page-avatar').innerText = ''; }); });
    },

    checkAuth() { 
        onAuthStateChanged(auth, async (u) => { 
            const h = document.getElementById('main-header'); 
            const b = document.getElementById('bottom-nav'); 
            if(u){ 
                if(h) h.classList.replace('hidden', 'flex'); 
                if(b) b.classList.replace('hidden', 'flex'); 
                
                try {
                    const ud = await getDoc(doc(db, "usuarios", u.uid));
                    let userName = u.displayName || u.email;
                    let userRole = "Colaborador";
                    let userFoto = u.photoURL;

                    if(ud.exists()) {
                        const data = ud.data();
                        if(data.nome) userName = data.nome;
                        if(data.cargo) userRole = data.cargo;
                        if(data.foto) userFoto = data.foto; 
                    }
                    
                    document.getElementById('user-display-name').innerText = userName;
                    document.getElementById('user-display-role').innerText = userRole;
                    const bv = document.getElementById('boas-vindas-texto');
                    if(bv) bv.innerText = `Olá, ${userName.split(' ')[0]}`;
                    
                    app.updateAvatar(u, userFoto, userName);
                } catch(e) { console.error(e); }
                
                app.listenToTasks(); 
                app.listenToReminders(); 
                app.loadUsers(); 
                app.listenToNotifications();
                
                const rFilter = document.getElementById('reminder-date-filter');
                if(rFilter) rFilter.value = app.currentReminderDate;
                
                app.navigate('dashboard'); 
            } else { 
                if(h) h.classList.add('hidden'); 
                if(b) b.classList.add('hidden'); 
                app.navigate('login'); 
            } 
        }); 
    },

    updateAvatar(u, fotoDb, name) { 
        const av = document.getElementById('header-avatar'); 
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
        onSnapshot(collection(db, "notificacoes"), snap => {
            const list = document.getElementById('notif-list'); const badge = document.getElementById('notif-badge'); if(!list) return;
            const logs = snap.docs.map(d => d.data()).sort((a,b) => (b.ts || 0) - (a.ts || 0));
            if (snap.size > app.lastLogCount) { 
                badge.innerText = snap.size - app.lastLogCount; 
                badge.classList.remove('hidden'); 
            } else { 
                badge.classList.add('hidden'); 
            }
            list.innerHTML = logs.length ? '' : '<p class="p-6 text-center text-xs text-on-surface-variant/50 italic">Sem registros.</p>';
            logs.slice(0, 15).forEach(dt => {
                const time = dt.ts ? new Date(dt.ts).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'}) : '--:--';
                list.innerHTML += `<div class="p-4 border-b dark:border-white/5 text-left"><p class="text-[13px] font-bold text-on-surface dark:text-gray-200">${dt.text || ''}</p><div class="flex justify-between mt-1 text-[9px] font-black uppercase text-on-surface-variant/60 dark:text-gray-500"><span>${dt.author || 'Sistema'}</span><span>${time}</span></div></div>`;
            });
        });
    },

    markNotifsRead() { 
        const badge = document.getElementById('notif-badge');
        if(badge && !badge.classList.contains('hidden')) {
            app.lastLogCount += (parseInt(badge.innerText) || 0);
            localStorage.setItem('lastLogCount', app.lastLogCount);
            badge.classList.add('hidden');
        }
    },

    listenToTasks() { 
        onSnapshot(collection(db, "tarefas"), snap => { 
            app.allTasks = snap.docs.map(d => ({id: d.id, ...d.data()})); 
            app.renderDashboard(); 
            app.renderRanking(); 
        }); 
    },

    applyFilters() {
        const eqCheckboxes = document.querySelectorAll('#assignee-filter-list input:checked');
        app.filters.assignees = Array.from(eqCheckboxes).map(cb => cb.value);
        
        const prioCheckboxes = document.querySelectorAll('#priority-filter-menu input:checked');
        app.filters.priorities = Array.from(prioCheckboxes).map(cb => cb.value);
        
        const dateInput = document.getElementById('dashboard-date-filter');
        app.filters.dueDate = dateInput ? dateInput.value : '';

        const countEq = app.filters.assignees.length;
        const eqEl = document.getElementById('assignee-filter-count');
        if(eqEl) eqEl.innerText = countEq > 0 ? `Equipe (${countEq})` : 'Equipe';
        
        const countPrio = app.filters.priorities.length;
        const prioEl = document.getElementById('priority-filter-count');
        if(prioEl) prioEl.innerText = countPrio > 0 ? `Prioridade (${countPrio})` : 'Prioridade';
        
        const labelDate = document.getElementById('date-filter-label');
        if(labelDate) labelDate.innerText = app.filters.dueDate ? app.filters.dueDate.split('-').reverse().join('/') : 'Prazo Específico';

        app.renderDashboard();
    },

    clearFilters() {
        document.querySelectorAll('#assignee-filter-list input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('#priority-filter-menu input[type="checkbox"]').forEach(cb => cb.checked = false);
        const dateInp = document.getElementById('dashboard-date-filter');
        if(dateInp) dateInp.value = '';
        
        app.applyFilters();
    },

    renderDashboard() {
        try {
            const c = document.getElementById('taskTableBody'); if(!c) return;
            const clearBtn = document.getElementById('clear-filters-btn');
            if (clearBtn) {
                if (app.filters.assignees.length > 0 || app.filters.priorities.length > 0 || app.filters.dueDate !== "") {
                    clearBtn.classList.remove('hidden'); clearBtn.classList.add('flex');
                } else {
                    clearBtn.classList.add('hidden'); clearBtn.classList.remove('flex');
                }
            }

            const sorted = [...app.allTasks].sort((a,b) => (b.ts_manual || 0) - (a.ts_manual || 0));
            const hoje = app.getTodayStr();
            
            let baseFiltered = sorted.filter(t => { 
                const matchSearch = (t.title || '').toLowerCase().includes(app.filters.search.toLowerCase());
                const matchAssignee = app.filters.assignees.length === 0 || (t.assignees && t.assignees.some(a => app.filters.assignees.includes(a)));
                const matchPriority = app.filters.priorities.length === 0 || app.filters.priorities.includes(t.priority || 'Média');
                const matchDate = !app.filters.dueDate || t.dueDate === app.filters.dueDate;
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
            app.renderStats(stats, baseFiltered.length);

            let finalFiltered = baseFiltered.filter(t => {
                const statusStr = t.status || 'Em aberto';
                const isOverdue = statusStr !== 'Concluída' && statusStr !== 'Cancelada' && t.dueDate && t.dueDate < hoje;
                let computedCategory = statusStr;
                if (isOverdue) computedCategory = 'Atrasadas';
                else if (statusStr === 'Concluída') computedCategory = 'Concluídas';
                else if (statusStr === 'Cancelada') computedCategory = 'Canceladas';
                return app.filters.status === "Todas" || computedCategory === app.filters.status;
            });
            
            const tc = document.getElementById('taskCount');
            if(tc) tc.innerText = `(${finalFiltered.length})`;
            
            let htmlStr = '';
            finalFiltered.forEach(t => {
                const prazo = t.dueDate ? t.dueDate.split('-').reverse().join('/') : '---';
                const pLabel = t.priority || 'Média';
                const title = t.title || 'Sem título';
                const statusName = t.status || 'Em aberto';
                
                const isAtrasada = statusName !== 'Concluída' && statusName !== 'Cancelada' && t.dueDate && t.dueDate < hoje;
                
                const statusColors = {
                    'Em aberto': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                    'Em andamento': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                    'Concluída': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                    'Cancelada': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                };
                const prioColors = {
                    'Alta': 'text-red-600 dark:text-red-400',
                    'Média': 'text-amber-600 dark:text-amber-400',
                    'Baixa': 'text-emerald-600 dark:text-emerald-400'
                };

                const sColor = statusColors[statusName] || statusColors['Em aberto'];
                const pColor = prioColors[pLabel] || prioColors['Média'];
                
                let avatarsHtml = '';
                (t.assignees || []).forEach(name => {
                    const uData = Object.values(app.userMap).find(u => u.nome === name);
                    if(uData && uData.foto) {
                        avatarsHtml += `<div class="w-8 h-8 rounded-full border-2 border-surface dark:border-slate-800 bg-cover bg-center -ml-2 first:ml-0 shadow-sm" style="background-image:url('${uData.foto}')" title="${name}"></div>`;
                    } else {
                        avatarsHtml += `<div class="w-8 h-8 rounded-full border-2 border-surface dark:border-slate-800 bg-primary text-white flex items-center justify-center text-[10px] font-bold -ml-2 first:ml-0 shadow-sm" title="${name}">${name.substring(0,2).toUpperCase()}</div>`;
                    }
                });

                const borderClass = isAtrasada ? 'border-red-500' : 'border-transparent dark:border-white/5';
                const rowId = `task-row-${t.id}`;
                
                htmlStr += `
                    <div id="${rowId}" class="glass-panel rounded-2xl p-5 border-l-[6px] ${borderClass} flex flex-col md:flex-row justify-between items-start md:items-center gap-5 hover:-translate-y-0.5 hover:shadow-lg transition-all cubic-bezier bento-highlight dark:bg-[#151c2c]" onclick="app.navigate('detalhes', '${t.id}')">
                        <div class="flex-grow min-w-0">
                            <div class="flex flex-wrap items-center gap-3 mb-1.5">
                                <span class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${sColor}">${statusName}</span>
                                <h4 class="font-display font-bold text-primary dark:text-white truncate text-lg ${statusName==='Concluída'?'line-through opacity-50':''}">${title}</h4>
                            </div>
                            <div class="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant/80 dark:text-gray-400 font-medium mt-2">
                                <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">event</span> Prazo: <span class="${isAtrasada ? 'text-red-500 font-black' : 'dark:text-white'}">${prazo} ${isAtrasada ? '(ATRASADA)' : ''}</span></span>
                                <span class="w-1 h-1 rounded-full bg-outline-variant"></span>
                                <span class="flex items-center gap-1 font-bold ${pColor} uppercase tracking-wider text-[10px]"><span class="material-symbols-outlined text-[12px]">flag</span>${pLabel}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end mt-2 md:mt-0 pt-3 md:pt-0 border-t dark:border-white/5 md:border-none">
                            <div class="flex items-center gap-3 w-32">
                                <span id="progress-text-${t.id}" class="text-[10px] font-black text-on-surface-variant dark:text-gray-400 w-8 text-right">0%</span>
                                <div class="flex-1 h-1.5 bg-surface-container-high dark:bg-white/10 rounded-full overflow-hidden">
                                    <div id="progress-bar-${t.id}" class="h-full bg-primary dark:bg-blue-500 rounded-full transition-all duration-700" style="width: 0%"></div>
                                </div>
                            </div>
                            <div class="flex items-center">${avatarsHtml || '<span class="text-[10px] text-gray-400 font-bold uppercase">Sem equipe</span>'}</div>
                        </div>
                    </div>
                `;
            });
            c.innerHTML = htmlStr;
            finalFiltered.forEach(t => app.calculateTaskProgress(t.id));
        } catch (e) { console.error("Erro na renderização", e) }
    },

    calculateTaskProgress(tid) {
        getDocs(collection(db, "tarefas", tid, "subtarefas")).then(s => {
            const total = s.size;
            const completed = s.docs.filter(d => d.data().completed === true).length;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            const bar = document.getElementById(`progress-bar-${tid}`);
            const txt = document.getElementById(`progress-text-${tid}`);
            if(bar) bar.style.width = `${pct}%`;
            if(txt) txt.innerText = `${pct}%`;
        }).catch(e => console.error(e));
    },

    renderStats(s, total) {
        const container = document.getElementById('statsContainer');
        const cards = [ 
            {label: 'Todas', val: total, color: 'text-gray-500 dark:text-gray-400', icon: 'list'}, 
            {label: 'Em aberto', val: s['Em aberto'], color: 'text-blue-600 dark:text-blue-400', icon: 'pending_actions'}, 
            {label: 'Em andamento', val: s['Em andamento'], color: 'text-orange-500 dark:text-orange-400', icon: 'bolt'}, 
            {label: 'Atrasadas', val: s['Atrasadas'], color: 'text-red-600 dark:text-red-400', icon: 'alarm'}, 
            {label: 'Concluídas', val: s['Concluídas'], color: 'text-emerald-600 dark:text-emerald-400', icon: 'verified'}, 
            {label: 'Canceladas', val: s['Canceladas'], color: 'text-slate-400 dark:text-slate-500', icon: 'cancel'} 
        ];
        container.innerHTML = cards.map(c => `
            <div onclick="app.applyStatFilter('${c.label}')" class="glass-panel rounded-2xl p-5 flex flex-col justify-between h-[104px] hover:-translate-y-1 transition-all cursor-pointer border ${app.filters.status===c.label?'ring-2 ring-primary border-transparent':'border-gray-200 dark:border-white/5'} shadow-sm relative overflow-hidden bento-highlight dark:bg-[#151c2c]">
                <div class="flex justify-between items-start">
                    <span class="material-symbols-outlined ${c.color} text-[22px] drop-shadow-sm">${c.icon}</span>
                    <h3 class="text-2xl font-display font-black leading-none dark:text-white">${c.val}</h3>
                </div>
                <p class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70 dark:text-gray-400 mt-2 truncate">${c.label}</p>
            </div>
        `).join('');
    },

    applyStatFilter(label) { app.filters.status = label; app.renderDashboard(); },

    async criarTarefa() {
        try {
            const title = document.getElementById('nova-titulo').value; 
            if(!title) { app.showToast("Título obrigatório", "error"); return; }
            const resps = Array.from(document.querySelectorAll('.task-assignees-checkboxes-item:checked')).map(cb => cb.value);
            await addDoc(collection(db,"tarefas"), { title, description: document.getElementById('nova-desc').value, priority: document.getElementById('nova-prio').value, assignees: resps, status: "Em aberto", ts_manual: Date.now(), createdAt: serverTimestamp(), createdBy: auth.currentUser.uid, dueDate: document.getElementById('nova-fim').value });
            await app.addLog(`➕ Adicionou a tarefa: "${title}"`); 
            app.navigate('dashboard');
            app.showToast("Tarefa distribuída com sucesso!");
        } catch(e) { console.error(e); app.showToast("Erro ao criar.", "error"); }
    },

    renderDetails(id) {
        app.currentTaskId = id; const container = document.getElementById('details-view-content');
        app.unsubs.push(onSnapshot(doc(db, "tarefas", id), (d) => {
            if(!d.exists()) return;
            const t = d.data(); app.activeTaskData = t;
            const statusSafe = t.status || 'Em aberto';
            const prazoSafe = t.dueDate ? t.dueDate.split('-').reverse().join('/') : '---';
            
            let btns = t.status === 'Concluída' || t.status === 'Cancelada' || t.status === 'Concluídas' || t.status === 'Canceladas'
                ? `<button onclick="app.updateTaskStatus('${id}', 'Em aberto')" class="bg-primary text-white px-6 py-2.5 rounded-xl text-[11px] font-bold uppercase shadow flex items-center gap-1 hover:opacity-90"><span class="material-symbols-outlined text-[14px]">refresh</span> Reabrir</button>`
                : `<button onclick="app.updateTaskStatus('${id}', 'Em andamento')" class="bg-primary text-white px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase shadow hover:opacity-90">Iniciar</button><button onclick="app.updateTaskStatus('${id}', 'Concluída')" class="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase shadow hover:opacity-90">Concluir</button><button onclick="app.updateTaskStatus('${id}', 'Cancelada')" class="bg-red-500 text-white px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase shadow hover:opacity-90">Cancelar</button>`;

            let avatarsHtml = '';
            (t.assignees || []).forEach(name => {
                const uData = Object.values(app.userMap).find(u => u.nome === name);
                if(uData && uData.foto) {
                    avatarsHtml += `<div class="w-10 h-10 rounded-full border-2 border-white dark:border-[#151c2c] bg-cover bg-center shadow-sm" style="background-image:url('${uData.foto}')" title="${name}"></div>`;
                } else {
                    avatarsHtml += `<div class="w-10 h-10 rounded-full border-2 border-white dark:border-[#151c2c] bg-primary text-white flex items-center justify-center font-bold text-[11px] shadow-sm" title="${name}">${name.substring(0,2).toUpperCase()}</div>`;
                }
            });

            container.innerHTML = `
                <div class="flex items-center justify-between"><button onclick="app.navigate('dashboard')" class="bg-white dark:bg-[#151c2c] p-2.5 rounded-xl shadow-sm border dark:border-white/5 hover:text-primary transition-all"><span class="material-symbols-outlined">arrow_back</span></button><div class="flex items-center gap-2">${btns}</div></div>
                <div class="glass-panel p-8 rounded-3xl border dark:border-white/5 shadow-xl flex flex-col md:flex-row justify-between gap-8 bento-highlight dark:bg-[#151c2c]">
                    <div class="flex-1 text-left">
                        <div class="flex items-center gap-3 mb-2"><h1 class="text-3xl font-display font-black text-primary dark:text-white">${t.title || 'Sem título'}</h1></div>
                        <div class="inline-flex px-2.5 py-0.5 bg-surface-container dark:bg-white/5 rounded-md text-[10px] font-bold uppercase tracking-widest text-on-surface-variant dark:text-gray-300 mb-6">${t.status || 'Em aberto'} • ${t.priority || 'Média'}</div>
                        <p class="text-on-surface-variant/90 dark:text-gray-300 whitespace-pre-line text-sm leading-relaxed mb-6 font-medium">${t.description || 'Sem descrição.'}</p>
                        <div class="grid grid-cols-2 gap-6 border-t border-gray-200 dark:border-white/5 pt-5 text-sm">
                            <div><span class="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant/60">Fim do Prazo</span><p class="font-bold dark:text-white mt-1">${prazoSafe}</p></div>
                            <div><span class="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant/60">Anexos de Suporte</span><div id="task-att-list" class="flex flex-wrap gap-2 mt-2"></div><button onclick="app.handleFileUpload('task', '${id}')" class="mt-3 text-[10px] font-black uppercase tracking-wider text-primary dark:text-blue-400 flex items-center gap-1 hover:opacity-80 transition-all"><span class="material-symbols-outlined text-[14px]">attach_file</span> ANEXAR ARQUIVO</button></div>
                        </div>
                    </div>
                    <div class="md:w-48 border-t md:border-t-0 md:border-l border-gray-200 dark:border-white/5 pt-6 md:pt-0 md:pl-8 text-left flex flex-col">
                        <span class="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant/60 mb-3">Equipe Executora</span>
                        <div class="flex flex-wrap gap-2">${avatarsHtml || '<span class="text-xs font-bold text-gray-400 uppercase">Não definido</span>'}</div>
                    </div>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div class="flex flex-col gap-4 text-left"><div class="flex items-center justify-between p-1 font-black text-[11px] uppercase tracking-wider text-on-surface-variant/70">Subtarefas Conectadas<button onclick="app.openSubtaskForm()" class="bg-primary text-white px-5 py-2.5 rounded-xl text-[10px] font-bold shadow hover:opacity-90 transition-all flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">add</span> Nova</button></div><div id="subtasks-list" class="glass-panel dark:bg-[#151c2c] rounded-3xl border dark:border-white/5 divide-y border-gray-100 dark:divide-white/5 shadow-sm overflow-hidden"></div></div>
                    <div class="flex flex-col gap-4 text-left"><h2 class="font-black text-[11px] uppercase tracking-wider text-on-surface-variant/70 p-1">Painel de Discussão</h2><div class="glass-panel dark:bg-[#151c2c] rounded-3xl border dark:border-white/5 flex flex-col h-[400px] shadow-sm overflow-hidden"><div id="chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div><div class="p-4 border-t border-gray-100 dark:border-white/5 flex gap-2 bg-surface-container-low dark:bg-transparent"><input id="chat-input" onkeydown="if(event.key==='Enter')app.sendChatMessage()" type="text" class="flex-1 bg-white dark:bg-white/5 border-none rounded-xl px-4 text-sm font-medium outline-none shadow-sm dark:text-white focus:ring-2 focus:ring-primary/30" placeholder="Mensagem corporativa..."><button onclick="app.sendChatMessage()" class="bg-primary text-white w-12 h-12 rounded-xl flex items-center justify-center shadow hover:opacity-90 transition-all"><span class="material-symbols-outlined text-[18px]">send</span></button></div></div></div>
                </div>
                <div class="flex gap-4 mt-6"><button onclick="app.openEditModal()" class="flex-1 bg-amber-600 text-white py-4 rounded-2xl font-bold uppercase text-[11px] tracking-wider shadow transition-all hover:opacity-90">Editar Escopo</button><button onclick="app.handleDeleteTask('${id}')" class="bg-red-600 text-white px-8 py-4 rounded-2xl font-bold uppercase text-[11px] tracking-wider shadow transition-all hover:opacity-90">Excluir Demanda</button></div>
            `;
            const al = document.getElementById('task-att-list'); (t.anexos || []).forEach(a => { al.innerHTML += `<a href="${a.data}" download="${a.nome}" class="p-2.5 bg-surface-container dark:bg-white/5 text-[10px] font-bold rounded-xl shadow-sm hover:text-primary dark:text-gray-200 transition-all flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">download</span> ${a.name}</a>`; });
            
            if (app.subtaskUnsub) { app.subtaskUnsub(); }
            if (app.chatUnsub) { app.chatUnsub(); }
            app.listenToSubtasks(id); 
            app.listenToChat(id);
        }));
    },

    listenToSubtasks(tid) {
        app.subtaskUnsub = onSnapshot(collection(db,"tarefas",tid,"subtarefas"), s => {
            const l = document.getElementById('subtasks-list'); if(!l) return;
            const sts = s.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=> (a.ts_manual||0) - (b.ts_manual||0));
            l.innerHTML = sts.length ? sts.map(st => {
                const prioColor = st.priority === 'Alta' ? 'text-red-600 dark:text-red-400' : (st.priority === 'Baixa' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400');
                return `<div class="flex items-center gap-4 px-6 py-4 hover:bg-surface-container dark:hover:bg-white/5 cursor-pointer text-left transition-colors" onclick="if(event.target.type !== 'checkbox') app.openSubtaskView('${st.id}')"><input type="checkbox" ${st.completed?'checked':''} onchange="app.toggleSub('${st.id}', this.checked)" class="rounded text-primary focus:ring-0 w-5 h-5 cursor-pointer"><div class="flex-1 flex flex-wrap items-center justify-between gap-2"><span class="text-sm font-bold ${st.completed?'subtask-done text-on-surface-variant/50':''} dark:text-white">${st.title}</span><span class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${prioColor}">${st.priority || 'Média'}</span></div><span class="material-symbols-outlined text-gray-300 dark:text-gray-600 text-[18px]">chevron_right</span></div>`;
            }).join('') : '<p class="p-8 text-center text-xs text-on-surface-variant/50 italic font-bold">Nenhuma etapa cadastrada.</p>';
        });
        app.unsubs.push(app.subtaskUnsub);
    },

    renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const monthYearLabel = document.getElementById('calendar-month-year');
        if(!grid || !monthYearLabel) return;
        grid.innerHTML = '';

        const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const currentMonthPrefix = `${app.currentYear}-${String(app.currentMonth + 1).padStart(2, '0')}`;
        const totalTarefasMes = app.allTasks.filter(t => t.dueDate && t.dueDate.startsWith(currentMonthPrefix)).length;
        
        monthYearLabel.innerHTML = `${meses[app.currentMonth]} de ${app.currentYear} <span class="text-xs text-primary dark:text-blue-400 font-black uppercase tracking-widest bg-surface-container dark:bg-white/5 px-3 py-1.5 rounded-xl ml-3">(${totalTarefasMes} Demandas)</span>`;

        const primeiroDiaSemana = new Date(app.currentYear, app.currentMonth, 1).getDay();
        const totalDiasMes = new Date(app.currentYear, app.currentMonth + 1, 0).getDate();

        for(let i = 0; i < primeiroDiaSemana; i++) {
            grid.innerHTML += `<div class="p-2 bg-surface-container-low/30 dark:bg-[#151c2c]/30 rounded-2xl min-h-[140px]"></div>`;
        }

        for(let dia = 1; dia <= totalDiasMes; dia++) {
            const mFormat = String(app.currentMonth + 1).padStart(2, '0');
            const dFormat = String(dia).padStart(2, '0');
            const dateStr = `${app.currentYear}-${mFormat}-${dFormat}`;

            const tarefasDoDia = app.allTasks.filter(t => t.dueDate === dateStr);
            let indicatorsHtml = '';
            tarefasDoDia.forEach(t => {
                indicatorsHtml += `<div onclick="app.navigate('detalhes', '${t.id}')" class="text-[9px] font-bold truncate px-2 py-1.5 bg-primary/10 text-primary dark:bg-white/10 dark:text-white rounded-md mt-1 shadow-sm cursor-pointer hover:opacity-80 transition-opacity" title="${t.title}">${t.title}</div>`;
            });

            grid.innerHTML += `
                <div class="p-3 bg-white dark:bg-[#151c2c] rounded-2xl min-h-[140px] border border-gray-100 dark:border-white/5 flex flex-col justify-between hover:shadow-md transition-shadow">
                    <span class="text-xs font-black text-on-surface-variant/80 text-left dark:text-gray-400">${dia}</span>
                    <div class="flex-grow overflow-y-auto custom-scrollbar flex flex-col mt-1 pr-1">${indicatorsHtml}</div>
                </div>
            `;
        }
    },
    
    changeMonth(dir) {
        app.currentMonth += dir;
        if(app.currentMonth < 0) { app.currentMonth = 11; app.currentYear--; }
        if(app.currentMonth > 11) { app.currentMonth = 0; app.currentYear++; }
        app.renderCalendar();
    },

    showConfigTab(tabId) {
        document.querySelectorAll('.config-subtab').forEach(el => el.classList.add('hidden'));
        document.getElementById(`config-tab-${tabId}`).classList.remove('hidden');
        if(tabId === 'users') app.renderUsersDirectory();
    },
    
    renderUsersDirectory() {
        const container = document.getElementById('config-users-list'); if(!container) return;
        container.innerHTML = Object.values(app.userMap).map(u => `
            <div onclick="app.showUserModal('${u.uid}')" class="flex items-center gap-4 p-4 bg-white dark:bg-[#151c2c] border dark:border-white/5 rounded-2xl cursor-pointer hover:shadow-lg transition-all bento-highlight">
                <div class="w-12 h-12 rounded-full bg-cover bg-center shadow bg-primary text-white flex items-center justify-center font-bold text-lg" style="${u.foto?`background-image:url('${u.foto}')`:''}">
                    ${u.foto ? '' : u.nome.substring(0,2).toUpperCase()}
                </div>
                <div class="min-w-0">
                    <p class="text-sm font-black truncate dark:text-white">${u.nome}</p>
                    <p class="text-[11px] font-bold text-on-surface-variant/70 dark:text-gray-400 uppercase tracking-wider truncate mt-0.5">${u.cargo || 'Membro'}</p>
                </div>
            </div>
        `).join('');
    },
    
    showUserModal(uid) {
        const u = app.userMap[uid]; if(!u) return;
        const av = document.getElementById('modal-user-avatar');
        if(u.foto) { av.innerText = ''; av.style.backgroundImage = `url('${u.foto}')`; }
        else { av.innerText = u.nome.substring(0,2).toUpperCase(); av.style.backgroundImage = 'none'; }
        
        document.getElementById('modal-user-name').innerText = u.nome;
        document.getElementById('modal-user-role').innerText = u.cargo || 'Membro da Equipe';
        document.getElementById('modal-user-bio').innerText = u.bio || 'Nenhuma biografia cadastrada.';
        
        document.getElementById('modal-backdrop').classList.replace('hidden', 'flex');
        document.getElementById('modal-user-detail').classList.remove('hidden');
    },

    filterReminders(dateStr) {
        app.currentReminderDate = dateStr;
        app.renderReminders();
    },

    listenToReminders() {
        if(app.reminderUnsub) return;
        app.reminderUnsub = onSnapshot(collection(db, "lembretes"), s => {
            app.allReminders = s.docs.map(d => ({id: d.id, ...d.data()}));
            app.renderReminders();
        });
        app.unsubs.push(app.reminderUnsub);
    },

    renderReminders() {
        const rc = document.getElementById('remindersContainer'); if(!rc) return;
        const targetDate = app.currentReminderDate || app.getTodayStr();
        
        const filtered = app.allReminders
            .filter(l => l.dueDate === targetDate)
            .sort((a, b) => (b.ts || 0) - (a.ts || 0));

        if (filtered.length === 0) {
            rc.innerHTML = '<p class="text-on-surface-variant/40 dark:text-gray-500 text-xs text-center py-6 font-bold italic">Nenhum lembrete para esta data.</p>';
            return;
        }

        rc.innerHTML = filtered.map(l => `
            <div class="flex items-start gap-3 p-3 rounded-2xl hover:bg-surface-container dark:hover:bg-white/5 transition-all group">
                <input type="checkbox" ${l.completed ? 'checked' : ''} onchange="app.toggleReminder('${l.id}', this.checked)" class="mt-1 rounded text-primary focus:ring-0 w-4 h-4 cursor-pointer">
                <div class="flex-1 min-w-0">
                    <p class="text-[13px] font-black ${l.completed ? 'line-through text-on-surface-variant/40 dark:text-gray-600' : 'dark:text-white'}">${l.title}</p>
                    ${l.description ? `<p class="text-[10px] font-medium text-on-surface-variant/70 dark:text-gray-400 mt-1 truncate ${l.completed ? 'opacity-40' : ''}">${l.description}</p>` : ''}
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="app.openEditReminder('${l.id}')" class="opacity-0 group-hover:opacity-100 text-amber-500 hover:text-amber-600 transition-opacity p-1"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                    <button onclick="app.deleteReminder('${l.id}')" class="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-opacity p-1"><span class="material-symbols-outlined text-[18px]">delete</span></button>
                </div>
            </div>
        `).join('');
    },

    openLembreteForm() {
        document.getElementById('lembrete-title-inp').value = '';
        document.getElementById('lembrete-desc-inp').value = '';
        document.getElementById('lembrete-date-inp').value = app.currentReminderDate || app.getTodayStr();
        app.editReminderId = null;
        document.getElementById('modal-backdrop').classList.replace('hidden', 'flex');
        document.getElementById('modal-lembrete-form').classList.remove('hidden');
    },

    async openEditReminder(id) {
        app.editReminderId = id;
        try {
            const d = await getDoc(doc(db, "lembretes", id));
            if (d.exists()) {
                const l = d.data();
                document.getElementById('lembrete-title-inp').value = l.title || '';
                document.getElementById('lembrete-desc-inp').value = l.description || '';
                document.getElementById('lembrete-date-inp').value = l.dueDate || app.getTodayStr();
                document.getElementById('modal-backdrop').classList.replace('hidden', 'flex');
                document.getElementById('modal-lembrete-form').classList.remove('hidden');
            }
        } catch(e) { console.error(e); }
    },

    async saveReminder() {
        try {
            const titleInp = document.getElementById('lembrete-title-inp');
            const descInp = document.getElementById('lembrete-desc-inp');
            const dateInp = document.getElementById('lembrete-date-inp');
            const title = titleInp.value; 
            if(!title) { app.showToast("Título obrigatório", "error"); return; }
            const desc = descInp.value;
            const targetDate = dateInp.value || app.getTodayStr();

            if (app.editReminderId) {
                await updateDoc(doc(db, "lembretes", app.editReminderId), { title, description: desc, dueDate: targetDate });
                await app.addLog(`✏️ Alterou lembrete para: "${title}"`);
                app.showToast("Lembrete atualizado!");
                app.editReminderId = null;
            } else {
                await addDoc(collection(db, "lembretes"), { title, description: desc, dueDate: targetDate, completed: false, ts: Date.now(), createdBy: auth.currentUser.uid });
                await app.addLog(`➕ Criou lembrete: "${title}"`);
                app.showToast("Lembrete criado com sucesso!");
            }
            titleInp.value = ''; descInp.value = '';
            app.currentReminderDate = targetDate;
            const rFilter = document.getElementById('reminder-date-filter');
            if(rFilter) rFilter.value = targetDate;
            app.renderReminders();
            app.closeModal();
        } catch(e) { console.error(e); app.showToast("Erro ao salvar", "error"); }
    },

    async toggleReminder(id, val) { 
        await updateDoc(doc(db, "lembretes", id), { completed: val }); 
        await app.addLog(val ? "✅ Concluiu um lembrete rápido" : "⭕ Remarcou lembrete como pendente");
    },

    async deleteReminder(id) { 
        if(confirm('Apagar lembrete diário?')) {
            const d = await getDoc(doc(db, "lembretes", id));
            const txt = d.exists() ? d.data().title : 'Lembrete';
            await deleteDoc(doc(db, "lembretes", id)); 
            await app.addLog(`🗑️ Removeu lembrete: "${txt}"`);
            app.showToast("Lembrete excluído!");
        } 
    },

    async updateTaskStatus(id, newStatus) { 
        let realStatus = newStatus;
        if(newStatus === 'Concluídas') realStatus = 'Concluída';
        if(newStatus === 'Canceladas') realStatus = 'Cancelada';
        await updateDoc(doc(db, "tarefas", id), { status: realStatus }); 
        const d = await getDoc(doc(db,"tarefas",id));
        await app.addLog(`🔄 "${d.data().title || 'Tarefa'}" -> ${realStatus}`); 
    },

    async openEditModal() { 
        try {
            const d = await getDoc(doc(db,"tarefas",app.currentTaskId)); 
            if(!d.exists()) return app.showToast("Tarefa não encontrada.", "error");
            const t = d.data(); 
            document.getElementById('edit-task-title').value = t.title || ""; 
            document.getElementById('edit-task-desc').value = t.description || ""; 
            document.getElementById('edit-task-priority').value = t.priority || "Média"; 
            document.getElementById('edit-task-date').value = t.dueDate || ""; 
            document.querySelectorAll('.edit-assignees-checkboxes-item').forEach(cb => cb.checked = t.assignees?.includes(cb.value)); 
            document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); 
            document.getElementById('modal-edit-task').classList.remove('hidden'); 
        } catch(e) { console.error(e); app.showToast("Erro ao abrir edição", "error"); }
    },

    async handleUpdateTask() { 
        try {
            const title = document.getElementById('edit-task-title').value; 
            const resps = Array.from(document.querySelectorAll('.edit-assignees-checkboxes-item:checked')).map(cb => cb.value); 
            await updateDoc(doc(db, "tarefas", app.currentTaskId), { title, description: document.getElementById('edit-task-desc').value, priority: document.getElementById('edit-task-priority').value, dueDate: document.getElementById('edit-task-date').value, assignees: resps }); 
            await app.addLog(`✏️ Editou a tarefa: "${title}"`); 
            app.closeModal(); 
            app.showToast("Tarefa atualizada!");
        } catch(e) { console.error(e); app.showToast("Erro ao atualizar", "error"); }
    },

    openSubtaskForm(sid = null) { 
        app.editSubId = sid; 
        app.closeModal(); 
        document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); 
        document.getElementById('modal-subtask-form').classList.remove('hidden'); 
        
        if(sid) { 
            getDoc(doc(db,"tarefas",app.currentTaskId,"subtarefas",sid)).then(d => { 
                const s = d.data(); 
                document.getElementById('sub-title-inp').value = s.title || ""; 
                document.getElementById('sub-desc-inp').value = s.description || ""; 
                document.getElementById('sub-priority-inp').value = s.priority || "Média"; 
                document.getElementById('sub-date-inp').value = s.dueDate || ""; 
                document.querySelectorAll('.sub-assignees-checkboxes-item').forEach(cb => cb.checked = s.assignees?.includes(cb.value)); 
            }); 
        } else { 
            document.getElementById('sub-title-inp').value = ""; 
            document.getElementById('sub-desc-inp').value = ""; 
            document.querySelectorAll('.sub-assignees-checkboxes-item').forEach(cb => cb.checked = false); 
        } 
    },

    async handleSaveSubtask() { 
        try {
            const t = document.getElementById('sub-title-inp').value; 
            if(!t) { app.showToast("Título obrigatório", "error"); return; }
            const resps = Array.from(document.querySelectorAll('.sub-assignees-checkboxes-item:checked')).map(cb => cb.value); 
            const data = { title: t, description: document.getElementById('sub-desc-inp').value, priority: document.getElementById('sub-priority-inp').value, dueDate: document.getElementById('sub-date-inp').value, assignees: resps, ts_manual: Date.now() }; 
            
            if (app.editSubId) { 
                await updateDoc(doc(db, "tarefas", app.currentTaskId, "subtarefas", app.editSubId), data); 
                await app.addLog(`✏️ Editou a subtarefa: "${t}"`);
            } else { 
                await addDoc(collection(db, "tarefas", app.currentTaskId, "subtarefas"), { ...data, completed: false, createdAt: serverTimestamp() }); 
                await app.addLog(`➕ Criou subtarefa: "${t}"`);
            } 
            app.closeModal(); 
            app.showToast("Subtarefa gravada!");
        } catch(e) { console.error(e); app.showToast("Erro ao gravar", "error"); }
    },

    loadUsers() { 
        onSnapshot(collection(db, "usuarios"), (snap) => { 
            app.userMap = {};
            snap.docs.forEach(d => { app.userMap[d.id] = { uid: d.id, ...d.data() }; });
            const opts = snap.docs.map(d => d.data().nome); 
            ['task-assignees-checkboxes', 'edit-assignees-checkboxes', 'sub-assignees-checkboxes'].forEach(cid => { 
                const el = document.getElementById(cid); 
                if (el) el.innerHTML = opts.map(n => `<label class="flex items-center gap-3 p-2 hover:bg-surface-container dark:hover:bg-white/5 rounded-lg cursor-pointer transition-all"><input type="checkbox" value="${n}" class="${cid}-item rounded text-primary focus:ring-0 w-4 h-4"><span class="text-sm font-bold dark:text-white">${n}</span></label>`).join(''); 
            }); 
            const filterEl = document.getElementById('assignee-filter-list');
            if(filterEl) {
                filterEl.innerHTML = opts.map(n => `
                    <label class="flex items-center gap-2 p-1.5 hover:bg-surface-container dark:hover:bg-slate-800 rounded cursor-pointer transition-all">
                        <input type="checkbox" value="${n}" onchange="app.applyFilters()" class="rounded text-primary focus:ring-0 w-4 h-4" ${app.filters.assignees.includes(n) ? 'checked' : ''}>
                        <span class="text-xs font-medium dark:text-white">${n}</span>
                    </label>
                `).join('');
            }
        }); 
    },

    renderRanking() { 
        const rc = document.getElementById('rankingContainer'); if(!rc) return; const pts = {}; 
        app.allTasks.forEach(t => { if(t.status === "Concluída" || t.status === "Concluídas") (t.assignees || ["Equipe"]).forEach(p => pts[p] = (pts[p] || 0) + 1); }); 
        const sorted = Object.entries(pts).sort((a,b)=>b[1]-a[1]); 
        rc.innerHTML = sorted.length ? sorted.map((r, i) => {
            let crown = ''; const svgIcon = `<svg class="w-5 h-5 fill-current drop-shadow-md" viewBox="0 0 24 24"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>`;
            if (i === 0) crown = `<span class="text-amber-400 drop-shadow" title="1º Lugar">${svgIcon}</span>`; else if (i === 1) crown = `<span class="text-slate-400 drop-shadow" title="2º Lugar">${svgIcon}</span>`; else if (i === 2) crown = `<span class="text-amber-700 drop-shadow" title="3º Lugar">${svgIcon}</span>`;
            return `<div class="flex items-center gap-4"><div class="h-10 w-10 rounded-xl bg-surface-container dark:bg-white/5 flex items-center justify-center font-black text-primary dark:text-white shadow-sm">${i+1}</div><div class="flex-1"><div class="flex items-center gap-2 font-black truncate dark:text-white text-sm"><span>${r[0]}</span>${crown}</div><div class="mt-2 w-full bg-surface-container dark:bg-white/5 h-1.5 rounded-full overflow-hidden"><div class="bg-primary h-full" style="width: ${(r[1]/sorted[0][1])*100}%"></div></div></div><div class="font-black text-right dark:text-white text-lg">${r[1]}</div></div>`;
        }).join('') : '<p class="text-on-surface-variant/50 text-xs text-center py-6 font-bold italic">Sem métricas calculadas.</p>'; 
    },

    cleanup() { app.unsubs.forEach(f => f()); app.unsubs = []; },
    
    closeModal() { 
        document.getElementById('modal-backdrop').classList.add('hidden'); 
        document.getElementById('modal-backdrop').classList.remove('flex'); 
        document.querySelectorAll('.modal-box').forEach(m => m.classList.add('hidden')); 
    },
    
    toggleSub(sid, val) { updateDoc(doc(db,"tarefas",app.currentTaskId,"subtarefas",sid), {completed: val}); app.addLog(val ? "✅ Etapa concluída" : "⭕ Etapa pendente"); },
    
    async deleteSub(sid) { 
        if(confirm("Remover subtarefa?")) { 
            const d = await getDoc(doc(db, "tarefas", app.currentTaskId, "subtarefas", sid));
            const subTitle = d.exists() ? d.data().title : 'Subtarefa';
            await deleteDoc(doc(db,"tarefas",app.currentTaskId,"subtarefas",sid)); 
            app.addLog(`🗑️ Excluiu a subtarefa: "${subTitle}"`);
            app.closeModal(); 
        } 
    },
    
    signOut() { 
        const em = document.getElementById('login-email'); 
        const ps = document.getElementById('login-password'); 
        if(em) em.value = ''; 
        if(ps) ps.value = ''; 
        signOut(auth); 
    },
    
    async handleDeleteTask(id) { 
        if(confirm("Excluir tarefa?")) { 
            const d = await getDoc(doc(db,"tarefas",id)); 
            const title = d.exists() ? d.data().title : 'Tarefa';
            await deleteDoc(doc(db,"tarefas",id)); 
            app.addLog(`🗑️ Excluiu a tarefa: "${title}"`);
            app.navigate('dashboard'); 
        } 
    },

    async handleFileUpload(type, id) { const inp = document.createElement('input'); inp.type = 'file'; inp.onchange = (e) => { const f = e.target.files[0]; if(!f || f.size > 800000) return alert("< 800KB"); const r = new FileReader(); r.onload = async (ev) => { const path = type === 'task' ? doc(db,"tarefas",id) : doc(db,"tarefas",app.currentTaskId,"subtarefas",id); const d = await getDoc(path); const anexos = d.data().anexos || []; anexos.push({ name: f.name, data: ev.target.result }); await updateDoc(path, { anexos }); app.addLog(`📎 Anexou arquivo em "${d.data().title || 'Tarefa'}"`); app.showToast("Anexo salvo!"); }; r.readAsDataURL(f); }; inp.click(); },
    
    async loadProfileData() { const u = auth.currentUser; if(!u) return; const d = await getDoc(doc(db, "usuarios", u.uid)); const dt = d.data() || {}; document.getElementById('profile-name-input').value = u.displayName || ""; document.getElementById('profile-role-input').value = dt.cargo || ""; document.getElementById('profile-bio-input').value = dt.bio || ""; const av = document.getElementById('profile-page-avatar'); if(dt.foto || u.photoURL) { av.style.backgroundImage = `url('${dt.foto || u.photoURL}')`; av.innerText = ''; } else { av.innerText = (u.displayName || u.email).substring(0,2).toUpperCase(); av.style.backgroundImage = 'none'; } },
    
    async handleSaveProfile() { try { await updateProfile(auth.currentUser, { displayName: document.getElementById('profile-name-input').value }); const novaFoto = app.tempPhotoBase64; const updateObj = { nome: document.getElementById('profile-name-input').value, cargo: document.getElementById('profile-role-input').value, bio: document.getElementById('profile-bio-input').value }; if (novaFoto !== null) updateObj.foto = novaFoto; await setDoc(doc(db,"usuarios",auth.currentUser.uid), updateObj, {merge:true}); document.getElementById('user-display-name').innerText = document.getElementById('profile-name-input').value; document.getElementById('user-display-role').innerText = document.getElementById('profile-role-input').value; const avH = document.getElementById('header-avatar'); if (novaFoto) { avH.style.backgroundImage = `url('${novaFoto}')`; avH.innerText = ''; } else if (novaFoto === "") { avH.style.backgroundImage = 'none'; avH.innerText = auth.currentUser.displayName.substring(0,2).toUpperCase(); } app.showToast("Perfil corporativo atualizado!"); app.navigate('dashboard'); } catch(e) { app.showToast("Erro ao salvar", "error"); } },
    
    async removeProfilePhoto() { if(confirm("Remover foto?")) { const av = document.getElementById('profile-page-avatar'); av.style.backgroundImage = 'none'; av.innerText = (auth.currentUser.displayName || auth.currentUser.email).substring(0,2).toUpperCase(); app.tempPhotoBase64 = ""; } },
    
    async handlePasswordUpdate() { const u = auth.currentUser; const cur = document.getElementById('current-password-input').value; const n1 = document.getElementById('new-password-input').value; const n2 = document.getElementById('confirm-password-input').value; if(n1 !== n2) return app.showToast("Senhas não coincidem.", "error"); try { await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, cur)); await updatePassword(u, n1); app.showToast("Senha alterada!"); app.navigate('dashboard'); } catch(e) { app.showToast("Senha atual incorreta.", "error"); } },
    
    compressImage(f, cb) { const r = new FileReader(); r.readAsDataURL(f); r.onload = (e) => { const img = new Image(); img.src = e.target.result; img.onload = () => { const canvas = document.createElement('canvas'); const MAX = 300; canvas.width = MAX; canvas.height = img.height * (MAX/img.width); canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); cb(canvas.toDataURL('image/jpeg', 0.7)); }; }; },
    
    listenToChat(tid) { app.unsubs.push(onSnapshot(collection(db,"tarefas",tid,"comentarios"), s => { const c = document.getElementById('chat-messages'); if(c) { const msgs = s.docs.map(d=>d.data()).sort((a,b)=> (a.ts||0) - (b.ts||0)); c.innerHTML = msgs.map(d => `<div class="flex flex-col ${d.createdBy===auth.currentUser.uid?'items-end':'items-start'}"><span class="text-[8px] font-black text-on-surface-variant/50 mb-1 uppercase">${d.authorName}</span><div class="${d.createdBy===auth.currentUser.uid?'bg-primary text-white rounded-br-none':'bg-surface-container dark:bg-white/5 dark:text-white rounded-bl-none'} p-4 rounded-2xl text-[13px] font-medium shadow-sm max-w-[85%]">${d.text || ''}</div></div>`).join(''); c.scrollTop = c.scrollHeight; } })); },
    
    async sendChatMessage() { const i = document.getElementById('chat-input'); if(!i.value.trim()) return; await addDoc(collection(db,"tarefas",app.currentTaskId,"comentarios"), { text: i.value, authorName: auth.currentUser.displayName, createdBy: auth.currentUser.uid, ts: Date.now() }); i.value = ''; },
    
    listenToSubChat(sid) { app.unsubs.push(onSnapshot(collection(db,"tarefas",app.currentTaskId,"subtarefas",sid,"comentarios"), s => { const c = document.getElementById('sub-chat-messages'); if(c) { const msgs = s.docs.map(d=>d.data()).sort((a,b)=> (a.ts||0) - (b.ts||0)); c.innerHTML = msgs.map(d => `<div class="flex flex-col ${d.createdBy===auth.currentUser.uid?'items-end':'items-start'}"><span class="text-[8px] font-black text-on-surface-variant/50 mb-1 uppercase">${d.authorName}</span><div class="${d.createdBy===auth.currentUser.uid?'bg-primary text-white rounded-br-none':'bg-white dark:bg-white/5 dark:text-white rounded-bl-none'} p-4 rounded-2xl text-[13px] font-medium shadow-sm max-w-[85%]">${d.text || ''}</div></div>`).join(''); c.scrollTop = c.scrollHeight; } })); },
    
    async sendSubComment() { const i = document.getElementById('sub-chat-input'); if(!i || !i.value.trim()) return; await addDoc(collection(db,"tarefas",app.currentTaskId,"subtarefas",app.activeSid, "comentarios"), { text: i.value, authorName: auth.currentUser.displayName, createdBy: auth.currentUser.uid, ts: Date.now() }); i.value = ''; },
    
    showToast(m, t='success') { const c = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast ${t} shadow-xl border dark:border-white/5`; toast.innerHTML = `<span class="material-symbols-outlined">${t==='success'?'check_circle':'error'}</span> <span class="font-bold text-sm">${m}</span>`; c.appendChild(toast); setTimeout(() => { toast.style.animation = 'fadeOut 0.3s forwards'; setTimeout(() => toast.remove(), 300); }, 3000); }
};

window.app = app;
app.init();
