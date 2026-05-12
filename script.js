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
    filters: { status: "Todas", sector: "Todos", assignee: "Todos", search: "" },
    allTasks: [],

    init() {
        this.bindEvents();
        this.checkAuth();
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
            const btn = e.target.querySelector('button');
            btn.innerText = "Entrando...";
            try {
                await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value);
            } catch(err) { alert("Erro no login."); btn.innerText = "Entrar"; }
        });

        document.getElementById('logout-btn').onclick = () => signOut(auth);
        document.getElementById('search-input').oninput = (e) => { this.filters.search = e.target.value; this.renderDashboard(); };

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.filters.status = btn.dataset.filter;
                this.renderDashboard();
            };
        });

        document.getElementById('save-task-btn').onclick = () => this.handleCreateTask();
        document.getElementById('save-profile-btn').onclick = () => this.handleSaveProfile();
        
        document.getElementById('profile-btn').onclick = (e) => { 
            e.stopPropagation(); 
            document.getElementById('profile-menu').classList.toggle('hidden'); 
        };
        document.addEventListener('click', () => document.getElementById('profile-menu').classList.add('hidden'));
    },

    checkAuth() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                document.getElementById('main-header').classList.replace('hidden', 'flex');
                this.updateAvatar(user);
                this.listenToTasks();
                this.loadUsers();
                this.navigate('dashboard');
                if(user.email === "olimakl@gmail.com") document.getElementById('admin-menu-link').classList.replace('hidden', 'flex');
            } else {
                document.getElementById('main-header').classList.add('hidden');
                this.navigate('login');
            }
        });
    },

    listenToTasks() {
        onSnapshot(query(collection(db, "tarefas"), orderBy("createdAt", "desc")), (snap) => {
            this.allTasks = snap.docs;
            this.renderDashboard();
        });
    },

    renderDashboard() {
        const container = document.getElementById('tasks-container');
        if(!container) return;
        container.innerHTML = '';
        this.allTasks.forEach(docSnap => {
            const t = docSnap.data();
            const mSearch = (t.title || "").toLowerCase().includes(this.filters.search.toLowerCase());
            const mStat = this.filters.status === "Todas" || t.status === this.filters.status;
            if(mSearch && mStat) {
                const div = document.createElement('div');
                div.className = "p-4 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-800 mb-1 cursor-pointer flex justify-between items-center";
                div.onclick = () => this.navigate('detalhes', docSnap.id);
                div.innerHTML = `<div><span class="font-bold">${t.title}</span><p class="text-xs text-slate-500">${t.sector || 'Geral'}</p></div><span class="text-[10px] font-black uppercase px-2 py-1 rounded bg-primary text-white">${t.status}</span>`;
                container.appendChild(div);
            }
        });
        this.renderRanking();
    },

    async handleCreateTask() {
        const title = document.getElementById('task-title').value;
        if(!title) return;
        await addDoc(collection(db, "tarefas"), {
            title,
            description: document.getElementById('task-desc').value,
            sector: document.getElementById('task-sector').value,
            priority: document.querySelector('input[name="priority"]:checked').value,
            status: "Em aberto",
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser.uid
        });
        this.navigate('dashboard');
    },

    async handleSaveProfile() {
        const user = auth.currentUser;
        const n = document.getElementById('profile-name-input').value;
        const f = document.getElementById('profile-photo-input').value;
        await updateProfile(user, { displayName: n, photoURL: f });
        await setDoc(doc(db, "usuarios", user.uid), { nome: n, foto: f }, { merge: true });
        this.navigate('dashboard');
    },

    renderDetails(id) {
        this.currentTaskId = id;
        const cont = document.getElementById('details-view-content');
        getDoc(doc(db, "tarefas", id)).then(d => {
            const t = d.data();
            cont.innerHTML = `<div class="p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-xl">
                <h1 class="text-3xl font-black mb-4">${t.title}</h1>
                <p class="mb-8">${t.description || 'Sem descrição'}</p>
                <button onclick="app.navigate('dashboard')" class="bg-primary text-white px-6 py-2 rounded-xl">Voltar</button>
            </div>`;
        });
    },

    renderRanking() {
        const rc = document.getElementById('ranking-container'); if(!rc) return;
        rc.innerHTML = '<p class="text-center text-xs text-slate-500 italic">Ranking em tempo real</p>';
    },

    closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); },
    updateAvatar(user) { const av = document.getElementById('header-avatar'); if(user.photoURL) { av.innerText = ''; av.style.backgroundImage = `url('${user.photoURL}')`; } else av.innerText = (user.displayName || user.email).substring(0,2).toUpperCase(); },
    loadUsers() { /* Carregar lista de usuários para selects */ },
    loadProfileData() { /* Carregar dados do perfil */ }
};

window.app = app;
app.init();
