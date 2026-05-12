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
        // Login
        document.getElementById('login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button'); btn.innerText = "A entrar...";
            try { await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); } 
            catch(err) { alert("Erro no login."); btn.innerText = "Entrar"; }
        });

        // Logout e Pesquisa
        document.getElementById('logout-btn').onclick = () => signOut(auth);
        document.getElementById('search-input').oninput = (e) => { this.filters.search = e.target.value; this.renderDashboard(); };

        // Filtros
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.filters.status = btn.dataset.filter; this.renderDashboard();
            };
        });

        // Upload de Foto (Base64)
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

        // UI
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
                this.navigate('dashboard');
                // Admin Access (Ajuste seu email aqui)
                if(user.email === "olimakl@gmail.com") document.getElementById('admin-menu-link').classList.replace('hidden', 'flex');
            } else {
                header.classList.add('hidden');
                this.navigate('login');
            }
        });
    },

    async loadProfileData() {
        const u = auth.currentUser;
        if(!u) return;
        const d = await getDoc(doc(db, "usuarios", u.uid));
        const data = d.data() || {};

        document.getElementById('profile-name-input').value = u.displayName || "";
        document.getElementById('profile-cargo-input').value = data.cargo || "";
        document.getElementById('profile-sector-input').value = data.setor || "Logística";
        document.getElementById('profile-bio-input').value = data.bio || "";
        document.getElementById('profile-page-name').innerText = u.displayName || "Usuário";
        document.getElementById('profile-page-email').innerText = u.email;
        
        const av = document.getElementById('profile-page-avatar');
        const photo = u.photoURL;
        if(photo) { av.style.backgroundImage = `url('${photo}')`; av.innerText = ''; }
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
            await setDoc(doc(db, "usuarios", user.uid), { 
                nome, cargo, setor, bio, foto, email: user.email 
            }, { merge: true });
            
            this.darVerde(btn, "Guardar Alterações", "Atualizado!");
            setTimeout(() => { this.updateAvatar(user); this.navigate('dashboard'); }, 1000);
        } catch(e) { alert("Erro ao salvar perfil."); btn.innerText = "Guardar Alterações"; }
    },

    // --- REUTILIZÁVEIS ---
    listenToTasks() {
        onSnapshot(query(collection(db, "tarefas"), orderBy("createdAt", "desc")), (snap) => {
            this.allTasks = snap.docs;
            this.renderDashboard();
            this.loadFilterUsers();
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
                const div = document.createElement('div');
                div.className = "p-4 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-800 mb-1 cursor-pointer flex justify-between items-center transition-all hover:border-primary/50";
                div.onclick = () => this.navigate('detalhes', docSnap.id);
                div.innerHTML = `<div><span class="font-bold">${t.title}</span><p class="text-[10px] text-slate-500 uppercase font-black">${t.sector || 'Geral'}</p></div><span class="text-[10px] font-black uppercase px-2 py-1 rounded bg-primary text-white">${t.status}</span>`;
                container.appendChild(div);
            }
        });
    },

    updateAvatar(user) {
        const av = document.getElementById('header-avatar');
        if(user.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${user.photoURL}')`; }
        else av.innerText = (user.displayName || user.email).substring(0,2).toUpperCase();
    },

    darVerde(btn, original, sucesso) { if(!btn) return; btn.innerText = sucesso; btn.classList.add('bg-green-600'); setTimeout(() => { btn.innerText = original; btn.classList.remove('bg-green-600'); }, 2000); },
    closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); },
    loadFilterUsers() { /* Carregar responsáveis dinâmicos... */ }
};

window.app = app;
app.init();
