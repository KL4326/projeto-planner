import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, getDoc, deleteDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// --- CONFIGURAÇÃO FIREBASE ---
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

// --- OBJETO PRINCIPAL DA APLICAÇÃO ---
const app = {
    currentTaskId: null,
    activeSid: null,
    tempPhotoBase64: null,
    allTasks: [],
    filters: { status: "Todas", sector: "Todos", assignee: "Todos", search: "" },
    unsubs: [], // Armazena ouvintes ativos para limpeza

    init() {
        this.bindEvents();
        this.checkAuth();
        const t = localStorage.getItem('theme') || 'dark';
        document.documentElement.classList.toggle('dark', t === 'dark');
    },

    // --- NAVEGAÇÃO SPA ---
    navigate(pageId, params = null) {
        this.cleanup(); // Remove listeners de chat ao vivo ao trocar de página
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
        // Login
        document.getElementById('login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button'); btn.innerText = "Acedendo...";
            try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } 
            catch(err) { alert("Erro: E-mail ou senha inválidos."); btn.innerText = "Entrar"; }
        });

        // Logout e Pesquisa
        document.getElementById('logout-btn').onclick = () => { if(confirm("Sair do sistema?")) signOut(auth); };
        document.getElementById('search-input').oninput = (e) => { this.filters.search = e.target.value; this.renderDashboard(); };

        // Filtros Status
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.filters.status = btn.dataset.filter; this.renderDashboard();
            };
        });

        // Botões Globais de Gravação
        document.getElementById('save-task-btn').onclick = () => this.handleCreateTask();
        document.getElementById('save-profile-btn').onclick = () => this.handleSaveProfile();
        document.getElementById('submit-change-password').onclick = () => this.handlePasswordUpdate();
        document.getElementById('submit-subtask-form').onclick = () => this.handleSaveSubtask();
        document.getElementById('submit-edit-task').onclick = () => this.handleUpdateTask();

        // UI Header e Temas
        document.getElementById('profile-btn').onclick = (e) => { e.stopPropagation(); document.getElementById('profile-menu').classList.toggle('hidden'); };
        document.addEventListener('click', () => document.getElementById('profile-menu')?.classList.add('hidden'));
        document.querySelectorAll('.theme-toggle').forEach(b => b.onclick = () => {
            const isD = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isD ? 'dark' : 'light');
        });

        // Upload de Imagem PC (Base64)
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
                // ADMIN (Ajuste o e-mail se necessário)
                if(user.email === "olimakl@gmail.com") document.getElementById('admin-menu-link').classList.replace('hidden', 'flex');
            } else {
                header.classList.add('hidden');
                this.navigate('login');
            }
        });
    },

    // --- DASHBOARD E RANKING ---
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
            if(mSearch && mStat) {
                const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
                const div = document.createElement('div');
                div.className = "p-4 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-800 mb-1 cursor-pointer flex justify-between items-center transition-all hover:border-primary/50 shadow-sm";
                div.onclick = () => this.navigate('detalhes', docSnap.id);
                div.innerHTML = `<div><span class="font-bold text-slate-900 dark:text-white">${t.title}</span><div class="flex items-center gap-2 mt-1 text-[9px] uppercase font-black tracking-wider"><span class="text-primary">${t.sector || 'Geral'}</span><span class="text-slate-400">| ${t.assignees?.join(', ') || 'Equipa'}</span></div></div><span class="text-[9px] font-black uppercase px-2 py-1 rounded-full ${p.bg} text-white">${p.label}</span>`;
                container.appendChild(div);
            }
        });
    },

    renderRanking() {
        const rc = document.getElementById('ranking-container'); if(!rc) return;
        const pts = {}; this.allTasks.forEach(d => { if(d.data().status === "Concluída") (d.data().assignees || ["Equipa"]).forEach(p => pts[p] = (pts[p] || 0) + 1); });
        const sorted = Object.entries(pts).sort((a,b)=>b[1]-a[1]);
        rc.innerHTML = sorted.length ? '' : '<p class="text-center py-4 text-xs text-slate-500">Sem pontos.</p>';
        sorted.forEach(([n, p], i) => {
            const pos = i + 1; let crown = "";
            if(pos <= 3) {
                const colors = ["text-yellow-500", "text-slate-400", "text-amber-600"];
                crown = `<svg class="w-4 h-4 ${colors[i]} ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19V18H19V19Z"/></svg>`;
            }
            rc.innerHTML += `<div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border dark:border-slate-800 mb-1 shadow-sm"><div class="flex items-center gap-3"><span class="font-black text-slate-400 text-[10px] w-4">${pos}º</span><span class="text-[13px] font-bold flex items-center">${n}${crown}</span></div><span class="font-black text-green-600 text-[10px]">${p} pts</span></div>`;
        });
    },

    // --- NOVA TAREFA ---
    async handleCreateTask() {
        const title = document.getElementById('task-title').value;
        const btn = document.getElementById('save-task-btn');
        if(!title) return alert("Título obrigatório.");
        const assignees = Array.from(document.querySelectorAll('.task-assignees-checkboxes-item:checked')).map(cb => cb.value);
        btn.innerText = "A publicar..."; btn.disabled = true;
        await addDoc(collection(db, "tarefas"), {
            title, description: document.getElementById('task-desc').value, sector: document.getElementById('task-sector').value,
            priority: document.getElementById('task-priority-droplist').value, assignees, status: "Em aberto",
            createdAt: serverTimestamp(), createdBy: auth.currentUser.uid, dueDate: document.getElementById('task-date').value
        });
        this.darVerde(btn, "Publicar Tarefa", "Tarefa Criada!");
        setTimeout(() => this.navigate('dashboard'), 1000);
    },

    // --- DETALHES (SALA DE COMANDO) ---
    renderDetails(id) {
        this.currentTaskId = id;
        const container = document.getElementById('details-view-content');
        container.innerHTML = `<p class="text-center py-20 font-black animate-pulse">A CARREGAR PROJETO...</p>`;

        this.unsubs.push(onSnapshot(doc(db, "tarefas", id), (d) => {
            if(!d.exists()) return;
            const t = d.data();
            const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
            
            container.innerHTML = `
                <div class="flex items-center justify-between"><button onclick="app.navigate('dashboard')" class="bg-white dark:bg-slate-800 p-2 rounded-xl shadow-sm"><span class="material-symbols-outlined">arrow_back</span></button><span class="px-3 py-1 rounded-full text-[10px] font-black uppercase text-white ${p.bg}">${p.label}</span></div>
                <div class="bg-white dark:bg-slate-900 p-8 rounded-3xl border dark:border-slate-800 shadow-xl"><h1 class="text-3xl font-black mb-4">${t.title}</h1><p class="text-slate-500 whitespace-pre-line leading-relaxed mb-10">${t.description || 'Sem descrição.'}</p><div class="flex flex-wrap gap-8 border-t dark:border-slate-800 pt-6"><div class="flex flex-col gap-1"><span class="text-[9px] font-black uppercase text-slate-400">Responsáveis</span><span class="text-sm font-bold text-primary">${t.assignees?.join(', ') || '---'}</span></div><div class="flex flex-col gap-1"><span class="text-[9px] font-black uppercase text-slate-400">Setor</span><span class="text-sm font-bold">${t.sector}</span></div><div class="flex flex-col gap-1"><span class="text-[9px] font-black uppercase text-slate-400">Anexos</span><button class="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-primary transition-colors"><span class="material-symbols-outlined text-sm">attach_file</span> Brevemente</button></div></div></div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6"><div class="flex flex-col gap-4"><div class="flex items-center justify-between p-2"><h2 class="font-black uppercase text-xs text-slate-400">Etapas</h2><button onclick="app.openSubtaskForm()" class="bg-primary text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg">+ Adicionar</button></div><div id="subtasks-list" class="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 divide-y dark:divide-slate-800 overflow-hidden shadow-sm"></div></div><div class="flex flex-col gap-4"><h2 class="font-black uppercase text-xs text-slate-400 p-2">Discussão ao Vivo</h2><div class="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 flex flex-col h-[400px] shadow-xl overflow-hidden"><div id="chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div><div class="p-4 border-t dark:border-slate-800 flex gap-2"><input id="chat-input" type="text" class="flex-1 bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none dark:text-white" placeholder="Escreva algo..."><button onclick="app.sendChatMessage()" class="bg-primary text-white size-10 rounded-xl flex items-center justify-center"><span class="material-symbols-outlined">send</span></button></div></div></div></div>
                <div class="flex gap-4 mt-6"><button id="edit-task-btn" class="flex-1 bg-yellow-500 text-white py-4 rounded-2xl font-black shadow-lg uppercase text-xs tracking-widest">Editar Projeto</button><button id="delete-task-btn" class="bg-red-500 text-white px-8 py-4 rounded-2xl font-black shadow-lg uppercase text-xs tracking-widest">Excluir</button></div>
            `;

            document.getElementById('edit-task-btn').onclick = () => this.openEditModal(t);
            document.getElementById('delete-task-btn').onclick = () => this.handleDeleteTask(id);
            document.getElementById('chat-input').onkeydown = (e) => { if(e.key === 'Enter') this.sendChatMessage(); };
            
            this.listenToSubtasks(id);
            this.listenToChat(id);
        }));
    },

    listenToChat(tid) {
        const q = query(collection(db, "tarefas", tid, "comentarios"), orderBy("createdAt", "asc"));
        this.unsubs.push(onSnapshot(q, (snap) => {
            const cont = document.getElementById('chat-messages'); if(!cont) return; cont.innerHTML = '';
            snap.forEach(c => {
                const data = c.data(); const isMe = data.createdBy === auth.currentUser.uid;
                cont.innerHTML += `<div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}"><span class="text-[8px] font-black uppercase text-slate-400 mb-1 ml-2 mr-2">${data.authorName}</span><div class="${isMe ? 'bg-primary text-white rounded-br-none' : 'bg-slate-100 dark:bg-slate-800 rounded-bl-none'} p-3 rounded-2xl text-xs max-w-[85%] shadow-sm">${data.text}</div></div>`;
            });
            cont.scrollTop = cont.scrollHeight;
        }));
    },

    async sendChatMessage() {
        const inp = document.getElementById('chat-input'); if(!inp || !inp.value.trim()) return;
        await addDoc(collection(db, "tarefas", this.currentTaskId, "comentarios"), { text: inp.value, authorName: auth.currentUser.displayName || "Membro", createdBy: auth.currentUser.uid, createdAt: serverTimestamp() });
        inp.value = '';
    },

    // --- SUBTAREFAS ---
    listenToSubtasks(tid) {
        const q = query(collection(db, "tarefas", tid, "subtarefas"), orderBy("createdAt", "asc"));
        this.unsubs.push(onSnapshot(q, (snap) => {
            const list = document.getElementById('subtasks-list'); if(!list) return;
            list.innerHTML = snap.size ? '' : '<p class="p-8 text-center text-xs text-slate-400 italic">Sem etapas.</p>';
            snap.forEach(sd => {
                const s = sd.data(); const div = document.createElement('div');
                div.className = "flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer";
                div.innerHTML = `<input type="checkbox" ${s.completed ? 'checked' : ''} onchange="app.toggleSub('${sd.id}', this.checked)" class="rounded-lg text-primary focus:ring-0 border-slate-300 w-5 h-5"><span class="text-sm font-bold ${s.completed ? 'line-through opacity-40 italic text-slate-500' : ''}">${s.title}</span>`;
                div.onclick = (e) => { if(e.target.type !== 'checkbox') this.openSubtaskView(sd.id); };
                list.appendChild(div);
            });
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
                <div class="grid grid-cols-2 gap-4 border-t dark:border-slate-800 pt-4"><div><span class="text-[9px] font-black text-slate-400 uppercase">Equipa</span><p class="text-xs font-bold">${d.assignees?.join(', ') || '---'}</p></div><div><span class="text-[9px] font-black text-slate-400 uppercase">Prazo</span><p class="text-xs font-bold">${d.dueDate || '---'}</p></div></div>
                <div class="flex gap-2 mt-auto pt-6"><button onclick="app.openSubtaskForm('${sid}')" class="flex-1 bg-yellow-500/10 text-yellow-600 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest">Editar</button><button onclick="app.deleteSub('${sid}')" class="bg-red-500/10 text-red-500 px-4 rounded-xl hover:bg-red-500 hover:text-white transition-all"><span class="material-symbols-outlined">delete</span></button></div>
            </div>
            <div class="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900/40">
                <div class="p-4 border-b dark:border-slate-800 font-black text-[9px] uppercase text-slate-400 tracking-widest">Discussão da Etapa</div>
                <div id="sub-chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div>
                <div class="p-4 border-t dark:border-slate-800 flex gap-2"><input id="sub-chat-input" type="text" class="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none dark:text-white shadow-sm" placeholder="Mensagem..."><button onclick="app.sendSubComment()" class="bg-primary text-white size-10 rounded-xl flex items-center justify-center shadow-lg"><span class="material-symbols-outlined">send</span></button></div>
            </div>
        `;
        document.getElementById('modal-backdrop').classList.replace('hidden', 'flex');
        document.getElementById('modal-subtask-view').classList.remove('hidden');
        document.getElementById('sub-chat-input').onkeydown = (e) => { if(e.key === 'Enter') this.sendSubComment(); };
        this.listenToSubChat(sid);
    },

    listenToSubChat(sid) {
        const q = query(collection(db, "tarefas", this.currentTaskId, "subtarefas", sid, "comentarios"), orderBy("createdAt", "asc"));
        this.unsubs.push(onSnapshot(q, (snap) => {
            const cont = document.getElementById('sub-chat-messages'); if(!cont) return; cont.innerHTML = '';
            snap.forEach(c => {
                const data = c.data(); const isMe = data.createdBy === auth.currentUser.uid;
                cont.innerHTML += `<div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}"><div class="${isMe ? 'bg-primary text-white rounded-br-none' : 'bg-white dark:bg-slate-800 rounded-bl-none'} p-3 rounded-2xl text-xs max-w-[90%] shadow-sm font-medium">${data.text}</div></div>`;
            });
            cont.scrollTop = cont.scrollHeight;
        }));
    },

    async sendSubComment() {
        const inp = document.getElementById('sub-chat-input'); if(!inp || !inp.value.trim()) return;
        await addDoc(collection(db, "tarefas", this.currentTaskId, "subtarefas", this.activeSid, "comentarios"), { text: inp.value, authorName: auth.currentUser.displayName || "Membro", createdBy: auth.currentUser.uid, createdAt: serverTimestamp() });
        inp.value = '';
    },

    // --- PERFIL E SEGURANÇA ---
    async loadProfileData() {
        const u = auth.currentUser; if(!u) return;
        const d = await getDoc(doc(db, "usuarios", u.uid)); const data = d.data() || {};
        document.getElementById('profile-name-input').value = u.displayName || "";
        document.getElementById('profile-cargo-input').value = data.cargo || "";
        document.getElementById('profile-sector-input').value = data.setor || "Logística";
        document.getElementById('profile-bio-input').value = data.bio || "";
        document.getElementById('profile-page-name').innerText = u.displayName || "Usuário";
        document.getElementById('profile-page-email').innerText = u.email;
        const av = document.getElementById('profile-page-avatar');
        if(u.photoURL) { av.style.backgroundImage = `url('${u.photoURL}')`; av.innerText = ''; }
        else { av.innerText = (u.displayName || u.email).substring(0,2).toUpperCase(); av.style.backgroundImage = 'none'; }
    },

    async handleSaveProfile() {
        const btn = document.getElementById('save-profile-btn'); const u = auth.currentUser;
        const foto = this.tempPhotoBase64 || u.photoURL;
        try {
            await updateProfile(u, { displayName: document.getElementById('profile-name-input').value, photoURL: foto });
            await setDoc(doc(db, "usuarios", u.uid), { nome: document.getElementById('profile-name-input').value, cargo: document.getElementById('profile-cargo-input').value, setor: document.getElementById('profile-sector-input').value, bio: document.getElementById('profile-bio-input').value, foto, email: u.email }, { merge: true });
            this.darVerde(btn, "Guardar Alterações", "Atualizado!");
            setTimeout(() => { this.updateAvatar(u); this.navigate('dashboard'); }, 1000);
        } catch(e) { alert("Erro ao guardar."); }
    },

    async handlePasswordUpdate() {
        const user = auth.currentUser;
        const curPass = document.getElementById('current-password-input').value;
        const newPass = document.getElementById('new-password-input').value;
        const confPass = document.getElementById('confirm-password-input').value;
        if (newPass !== confPass) return alert("As novas senhas não coincidem.");
        const btn = document.getElementById('submit-change-password');
        try {
            const cred = EmailAuthProvider.credential(user.email, curPass);
            await reauthenticateWithCredential(user, cred);
            await updatePassword(user, newPass);
            this.darVerde(btn, "Confirmar Alteração", "Senha Alterada!");
            setTimeout(() => this.navigate('dashboard'), 1500);
        } catch(e) { alert("Senha atual incorreta."); }
    },

    // --- UTILITÁRIOS ---
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

    updateAvatar(user) {
        const av = document.getElementById('header-avatar');
        if(user.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${user.photoURL}')`; }
        else av.innerText = (user.displayName || user.email).substring(0,2).toUpperCase();
    },

    darVerde(btn, original, sucesso) { if(!btn) return; btn.innerText = sucesso; btn.classList.add('bg-green-600'); setTimeout(() => { btn.innerText = original; btn.classList.remove('bg-green-600'); }, 2000); },
    closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); document.querySelectorAll('.modal-box').forEach(m => m.classList.add('hidden')); },
    toggleSub(sid, val) { updateDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid), {completed: val}); },
    deleteSub(sid) { if(confirm("Excluir etapa?")) { deleteDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid)); this.closeModal(); } },
    quickComplete(id) { updateDoc(doc(db, "tarefas", id), { status: "Concluída" }); },
    cleanup() { this.unsubs.forEach(fn => fn()); this.unsubs = []; },
    openSubtaskForm(sid = null) { this.editSubId = sid; document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); document.getElementById('modal-subtask-form').classList.remove('hidden'); },
    async handleSaveSubtask() { /* Implementação idêntica ao anterior para salvar sub... */ },
    renderAdmin() { /* Implementação de estatísticas... */ }
};

window.app = app;
app.init();
