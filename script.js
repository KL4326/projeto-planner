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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- DETECÇÃO DE PÁGINA PARA VERCEL ---
const path = window.location.pathname;
const isLoginPage = path.includes("login");
const isRegisterPage = path.includes("cadastro");
const isIndexPage = path === "/" || path.includes("index") || path.endsWith("/");
const isDetailsPage = path.includes("detalhes-tarefa");
const isNewTaskPage = path.includes("nova-tarefa");
const isProfilePage = path.includes("perfil");
const isAdminPage = path.includes("admin");

const initTheme = () => {
    const t = localStorage.getItem('theme') || 'dark';
    document.documentElement.classList.toggle('dark', t === 'dark');
};
initTheme();

const CONFIG = {
    prioridades: { high: { label: 'Alta', bg: 'bg-red-500' }, medium: { label: 'Média', bg: 'bg-orange-500' }, low: { label: 'Baixa', bg: 'bg-yellow-500' } },
    statusIcons: { 'Concluída': 'check_circle', 'Em andamento': 'directions_run', 'Cancelada': 'close', 'Em aberto': 'schedule' }
};

const darFeedback = (btn, original, sucesso) => {
    btn.innerText = sucesso; btn.classList.replace('bg-primary', 'bg-green-500'); btn.disabled = true;
    setTimeout(() => { btn.innerText = original; btn.classList.replace('bg-green-500', 'bg-primary'); btn.disabled = false; }, 2000);
};

const carregarUsers = (id) => {
    const el = document.getElementById(id); if (!el) return;
    onSnapshot(query(collection(db, "usuarios"), orderBy("nome", "asc")), (snap) => {
        const val = el.value; el.innerHTML = el.id === 'filter-assignee' ? '<option value="Todos">Todos os Responsáveis</option>' : '';
        snap.forEach(d => { const opt = document.createElement('option'); opt.value = d.data().nome; opt.textContent = d.data().nome; el.appendChild(opt); });
        el.value = val || el.options[0]?.value;
    });
};

// --- AUTH GLOBAL ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (isLoginPage) window.location.href = "index.html";
        const al = document.getElementById('admin-menu-link');
        const adminEmail = "@olimakl"; // Ajuste seu handle ou email real aqui
        if (al && user.email === "olimakl@gmail.com") { al.classList.remove('hidden'); al.classList.add('flex'); }
        
        const pb = document.getElementById('profile-btn');
        if (pb) {
            const init = (user.displayName || user.email).substring(0,2).toUpperCase();
            pb.innerHTML = user.photoURL ? `<div class="size-10 rounded-full bg-cover bg-center border-2 border-primary/20" style="background-image:url('${user.photoURL}')"></div>` : `<div class="size-10 rounded-full bg-primary text-white flex items-center justify-center font-bold border-2 border-primary/20">${init}</div>`;
            pb.innerHTML += `<span class="material-symbols-outlined text-slate-400">expand_more</span>`;
        }

        if (isProfilePage) {
            const nInp = document.getElementById('profile-name'), pInp = document.getElementById('profile-photo'), bInp = document.getElementById('profile-bio');
            if (nInp) {
                nInp.value = user.displayName || ""; pInp.value = user.photoURL || ""; document.getElementById('profile-display-name').innerText = user.displayName || "Usuário";
                document.getElementById('profile-display-email').innerText = user.email;
                const d = await getDoc(doc(db, "usuarios", user.uid));
                if (d.exists()) bInp.value = d.data().bio || "";
                const prev = document.getElementById('profile-preview');
                if(user.photoURL) { prev.style.backgroundImage = `url('${user.photoURL}')`; prev.innerText = ''; }
                else prev.innerText = (user.displayName || 'U').substring(0,2).toUpperCase();
            }
        }
    } else {
        if (!isLoginPage && !isRegisterPage) window.location.href = "login.html";
    }
});

// --- LÓGICA DE LOGIN ---
if (isLoginPage) {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('email-input').value;
            const pass = document.getElementById('password-input').value;
            try { await signInWithEmailAndPassword(auth, email, pass); } catch (e) { alert("Credenciais incorretas."); }
        };
    }
}

