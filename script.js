import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, getDoc, deleteDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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
    prioridades: { high: { label: 'Alta', bg: 'bg-red-500' }, medium: { label: 'Média', bg: 'bg-orange-500' }, low: { label: 'Baixa', bg: 'bg-yellow-500' } },
    statusIcons: { 'Concluída': 'check_circle', 'Em andamento': 'directions_run', 'Cancelada': 'close', 'Em aberto': 'schedule' }
};

// --- MOTOR DA APLICAÇÃO SPA ---
const app = {
    currentTaskId: null,
    activeSid: null,
    editSubId: null,
    filters: { status: "Todas", sector: "Todos", assignee: "Todos", search: "" },
    allTasks: [],
    unsubs: [],

    init() {
        this.bindEvents();
        this.checkAuth();
    },

    navigate(pageId, params = null) {
        document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(`page-${pageId}`);
        if(target) target.classList.add('active');

        // Lógica de carga
        if(pageId === 'detalhes' && params) this.renderDetails(params);
        if(pageId === 'perfil') this.loadProfileData();
        
        this.closeModal();
        window.scrollTo(0,0);
    },

    bindEvents() {
        // Login
        document.getElementById('login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            btn.innerText = "Acedendo...";
            try {
                await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value);
            } catch(err) { alert("Erro no login."); btn.innerText = "Entrar"; }
        });

        // Logout
        document.getElementById('logout-btn')?.onclick = () => signOut(auth);

        // Busca real-time
        document.getElementById('search-input')?.addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            this.renderDashboard();
        });

        // Filtros Status
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.filters.status = btn.dataset.filter;
                this.renderDashboard();
            };
        });

        // Filtros Selects
        document.getElementById('filter-sector').onchange = (e) => { this.filters.sector = e.target.value; this.renderDashboard(); };
        document.getElementById('filter-assignee').onchange = (e) => { this.filters.assignee = e.target.value; this.renderDashboard(); };

        // Botões Salvar
        document.getElementById('save-task-btn')?.onclick = () => this.handleCreateTask();
        document.getElementById('save-profile-btn')?.onclick = () => this.handleSaveProfile();
        document.getElementById('submit-subtask-form')?.onclick = () => this.handleSaveSubtask();
        document.getElementById('submit-edit-task')?.onclick = () => this.handleUpdateTask();

        // UI Global
        document.getElementById('profile-btn')?.onclick = (e) => { e.stopPropagation(); document.getElementById('profile-menu').classList.toggle('hidden'); };
        document.addEventListener('click', () => document.getElementById('profile-menu')?.classList.add('hidden'));

        // Redefinir Senha
        const resetFn = async () => { if(auth.currentUser) { await sendPasswordResetEmail(auth, auth.currentUser.email); alert("E-mail enviado!"); } };
        document.getElementById('header-reset-password').onclick = resetFn;
        document.getElementById('profile-reset-password-btn').onclick = resetFn;

        // Temas
        document.querySelectorAll('.theme-toggle').forEach(b => b.onclick = () => {
            const isD = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isD ? 'dark' : 'light');
        });
    },

    checkAuth() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                document.getElementById('main-header').classList.remove('hidden');
                this.updateAvatar(user);
                this.listenToTasks();
                this.loadUsers();
                this.navigate('dashboard');
                
                // Admin Access (AJUSTE O SEU EMAIL AQUI)
                if(user.email === "admin@planner.com") {
                    document.getElementById('admin-menu-link').classList.replace('hidden', 'flex');
                }
            } else {
                document.getElementById('main-header').classList.add('hidden');
                this.navigate('login');
                this.cleanup();
            }
        });
    },

    // --- DASHBOARD ---
    listenToTasks() {
        onSnapshot(query(collection(db, "tarefas"), orderBy("createdAt", "desc")), (snap) => {
            this.allTasks = snap.docs;
            this.renderDashboard();
            this.renderAdmin();
        });
    },

    renderDashboard() {
        const container = document.getElementById('tasks-container');
        if(!container) return;
        container.innerHTML = '';
        let count = 0;

        this.allTasks.forEach(docSnap => {
            const t = docSnap.data();
            const mSearch = t.title.toLowerCase().includes(this.filters.search.toLowerCase());
            const mStat = this.filters.status === "Todas" || t.status === this.filters.status;
            const mSect = this.filters.sector === "Todos" || t.sector === this.filters.sector;
            const mAssign = this.filters.assignee === "Todos" || (t.assignees && t.assignees.includes(this.filters.assignee));

            if(mSearch && mStat && mSect && mAssign) {
                count++;
                const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
                const icon = CONFIG.statusIcons[t.status] || 'schedule';
                const date = t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-PT') : 'Sem data';

                const div = document.createElement('div');
                div.className = "flex items-center justify-between p-4 bg-white dark:bg-slate-800 shadow-sm rounded-xl border dark:border-slate-800 mb-1 cursor-pointer hover:border-primary/50 transition-all";
                div.onclick = (e) => { if(!e.target.closest('button')) this.navigate('detalhes', docSnap.id); };
                div.innerHTML = `
                    <div class="flex items-center gap-4 flex-1">
                        <button onclick="app.quickComplete('${docSnap.id}')" class="p-2 rounded-lg ${t.status==='Concluída'?'text-green-500 bg-green-500/10':'text-slate-400 bg-slate-100 dark:bg-slate-700'}">
                            <span class="material-symbols-outlined">${icon}</span>
                        </button>
                        <div class="flex flex-col">
                            <span class="font-bold text-slate-900 dark:text-white">${t.title}</span>
                            <div class="flex items-center gap-3 mt-1 text-[10px] font-bold uppercase">
                                <span class="text-primary font-black">${t.sector || '---'}</span>
                                <span class="text-slate-400">| ${t.assignees?.join(', ') || 'Sem resp.'}</span>
                                <span class="text-slate-400">| ${date}</span>
                            </div>
                        </div>
                    </div>
                    <span class="px-3 py-1 ${p.bg} text-white text-[10px] font-black rounded-full uppercase">${p.label}</span>
                `;
                container.appendChild(div);
            }
        });
        if(count === 0) container.innerHTML = '<p class="text-center py-10 text-slate-400 italic">Nenhuma tarefa encontrada.</p>';
        this.renderRanking();
    },

    // --- NOVA TAREFA ---
    async handleCreateTask() {
        const title = document.getElementById('task-title').value;
        const btn = document.getElementById('save-task-btn');
        if(!title) return;
        btn.innerText = "Criando..."; btn.disabled = true;
        
        await addDoc(collection(db, "tarefas"), {
            title,
            description: document.getElementById('task-desc').value,
            sector: document.getElementById('task-sector').value,
            priority: document.querySelector('input[name="priority"]:checked').value,
            assignees: Array.from(document.getElementById('task-assignees').selectedOptions).map(o => o.value),
            status: "Em aberto",
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser.uid,
            dueDate: document.getElementById('task-date').value
        });
        this.darVerde(btn, "Criar Tarefa", "Criado!");
        setTimeout(() => this.navigate('dashboard'), 1000);
    },

    // --- DETALHES ---
    async renderDetails(id) {
        this.currentTaskId = id;
        const cont = document.getElementById('details-view-content');
        cont.innerHTML = '<div class="text-center py-20 animate-pulse font-bold">A carregar detalhes...</div>';

        const docRef = doc(db, "tarefas", id);
        onSnapshot(docRef, (d) => {
            if(!d.exists()) return;
            const t = d.data();
            const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
            const date = t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-PT') : 'Sem prazo';

            cont.innerHTML = `
                <div class="p-8 bg-white dark:bg-slate-900 rounded-2xl border dark:border-slate-800 shadow-xl mb-8">
                    <div class="flex items-center gap-2 mb-4"><span class="px-2 py-0.5 rounded text-[10px] font-black uppercase text-white ${p.bg}">${p.label}</span></div>
                    <h1 class="text-3xl font-black mb-2">${t.title}</h1>
                    <p class="text-slate-500 whitespace-pre-line mb-8 leading-relaxed">${t.description || 'Sem descrição.'}</p>
                    <div class="flex flex-wrap gap-6 text-[11px] font-black uppercase text-slate-400 border-t dark:border-slate-800 pt-6">
                        <div class="flex items-center gap-1 text-primary"><span class="material-symbols-outlined text-sm">group</span> ${t.assignees?.join(', ') || '---'}</div>
                        <div class="flex items-center gap-1"><span class="material-symbols-outlined text-sm">domain</span> ${t.sector || '---'}</div>
                        <div class="flex items-center gap-1"><span class="material-symbols-outlined text-sm">calendar_today</span> ${date}</div>
                    </div>
                    <div class="mt-8 flex gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl w-fit border dark:border-slate-700">
                        <select id="quick-status-sel" class="bg-transparent border-none text-sm font-bold text-primary outline-none">
                            <option value="Em aberto" ${t.status==='Em aberto'?'selected':''}>Em aberto</option>
                            <option value="Em andamento" ${t.status==='Em andamento'?'selected':''}>Em andamento</option>
                            <option value="Concluída" ${t.status==='Concluída'?'selected':''}>Concluída</option>
                            <option value="Cancelada" ${t.status==='Cancelada'?'selected':''}>Cancelada</option>
                        </select>
                        <button id="quick-status-btn" class="bg-primary text-white text-[10px] font-black px-4 py-2 rounded-lg">Salvar Status</button>
                    </div>
                </div>

                <div class="flex flex-col gap-4 mb-8">
                    <div class="flex items-center justify-between"><h2 class="text-xl font-black">Subtarefas</h2><span id="sub-prog" class="text-xs font-bold bg-primary/10 text-primary px-2 py-1 rounded-full">0/0</span></div>
                    <div id="subtasks-list" class="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 divide-y dark:divide-slate-800 overflow-hidden"></div>
                    <button onclick="app.openSubtaskForm()" class="py-3 bg-primary text-white rounded-xl font-bold hover:scale-[1.01] transition-all">Nova Subtarefa</button>
                </div>

                <div class="bg-white dark:bg-slate-900 rounded-2xl border dark:border-slate-800 flex flex-col h-[450px] shadow-xl overflow-hidden">
                    <div id="main-chat" class="flex-1 overflow-y-auto p-6 space-y-4"></div>
                    <div class="p-4 border-t dark:border-slate-800 flex gap-2">
                        <input id="main-chat-inp" class="flex-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 text-sm outline-none dark:text-white" placeholder="Mensagem (Enter)...">
                        <button id="main-chat-send" class="bg-primary text-white size-10 rounded-lg flex items-center justify-center"><span class="material-symbols-outlined">send</span></button>
                    </div>
                </div>
            `;

            // Ligar Eventos dos Detalhes
            document.getElementById('quick-status-btn').onclick = async (e) => {
                await updateDoc(docRef, { status: document.getElementById('quick-status-sel').value });
                this.darVerde(e.target, "Salvar Status", "Ok!");
            };
            document.getElementById('edit-task-btn').onclick = () => this.openEditTaskModal(t);
            document.getElementById('delete-task-btn').onclick = async () => { if(confirm("Apagar tarefa?")) { await deleteDoc(docRef); this.navigate('dashboard'); } };
            
            this.listenToComments(id);
            this.listenToSubtasks(id);
        });
    },

    // --- SUBTAREFAS ---
    listenToSubtasks(taskId) {
        onSnapshot(query(collection(db, "tarefas", taskId, "subtarefas"), orderBy("createdAt", "asc")), (snap) => {
            const list = document.getElementById('subtasks-list'); if(!list) return;
            list.innerHTML = '';
            snap.forEach(sd => {
                const s = sd.data();
                const div = document.createElement('div');
                div.className = "flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors";
                div.onclick = (e) => { if(e.target.type !== 'checkbox') this.openSubtaskView(sd.id); };
                div.innerHTML = `
                    <input type="checkbox" ${s.completed?'checked':''} onchange="app.toggleSub('${sd.id}', this.checked)" class="rounded text-primary focus:ring-0">
                    <div class="flex-1 font-bold ${s.completed?'line-through opacity-40':''} text-sm">${s.title}</div>
                `;
                list.appendChild(div);
            });
            document.getElementById('sub-prog').innerText = `${snap.docs.filter(d=>d.data().completed).length}/${snap.size}`;
        });
    },

    async openSubtaskView(sid) {
        this.activeSid = sid;
        const d = (await getDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", sid))).data();
        const modal = document.getElementById('modal-subtask-view');
        const content = document.getElementById('subtask-view-content');
        const pTrad = d.priority === 'high' ? 'Alta' : d.priority === 'medium' ? 'Média' : 'Baixa';

        content.innerHTML = `
            <div class="w-full md:w-1/3 p-6 border-r dark:border-slate-800 overflow-y-auto flex flex-col gap-6">
                <div>
                    <div class="flex items-center justify-between mb-4"><span class="text-[10px] font-black uppercase text-slate-400">Info da Subtarefa</span><button onclick="app.closeModal()"><span class="material-symbols-outlined text-slate-400">close</span></button></div>
                    <h3 class="text-xl font-black text-primary mb-2">${d.title}</h3>
                    <p class="text-sm text-slate-500 italic">${d.description || 'Sem descrição.'}</p>
                </div>
                <div><label class="text-[10px] font-black uppercase text-slate-400">Pessoas</label><p class="text-sm font-bold mt-1">${d.assignees?.join(', ') || 'Ninguém'}</p></div>
                <div><label class="text-[10px] font-black uppercase text-slate-400">Data Limite</label><p class="text-sm font-bold mt-1">${d.dueDate || 'Sem prazo'}</p></div>
                <div class="flex gap-2 mt-4 pt-4 border-t dark:border-slate-800">
                    <button onclick="app.openSubtaskForm('${sid}')" class="flex-1 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-bold">Editar</button>
                    <button onclick="app.deleteSub('${sid}')" class="py-2 px-3 bg-red-500/10 text-red-500 rounded-lg"><span class="material-symbols-outlined text-sm">delete</span></button>
                </div>
            </div>
            <div class="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900/40">
                <div id="sub-chat-cont" class="flex-1 overflow-y-auto p-6 space-y-3"></div>
                <div class="p-4 border-t dark:border-slate-800 flex gap-2">
                    <input id="sub-chat-inp" class="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none dark:text-white" placeholder="Chat interno...">
                    <button id="sub-chat-send" class="bg-primary text-white size-10 rounded-lg flex items-center justify-center"><span class="material-symbols-outlined">send</span></button>
                </div>
            </div>
        `;
        
        document.getElementById('modal-backdrop').classList.replace('hidden', 'flex');
        modal.classList.remove('hidden');
        this.listenToSubComments(sid);

        // Ligar Chat
        const inp = document.getElementById('sub-chat-inp');
        const send = document.getElementById('sub-chat-send');
        const fn = () => this.handleSubComment(sid);
        send.onclick = fn;
        inp.onkeydown = (e) => { if(e.key === 'Enter') fn(); };
    },

    // --- PERFIL ---
    async handleSaveProfile() {
        const btn = document.getElementById('save-profile-btn');
        const n = document.getElementById('profile-name-input').value;
        const f = document.getElementById('profile-photo-input').value;
        const b = document.getElementById('profile-bio-input').value;
        
        await updateProfile(auth.currentUser, { displayName: n, photoURL: f });
        await setDoc(doc(db, "usuarios", auth.currentUser.uid), { nome: n, foto: f, bio: b }, { merge: true });
        
        this.darVerde(btn, "Guardar Alterações", "Atualizado!");
        setTimeout(() => this.navigate('dashboard'), 1000);
    },

    // --- REUTILIZÁVEIS E ADMIN ---
    darVerde(btn, original, sucesso) {
        if(!btn) return;
        btn.innerText = sucesso; btn.classList.replace('bg-primary', 'bg-green-500');
        setTimeout(() => { btn.innerText = original; btn.classList.replace('bg-green-500', 'bg-primary'); }, 2000);
    },

    closeModal() {
        document.getElementById('modal-backdrop').classList.replace('flex', 'hidden');
        document.querySelectorAll('.modal-box').forEach(m => m.classList.add('hidden'));
    },

    async loadProfileData() {
        const user = auth.currentUser;
        document.getElementById('profile-name-input').value = user.displayName || "";
        document.getElementById('profile-photo-input').value = user.photoURL || "";
        const d = await getDoc(doc(db, "usuarios", user.uid));
        if(d.exists()) document.getElementById('profile-bio-input').value = d.data().bio || "";
        document.getElementById('profile-page-name').innerText = user.displayName || "Usuário";
        document.getElementById('profile-page-email').innerText = user.email;
        const av = document.getElementById('profile-page-avatar');
        if(user.photoURL) av.style.backgroundImage = `url('${user.photoURL}')`;
        else av.innerText = (user.displayName || 'U').substring(0,2).toUpperCase();
    },

    updateAvatar(user) {
        const av = document.getElementById('header-avatar');
        if(user.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${user.photoURL}')`; }
        else av.innerText = (user.displayName || user.email).substring(0,2).toUpperCase();
    },

    loadUsers() {
        carregarUsers('task-assignees');
        carregarUsers('filter-assignee');
        carregarUsers('sub-assignees-inp');
        carregarUsers('edit-task-assignees');
    },

    renderRanking() {
        const rc = document.getElementById('ranking-container'); if(!rc) return;
        const pts = {}; this.allTasks.forEach(d => { if(d.data().status === "Concluída") (d.data().assignees || ["Equipe"]).forEach(p => pts[p] = (pts[p] || 0) + 1); });
        const sorted = Object.entries(pts).sort((a,b)=>b[1]-a[1]);
        rc.innerHTML = sorted.length ? '' : '<p class="text-center py-4 text-xs text-slate-500 italic">Sem pontuação.</p>';
        sorted.forEach(([n, p], i) => {
            const pos = i + 1; let crown = "";
            if(pos <= 3) {
                const colors = ["text-yellow-500", "text-slate-400", "text-amber-600"];
                crown = `<svg class="w-4 h-4 ${colors[i]} ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19V18H19V19Z"/></svg>`;
            }
            rc.innerHTML += `<div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border dark:border-slate-800 mb-1 transition-all"><div class="flex items-center gap-3"><span class="font-black text-slate-400 text-xs w-5">${pos}º</span><span class="text-sm font-bold flex items-center">${n}${crown}</span></div><span class="font-black text-green-600 text-xs">${p} pts</span></div>`;
        });
    },

    // --- MÉTODOS DE APOIO ---
    async handleSubComment(sid) {
        const inp = document.getElementById('sub-chat-inp'); if(!inp.value.trim()) return;
        await addDoc(collection(db, "tarefas", this.currentTaskId, "subtarefas", sid, "comentarios"), { text: inp.value, authorName: auth.currentUser.displayName || auth.currentUser.email.split('@')[0], createdBy: auth.currentUser.uid, createdAt: serverTimestamp() });
        inp.value = '';
    },
    listenToComments(tid) {
        onSnapshot(query(collection(db, "tarefas", tid, "comentarios"), orderBy("createdAt", "asc")), (snap) => {
            const cont = document.getElementById('main-chat'); if(!cont) return; cont.innerHTML = '';
            snap.forEach(c => { const isMe = c.data().createdBy === auth.currentUser.uid; cont.innerHTML += `<div class="flex flex-col ${isMe?'items-end':'items-start'} mb-4"><span class="text-[10px] text-slate-500 mb-1">${c.data().authorName}</span><div class="${isMe?'bg-primary text-white':'bg-slate-100 dark:bg-slate-800'} p-3 rounded-2xl text-sm shadow-sm max-w-[80%]">${c.data().text}</div></div>`; });
            cont.scrollTop = cont.scrollHeight;
        });
    },
    listenToSubComments(sid) {
        onSnapshot(query(collection(db, "tarefas", this.currentTaskId, "subtarefas", sid, "comentarios"), orderBy("createdAt", "asc")), (snap) => {
            const cont = document.getElementById('sub-chat-cont'); if(!cont) return; cont.innerHTML = '';
            snap.forEach(c => { const isMe = c.data().createdBy === auth.currentUser.uid; cont.innerHTML += `<div class="flex flex-col ${isMe?'items-end':'items-start'} mb-3"><span class="text-[9px] text-slate-500">${c.data().authorName}</span><div class="${isMe?'bg-primary text-white':'bg-slate-200 dark:bg-slate-700'} p-2 rounded-lg text-xs max-w-[90%]">${c.data().text}</div></div>`; });
            cont.scrollTop = cont.scrollHeight;
        });
    },
    quickComplete(id) { updateDoc(doc(db, "tarefas", id), { status: "Concluída" }); },
    toggleSub(sid, val) { updateDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", sid), { completed: val }); },
    deleteSub(sid) { if(confirm("Excluir?")) { deleteDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", sid)); this.closeModal(); } },
    openSubtaskForm(sid = null) {
        this.editSubId = sid;
        const modal = document.getElementById('modal-subtask-form');
        document.getElementById('modal-backdrop').classList.replace('hidden', 'flex');
        modal.classList.remove('hidden');
        if(!sid) { document.getElementById('subtask-form-title').innerText = "Nova Subtarefa"; document.getElementById('sub-title-inp').value = ""; }
    },
    async handleSaveSubtask() {
        const t = document.getElementById('sub-title-inp').value; if(!t) return;
        const dds = { title: t, description: document.getElementById('sub-desc-inp').value, priority: document.getElementById('sub-priority-inp').value, dueDate: document.getElementById('sub-date-inp').value, assignees: Array.from(document.getElementById('sub-assignees-inp').selectedOptions).map(o=>o.value) };
        if(this.editSubId) await updateDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", this.editSubId), dds);
        else await addDoc(collection(db, "tarefas", this.currentTaskId, "subtarefas"), { ...dds, completed: false, createdAt: serverTimestamp() });
        this.closeModal();
    },
    cleanup() { this.unsubs.forEach(u => u()); this.unsubs = []; }
};

window.app = app;
app.init();
