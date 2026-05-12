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
    prioridades: { 
        urgent: { label: 'Urgente', bg: 'bg-rose-700' }, 
        high: { label: 'Alta', bg: 'bg-red-500' }, 
        medium: { label: 'Média', bg: 'bg-orange-500' }, 
        low: { label: 'Baixa', bg: 'bg-yellow-500' } 
    },
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
        this.initSortable();
    },

    initSortable() {
        // Ativa o arrastar nas tarefas principais
        const taskList = document.getElementById('tasks-container');
        if (taskList) {
            new Sortable(taskList, {
                animation: 150,
                handle: '.drag-handle',
                ghostClass: 'sortable-ghost'
            });
        }
    },

    navigate(pageId, params = null) {
        this.cleanup();
        document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(`page-${pageId}`);
        if(target) target.classList.add('active');
        if(pageId === 'detalhes' && params) this.renderDetails(params);
        if(pageId === 'perfil') this.loadProfileData();
        this.closeModal();
        window.scrollTo(0,0);
    },

    bindEvents() {
        document.getElementById('login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } 
            catch(err) { alert("Acesso negado."); }
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
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    this.tempPhotoBase64 = ev.target.result;
                    document.getElementById('profile-page-avatar').style.backgroundImage = `url('${this.tempPhotoBase64}')`;
                    document.getElementById('profile-page-avatar').innerText = '';
                };
                reader.readAsDataURL(file);
            }
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
                this.initSortable(); // Re-inicia ao logar
            } else {
                header.classList.add('hidden');
                this.navigate('login');
            }
        });
    },

    loadUsers() {
        onSnapshot(query(collection(db, "usuarios"), orderBy("nome", "asc")), (snap) => {
            const opts = snap.docs.map(d => d.data().nome);
            ['task-assignees-checkboxes', 'edit-assignees-checkboxes', 'sub-assignees-checkboxes'].forEach(cid => {
                const el = document.getElementById(cid);
                if (el) el.innerHTML = opts.map(n => `<label class="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer"><input type="checkbox" value="${n}" class="${cid}-item rounded text-primary w-4 h-4"><span class="text-xs font-bold">${n}</span></label>`).join('');
            });
            const fAss = document.getElementById('filter-assignee');
            if(fAss) fAss.innerHTML = '<option value="Todos">Responsáveis</option>' + opts.map(n => `<option value="${n}">${n}</option>`).join('');
        });
    },

    renderDashboard() {
        const container = document.getElementById('tasks-container');
        if(!container) return; container.innerHTML = '';
        this.allTasks.forEach(docSnap => {
            const t = docSnap.data();
            const mSearch = (t.title || "").toLowerCase().includes(this.filters.search.toLowerCase());
            const mStat = this.filters.status === "Todas" || t.status === this.filters.status;
            if(mSearch && mStat) {
                const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
                const div = document.createElement('div');
                div.className = "p-4 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-800 mb-1 cursor-pointer flex items-center gap-3 transition-all hover:border-primary/50 shadow-sm";
                div.onclick = (e) => { if(!e.target.closest('.drag-handle')) this.navigate('detalhes', docSnap.id); };
                div.innerHTML = `
                    <span class="material-symbols-outlined drag-handle text-slate-300 dark:text-slate-600">drag_indicator</span>
                    <div class="flex-1">
                        <span class="font-bold text-slate-900 dark:text-white">${t.title}</span>
                        <div class="flex items-center gap-2 mt-1 text-[9px] uppercase font-black tracking-wider opacity-60">
                            <span class="text-primary">${t.sector || 'Geral'}</span><span>|</span><span>${t.assignees?.join(', ') || '---'}</span>
                        </div>
                    </div>
                    <span class="text-[9px] font-black uppercase px-2 py-1 rounded-full ${p.bg} text-white">${p.label}</span>
                `;
                container.appendChild(div);
            }
        });
    },

    renderDetails(id) {
        this.currentTaskId = id;
        const container = document.getElementById('details-view-content');
        this.unsubs.push(onSnapshot(doc(db, "tarefas", id), (d) => {
            if(!d.exists()) return;
            const t = d.data();
            const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
            
            container.innerHTML = `
                <div class="flex items-center justify-between"><button onclick="app.navigate('dashboard')" class="bg-white dark:bg-slate-800 p-2 rounded-xl shadow-sm"><span class="material-symbols-outlined">arrow_back</span></button><span class="px-3 py-1 rounded-full text-[10px] font-black uppercase text-white ${p.bg}">${p.label}</span></div>
                <div class="bg-white dark:bg-slate-900 p-8 rounded-3xl border dark:border-slate-800 shadow-xl"><h1 class="text-3xl font-black mb-4">${t.title}</h1><p class="text-slate-500 whitespace-pre-line leading-relaxed mb-10">${t.description || 'Sem descrição.'}</p><div class="flex flex-wrap gap-8 border-t dark:border-slate-800 pt-6"><div class="flex flex-col gap-1"><span class="text-[9px] font-black uppercase text-slate-400">Equipa</span><span class="text-sm font-bold text-primary">${t.assignees?.join(', ') || '---'}</span></div><div class="flex flex-col gap-1"><span class="text-[9px] font-black uppercase text-slate-400">Setor</span><span class="text-sm font-bold">${t.sector}</span></div><div class="flex flex-col gap-1"><span class="text-[9px] font-black uppercase text-slate-400">Arquivos</span><button class="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-primary transition-colors"><span class="material-symbols-outlined text-sm">attach_file</span> Anexar</button></div></div></div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6"><div class="flex flex-col gap-4"><div class="flex items-center justify-between p-2"><h2 class="font-black uppercase text-xs text-slate-400">Etapas</h2><button onclick="app.openSubtaskForm()" class="bg-primary text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg">+ Adicionar</button></div><div id="subtasks-list" class="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 divide-y dark:divide-slate-800 overflow-hidden shadow-sm"></div></div><div class="flex flex-col gap-4"><h2 class="font-black uppercase text-xs text-slate-400 p-2">Discussão</h2><div class="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 flex flex-col h-[400px] shadow-xl overflow-hidden"><div id="chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div><div class="p-4 border-t dark:border-slate-800 flex gap-2 bg-slate-50 dark:bg-slate-800/30"><input id="chat-input" type="text" class="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none dark:text-white" placeholder="Escreva algo..."><button onclick="app.sendChatMessage()" class="bg-primary text-white size-10 rounded-xl flex items-center justify-center shadow-lg"><span class="material-symbols-outlined">send</span></button></div></div></div></div>
                <div class="flex gap-4 mt-6"><button id="edit-task-btn" class="flex-1 bg-yellow-500 text-white py-4 rounded-2xl font-black shadow-lg uppercase text-xs tracking-widest">Editar Projeto</button><button id="delete-task-btn" class="bg-red-500 text-white px-8 py-4 rounded-2xl font-black shadow-lg uppercase text-xs tracking-widest">Excluir</button></div>
            `;
            this.listenToSubtasks(id);
            this.listenToChat(id);
        }));
    },

    listenToSubtasks(tid) {
        const q = query(collection(db, "tarefas", tid, "subtarefas"), orderBy("createdAt", "asc"));
        this.unsubs.push(onSnapshot(q, (snap) => {
            const list = document.getElementById('subtasks-list'); if(!list) return;
            list.innerHTML = snap.size ? '' : '<p class="p-8 text-center text-xs text-slate-400 italic">Vazio.</p>';
            snap.forEach(sd => {
                const s = sd.data(); const p = CONFIG.prioridades[s.priority] || CONFIG.prioridades.low;
                const div = document.createElement('div');
                div.className = "flex items-center gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-all";
                div.innerHTML = `
                    <span class="material-symbols-outlined drag-handle text-slate-300 dark:text-slate-600 text-lg">drag_indicator</span>
                    <input type="checkbox" ${s.completed ? 'checked' : ''} onchange="app.toggleSub('${sd.id}', this.checked)" class="rounded-lg text-primary focus:ring-0 border-slate-300 w-5 h-5">
                    <span class="flex-1 text-sm font-bold ${s.completed ? 'line-through opacity-40 italic' : ''}">${s.title}</span>
                    <span class="px-2 py-0.5 rounded text-[8px] font-black uppercase text-white ${p.bg}">${p.label}</span>
                `;
                div.onclick = (e) => { if(e.target.type !== 'checkbox' && !e.target.classList.contains('drag-handle')) this.openSubtaskView(sd.id); };
                list.appendChild(div);
            });
            // Ativa arrastar nas subtarefas
            new Sortable(list, { animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost' });
        }));
    },

    async openSubtaskView(sid) {
        this.activeSid = sid; const d = (await getDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", sid))).data();
        const p = CONFIG.prioridades[d.priority] || CONFIG.prioridades.low;
        const cont = document.getElementById('subtask-view-content');
        cont.innerHTML = `
            <div class="w-full md:w-1/2 p-8 border-r dark:border-slate-800 overflow-y-auto flex flex-col gap-6">
                <div class="flex items-center justify-between"><span class="px-2 py-0.5 rounded text-[9px] font-black uppercase text-white ${p.bg}">${p.label}</span><button onclick="app.closeModal()"><span class="material-symbols-outlined text-slate-400">close</span></button></div>
                <div><h3 class="text-2xl font-black text-primary mb-2">${d.title}</h3><p class="text-sm text-slate-500 italic">${d.description || 'Sem detalhes.'}</p></div>
                <div class="grid grid-cols-2 gap-4 border-t dark:border-slate-800 pt-4">
                    <div><span class="text-[9px] font-black text-slate-400 uppercase">Equipa</span><p class="text-xs font-bold">${d.assignees?.join(', ') || '---'}</p></div>
                    <div><span class="text-[9px] font-black text-slate-400 uppercase">Prazo</span><p class="text-xs font-bold">${d.dueDate || '---'}</p></div>
                </div>
                <div class="border-t dark:border-slate-800 pt-4">
                    <button class="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 hover:text-primary transition-all"><span class="material-symbols-outlined text-sm">attach_file</span> Anexar Arquivo à Etapa</button>
                </div>
                <div class="flex gap-2 mt-auto pt-6"><button onclick="app.openSubtaskForm('${sid}')" class="flex-1 bg-yellow-500/10 text-yellow-600 py-3 rounded-xl font-black text-[10px] uppercase">Editar</button><button onclick="app.deleteSub('${sid}')" class="bg-red-500/10 text-red-500 px-4 rounded-xl transition-all"><span class="material-symbols-outlined">delete</span></button></div>
            </div>
            <div class="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900/40">
                <div class="p-4 border-b dark:border-slate-800 font-black text-[9px] uppercase text-slate-400">Discussão Interna</div>
                <div id="sub-chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div>
                <div class="p-4 border-t dark:border-slate-800 flex gap-2"><input id="sub-chat-input" type="text" class="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none dark:text-white shadow-sm" placeholder="Mensagem..."><button onclick="app.sendSubComment()" class="bg-primary text-white size-10 rounded-xl flex items-center justify-center shadow-lg"><span class="material-symbols-outlined">send</span></button></div>
            </div>
        `;
        document.getElementById('modal-backdrop').classList.replace('hidden', 'flex');
        document.getElementById('modal-subtask-view').classList.remove('hidden');
        this.listenToSubChat(sid);
    },

    // --- FUNÇÕES DE APOIO (MANTIDAS) ---
    async handleSaveSubtask() {
        const t = document.getElementById('sub-title-inp').value; if(!t) return;
        const assignees = Array.from(document.querySelectorAll('.sub-assignees-checkboxes-item:checked')).map(cb => cb.value);
        const dds = { title: t, description: document.getElementById('sub-desc-inp').value, priority: document.getElementById('sub-priority-inp').value, dueDate: document.getElementById('sub-date-inp').value, assignees, createdAt: serverTimestamp() };
        if(this.editSubId) await updateDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",this.editSubId), dds);
        else await addDoc(collection(db,"tarefas",this.currentTaskId,"subtarefas"), { ...dds, completed: false });
        this.closeModal();
    },
    listenToTasks() { onSnapshot(query(collection(db, "tarefas"), orderBy("createdAt", "desc")), (snap) => { this.allTasks = snap.docs; this.renderDashboard(); }); },
    updateAvatar(user) { const av = document.getElementById('header-avatar'); if(user.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${user.photoURL}')`; } else av.innerText = (user.displayName || user.email).substring(0,2).toUpperCase(); },
    darVerde(btn, original, sucesso) { if(!btn) return; btn.innerText = sucesso; btn.classList.add('bg-green-600'); setTimeout(() => { btn.innerText = original; btn.classList.remove('bg-green-600'); }, 2000); },
    closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); document.querySelectorAll('.modal-box').forEach(m => m.classList.add('hidden')); },
    toggleSub(sid, val) { updateDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid), {completed: val}); },
    deleteSub(sid) { if(confirm("Excluir?")) { deleteDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid)); this.closeModal(); } },
    cleanup() { this.unsubs.forEach(fn => fn()); this.unsubs = []; },
    openSubtaskForm(sid = null) { this.editSubId = sid; document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); document.getElementById('modal-subtask-form').classList.remove('hidden'); },
    async sendChatMessage() { /* Lógica de chat enviada anteriormente */ },
    listenToChat(tid) { /* Lógica de chat enviada anteriormente */ },
    listenToSubChat(sid) { /* Lógica de chat enviada anteriormente */ },
    async sendSubComment() { /* Lógica de chat enviada anteriormente */ }
};

window.app = app;
app.init();
