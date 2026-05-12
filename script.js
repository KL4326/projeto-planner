import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, onSnapshot, doc, getDoc, deleteDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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
    currentTaskId: null, activeSid: null, editSubId: null, allTasks: [], activeTaskData: null, unsubs: [],
    lastLogCount: parseInt(localStorage.getItem('lastLogCount')) || 0,
    filters: { status: "Todas", search: "" },

    init() { this.bindEvents(); this.checkAuth(); this.initTheme(); this.listenToNotifications(); },
    initTheme() { if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark'); },
    toggleTheme() { document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); },

    navigate(pageId, params = null) {
        this.cleanup();
        document.querySelectorAll('.page-section').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
        const target = document.getElementById(`page-${pageId}`);
        if(target) { target.classList.add('active'); target.style.display = (pageId === 'login') ? 'flex' : 'block'; }
        if(pageId === 'detalhes' && params) this.renderDetails(params);
        if(pageId === 'perfil') this.loadProfileData();
        this.closeModal(); window.scrollTo(0,0);
    },

    bindEvents() {
        document.getElementById('login-form')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } catch(err) { this.showToast("Erro no acesso.", "error"); } });
        document.getElementById('search-input').oninput = (e) => { this.filters.search = e.target.value; this.renderDashboard(); };
        document.querySelectorAll('.filter-btn').forEach(btn => { btn.onclick = () => { document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); this.filters.status = btn.dataset.filter; this.renderDashboard(); }; });
        document.getElementById('notif-btn').onclick = (e) => { e.stopPropagation(); document.getElementById('notif-menu').classList.toggle('hidden'); this.markNotifsRead(); };
        document.getElementById('profile-trigger').onclick = (e) => { e.stopPropagation(); document.getElementById('profile-menu').classList.toggle('hidden'); };
        document.addEventListener('click', () => { document.getElementById('notif-menu')?.classList.add('hidden'); document.getElementById('profile-menu')?.classList.add('hidden'); });
        document.getElementById('submit-edit-task').onclick = () => this.handleUpdateTask();
        document.getElementById('submit-subtask-form').onclick = () => this.handleSaveSubtask();
    },

    checkAuth() { onAuthStateChanged(auth, (u) => { const h = document.getElementById('main-header'); if(u){ h.classList.replace('hidden', 'flex'); this.updateAvatar(u); this.listenToTasks(); this.loadUsers(); this.navigate('dashboard'); } else { h.classList.add('hidden'); this.navigate('login'); } }); },

    async addLog(msg) { await addDoc(collection(db, "notificacoes"), { text: msg, author: auth.currentUser.displayName || auth.currentUser.email, ts: Date.now() }); },
    
    listenToNotifications() {
        onSnapshot(collection(db, "notificacoes"), snap => {
            const list = document.getElementById('notif-list'); const badge = document.getElementById('notif-badge'); if(!list) return;
            const logs = snap.docs.map(d => d.data()).sort((a,b) => b.ts - a.ts);
            if (logs.length > this.lastLogCount) { badge.innerText = logs.length - this.lastLogCount; badge.classList.remove('hidden'); } else badge.classList.add('hidden');
            list.innerHTML = logs.length ? '' : '<p class="p-8 text-center text-xs text-gray-400 italic">Sem alertas.</p>';
            logs.slice(0, 15).forEach(dt => {
                const time = new Date(dt.ts).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'});
                list.innerHTML += `<div class="p-4 border-b dark:border-white/5 text-left"><p class="text-xs font-bold text-gray-700 dark:text-gray-200">${dt.text}</p><div class="flex justify-between mt-1 text-[8px] font-black uppercase text-gray-400"><span>${dt.author}</span><span>${time}</span></div></div>`;
            });
        });
    },
    markNotifsRead() { onSnapshot(collection(db,"notificacoes"), s => { this.lastLogCount = s.docs.length; localStorage.setItem('lastLogCount', this.lastLogCount); document.getElementById('notif-badge').classList.add('hidden'); }); },

    listenToTasks() { onSnapshot(collection(db, "tarefas"), snap => { this.allTasks = snap.docs; this.renderDashboard(); this.renderRanking(); }); },
    renderDashboard() {
        const c = document.getElementById('taskTableBody'); if(!c) return; c.innerHTML = '';
        const sorted = this.allTasks.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.ts_manual || 0) - (a.ts_manual || 0));
        const stats = { 'Atrasado': 0, 'Em aberto': 0, 'Em andamento': 0, 'Concluída': 0, 'Cancelada': 0 };
        const hoje = new Date().toISOString().split('T')[0];
        sorted.forEach(t => { if(t.status!=='Concluída'&&t.status!=='Cancelada'&&t.dueDate<hoje) stats['Atrasado']++; else stats[t.status]++; });
        this.renderStats(stats, sorted.length);
        let filtered = sorted.filter(t => { return t.title.toLowerCase().includes(this.filters.search.toLowerCase()) && (this.filters.status === "Todas" || t.status === this.filters.status); });
        document.getElementById('taskCount').innerText = `(${filtered.length})`;
        filtered.forEach(t => {
            const prazo = t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-PT') : '---';
            const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades['Média'];
            const s_slug = t.status.replace(/\s+/g, '-');
            c.innerHTML += `<tr class="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer" onclick="app.navigate('detalhes', '${t.id}')"><td class="px-6 py-5 relative"><div class="status-strip bg-${s_slug}"></div></td><td class="px-6 py-5"><div><p class="font-bold text-sm text-gray-900 dark:text-white ${t.status==='Concluída'?'line-through opacity-40':''}">${t.title}</p><p class="text-[11px] font-bold text-primary uppercase">Prazo: ${prazo}</p></div></td><td class="px-6 py-5"><span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-${s_slug}/10 text-${s_slug}">${t.status}</span></td><td class="px-6 py-5"><span class="${p.bg} text-white px-2.5 py-0.5 rounded text-[10px] font-black uppercase">${p.label}</span></td><td class="px-6 py-5 text-right font-bold text-xs text-gray-400">${t.assignees?.join(', ') || '---'}</td></tr>`;
        });
    },

    renderStats(s, total) {
        const container = document.getElementById('statsContainer');
        const cards = [ {label: 'Todas', val: total, color: 'gray-500', icon: 'list'}, {label: 'Em aberto', val: s['Em aberto'], color: 'primary', icon: 'pending_actions'}, {label: 'Em andamento', val: s['Em andamento'], color: 'accent-yellow', icon: 'bolt'}, {label: 'Concluída', val: s['Concluída'], color: 'accent-green', icon: 'verified'}, {label: 'Cancelada', val: s['Cancelada'], color: 'accent-red', icon: 'cancel'} ];
        container.innerHTML = cards.map(c => `<div onclick="app.applyStatFilter('${c.label}')" class="cursor-pointer bg-white dark:bg-gray-800 p-5 rounded-2xl border ${this.filters.status===c.label?'ring-2 ring-primary border-primary':'border-gray-200 dark:border-white/10'} shadow-sm relative overflow-hidden transition-all hover:scale-105"><div class="absolute top-0 left-0 w-1 h-full bg-${c.color}"></div><div class="flex justify-between items-start mb-2"><p class="text-gray-500 text-[10px] font-black uppercase tracking-widest">${c.label}</p><span class="material-symbols-outlined text-${c.color} bg-${c.color}/10 p-2 rounded-lg text-lg">${c.icon}</span></div><h3 class="text-3xl font-black dark:text-white">${c.val}</h3></div>`).join('');
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
            let actionBtn = (t.status==='Em aberto' || t.status==='Atrasado') ? `<button onclick="app.updateTaskStatus('${id}', 'Em andamento')" class="bg-primary text-white px-6 py-2 rounded-xl text-xs font-black uppercase shadow-lg">Iniciar tarefa</button>` : (t.status==='Em andamento' ? `<button onclick="app.updateTaskStatus('${id}', 'Cancelada')" class="bg-red-500 text-white px-6 py-2 rounded-xl text-xs font-black uppercase shadow-lg">Cancelar tarefa</button>` : '');
            let concluirBtn = (t.status!=='Concluída'&&t.status!=='Cancelada') ? `<button onclick="app.updateTaskStatus('${id}', 'Concluída')" class="bg-emerald-500 text-white px-6 py-2 rounded-xl text-xs font-black uppercase shadow-lg">Concluir</button>` : '';

            container.innerHTML = `
                <div class="flex items-center justify-between"><button onclick="app.navigate('dashboard')" class="bg-white dark:bg-gray-800 p-2 rounded-xl shadow-sm border dark:border-white/10 hover:text-primary transition-all"><span class="material-symbols-outlined">arrow_back</span></button><div class="flex items-center gap-3">${actionBtn}${concluirBtn}<span class="${p.bg} text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase shadow-lg">${p.label}</span></div></div>
                <div class="bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-200 dark:border-white/10 shadow-xl"><h1 class="text-4xl font-black mb-4 dark:text-white">${t.title}</h1><p class="text-gray-500 dark:text-gray-400 whitespace-pre-line leading-relaxed mb-8 text-sm">${t.description || '...'}</p>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-6 border-t dark:border-white/5 pt-6"><div><span class="text-[9px] font-black uppercase text-gray-400">Equipa</span><p class="text-xs font-bold text-primary">${t.assignees?.join(', ') || '---'}</p></div><div><span class="text-[9px] font-black uppercase text-gray-400">Prazo</span><p class="text-xs font-bold dark:text-white">${t.dueDate || '---'}</p></div><div class="flex flex-col items-start"><span class="text-[9px] font-black uppercase text-gray-400 mb-2">Anexos</span><div id="task-att-list" class="flex flex-wrap gap-2"></div><button onclick="app.handleFileUpload('task', '${id}')" class="mt-3 text-[10px] font-black uppercase text-primary flex items-center gap-1 hover:opacity-70 transition-all"><span class="material-symbols-outlined text-sm">attach_file</span> ANEXAR</button></div></div>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="flex flex-col gap-4 text-left"><div class="flex items-center justify-between p-2 font-black text-xs text-slate-400 uppercase">Subtarefas<button onclick="app.openSubtaskForm()" class="bg-primary text-white px-4 py-2 rounded-xl text-[10px] shadow-lg hover:scale-105 transition-all">Adicionar</button></div><div id="subtasks-list" class="bg-white dark:bg-gray-800 rounded-3xl border dark:border-white/10 divide-y dark:divide-white/5 shadow-sm"></div></div>
                    <div class="flex flex-col gap-4 text-left">
                        <h2 class="font-black uppercase text-xs text-slate-400 p-2">Discussão</h2>
                        <div class="bg-white dark:bg-gray-800 rounded-3xl border dark:border-white/10 flex flex-col h-[400px] shadow-xl overflow-hidden">
                            <div id="chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div>
                            <div class="p-4 border-t dark:border-white/5 flex gap-2 bg-gray-50 dark:bg-black/20"><input id="chat-input" onkeydown="if(event.key === 'Enter') app.sendChatMessage()" type="text" class="flex-1 bg-white dark:bg-[#1a1c22] border-none rounded-xl px-4 text-sm outline-none dark:text-white" placeholder="Escreva algo..."><button onclick="app.sendChatMessage()" class="bg-primary text-white size-10 rounded-xl flex items-center justify-center shadow-lg"><span class="material-symbols-outlined">send</span></button></div>
                        </div>
                    </div>
                </div>
                <div class="flex gap-4 mt-6"><button onclick="app.openEditModal()" class="flex-1 bg-yellow-500 text-white py-4 rounded-2xl font-black shadow-lg uppercase text-[10px] tracking-widest hover:brightness-110 transition-all">Editar Tarefa</button><button onclick="app.handleDeleteTask('${id}')" class="bg-red-500 text-white px-8 py-4 rounded-2xl font-black shadow-lg uppercase text-[10px] tracking-widest hover:brightness-110 transition-all">Excluir</button></div>
            `;
            const al = document.getElementById('task-att-list'); (t.anexos || []).forEach(a => { al.innerHTML += `<a href="${a.data}" download="${a.nome}" class="p-2 bg-gray-100 dark:bg-white/5 border dark:border-white/10 text-[9px] font-bold truncate max-w-[140px] shadow-sm rounded-lg hover:text-primary transition-all">${a.name}</a>`; });
            this.listenToSubtasks(id); this.listenToChat(id);
        }));
    },

    async updateTaskStatus(id, newStatus) { await updateDoc(doc(db, "tarefas", id), { status: newStatus }); await this.addLog(`Manteve a tarefa para "${newStatus}"`); },

    listenToSubtasks(tid) {
        this.unsubs.push(onSnapshot(collection(db,"tarefas",tid,"subtarefas"), s => {
            const l = document.getElementById('subtasks-list'); if(!l) return;
            const sts = s.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=> (a.ts_manual||0) - (b.ts_manual||0));
            l.innerHTML = sts.length ? sts.map(st => {
                const p = CONFIG.prioridades[st.priority] || CONFIG.prioridades['Média'];
                return `<div class="flex items-center gap-3 px-6 py-4 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer text-left" onclick="if(event.target.type !== 'checkbox') app.openSubtaskView('${st.id}')"><input type="checkbox" ${st.completed?'checked':''} onchange="app.toggleSub('${st.id}', this.checked)" class="rounded text-primary w-5 h-5"><div class="flex-1 flex items-center justify-between gap-2"><span class="text-sm font-bold ${st.completed?'subtask-done text-gray-400':'dark:text-white'}">${st.title}</span><span class="${p.bg} text-white px-2 py-0.5 rounded text-[8px] font-black uppercase opacity-90">${p.label}</span></div><span class="material-symbols-outlined text-gray-300 text-sm">chevron_right</span></div>`;
            }).join('') : '<p class="p-8 text-center text-xs text-gray-400">Nenhuma etapa.</p>';
        }));
    },

    async openSubtaskView(sid) {
        this.activeSid = sid; const d = (await getDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", sid))).data();
        const p = CONFIG.prioridades[d.priority] || CONFIG.prioridades['Média'];
        const cont = document.getElementById('subtask-view-content');
        cont.innerHTML = `
            <div class="w-full md:w-1/2 p-8 border-r dark:border-white/10 overflow-y-auto flex flex-col gap-6 bg-white dark:bg-[#1a1c22] text-left">
                <div class="flex items-center justify-between font-black text-[10px] uppercase text-gray-400 tracking-widest">Detalhes da Subtarefa<button onclick="app.closeModal()"><span class="material-symbols-outlined text-gray-400">close</span></button></div>
                <div><div class="flex items-center gap-3 mb-2"><h3 class="text-3xl font-black text-primary">${d.title}</h3><span class="${p.bg} text-white px-2 py-0.5 rounded text-[8px] font-black uppercase">${p.label}</span></div><div class="p-4 bg-gray-50 dark:bg-black/20 rounded-xl border dark:border-white/5 text-sm text-gray-500 dark:text-gray-300 italic leading-relaxed">${d.description || 'Sem descrição.'}</div></div>
                <div class="grid grid-cols-2 gap-4 border-t dark:border-white/5 pt-6"><div><span class="text-[9px] font-black uppercase text-gray-400">Responsáveis</span><p class="text-xs font-bold text-gray-700 dark:text-gray-200">${d.assignees?.join(', ') || 'Não definido'}</p></div><div><span class="text-[9px] font-black uppercase text-gray-400">Prazo</span><p class="text-xs font-bold dark:text-white">${d.dueDate || '---'}</p></div></div>
                <div class="flex flex-col border-t dark:border-white/5 pt-4 text-left"><span class="text-[9px] font-black uppercase text-gray-400 mb-2">Anexos</span><div id="sub-att-list" class="flex flex-wrap gap-2"></div><button onclick="app.handleFileUpload('sub', '${sid}')" class="mt-3 text-[10px] font-black uppercase text-primary flex items-center gap-1 hover:opacity-70"><span class="material-symbols-outlined text-sm">attach_file</span> ANEXAR</button></div>
                <div class="flex gap-2 mt-auto pt-6"><button onclick="app.openSubtaskForm('${sid}')" class="flex-1 bg-yellow-500 text-white py-3 rounded-xl font-black text-[10px] uppercase shadow-md transition-all">Editar</button><button onclick="app.deleteSub('${sid}')" class="bg-red-500/10 text-red-500 px-4 rounded-xl hover:bg-red-500 hover:text-white transition-all"><span class="material-symbols-outlined text-sm">delete</span></button></div>
            </div>
            <div class="flex-1 flex flex-col bg-gray-50 dark:bg-black/40 text-left">
                <div class="p-4 border-b dark:border-white/10 font-black text-[10px] uppercase text-gray-400">Chat Interno</div>
                <div id="sub-chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div>
                <div class="p-4 border-t dark:border-white/10 flex gap-2"><input id="sub-chat-input" onkeydown="if(event.key === 'Enter') app.sendSubComment()" type="text" class="flex-1 bg-white dark:bg-[#1a1c22] border-none rounded-xl px-4 text-sm outline-none dark:text-white" placeholder="Escreva..."><button onclick="app.sendSubComment()" class="bg-primary text-white size-10 rounded-xl flex items-center justify-center shadow-lg"><span class="material-symbols-outlined">send</span></button></div>
            </div>
        `;
        const sl = document.getElementById('sub-att-list'); (d.anexos || []).forEach(a => { sl.innerHTML += `<a href="${a.data}" download="${a.nome}" class="p-2 bg-white dark:bg-white/5 border dark:border-white/10 text-[9px] font-bold rounded shadow-sm hover:text-primary transition-all">${a.name}</a>`; });
        document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); document.getElementById('modal-subtask-view').classList.remove('hidden');
        this.listenToSubChat(sid);
    },

    async openEditModal() {
        const d = await getDoc(doc(db,"tarefas",this.currentTaskId)); const t = d.data();
        document.getElementById('edit-task-title').value = t.title;
        document.getElementById('edit-task-desc').value = t.description || "";
        document.getElementById('edit-task-priority').value = t.priority || "Média";
        document.getElementById('edit-task-date').value = t.dueDate || "";
        document.querySelectorAll('.edit-assignees-checkboxes-item').forEach(cb => cb.checked = t.assignees?.includes(cb.value));
        document.getElementById('modal-backdrop').classList.replace('hidden', 'flex');
        document.getElementById('modal-edit-task').classList.remove('hidden');
    },

    async handleUpdateTask() {
        const title = document.getElementById('edit-task-title').value;
        const resps = Array.from(document.querySelectorAll('.edit-assignees-checkboxes-item:checked')).map(cb => cb.value);
        await updateDoc(doc(db, "tarefas", this.currentTaskId), { title, description: document.getElementById('edit-task-desc').value, priority: document.getElementById('edit-task-priority').value, dueDate: document.getElementById('edit-task-date').value, assignees: resps });
        await this.addLog(`✏️ Editou a tarefa: "${title}"`); this.closeModal();
    },

    // --- REUTILIZÁVEIS ---
    async handleSaveSubtask() { const t = document.getElementById('sub-title-inp').value; if(!t) return; const resps = Array.from(document.querySelectorAll('.sub-assignees-checkboxes-item:checked')).map(cb => cb.value); const data = { title: t, description: document.getElementById('sub-desc-inp').value, priority: document.getElementById('sub-priority-inp').value, dueDate: document.getElementById('sub-date-inp').value, assignees: resps, ts_manual: Date.now() }; if (this.editSubId) await updateDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", this.editSubId), data); else await addDoc(collection(db, "tarefas", this.currentTaskId, "subtarefas"), { ...data, completed: false, createdAt: serverTimestamp() }); await this.addLog(`➕ Criou subtarefa: "${t}"`); this.closeModal(); },
    cleanup() { this.unsubs.forEach(f => f()); this.unsubs = []; },
    updateAvatar(u) { const av = document.getElementById('header-avatar'); if(u.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${u.photoURL}')`; } else av.innerText = (u.displayName || u.email).substring(0,2).toUpperCase(); },
    closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); document.querySelectorAll('.modal-box').forEach(m => m.classList.add('hidden')); },
    toggleSub(sid, val) { updateDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid), {completed: val}); this.addLog(val ? "✅ Concluiu uma etapa" : "⭕ Desmarcou uma etapa"); },
    deleteSub(sid) { if(confirm("Remover?")) { deleteDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid)); this.closeModal(); } },
    loadUsers() { onSnapshot(collection(db, "usuarios"), (snap) => { const opts = snap.docs.map(d => d.data().nome); ['task-assignees-checkboxes', 'edit-assignees-checkboxes', 'sub-assignees-checkboxes'].forEach(cid => { const el = document.getElementById(cid); if (el) el.innerHTML = opts.map(n => `<label class="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded cursor-pointer transition-all"><input type="checkbox" value="${n}" class="${cid}-item rounded text-primary w-4 h-4"><span class="text-xs font-bold">${n}</span></label>`).join(''); }); }); },
    showToast(m, t='success') { const c = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast ${t} shadow-xl border dark:border-white/10`; toast.innerHTML = `<span class="material-symbols-outlined">${t==='success'?'check_circle':'error'}</span> ${m}`; c.appendChild(toast); setTimeout(() => { toast.style.animation = 'fadeOut 0.3s forwards'; setTimeout(() => toast.remove(), 300); }, 3000); },
    renderRanking() { const rc = document.getElementById('rankingContainer'); if(!rc) return; const pts = {}; this.allTasks.forEach(d => { if(d.data().status === "Concluída") (d.data().assignees || ["Equipa"]).forEach(p => pts[p] = (pts[p] || 0) + 1); }); const sorted = Object.entries(pts).sort((a,b)=>b[1]-a[1]); rc.innerHTML = sorted.length ? sorted.map((r, i) => `<div class="flex items-center gap-4"><div class="h-10 w-10 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-sm font-black text-primary">${i+1}</div><div class="flex-1"><p class="font-bold text-sm dark:text-white">${r[0]}</p><div class="mt-2 w-full bg-gray-100 dark:bg-white/5 h-1.5 rounded-full overflow-hidden"><div class="bg-primary h-full" style="width: ${(r[1]/sorted[0][1])*100}%"></div></div></div><div class="text-right text-xs font-black dark:text-white">${r[1]}</div></div>`).join('') : '<p class="text-gray-500 text-xs text-center py-4">Sem atividade.</p>'; },
    signOut() { signOut(auth); },
    async handleFileUpload(type, id) { const inp = document.createElement('input'); inp.type = 'file'; inp.onchange = (e) => { const f = e.target.files[0]; if(!f || f.size > 800000) return alert("< 800KB"); const r = new FileReader(); r.onload = async (ev) => { const path = type === 'task' ? doc(db,"tarefas",id) : doc(db,"tarefas",this.currentTaskId,"subtarefas",id); const d = await getDoc(path); const anexos = d.data().anexos || []; anexos.push({ name: f.name, data: ev.target.result }); await updateDoc(path, { anexos }); this.showToast("Arquivo anexado!"); }; r.readAsDataURL(f); }; inp.click(); },
    async handleDeleteTask(id) { if(confirm("Excluir tarefa?")) { const d = await getDoc(doc(db,"tarefas",id)); const title = d.data().title; await deleteDoc(doc(db,"tarefas",id)); await this.addLog(`🗑️ Excluiu a tarefa: "${title}"`); this.navigate('dashboard'); } },
    async loadProfileData() { const u = auth.currentUser; if(!u) return; const d = await getDoc(doc(db, "usuarios", u.uid)); const dt = d.data() || {}; document.getElementById('profile-name-input').value = u.displayName || ""; document.getElementById('profile-bio-input').value = dt.bio || ""; const av = document.getElementById('profile-page-avatar'); if(u.photoURL) av.style.backgroundImage = `url('${u.photoURL}')`; else av.innerText = (u.displayName || u.email).substring(0,2).toUpperCase(); },
    async handleSaveProfile() { try { await updateProfile(auth.currentUser, { displayName: document.getElementById('profile-name-input').value }); await setDoc(doc(db,"usuarios",auth.currentUser.uid), { nome: document.getElementById('profile-name-input').value, bio: document.getElementById('profile-bio-input').value, foto: auth.currentUser.photoURL }, {merge:true}); this.showToast("Perfil salvo!"); this.navigate('dashboard'); } catch(e) { alert("Erro."); } },
    listenToChat(tid) { this.unsubs.push(onSnapshot(collection(db,"tarefas",tid,"comentarios"), s => { const c = document.getElementById('chat-messages'); if(c) { const msgs = s.docs.map(d=>d.data()).sort((a,b)=> (a.ts||0) - (b.ts||0)); c.innerHTML = msgs.map(d => `<div class="flex flex-col ${d.createdBy===auth.currentUser.uid?'items-end':'items-start'}"><span class="text-[8px] font-black text-gray-400 mb-1 uppercase">${d.authorName}</span><div class="${d.createdBy===auth.currentUser.uid?'bg-primary text-white rounded-br-none':'bg-gray-100 dark:bg-white/10 dark:text-white rounded-bl-none'} p-3 rounded-2xl text-xs shadow-sm max-w-[85%] font-medium">${d.text}</div></div>`).join(''); c.scrollTop = c.scrollHeight; } })); },
    async sendChatMessage() { const i = document.getElementById('chat-input'); if(!i.value.trim()) return; await addDoc(collection(db,"tarefas",this.currentTaskId,"comentarios"), { text: i.value, authorName: auth.currentUser.displayName, createdBy: auth.currentUser.uid, ts: Date.now() }); i.value = ''; },
    listenToSubChat(sid) { this.unsubs.push(onSnapshot(collection(db,"tarefas",this.currentTaskId,"subtarefas",sid,"comentarios"), s => { const c = document.getElementById('sub-chat-messages'); if(c) { const msgs = s.docs.map(d=>d.data()).sort((a,b)=> (a.ts||0) - (b.ts||0)); c.innerHTML = msgs.map(d => `<div class="flex flex-col ${d.createdBy===auth.currentUser.uid?'items-end':'items-start'}"><div class="${d.createdBy===auth.currentUser.uid?'bg-primary text-white rounded-br-none':'bg-white dark:bg-white/10 dark:text-white rounded-bl-none'} p-3 rounded-2xl text-xs shadow-sm max-w-[90%] font-medium">${d.text}</div></div>`).join(''); c.scrollTop = c.scrollHeight; } })); },
    async sendSubComment() { const i = document.getElementById('sub-chat-input'); if(!i || !i.value.trim()) return; await addDoc(collection(db,"tarefas",this.currentTaskId,"subtarefas",this.activeSid, "comentarios"), { text: i.value, authorName: auth.currentUser.displayName, createdBy: auth.currentUser.uid, ts: Date.now() }); i.value = ''; },
    openSubtaskForm(sid = null) { this.editSubId = sid; this.closeModal(); document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); document.getElementById('modal-subtask-form').classList.remove('hidden'); if(sid) { getDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid)).then(d => { const s = d.data(); document.getElementById('sub-title-inp').value = s.title; document.getElementById('sub-desc-inp').value = s.description || ""; document.getElementById('sub-priority-inp').value = s.priority || "Média"; document.getElementById('sub-date-inp').value = s.dueDate || ""; document.querySelectorAll('.sub-assignees-checkboxes-item').forEach(cb => cb.checked = s.assignees?.includes(cb.value)); }); } else { document.getElementById('sub-title-inp').value = ""; document.getElementById('sub-desc-inp').value = ""; document.querySelectorAll('.sub-assignees-checkboxes-item').forEach(cb => cb.checked = false); } }
};

window.app = app;
app.init();