// --- DASHBOARD (FILTROS AZUIS + COROAS) ---
if (isIndexPage) {
    const tasksContainer = document.getElementById('tasks-container');
    const searchInput = document.getElementById('search-input');
    if (tasksContainer) {
        let fStat = "Todas", fSect = "Todos", fAssign = "Todos", fSearch = "", data = [];
        const render = () => {
            tasksContainer.innerHTML = ''; let count = 0;
            data.forEach(snap => {
                const t = snap.data();
                const mSearch = t.title.toLowerCase().includes(fSearch.toLowerCase());
                const mStat = fStat === "Todas" || t.status === fStat;
                const mSect = fSect === "Todos" || t.sector === fSect;
                const mAssign = fAssign === "Todos" || (t.assignees && t.assignees.includes(fAssign));
                if (mSearch && mStat && mSect && mAssign) {
                    count++; const p = CONFIG.prioridades[t.priority] || CONFIG.prioridades.low; const icon = CONFIG.statusIcons[t.status] || 'schedule';
                    const dateVal = t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-PT') : 'Sem prazo';
                    tasksContainer.innerHTML += `<div onclick="if(!event.target.closest('.complete-task-btn')) window.location.href='detalhes-tarefa.html?id=${snap.id}'" class="flex items-center justify-between p-4 bg-white dark:bg-slate-800/60 rounded-xl border dark:border-slate-800 mb-2 cursor-pointer group shadow-sm transition-all hover:border-primary/40"><div class="flex items-center gap-4 flex-1"><button data-id="${snap.id}" class="complete-task-btn p-2 rounded-lg ${t.status==='Concluída'?'text-green-500 bg-green-500/10':'text-slate-400 bg-slate-100 dark:bg-slate-700'}"><span class="material-symbols-outlined">${icon}</span></button><div class="flex flex-col"><span class="font-bold text-slate-900 dark:text-slate-100">${t.title}</span><div class="flex items-center gap-2 mt-1 text-[10px] font-bold uppercase"><span class="text-primary font-black">${t.sector || '---'}</span><span class="text-slate-400">| ${t.assignees?.join(', ') || '---'}</span><span class="text-slate-400">| ${dateVal}</span></div></div></div><span class="px-3 py-1 ${p.bg} text-white text-[10px] font-black rounded-full uppercase">${p.label}</span></div>`;
                }
            });
            if (count === 0) tasksContainer.innerHTML = '<p class="text-center py-10 text-slate-400 italic">Nenhuma tarefa encontrada.</p>';
        };
        onSnapshot(query(collection(db, "tarefas"), orderBy("createdAt", "desc")), (snap) => {
            data = snap.docs; render();
            const rc = document.getElementById('ranking-container');
            if(rc) {
                const pts = {}; data.forEach(d => { if(d.data().status === "Concluída") (d.data().assignees || ["Equipe"]).forEach(p => pts[p] = (pts[p] || 0) + 1); });
                const sorted = Object.entries(pts).sort((a,b)=>b[1]-a[1]); rc.innerHTML = sorted.length ? '' : '<p class="text-center py-4 text-xs">Sem pontos.</p>';
                sorted.forEach(([n, p], i) => {
                    const pos = i + 1; let crown = "";
                    if(pos <= 3) { const corC = pos === 1 ? "text-yellow-500" : pos === 2 ? "text-slate-400" : "text-amber-600"; crown = `<svg class="w-4 h-4 ${corC} ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19V18H19V19Z"/></svg>`; }
                    rc.innerHTML += `<div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border dark:border-slate-800 mb-1"><div class="flex items-center gap-3"><span class="font-black text-slate-400 w-5 text-center text-xs">${pos}º</span><div class="flex items-center gap-1"><span class="text-sm font-bold text-slate-700 dark:text-slate-200">${n}</span>${crown}</div></div><span class="font-black text-green-600 text-[10px] bg-green-500/10 px-2 py-0.5 rounded">${p} pts</span></div>`;
                });
            }
        });
        if(searchInput) searchInput.oninput = (e) => { fSearch = e.target.value; render(); };
        document.querySelectorAll('.filter-btn').forEach(btn => btn.onclick = () => {
            document.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('bg-primary','text-white'); b.classList.add('bg-slate-100','dark:bg-slate-800','text-slate-600','dark:text-slate-300'); });
            btn.classList.remove('bg-slate-100','dark:bg-slate-800','text-slate-600','dark:text-slate-300'); btn.classList.add('bg-primary','text-white'); fStat = btn.dataset.filter; render();
        });
        carregarUsers('filter-assignee');
        document.getElementById('filter-sector').onchange = (e) => { fSect = e.target.value; render(); };
        document.getElementById('filter-assignee').onchange = (e) => { fAssign = e.target.value; render(); };
        tasksContainer.addEventListener('click', async (e) => { const b = e.target.closest('.complete-task-btn'); if (b && !b.classList.contains('text-green-500')) { b.querySelector('span').classList.add('animate-spin'); await updateDoc(doc(db, "tarefas", b.dataset.id), { status: "Concluída" }); } });
    }
}

