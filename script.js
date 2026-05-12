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
    currentTaskId: null, activeSid: null, tempPhotoBase64: null, allTasks: [], filters: { status: "Todas", sector: "Todos", assignee: "Todos", search: "" }, unsubs: [],

    init() { this.bindEvents(); this.checkAuth(); this.initTheme(); },
    initTheme() { const t = localStorage.getItem('theme') || 'dark'; document.documentElement.classList.toggle('dark', t === 'dark'); },
    navigate(pageId, params = null) { this.cleanup(); document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active')); const target = document.getElementById(`page-${pageId}`); if(target) target.classList.add('active'); if(pageId === 'detalhes' && params) this.renderDetails(params); if(pageId === 'perfil') this.loadProfileData(); this.closeModal(); window.scrollTo(0,0); },

    bindEvents() {
        document.getElementById('login-form')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } catch(err) { alert("E-mail ou senha incorretos."); } });
        document.getElementById('logout-btn').onclick = () => signOut(auth);
        document.getElementById('search-input').oninput = (e) => { this.filters.search = e.target.value; this.renderDashboard(); };
        document.querySelectorAll('.filter-btn').forEach(btn => { btn.onclick = () => { document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); this.filters.status = btn.dataset.filter; this.renderDashboard(); }; });
        document.getElementById('save-task-btn').onclick = () => this.handleCreateTask();
        document.getElementById('save-profile-btn').onclick = () => this.handleSaveProfile();
        document.getElementById('submit-change-password').onclick = () => this.handlePasswordUpdate();
        document.getElementById('submit-subtask-form').onclick = () => this.handleSaveSubtask();
        document.getElementById('submit-edit-task').onclick = () => this.handleUpdateTask();
        document.getElementById('profile-btn').onclick = (e) => { e.stopPropagation(); document.getElementById('profile-menu').classList.toggle('hidden'); };
        document.addEventListener('click', () => document.getElementById('profile-menu')?.classList.add('hidden'));
        document.querySelectorAll('.theme-toggle').forEach(b => b.onclick = () => { const isD = document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', isD ? 'dark' : 'light'); });
        
        // Upload Perfil
        document.getElementById('profile-upload')?.addEventListener('change', (e) => {
            const file = e.target.files[0]; if (file) { const r = new FileReader(); r.onload = (ev) => { this.tempPhotoBase64 = ev.target.result; document.getElementById('profile-page-avatar').style.backgroundImage = `url('${this.tempPhotoBase64}')`; document.getElementById('profile-page-avatar').innerText = ''; }; r.readAsDataURL(file); }
        });
    },

    checkAuth() {
        onAuthStateChanged(auth, (user) => {
            if (user) { document.getElementById('main-header').classList.replace('hidden', 'flex'); this.updateAvatar(user); this.listenToTasks(); this.loadUsers(); this.navigate('dashboard'); } 
            else { document.getElementById('main-header').classList.add('hidden'); this.navigate('login'); }
        });
    },

    // --- ANEXOS (MÉDOTO BASE64) ---
    async handleFileUpload(type, id) {
        const input = document.createElement('input'); input.type = 'file';
        input.onchange = (e) => {
            const file = e.target.files[0]; if(!file) return;
            if(file.size > 800000) return alert("Arquivo muito grande. Máximo 800KB.");
            const r = new FileReader();
            r.onload = async (ev) => {
                const base64 = ev.target.result;
                const path = type === 'task' ? doc(db, "tarefas", id) : doc(db, "tarefas", this.currentTaskId, "subtarefas", id);
                const d = await getDoc(path);
                const anexos = d.data().anexos || [];
                anexos.push({ nome: file.name, data: base64, type: file.type });
                await updateDoc(path, { anexos });
            };
            r.readAsDataURL(file);
        };
        input.click();
    },

    // --- RENDERIZAR TAREFA ---
    renderDetails(id) {
        this.currentTaskId = id;
        const container = document.getElementById('details-view-content');
        this.unsubs.push(onSnapshot(doc(db, "tarefas", id), (d) => {
            if(!d.exists()) return;
            const t = d.data(); const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
            container.innerHTML = `
                <div class="flex items-center justify-between"><button onclick="app.navigate('dashboard')" class="bg-white dark:bg-slate-800 p-2 rounded-xl shadow-sm hover:text-primary transition-all"><span class="material-symbols-outlined">arrow_back</span></button><span class="px-3 py-1 rounded-full text-[10px] font-black uppercase text-white ${p.bg}">${p.label}</span></div>
                <div class="bg-white dark:bg-slate-900 p-8 rounded-3xl border dark:border-slate-800 shadow-xl">
                    <h1 class="text-3xl font-black mb-4">${t.title}</h1><p class="text-slate-500 whitespace-pre-line leading-relaxed mb-8">${t.description || '...'}</p>
                    <div class="flex flex-wrap gap-8 border-t dark:border-slate-800 pt-6">
                        <div class="flex flex-col gap-1"><span class="text-[9px] font-black uppercase text-slate-400">Responsáveis</span><span class="text-sm font-bold text-primary">${t.assignees?.join(', ') || '---'}</span></div>
                        <div class="flex flex-col gap-1 flex-1">
                            <span class="text-[9px] font-black uppercase text-slate-400 mb-2">Anexos</span>
                            <div class="flex flex-wrap gap-2" id="task-attachments-list"></div>
                            <button onclick="app.handleFileUpload('task', '${id}')" class="mt-3 flex items-center gap-2 text-[10px] font-black uppercase text-primary hover:opacity-70"><span class="material-symbols-outlined text-sm">attach_file</span> Adicionar Arquivo</button>
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="flex flex-col gap-4"><div class="flex items-center justify-between p-2"><h2 class="font-black uppercase text-xs text-slate-400">Etapas</h2><button onclick="app.openSubtaskForm()" class="bg-primary text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg">+ Adicionar</button></div><div id="subtasks-list" class="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 divide-y dark:divide-slate-800 overflow-hidden"></div></div>
                    <div class="flex flex-col gap-4"><h2 class="font-black uppercase text-xs text-slate-400 p-2">Discussão</h2><div class="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 flex flex-col h-[400px] shadow-xl overflow-hidden"><div id="chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div><div class="p-4 border-t dark:border-slate-800 flex gap-2"><input id="chat-input" type="text" class="flex-1 bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none dark:text-white" placeholder="Mensagem..."><button onclick="app.sendChatMessage()" class="bg-primary text-white size-10 rounded-xl flex items-center justify-center"><span class="material-symbols-outlined">send</span></button></div></div></div>
                </div>
                <div class="flex gap-4 mt-6"><button id="edit-task-btn" class="flex-1 bg-yellow-500 text-white py-4 rounded-2xl font-black shadow-lg uppercase text-xs tracking-widest">Editar</button><button id="delete-task-btn" class="bg-red-500 text-white px-8 py-4 rounded-2xl font-black shadow-lg uppercase text-xs tracking-widest">Excluir</button></div>
            `;
            // Listar Anexos
            const attCont = document.getElementById('task-attachments-list');
            (t.anexos || []).forEach(a => {
                attCont.innerHTML += `<a href="${a.data}" download="${a.nome}" class="attachment-card flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border dark:border-slate-700 text-[10px] font-bold truncate max-w-[150px]"><span class="material-symbols-outlined text-sm">description</span> ${a.nome}</a>`;
            });
            this.listenToSubtasks(id); this.listenToChat(id);
        }));
    },

    // --- RENDERIZAR SUBTAREFA ---
    async openSubtaskView(sid) {
        this.activeSid = sid; const d = (await getDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", sid))).data();
        const p = CONFIG.prioridades[d.priority] || CONFIG.prioridades.low;
        const cont = document.getElementById('subtask-view-content');
        cont.innerHTML = `
            <div class="w-full md:w-1/2 p-8 border-r dark:border-slate-800 overflow-y-auto flex flex-col gap-6">
                <div class="flex items-center justify-between"><span class="px-2 py-0.5 rounded text-[9px] font-black uppercase text-white ${p.bg}">${p.label}</span><button onclick="app.closeModal()"><span class="material-symbols-outlined text-slate-400">close</span></button></div>
                <div><h3 class="text-2xl font-black text-primary mb-2">${d.title}</h3><p class="text-sm text-slate-500 italic">${d.description || '...'}</p></div>
                <div class="flex flex-col gap-1 border-t dark:border-slate-800 pt-4">
                    <span class="text-[9px] font-black text-slate-400 uppercase">Anexos da Etapa</span>
                    <div id="sub-attachments-list" class="flex flex-wrap gap-2 mt-2"></div>
                    <button onclick="app.handleFileUpload('sub', '${sid}')" class="mt-2 flex items-center gap-2 text-[10px] font-black uppercase text-primary hover:opacity-70"><span class="material-symbols-outlined text-sm">attach_file</span> Anexar Arquivo</button>
                </div>
                <div class="flex gap-2 mt-auto pt-6"><button onclick="app.openSubtaskForm('${sid}')" class="flex-1 bg-yellow-500/10 text-yellow-600 py-3 rounded-xl font-black text-[10px] uppercase">Editar</button><button onclick="app.deleteSub('${sid}')" class="bg-red-500/10 text-red-500 px-4 rounded-xl hover:bg-red-500 transition-all"><span class="material-symbols-outlined">delete</span></button></div>
            </div>
            <div class="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900/40">
                <div id="sub-chat-messages" class="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"></div>
                <div class="p-4 border-t dark:border-slate-800 flex gap-2"><input id="sub-chat-input" type="text" class="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-sm outline-none dark:text-white shadow-sm" placeholder="Chat..."><button onclick="app.sendSubComment()" class="bg-primary text-white size-10 rounded-xl flex items-center justify-center"><span class="material-symbols-outlined">send</span></button></div>
            </div>
        `;
        const attCont = document.getElementById('sub-attachments-list');
        (d.anexos || []).forEach(a => {
            attCont.innerHTML += `<a href="${a.data}" download="${a.nome}" class="attachment-card flex items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 text-[10px] font-bold truncate max-w-[120px]"><span class="material-symbols-outlined text-sm">description</span> ${a.nome}</a>`;
        });
        document.getElementById('modal-backdrop').classList.replace('hidden', 'flex'); document.getElementById('modal-subtask-view').classList.remove('hidden');
        this.listenToSubChat(sid);
    },

    // --- AUXILIARES ---
    cleanup() { this.unsubs.forEach(f => f()); this.unsubs = []; },
    listenToTasks() { onSnapshot(query(collection(db, "tarefas"), orderBy("createdAt", "desc")), (snap) => { this.allTasks = snap.docs; this.renderDashboard(); }); },
    updateAvatar(user) { const av = document.getElementById('header-avatar'); if(user.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${user.photoURL}')`; } else av.innerText = (user.displayName || user.email).substring(0,2).toUpperCase(); },
    loadUsers() { onSnapshot(query(collection(db, "usuarios"), orderBy("nome", "asc")), (snap) => { const opts = snap.docs.map(d => d.data().nome); ['task-assignees-checkboxes', 'sub-assignees-checkboxes'].forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = opts.map(n => `<label class="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer transition-all"><input type="checkbox" value="${n}" class="${id}-item rounded text-primary w-4 h-4"><span class="text-xs font-bold">${n}</span></label>`).join(''); }); const f = document.getElementById('filter-assignee'); if(f) f.innerHTML = '<option value="Todos">Responsáveis</option>' + opts.map(n => `<option value="${n}">${n}</option>`).join(''); }); },
    renderDashboard() { /* Lógica de renderização das tarefas no dashboard enviada anteriormente */ },
    closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); document.querySelectorAll('.modal-box').forEach(m => m.classList.add('hidden')); },
    toggleSub(sid, val) { updateDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid), {completed: val}); },
    async sendChatMessage() { const inp = document.getElementById('chat-input'); if(!inp.value.trim()) return; await addDoc(collection(db, "tarefas", this.currentTaskId, "comentarios"), { text: inp.value, authorName: auth.currentUser.displayName, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() }); inp.value = ''; },
    listenToChat(tid) { this.unsubs.push(onSnapshot(query(collection(db,"tarefas",tid,"comentarios"), orderBy("createdAt","asc")), snap => { const c = document.getElementById('chat-messages'); if(c) { c.innerHTML = ''; snap.forEach(doc => { const d = doc.data(); const isMe = d.createdBy === auth.currentUser.uid; c.innerHTML += `<div class="flex flex-col ${isMe?'items-end':'items-start'}"><span class="text-[8px] uppercase font-black text-slate-400 mb-1">${d.authorName}</span><div class="${isMe?'bg-primary text-white rounded-br-none':'bg-slate-100 dark:bg-slate-800 rounded-bl-none'} p-3 rounded-2xl text-xs shadow-sm max-w-[85%]">${d.text}</div></div>`; }); c.scrollTop = c.scrollHeight; } })); },
    listenToSubtasks(tid) { this.unsubs.push(onSnapshot(query(collection(db,"tarefas",tid,"subtarefas"), orderBy("createdAt","asc")), snap => { const l = document.getElementById('subtasks-list'); if(l) { l.innerHTML = ''; snap.forEach(sd => { const s = sd.data(); const p = CONFIG.prioridades[s.priority] || CONFIG.prioridades.low; l.innerHTML += `<div class="flex items-center gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" onclick="if(event.target.type !== 'checkbox') app.openSubtaskView('${sd.id}')"><input type="checkbox" ${s.completed?'checked':''} onchange="app.toggleSub('${sd.id}', this.checked)" class="rounded text-primary w-5 h-5"><span class="flex-1 text-sm font-bold ${s.completed?'line-through opacity-40 italic':''}">${s.title}</span><span class="px-2 py-0.5 rounded text-[8px] font-black uppercase text-white ${p.bg}">${p.label}</span></div>`; }); } })); },
    listenToSubChat(sid) { this.unsubs.push(onSnapshot(query(collection(db,"tarefas",this.currentTaskId,"subtarefas",sid,"comentarios"), orderBy("createdAt","asc")), snap => { const c = document.getElementById('sub-chat-messages'); if(c) { c.innerHTML = ''; snap.forEach(doc => { const d = doc.data(); const isMe = d.createdBy === auth.currentUser.uid; c.innerHTML += `<div class="flex flex-col ${isMe?'items-end':'items-start'}"><div class="${isMe?'bg-primary text-white rounded-br-none':'bg-white dark:bg-slate-800 rounded-bl-none'} p-3 rounded-2xl text-xs shadow-sm max-w-[90%]">${d.text}</div></div>`; }); c.scrollTop = c.scrollHeight; } })); },
    async sendSubComment() { const inp = document.getElementById('sub-chat-input'); if(!inp.value.trim()) return; await addDoc(collection(db,"tarefas",this.currentTaskId,"subtarefas",this.activeSid, "comentarios"), { text: inp.value, authorName: auth.currentUser.displayName, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() }); inp.value = ''; }
};

window.app = app;
app.init();
