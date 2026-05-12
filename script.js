import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, getDoc, deleteDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
    prioridades: { urgent: { label: 'Urgente', bg: 'bg-rose-700' }, high: { label: 'Alta', bg: 'bg-red-500' }, medium: { label: 'Média', bg: 'bg-orange-500' }, low: { label: 'Baixa', bg: 'bg-yellow-500' } },
    statusIcons: { 'Concluída': 'check_circle', 'Em andamento': 'directions_run', 'Cancelada': 'close', 'Em aberto': 'schedule' }
};

const app = {
    currentTaskId: null,
    activeSid: null,
    editSubId: null,
    tempPhotoBase64: null,
    allTasks: [],
    filters: { status: "Todas", sector: "Todos", assignee: "Todos", search: "" },
    unsubs: [],

    init() {
        this.bindEvents();
        this.checkAuth();
        const t = localStorage.getItem('theme') || 'dark';
        document.documentElement.classList.toggle('dark', t === 'dark');
    },

    navigate(pageId, params = null) {
        this.cleanup();
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
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.filters.status = btn.dataset.filter; this.renderDashboard();
            };
        });
        document.getElementById('filter-sector').onchange = (e) => { this.filters.sector = e.target.value; this.renderDashboard(); };
        document.getElementById('filter-assignee').onchange = (e) => { this.filters.assignee = e.target.value; this.renderDashboard(); };
        document.getElementById('save-task-btn').onclick = () => this.handleCreateTask();
        document.getElementById('save-profile-btn').onclick = () => this.handleSaveProfile();
        document.getElementById('submit-change-password').onclick = () => this.handlePasswordUpdate();
        document.getElementById('submit-subtask-form').onclick = () => this.handleSaveSubtask();
        document.getElementById('submit-edit-task').onclick = () => this.handleUpdateTask();
        document.getElementById('profile-btn').onclick = (e) => { e.stopPropagation(); document.getElementById('profile-menu').classList.toggle('hidden'); };
        document.addEventListener('click', () => document.getElementById('profile-menu')?.classList.add('hidden'));
        document.querySelectorAll('.theme-toggle').forEach(b => b.onclick = () => {
            const isD = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isD ? 'dark' : 'light');
        });
        document.getElementById('profile-upload')?.addEventListener('change', (e) => {
            const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (ev) => { this.tempPhotoBase64 = ev.target.result; document.getElementById('profile-page-avatar').style.backgroundImage = `url('${this.tempPhotoBase64}')`; document.getElementById('profile-page-avatar').innerText = ''; }; reader.readAsDataURL(file); }
        });
    },

    checkAuth() {
        onAuthStateChanged(auth, (user) => {
            const header = document.getElementById('main-header');
            if (user) {
                header.classList.replace('hidden', 'flex');
                this.updateAvatar(user);
                this.listenToTasks();
                this.loadUsers(); 
                this.navigate('dashboard');
                if(user.email === "olimakl@gmail.com") document.getElementById('admin-menu-link').classList.replace('hidden', 'flex');
            } else {
                header.classList.add('hidden');
                this.navigate('login');
            }
        });
    },

    loadUsers() {
        onSnapshot(query(collection(db, "usuarios"), orderBy("nome", "asc")), (snap) => {
            const opts = snap.docs.map(d => d.data().nome);
            const containers = ['task-assignees-checkboxes', 'edit-assignees-checkboxes', 'sub-assignees-checkboxes'];
            containers.forEach(cid => {
                const el = document.getElementById(cid); if (el) el.innerHTML = opts.map(n => `<label class="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer"><input type="checkbox" value="${n}" class="${cid}-item rounded text-primary w-4 h-4"><span class="text-xs font-bold">${n}</span></label>`).join('');
            });
            const fAss = document.getElementById('filter-assignee');
            if(fAss) fAss.innerHTML = '<option value="Todos">Responsáveis</option>' + opts.map(n => `<option value="${n}">${n}</option>`).join('');
        });
    },

    listenToTasks() {
        const q = query(collection(db, "tarefas"), orderBy("createdAt", "desc"));
        onSnapshot(q, (snap) => {
            this.allTasks = snap.docs;
            this.renderDashboard();
            this.renderRanking();
        });
    },

    renderDashboard() {
        const container = document.getElementById('tasks-container');
        if(!container) return; container.innerHTML = '';
        this.allTasks.forEach(docSnap => {
            const t = docSnap.data();
            const mSearch = (t.title || "").toLowerCase().includes(this.filters.search.toLowerCase());
            const mStat = this.filters.status === "Todas" || t.status === this.filters.status;
            const mSect = this.filters.sector === "Todos" || t.sector === this.filters.sector;
            const mAssign = this.filters.assignee === "Todos" || (t.assignees && t.assignees.includes(this.filters.assignee));

            if(mSearch && mStat && mSect && mAssign) {
                const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
                const div = document.createElement('div');
                div.className = "p-4 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-800 mb-1 cursor-pointer flex items-center gap-3 transition-all hover:border-primary/50 shadow-sm";
                div.onclick = (e) => { if(!e.target.closest('.drag-handle')) this.navigate('detalhes', docSnap.id); };
                div.innerHTML = `<span class="material-symbols-outlined drag-handle text-slate-300 dark:text-slate-600">drag_indicator</span><div class="flex-1"><span class="font-bold text-slate-900 dark:text-white">${t.title}</span><div class="flex items-center gap-2 mt-1 text-[9px] uppercase font-black opacity-60"><span class="text-primary">${t.sector || 'Geral'}</span><span>|</span><span>${t.assignees?.join(', ') || '---'}</span></div></div><span class="text-[9px] font-black uppercase px-2 py-1 rounded-full ${p.bg} text-white">${p.label}</span>`;
                container.appendChild(div);
            }
        });
        new Sortable(container, { animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost' });
    },

    async handleCreateTask() {
        const title = document.getElementById('task-title').value;
        const btn = document.getElementById('save-task-btn');
        if(!title) return alert("Título obrigatório.");
        const assignees = Array.from(document.querySelectorAll('.task-assignees-checkboxes-item:checked')).map(cb => cb.value);
        btn.innerText = "A criar..."; btn.disabled = true;
        try {
            await addDoc(collection(db, "tarefas"), {
                title, description: document.getElementById('task-desc').value, sector: document.getElementById('task-sector').value,
                priority: document.getElementById('task-priority-droplist').value, assignees, status: "Em aberto",
                createdAt: serverTimestamp(), createdBy: auth.currentUser.uid, dueDate: document.getElementById('task-date').value
            });
            this.navigate('dashboard');
        } catch(e) { alert("Erro ao criar."); }
        btn.disabled = false; btn.innerText = "Criar tarefa";
    },

    renderDetails(id) {
        this.currentTaskId = id;
        const container = document.getElementById('details-view-content');
        this.unsubs.push(onSnapshot(doc(db, "tarefas", id), (d) => {
            if(!d.exists()) return;
            const t = d.data(); const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
            container.innerHTML = `
                <div class="flex items-center justify-between"><button onclick="app.navigate('dashboard')" class="bg-white dark:bg-slate-800 p-2 rounded-xl shadow-sm"><span class="material-symbols-outlined">arrow_back</span></button><span class="px-3 py-1 rounded-full text-[10px] font-black uppercase text-white ${p.bg}">${p.label}</span></div>
                <div class="bg-white dark:bg-slate-900 p-8 rounded-3xl border dark:border-slate-800 shadow-xl"><h1 class="text-3xl font-black mb-4">${t.title}</h1><p class="text-slate-500 whitespace-pre-line leading-relaxed mb-10">${t.description || '...'}</p><div class="flex flex-wrap gap-8 border-t dark:border-slate-800 pt-6"><div class="flex flex-col gap-1"><span class="text-[9px] font-black uppercase text-slate-400">Equipa</span><span class="text-sm font-bold text-primary">${t.assignees?.join(', ') || '---'}</span></div><div class="flex flex-col gap-1 flex-1"><span class="text-[9px] font-black uppercase text-slate-400 mb-2">Anexos</span><div class="flex flex-wrap gap-2" id="task-att-list"></div><button onclick="app.handleFileUpload('task', '${id}')" class="mt-2 text-[10px] font-black uppercase text-primary hover:opacity-70 flex items-center gap-1"><span class="material-symbols-outlined text-sm">attach_file</span> Anexar</button></div></div></div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6"><div class="flex flex-col gap-4"><div class="flex items-center justify-between p-2"><h2 class="font-black uppercase text-xs text-slate-400">Etapas</h2><button onclick="app.openSubtaskForm()" class="bg-primary text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg">+ Add</button></div><div id="subtasks-list" class="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 divide-y dark:divide-slate-800 overflow-hidden shadow-sm"></div></div><div class="flex flex-col gap-4"><h2 class="font-black uppercase text-xs text-slate-400 p-2">Discussão</h2><div class="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 flex flex-col h-[400px] shadow-xl overflow-hidden"><div id="chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div><div class="p-4 border-t dark:border-slate-800 flex gap-2"><input id="chat-input" type="text" class="flex-1 bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none dark:text-white" placeholder="Escreva algo..."><button onclick="app.sendChatMessage()" class="bg-primary text-white size-10 rounded-xl flex items-center justify-center"><span class="material-symbols-outlined">send</span></button></div></div></div></div>
                <div class="flex gap-4 mt-6"><button id="edit-task-btn" class="flex-1 bg-yellow-500 text-white py-4 rounded-2xl font-black shadow-lg uppercase text-xs tracking-widest">Editar Projeto</button><button id="delete-task-btn" class="bg-red-500 text-white px-8 py-4 rounded-2xl font-black shadow-lg uppercase text-xs tracking-widest">Excluir</button></div>
            `;
            const al = document.getElementById('task-att-list'); (t.anexos || []).forEach(a => { al.innerHTML += `<a href="${a.data}" download="${a.nome}" class="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border text-[9px] font-bold truncate max-w-[140px]">${a.nome}</a>`; });
            document.getElementById('chat-input').onkeydown = (e) => { if(e.key === 'Enter') this.sendChatMessage(); };
            this.listenToSubtasks(id); this.listenToChat(id);
        }));
    },

    async handleFileUpload(type, id) {
        const inp = document.createElement('input'); inp.type = 'file';
        inp.onchange = (e) => {
            const file = e.target.files[0]; if(!file || file.size > 800000) return alert("Arquivo deve ser < 800KB");
            const r = new FileReader(); r.onload = async (ev) => {
                const path = type === 'task' ? doc(db, "tarefas", id) : doc(db, "tarefas", this.currentTaskId, "subtarefas", id);
                const d = await getDoc(path); const anexos = d.data().anexos || [];
                anexos.push({ nome: file.name, data: ev.target.result });
                await updateDoc(path, { anexos });
            }; r.readAsDataURL(file);
        }; inp.click();
    },

    listenToSubtasks(tid) {
        this.unsubs.push(onSnapshot(query(collection(db,"tarefas",tid,"subtarefas"), orderBy("createdAt","asc")), (snap) => {
            const list = document.getElementById('subtasks-list'); if(!list) return; list.innerHTML = '';
            snap.forEach(sd => {
                const s = sd.data(); const p = CONFIG.prioridades[s.priority] || CONFIG.prioridades.low;
                const div = document.createElement('div'); div.className = "flex items-center gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer";
                div.innerHTML = `<span class="material-symbols-outlined drag-handle text-slate-300 dark:text-slate-600">drag_indicator</span><input type="checkbox" ${s.completed ? 'checked' : ''} onchange="app.toggleSub('${sd.id}', this.checked)" class="rounded text-primary w-5 h-5"><span class="flex-1 text-sm font-bold ${s.completed ? 'subtask-done' : ''}">${s.title}</span><span class="px-2 py-0.5 rounded text-[8px] font-black uppercase text-white ${p.bg}">${p.label}</span>`;
                div.onclick = (e) => { if(e.target.type !== 'checkbox' && !e.target.classList.contains('drag-handle')) this.openSubView(sd.id); };
                list.appendChild(div);
            });
            new Sortable(list, { animation: 150, handle: '.drag-handle' });
        }));
    },

    async openSubView(sid) {
        this.activeSid = sid; const d = (await getDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", sid))).data();
        const cont = document.getElementById('subtask-view-content');
        cont.innerHTML = `
            <div class="w-full md:w-1/2 p-8 border-r dark:border-slate-800 overflow-y-auto flex flex-col gap-6">
                <div class="flex items-center justify-between"><span class="text-[10px] font-black uppercase text-slate-400">Etapa</span><button onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button></div>
                <h3 class="text-2xl font-black text-primary">${d.title}</h3>
                <div class="flex flex-col gap-1 border-t dark:border-slate-800 pt-4"><span class="text-[9px] font-black uppercase text-slate-400">Anexos</span><div id="sub-att-list" class="flex flex-wrap gap-2 mt-2"></div><button onclick="app.handleFileUpload('sub', '${sid}')" class="mt-2 text-[10px] font-black uppercase text-primary flex items-center gap-1"><span class="material-symbols-outlined text-sm">attach_file</span> Anexar</button></div>
                <div class="flex gap-2 mt-auto pt-6"><button onclick="app.deleteSub('${sid}')" class="w-full bg-red-500/10 text-red-500 py-3 rounded-xl hover:bg-red-500 hover:text-white transition-all font-black text-[10px] uppercase">Eliminar Etapa</button></div>
            </div>
            <div class="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900/40">
                <div id="sub-chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div>
                <div class="p-4 border-t dark:border-slate-800 flex gap-2"><input id="sub-chat-inp" type="text" class="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none dark:text-white" placeholder="Chat..."><button onclick="app.sendSubComment()" class="bg-primary text-white size-10 rounded-xl flex items-center justify-center shadow-lg"><span class="material-symbols-outlined">send</span></button></div>
            </div>
        `;
        const sl = document.getElementById('sub-att-list'); (d.anexos || []).forEach(a => { sl.innerHTML += `<a href="${a.data}" download="${a.nome}" class="p-2 bg-white dark:bg-slate-800 rounded-lg border text-[9px] font-bold truncate max-w-[120px]">${a.nome}</a>`; });
        document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); document.getElementById('modal-subtask-view').classList.remove('hidden');
        this.listenToSubChat(sid);
    },

    // --- MÉTODOS DE APOIO ---
    async handleSaveSubtask() {
        const t = document.getElementById('sub-title-inp').value; if(!t) return;
        const assignees = Array.from(document.querySelectorAll('.sub-assignees-checkboxes-item:checked')).map(cb => cb.value);
        await addDoc(collection(db, "tarefas", this.currentTaskId, "subtarefas"), { title: t, description: document.getElementById('sub-desc-inp').value, priority: document.getElementById('sub-priority-inp').value, dueDate: document.getElementById('sub-date-inp').value, assignees, completed: false, createdAt: serverTimestamp() });
        this.closeModal();
    },
    async sendChatMessage() { const inp = document.getElementById('chat-input'); if(!inp.value.trim()) return; await addDoc(collection(db, "tarefas", this.currentTaskId, "comentarios"), { text: inp.value, authorName: auth.currentUser.displayName, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() }); inp.value = ''; },
    listenToChat(tid) { this.unsubs.push(onSnapshot(query(collection(db,"tarefas",tid,"comentarios"), orderBy("createdAt","asc")), s => { const c = document.getElementById('chat-messages'); if(c) { c.innerHTML = ''; s.forEach(doc => { const d = doc.data(); const isMe = d.createdBy === auth.currentUser.uid; c.innerHTML += `<div class="flex flex-col ${isMe?'items-end':'items-start'}"><span class="text-[8px] uppercase font-black text-slate-400 mb-1">${d.authorName}</span><div class="${isMe?'bg-primary text-white rounded-br-none':'bg-slate-100 dark:bg-slate-800 rounded-bl-none'} p-3 rounded-2xl text-xs shadow-sm max-w-[85%]">${d.text}</div></div>`; }); c.scrollTop = c.scrollHeight; } })); },
    listenToSubChat(sid) { this.unsubs.push(onSnapshot(query(collection(db,"tarefas",this.currentTaskId,"subtarefas",sid,"comentarios"), orderBy("createdAt","asc")), s => { const c = document.getElementById('sub-chat-messages'); if(c) { c.innerHTML = ''; s.forEach(doc => { const d = doc.data(); const isMe = d.createdBy === auth.currentUser.uid; c.innerHTML += `<div class="flex flex-col ${isMe?'items-end':'items-start'}"><div class="${isMe?'bg-primary text-white rounded-br-none':'bg-white dark:bg-slate-800 rounded-bl-none'} p-3 rounded-2xl text-xs shadow-sm max-w-[90%]">${d.text}</div></div>`; }); c.scrollTop = c.scrollHeight; } })); },
    async sendSubComment() { const inp = document.getElementById('sub-chat-inp'); if(!inp.value.trim()) return; await addDoc(collection(db,"tarefas",this.currentTaskId,"subtarefas",this.activeSid, "comentarios"), { text: inp.value, authorName: auth.currentUser.displayName, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() }); inp.value = ''; },
    renderRanking() { const rc = document.getElementById('ranking-container'); if(!rc) return; const pts = {}; this.allTasks.forEach(d => { if(d.data().status === "Concluída") (d.data().assignees || ["Equipe"]).forEach(p => pts[p] = (pts[p] || 0) + 1); }); const sorted = Object.entries(pts).sort((a,b)=>b[1]-a[1]); rc.innerHTML = ''; sorted.forEach(([n, p], i) => { const pos = i + 1; let crown = ""; if(pos <= 3) { const colors = ["text-yellow-500", "text-slate-400", "text-amber-600"]; crown = `<svg class="w-4 h-4 ${colors[i]} ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19V18H19V19Z"/></svg>`; } rc.innerHTML += `<div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl mb-1 shadow-sm"><div class="flex items-center gap-3"><span class="font-black text-slate-400 text-[10px] w-4">${pos}º</span><span class="text-[13px] font-bold flex items-center">${n}${crown}</span></div><span class="font-black text-green-600 text-[10px]">${p} pts</span></div>`; }); },
    loadProfileData() { const u = auth.currentUser; if(!u) return; document.getElementById('profile-name-input').value = u.displayName || ""; document.getElementById('profile-page-name').innerText = u.displayName || "Usuário"; document.getElementById('profile-page-email').innerText = u.email; const av = document.getElementById('profile-page-avatar'); if(u.photoURL) av.style.backgroundImage = `url('${u.photoURL}')`; else av.innerText = (u.displayName || u.email).substring(0,2).toUpperCase(); },
    updateAvatar(user) { const av = document.getElementById('header-avatar'); if(user.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${user.photoURL}')`; } else av.innerText = (user.displayName || user.email).substring(0,2).toUpperCase(); },
    toggleSub(sid, val) { updateDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid), {completed: val}); },
    cleanup() { this.unsubs.forEach(f => f()); this.unsubs = []; },
    closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); document.querySelectorAll('.modal-box').forEach(m => m.classList.add('hidden')); }
};

window.app = app;
app.init();
