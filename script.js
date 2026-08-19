import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, onSnapshot, doc, getDoc, getDocs, deleteDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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

const app = {
    allTasks: [], 
    userMap: {},
    allLogs: [],
    allLockers: [],
    
    logFilter: 'Todos',
    logDateFilter: '',
    logOperatorFilter: 'Todos',
    
    lockerFilter: '1-andar',
    currentLockerId: null,
    editingLockerId: null,
    editingNotebookIndex: -1,
    movingNotebookIndex: -1,
    
    globalTasksUnsub: null,
    globalNotifsUnsub: null,
    globalUsersUnsub: null,
    lockersUnsub: null,

    init() { 
        this.bindEvents(); 
        this.checkAuth(); 
        this.initTheme(); 
    },
    
    initTheme() { 
        if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark'); 
        const savedColor = localStorage.getItem('primaryColor');
        if (savedColor) document.documentElement.style.setProperty('--color-primary', savedColor);
    },

    getTodayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    getUserData(val) {
        if (!val) return { nome: 'Desconhecido', foto: null, uid: '' };
        let u = app.userMap[val];
        if (!u) u = Object.values(app.userMap).find(x => x.nome === val);
        return u || { nome: val, foto: null, uid: val };
    },

    navigate(pageId) {
        // Esconde todas as seções e remove a classe active
        document.querySelectorAll('.page-section').forEach(s => {
            s.classList.remove('active');
            s.classList.add('hidden');
        });
        
        // Mostra apenas a seção alvo
        const target = document.getElementById(`page-${pageId}`);
        if(target) {
            target.classList.add('active');
            target.classList.remove('hidden');
        }
        
        // Atualiza a cor/estilo do botão ativo no menu lateral
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.className = "nav-btn text-left w-full flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant font-medium hover:bg-surface-container-high hover:text-primary transition-colors";
        });
        const activeBtn = document.getElementById(`nav-btn-${pageId}`);
        if(activeBtn) {
            activeBtn.className = "nav-btn text-left w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-container-high text-primary font-bold scale-95 transition-all";
        }
        
        // Renderiza os dados dependendo da tela aberta
        if(pageId === 'dashboard') { this.renderDashboard(); }
        if(pageId === 'armarios') { this.renderLockers(); }
        if(pageId === 'logbook') { this.renderLogbook(); }
        
        window.scrollTo(0,0);
    },

    async handleLogin(e) {
        if(e) e.preventDefault();
        try {
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            await signInWithEmailAndPassword(auth, email, pass);
        } catch(err) {
            app.showToast("Email ou senha incorretos", "error");
        }
    },

    bindEvents() {
        const lf = document.getElementById('login-form');
        if(lf) lf.addEventListener('submit', (e) => app.handleLogin(e));
    },

    checkAuth() { 
        onAuthStateChanged(auth, async (u) => { 
            const pLogin = document.getElementById('page-login'); 
            const appL = document.getElementById('app-layout'); 
            if(u){ 
                if(pLogin) pLogin.classList.add('hidden'); 
                if(appL) appL.classList.remove('hidden'); 
                
                try {
                    const ud = await getDoc(doc(db, "usuarios", u.uid));
                    let userName = u.displayName || u.email;
                    let userFoto = u.photoURL;

                    if(ud.exists()) {
                        const data = ud.data();
                        if(data.nome) userName = data.nome;
                        if(data.foto) userFoto = data.foto; 
                    }
                    
                    const sn = document.getElementById('sidebar-name');
                    if(sn) sn.innerText = userName;
                    app.updateAvatar(u, userFoto, userName);
                } catch(e) { console.error(e); }
                
                app.listenToTasks(); 
                app.loadUsers(); 
                app.listenToNotifications();
                app.listenToLockers();
                
                app.navigate('dashboard'); 
            } else { 
                if(pLogin) pLogin.classList.remove('hidden'); 
                if(appL) appL.classList.add('hidden'); 
            } 
        }); 
    },

    updateAvatar(u, fotoDb, name) { 
        const av = document.getElementById('sidebar-avatar'); 
        if(!av) return;
        const fotoReal = fotoDb || u.photoURL;
        const nomeReal = name || u.displayName || u.email;
        if(fotoReal) { 
            av.innerText = ''; 
            av.style.backgroundImage = `url('${fotoReal}')`; 
        } else { 
            av.innerText = nomeReal.substring(0,2).toUpperCase(); 
            av.style.backgroundImage = 'none';
        } 
    },

    /* =======================================
       DIÁRIO DE BORDO
    ======================================= */
    async addLog(msg, manualCategory = null) { 
        try { 
            await addDoc(collection(db, "notificacoes"), { 
                text: msg, 
                author: auth.currentUser.displayName || auth.currentUser.email, 
                ts: Date.now(),
                category: manualCategory,
                isManual: manualCategory !== null 
            }); 
        } catch(e) { console.error(e); } 
    },

    async saveManualLog() {
        const text = document.getElementById('log-text-inp').value;
        const cat = document.getElementById('log-category-inp').value;
        const editId = document.getElementById('edit-log-id').value;

        if(!text.trim()) { app.showToast("Escreva algo no registro", "error"); return; }
        
        try {
            if (editId) {
                await updateDoc(doc(db, "notificacoes", editId), { text: text, category: cat });
                app.showToast("Registro atualizado!");
            } else {
                await app.addLog(text, cat);
                app.showToast("Registro adicionado ao Diário!");
            }
            document.getElementById('modal-log-form').classList.add('hidden');
        } catch(e) { console.error(e); app.showToast("Erro ao salvar", "error"); }
    },

    async deleteLog(id) {
        if(confirm("Deseja realmente excluir este registro manual?")) {
            try {
                await deleteDoc(doc(db, "notificacoes", id));
                app.showToast("Registro excluído.");
            } catch(e) { console.error(e); app.showToast("Erro ao excluir", "error"); }
        }
    },

    openNewLogModal() {
        document.getElementById('edit-log-id').value = '';
        document.getElementById('log-text-inp').value = '';
        document.getElementById('log-category-inp').value = 'Logística';
        document.getElementById('modal-log-form').classList.remove('hidden');
    },

    openEditLog(id) {
        const log = app.allLogs.find(l => l.id === id);
        if(!log) return;
        document.getElementById('edit-log-id').value = id;
        document.getElementById('log-category-inp').value = log.category || 'Logística';
        document.getElementById('log-text-inp').value = log.text;
        document.getElementById('modal-log-form').classList.remove('hidden');
    },
    
    listenToNotifications() {
        if (app.globalNotifsUnsub) return;
        app.globalNotifsUnsub = onSnapshot(collection(db, "notificacoes"), snap => {
            app.allLogs = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.ts || 0) - (a.ts || 0));
            app.renderDashboardLogs();
            app.renderLogbook();
        });
    },

    renderDashboardLogs() {
        const dashList = document.getElementById('dashboard-log-list'); 
        if(!dashList) return;
        
        let dashHtml = '';
        app.allLogs.slice(0, 5).forEach(dt => {
            const time = dt.ts ? new Date(dt.ts).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'}) : '--:--';
            dashHtml += `
                <li class="p-4 hover:bg-surface-variant/30 transition-colors flex gap-4 border-b border-outline-variant/30">
                    <div class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center shrink-0 border border-outline-variant/50">
                        <span class="font-code-data text-xs text-primary-fixed-dim">${time}</span>
                    </div>
                    <div class="flex-1 pt-1">
                        <div class="flex items-baseline gap-2 mb-1">
                            <span class="font-code-data text-sm font-semibold text-on-surface">${dt.author || 'Sistema'}</span>
                        </div>
                        <p class="font-body-sm text-body-sm text-on-surface-variant truncate">${dt.text || ''}</p>
                    </div>
                </li>
            `;
        });
        dashList.innerHTML = dashHtml || '<p class="p-6 text-center text-xs text-on-surface-variant/50 italic">Nenhum log recente.</p>';
    },

    updateLogFilters() {
        this.logDateFilter = document.getElementById('log-date-filter').value;
        this.logOperatorFilter = document.getElementById('log-operator-filter').value;
        this.renderLogbook(); 
    },

    setLogFilter(filter) {
        this.logFilter = filter;
        document.querySelectorAll('.log-filter-btn').forEach(b => {
            if(b.id === `filter-${filter}`) {
                b.className = "log-filter-btn px-sm py-1 rounded-full border border-primary text-primary bg-primary-container/10 font-label-caps whitespace-nowrap";
            } else {
                b.className = "log-filter-btn px-sm py-1 rounded-full border border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface font-label-caps whitespace-nowrap transition-colors";
            }
        });
        this.renderLogbook(); 
    },

    renderLogbook() {
        const logbookList = document.getElementById('logbook-feed-list');
        const countBadge = document.getElementById('logbook-today-count');
        if(!logbookList) return;

        const isLogManual = (log) => {
            if (log.isManual) return true;
            const isAction = log.text && log.text.match(/^[➕✏️🗑️🔄✅⭕📎]/);
            return !isAction;
        };

        let filteredLogs = app.allLogs;
        
        if(app.logFilter === 'Manuais') {
            filteredLogs = filteredLogs.filter(l => isLogManual(l));
        } else if (app.logFilter !== 'Todos') {
            filteredLogs = filteredLogs.filter(l => {
                let cat = l.category || 'Logística';
                if (cat === 'Logistics') cat = 'Logística';
                if (cat === 'Maintenance') cat = 'Manutenção';
                if (cat === 'Incident') cat = 'Incidente';
                return cat === app.logFilter;
            });
        }

        if (app.logDateFilter) {
            filteredLogs = filteredLogs.filter(l => {
                const d = new Date(l.ts);
                const logDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return logDateStr === app.logDateFilter;
            });
        }

        if (app.logOperatorFilter && app.logOperatorFilter !== "Todos") {
            filteredLogs = filteredLogs.filter(l => l.author === app.logOperatorFilter);
        }

        let todayCount = 0;
        const todayStr = new Date().toDateString();
        let logbookHtml = '';

        filteredLogs.forEach(dt => {
            const dateObj = new Date(dt.ts);
            if(dateObj.toDateString() === todayStr) todayCount++;

            const time = dt.ts ? dateObj.toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'}) : '--:--';
            
            let category = dt.category || 'Logística';
            if (category === 'Logistics') category = 'Logística';
            if (category === 'Maintenance') category = 'Manutenção';
            if (category === 'Incident') category = 'Incidente';

            let title = 'Registro Manual';
            let colorClass = 'text-primary';
            let bgClass = 'bg-primary';
            let bgLightClass = 'bg-primary-container/10';

            const reallyManual = isLogManual(dt);

            if(!reallyManual) {
                const isAction = dt.text.match(/^[➕✏️🗑️🔄✅⭕📎]/);
                if(isAction) {
                    const icon = isAction[0];
                    if(icon === '➕') { title = 'Nova Demanda'; category = 'Logística'; }
                    else if(icon === '✏️' || icon === '🔄') { title = 'Atualização no Sistema'; category = 'Manutenção'; }
                    else if(icon === '🗑️') { title = 'Exclusão Registrada'; category = 'Incidente'; }
                    else if(icon === '✅') { title = 'Tarefa Concluída'; category = 'Logística'; }
                    else { title = 'Ação de Sistema'; }
                }
            }

            if(category === 'Manutenção') { colorClass = 'text-amber-400'; bgClass = 'bg-amber-400'; bgLightClass = 'bg-amber-400/10'; }
            if(category === 'Incidente') { colorClass = 'text-error'; bgClass = 'bg-error'; bgLightClass = 'bg-error-container/20'; }
            if(category === 'Logística') { colorClass = 'text-tertiary'; bgClass = 'bg-tertiary'; bgLightClass = 'bg-tertiary-container/20'; }

            const userL = app.getUserData(dt.author);
            let avatarHtml = `<div class="w-full h-full flex items-center justify-center bg-surface-variant text-on-surface text-[10px] font-bold">${(dt.author || 'S').substring(0,2).toUpperCase()}</div>`;
            if(userL.foto) { avatarHtml = `<img src="${userL.foto}" class="w-full h-full object-cover">`; }

            let actionBtns = '';
            if (reallyManual) {
                actionBtns = `
                    <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button onclick="app.openEditLog('${dt.id}')" class="p-1.5 bg-surface-container-high rounded-md text-on-surface-variant hover:text-primary transition-colors shadow-sm" title="Editar"><span class="material-symbols-outlined text-[16px]">edit</span></button>
                        <button onclick="app.deleteLog('${dt.id}')" class="p-1.5 bg-surface-container-high rounded-md text-on-surface-variant hover:text-error transition-colors shadow-sm" title="Excluir"><span class="material-symbols-outlined text-[16px]">delete</span></button>
                    </div>
                `;
            }

            logbookHtml += `
                <div class="bg-surface-container-low border border-outline-variant rounded-lg p-md shadow-sm relative overflow-hidden group hover:border-outline transition-colors">
                    <div class="absolute left-0 top-0 bottom-0 w-1 ${bgClass}"></div>
                    ${actionBtns}
                    <div class="flex justify-between items-start mb-sm pl-xs pr-14">
                        <div class="flex items-center gap-sm">
                            <span class="font-code-data text-on-surface-variant bg-surface-container px-2 py-1 rounded text-sm">${time}</span>
                            <div class="flex items-center gap-xs">
                                <div class="w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center border border-outline-variant overflow-hidden">
                                    ${avatarHtml}
                                </div>
                                <span class="font-body-sm text-on-surface font-medium">${dt.author || 'Sistema'}</span>
                            </div>
                        </div>
                        <span class="font-label-caps ${colorClass} ${bgLightClass} px-2 py-1 rounded flex items-center gap-xs">
                            <span class="w-1.5 h-1.5 rounded-full ${bgClass}"></span>
                            ${category}
                        </span>
                    </div>
                    <h3 class="font-title-md text-on-surface mb-xs pl-xs">${title}</h3>
                    <p class="font-body-sm text-on-surface-variant pl-xs whitespace-pre-wrap">${dt.text}</p>
                </div>
            `;
        });

        logbookList.innerHTML = logbookHtml || '<p class="p-6 text-center text-xs text-on-surface-variant/50 italic">Nenhum registro encontrado.</p>';
        if(countBadge) countBadge.innerText = todayCount;
    },

    /* =======================================
       GERENCIADOR DE ARMÁRIOS (LOCKERS)
    ======================================= */
    listenToLockers() {
        if(app.lockersUnsub) return;
        app.lockersUnsub = onSnapshot(collection(db, "armarios"), snap => {
            app.allLockers = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => a.name.localeCompare(b.name));
            if(document.getElementById('page-armarios').classList.contains('active')) {
                app.renderLockers();
                if(app.currentLockerId) app.renderNotebooks();
            }
        });
    },

    setLockerFilter(filter) {
        app.lockerFilter = filter;
        document.getElementById('locker-filter-1').className = filter === '1-andar' 
            ? "px-4 py-2 border border-primary text-primary bg-primary-container/10 rounded-lg shadow-sm font-bold transition-colors" 
            : "px-4 py-2 bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg shadow-sm font-bold hover:bg-surface-container-highest transition-colors";
        
        document.getElementById('locker-filter-2').className = filter === 'mezanino' 
            ? "px-4 py-2 border border-primary text-primary bg-primary-container/10 rounded-lg shadow-sm font-bold transition-colors" 
            : "px-4 py-2 bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg shadow-sm font-bold hover:bg-surface-container-highest transition-colors";
        
        app.renderLockers();
    },

    renderLockers() {
        const grid = document.getElementById('locker-grid');
        if(!grid) return;
        grid.innerHTML = ''; 

        app.allLockers.forEach((locker) => {
            if (app.lockerFilter !== 'todos' && locker.zoneClass !== app.lockerFilter) return;

            const itemsCount = locker.equipamentos ? locker.equipamentos.length : 0;
            const capacity = Math.min(Math.round((itemsCount / 15) * 100), 100); 

            grid.insertAdjacentHTML('beforeend', `
                <div class="glass-panel relative rounded-xl shadow-sm p-5 md:p-6 border hover:border-primary hover:-translate-y-1 transition-all cursor-pointer group" onclick="app.openLocker('${locker.id}')">
                    <div class="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="app.openLockerForm('${locker.id}', event)" class="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors" title="Editar"><span class="material-symbols-outlined text-[20px]">edit</span></button>
                        <button onclick="app.deleteLocker('${locker.id}', event)" class="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors" title="Excluir"><span class="material-symbols-outlined text-[20px]">delete</span></button>
                    </div>
                    <div class="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-surface-container-high text-primary flex items-center justify-center mb-4 md:mb-6 group-hover:bg-primary group-hover:text-white transition-all">
                        <span class="material-symbols-outlined text-2xl md:text-3xl">${locker.icon || 'door_back'}</span>
                    </div>
                    <h3 class="text-lg md:text-xl font-bold text-on-surface">${locker.name}</h3>
                    <p class="text-xs md:text-sm text-on-surface-variant mb-4 md:mb-6">${locker.desc || 'Sem descrição'}</p>
                    <div class="space-y-2 md:space-y-3 pt-3 md:pt-4 border-t border-outline-variant/50">
                        <div class="flex justify-between items-center text-[10px] md:text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                            <span>Ocupação</span><span class="text-primary">${capacity}%</span>
                        </div>
                        <div class="h-1.5 md:h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                            <div class="h-full bg-primary rounded-full transition-all" style="width: ${capacity}%"></div>
                        </div>
                    </div>
                </div>
            `);
        });

        grid.insertAdjacentHTML('beforeend', `
            <div onclick="app.openLockerForm(null, event)" class="border-2 border-dashed border-outline-variant rounded-xl p-5 md:p-6 flex flex-col items-center justify-center text-on-surface-variant hover:bg-surface-container-low hover:border-primary hover:text-primary transition-all cursor-pointer group min-h-[160px]">
                <span class="material-symbols-outlined text-3xl md:text-4xl mb-2 group-hover:scale-110 transition-transform">add_circle</span>
                <span class="font-bold text-sm md:text-base">Novo Armário</span>
            </div>
        `);
    },

    openLocker(id) {
        app.currentLockerId = id;
        const locker = app.allLockers.find(l => l.id === id);
        if(!locker) return;
        
        document.getElementById('modal-title').innerText = locker.name;
        document.getElementById('modal-subtitle').innerText = locker.zone;
        document.getElementById('locker-modal').classList.remove('hidden');
        app.renderNotebooks();
    },

    closeLocker() {
        document.getElementById('locker-modal').classList.add('hidden');
        app.currentLockerId = null;
    },

    openLockerForm(id, event) {
        if(event) event.stopPropagation(); 
        app.editingLockerId = id;
        
        if (id) {
            const locker = app.allLockers.find(l => l.id === id);
            document.getElementById('locker-form-title').innerText = "Editar Armário";
            document.getElementById('locker-form-name').value = locker.name;
            document.getElementById('locker-form-floor').value = locker.zone;
        } else {
            document.getElementById('locker-form-title').innerText = "Novo Armário";
            document.getElementById('locker-form-name').value = "";
            document.getElementById('locker-form-floor').value = "1º Andar";
        }
        document.getElementById('locker-form-modal').classList.remove('hidden');
    },

    closeLockerForm() {
        document.getElementById('locker-form-modal').classList.add('hidden');
    },

    async saveLockerForm() {
        const name = document.getElementById('locker-form-name').value;
        const floor = document.getElementById('locker-form-floor').value;
        const zoneClass = floor === '1º Andar' ? '1-andar' : 'mezanino';

        if (!name) return app.showToast("Preencha o nome do armário.", "error");

        try {
            if (app.editingLockerId) {
                await updateDoc(doc(db, "armarios", app.editingLockerId), {
                    name: name, zone: floor, zoneClass: zoneClass
                });
                app.showToast("Armário atualizado!");
                app.addLog(`✏️ Atualizou o armário: ${name}`);
            } else {
                await addDoc(collection(db, "armarios"), { 
                    name: name, zone: floor, zoneClass: zoneClass, desc: 'Sem descrição', icon: 'door_back', equipamentos: [] 
                });
                app.showToast("Armário criado!");
                app.addLog(`➕ Criou um novo armário: ${name}`);
            }
            app.closeLockerForm();
        } catch(e) { console.error(e); app.showToast("Erro ao salvar.", "error"); }
    },

    async deleteLocker(id, event) {
        event.stopPropagation();
        if(confirm("Tem certeza que deseja excluir este armário? Todos os itens dentro dele serão perdidos!")) {
            try {
                const l = app.allLockers.find(x => x.id === id);
                await deleteDoc(doc(db, "armarios", id));
                app.showToast("Armário excluído!");
                app.addLog(`🗑️ Excluiu o armário: ${l ? l.name : 'Desconhecido'}`);
            } catch(e) { console.error(e); app.showToast("Erro ao excluir", "error"); }
        }
    },

    renderNotebooks() {
        const list = document.getElementById('modal-item-list');
        const locker = app.allLockers.find(l => l.id === app.currentLockerId);
        if(!locker) return;

        const equips = locker.equipamentos || [];
        const capacity = Math.min(Math.round((equips.length / 15) * 100), 100);
        
        document.getElementById('modal-cap').innerText = capacity + '% da Cap.';
        document.getElementById('modal-progress').style.width = capacity + '%';

        list.innerHTML = `<div class="flex items-center justify-between mb-4"><h3 class="font-bold text-base md:text-lg text-on-surface">Itens no Armário (${equips.length}/15)</h3></div>`;

        equips.forEach((nb, index) => {
            list.insertAdjacentHTML('beforeend', `
                <div class="bg-surface-container rounded-xl p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 md:gap-4 border border-outline-variant/50 hover:border-primary/50 transition-all group">
                    <div class="flex items-center gap-4 w-full">
                        <div class="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-surface text-on-surface-variant flex items-center justify-center flex-shrink-0 border border-outline-variant/30">
                            <span class="material-symbols-outlined text-2xl md:text-3xl">laptop_mac</span>
                        </div>
                        <div class="flex-grow">
                            <div class="flex items-center gap-2 md:gap-3 mb-0.5 flex-wrap">
                                <h4 class="font-bold text-on-surface text-base md:text-lg">${nb.ic || nb.tag || 'S/IC'}</h4>
                                <span class="px-2 py-1 md:px-3 md:py-1 rounded-md ${nb.statusClass} text-[9px] md:text-[10px] font-black uppercase whitespace-nowrap border border-current opacity-80">${nb.statusText}</span>
                            </div>
                            <p class="text-[11px] text-on-surface-variant font-code-data mb-1.5 opacity-80">${nb.tag || 'S/TAG'} | ${nb.sn || 'S/SN'}</p>
                            <p class="text-sm font-bold text-on-surface-variant">${nb.model}</p>
                            <p class="text-xs text-outline">${nb.desc || 'Nenhuma observação'}</p>
                        </div>
                    </div>
                    <div class="flex gap-1 w-full sm:w-auto justify-end mt-2 sm:mt-0 pt-3 sm:pt-0 border-t border-outline-variant/30 sm:border-t-0">
                        <button onclick="app.openMoveModal(${index})" class="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors" title="Mover"><span class="material-symbols-outlined text-[20px]">move_up</span></button>
                        <button onclick="app.openNotebookForm(${index})" class="p-2 rounded-lg text-on-surface-variant hover:text-tertiary hover:bg-surface-container-high transition-colors" title="Editar"><span class="material-symbols-outlined text-[20px]">edit</span></button>
                        <button onclick="app.deleteNotebook(${index})" class="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors" title="Excluir"><span class="material-symbols-outlined text-[20px]">delete</span></button>
                    </div>
                </div>
            `);
        });

        list.insertAdjacentHTML('beforeend', `<button onclick="app.openNotebookForm(-1)" class="w-full py-3 md:py-4 mt-2 border-2 border-dashed border-outline-variant rounded-xl text-on-surface-variant font-bold hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2 text-sm md:text-base"><span class="material-symbols-outlined">add_circle</span> Adicionar Equipamento</button>`);
    },

    openNotebookForm(index) {
        app.editingNotebookIndex = index;
        const isEditing = index > -1;
        
        if(isEditing) {
            const locker = app.allLockers.find(l => l.id === app.currentLockerId);
            const nb = locker.equipamentos[index];
            document.getElementById('nb-ic').value = nb.ic || "";
            document.getElementById('nb-tag').value = nb.tag || "";
            document.getElementById('nb-sn').value = nb.sn || "";
            document.getElementById('nb-model').value = nb.model || "";
            document.getElementById('nb-desc').value = nb.desc || "";
            document.getElementById('nb-status').value = nb.statusText + "|" + nb.statusClass;
        } else {
            document.getElementById('nb-ic').value = "";
            document.getElementById('nb-tag').value = "";
            document.getElementById('nb-sn').value = "";
            document.getElementById('nb-model').value = "";
            document.getElementById('nb-desc').value = "";
            document.getElementById('nb-status').value = "Disponível|bg-tertiary-container/20 text-tertiary";
        }
        document.getElementById('notebook-form-modal').classList.remove('hidden');
    },

    async saveNotebookForm() {
        const ic = document.getElementById('nb-ic').value;
        const tag = document.getElementById('nb-tag').value;
        const sn = document.getElementById('nb-sn').value;
        const model = document.getElementById('nb-model').value;
        const desc = document.getElementById('nb-desc').value;
        const statusVal = document.getElementById('nb-status').value.split('|');

        if (!ic || !model) return app.showToast("Preencha IC/Ativo e Modelo.", "error");

        const locker = app.allLockers.find(l => l.id === app.currentLockerId);
        let equips = [...(locker.equipamentos || [])];

        const notebookData = {
            ic: ic, tag: tag, sn: sn, model: model, desc: desc,
            statusText: statusVal[0], statusClass: statusVal[1]
        };

        if (app.editingNotebookIndex > -1) {
            equips[app.editingNotebookIndex] = notebookData;
        } else {
            equips.push(notebookData);
        }

        try {
            await updateDoc(doc(db, "armarios", app.currentLockerId), { equipamentos: equips });
            app.showToast("Equipamento salvo!");
            app.closeNotebookForm();
        } catch(e) { console.error(e); app.showToast("Erro ao salvar equipamento", "error"); }
    },

    async deleteNotebook(index) {
        if(confirm("Tem certeza que deseja excluir este equipamento?")) {
            const locker = app.allLockers.find(l => l.id === app.currentLockerId);
            let equips = [...(locker.equipamentos || [])];
            equips.splice(index, 1);
            
            try {
                await updateDoc(doc(db, "armarios", app.currentLockerId), { equipamentos: equips });
                app.showToast("Equipamento excluído!");
            } catch(e) { console.error(e); app.showToast("Erro ao excluir", "error"); }
        }
    },

    openMoveModal(index) {
        app.movingNotebookIndex = index;
        const select = document.getElementById('move-dest-locker');
        select.innerHTML = '';
        
        let hasDestinations = false;
        app.allLockers.forEach(locker => {
            if(locker.id !== app.currentLockerId) {
                select.insertAdjacentHTML('beforeend', `<option value="${locker.id}">${locker.name} (${locker.zone})</option>`);
                hasDestinations = true;
            }
        });
        
        if(!hasDestinations) {
            app.showToast("Não há outros armários para transferir.", "error");
            return;
        }
        
        document.getElementById('move-modal').classList.remove('hidden');
    },

    closeMoveModal() {
        document.getElementById('move-modal').classList.add('hidden');
    },

    async confirmMove() {
        const destLockerId = document.getElementById('move-dest-locker').value;
        if(!destLockerId) return;
        
        const sourceLocker = app.allLockers.find(l => l.id === app.currentLockerId);
        const destLocker = app.allLockers.find(l => l.id === destLockerId);
        
        let sourceEquips = [...(sourceLocker.equipamentos || [])];
        let destEquips = [...(destLocker.equipamentos || [])];
        
        const notebookToMove = sourceEquips.splice(app.movingNotebookIndex, 1)[0];
        destEquips.push(notebookToMove);
        
        try {
            await updateDoc(doc(db, "armarios", app.currentLockerId), { equipamentos: sourceEquips });
            await updateDoc(doc(db, "armarios", destLockerId), { equipamentos: destEquips });
            
            app.showToast("Equipamento transferido com sucesso!");
            app.addLog(`🔄 Transferiu equipamento ${notebookToMove.tag} de ${sourceLocker.name} para ${destLocker.name}`);
            app.closeMoveModal();
        } catch(e) { console.error(e); app.showToast("Erro na transferência", "error"); }
    },

    /* =======================================
       TAREFAS E OUTRAS ROTINAS (Mantidas)
    ======================================= */
    listenToTasks() { 
        if (app.globalTasksUnsub) return;
        app.globalTasksUnsub = onSnapshot(collection(db, "tarefas"), snap => { 
            app.allTasks = snap.docs.map(d => ({id: d.id, ...d.data()})); 
            app.renderDashboard(); 
        }); 
    },

    renderDashboard() {
        try {
            const c = document.getElementById('my-tasks-list'); if(!c) return; c.innerHTML = '';
            
            const hoje = app.getTodayStr();
            const currentUid = auth.currentUser ? auth.currentUser.uid : null;

            let myTasks = app.allTasks.filter(t => { 
                const matchAssignee = t.assignees && t.assignees.some(a => app.getUserData(a).uid === currentUid);
                const notDone = t.status !== 'Concluída' && t.status !== 'Cancelada';
                return matchAssignee && notDone; 
            }).sort((a,b) => (b.ts_manual || 0) - (a.ts_manual || 0));

            if(myTasks.length === 0) {
                c.innerHTML = '<p class="p-4 text-center text-xs text-on-surface-variant/50 font-medium">Nenhuma pendência na sua fila hoje. Ótimo trabalho!</p>';
                return;
            }
            
            let htmlStr = '';
            myTasks.forEach(t => {
                const isAtrasada = t.dueDate && t.dueDate < hoje;
                const pLabel = t.priority || 'Média';
                
                let pTag = '';
                if(pLabel === 'Alta') pTag = `<span class="px-1.5 py-0.5 bg-error-container/20 text-error font-label-caps text-[9px] rounded border border-error/20">URGENTE</span>`;
                if(pLabel === 'Baixa') pTag = `<span class="px-1.5 py-0.5 bg-tertiary-container/20 text-tertiary font-label-caps text-[9px] rounded border border-tertiary/20">BAIXA</span>`;
                
                htmlStr += `
                    <li>
                        <label class="flex items-start gap-3 p-3 rounded-lg bg-surface hover:bg-surface-variant border ${isAtrasada ? 'border-error/50' : 'border-outline-variant/30'} cursor-pointer transition-colors group/task">
                            <input type="checkbox" onclick="event.preventDefault();" class="mt-0.5 w-4 h-4 rounded bg-surface border-outline-variant text-primary focus:ring-primary focus:ring-offset-surface-dim pointer-events-none">
                            <div class="flex-1">
                                <div class="flex items-center gap-2">
                                    <span class="font-body-sm text-body-sm text-on-surface group-hover/task:text-primary transition-colors">${t.title}</span>
                                    ${pTag}
                                </div>
                                ${t.dueDate ? `<span class="font-code-data text-[10px] ${isAtrasada ? 'text-error font-bold' : 'text-on-surface-variant'} block mt-1">Prazo: ${t.dueDate.split('-').reverse().join('/')}</span>` : ''}
                            </div>
                        </label>
                    </li>
                `;
            });
            c.innerHTML = htmlStr;
        } catch (e) { console.error("Erro na renderização dashboard", e); }
    },

    loadUsers() { 
        if (app.globalUsersUnsub) return;
        app.globalUsersUnsub = onSnapshot(collection(db, "usuarios"), (snap) => { 
            app.userMap = {};
            snap.docs.forEach(d => { app.userMap[d.id] = { uid: d.id, ...d.data() }; });
            
            const opSelect = document.getElementById('log-operator-filter');
            if(opSelect) {
                const currentOp = opSelect.value;
                opSelect.innerHTML = '<option value="Todos">Todos Operadores</option>' +
                    Object.values(app.userMap).map(u => `<option value="${u.nome}">${u.nome}</option>`).join('');
                opSelect.value = currentOp;
            }
            app.renderDashboard();
        }); 
    },
    
    signOut() { 
        const em = document.getElementById('login-email'); 
        const ps = document.getElementById('login-password'); 
        if(em) em.value = ''; 
        if(ps) ps.value = ''; 
        if (app.globalTasksUnsub) { app.globalTasksUnsub(); app.globalTasksUnsub = null; }
        if (app.globalNotifsUnsub) { app.globalNotifsUnsub(); app.globalNotifsUnsub = null; }
        if (app.globalUsersUnsub) { app.globalUsersUnsub(); app.globalUsersUnsub = null; }
        if (app.lockersUnsub) { app.lockersUnsub(); app.lockersUnsub = null; }
        signOut(auth); 
    },

    showToast(m, t='success') { 
        const c = document.getElementById('toast-container'); 
        const toast = document.createElement('div'); 
        toast.className = `toast ${t} shadow-xl border dark:border-white/5`; 
        toast.innerHTML = `<span class="material-symbols-outlined">${t==='success'?'check_circle':'error'}</span> <span class="font-bold text-sm">${m}</span>`; 
        c.appendChild(toast); 
        setTimeout(() => { 
            toast.style.animation = 'fadeOut 0.3s forwards'; 
            setTimeout(() => toast.remove(), 300); 
        }, 3000); 
    }
};

window.app = app;
app.init();
