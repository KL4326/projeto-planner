import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, onSnapshot, doc, getDoc, deleteDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, updatePassword, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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
    prioridades: { urgent: { label: 'Urgente', bg: 'bg-rose-700' }, high: { label: 'Alta', bg: 'bg-red-500' }, medium: { label: 'Média', bg: 'bg-orange-500' }, low: { label: 'Baixa', bg: 'bg-yellow-500' } }
};

const app = {
    currentTaskId: null, activeSid: null, editSubId: null, tempPhotoBase64: null, 
    allTasks: [], activeTaskData: null, unsubs: [],
    lastLogCount: parseInt(localStorage.getItem('lastLogCount')) || 0,
    filters: { status: "Todas", search: "" },

    init() { this.bindEvents(); this.checkAuth(); this.initTheme(); this.listenToNotifications(); },
    initTheme() { const t = localStorage.getItem('theme') || 'dark'; document.documentElement.classList.toggle('dark', t === 'dark'); },
    
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
        document.getElementById('login-form')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } catch(err) { alert("Erro de acesso."); } });
        document.getElementById('search-input').oninput = (e) => { this.filters.search = e.target.value; this.renderDashboard(); };
        document.querySelectorAll('.filter-btn').forEach(btn => { btn.onclick = () => { document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); this.filters.status = btn.dataset.filter; this.renderDashboard(); }; });
        document.getElementById('save-task-btn').onclick = () => this.handleCreateTask();
        document.getElementById('save-profile-btn').onclick = () => this.handleSaveProfile();
        document.getElementById('submit-edit-task').onclick = () => this.handleUpdateTask();
        document.getElementById('submit-subtask-form').onclick = () => this.handleSaveSubtask();
        document.getElementById('profile-btn').onclick = (e) => { e.stopPropagation(); document.getElementById('profile-menu').classList.toggle('hidden'); };
        document.getElementById('notif-btn').onclick = (e) => { e.stopPropagation(); document.getElementById('notif-menu').classList.toggle('hidden'); this.markNotifsRead(); };
        document.addEventListener('click', () => { document.getElementById('profile-menu')?.classList.add('hidden'); document.getElementById('notif-menu')?.classList.add('hidden'); });
        document.querySelectorAll('.theme-toggle').forEach(b => b.onclick = () => { const isD = document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', isD ? 'dark' : 'light'); });
        document.getElementById('profile-upload')?.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { this.compressImage(file, (b64) => { this.tempPhotoBase64 = b64; document.getElementById('profile-page-avatar').style.backgroundImage = `url('${b64}')`; document.getElementById('profile-page-avatar').innerText = ''; }); } });
    },

    checkAuth() { onAuthStateChanged(auth, (user) => { const h = document.getElementById('main-header'); if (user) { h.classList.replace('hidden', 'flex'); this.updateAvatar(user); this.listenToTasks(); this.loadUsers(); this.navigate('dashboard'); } else { h.classList.add('hidden'); this.navigate('login'); } }); },

    // --- LOGS ---
    async addLog(msg) {
        await addDoc(collection(db, "notificacoes"), { text: msg, author: auth.currentUser.displayName || auth.currentUser.email, ts: Date.now() });
    },
    listenToNotifications() {
        onSnapshot(collection(db, "notificacoes"), snap => {
            const list = document.getElementById('notif-list'); const badge = document.getElementById('notif-badge'); if(!list) return;
            const logs = snap.docs.map(d => d.data()).sort((a,b) => b.ts - a.ts);
            const currentTotal = logs.length;
            if (currentTotal > this.lastLogCount) { badge.innerText = currentTotal - this.lastLogCount; badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); }
            list.innerHTML = logs.length ? '' : '<p class="p-8 text-center text-xs text-slate-400 italic">Sem logs.</p>';
            logs.slice(0, 15).forEach(dt => {
                const time = new Date(dt.ts).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'});
                list.innerHTML += `<div class="p-4 border-b dark:border-slate-800"><p class="text-xs font-bold text-slate-700 dark:text-slate-200">${dt.text}</p><div class="flex justify-between mt-1 text-[8px] font-black uppercase text-slate-400"><span>${dt.author}</span><span>${time}</span></div></div>`;
            });
        });
    },
    markNotifsRead() { onSnapshot(collection(db, "notificacoes"), snap => { this.lastLogCount = snap.docs.length; localStorage.setItem('lastLogCount', this.lastLogCount); document.getElementById('notif-badge').classList.add('hidden'); }); },

    // --- DASHBOARD (Ajustado: Prazo no lugar de Projeto) ---
    listenToTasks() { onSnapshot(collection(db, "tarefas"), snap => { this.allTasks = snap.docs; this.renderDashboard(); this.renderRanking(); }); },
    renderDashboard() {
        const c = document.getElementById('tasks-container'); if(!c) return; c.innerHTML = '';
        const sorted = this.allTasks.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.ts_manual || 0) - (a.ts_manual || 0));
        sorted.forEach(t => {
            const mSearch = (t.title || "").toLowerCase().includes(this.filters.search.toLowerCase());
            const mStat = this.filters.status === "Todas" || t.status === this.filters.status;
            if(mSearch && mStat) {
                const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
                const prazoFormatado = t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-PT') : 'Sem prazo';
                const div = document.createElement('div'); div.className = "p-4 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-800 mb-1 cursor-pointer flex items-center gap-3 shadow-sm";
                div.onclick = (e) => { if(!e.target.closest('.drag-handle')) this.navigate('detalhes', t.id); };
                div.innerHTML = `
                    <span class="material-symbols-outlined drag-handle text-slate-300 dark:text-slate-600">drag_indicator</span>
                    <div class="flex-1">
                        <span class="font-bold text-slate-900 dark:text-white">${t.title}</span>
                        <div class="flex items-center gap-2 mt-1 text-[9px] uppercase font-black opacity-60">
                            <span class="text-primary">Prazo: ${prazoFormatado}</span>
                            <span>|</span>
                            <span>${t.assignees?.join(', ') || '---'}</span>
                        </div>
                    </div>
                    <span class="text-[9px] font-black uppercase px-2 py-1 rounded-full ${p.bg} text-white">${p.label}</span>
                `;
                c.appendChild(div);
            }
        });
        new Sortable(c, { animation: 150, handle: '.drag-handle' });
    },

    // --- DETALHES (Dropdown de Status Adicionado) ---
    renderDetails(id) {
        this.currentTaskId = id; const container = document.getElementById('details-view-content');
        this.unsubs.push(onSnapshot(doc(db, "tarefas", id), (d) => {
            if(!d.exists()) return;
            const t = d.data(); this.activeTaskData = t;
            const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low; const dateStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-PT') : '---';
            container.innerHTML = `
                <div class="flex items-center justify-between">
                    <button onclick="app.navigate('dashboard')" class="bg-white dark:bg-slate-800 p-2 rounded-xl shadow-sm"><span class="material-symbols-outlined">arrow_back</span></button>
                    <div class="flex items-center gap-3">
                        <select onchange="app.updateTaskStatus('${id}', this.value)" class="h-8 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-[9px] font-black uppercase outline-none focus:ring-1 focus:ring-primary">
                            <option value="Em aberto" ${t.status==='Em aberto'?'selected':''}>Em aberto</option>
                            <option value="Em andamento" ${t.status==='Em andamento'?'selected':''}>Em andamento</option>
                            <option value="Concluída" ${t.status==='Concluída'?'selected':''}>Concluída</option>
                            <option value="Cancelada" ${t.status==='Cancelada'?'selected':''}>Cancelada</option>
                        </select>
                        <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase text-white ${p.bg}">${p.label}</span>
                    </div>
                </div>
                <div class="bg-white dark:bg-slate-900 p-8 rounded-3xl border dark:border-slate-800 shadow-xl">
                    <h1 class="text-4xl font-black mb-4">${t.title}</h1>
                    <p class="text-slate-500 whitespace-pre-line leading-relaxed mb-8 text-sm">${t.description || '...'}</p>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-6 border-t dark:border-slate-800 pt-6">
                        <div><span class="text-[9px] font-black uppercase text-slate-400">Responsáveis</span><p class="text-xs font-bold text-primary">${t.assignees?.join(', ') || '---'}</p></div>
                        <div><span class="text-[9px] font-black uppercase text-slate-400">Prazo Final</span><p class="text-xs font-bold text-slate-700 dark:text-slate-300">${dateStr}</p></div>
                        <div class="items-start flex-1"><span class="text-[9px] font-black uppercase text-slate-400 mb-2 block">Anexos</span><div id="task-att-list" class="flex flex-wrap gap-2"></div><button onclick="app.handleFileUpload('task', '${id}')" class="mt-3 text-[10px] font-black uppercase text-primary flex items-center gap-1"><span class="material-symbols-outlined text-sm">attach_file</span> ANEXAR</button></div>
                    </div>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="flex flex-col gap-4"><div class="flex items-center justify-between p-2 font-black text-xs text-slate-400 uppercase">Subtarefas<button onclick="app.openSubtaskForm()" class="bg-primary text-white px-4 py-2 rounded-xl text-[10px] shadow-lg">Adicionar subtarefa</button></div><div id="subtasks-list" class="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 divide-y dark:divide-slate-800 shadow-sm"></div></div>
                    <div class="flex flex-col gap-4">
                        <h2 class="font-black uppercase text-xs text-slate-400 p-2">Discussão</h2>
                        <div class="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 flex flex-col h-[400px] shadow-xl overflow-hidden">
                            <div id="chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div>
                            <div class="p-4 border-t dark:border-slate-800 flex gap-2"><input id="chat-input" type="text" class="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none dark:text-white shadow-sm" placeholder="Chat..."><button onclick="app.sendChatMessage()" class="bg-primary text-white size-10 rounded-xl flex items-center justify-center shadow-lg"><span class="material-symbols-outlined">send</span></button></div>
                        </div>
                    </div>
                </div>
                <div class="flex gap-4 mt-6"><button onclick="app.openEditModal()" class="flex-1 bg-yellow-500 text-white py-4 rounded-2xl font-black shadow-lg uppercase text-xs">Editar Tarefa</button><button onclick="app.handleDeleteTask('${id}')" class="bg-red-500 text-white px-8 py-4 rounded-2xl font-black shadow-lg uppercase text-xs">Excluir</button></div>
            `;
            const al = document.getElementById('task-att-list'); (t.anexos || []).forEach(a => { al.innerHTML += `<a href="${a.data}" download="${a.nome}" class="p-2 bg-white dark:bg-slate-800 rounded-lg border text-[9px] font-bold shadow-sm">${a.nome}</a>`; });
            this.listenToSubtasks(id); this.listenToChat(id);
        }));
    },

    // --- FUNÇÕES DE AÇÃO ---
    async updateTaskStatus(id, newStatus) {
        await updateDoc(doc(db, "tarefas", id), { status: newStatus });
        await this.addLog(`Manteve a tarefa para "${newStatus}"`);
    },

    async handleCreateTask() {
        const title = document.getElementById('task-title').value; if(!title) return;
        const assignees = Array.from(document.querySelectorAll('.task-assignees-checkboxes-item:checked')).map(cb => cb.value);
        await addDoc(collection(db, "tarefas"), { title, description: document.getElementById('task-desc').value, priority: document.getElementById('task-priority-droplist').value, assignees, status: "Em aberto", ts_manual: Date.now(), createdAt: serverTimestamp(), createdBy: auth.currentUser.uid, dueDate: document.getElementById('task-date').value });
        await this.addLog(`Criou a tarefa: "${title}"`);
        this.navigate('dashboard');
    },

    async handleUpdateTask() {
        const title = document.getElementById('edit-task-title').value; if(!title) return;
        const assignees = Array.from(document.querySelectorAll('.edit-assignees-checkboxes-item:checked')).map(cb => cb.value);
        await updateDoc(doc(db, "tarefas", this.currentTaskId), { title, description: document.getElementById('edit-task-desc').value, priority: document.getElementById('edit-task-priority').value, dueDate: document.getElementById('edit-task-date').value, assignees });
        await this.addLog(`Editou a tarefa: "${title}"`);
        this.closeModal();
    },

    async handleDeleteTask(id) {
        if(confirm("Apagar permanentemente?")) {
            const d = await getDoc(doc(db, "tarefas", id)); const title = d.data().title;
            await deleteDoc(doc(db, "tarefas", id));
            await this.addLog(`Eliminou a tarefa: "${title}"`);
            this.navigate('dashboard');
        }
    },

    // --- UTILITÁRIOS ---
    async openEditModal() { const d = await getDoc(doc(db,"tarefas",this.currentTaskId)); const t = d.data(); document.getElementById('edit-task-title').value = t.title; document.getElementById('edit-task-desc').value = t.description || ""; document.getElementById('edit-task-priority').value = t.priority || "medium"; document.getElementById('edit-task-date').value = t.dueDate || ""; document.querySelectorAll('.edit-assignees-checkboxes-item').forEach(cb => cb.checked = t.assignees?.includes(cb.value)); document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); document.getElementById('modal-edit-task').classList.remove('hidden'); },
    openSubtaskForm(sid = null) { this.editSubId = sid; this.closeModal(); document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); document.getElementById('modal-subtask-form').classList.remove('hidden'); if (sid) { getDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid)).then(d => { const s = d.data(); document.getElementById('sub-title-inp').value = s.title; document.getElementById('sub-desc-inp').value = s.description || ""; document.getElementById('sub-priority-inp').value = s.priority || "medium"; document.getElementById('sub-date-inp').value = s.dueDate || ""; document.querySelectorAll('.sub-assignees-checkboxes-item').forEach(cb => cb.checked = s.assignees?.includes(cb.value)); }); } else { document.getElementById('sub-title-inp').value = ""; document.getElementById('sub-desc-inp').value = ""; document.querySelectorAll('.sub-assignees-checkboxes-item').forEach(cb => cb.checked = false); } },
    async handleSaveSubtask() { const t = document.getElementById('sub-title-inp').value; if(!t) return; const assignees = Array.from(document.querySelectorAll('.sub-assignees-checkboxes-item:checked')).map(cb => cb.value); const data = { title: t, description: document.getElementById('sub-desc-inp').value, priority: document.getElementById('sub-priority-inp').value, dueDate: document.getElementById('sub-date-inp').value, assignees, ts_manual: Date.now() }; if (this.editSubId) { await updateDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",this.editSubId), data); await this.addLog(`Editou a subtarefa: "${t}"`); } else { await addDoc(collection(db,"tarefas",this.currentTaskId,"subtarefas"), { ...data, completed: false, createdAt: serverTimestamp() }); await this.addLog(`Adicionou a subtarefa: "${t}"`); } this.closeModal(); },
    cleanup() { this.unsubs.forEach(f => f()); this.unsubs = []; },
    updateAvatar(u) { const av = document.getElementById('header-avatar'); if(u.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${u.photoURL}')`; } else av.innerText = (u.displayName || u.email).substring(0,2).toUpperCase(); },
    closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); document.querySelectorAll('.modal-box').forEach(m => m.classList.add('hidden')); },
    toggleSub(sid, val) { updateDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid), {completed: val}); this.addLog(val ? "✅ Concluiu subtarefa" : "⭕ Desmarcou subtarefa"); },
    deleteSub(sid) { if(confirm("Eliminar?")) { deleteDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid)); this.addLog("🗑️ Removeu subtarefa"); this.closeModal(); } },
    loadUsers() { onSnapshot(collection(db, "usuarios"), (snap) => { const opts = snap.docs.map(d => d.data().nome); ['task-assignees-checkboxes', 'edit-assignees-checkboxes', 'sub-assignees-checkboxes'].forEach(cid => { const el = document.getElementById(cid); if (el) el.innerHTML = opts.map(n => `<label class="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer transition-all"><input type="checkbox" value="${n}" class="${cid}-item rounded text-primary w-4 h-4"><span class="text-xs font-bold text-slate-700 dark:text-slate-300">${n}</span></label>`).join(''); }); }); },
    compressImage(f, cb) { const r = new FileReader(); r.readAsDataURL(f); r.onload = (e) => { const img = new Image(); img.src = e.target.result; img.onload = () => { const canvas = document.createElement('canvas'); const MAX = 300; canvas.width = MAX; canvas.height = img.height * (MAX / img.width); canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); cb(canvas.toDataURL('image/jpeg', 0.7)); }; }; },
    async sendChatMessage() { const i = document.getElementById('chat-input'); if(!i.value.trim()) return; await addDoc(collection(db,"tarefas",this.currentTaskId,"comentarios"), { text: i.value, authorName: auth.currentUser.displayName, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() }); i.value = ''; },
    listenToChat(tid) { this.unsubs.push(onSnapshot(query(collection(db,"tarefas",tid,"comentarios"), orderBy("createdAt","asc")), s => { const c = document.getElementById('chat-messages'); if(c) { c.innerHTML = ''; s.forEach(doc => { const d = doc.data(); const isMe = d.createdBy === auth.currentUser.uid; c.innerHTML += `<div class="flex flex-col ${isMe?'items-end':'items-start'}"><span class="text-[8px] font-black text-slate-400 mb-1 uppercase">${d.authorName}</span><div class="${isMe?'bg-primary text-white rounded-br-none':'bg-slate-100 dark:bg-slate-800 rounded-bl-none'} p-3 rounded-2xl text-xs shadow-sm max-w-[85%]">${d.text}</div></div>`; }); c.scrollTop = c.scrollHeight; } })); },
    listenToSubtasks(tid) { this.unsubs.push(onSnapshot(collection(db,"tarefas",tid,"subtarefas"), s => { const l = document.getElementById('subtasks-list'); if(l) { l.innerHTML = ''; const sts = s.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=> (a.ts_manual||0) - (b.ts_manual||0)); sts.forEach(st => { const p = CONFIG.prioridades[st.priority] || CONFIG.prioridades.low; l.innerHTML += `<div class="flex items-center gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer text-left" onclick="if(event.target.type !== 'checkbox') app.openSubtaskView('${st.id}')"><span class="material-symbols-outlined drag-handle text-slate-300 dark:text-slate-600">drag_indicator</span><input type="checkbox" ${st.completed?'checked':''} onchange="app.toggleSub('${st.id}', this.checked)" class="rounded text-primary w-5 h-5"><span class="flex-1 text-sm font-bold ${st.completed?'subtask-done text-slate-400':'text-slate-700 dark:text-slate-200'}">${st.title}</span><span class="px-2 py-0.5 rounded text-[8px] font-black uppercase text-white ${p.bg}">${p.label}</span></div>`; }); } })); },
    listenToSubChat(sid) { this.unsubs.push(onSnapshot(query(collection(db,"tarefas",this.currentTaskId,"subtarefas",sid,"comentarios"), orderBy("createdAt","asc")), s => { const c = document.getElementById('sub-chat-messages'); if(c) { c.innerHTML = ''; s.forEach(doc => { const d = doc.data(); const isMe = d.createdBy === auth.currentUser.uid; c.innerHTML += `<div class="flex flex-col ${isMe?'items-end':'items-start'}"><div class="${isMe?'bg-primary text-white rounded-br-none':'bg-white dark:bg-slate-800 rounded-bl-none'} p-3 rounded-2xl text-xs shadow-sm max-w-[90%] font-medium">${d.text}</div></div>`; }); c.scrollTop = c.scrollHeight; } })); },
    async sendSubComment() { const i = document.getElementById('sub-chat-input'); if(!i.value.trim()) return; await addDoc(collection(db,"tarefas",this.currentTaskId,"subtarefas",this.activeSid, "comentarios"), { text: i.value, authorName: auth.currentUser.displayName, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() }); i.value = ''; },
    async handleFileUpload(type, id) { const inp = document.createElement('input'); inp.type = 'file'; inp.onchange = (e) => { const file = e.target.files[0]; if(!file || file.size > 800000) return alert("Arquivo < 800KB"); const r = new FileReader(); r.onload = async (ev) => { const path = type === 'task' ? doc(db,"tarefas",id) : doc(db,"tarefas",this.currentTaskId,"subtarefas",id); const d = await getDoc(path); const anexos = d.data().anexos || []; anexos.push({ nome: file.name, data: ev.target.result }); await updateDoc(path, { anexos }); this.addLog(`📎 Anexou um arquivo`); }; r.readAsDataURL(file); }; inp.click(); },
    async loadProfileData() { const u = auth.currentUser; if(!u) return; const d = await getDoc(doc(db, "usuarios", u.uid)); const dt = d.data() || {}; document.getElementById('profile-name-input').value = u.displayName || ""; document.getElementById('profile-bio-input').value = dt.bio || ""; const av = document.getElementById('profile-page-avatar'); if(u.photoURL) av.style.backgroundImage = `url('${u.photoURL}')`; else av.innerText = (u.displayName || u.email).substring(0,2).toUpperCase(); },
    async handleSaveProfile() { const b = document.getElementById('save-profile-btn'); const u = auth.currentUser; const f = this.tempPhotoBase64 || u.photoURL; try { await updateProfile(u, { displayName: document.getElementById('profile-name-input').value, photoURL: f }); await setDoc(doc(db,"usuarios",u.uid), { nome: document.getElementById('profile-name-input').value, bio: document.getElementById('profile-bio-input').value, foto: f, email: u.email }, {merge:true}); this.updateAvatar(u); this.navigate('dashboard'); } catch(e) { alert("Erro."); } },
    renderRanking() { const rc = document.getElementById('ranking-container'); if(!rc) return; const pts = {}; this.allTasks.forEach(d => { if(d.data().status === "Concluída") (d.data().assignees || ["Equipa"]).forEach(p => pts[p] = (pts[p] || 0) + 1); }); const srt = Object.entries(pts).sort((a,b)=>b[1]-a[1]); rc.innerHTML = ''; srt.forEach(([n, p], i) => { const pos = i + 1; let crown = ""; if(pos <= 3) { const col = ["text-yellow-500", "text-slate-400", "text-amber-600"]; crown = `<svg class="w-4 h-4 ${col[i]} ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19V18H19V19Z"/></svg>`; } rc.innerHTML += `<div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl mb-1 shadow-sm"><div class="flex items-center gap-3"><span class="font-black text-slate-400 text-[10px] w-4">${pos}º</span><span class="text-[13px] font-bold flex items-center text-slate-900 dark:text-white">${n}${crown}</span></div><span class="font-black text-green-600 text-[10px]">${p} pts</span></div>`; }); },
    async removeProfilePhoto() { if(confirm("Remover foto?")) { this.tempPhotoBase64 = ""; const av = document.getElementById('profile-page-avatar'); av.style.backgroundImage = 'none'; av.innerText = (auth.currentUser.displayName || auth.currentUser.email).substring(0,2).toUpperCase(); document.getElementById('photo-options-perfil').classList.add('hidden'); } },
    async handlePasswordUpdate() { const u = auth.currentUser; const cur = document.getElementById('current-password-input').value; const n1 = document.getElementById('new-password-input').value; const n2 = document.getElementById('confirm-password-input').value; if(n1!==n2) return alert("Passwords diferentes."); try { await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, cur)); await updatePassword(u, n1); this.navigate('dashboard'); } catch(e) { alert("Erro."); } }
};

window.app = app;
app.init();
