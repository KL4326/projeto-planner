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

    init() {
        this.bindEvents();
        this.checkAuth();
        const t = localStorage.getItem('theme') || 'dark';
        document.documentElement.classList.toggle('dark', t === 'dark');
    },

    navigate(pageId, params = null) {
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
            const btn = e.target.querySelector('button'); btn.innerText = "A entrar...";
            try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } 
            catch(err) { alert("Erro no login."); btn.innerText = "Entrar"; }
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

        document.getElementById('profile-upload')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    this.tempPhotoBase64 = event.target.result;
                    document.getElementById('profile-page-avatar').style.backgroundImage = `url('${this.tempPhotoBase64}')`;
                    document.getElementById('profile-page-avatar').innerText = '';
                };
                reader.readAsDataURL(file);
            }
        });

        document.getElementById('save-task-btn').onclick = () => this.handleCreateTask();
        document.getElementById('save-profile-btn').onclick = () => this.handleSaveProfile();
        
        // Botão da Nova Lógica de Senha
        document.getElementById('submit-change-password').onclick = () => this.handlePasswordUpdate();

        document.getElementById('profile-btn').onclick = (e) => { e.stopPropagation(); document.getElementById('profile-menu').classList.toggle('hidden'); };
        document.addEventListener('click', () => document.getElementById('profile-menu').classList.add('hidden'));
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

    // --- NOVA LÓGICA DE SENHA ---
    async handlePasswordUpdate() {
        const user = auth.currentUser;
        const currentPass = document.getElementById('current-password-input').value;
        const newPass = document.getElementById('new-password-input').value;
        const confirmPass = document.getElementById('confirm-password-input').value;
        const btn = document.getElementById('submit-change-password');

        if (!currentPass || !newPass || !confirmPass) return alert("Preencha todos os campos.");
        if (newPass !== confirmPass) return alert("As novas senhas não coincidem.");
        if (newPass.length < 6) return alert("A nova senha deve ter no mínimo 6 caracteres.");

        btn.innerText = "A processar...";
        btn.disabled = true;

        try {
            // Re-autenticação é obrigatória para trocar senha no Firebase em apps de alta segurança
            const credential = EmailAuthProvider.credential(user.email, currentPass);
            await reauthenticateWithCredential(user, credential);
            
            // Atualizar senha
            await updatePassword(user, newPass);
            
            this.darVerde(btn, "Confirmar Alteração", "Senha Alterada!");
            setTimeout(() => {
                document.getElementById('current-password-input').value = '';
                document.getElementById('new-password-input').value = '';
                document.getElementById('confirm-password-input').value = '';
                this.navigate('dashboard');
            }, 1500);

        } catch (error) {
            alert("Erro: A senha atual está incorreta ou ocorreu um problema de conexão.");
            btn.innerText = "Confirmar Alteração";
            btn.disabled = false;
        }
    },

    loadUsers() {
        onSnapshot(query(collection(db, "usuarios"), orderBy("nome", "asc")), (snap) => {
            const fAss = document.getElementById('filter-assignee');
            if (fAss) fAss.innerHTML = '<option value="Todos">Responsáveis</option>' + snap.docs.map(d => `<option value="${d.data().nome}">${d.data().nome}</option>`).join('');
            
            const cbContainer = document.getElementById('task-assignees-checkboxes');
            if (cbContainer) {
                cbContainer.innerHTML = '';
                snap.forEach(d => {
                    const nome = d.data().nome;
                    const id = `cb-${d.id}`;
                    cbContainer.innerHTML += `<label class="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"><input type="checkbox" value="${nome}" class="task-assignee-cb w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"><span class="text-sm font-bold">${nome}</span></label>`;
                });
            }
        });
    },

    async handleCreateTask() {
        const title = document.getElementById('task-title').value;
        const btn = document.getElementById('save-task-btn');
        if(!title) return;
        const assignees = Array.from(document.querySelectorAll('.task-assignee-cb:checked')).map(cb => cb.value);
        btn.innerText = "A criar..."; btn.disabled = true;
        await addDoc(collection(db, "tarefas"), {
            title, description: document.getElementById('task-desc').value, sector: document.getElementById('task-sector').value,
            priority: document.getElementById('task-priority-droplist').value, assignees, status: "Em aberto",
            createdAt: serverTimestamp(), createdBy: auth.currentUser.uid, dueDate: document.getElementById('task-date').value
        });
        this.darVerde(btn, "Criar Tarefa", "Criado!");
        setTimeout(() => this.navigate('dashboard'), 1000);
    },

    async loadProfileData() {
        const u = auth.currentUser; if(!u) return;
        const d = await getDoc(doc(db, "usuarios", u.uid));
        const data = d.data() || {};
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
        const btn = document.getElementById('save-profile-btn');
        const user = auth.currentUser;
        const foto = this.tempPhotoBase64 || user.photoURL;
        try {
            await updateProfile(user, { displayName: document.getElementById('profile-name-input').value, photoURL: foto });
            await setDoc(doc(db, "usuarios", user.uid), { 
                nome: document.getElementById('profile-name-input').value, 
                cargo: document.getElementById('profile-cargo-input').value, 
                setor: document.getElementById('profile-sector-input').value, 
                bio: document.getElementById('profile-bio-input').value, 
                foto, email: user.email 
            }, { merge: true });
            this.darVerde(btn, "Guardar Alterações", "Atualizado!");
            setTimeout(() => { this.updateAvatar(user); this.navigate('dashboard'); }, 1000);
        } catch(e) { alert("Erro ao salvar."); }
    },

    listenToTasks() { onSnapshot(query(collection(db, "tarefas"), orderBy("createdAt", "desc")), (snap) => { this.allTasks = snap.docs; this.renderDashboard(); }); },
    renderDashboard() {
        const container = document.getElementById('tasks-container'); if(!container) return; container.innerHTML = '';
        this.allTasks.forEach(docSnap => {
            const t = docSnap.data();
            if(t.status === this.filters.status || this.filters.status === "Todas") {
                const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
                const div = document.createElement('div');
                div.className = "p-4 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-800 mb-1 cursor-pointer flex justify-between items-center transition-all hover:border-primary/50";
                div.onclick = () => this.navigate('detalhes', docSnap.id);
                div.innerHTML = `<div><span class="font-bold">${t.title}</span><p class="text-[10px] text-slate-500 uppercase font-black">${t.sector || 'Geral'}</p></div><span class="text-[10px] font-black uppercase px-2 py-1 rounded-full ${p.bg} text-white">${p.label}</span>`;
                container.appendChild(div);
            }
        });
    },

    updateAvatar(user) { const av = document.getElementById('header-avatar'); if(user.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${user.photoURL}')`; } else av.innerText = (user.displayName || user.email).substring(0,2).toUpperCase(); },
    darVerde(btn, original, sucesso) { if(!btn) return; btn.innerText = sucesso; btn.classList.add('bg-green-600'); setTimeout(() => { btn.innerText = original; btn.classList.remove('bg-green-600'); }, 2000); },
    closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); }
};

window.app = app;
app.init();
