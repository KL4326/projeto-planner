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
        this.cleanup(); // Limpa listeners de chat ao vivo antigos
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
            catch(err) { alert("E-mail ou senha incorretos."); }
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
            const containers = ['task-assignees-checkboxes', 'edit-assignees-checkboxes'];
            containers.forEach(cid => {
                const el = document.getElementById(cid);
                if (el) {
                    el.innerHTML = opts.map(n => `<label class="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer"><input type="checkbox" value="${n}" class="${cid}-item rounded text-primary focus:ring-0 w-4 h-4"><span class="text-xs font-bold">${n}</span></label>`).join('');
                }
            });
            const fAss = document.getElementById('filter-assignee');
            if(fAss) fAss.innerHTML = '<option value="Todos">Responsáveis</option>' + opts.map(n => `<option value="${n}">${n}</option>`).join('');
        });
    },

    // --- DETALHES (SALA DE GUERRA) ---
    renderDetails(id) {
        this.currentTaskId = id;
        const container = document.getElementById('details-view-content');
        container.innerHTML = `<p class="text-center py-20 font-black animate-pulse">SINCROZINANDO DADOS...</p>`;

        const docRef = doc(db, "tarefas", id);
        this.unsubs.push(onSnapshot(docRef, (d) => {
            if(!d.exists()) return;
            const t = d.data();
            const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
            
            container.innerHTML = `
                <div class="flex items-center justify-between">
                    <button onclick="app.navigate('dashboard')" class="bg-white dark:bg-slate-800 p-2 rounded-xl shadow-sm"><span class="material-symbols-outlined">arrow_back</span></button>
                    <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase text-white ${p.bg}">${p.label}</span>
                </div>

                <div class="bg-white dark:bg-slate-900 p-8 rounded-3xl border dark:border-slate-800 shadow-xl">
                    <h1 class="text-3xl font-black mb-4">${t.title}</h1>
                    <p class="text-slate-500 whitespace-pre-line leading-relaxed mb-10">${t.description || 'Sem descrição.'}</p>
                    
                    <div class="flex flex-wrap gap-8 border-t dark:border-slate-800 pt-6">
                        <div class="flex flex-col gap-1">
                            <span class="text-[9px] font-black uppercase text-slate-400 tracking-widest">Responsáveis</span>
                            <span class="text-sm font-bold text-primary">${t.assignees?.join(', ') || 'Sem responsáveis'}</span>
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-[9px] font-black uppercase text-slate-400 tracking-widest">Setor</span>
                            <span class="text-sm font-bold">${t.sector}</span>
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-[9px] font-black uppercase text-slate-400 tracking-widest">Anexos</span>
                            <button class="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-primary transition-colors"><span class="material-symbols-outlined text-sm">attach_file</span> Anexar Arquivo</button>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="flex flex-col gap-4">
                        <div class="flex items-center justify-between p-2">
                            <h2 class="font-black uppercase text-xs tracking-widest text-slate-400">Subtarefas</h2>
                            <button onclick="app.openSubtaskForm()" class="bg-primary text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg">+ Criar</button>
                        </div>
                        <div id="subtasks-list" class="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 divide-y dark:divide-slate-800 overflow-hidden"></div>
                    </div>

                    <div class="flex flex-col gap-4">
                        <h2 class="font-black uppercase text-xs tracking-widest text-slate-400 p-2">Chat da Equipa</h2>
                        <div class="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 flex flex-col h-[400px] shadow-xl overflow-hidden">
                            <div id="chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div>
                            <div class="p-4 border-t dark:border-slate-800 flex gap-2 bg-slate-50 dark:bg-slate-800/30">
                                <input id="chat-input" type="text" class="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none dark:text-white" placeholder="Escreva uma mensagem...">
                                <button onclick="app.sendChatMessage()" class="bg-primary text-white size-10 rounded-xl flex items-center justify-center shadow-lg"><span class="material-symbols-outlined">send</span></button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex gap-4 mt-10">
                    <button id="edit-task-btn" class="flex-1 bg-yellow-500 text-white py-4 rounded-2xl font-black shadow-lg hover:bg-yellow-600 transition-all uppercase tracking-widest text-xs">Editar Tarefa</button>
                    <button id="delete-task-btn" class="bg-red-500 text-white px-8 py-4 rounded-2xl font-black shadow-lg hover:bg-red-600 transition-all uppercase tracking-widest text-xs">Excluir</button>
                </div>
            `;

            document.getElementById('edit-task-btn').onclick = () => this.openEditModal(t);
            document.getElementById('delete-task-btn').onclick = () => this.handleDeleteTask(id);
            document.getElementById('chat-input').onkeydown = (e) => { if(e.key === 'Enter') this.sendChatMessage(); };
            
            this.listenToSubtasks(id);
            this.listenToChat(id);
        }));
    },

    listenToChat(tid) {
        const chatUnsub = onSnapshot(query(collection(db, "tarefas", tid, "comentarios"), orderBy("createdAt", "asc")), (snap) => {
            const cont = document.getElementById('chat-messages');
            if(!cont) return;
            cont.innerHTML = '';
            snap.forEach(c => {
                const data = c.data();
                const isMe = data.createdBy === auth.currentUser.uid;
                cont.innerHTML += `
                    <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                        <span class="text-[9px] font-black uppercase text-slate-400 mb-1 ml-2 mr-2">${data.authorName}</span>
                        <div class="${isMe ? 'bg-primary text-white rounded-br-none' : 'bg-slate-100 dark:bg-slate-800 rounded-bl-none'} p-3 rounded-2xl text-sm max-w-[85%] shadow-sm font-medium">
                            ${data.text}
                        </div>
                    </div>
                `;
            });
            cont.scrollTop = cont.scrollHeight;
        });
        this.unsubs.push(chatUnsub);
    },

    async sendChatMessage() {
        const inp = document.getElementById('chat-input');
        if(!inp || !inp.value.trim()) return;
        await addDoc(collection(db, "tarefas", this.currentTaskId, "comentarios"), {
            text: inp.value,
            authorName: auth.currentUser.displayName || "Usuário",
            createdBy: auth.currentUser.uid,
            createdAt: serverTimestamp()
        });
        inp.value = '';
    },

    listenToSubtasks(tid) {
        const subUnsub = onSnapshot(query(collection(db, "tarefas", tid, "subtarefas"), orderBy("createdAt", "asc")), (snap) => {
            const list = document.getElementById('subtasks-list');
            if(!list) return;
            list.innerHTML = snap.size ? '' : '<p class="p-8 text-center text-xs text-slate-400 italic">Nenhuma subtarefa criada.</p>';
            snap.forEach(sd => {
                const s = sd.data();
                const div = document.createElement('div');
                div.className = "flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors";
                div.innerHTML = `<input type="checkbox" ${s.completed ? 'checked' : ''} onchange="app.toggleSub('${sd.id}', this.checked)" class="rounded text-primary focus:ring-0 border-slate-300 w-5 h-5"><span class="text-sm font-bold ${s.completed ? 'line-through opacity-40' : ''}">${s.title}</span>`;
                div.onclick = (e) => { if(e.target.type !== 'checkbox') this.openSubView(sd.id); };
                list.appendChild(div);
            });
        });
        this.unsubs.push(subUnsub);
    },

    async handleDeleteTask(id) {
        if(confirm("Deseja EXCLUIR permanentemente esta tarefa e todo o histórico de chat?")) {
            await deleteDoc(doc(db, "tarefas", id));
            this.navigate('dashboard');
        }
    },

    cleanup() { this.unsubs.forEach(fn => fn()); this.unsubs = []; },
    
    // --- RESTANTE DAS FUNÇÕES (LOGIN, DASHBOARD, PERFIL, ETC) ---
    // ... [Mantenha a lógica anterior de Dashboard e Perfil igual]
    async handleCreateTask() {
        const title = document.getElementById('task-title').value;
        const btn = document.getElementById('save-task-btn');
        if(!title) return;
        const assignees = Array.from(document.querySelectorAll('.task-assignees-checkboxes-item:checked')).map(cb => cb.value);
        await addDoc(collection(db, "tarefas"), {
            title, description: document.getElementById('task-desc').value, sector: document.getElementById('task-sector').value,
            priority: document.getElementById('task-priority-droplist').value, assignees, status: "Em aberto",
            createdAt: serverTimestamp(), createdBy: auth.currentUser.uid, dueDate: document.getElementById('task-date').value
        });
        this.navigate('dashboard');
    },

    listenToTasks() { onSnapshot(query(collection(db, "tarefas"), orderBy("createdAt", "desc")), (snap) => { this.allTasks = snap.docs; this.renderDashboard(); }); },
    renderDashboard() {
        const container = document.getElementById('tasks-container'); if(!container) return; container.innerHTML = '';
        this.allTasks.forEach(docSnap => {
            const t = docSnap.data();
            if(t.status === this.filters.status || this.filters.status === "Todas") {
                const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
                const div = document.createElement('div');
                div.className = "p-4 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-800 mb-1 cursor-pointer flex justify-between items-center transition-all hover:border-primary/50 shadow-sm";
                div.onclick = () => this.navigate('detalhes', docSnap.id);
                div.innerHTML = `<div><span class="font-bold text-slate-900 dark:text-white">${t.title}</span><div class="flex items-center gap-2 mt-1 text-[10px] uppercase font-black"><span class="text-primary">${t.sector || 'Geral'}</span><span class="text-slate-400">| ${t.assignees?.join(', ') || 'Equipa'}</span></div></div><span class="text-[10px] font-black uppercase px-2 py-1 rounded-full ${p.bg} text-white">${p.label}</span>`;
                container.appendChild(div);
            }
        });
    },

    updateAvatar(user) { const av = document.getElementById('header-avatar'); if(user.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${user.photoURL}')`; } else av.innerText = (user.displayName || user.email).substring(0,2).toUpperCase(); },
    closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); }
};

window.app = app;
app.init();
