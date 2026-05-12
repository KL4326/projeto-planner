import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, getDoc, deleteDoc, updateDoc, setDoc, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
    prioridades: { urgent: { label: 'Urgente', bg: 'bg-rose-700' }, high: { label: 'Alta', bg: 'bg-red-500' }, medium: { label: 'Média', bg: 'bg-orange-500' }, low: { label: 'Baixa', bg: 'bg-yellow-500' } }
};

const app = {
    currentTaskId: null, activeSid: null, editSubId: null, tempPhotoBase64: null, allTasks: [], filters: { status: "Todas", sector: "Todos", assignee: "Todos", search: "" }, unsubs: [],
    lastReadNotif: localStorage.getItem('lastNotif') || 0,

    init() { this.bindEvents(); this.checkAuth(); this.initTheme(); this.listenToNotifications(); },
    initTheme() { const t = localStorage.getItem('theme') || 'dark'; document.documentElement.classList.toggle('dark', t === 'dark'); },
    
    navigate(pageId, params = null) {
        this.cleanup();
        // REMOVE ATIVO DE TUDO (Inclusive Login)
        document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(`page-${pageId}`);
        if(target) target.classList.add('active');
        
        if(pageId === 'detalhes' && params) this.renderDetails(params);
        if(pageId === 'perfil') this.loadProfileData();
        if(pageId === 'admin') this.renderAdmin();
        this.closeModal();
        window.scrollTo(0,0);
    },

    bindEvents() {
        document.getElementById('login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } 
            catch(err) { alert("Credenciais inválidas."); }
        });
        document.getElementById('logout-btn').onclick = () => signOut(auth);
        document.getElementById('search-input').oninput = (e) => { this.filters.search = e.target.value; this.renderDashboard(); };
        document.querySelectorAll('.filter-btn').forEach(btn => { btn.onclick = () => { document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); this.filters.status = btn.dataset.filter; this.renderDashboard(); }; });
        document.getElementById('filter-sector').onchange = (e) => { this.filters.sector = e.target.value; this.renderDashboard(); };
        document.getElementById('filter-assignee').onchange = (e) => { this.filters.assignee = e.target.value; this.renderDashboard(); };
        document.getElementById('save-task-btn').onclick = () => this.handleCreateTask();
        document.getElementById('save-profile-btn').onclick = () => this.handleSaveProfile();
        document.getElementById('submit-change-password').onclick = () => this.handlePasswordUpdate();
        document.getElementById('submit-subtask-form').onclick = () => this.handleSaveSubtask();
        document.getElementById('submit-edit-task').onclick = () => this.handleUpdateTask();
        document.getElementById('profile-btn').onclick = (e) => { e.stopPropagation(); document.getElementById('notif-menu').classList.add('hidden'); document.getElementById('profile-menu').classList.toggle('hidden'); };
        document.getElementById('notif-btn').onclick = (e) => { e.stopPropagation(); document.getElementById('profile-menu').classList.add('hidden'); document.getElementById('notif-menu').classList.toggle('hidden'); this.markNotifsRead(); };
        document.addEventListener('click', () => { document.getElementById('profile-menu')?.classList.add('hidden'); document.getElementById('notif-menu')?.classList.add('hidden'); });
        document.querySelectorAll('.theme-toggle').forEach(b => b.onclick = () => { const isD = document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', isD ? 'dark' : 'light'); });
        document.getElementById('profile-upload')?.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { this.compressImage(file, (b64) => { this.tempPhotoBase64 = b64; document.getElementById('profile-page-avatar').style.backgroundImage = `url('${b64}')`; document.getElementById('profile-page-avatar').innerText = ''; }); } });
    },

    checkAuth() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                document.getElementById('main-header').classList.replace('hidden', 'flex');
                this.updateAvatar(user);
                this.listenToTasks();
                this.loadUsers(); 
                this.navigate('dashboard');
                if(user.email === "olimakl@gmail.com") document.getElementById('admin-menu-link').classList.replace('hidden', 'flex');
            } else {
                document.getElementById('main-header').classList.add('hidden');
                this.navigate('login');
            }
        });
    },

    async addLog(msg) { await addDoc(collection(db, "notificacoes"), { text: msg, createdAt: serverTimestamp(), author: auth.currentUser.displayName || auth.currentUser.email }); },

    listenToNotifications() {
        onSnapshot(query(collection(db, "notificacoes"), orderBy("createdAt", "desc"), limit(20)), snap => {
            const list = document.getElementById('notif-list'); const badge = document.getElementById('notif-badge'); if(!list) return;
            list.innerHTML = snap.size ? '' : '<p class="p-8 text-center text-xs text-slate-400 italic">Vazio.</p>';
            let unread = 0;
            snap.forEach(d => {
                const dt = d.data(); const time = dt.createdAt ? new Date(dt.createdAt.seconds * 1000).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'}) : '';
                if (dt.createdAt?.seconds > this.lastReadNotif) unread++;
                list.innerHTML += `<div class="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50"><p class="text-xs font-medium text-slate-700 dark:text-slate-200">${dt.text}</p><div class="flex justify-between mt-2 text-[8px] font-black text-slate-400 uppercase"><span>${dt.author}</span><span>${time}</span></div></div>`;
            });
            if(unread > 0) { badge.innerText = unread; badge.classList.remove('hidden'); } else badge.classList.add('hidden');
        });
    },

    markNotifsRead() { this.lastReadNotif = Math.floor(Date.now() / 1000); localStorage.setItem('lastNotif', this.lastReadNotif); document.getElementById('notif-badge').classList.add('hidden'); },

    listenToTasks() { onSnapshot(query(collection(db, "tarefas"), orderBy("createdAt", "desc")), snap => { this.allTasks = snap.docs; this.renderDashboard(); this.renderRanking(); }); },

    renderDashboard() {
        const container = document.getElementById('tasks-container'); if(!container) return; container.innerHTML = '';
        this.allTasks.forEach(docSnap => {
            const t = docSnap.data(); const mSearch = (t.title || "").toLowerCase().includes(this.filters.search.toLowerCase());
            const mStat = this.filters.status === "Todas" || t.status === this.filters.status;
            const mSect = this.filters.sector === "Todos" || t.sector === this.filters.sector;
            const mAssign = this.filters.assignee === "Todos" || (t.assignees && t.assignees.includes(this.filters.assignee));
            if(mSearch && mStat && mSect && mAssign) {
                const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
                const div = document.createElement('div'); div.className = "p-4 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-800 mb-1 cursor-pointer flex items-center gap-3 transition-all hover:border-primary/50 shadow-sm";
                div.onclick = (e) => { if(!e.target.closest('.drag-handle')) this.navigate('detalhes', docSnap.id); };
                div.innerHTML = `<span class="material-symbols-outlined drag-handle text-slate-300 dark:text-slate-600">drag_indicator</span><div class="flex-1"><span class="font-bold text-slate-900 dark:text-white">${t.title}</span><div class="flex items-center gap-2 mt-1 text-[9px] uppercase font-black opacity-60"><span class="text-primary">${t.sector || 'Geral'}</span><span>|</span><span>${t.assignees?.join(', ') || '---'}</span></div></div><span class="text-[9px] font-black uppercase px-2 py-1 rounded-full ${p.bg} text-white">${p.label}</span>`;
                container.appendChild(div);
            }
        });
        new Sortable(container, { animation: 150, handle: '.drag-handle' });
    },

    async handleCreateTask() {
        const title = document.getElementById('task-title').value; if(!title) return alert("Título obrigatório.");
        const assignees = Array.from(document.querySelectorAll('.task-assignees-checkboxes-item:checked')).map(cb => cb.value);
        await addDoc(collection(db, "tarefas"), { title, description: document.getElementById('task-desc').value, sector: document.getElementById('task-sector').value, priority: document.getElementById('task-priority-droplist').value, assignees, status: "Em aberto", createdAt: serverTimestamp(), createdBy: auth.currentUser.uid, dueDate: document.getElementById('task-date').value });
        await this.addLog(`Criou a tarefa: "${title}"`);
        this.navigate('dashboard');
    },

    renderDetails(id) {
        this.currentTaskId = id; const container = document.getElementById('details-view-content');
        this.unsubs.push(onSnapshot(doc(db, "tarefas", id), (d) => {
            if(!d.exists()) return;
            const t = d.data(); const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low; const dateStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-PT') : '---';
            container.innerHTML = `
                <div class="flex items-center justify-between"><button onclick="app.navigate('dashboard')" class="bg-white dark:bg-slate-800 p-2 rounded-xl shadow-sm hover:text-primary transition-all"><span class="material-symbols-outlined">arrow_back</span></button><span class="px-3 py-1 rounded-full text-[10px] font-black uppercase text-white ${p.bg}">${p.label}</span></div>
                <div class="bg-white dark:bg-slate-900 p-8 rounded-3xl border dark:border-slate-800 shadow-xl"><h1 class="text-4xl font-black mb-4">${t.title}</h1><p class="text-slate-500 whitespace-pre-line leading-relaxed mb-8 text-sm">${t.description || '...'}</p>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-6 border-t dark:border-slate-800 pt-6">
                        <div class="flex flex-col gap-1"><span class="text-[9px] font-black uppercase text-slate-400 tracking-widest">Responsáveis</span><span class="text-xs font-bold text-primary">${t.assignees?.join(', ') || '---'}</span></div>
                        <div class="flex flex-col gap-1"><span class="text-[9px] font-black uppercase text-slate-400 tracking-widest">Setor</span><span class="text-xs font-bold">${t.sector || '---'}</span></div>
                        <div class="flex flex-col gap-1"><span class="text-[9px] font-black uppercase text-slate-400 tracking-widest">Prazo</span><span class="text-xs font-bold">${dateStr}</span></div>
                        <div class="flex flex-col gap-1 border-l dark:border-slate-800 pl-4 items-start"><span class="text-[9px] font-black uppercase text-slate-400 mb-2">Anexos</span><div class="flex flex-wrap gap-2" id="task-att-list"></div><button onclick="app.handleFileUpload('task', '${id}')" class="mt-1 text-[10px] font-black uppercase text-primary hover:opacity-70 flex items-center gap-1"><span class="material-symbols-outlined text-sm">attach_file</span> ANEXAR</button></div>
                    </div>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="flex flex-col gap-4">
                        <div class="flex items-center justify-between p-2"><h2 class="font-black uppercase text-xs text-slate-400">Subtarefas</h2><button onclick="app.openSubtaskForm()" class="bg-primary text-white px-4 py-2 rounded-xl text-[10px] font-black shadow-lg">Adicionar subtarefa</button></div>
                        <div id="subtasks-list" class="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 divide-y dark:divide-slate-800 overflow-hidden shadow-sm"></div>
                    </div>
                    <div class="flex flex-col gap-4">
                        <h2 class="font-black uppercase text-xs text-slate-400 p-2">Discussão</h2>
                        <div class="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 flex flex-col h-[400px] shadow-xl overflow-hidden">
                            <div id="chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div>
                            <div class="p-4 border-t dark:border-slate-800 flex gap-2 bg-slate-50 dark:bg-slate-800/20"><input id="chat-input" type="text" class="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none dark:text-white" placeholder="Mensagem..."><button onclick="app.sendChatMessage()" class="bg-primary text-white size-10 rounded-xl flex items-center justify-center shadow-lg"><span class="material-symbols-outlined">send</span></button></div>
                        </div>
                    </div>
                </div>
                <div class="flex gap-4 mt-6"><button id="edit-btn-trigger" class="flex-1 bg-yellow-500 text-white py-4 rounded-2xl font-black shadow-lg uppercase text-xs tracking-widest">Editar Tarefa</button><button id="delete-task-btn" class="bg-red-500 text-white px-8 py-4 rounded-2xl font-black shadow-lg uppercase text-xs tracking-widest">Excluir</button></div>
            `;
            const al = document.getElementById('task-att-list'); (t.anexos || []).forEach(a => { al.innerHTML += `<a href="${a.data}" download="${a.nome}" class="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border text-[9px] font-bold truncate max-w-[140px]">${a.nome}</a>`; });
            document.getElementById('edit-btn-trigger').onclick = () => app.openEditModal(t);
            document.getElementById('delete-task-btn').onclick = () => app.handleDeleteTask(id);
            document.getElementById('chat-input').onkeydown = (e) => { if(e.key === 'Enter') this.sendChatMessage(); };
            this.listenToSubtasks(id); this.listenToChat(id);
        }));
    },

    async openSubtaskView(sid) {
        this.activeSid = sid; const d = (await getDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", sid))).data();
        const p = CONFIG.prioridades[d.priority] || CONFIG.prioridades.low; const dateStr = d.dueDate ? new Date(d.dueDate).toLocaleDateString('pt-PT') : '---';
        const cont = document.getElementById('subtask-view-content');
        cont.innerHTML = `
            <div class="w-full md:w-1/2 p-8 border-r dark:border-slate-800 overflow-y-auto flex flex-col gap-6 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                <div class="flex items-center justify-between"><span class="px-2 py-0.5 rounded text-[9px] font-black uppercase text-white ${p.bg}">${p.label}</span><button onclick="app.closeModal()"><span class="material-symbols-outlined text-slate-400">close</span></button></div>
                <div><h3 class="text-3xl font-black text-primary mb-2">${d.title}</h3><p class="text-sm text-slate-500 italic leading-relaxed">${d.description || '...'}</p></div>
                <div class="grid grid-cols-2 gap-4 border-t dark:border-slate-800 pt-6"><div><span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Equipa</span><p class="text-xs font-bold">${d.assignees?.join(', ') || '---'}</p></div><div><span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Prazo</span><p class="text-xs font-bold">${dateStr}</p></div></div>
                <div class="flex flex-col border-t dark:border-slate-800 pt-4"><span class="text-[9px] font-black uppercase text-slate-400 mb-2">Anexos</span><div id="sub-att-list" class="flex flex-wrap gap-2"></div><button onclick="app.handleFileUpload('sub', '${sid}')" class="mt-3 text-[10px] font-black uppercase text-primary hover:opacity-70 flex items-center gap-1"><span class="material-symbols-outlined text-sm">attach_file</span> ANEXAR</button></div>
                <div class="flex gap-2 mt-auto pt-6"><button onclick="app.openSubtaskForm('${sid}')" class="flex-1 bg-yellow-500 text-white py-3 rounded-xl font-black text-[10px] uppercase shadow-md">Editar subtarefa</button><button onclick="app.deleteSub('${sid}')" class="bg-red-500/10 text-red-500 px-4 rounded-xl hover:bg-red-500 hover:text-white transition-all"><span class="material-symbols-outlined text-sm">delete</span></button></div>
            </div>
            <div class="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900/40">
                <div id="sub-chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div>
                <div class="p-4 border-t dark:border-slate-800 flex gap-2"><input id="sub-chat-input" type="text" class="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none dark:text-white shadow-sm" placeholder="Chat..."><button onclick="app.sendSubComment()" class="bg-primary text-white size-10 rounded-xl flex items-center justify-center shadow-lg"><span class="material-symbols-outlined">send</span></button></div>
            </div>
        `;
        const sl = document.getElementById('sub-att-list'); (d.anexos || []).forEach(a => { sl.innerHTML += `<a href="${a.data}" download="${a.nome}" class="p-2 bg-white dark:bg-slate-800 rounded-lg border text-[9px] font-bold truncate max-w-[120px] shadow-sm">${a.nome}</a>`; });
        document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); document.getElementById('modal-subtask-view').classList.remove('hidden');
        document.getElementById('sub-chat-input').onkeydown = (e) => { if(e.key === 'Enter') this.sendSubComment(); };
        this.listenToSubChat(sid);
    },

    openEditModal(t) { document.getElementById('edit-task-title').value = t.title; document.getElementById('edit-task-desc').value = t.description || ""; document.getElementById('edit-task-priority').value = t.priority || "medium"; document.getElementById('edit-task-date').value = t.dueDate || ""; document.querySelectorAll('.edit-assignees-checkboxes-item').forEach(cb => cb.checked = t.assignees?.includes(cb.value)); document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); document.getElementById('modal-edit-task').classList.remove('hidden'); },
    async handleUpdateTask() { const title = document.getElementById('edit-task-title').value; if(!title) return; const assignees = Array.from(document.querySelectorAll('.edit-assignees-checkboxes-item:checked')).map(cb => cb.value); await updateDoc(doc(db, "tarefas", this.currentTaskId), { title, description: document.getElementById('edit-task-desc').value, priority: document.getElementById('edit-task-priority').value, dueDate: document.getElementById('edit-task-date').value, assignees }); await this.addLog(`Editou a tarefa: "${title}"`); this.closeModal(); },
    openSubtaskForm(sid = null) { this.editSubId = sid; this.closeModal(); document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); document.getElementById('modal-subtask-form').classList.remove('hidden'); if (sid) { getDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", sid)).then(d => { const s = d.data(); document.getElementById('sub-title-inp').value = s.title; document.getElementById('sub-desc-inp').value = s.description || ""; document.getElementById('sub-priority-inp').value = s.priority || "medium"; document.getElementById('sub-date-inp').value = s.dueDate || ""; document.querySelectorAll('.sub-assignees-checkboxes-item').forEach(cb => cb.checked = s.assignees?.includes(cb.value)); document.getElementById('subtask-form-title').innerText = "Editar subtarefa"; }); } else { document.getElementById('subtask-form-title').innerText = "Adicionar subtarefa"; document.getElementById('sub-title-inp').value = ""; document.getElementById('sub-desc-inp').value = ""; document.querySelectorAll('.sub-assignees-checkboxes-item').forEach(cb => cb.checked = false); } },
    async handleSaveSubtask() { const t = document.getElementById('sub-title-inp').value; if(!t) return; const assignees = Array.from(document.querySelectorAll('.sub-assignees-checkboxes-item:checked')).map(cb => cb.value); const data = { title: t, description: document.getElementById('sub-desc-inp').value, priority: document.getElementById('sub-priority-inp').value, dueDate: document.getElementById('sub-date-inp').value, assignees, updatedAt: serverTimestamp() }; if (this.editSubId) { await updateDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", this.editSubId), data); await this.addLog(`Editou a subtarefa "${t}"`); } else { await addDoc(collection(db, "tarefas", this.currentTaskId, "subtarefas"), { ...data, completed: false, createdAt: serverTimestamp() }); await this.addLog(`Adicionou a subtarefa "${t}"`); } this.closeModal(); },
    async handleFileUpload(type, id) { const inp = document.createElement('input'); inp.type = 'file'; inp.onchange = (e) => { const file = e.target.files[0]; if(!file || file.size > 800000) return alert("Arquivo < 800KB"); const r = new FileReader(); r.onload = async (ev) => { const path = type === 'task' ? doc(db, "tarefas", id) : doc(db, "tarefas", this.currentTaskId, "subtarefas", id); const d = await getDoc(path); const anexos = d.data().anexos || []; anexos.push({ nome: file.name, data: ev.target.result }); await updateDoc(path, { anexos }); }; r.readAsDataURL(file); }; inp.click(); },
    
    // --- UTILITÁRIOS ---
    cleanup() { this.unsubs.forEach(f => f()); this.unsubs = []; },
    updateAvatar(u) { const av = document.getElementById('header-avatar'); if(u.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${u.photoURL}')`; } else av.innerText = (u.displayName || u.email).substring(0,2).toUpperCase(); },
    darVerde(btn, orig, suc) { if(!btn) return; btn.innerText = suc; btn.classList.add('bg-green-600'); setTimeout(() => { btn.innerText = orig; btn.classList.remove('bg-green-600'); }, 2000); },
    closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); document.querySelectorAll('.modal-box').forEach(m => m.classList.add('hidden')); },
    toggleSub(sid, val) { updateDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid), {completed: val}); },
    deleteSub(sid) { if(confirm("Excluir?")) { deleteDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid)); this.closeModal(); } },
    loadUsers() { onSnapshot(query(collection(db, "usuarios"), orderBy("nome", "asc")), (snap) => { const opts = snap.docs.map(d => d.data().nome); ['task-assignees-checkboxes', 'edit-assignees-checkboxes', 'sub-assignees-checkboxes'].forEach(cid => { const el = document.getElementById(cid); if (el) el.innerHTML = opts.map(n => `<label class="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer transition-all"><input type="checkbox" value="${n}" class="${cid}-item rounded text-primary w-4 h-4"><span class="text-xs font-bold text-slate-700 dark:text-slate-300">${n}</span></label>`).join(''); }); const f = document.getElementById('filter-assignee'); if(f) f.innerHTML = '<option value="Todos">Responsáveis</option>' + opts.map(n => `<option value="${n}">${n}</option>`).join(''); }); },
    compressImage(f, cb) { const r = new FileReader(); r.readAsDataURL(f); r.onload = (e) => { const img = new Image(); img.src = e.target.result; img.onload = () => { const canvas = document.createElement('canvas'); const MAX = 300; const scale = MAX / img.width; canvas.width = MAX; canvas.height = img.height * scale; canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); cb(canvas.toDataURL('image/jpeg', 0.7)); }; }; },
    async sendChatMessage() { const i = document.getElementById('chat-input'); if(!i.value.trim()) return; await addDoc(collection(db,"tarefas",this.currentTaskId,"comentarios"), { text: i.value, authorName: auth.currentUser.displayName, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() }); i.value = ''; },
    listenToChat(tid) { this.unsubs.push(onSnapshot(query(collection(db,"tarefas",tid,"comentarios"), orderBy("createdAt","asc")), s => { const c = document.getElementById('chat-messages'); if(c) { c.innerHTML = ''; s.forEach(doc => { const d = doc.data(); const isMe = d.createdBy === auth.currentUser.uid; c.innerHTML += `<div class="flex flex-col ${isMe?'items-end':'items-start'}"><span class="text-[8px] font-black text-slate-400 mb-1 uppercase">${d.authorName}</span><div class="${isMe?'bg-primary text-white rounded-br-none':'bg-slate-100 dark:bg-slate-800 rounded-bl-none'} p-3 rounded-2xl text-xs shadow-sm max-w-[85%]">${d.text}</div></div>`; }); c.scrollTop = c.scrollHeight; } })); },
    listenToSubtasks(tid) { this.unsubs.push(onSnapshot(query(collection(db,"tarefas",tid,"subtarefas"), orderBy("createdAt","asc")), s => { const l = document.getElementById('subtasks-list'); if(l) { l.innerHTML = ''; s.forEach(sd => { const st = sd.data(); const p = CONFIG.prioridades[st.priority] || CONFIG.prioridades.low; l.innerHTML += `<div class="flex items-center gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" onclick="if(event.target.type !== 'checkbox') app.openSubtaskView('${sd.id}')"><span class="material-symbols-outlined drag-handle text-slate-300 dark:text-slate-600">drag_indicator</span><input type="checkbox" ${st.completed?'checked':''} onchange="app.toggleSub('${sd.id}', this.checked)" class="rounded text-primary w-5 h-5"><span class="flex-1 text-sm font-bold ${st.completed?'subtask-done text-slate-400':'text-slate-700 dark:text-slate-200'}">${st.title}</span><span class="px-2 py-0.5 rounded text-[8px] font-black uppercase text-white ${p.bg}">${p.label}</span></div>`; }); new Sortable(l, { animation: 150, handle: '.drag-handle' }); } })); },
    listenToSubChat(sid) { this.unsubs.push(onSnapshot(query(collection(db,"tarefas",this.currentTaskId,"subtarefas",sid,"comentarios"), orderBy("createdAt","asc")), s => { const c = document.getElementById('sub-chat-messages'); if(c) { c.innerHTML = ''; s.forEach(doc => { const d = doc.data(); const isMe = d.createdBy === auth.currentUser.uid; c.innerHTML += `<div class="flex flex-col ${isMe?'items-end':'items-start'}"><div class="${isMe?'bg-primary text-white rounded-br-none':'bg-white dark:bg-slate-800 rounded-bl-none'} p-3 rounded-2xl text-xs max-w-[90%] shadow-sm font-medium">${d.text}</div></div>`; }); c.scrollTop = c.scrollHeight; } })); },
    async sendSubComment() { const i = document.getElementById('sub-chat-input'); if(!i.value.trim()) return; await addDoc(collection(db,"tarefas",this.currentTaskId,"subtarefas",this.activeSid, "comentarios"), { text: i.value, authorName: auth.currentUser.displayName, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() }); i.value = ''; },
    async handleDeleteTask(id) { if(confirm("Apagar permanentemente?")) { await deleteDoc(doc(db,"tarefas",id)); this.navigate('dashboard'); } },
    async handlePasswordUpdate() { const u = auth.currentUser; const cur = document.getElementById('current-password-input').value; const n1 = document.getElementById('new-password-input').value; const n2 = document.getElementById('confirm-password-input').value; if(n1!==n2) return alert("Senhas não coincidem."); const b = document.getElementById('submit-change-password'); try { await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, cur)); await updatePassword(u, n1); this.darVerde(b, "Confirmar", "Senha Alterada!"); setTimeout(()=>this.navigate('dashboard'),1500); } catch(e) { alert("Senha atual incorreta."); } },
    async loadProfileData() { const u = auth.currentUser; if(!u) return; const d = await getDoc(doc(db, "usuarios", u.uid)); const dt = d.data() || {}; document.getElementById('profile-name-input').value = u.displayName || ""; document.getElementById('profile-cargo-input').value = dt.cargo || ""; document.getElementById('profile-sector-input').value = dt.setor || "Logística"; document.getElementById('profile-bio-input').value = dt.bio || ""; document.getElementById('profile-page-name').innerText = u.displayName || "Usuário"; document.getElementById('profile-page-email').innerText = u.email; const av = document.getElementById('profile-page-avatar'); if(u.photoURL) av.style.backgroundImage = `url('${u.photoURL}')`; else av.innerText = (u.displayName || u.email).substring(0,2).toUpperCase(); },
    async handleSaveProfile() { const b = document.getElementById('save-profile-btn'); const u = auth.currentUser; const f = this.tempPhotoBase64 || u.photoURL; try { await updateProfile(u, { displayName: document.getElementById('profile-name-input').value, photoURL: f }); await setDoc(doc(db,"usuarios",u.uid), { nome: document.getElementById('profile-name-input').value, cargo: document.getElementById('profile-cargo-input').value, setor: document.getElementById('profile-sector-input').value, bio: document.getElementById('profile-bio-input').value, foto: f, email: u.email }, {merge:true}); this.darVerde(b, "Salvar", "Atualizado!"); setTimeout(()=>this.navigate('dashboard'),1000); } catch(e) { alert("Erro ao salvar."); } },
    renderRanking() { const rc = document.getElementById('ranking-container'); if(!rc) return; const pts = {}; this.allTasks.forEach(d => { if(d.data().status === "Concluída") (d.data().assignees || ["Equipa"]).forEach(p => pts[p] = (pts[p] || 0) + 1); }); const srt = Object.entries(pts).sort((a,b)=>b[1]-a[1]); rc.innerHTML = ''; srt.forEach(([n, p], i) => { const pos = i + 1; let crown = ""; if(pos <= 3) { const cols = ["text-yellow-500", "text-slate-400", "text-amber-600"]; crown = `<svg class="w-4 h-4 ${cols[i]} ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19V18H19V19Z"/></svg>`; } rc.innerHTML += `<div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl mb-1 shadow-sm"><div class="flex items-center gap-3"><span class="font-black text-slate-400 text-[10px] w-4">${pos}º</span><span class="text-[13px] font-bold flex items-center">${n}${crown}</span></div><span class="font-black text-green-600 text-[10px]">${p} pts</span></div>`; }); },
    async removeProfilePhoto() { if(confirm("Remover foto?")) { this.tempPhotoBase64 = ""; const av = document.getElementById('profile-page-avatar'); av.style.backgroundImage = 'none'; av.innerText = (auth.currentUser.displayName || auth.currentUser.email).substring(0,2).toUpperCase(); document.getElementById('photo-options').classList.add('hidden'); } },
    renderAdmin() { onSnapshot(collection(db,"tarefas"), (snap) => { let total = snap.size, done = 0, users = {}; snap.forEach(d => { const t = d.data(); if(t.status === "Concluída") done++; (t.assignees || ["Equipa"]).forEach(p => { if(!users[p]) users[p] = { c:0, d:0 }; users[p].c++; if(t.status === "Concluída") users[p].d++; }); }); document.getElementById('admin-stats').innerHTML = `<div class="bg-white dark:bg-slate-900 p-6 rounded-3xl border dark:border-slate-800 shadow-sm"><p class="text-[10px] font-black uppercase text-slate-400">Total Projetos</p><span class="text-3xl font-black">${total}</span></div><div class="bg-white dark:bg-slate-900 p-6 rounded-3xl border dark:border-slate-800 shadow-sm"><p class="text-[10px] font-black uppercase text-green-500">Concluídos</p><span class="text-3xl font-black text-green-500">${done}</span></div><div class="bg-white dark:bg-slate-900 p-6 rounded-3xl border dark:border-slate-800 shadow-sm"><p class="text-[10px] font-black uppercase text-primary">Utilizadores</p><span class="text-3xl font-black text-primary">${Object.keys(users).length}</span></div>`; const ut = document.getElementById('admin-users-table'); if(ut) { ut.innerHTML = ''; Object.entries(users).forEach(([n, s]) => { ut.innerHTML += `<tr><td class="p-6 font-bold text-sm">${n}</td><td class="p-6 text-center text-sm">${s.c}</td><td class="p-6 text-center text-sm text-green-600 font-bold">${s.d}</td><td class="p-6 text-center text-sm font-black">${Math.round((s.d/s.c)*100)}%</td></tr>`; }); } }); }
};

window.app = app;
app.init();
