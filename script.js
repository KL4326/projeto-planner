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
    navigate(pageId, params = null) { this.cleanup(); document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active')); const target = document.getElementById(`page-${pageId}`); if(target) target.classList.add('active'); if(pageId === 'detalhes' && params) this.renderDetails(params); if(pageId === 'perfil') this.loadProfileData(); if(pageId === 'admin') this.renderAdmin(); this.closeModal(); window.scrollTo(0,0); },

    bindEvents() {
        document.getElementById('login-form')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } catch(err) { alert("Credenciais incorretas."); } });
        document.getElementById('logout-btn').onclick = () => signOut(auth);
        document.getElementById('search-input').oninput = (e) => { this.filters.search = e.target.value; this.renderDashboard(); };
        document.querySelectorAll('.filter-btn').forEach(btn => { btn.onclick = () => { document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); this.filters.status = btn.dataset.filter; this.renderDashboard(); }; });
        document.getElementById('save-task-btn').onclick = () => this.handleCreateTask();
        document.getElementById('save-profile-btn').onclick = () => this.handleSaveProfile();
        document.getElementById('submit-change-password').onclick = () => this.handlePasswordUpdate();
        document.getElementById('submit-subtask-form').onclick = () => this.handleSaveSubtask();
        document.getElementById('submit-edit-task').onclick = () => this.handleUpdateTask();
        
        // Perfil e Notificações
        document.getElementById('profile-btn').onclick = (e) => { e.stopPropagation(); document.getElementById('notif-menu').classList.add('hidden'); document.getElementById('profile-menu').classList.toggle('hidden'); };
        document.getElementById('notif-btn').onclick = (e) => { e.stopPropagation(); document.getElementById('profile-menu').classList.add('hidden'); document.getElementById('notif-menu').classList.toggle('hidden'); this.markNotifsRead(); };
        document.addEventListener('click', () => { document.getElementById('profile-menu')?.classList.add('hidden'); document.getElementById('notif-menu')?.classList.add('hidden'); });
        
        document.querySelectorAll('.theme-toggle').forEach(b => b.onclick = () => { const isD = document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', isD ? 'dark' : 'light'); });
        document.getElementById('profile-upload')?.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { this.compressImage(file, (b64) => { this.tempPhotoBase64 = b64; document.getElementById('profile-page-avatar').style.backgroundImage = `url('${b64}')`; document.getElementById('profile-page-avatar').innerText = ''; }); } });
    },

    // --- LOGS E NOTIFICAÇÕES ---
    async addLog(msg) {
        await addDoc(collection(db, "notificacoes"), { text: msg, createdAt: serverTimestamp(), author: auth.currentUser.displayName || auth.currentUser.email });
    },

    listenToNotifications() {
        const q = query(collection(db, "notificacoes"), orderBy("createdAt", "desc"), limit(20));
        onSnapshot(q, (snap) => {
            const list = document.getElementById('notif-list');
            const badge = document.getElementById('notif-badge');
            if(!list) return;
            list.innerHTML = snap.size ? '' : '<p class="p-8 text-center text-xs text-slate-400 italic">Nenhuma atividade recente.</p>';
            
            let unread = 0;
            snap.forEach(d => {
                const data = d.data();
                const time = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'}) : '';
                if (data.createdAt?.seconds > this.lastReadNotif) unread++;
                
                list.innerHTML += `
                    <div class="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <p class="text-xs text-slate-700 dark:text-slate-200 font-medium">${data.text}</p>
                        <div class="flex justify-between items-center mt-2"><span class="text-[9px] font-black uppercase text-primary">${data.author}</span><span class="text-[9px] text-slate-400">${time}</span></div>
                    </div>
                `;
            });

            if(unread > 0) { badge.innerText = unread; badge.classList.remove('hidden'); }
            else { badge.classList.add('hidden'); }
        });
    },

    markNotifsRead() {
        this.lastReadNotif = Math.floor(Date.now() / 1000);
        localStorage.setItem('lastNotif', this.lastReadNotif);
        document.getElementById('notif-badge').classList.add('hidden');
    },

    clearNotifications() { if(confirm("Limpar histórico de notificações?")) { /* Lógica de eliminar coleção se desejar */ } },

    // --- CRIAÇÃO E EDIÇÃO COM LOGS ---
    async handleCreateTask() {
        const title = document.getElementById('task-title').value; if(!title) return alert("Título obrigatório.");
        const assignees = Array.from(document.querySelectorAll('.task-assignees-checkboxes-item:checked')).map(cb => cb.value);
        const docRef = await addDoc(collection(db, "tarefas"), { title, description: document.getElementById('task-desc').value, sector: document.getElementById('task-sector').value, priority: document.getElementById('task-priority-droplist').value, assignees, status: "Em aberto", createdAt: serverTimestamp(), createdBy: auth.currentUser.uid, dueDate: document.getElementById('task-date').value });
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
            const d = await getDoc(doc(db, "tarefas", id));
            await this.addLog(`Eliminou a tarefa: "${d.data().title}"`);
            await deleteDoc(doc(db, "tarefas", id));
            this.navigate('dashboard');
        }
    },

    async handleSaveSubtask() {
        const t = document.getElementById('sub-title-inp').value; if(!t) return;
        const assignees = Array.from(document.querySelectorAll('.sub-assignees-checkboxes-item:checked')).map(cb => cb.value);
        const data = { title: t, description: document.getElementById('sub-desc-inp').value, priority: document.getElementById('sub-priority-inp').value, dueDate: document.getElementById('sub-date-inp').value, assignees, updatedAt: serverTimestamp() };
        if (this.editSubId) {
            await updateDoc(doc(db, "tarefas", this.currentTaskId, "subtarefas", this.editSubId), data);
            await this.addLog(`Editou a subtarefa "${t}"`);
        } else {
            await addDoc(collection(db, "tarefas", this.currentTaskId, "subtarefas"), { ...data, completed: false, createdAt: serverTimestamp() });
            await this.addLog(`Adicionou a subtarefa "${t}"`);
        }
        this.closeModal();
    },

    // --- RESTANTE DO MOTOR (MANTIDO) ---
    checkAuth() { onAuthStateChanged(auth, (user) => { const h = document.getElementById('main-header'); if (user) { h.classList.replace('hidden', 'flex'); this.updateAvatar(user); this.listenToTasks(); this.loadUsers(); this.navigate('dashboard'); if(user.email === "olimakl@gmail.com") document.getElementById('admin-menu-link').classList.replace('hidden', 'flex'); } else { h.classList.add('hidden'); this.navigate('login'); } }); },
    cleanup() { this.unsubs.forEach(f => f()); this.unsubs = []; },
    updateAvatar(u) { const av = document.getElementById('header-avatar'); if(u.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${u.photoURL}')`; } else av.innerText = (u.displayName || u.email).substring(0,2).toUpperCase(); },
    darVerde(btn, orig, suc) { if(!btn) return; btn.innerText = suc; btn.classList.add('bg-green-600'); setTimeout(() => { btn.innerText = orig; btn.classList.remove('bg-green-600'); }, 2000); },
    closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); document.querySelectorAll('.modal-box').forEach(m => m.classList.add('hidden')); },
    toggleSub(sid, val) { updateDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid), {completed: val}); },
    deleteSub(sid) { if(confirm("Excluir?")) { deleteDoc(doc(db,"tarefas",this.currentTaskId,"subtarefas",sid)); this.closeModal(); } },
    loadUsers() { onSnapshot(query(collection(db, "usuarios"), orderBy("nome", "asc")), (snap) => { const opts = snap.docs.map(d => d.data().nome); ['task-assignees-checkboxes', 'edit-assignees-checkboxes', 'sub-assignees-checkboxes'].forEach(cid => { const el = document.getElementById(cid); if (el) el.innerHTML = opts.map(n => `<label class="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer transition-all"><input type="checkbox" value="${n}" class="${cid}-item rounded text-primary w-4 h-4"><span class="text-xs font-bold">${n}</span></label>`).join(''); }); const f = document.getElementById('filter-assignee'); if(f) f.innerHTML = '<option value="Todos">Responsáveis</option>' + opts.map(n => `<option value="${n}">${n}</option>`).join(''); }); },
    compressImage(f, cb) { const r = new FileReader(); r.readAsDataURL(f); r.onload = (e) => { const img = new Image(); img.src = e.target.result; img.onload = () => { const canvas = document.createElement('canvas'); const MAX = 300; const scale = MAX / img.width; canvas.width = MAX; canvas.height = img.height * scale; canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); cb(canvas.toDataURL('image/jpeg', 0.7)); }; }; },
    renderDashboard() { /* Lógica de render das tarefas principais */ },
    renderDetails(id) { /* Lógica de render dos detalhes da tarefa principal */ },
    openSubtaskView(sid) { /* Lógica de render dos detalhes da subtarefa */ },
    renderRanking() { /* Lógica de render do ranking */ },
    loadProfileData() { /* Lógica de render dos dados de perfil */ },
    handleSaveProfile() { /* Lógica de gravação do perfil */ },
    handlePasswordUpdate() { /* Lógica de alteração de senha */ }
};

window.app = app;
app.init();