// --- NOVA TAREFA (SALVAR) ---
if (isNewTaskPage) {
    carregarUsers('task-assignees');
    const saveBtn = document.getElementById('save-task-btn');
    saveBtn?.addEventListener('click', async () => {
        const t = document.getElementById('task-title').value;
        const sel = Array.from(document.getElementById('task-assignees').selectedOptions).map(o => o.value);
        if (!t) return alert("Título obrigatório!");
        
        saveBtn.innerText = "Criando..."; saveBtn.disabled = true;
        try {
            await addDoc(collection(db, "tarefas"), { title: t, description: document.getElementById('task-desc').value, sector: document.getElementById('task-sector').value, priority: document.querySelector('input[name="priority"]:checked').value, assignees: sel, status: "Em aberto", createdAt: serverTimestamp(), createdBy: auth.currentUser.uid, dueDate: document.getElementById('task-date').value });
            window.location.href = "index.html";
        } catch (err) { alert("Erro ao criar tarefa."); saveBtn.disabled = false; saveBtn.innerText = "Criar Tarefa"; }
    });
}

// --- PERFIL (SALVAR) ---
if (isProfilePage) {
    const spBtn = document.getElementById('save-profile-btn');
    spBtn?.addEventListener('click', async () => {
        const user = auth.currentUser;
        if(!user) return;
        
        const n = document.getElementById('profile-name').value;
        const f = document.getElementById('profile-photo').value;
        const b = document.getElementById('profile-bio').value;

        try {
            await updateProfile(user, { displayName: n, photoURL: f });
            await setDoc(doc(db, "usuarios", user.uid), { nome: n, foto: f, bio: b }, { merge: true });
            darFeedback(spBtn, "Guardar Alterações", "Guardado!");
            setTimeout(() => window.location.href = "index.html", 1500);
        } catch (e) { alert("Erro ao salvar perfil."); }
    });

    document.getElementById('change-password-page-btn')?.addEventListener('click', async () => {
        if(auth.currentUser) {
            await sendPasswordResetEmail(auth, auth.currentUser.email);
            alert("E-mail de redefinição enviado!");
        }
    });
}

