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
    // Adicionada a prioridade "Urgente"
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
                this.loadUsers(); // Carrega os checkboxes e filtros
                this.navigate('dashboard');
                // Admin (Altere aqui)
                if(user.email === "olimakl@gmail.com") document.getElementById('admin-menu-link').classList.replace('hidden', 'flex');
            } else {
                header.classList.add('hidden');
                this.navigate('login');
            }
        });
    },

    loadUsers() {
        onSnapshot(query(collection(db, "usuarios"), orderBy("nome", "asc")), (snap) => {
            // Preencher Filtro Dashboard
            const fAss = document.getElementById('filter-assignee');
            if (fAss) {
                fAss.innerHTML = '<option value="Todos">Responsáveis</option>' + snap.docs.map(d => `<option value="${d.data().nome}">${d.data().nome}</option>`).join('');
            }
            
            // Preencher Checkboxes de Nova Tarefa
            const cbContainer = document.getElementById('task-assignees-checkboxes');
            if (cbContainer) {
                cbContainer.innerHTML = '';
                snap.forEach(d => {
                    const nome = d.data().nome;
                    const id = `cb-${d.id}`;
                    cbContainer.innerHTML += `
                        <label for="${id}" class="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                            <input type="checkbox" id="${id}" value="${nome}" class="task-assignee-cb w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer">
                            <span class="text-sm font-bold text-slate-700 dark:text-slate-300">${nome}</span>
                        </label>
                    `;
                });
            }
        });
    },

    async handleCreateTask() {
        const title = document.getElementById('task-title').value;
        const btn = document.getElementById('save-task-btn');
        if(!title) { alert("O título é obrigatório!"); return; }

        // Captura todos os checkboxes selecionados
        const checkboxes = document.querySelectorAll('.task-assignee-cb:checked');
        const assignees = Array.from(checkboxes).map(cb => cb.value);
        
        btn.innerText = "A criar..."; btn.disabled = true;
        
        try {
            await addDoc(collection(db, "tarefas"), {
                title,
                description: document.getElementById('task-desc').value,
                sector: document.getElementById('task-sector').value,
                priority: document.getElementById('task-priority-droplist').value, // Novo Droplist
                assignees: assignees,
                status: "Em aberto",
                createdAt: serverTimestamp(),
                createdBy: auth.currentUser.uid,
                dueDate: document.getElementById('task-date').value
            });
            
            // Limpa o formulário após criar
            document.getElementById('task-title').value = '';
            document.getElementById('task-desc').value = '';
            document.getElementById('task-date').value = '';
            document.getElementById('task-priority-droplist').value = 'medium';
            document.querySelectorAll('.task-assignee-cb').forEach(cb => cb.checked = false);

            this.darVerde(btn, "Criar Tarefa", "Criada com sucesso!");
            setTimeout(() => { btn.disabled = false; this.navigate('dashboard'); }, 1000);
        } catch(e) {
            alert("Erro ao criar tarefa.");
            btn.innerText = "Criar Tarefa"; btn.disabled = false;
        }
    },

    // --- RESTANTE INTACTO (DASHBOARD, PERFIL, ETC) ---
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
        const nome = document.getElementById('profile-name-input').value;
        const cargo = document.getElementById('profile-cargo-input').value;
        const setor = document.getElementById('profile-sector-input').value;
        const bio = document.getElementById('profile-bio-input').value;
        const foto = this.tempPhotoBase64 || user.photoURL;

        btn.innerText = "A guardar...";
        try {
            await updateProfile(user, { displayName: nome, photoURL: foto });
            await setDoc(doc(db, "usuarios", user.uid), { nome, cargo, setor, bio, foto, email: user.email }, { merge: true });
            this.darVerde(btn, "Guardar Alterações", "Atualizado!");
            setTimeout(() => { this.updateAvatar(user); this.navigate('dashboard'); }, 1000);
        } catch(e) { alert("Erro ao salvar perfil."); btn.innerText = "Guardar Alterações"; }
    },

    listenToTasks() {
        onSnapshot(query(collection(db, "tarefas"), orderBy("createdAt", "desc")), (snap) => {
            this.allTasks = snap.docs; this.renderDashboard();
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
                div.className = "p-4 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-800 mb-1 cursor-pointer flex justify-between items-center transition-all hover:border-primary/50";
                div.onclick = () => this.navigate('detalhes', docSnap.id);
                div.innerHTML = `<div><span class="font-bold text-slate-900 dark:text-white">${t.title}</span><div class="flex items-center gap-2 mt-1 text-[10px] uppercase font-black"><span class="text-primary">${t.sector || 'Geral'}</span><span class="text-slate-400">| ${t.assignees?.join(', ') || 'Equipa'}</span></div></div><span class="text-[10px] font-black uppercase px-2 py-1 rounded-full ${p.bg} text-white">${p.label}</span>`;
                container.appendChild(div);
            }
        });
    },

    renderDetails(id) {
        this.currentTaskId = id;
        const cont = document.getElementById('details-view-content');
        getDoc(doc(db, "tarefas", id)).then(d => {
            const t = d.data();
            const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low;
            cont.innerHTML = `<div class="p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border dark:border-slate-800"><div class="flex items-center justify-between mb-4"><span class="px-2 py-1 rounded text-[10px] font-black uppercase text-white ${p.bg}">${p.label}</span><button onclick="app.navigate('dashboard')" class="bg-slate-100 dark:bg-slate-800 p-2 rounded-xl text-slate-500 hover:text-primary"><span class="material-symbols-outlined">close</span></button></div><h1 class="text-3xl font-black mb-2">${t.title}</h1><p class="mb-8 text-slate-500 whitespace-pre-line">${t.description || 'Sem descrição'}</p><div class="flex items-center gap-4 text-[11px] font-black uppercase text-slate-400 border-t dark:border-slate-800 pt-4"><div class="flex items-center gap-1 text-primary"><span class="material-symbols-outlined text-sm">group</span> ${t.assignees?.join(', ') || 'Equipa'}</div><div class="flex items-center gap-1"><span class="material-symbols-outlined text-sm">domain</span> ${t.sector || '---'}</div></div></div>`;
        });
    },

    updateAvatar(user) {
        const av = document.getElementById('header-avatar');
        if(user.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${user.photoURL}')`; }
        else av.innerText = (user.displayName || user.email).substring(0,2).toUpperCase();
    },

    darVerde(btn, original, sucesso) { if(!btn) return; btn.innerText = sucesso; btn.classList.add('bg-green-600'); setTimeout(() => { btn.innerText = original; btn.classList.remove('bg-green-600'); }, 2000); },
    closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); }
};

window.app = app;
app.init();