// --- DETALHES ---
if (isDetailsPage) {
    const urlParams = new URLSearchParams(window.location.search), taskId = urlParams.get('id'), docRef = doc(db, "tarefas", taskId);
    let curTask = {}, activeSid = null, unSubChat = null, editSubId = null;
    carregarUsers('sub-assignees'); carregarUsers('edit-assignees');

    onSnapshot(docRef, (d) => {
        if (!d.exists()) return; curTask = d.data();
        document.getElementById('detail-title').innerText = curTask.title; document.getElementById('detail-desc').innerText = curTask.description || "";
        document.getElementById('detail-assignees').innerText = curTask.assignees?.join(', ') || '---';
        document.getElementById('detail-sector').innerText = curTask.sector?.toUpperCase() || '---';
        document.getElementById('detail-due-date').innerText = curTask.dueDate ? new Date(curTask.dueDate).toLocaleDateString('pt-PT') : 'Sem prazo';
        document.getElementById('quick-status-select').value = curTask.status;
        const p = CONFIG.prioridades[curTask.priority] || CONFIG.prioridades.low;
        document.getElementById('detail-tags').innerHTML = `<span class="px-2 py-0.5 rounded text-[10px] font-black uppercase text-white ${p.bg}">${p.label}</span>`;
    });

    const qsBtn = document.getElementById('quick-status-save');
    if(qsBtn) qsBtn.onclick = async () => { await updateDoc(docRef, { status: document.getElementById('quick-status-select').value }); darFeedback(qsBtn, "Salvar Status", "Atualizado!"); };

    const fChat = async () => { 
        const ci = document.getElementById('chat-input'); if(!ci.value.trim()) return;
        await addDoc(collection(db, "tarefas", taskId, "comentarios"), { text: ci.value, authorName: auth.currentUser.displayName || auth.currentUser.email.split('@')[0], createdBy: auth.currentUser.uid, createdAt: serverTimestamp() }); ci.value = '';
    };
    document.getElementById('send-chat-btn')?.addEventListener('click', fChat);
    document.getElementById('chat-input')?.addEventListener('keydown', (e) => { if(e.key === 'Enter') fChat(); });

    onSnapshot(query(collection(db, "tarefas", taskId, "comentarios"), orderBy("createdAt", "asc")), (snap) => {
        const ct = document.getElementById('chat-container'); if(!ct) return; ct.innerHTML = '';
        snap.forEach(c => { const isMe = c.data().createdBy === auth.currentUser.uid; ct.innerHTML += `<div class="flex flex-col ${isMe?'items-end':'items-start'} mb-4"><span class="text-[10px] text-slate-500">${c.data().authorName}</span><div class="${isMe?'bg-primary text-white':'bg-slate-100 dark:bg-slate-800'} p-3 rounded-lg text-sm shadow-sm">${c.data().text}</div></div>`; });
        ct.scrollTop = ct.scrollHeight;
    });

    const openSub = async (id) => {
        activeSid = id; const d = (await getDoc(doc(db, "tarefas", taskId, "subtarefas", id))).data();
        document.getElementById('view-sub-title').innerText = d.title; document.getElementById('view-sub-desc').innerText = d.description || "";
        document.getElementById('view-sub-assignees-list').innerText = d.assignees?.join(', ') || 'Ninguém';
        document.getElementById('view-sub-date-val').innerText = d.dueDate ? new Date(d.dueDate).toLocaleDateString('pt-PT') : 'Sem prazo';
        const pTrad = d.priority === 'high' ? 'Alta' : d.priority === 'medium' ? 'Média' : 'Baixa';
        document.getElementById('view-sub-meta').innerText = `Prioridade: ${pTrad}`;
        document.getElementById('view-subtask-modal').classList.replace('hidden', 'flex');
        if (unSubChat) unSubChat();
        unSubChat = onSnapshot(query(collection(db, "tarefas", taskId, "subtarefas", id, "comentarios"), orderBy("createdAt", "asc")), (snap) => {
            const sct = document.getElementById('sub-chat-container'); sct.innerHTML = '';
            snap.forEach(c => { const isMe = c.data().createdBy === auth.currentUser.uid; sct.innerHTML += `<div class="flex flex-col ${isMe?'items-end':'items-start'} mb-2"><span class="text-[9px] text-slate-500">${c.data().authorName}</span><div class="${isMe?'bg-primary text-white':'bg-slate-200 dark:bg-slate-800'} p-2 rounded-lg text-xs">${c.data().text}</div></div>`; });
            sct.scrollTop = sct.scrollHeight;
        });
    };

    document.getElementById('delete-sub-btn')?.addEventListener('click', async () => { if(confirm("Excluir subtarefa?")) { await deleteDoc(doc(db, "tarefas", taskId, "subtarefas", activeSid)); document.getElementById('view-subtask-modal').classList.add('hidden'); } });
    
    document.getElementById('edit-sub-trigger-btn')?.addEventListener('click', async () => {
        editSubId = activeSid; const d = (await getDoc(doc(db, "tarefas", taskId, "subtarefas", activeSid))).data();
        document.getElementById('subtask-modal-title').innerText = "Editar Subtarefa"; document.getElementById('save-subtask-btn').innerText = "Salvar";
        document.getElementById('sub-title').value = d.title; document.getElementById('sub-desc').value = d.description || "";
        document.getElementById('sub-priority').value = d.priority || "low"; document.getElementById('sub-date').value = d.dueDate || "";
        document.getElementById('view-subtask-modal').classList.replace('flex', 'hidden'); document.getElementById('subtask-modal').classList.replace('hidden', 'flex');
    });

    onSnapshot(query(collection(db, "tarefas", taskId, "subtarefas"), orderBy("createdAt", "asc")), (snap) => {
        const sl = document.getElementById('subtasks-list'); if(!sl) return; sl.innerHTML = '';
        snap.forEach(sd => { const s = sd.data(); const dv = document.createElement('div'); dv.className = "flex items-center gap-4 px-6 py-4 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer border-b dark:border-slate-800"; dv.innerHTML = `<input type="checkbox" ${s.completed?'checked':''} class="sc" data-id="${sd.id}"><div class="flex-1 tv" data-id="${sd.id}"><p class="font-bold ${s.completed?'line-through opacity-50':''} text-slate-700 dark:text-slate-200">${s.title}</p></div>`; sl.appendChild(dv); });
        document.querySelectorAll('.tv').forEach(el => el.onclick = () => openSub(el.dataset.id));
        document.querySelectorAll('.sc').forEach(el => el.onclick = (e) => { e.stopPropagation(); updateDoc(doc(db, "tarefas", taskId, "subtarefas", el.dataset.id), { completed: el.checked }); });
        document.getElementById('subtasks-progress').innerText = `${snap.docs.filter(d=>d.data().completed).length}/${snap.size}`;
    });

    document.getElementById('save-subtask-btn')?.addEventListener('click', async () => {
        const t = document.getElementById('sub-title').value; if(!t) return;
        const sel = Array.from(document.getElementById('sub-assignees').selectedOptions).map(o => o.value);
        const dds = { title: t, description: document.getElementById('sub-desc').value, assignees: sel, priority: document.getElementById('sub-priority').value, dueDate: document.getElementById('sub-date').value };
        if(editSubId) await updateDoc(doc(db, "tarefas", taskId, "subtarefas", editSubId), dds);
        else await addDoc(collection(db, "tarefas", taskId, "subtarefas"), { ...dds, completed: false, createdAt: serverTimestamp() });
        document.getElementById('subtask-modal').classList.replace('flex', 'hidden');
    });

    document.getElementById('edit-task-btn')?.addEventListener('click', () => { document.getElementById('edit-title').value = curTask.title; document.getElementById('edit-desc').value = curTask.description || ""; document.getElementById('edit-modal').classList.replace('hidden', 'flex'); });
    
    document.getElementById('save-edit-btn')?.addEventListener('click', async () => {
        const sel = Array.from(document.getElementById('edit-assignees').selectedOptions).map(o => o.value);
        await updateDoc(docRef, { title: document.getElementById('edit-title').value, description: document.getElementById('edit-desc').value, priority: document.getElementById('edit-priority').value, assignees: sel.length ? sel : curTask.assignees, sector: document.getElementById('edit-sector').value, dueDate: document.getElementById('edit-date').value });
        darFeedback(document.getElementById('save-edit-btn'), "Salvar Alterações", "Guardado!"); setTimeout(() => document.getElementById('edit-modal').classList.add('hidden'), 1500);
    });

    document.getElementById('delete-task-btn')?.addEventListener('click', async () => { if(confirm("Apagar tarefa?")) { await deleteDoc(docRef); window.location.href="index.html"; } });
    
    document.querySelectorAll('#close-edit-modal, #cancel-edit-btn, #close-subtask-modal, #cancel-subtask-btn, #close-view-subtask, #open-subtask-modal').forEach(b => {
        b.onclick = () => {
            if(b.id === 'open-subtask-modal') { editSubId = null; document.getElementById('subtask-modal-title').innerText = "Nova Subtarefa"; document.getElementById('subtask-modal').classList.replace('hidden', 'flex'); }
            else { document.getElementById('edit-modal').classList.add('hidden'); document.getElementById('subtask-modal').classList.add('hidden'); document.getElementById('view-subtask-modal').classList.add('hidden'); }
        };
    });
}

// --- MENU & TEMA ---
document.querySelectorAll('.theme-toggle').forEach(b => b.onclick = () => { const isD = document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', isD ? 'dark' : 'light'); });
const pBtn = document.getElementById('profile-btn'), pMenu = document.getElementById('profile-menu');
if (pBtn) pBtn.onclick = (e) => { e.stopPropagation(); pMenu.classList.toggle('hidden'); };
document.onclick = () => pMenu?.classList.add('hidden');
